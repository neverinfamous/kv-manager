/**
 * KV Manager Health API Service
 *
 * Frontend service layer for the Health Dashboard.
 * Implements caching per project standards (2 min TTL for metrics).
 */

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// ============================================================================
// TYPES
// ============================================================================

export interface LowMetadataNamespace {
  namespaceId: string;
  namespaceTitle: string;
  estimatedKeyCount: number;
  trackedKeyCount: number;
  coveragePercent: number;
}

export interface RecentFailedJob {
  jobId: string;
  namespaceId: string;
  operationType: string;
  errorCount: number;
  completedAt: string;
}

export interface HealthSummary {
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
// CACHING
// ============================================================================

const HEALTH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (metrics tier)

interface HealthCacheEntry {
  data: HealthSummary;
  timestamp: number;
}

let healthCache: HealthCacheEntry | null = null;

function isCacheValid(): boolean {
  if (!healthCache) return false;
  return Date.now() - healthCache.timestamp < HEALTH_CACHE_TTL;
}

// ============================================================================
// API
// ============================================================================

/**
 * Fetch health summary from the API
 * @param skipCache - If true, bypass the cache and fetch fresh data
 */
export async function fetchHealthSummary(
  skipCache = false,
): Promise<HealthSummary> {
  // Return cached data if valid and not skipping cache
  if (!skipCache && isCacheValid() && healthCache) {
    return healthCache.data;
  }

  const response = await fetch(`${WORKER_API}/api/health`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch health summary: ${response.status} ${response.statusText}`,
    );
  }

  const data: HealthSummary = await response.json();

  // Update cache
  healthCache = {
    data,
    timestamp: Date.now(),
  };

  return data;
}

/**
 * Invalidate the health cache
 */
export function invalidateHealthCache(): void {
  healthCache = null;
}

// ============================================================================
// HEALTH SCORE CALCULATION (KV-SPECIFIC)
// ============================================================================

/**
 * Calculate health score based on KV-specific criteria
 * Returns score (0-100), label, and color class
 */
export function calculateHealthScore(health: HealthSummary): {
  score: number;
  label: string;
  color: string;
} {
  let score = 100;

  // Penalty: Any failed jobs in last 24h (-25)
  if (health.recentJobs.failedLast24h > 0) {
    score -= 25;
  }

  // Penalty: Low backup coverage (-10 if <50% namespaces have backups)
  if (health.namespaces.total > 0) {
    const backupCoveragePercent =
      (health.storage.backupCoverage / health.namespaces.total) * 100;
    if (backupCoveragePercent < 50) {
      score -= 10;
    }
  }

  // Penalty: Low color coverage (-10 if <50% namespaces have colors)
  if (health.namespaces.total > 0) {
    const colorCoveragePercent =
      (health.namespaces.withColors / health.namespaces.total) * 100;
    if (colorCoveragePercent < 50) {
      score -= 10;
    }
  }

  // Penalty: Orphaned metadata records (-15 if >10% are orphaned)
  if (health.keys.totalTracked > 0) {
    const orphanedPercent =
      (health.keys.orphanedMetadata / health.keys.totalTracked) * 100;
    if (orphanedPercent > 10) {
      score -= 15;
    }
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine label and color
  let label: string;
  let color: string;

  if (score >= 90) {
    label = "Healthy";
    color = "text-green-500";
  } else if (score >= 70) {
    label = "Good";
    color = "text-blue-500";
  } else if (score >= 50) {
    label = "Fair";
    color = "text-yellow-500";
  } else {
    label = "Needs Attention";
    color = "text-red-500";
  }

  return { score, label, color };
}
