/**
 * Shared Analytics Utilities
 *
 * Provides shared Cloudflare GraphQL Analytics API helpers used by both
 * the metrics route handler and the scheduled monitoring system.
 * Extracted from worker/routes/metrics.ts to avoid coupling.
 */

import type {
  Env,
  KVMetricsTimeRange,
  KVAnalyticsResult,
  KVNamespaceInfo,
  GraphQLAnalyticsResponse,
} from "../types";
import {
  logInfo,
  logError,
  logWarning,
} from "./error-logger";

// ============================================================================
// CONSTANTS
// ============================================================================

export const GRAPHQL_API = "https://api.cloudflare.com/client/v4/graphql";
export const CF_API = "https://api.cloudflare.com/client/v4";

// ============================================================================
// RATE LIMITING & FETCH
// ============================================================================

const RATE_LIMIT = {
  INITIAL_BACKOFF: 2000,
  MAX_BACKOFF: 8000,
  BACKOFF_MULTIPLIER: 2,
  RETRY_CODES: [429, 503, 504],
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  let backoff = RATE_LIMIT.INITIAL_BACKOFF;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!RATE_LIMIT.RETRY_CODES.includes(response.status)) {
        return response;
      }

      if (attempt < maxRetries) {
        await sleep(backoff);
        backoff = Math.min(
          backoff * RATE_LIMIT.BACKOFF_MULTIPLIER,
          RATE_LIMIT.MAX_BACKOFF,
        );
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await sleep(backoff);
        backoff = Math.min(
          backoff * RATE_LIMIT.BACKOFF_MULTIPLIER,
          RATE_LIMIT.MAX_BACKOFF,
        );
      }
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}

// ============================================================================
// DATE RANGE CALCULATION
// ============================================================================

export function getDateRange(timeRange: KVMetricsTimeRange): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date();

  switch (timeRange) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: start.toISOString().split("T")[0] ?? "",
    end: end.toISOString().split("T")[0] ?? "",
  };
}

/**
 * Get today's date range for monitoring queries (single-day window).
 */
export function getTodayRange(): { start: string; end: string } {
  const today = new Date().toISOString().split("T")[0] ?? "";
  return { start: today, end: today };
}

// ============================================================================
// GRAPHQL QUERY BUILDER
// ============================================================================

/**
 * Build GraphQL query for KV analytics.
 * Queries both kvOperationsAdaptiveGroups and kvStorageAdaptiveGroups.
 */
export function buildAnalyticsQuery(
  accountId: string,
  start: string,
  end: string,
  namespaceId?: string,
): string {
  const nsFilter = namespaceId ? `, namespaceId: "${namespaceId}"` : "";

  return `
        query KVMetrics {
            viewer {
                accounts(filter: { accountTag: "${accountId}" }) {
                    kvOperationsAdaptiveGroups(
                        limit: 10000
                        filter: { date_geq: "${start}", date_leq: "${end}"${nsFilter} }
                        orderBy: [date_DESC]
                    ) {
                        sum {
                            requests
                        }
                        dimensions {
                            date
                            actionType
                            namespaceId
                        }
                        quantiles {
                            latencyMsP50
                            latencyMsP90
                            latencyMsP99
                        }
                    }
                    kvStorageAdaptiveGroups(
                        limit: 10000
                        filter: { date_geq: "${start}", date_leq: "${end}"${nsFilter} }
                        orderBy: [date_DESC]
                    ) {
                        max {
                            keyCount
                            byteCount
                        }
                        dimensions {
                            date
                            namespaceId
                        }
                    }
                }
            }
        }
    `;
}

// ============================================================================
// GRAPHQL EXECUTION
// ============================================================================

export async function executeGraphQLQuery(
  env: Env,
  query: string,
  isLocalDev: boolean,
): Promise<KVAnalyticsResult | null> {
  const cfHeaders = {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    logInfo("Executing GraphQL analytics query", {
      module: "analytics",
      operation: "graphql_query",
    });

    const response = await fetchWithBackoff(GRAPHQL_API, {
      method: "POST",
      headers: cfHeaders,
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logError(
        env,
        `GraphQL API error: ${errorText}`,
        {
          module: "analytics",
          operation: "graphql_query",
          metadata: { status: response.status },
        },
        isLocalDev,
      );
      return null;
    }

    const result: GraphQLAnalyticsResponse<KVAnalyticsResult> =
      await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message).join(", ");
      await logError(
        env,
        `GraphQL errors: ${errorMessages}`,
        {
          module: "analytics",
          operation: "graphql_query",
          metadata: { errors: result.errors },
        },
        isLocalDev,
      );
      return null;
    }

    return result.data ?? null;
  } catch (err) {
    await logError(
      env,
      err instanceof Error ? err : String(err),
      {
        module: "analytics",
        operation: "graphql_query",
      },
      isLocalDev,
    );
    return null;
  }
}

// ============================================================================
// NAMESPACE LOOKUP
// ============================================================================

export async function fetchNamespaceNames(
  env: Env,
  cfHeaders: Record<string, string>,
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();

  try {
    const response = await fetch(
      `${CF_API}/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces`,
      { headers: cfHeaders },
    );

    if (response.ok) {
      const data: { result?: KVNamespaceInfo[] } = await response.json();
      if (data.result) {
        for (const ns of data.result) {
          nameMap.set(ns.id, ns.title);
        }
      }
    }
  } catch (err) {
    logWarning("Failed to fetch namespace names for analytics", {
      module: "analytics",
      operation: "fetch_names",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }

  return nameMap;
}
