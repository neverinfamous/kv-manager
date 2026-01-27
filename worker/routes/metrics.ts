/**
 * KV Metrics Route Handler
 *
 * Provides access to Cloudflare KV analytics via the GraphQL Analytics API.
 * Queries both kvOperationsAdaptiveGroups and kvStorageAdaptiveGroups for
 * comprehensive metrics including operation counts, latency percentiles,
 * and storage usage data.
 */

import type {
  Env,
  KVMetricsTimeRange,
  KVMetricsResponse,
  KVOperationDataPoint,
  KVStorageDataPoint,
  KVNamespaceMetricsSummary,
  KVAnalyticsResult,
  GraphQLAnalyticsResponse,
  KVNamespaceInfo,
} from "../types";
import {
  logInfo,
  logError,
  logWarning,
  createErrorContext,
} from "../utils/error-logger";

// ============================================================================
// CONSTANTS
// ============================================================================

const GRAPHQL_API = "https://api.cloudflare.com/client/v4/graphql";
const CF_API = "https://api.cloudflare.com/client/v4";
const METRICS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes per project standards

// ============================================================================
// CACHING
// ============================================================================

const metricsCache = new Map<
  string,
  { data: KVMetricsResponse; timestamp: number }
>();

function getCacheKey(
  accountId: string,
  namespaceId: string | null,
  timeRange: KVMetricsTimeRange,
): string {
  return `metrics:${accountId}:${namespaceId ?? "all"}:${timeRange}`;
}

function getFromCache(key: string): KVMetricsResponse | null {
  const cached = metricsCache.get(key);
  if (cached && Date.now() - cached.timestamp < METRICS_CACHE_TTL) {
    return cached.data;
  }
  metricsCache.delete(key);
  return null;
}

