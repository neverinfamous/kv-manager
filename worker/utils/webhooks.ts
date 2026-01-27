/**
 * Webhook Utilities for KV Manager
 *
 * Handles webhook dispatch for key events and bulk operations.
 */

import type { Env, Webhook, WebhookEventType, WebhookPayload } from "../types";
import { logInfo, logWarning, createErrorContext } from "./error-logger";

/**
 * Result of sending a webhook
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Generate current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
async function generateSignature(
  payload: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Send a webhook to a configured endpoint
 */
export async function sendWebhook(
  webhook: Webhook,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<WebhookResult> {
  const payload: WebhookPayload = {
    event,
    timestamp: nowISO(),
    data,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "KV-Manager-Webhook/1.0",
    "X-Webhook-Event": event,
  };

  // Add HMAC signature if secret is configured
  if (webhook.secret) {
    const signature = await generateSignature(body, webhook.secret);
    headers["X-Webhook-Signature"] = `sha256=${signature}`;
  }

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    } else {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        statusCode: response.status,
        error: errorText.slice(0, 200),
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all enabled webhooks for a specific event type
 */
export async function getWebhooksForEvent(
  db: import("@cloudflare/workers-types").D1Database,
  event: WebhookEventType,
): Promise<Webhook[]> {
  try {
    const result = await db
      .prepare("SELECT * FROM webhooks WHERE enabled = 1")
      .all<import("../types").WebhookDB>();

    // Filter webhooks that are subscribed to this event and convert to Webhook type
    const webhooks: Webhook[] = [];
    for (const webhookDB of result.results) {
      try {
        const events = JSON.parse(webhookDB.events) as string[];
        if (events.includes(event)) {
          const webhook: Webhook = {
            id: webhookDB.id,
            name: webhookDB.name,
            url: webhookDB.url,
            events: events as WebhookEventType[],
            enabled: webhookDB.enabled === 1,
            created_at: webhookDB.created_at,
          };
          if (webhookDB.secret) {
            webhook.secret = webhookDB.secret;
          }
          if (webhookDB.updated_at) {
            webhook.updated_at = webhookDB.updated_at;
          }
          webhooks.push(webhook);
        }
      } catch {
        // Skip invalid webhook
      }
    }
    return webhooks;
  } catch (error) {
    // Using logWarning instead of logError to avoid circular dependency
    logWarning(
      "Failed to get webhooks for event",
      createErrorContext("webhooks", "get_webhooks", {
        metadata: {
          event,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    return [];
  }
}

/**
 * Trigger webhooks for a specific event
 * This is a fire-and-forget operation - errors are logged but not propagated
 */
export async function triggerWebhooks(
  env: Env,
  event: WebhookEventType,
  data: Record<string, unknown>,
  isLocalDev: boolean,
): Promise<void> {
  if (isLocalDev) {
    logInfo(`Mock trigger: ${event}`, {
      module: "webhooks",
      operation: "trigger",
      metadata: { event },
    });
    return;
  }

  try {
    const webhooks = await getWebhooksForEvent(env.METADATA, event);

    if (webhooks.length === 0) {
      return;
    }

    logInfo(
      `Triggering ${String(webhooks.length)} webhook(s) for event: ${event}`,
      {
        module: "webhooks",
        operation: "trigger",
        metadata: { event, count: webhooks.length },
      },
    );

    // Send webhooks in parallel, don't await completion
    const promises = webhooks.map(async (webhook) => {
      try {
        const result = await sendWebhook(webhook, event, data);
        if (!result.success) {
          logWarning(
            "Webhook send failed",
            createErrorContext("webhooks", "send", {
              metadata: {
                webhookId: webhook.id,
                error: result.error ?? "unknown",
              },
            }),
          );
        }
      } catch (error) {
        logWarning(
          "Webhook send error",
          createErrorContext("webhooks", "send", {
            metadata: {
              webhookId: webhook.id,
              error: error instanceof Error ? error.message : String(error),
            },
          }),
        );
      }
    });

    // Fire and forget
    void Promise.all(promises);
  } catch (error) {
    logWarning(
      "Webhook trigger error",
      createErrorContext("webhooks", "trigger", {
        metadata: {
          event,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }
}

/**
 * Helper to create standard webhook data for key events
 */
export function createKeyWebhookData(
  namespaceId: string,
  keyName: string,
  userEmail: string | null,
  additionalData?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    namespace_id: namespaceId,
    key_name: keyName,
    user_email: userEmail,
    ...additionalData,
  };
}

/**
 * Helper to create standard webhook data for bulk operation events
 */
export function createBulkWebhookData(
  jobId: string,
  jobType: string,
  namespaceId: string,
  total: number,
  success: number,
  failed: number,
  userEmail: string | null,
): Record<string, unknown> {
  return {
    job_id: jobId,
    job_type: jobType,
    namespace_id: namespaceId,
    total,
    success,
    failed,
    user_email: userEmail,
  };
}

/**
 * Helper to create standard webhook data for job failure events
 */
export function createJobFailedWebhookData(
  jobId: string,
  jobType: string,
  error: string,
  namespaceId: string | null,
  userEmail: string | null,
): Record<string, unknown> {
  return {
    job_id: jobId,
    job_type: jobType,
    error,
    namespace_id: namespaceId,
    user_email: userEmail,
  };
}

/**
 * Helper to create standard webhook data for backup events
 */
export function createBackupWebhookData(
  namespaceId: string,
  backupPath: string,
  sizeBytes: number,
  userEmail: string | null,
): Record<string, unknown> {
  return {
    namespace_id: namespaceId,
    backup_path: backupPath,
    size_bytes: sizeBytes,
    user_email: userEmail,
  };
}

/**
 * Helper to create standard webhook data for restore events
 */
export function createRestoreWebhookData(
  namespaceId: string,
  backupPath: string,
  keysRestored: number,
  userEmail: string | null,
): Record<string, unknown> {
  return {
    namespace_id: namespaceId,
    backup_path: backupPath,
    keys_restored: keysRestored,
    user_email: userEmail,
  };
}
