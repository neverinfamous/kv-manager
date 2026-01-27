/**
 * KV Manager Health Dashboard Route Handler
 *
 * Provides a health summary API for the KV Manager dashboard,
 * including namespace health, job history, and backup coverage.
 */

import type { Env, CorsHeaders } from "../types";
import { logInfo, logWarning, createErrorContext } from "../utils/error-logger";

// ============================================================================
// TYPES
// ============================================================================

interface LowMetadataNamespace {
  namespaceId: string;
  namespaceTitle: string;
  estimatedKeyCount: number;
  trackedKeyCount: number;
  coveragePercent: number;
}

interface RecentFailedJob {
  jobId: string;
  namespaceId: string;
  operationType: string;
  errorCount: number;
  completedAt: string;
}

interface HealthSummary {
  namespaces: {
    total: number;
    withColors: number;
    withMetadata: number;
  };
  keys: {
    totalTracked: number;
    orphanedMetadata: number;
  };
  storage: {
    backupCoverage: number;
    totalBackups: number;
    lastBackupDate: string | null;
  };
  recentJobs: {
    last24h: number;
    last7d: number;
    failedLast24h: number;
  };
  lowMetadataNamespaces: LowMetadataNamespace[];
  recentFailedJobs: RecentFailedJob[];
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_HEALTH: HealthSummary = {
  namespaces: {
    total: 5,
    withColors: 3,
    withMetadata: 4,
  },
  keys: {
    totalTracked: 2847,
    orphanedMetadata: 12,
  },
  storage: {
    backupCoverage: 3,
    totalBackups: 18,
    lastBackupDate: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  recentJobs: {
    last24h: 15,
    last7d: 67,
    failedLast24h: 1,
  },
  lowMetadataNamespaces: [
    {
      namespaceId: "ns-1",
      namespaceTitle: "legacy-cache",
      estimatedKeyCount: 500,
      trackedKeyCount: 120,
      coveragePercent: 24,
    },
  ],
  recentFailedJobs: [
    {
      jobId: "job-123",
      namespaceId: "ns-2",
      operationType: "bulk_delete",
      errorCount: 3,
      completedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function jsonResponse(data: unknown, corsHeaders: CorsHeaders): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(
  message: string,
  corsHeaders: CorsHeaders,
  status = 500,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleHealthRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
  _userEmail: string | null,
): Promise<Response> {
  const method = request.method;
  const path = url.pathname;

  // GET /api/health - Get health summary
  if (method === "GET" && path === "/api/health") {
    return getHealthSummary(env, corsHeaders, isLocalDev);
  }

  return errorResponse("Not Found", corsHeaders, 404);
}

// ============================================================================
// HEALTH SUMMARY
// ============================================================================

async function getHealthSummary(
  env: Env,
  corsHeaders: CorsHeaders,
  isLocalDev: boolean,
): Promise<Response> {
  const ctx = createErrorContext("health", "get_summary");

  if (isLocalDev) {
    logInfo("Returning mock health data for local dev", ctx);
    return jsonResponse(MOCK_HEALTH, corsHeaders);
  }

  try {
    // Parallelized D1 queries for performance (following do-manager pattern)
    const [
      namespaceCountsResult,
      keyMetadataResult,
      backupResult,
      jobsResult,
      lowMetadataResult,
      failedJobsResult,
    ] = await Promise.all([
      // Query 1: Namespace counts (total, with colors, with metadata)
      safeQuery(
        env,
        `
        SELECT
          (SELECT COUNT(*) FROM namespaces) as total,
          (SELECT COUNT(*) FROM namespace_colors) as withColors,
          (SELECT COUNT(DISTINCT namespace_id) FROM key_metadata) as withMetadata
      `,
      ),

      // Query 2: Key metadata stats
      safeQuery(
        env,
        `
        SELECT
          COUNT(*) as totalTracked
        FROM key_metadata
      `,
      ),

      // Query 3: R2 backup coverage (count distinct namespaces with backups from audit log)
      safeQuery(
        env,
        `
        SELECT
          COUNT(DISTINCT namespace_id) as backupCoverage,
          COUNT(*) as totalBackups,
          MAX(timestamp) as lastBackupDate
        FROM audit_log
        WHERE operation = 'r2_backup'
      `,
      ),

      // Query 4: Job history counts
      safeQuery(
        env,
        `
        SELECT
          SUM(CASE WHEN datetime(started_at) > datetime('now', '-1 day') THEN 1 ELSE 0 END) as last24h,
          SUM(CASE WHEN datetime(started_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last7d,
          SUM(CASE WHEN datetime(started_at) > datetime('now', '-1 day') AND status = 'failed' THEN 1 ELSE 0 END) as failedLast24h
        FROM bulk_jobs
      `,
      ),

      // Query 5: Low metadata coverage namespaces (limit 10)
      safeQueryAll(
        env,
        `
        SELECT
          n.namespace_id as namespaceId,
          n.namespace_title as namespaceTitle,
          COALESCE(km.tracked_count, 0) as trackedKeyCount
        FROM namespaces n
        LEFT JOIN (
          SELECT namespace_id, COUNT(*) as tracked_count
          FROM key_metadata
          GROUP BY namespace_id
        ) km ON n.namespace_id = km.namespace_id
        ORDER BY COALESCE(km.tracked_count, 0) ASC
        LIMIT 10
      `,
      ),

      // Query 6: Recent failed jobs (limit 10)
      safeQueryAll(
        env,
        `
        SELECT
          job_id as jobId,
          namespace_id as namespaceId,
          operation_type as operationType,
          error_count as errorCount,
          completed_at as completedAt
        FROM bulk_jobs
        WHERE status = 'failed'
          AND datetime(completed_at) > datetime('now', '-7 days')
        ORDER BY completed_at DESC
        LIMIT 10
      `,
      ),
    ]);

    // Build health summary with graceful defaults for any failed queries
    const health: HealthSummary = {
      namespaces: {
        total: Number(namespaceCountsResult?.["total"] ?? 0),
        withColors: Number(namespaceCountsResult?.["withColors"] ?? 0),
        withMetadata: Number(namespaceCountsResult?.["withMetadata"] ?? 0),
      },
      keys: {
        totalTracked: Number(keyMetadataResult?.["totalTracked"] ?? 0),
        orphanedMetadata: 0, // Would require cross-referencing with KV API - defer for now
      },
      storage: {
        backupCoverage: Number(backupResult?.["backupCoverage"] ?? 0),
        totalBackups: Number(backupResult?.["totalBackups"] ?? 0),
        lastBackupDate: backupResult?.["lastBackupDate"]
          ? String(backupResult["lastBackupDate"])
          : null,
      },
      recentJobs: {
        last24h: Number(jobsResult?.["last24h"] ?? 0),
        last7d: Number(jobsResult?.["last7d"] ?? 0),
        failedLast24h: Number(jobsResult?.["failedLast24h"] ?? 0),
      },
      lowMetadataNamespaces: (lowMetadataResult ?? []).map(
        (row: Record<string, unknown>) => ({
          namespaceId: String(row["namespaceId"] ?? ""),
          namespaceTitle: String(row["namespaceTitle"] ?? ""),
          estimatedKeyCount: 0, // Would need KV API call per namespace
          trackedKeyCount: Number(row["trackedKeyCount"] ?? 0),
          coveragePercent: 0, // Can't calculate without estimated key count
        }),
      ),
      recentFailedJobs: (failedJobsResult ?? []).map(
        (row: Record<string, unknown>) => ({
          jobId: String(row["jobId"] ?? ""),
          namespaceId: String(row["namespaceId"] ?? ""),
          operationType: String(row["operationType"] ?? ""),
          errorCount: Number(row["errorCount"] ?? 0),
          completedAt: String(row["completedAt"] ?? ""),
        }),
      ),
    };

    logInfo("Health summary fetched successfully", ctx);
    return jsonResponse(health, corsHeaders);
  } catch (error) {
    logWarning(
      `Failed to get health summary: ${error instanceof Error ? error.message : String(error)}`,
      {
        ...ctx,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    return errorResponse("Failed to get health summary", corsHeaders, 500);
  }
}

// ============================================================================
// SAFE QUERY HELPERS (Graceful Degradation)
// ============================================================================

/**
 * Execute a D1 query with graceful error handling.
 * Returns null if the query fails (e.g., table doesn't exist).
 */
async function safeQuery(
  env: Env,
  query: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await env.METADATA.prepare(query).first();
    return result as Record<string, unknown> | null;
  } catch (error) {
    logWarning(
      `Safe query failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        module: "health",
        operation: "safe_query",
        metadata: { query: query.substring(0, 100) },
      },
    );
    return null;
  }
}

/**
 * Execute a D1 query returning multiple rows with graceful error handling.
 * Returns empty array if the query fails.
 */
async function safeQueryAll(
  env: Env,
  query: string,
): Promise<Record<string, unknown>[]> {
  try {
    const result = await env.METADATA.prepare(query).all();
    return result.results as Record<string, unknown>[];
  } catch (error) {
    logWarning(
      `Safe query all failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        module: "health",
        operation: "safe_query_all",
        metadata: { query: query.substring(0, 100) },
      },
    );
    return [];
  }
}
