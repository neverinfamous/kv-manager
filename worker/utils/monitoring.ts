/**
 * Scheduled Monitoring Logic
 *
 * Called by the scheduled() handler (cron trigger) to poll KV analytics,
 * compare against per-namespace thresholds, and fire webhook alerts
 * when thresholds are breached or when metrics recover.
 *
 * Uses daily date-granularity queries (Cloudflare GraphQL API limitation).
 * Cron runs hourly to detect breaches early in the current day's accumulation.
 */

import type {
  Env,
  MonitoringThresholdDB,
  MonitoringStateDB,
  WebhookEventType,
} from "../types";
import {
  logInfo,
  logWarning,
  logError,
  createErrorContext,
} from "./error-logger";
import {
  buildAnalyticsQuery,
  executeGraphQLQuery,
  getTodayRange,
} from "./analytics";
import { triggerWebhooks } from "./webhooks";
import { auditLog } from "./helpers";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Number of consecutive API failures before firing analytics.unavailable */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/** Minimum seconds between duplicate alerts for the same breach */
const ALERT_COOLDOWN_SECONDS = 3600; // 1 hour

/** Maximum namespaces to query in parallel */
const MAX_PARALLEL_QUERIES = 5;

// ============================================================================
// TYPES
// ============================================================================

interface NamespaceMetricSnapshot {
  namespaceId: string;
  totalOperations: number;
  currentByteCount: number;
  p99LatencyMs: number | null;
}

interface ThresholdEvaluation {
  event: WebhookEventType;
  breached: boolean;
  currentValue: number | null;
  thresholdValue: number;
  namespaceId: string;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process all monitoring thresholds. Called from the scheduled() handler.
 *
 * 1. Query enabled thresholds from D1
 * 2. Fetch analytics per-namespace (batched)
 * 3. Evaluate thresholds and track breach state
 * 4. Fire webhook alerts (with cooldown) or recovery events
 */
export async function processMonitoring(env: Env): Promise<void> {
  const ctx = createErrorContext("monitoring", "process");

  try {
    // Guard: need credentials for CF API
    if (!env.ACCOUNT_ID || !env.API_KEY) {
      logWarning("Monitoring skipped: missing ACCOUNT_ID or API_KEY", ctx);
      return;
    }

    // 1. Fetch enabled thresholds
    const thresholds = await getEnabledThresholds(env);
    if (thresholds.length === 0) {
      logInfo("No enabled monitoring thresholds configured", ctx);
      return;
    }

    logInfo(`Processing ${String(thresholds.length)} monitoring threshold(s)`, {
      ...ctx,
      metadata: { count: thresholds.length },
    });

    // 2. Fetch analytics per-namespace in batches
    const { start, end } = getTodayRange();
    const snapshots = new Map<string, NamespaceMetricSnapshot>();
    let apiFailure = false;

    const namespaceIds = thresholds.map((t) => t.namespace_id);
    const batches = chunkArray(namespaceIds, MAX_PARALLEL_QUERIES);

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async (nsId) => {
          const query = buildAnalyticsQuery(
            env.ACCOUNT_ID ?? "",
            start,
            end,
            nsId,
          );
          const data = await executeGraphQLQuery(env, query, false);
          return { nsId, data };
        }),
      );

      for (const { nsId, data } of results) {
        if (!data) {
          apiFailure = true;
          continue;
        }

        const account = data.viewer.accounts[0];
        if (!account) continue;

        const opsGroups = account.kvOperationsAdaptiveGroups ?? [];
        const storageGroups = account.kvStorageAdaptiveGroups ?? [];

        // Aggregate operations
        let totalOps = 0;
        const p99Samples: number[] = [];
        for (const group of opsGroups) {
          totalOps += group.sum?.requests ?? 0;
          if (group.quantiles?.latencyMsP99 !== undefined) {
            p99Samples.push(group.quantiles.latencyMsP99);
          }
        }

        // Latest storage
        let currentBytes = 0;
        if (storageGroups.length > 0) {
          const latest = storageGroups[0];
          currentBytes = latest?.max?.byteCount ?? 0;
        }

        // Average p99 latency across all action types
        const avgP99 =
          p99Samples.length > 0
            ? p99Samples.reduce((a, b) => a + b, 0) / p99Samples.length
            : null;

        snapshots.set(nsId, {
          namespaceId: nsId,
          totalOperations: totalOps,
          currentByteCount: currentBytes,
          p99LatencyMs: avgP99,
        });
      }
    }

    // 3. Handle API failures
    if (apiFailure) {
      await handleApiFailure(env);
    } else {
      // Reset failure counter on success
      await resetApiFailureState(env);
    }

    // 4. Evaluate thresholds per-namespace
    for (const threshold of thresholds) {
      const snapshot = snapshots.get(threshold.namespace_id);
      if (!snapshot) continue;

      const evaluations = evaluateThresholds(threshold, snapshot);
      await processEvaluations(env, threshold.namespace_id, evaluations);
    }

    logInfo("Monitoring cycle complete", {
      ...ctx,
      metadata: {
        thresholdsChecked: thresholds.length,
        snapshotsCollected: snapshots.size,
        apiFailure,
      },
    });
  } catch (err) {
    await logError(
      env,
      err instanceof Error ? err : String(err),
      ctx,
      false,
    );
  }
}