function setCache(key: string, data: KVMetricsResponse): void {
  metricsCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// DATE RANGE CALCULATION
// ============================================================================

function getDateRange(timeRange: KVMetricsTimeRange): {
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

// ============================================================================
// GRAPHQL QUERY BUILDER
// ============================================================================

/**
 * Build GraphQL query for KV analytics
 * Queries both kvOperationsAdaptiveGroups and kvStorageAdaptiveGroups
 */
function buildAnalyticsQuery(
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

async function fetchWithBackoff(
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
// NAMESPACE LOOKUP
// ============================================================================

async function fetchNamespaceNames(
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
    logWarning("Failed to fetch namespace names for metrics", {
      module: "metrics",
      operation: "fetch_names",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }

  return nameMap;
}

// ============================================================================
// GRAPHQL EXECUTION
// ============================================================================

async function executeGraphQLQuery(
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
      module: "metrics",
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
          module: "metrics",
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
          module: "metrics",
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
        module: "metrics",
        operation: "graphql_query",
      },
      isLocalDev,
    );
    return null;
  }
}

// ============================================================================
// METRICS PROCESSING
// ============================================================================

function processMetricsData(
  data: KVAnalyticsResult,
  timeRange: KVMetricsTimeRange,
  startDate: string,
  endDate: string,
  namespaceNames: Map<string, string>,
): KVMetricsResponse {
  const accounts = data.viewer.accounts;
  const account = accounts[0];

  if (!account) {
    return createEmptyMetrics(timeRange, startDate, endDate);
  }

  const operationsGroups = account.kvOperationsAdaptiveGroups ?? [];
  const storageGroups = account.kvStorageAdaptiveGroups ?? [];

  // Build operations time series
  const operationsSeries: KVOperationDataPoint[] = operationsGroups.map(
    (group) => ({
      date: group.dimensions?.date ?? "",
      namespaceId: group.dimensions?.namespaceId,
      actionType: group.dimensions?.actionType ?? "unknown",
      requests: group.sum?.requests ?? 0,
      latencyMsP50: group.quantiles?.latencyMsP50,
      latencyMsP90: group.quantiles?.latencyMsP90,
      latencyMsP99: group.quantiles?.latencyMsP99,
    }),
  );

  // Build storage time series
  const storageSeries: KVStorageDataPoint[] = storageGroups.map((group) => ({
    date: group.dimensions?.date ?? "",
    namespaceId: group.dimensions?.namespaceId ?? "",
    keyCount: group.max?.keyCount ?? 0,
    byteCount: group.max?.byteCount ?? 0,
  }));

  // Aggregate by namespace
  const byNamespaceMap = new Map<string, KVNamespaceMetricsSummary>();
  const latencySamples = new Map<
    string,
    { p50: number[]; p90: number[]; p99: number[] }
  >();

  for (const group of operationsGroups) {
    const nsId = group.dimensions?.namespaceId ?? "unknown";
    const actionType = group.dimensions?.actionType ?? "unknown";
    const requests = group.sum?.requests ?? 0;

    const existing = byNamespaceMap.get(nsId);

    if (existing) {
      existing.totalOperations += requests;
      existing.operationsByType[actionType] =
        (existing.operationsByType[actionType] ?? 0) + requests;
    } else {
      byNamespaceMap.set(nsId, {
        namespaceId: nsId,
        namespaceName: namespaceNames.get(nsId),
        totalOperations: requests,
        operationsByType: { [actionType]: requests },
      });
    }

    // Collect latency samples
    const samples = latencySamples.get(nsId) ?? {
      p50: [] as number[],
      p90: [] as number[],
      p99: [] as number[],
    };
    if (!latencySamples.has(nsId)) {
      latencySamples.set(nsId, samples);
    }
    if (group.quantiles?.latencyMsP50 !== undefined)
      samples.p50.push(group.quantiles.latencyMsP50);
    if (group.quantiles?.latencyMsP90 !== undefined)
      samples.p90.push(group.quantiles.latencyMsP90);
    if (group.quantiles?.latencyMsP99 !== undefined)
      samples.p99.push(group.quantiles.latencyMsP99);
  }

  // Calculate average latency per namespace
  for (const [nsId, samples] of latencySamples) {
    const nsMetrics = byNamespaceMap.get(nsId);
    if (nsMetrics) {
      if (samples.p50.length > 0)
        nsMetrics.p50LatencyMs =
          samples.p50.reduce((a, b) => a + b, 0) / samples.p50.length;
      if (samples.p90.length > 0)
        nsMetrics.p90LatencyMs =
          samples.p90.reduce((a, b) => a + b, 0) / samples.p90.length;
      if (samples.p99.length > 0)
        nsMetrics.p99LatencyMs =
          samples.p99.reduce((a, b) => a + b, 0) / samples.p99.length;
    }
  }

  // Get latest storage per namespace (first entry since ordered DESC)
  const latestStorageByNs = new Map<
    string,
    { keyCount: number; byteCount: number }
  >();
  for (const group of storageGroups) {
    const nsId = group.dimensions?.namespaceId ?? "";
    if (!latestStorageByNs.has(nsId)) {
      latestStorageByNs.set(nsId, {
        keyCount: group.max?.keyCount ?? 0,
        byteCount: group.max?.byteCount ?? 0,
      });
    }
  }

  for (const [nsId, storage] of latestStorageByNs) {
    const nsMetrics = byNamespaceMap.get(nsId);
    if (nsMetrics) {
      nsMetrics.currentKeyCount = storage.keyCount;
      nsMetrics.currentByteCount = storage.byteCount;
    }
  }

  const byNamespace = Array.from(byNamespaceMap.values());

  // Calculate totals
  let totalOperations = 0;
  const operationsByType: Record<string, number> = {};
  const allP50: number[] = [];
  const allP90: number[] = [];
  const allP99: number[] = [];
  let totalKeyCount = 0;
  let totalByteCount = 0;

  for (const ns of byNamespace) {
    totalOperations += ns.totalOperations;
    for (const [type, count] of Object.entries(ns.operationsByType)) {
      operationsByType[type] = (operationsByType[type] ?? 0) + count;
    }
    if (ns.p50LatencyMs !== undefined) allP50.push(ns.p50LatencyMs);
    if (ns.p90LatencyMs !== undefined) allP90.push(ns.p90LatencyMs);
    if (ns.p99LatencyMs !== undefined) allP99.push(ns.p99LatencyMs);
    if (ns.currentKeyCount !== undefined) totalKeyCount += ns.currentKeyCount;
    if (ns.currentByteCount !== undefined)
      totalByteCount += ns.currentByteCount;
  }

  const avgLatencyMs =
    allP50.length > 0 || allP90.length > 0 || allP99.length > 0
      ? {
          p50:
            allP50.length > 0
              ? allP50.reduce((a, b) => a + b, 0) / allP50.length
              : 0,
          p90:
            allP90.length > 0
              ? allP90.reduce((a, b) => a + b, 0) / allP90.length
              : 0,
          p99:
            allP99.length > 0
              ? allP99.reduce((a, b) => a + b, 0) / allP99.length
              : 0,
        }
      : undefined;

  return {
    summary: {
      timeRange,
      startDate,
      endDate,
      totalOperations,
      operationsByType,
      avgLatencyMs,
      totalKeyCount: totalKeyCount > 0 ? totalKeyCount : undefined,
      totalByteCount: totalByteCount > 0 ? totalByteCount : undefined,
      namespaceCount: byNamespace.length,
    },
    byNamespace,
    operationsSeries,
    storageSeries,
  };
}

function createEmptyMetrics(
  timeRange: KVMetricsTimeRange,
  startDate: string,
  endDate: string,
): KVMetricsResponse {
  return {
    summary: {
      timeRange,
      startDate,
      endDate,
      totalOperations: 0,
      operationsByType: {},
      namespaceCount: 0,
    },
    byNamespace: [],
    operationsSeries: [],
    storageSeries: [],
  };
}

// ============================================================================
// MOCK DATA FOR LOCAL DEVELOPMENT
// ============================================================================

function generateMockMetrics(timeRange: KVMetricsTimeRange): KVMetricsResponse {
  const { start, end } = getDateRange(timeRange);

  const mockNamespaces = [
    { id: "mock-ns-1", name: "production-cache" },
    { id: "mock-ns-2", name: "session-store" },
  ];

  const operationsSeries: KVOperationDataPoint[] = [];
  const storageSeries: KVStorageDataPoint[] = [];

  const days = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30;
  const endDate = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0] ?? "";

    for (const ns of mockNamespaces) {
      // Generate operations data
      for (const actionType of ["read", "write", "delete", "list"]) {
        operationsSeries.push({
          date: dateStr,
          namespaceId: ns.id,
          actionType,
          requests: Math.floor(Math.random() * 1000) + 50,
          latencyMsP50: Math.random() * 5 + 1,
          latencyMsP90: Math.random() * 15 + 5,
          latencyMsP99: Math.random() * 50 + 15,
        });
      }

      // Generate storage data
      const baseKeys = ns.id === "mock-ns-1" ? 5000 : 2000;
      const baseBytes =
        ns.id === "mock-ns-1" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      storageSeries.push({
        date: dateStr,
        namespaceId: ns.id,
        keyCount: baseKeys + Math.floor(Math.random() * 500) - i * 20,
        byteCount:
          baseBytes + Math.floor(Math.random() * 1024 * 1024) - i * 100000,
      });
    }
  }

  // Build namespace summaries
  const byNamespace: KVNamespaceMetricsSummary[] = mockNamespaces.map((ns) => ({
    namespaceId: ns.id,
    namespaceName: ns.name,
    totalOperations: Math.floor(Math.random() * 50000) + 5000,
    operationsByType: {
      read: Math.floor(Math.random() * 30000) + 3000,
      write: Math.floor(Math.random() * 10000) + 1000,
      delete: Math.floor(Math.random() * 2000) + 100,
      list: Math.floor(Math.random() * 5000) + 500,
    },
    p50LatencyMs: Math.random() * 3 + 1,
    p90LatencyMs: Math.random() * 10 + 5,
    p99LatencyMs: Math.random() * 30 + 15,
    currentKeyCount: ns.id === "mock-ns-1" ? 5234 : 2156,
    currentByteCount: ns.id === "mock-ns-1" ? 52428800 : 10485760,
  }));

  const totalOperations = byNamespace.reduce(
    (sum, ns) => sum + ns.totalOperations,
    0,
  );
  const operationsByType: Record<string, number> = {};
  for (const ns of byNamespace) {
    for (const [type, count] of Object.entries(ns.operationsByType)) {
      operationsByType[type] = (operationsByType[type] ?? 0) + count;
    }
  }

  return {
    summary: {
      timeRange,
      startDate: start,
      endDate: end,
      totalOperations,
      operationsByType,
      avgLatencyMs: {
        p50: 2.5,
        p90: 8.5,
        p99: 25.0,
      },
      totalKeyCount: 7390,
      totalByteCount: 62914560,
      namespaceCount: mockNamespaces.length,
    },
    byNamespace,
    operationsSeries,
    storageSeries,
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleMetricsRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string,
): Promise<Response> {
  const ctx = createErrorContext("metrics", "handle_request");

  // Create response headers helper
  function jsonHeaders(): Headers {
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/json");
    return headers;
  }

  // Only GET requests allowed
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders(),
    });
  }

  // Parse parameters
  const rangeParam = url.searchParams.get("range") ?? "7d";
  const namespaceId = url.searchParams.get("namespaceId") ?? undefined;
  const skipCache = url.searchParams.get("skipCache") === "true";

  // Validate time range
  const validRanges: KVMetricsTimeRange[] = ["24h", "7d", "30d"];
  if (!validRanges.includes(rangeParam as KVMetricsTimeRange)) {
    return new Response(
      JSON.stringify({
        error: "Invalid time range",
        message: "Time range must be one of: 24h, 7d, 30d",
      }),
      {
        status: 400,
        headers: jsonHeaders(),
      },
    );
  }

  const timeRange = rangeParam as KVMetricsTimeRange;

  logInfo(
    `Fetching KV metrics for range: ${timeRange}${namespaceId ? ` (filtered to ${namespaceId})` : ""}`,
    {
      module: "metrics",
      operation: "get_metrics",
      metadata: { timeRange, namespaceId },
    },
  );

  // Return mock data for local development
  if (isLocalDev || !env.ACCOUNT_ID || !env.API_KEY) {
    logInfo("Using mock metrics data for local development", {
      module: "metrics",
      operation: "get_metrics",
    });

    return new Response(
      JSON.stringify({
        result: generateMockMetrics(timeRange),
        success: true,
      }),
      {
        headers: jsonHeaders(),
      },
    );
  }

  // Check cache (unless skip requested)
  const cacheKey = getCacheKey(env.ACCOUNT_ID, namespaceId ?? null, timeRange);
  if (!skipCache) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      logInfo("Returning cached metrics", ctx);
      return new Response(
        JSON.stringify({
          result: cached,
          success: true,
        }),
        {
          headers: jsonHeaders(),
        },
      );
    }
  }

  const { start, end } = getDateRange(timeRange);
  const query = buildAnalyticsQuery(env.ACCOUNT_ID, start, end, namespaceId);

  // Fetch namespace names and analytics in parallel
  const cfHeaders = {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
  };

  const [analyticsData, namespaceNames] = await Promise.all([
    executeGraphQLQuery(env, query, isLocalDev),
    fetchNamespaceNames(env, cfHeaders),
  ]);

  if (!analyticsData) {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch metrics",
        message:
          "Unable to retrieve analytics data from Cloudflare. This may be a permissions issue with your API token.",
        success: false,
      }),
      {
        status: 500,
        headers: jsonHeaders(),
      },
    );
  }

  const metrics = processMetricsData(
    analyticsData,
    timeRange,
    start,
    end,
    namespaceNames,
  );

  // Cache the result
  setCache(cacheKey, metrics);

  logInfo("Successfully retrieved KV metrics", {
    module: "metrics",
    operation: "get_metrics",
    metadata: {
      namespaceCount: metrics.summary.namespaceCount,
      totalOperations: metrics.summary.totalOperations,
      hasStorageData: metrics.storageSeries.length > 0,
    },
  });

  return new Response(
    JSON.stringify({
      result: metrics,
      success: true,
    }),
    {
      headers: jsonHeaders(),
    },
  );
}