// ============================================================================
// DATABASE QUERIES
// ============================================================================

async function getEnabledThresholds(
  env: Env,
): Promise<MonitoringThresholdDB[]> {
  try {
    const result = await env.METADATA.prepare(
      "SELECT * FROM monitoring_thresholds WHERE enabled = 1",
    ).all<MonitoringThresholdDB>();

    return result.results;
  } catch (err) {
    logWarning("Failed to query monitoring thresholds", {
      module: "monitoring",
      operation: "get_thresholds",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return [];
  }
}

async function getMonitoringState(
  env: Env,
  namespaceId: string,
  eventType: string,
): Promise<MonitoringStateDB | null> {
  try {
    return await env.METADATA.prepare(
      "SELECT * FROM monitoring_state WHERE namespace_id = ? AND event_type = ?",
    )
      .bind(namespaceId, eventType)
      .first<MonitoringStateDB>();
  } catch {
    return null;
  }
}

async function upsertMonitoringState(
  env: Env,
  namespaceId: string,
  eventType: string,
  updates: {
    consecutiveFailures?: number;
    isBreached?: boolean;
    lastAlertAt?: string | null | undefined;
  },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await env.METADATA.prepare(
      `INSERT INTO monitoring_state (namespace_id, event_type, consecutive_failures, is_breached, last_alert_at, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (namespace_id, event_type) DO UPDATE SET
         consecutive_failures = COALESCE(?, consecutive_failures),
         is_breached = COALESCE(?, is_breached),
         last_alert_at = COALESCE(?, last_alert_at),
         last_checked_at = ?`,
    )
      .bind(
        namespaceId,
        eventType,
        updates.consecutiveFailures ?? 0,
        updates.isBreached ? 1 : 0,
        updates.lastAlertAt ?? null,
        now,
        updates.consecutiveFailures ?? null,
        updates.isBreached !== undefined ? (updates.isBreached ? 1 : 0) : null,
        updates.lastAlertAt ?? null,
        now,
      )
      .run();
  } catch (err) {
    logWarning("Failed to upsert monitoring state", {
      module: "monitoring",
      operation: "upsert_state",
      metadata: {
        namespaceId,
        eventType,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ============================================================================
// THRESHOLD EVALUATION
// ============================================================================

function evaluateThresholds(
  threshold: MonitoringThresholdDB,
  snapshot: NamespaceMetricSnapshot,
): ThresholdEvaluation[] {
  const evaluations: ThresholdEvaluation[] = [];

  if (threshold.storage_bytes_threshold !== null) {
    evaluations.push({
      event: "threshold.storage_usage",
      breached: snapshot.currentByteCount > threshold.storage_bytes_threshold,
      currentValue: snapshot.currentByteCount,
      thresholdValue: threshold.storage_bytes_threshold,
      namespaceId: snapshot.namespaceId,
    });
  }

  if (threshold.operation_rate_threshold !== null) {
    evaluations.push({
      event: "threshold.operation_rate",
      breached: snapshot.totalOperations > threshold.operation_rate_threshold,
      currentValue: snapshot.totalOperations,
      thresholdValue: threshold.operation_rate_threshold,
      namespaceId: snapshot.namespaceId,
    });
  }

  if (threshold.latency_p99_threshold_ms !== null) {
    evaluations.push({
      event: "threshold.operation_latency",
      breached:
        snapshot.p99LatencyMs !== null &&
        snapshot.p99LatencyMs > threshold.latency_p99_threshold_ms,
      currentValue: snapshot.p99LatencyMs,
      thresholdValue: threshold.latency_p99_threshold_ms,
      namespaceId: snapshot.namespaceId,
    });
  }

  return evaluations;
}

async function processEvaluations(
  env: Env,
  namespaceId: string,
  evaluations: ThresholdEvaluation[],
): Promise<void> {
  for (const evaluation of evaluations) {
    const state = await getMonitoringState(env, namespaceId, evaluation.event);
    const wasBreached = state?.is_breached === 1;
    const now = new Date();

    if (evaluation.breached) {
      // Check cooldown: don't re-alert if we alerted recently
      if (wasBreached && state?.last_alert_at) {
        const lastAlert = new Date(state.last_alert_at);
        const elapsed = (now.getTime() - lastAlert.getTime()) / 1000;
        if (elapsed < ALERT_COOLDOWN_SECONDS) {
          // Still in cooldown, just update checked_at
          await upsertMonitoringState(env, namespaceId, evaluation.event, {
            isBreached: true,
          });
          continue;
        }
      }

      // Fire breach alert
      await triggerWebhooks(
        env,
        evaluation.event,
        {
          namespace_id: namespaceId,
          current_value: evaluation.currentValue,
          threshold_value: evaluation.thresholdValue,
          event_type: evaluation.event,
        },
        false, // cron triggers never run locally
      );

      await upsertMonitoringState(env, namespaceId, evaluation.event, {
        isBreached: true,
        lastAlertAt: now.toISOString(),
      });

      logInfo(`Threshold breached: ${evaluation.event}`, {
        module: "monitoring",
        operation: "threshold_breach",
        metadata: {
          namespaceId,
          event: evaluation.event,
          current: evaluation.currentValue,
          threshold: evaluation.thresholdValue,
        },
      });

      await auditLog(
        env.METADATA,
        {
          namespace_id: namespaceId,
          operation: "threshold_breached",
          user_email: "system",
          details: JSON.stringify({
            event: evaluation.event,
            current: evaluation.currentValue,
            threshold: evaluation.thresholdValue,
          })
        }
      );
    } else if (wasBreached) {
      // Recovery: was breached but now below threshold
      await triggerWebhooks(
        env,
        "threshold.resolved",
        {
          namespace_id: namespaceId,
          current_value: evaluation.currentValue,
          threshold_value: evaluation.thresholdValue,
          resolved_event: evaluation.event,
        },
        false,
      );

      await upsertMonitoringState(env, namespaceId, evaluation.event, {
        isBreached: false,
        lastAlertAt: now.toISOString(),
      });

      logInfo(`Threshold resolved: ${evaluation.event}`, {
        module: "monitoring",
        operation: "threshold_resolved",
        metadata: {
          namespaceId,
          event: evaluation.event,
          current: evaluation.currentValue,
          threshold: evaluation.thresholdValue,
        },
      });

      await auditLog(
        env.METADATA,
        {
          namespace_id: namespaceId,
          operation: "threshold_resolved",
          user_email: "system",
          details: JSON.stringify({
            resolved_event: evaluation.event,
            current: evaluation.currentValue,
            threshold: evaluation.thresholdValue,
          })
        }
      );
    } else {
      // Not breached and wasn't breached — update checked_at only
      await upsertMonitoringState(env, namespaceId, evaluation.event, {
        isBreached: false,
      });
    }
  }
}

// ============================================================================
// API FAILURE TRACKING
// ============================================================================

/**
 * Track consecutive API failures. After CONSECUTIVE_FAILURE_THRESHOLD,
 * fire an analytics.unavailable webhook.
 */
async function handleApiFailure(env: Env): Promise<void> {
  const globalNs = "__global__";
  const eventType = "analytics.unavailable";

  const state = await getMonitoringState(env, globalNs, eventType);
  const failures = (state?.consecutive_failures ?? 0) + 1;

  if (failures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    // Check cooldown
    const now = new Date();
    let shouldAlert = true;

    if (state?.last_alert_at) {
      const lastAlert = new Date(state.last_alert_at);
      const elapsed = (now.getTime() - lastAlert.getTime()) / 1000;
      if (elapsed < ALERT_COOLDOWN_SECONDS) {
        shouldAlert = false;
      }
    }

    if (shouldAlert) {
      await triggerWebhooks(
        env,
        "analytics.unavailable",
        {
          consecutive_failures: failures,
          message: `Cloudflare GraphQL Analytics API has been unavailable for ${String(failures)} consecutive monitoring cycles`,
        },
        false,
      );
    }

    await upsertMonitoringState(env, globalNs, eventType, {
      consecutiveFailures: failures,
      isBreached: true,
      lastAlertAt: shouldAlert ? now.toISOString() : undefined,
    });
  } else {
    await upsertMonitoringState(env, globalNs, eventType, {
      consecutiveFailures: failures,
      isBreached: false,
    });
  }

  logWarning(`Analytics API failure (${String(failures)} consecutive)`, {
    module: "monitoring",
    operation: "api_failure",
    metadata: { failures },
  });
}

async function resetApiFailureState(env: Env): Promise<void> {
  const globalNs = "__global__";
  const eventType = "analytics.unavailable";

  const state = await getMonitoringState(env, globalNs, eventType);
  if (state && (state.consecutive_failures > 0 || state.is_breached === 1)) {
    const wasBreached = state.is_breached === 1;

    await upsertMonitoringState(env, globalNs, eventType, {
      consecutiveFailures: 0,
      isBreached: false,
    });

    // Fire recovery if it was previously breached
    if (wasBreached) {
      await triggerWebhooks(
        env,
        "threshold.resolved",
        {
          resolved_event: "analytics.unavailable",
          message: "Cloudflare GraphQL Analytics API is available again",
        },
        false,
      );
    }
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
