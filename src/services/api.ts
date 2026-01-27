import { apiLogger } from "../lib/logger";

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// ============================================================================
// CACHING & RATE LIMITING INFRASTRUCTURE
// ============================================================================

// Cache TTL configuration (in milliseconds)
const CACHE_TTL = {
  DEFAULT: 5 * 60 * 1000, // 5 minutes for general data
  METRICS: 2 * 60 * 1000, // 2 minutes for metrics/stats
  SHORT: 30 * 1000, // 30 seconds for frequently changing data
} as const;

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  INITIAL_BACKOFF: 2000, // Start with 2 second delay
  MAX_BACKOFF: 8000, // Max 8 second delay
  BACKOFF_MULTIPLIER: 2, // Double the delay each retry
  RETRY_CODES: [429, 503, 504], // HTTP codes to retry
};

// Cache entry interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache
const cache = new Map<string, CacheEntry<unknown>>();

// Track in-flight requests for deduplication
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Deduplicate concurrent requests for the same key
 * If a request for the same key is already in flight, return the existing promise
 */
function deduplicateRequest<T>(
  key: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetchFn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid<T>(
  entry: CacheEntry<T> | undefined,
  ttl: number,
): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * Get data from cache if valid
 */
function getFromCache<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (isCacheValid(entry, ttl)) {
    return entry.data;
  }
  // Clean up expired entry
  if (entry) {
    cache.delete(key);
  }
  return null;
}

/**
 * Store data in cache
 */
function setInCache<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate cache entries matching a pattern
 */
function invalidateCache(pattern: string | RegExp): void {
  const keysToDelete: string[] = [];

  for (const key of cache.keys()) {
    if (typeof pattern === "string") {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    } else {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }
  }

  keysToDelete.forEach((key) => cache.delete(key));
}

/**
 * Fetch with exponential backoff for rate limiting
 */
async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  let backoffMs = RATE_LIMIT_CONFIG.INITIAL_BACKOFF;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If rate limited, retry with backoff
      if (
        RATE_LIMIT_CONFIG.RETRY_CODES.includes(response.status) &&
        attempt < maxRetries
      ) {
        apiLogger.warn(
          `Rate limited (${response.status}), retrying in ${backoffMs}ms`,
          {
            attempt: attempt + 1,
            maxRetries,
            url,
          },
        );

        await sleep(backoffMs);
        backoffMs = Math.min(
          backoffMs * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER,
          RATE_LIMIT_CONFIG.MAX_BACKOFF,
        );
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on network errors if we have retries left
      if (attempt < maxRetries) {
        apiLogger.warn(`Network error, retrying in ${backoffMs}ms`, {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });

        await sleep(backoffMs);
        backoffMs = Math.min(
          backoffMs * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER,
          RATE_LIMIT_CONFIG.MAX_BACKOFF,
        );
        continue;
      }
    }
  }

  throw lastError || new Error("Fetch failed after retries");
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// KV Namespace types
export interface KVNamespace {
  id: string;
  title: string;
  first_accessed?: string;
  last_accessed?: string;
  estimated_key_count?: number;
  color?: NamespaceColor;
}

// Namespace color type
export type NamespaceColor =
  | "red"
  | "red-light"
  | "red-dark"
  | "orange"
  | "orange-light"
  | "amber"
  | "yellow"
  | "yellow-light"
  | "lime"
  | "green"
  | "green-light"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "blue-light"
  | "indigo"
  | "purple"
  | "violet"
  | "fuchsia"
  | "pink"
  | "rose"
  | "pink-light"
  | "gray"
  | "slate"
  | "zinc"
  | null;

// KV Key types
export interface KVKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

export interface KVKeyListResponse {
  keys: KVKey[];
  list_complete: boolean;
  cursor?: string;
}

export interface KVKeyWithValue extends KVKey {
  value: string;
  size?: number;
}

// Metadata types
export interface KeyMetadata {
  namespace_id: string;
  key_name: string;
  tags?: string[];
  custom_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

// Search types
export interface SearchResult {
  namespace_id: string;
  key_name: string;
  tags?: string[];
  custom_metadata?: Record<string, unknown>;
  value_preview?: string;
}

// Job Progress types
export interface JobProgress {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    errors: number;
    currentKey?: string;
    percentage: number;
  };
  result?: {
    processed?: number;
    errors?: number;
    skipped?: number;
    downloadUrl?: string;
    format?: string;
  };
  error?: string;
}

export interface BulkJobResponse {
  job_id: string;
  status: string;
  ws_url: string;
  total_keys?: number;
}

// R2 Backup types
export interface R2BackupListItem {
  path: string;
  timestamp: number;
  size: number;
  uploaded: string;
}

// Job Event types
export interface JobEvent {
  id: number;
  job_id: string;
  event_type:
    | "started"
    | "progress_25"
    | "progress_50"
    | "progress_75"
    | "completed"
    | "failed";
  user_email: string;
  timestamp: string;
  details: string | null;
}

export interface JobEventDetails {
  total?: number;
  processed?: number;
  errors?: number;
  percentage?: number;
  error_message?: string;
  [key: string]: unknown;
}

export interface JobEventsResponse {
  job_id: string;
  events: JobEvent[];
}

// Job List types
export interface JobListItem {
  job_id: string;
  namespace_id: string;
  operation_type: string;
  status: "queued" | "running" | "completed" | "failed";
  total_keys: number | null;
  processed_keys: number | null;
  error_count: number | null;
  percentage: number;
  started_at: string;
  completed_at: string | null;
  user_email: string;
}

export interface JobListResponse {
  jobs: JobListItem[];
  total: number;
  limit: number;
  offset: number;
}

// KV Metrics types
export type KVMetricsTimeRange = "24h" | "7d" | "30d";

export interface KVOperationDataPoint {
  date: string;
  namespaceId?: string;
  actionType: string;
  requests: number;
  latencyMsP50?: number;
  latencyMsP90?: number;
  latencyMsP99?: number;
}

export interface KVStorageDataPoint {
  date: string;
  namespaceId: string;
  keyCount: number;
  byteCount: number;
}

export interface KVNamespaceMetricsSummary {
  namespaceId: string;
  namespaceName?: string;
  totalOperations: number;
  operationsByType: Record<string, number>;
  p50LatencyMs?: number;
  p90LatencyMs?: number;
  p99LatencyMs?: number;
  currentKeyCount?: number;
  currentByteCount?: number;
}

export interface KVMetricsResponse {
  summary: {
    timeRange: KVMetricsTimeRange;
    startDate: string;
    endDate: string;
    totalOperations: number;
    operationsByType: Record<string, number>;
    avgLatencyMs?: {
      p50: number;
      p90: number;
      p99: number;
    };
    totalKeyCount?: number;
    totalByteCount?: number;
    namespaceCount: number;
  };
  byNamespace: KVNamespaceMetricsSummary[];
  operationsSeries: KVOperationDataPoint[];
  storageSeries: KVStorageDataPoint[];
}

// Legacy alias for backward compatibility
export type KVMetricsSummary = KVMetricsResponse;

class APIService {
  /**
   * Get fetch options with credentials
   */
  private getFetchOptions(init?: RequestInit): RequestInit {
    return {
      ...init,
      credentials: "include",
      cache: "no-store",
    };
  }

  /**
   * Handle API response
   */
  private async handleResponse(response: Response): Promise<Response> {
    if (response.status === 401 || response.status === 403) {
      apiLogger.error("Authentication error", undefined, {
        status: response.status,
      });
      localStorage.clear();
      sessionStorage.clear();
      throw new Error(`Authentication error: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  // ============================================================================
  // CACHE INVALIDATION METHODS
  // ============================================================================

  /**
   * Invalidate all namespace-related cache entries
   */
  invalidateNamespaceCache(): void {
    invalidateCache("namespaces:");
  }

  /**
   * Invalidate all key-related cache entries for a specific namespace
   */
  invalidateKeysCache(namespaceId: string): void {
    invalidateCache(`keys:${namespaceId}:`);
  }

  /**
   * Invalidate cache for a specific job
   */
  invalidateJobCache(jobId: string): void {
    invalidateCache(`job:${jobId}`);
  }

  /**
   * Invalidate the job list cache
   */
  invalidateJobListCache(): void {
    invalidateCache("jobs:list:");
  }

  /**
   * Clear all caches (use sparingly)
   */
  invalidateAllCaches(): void {
    cache.clear();
  }

  // ============================================================================
  // NAMESPACE OPERATIONS
  // ============================================================================

  /**
   * List all KV namespaces
   */
  async listNamespaces(skipCache = false): Promise<KVNamespace[]> {
    const cacheKey = "namespaces:list";

    // Check cache first unless skipCache is true
    if (!skipCache) {
      const cached = getFromCache<KVNamespace[]>(cacheKey, CACHE_TTL.DEFAULT);
      if (cached) {
        return cached;
      }
    }

    // Use deduplication to prevent simultaneous duplicate requests
    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/namespaces`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      const result = data.result || [];

      // Store in cache
      setInCache(cacheKey, result);

      return result;
    });
  }

  /**
   * Get all namespace colors
   */
  async getNamespaceColors(skipCache = false): Promise<Record<string, string>> {
    const cacheKey = "namespaces:colors";

    if (!skipCache) {
      const cached = getFromCache<Record<string, string>>(
        cacheKey,
        CACHE_TTL.DEFAULT,
      );
      if (cached) {
        return cached;
      }
    }

    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/namespaces/colors`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      const result = data.result || {};

      setInCache(cacheKey, result);

      return result;
    });
  }

  /**
   * Update namespace color
   */
  async updateNamespaceColor(
    namespaceId: string,
    color: NamespaceColor,
  ): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/namespaces/${namespaceId}/color`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ color }),
      },
    );

    await this.handleResponse(response);

    // Invalidate colors cache
    invalidateCache("namespaces:colors");
  }

  /**
   * Get all key colors for a namespace
   */
  async getKeyColors(
    namespaceId: string,
    skipCache = false,
  ): Promise<Record<string, string>> {
    const cacheKey = `keys:colors:${namespaceId}`;

    if (!skipCache) {
      const cached = getFromCache<Record<string, string>>(
        cacheKey,
        CACHE_TTL.DEFAULT,
      );
      if (cached) {
        return cached;
      }
    }

    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/keys/${namespaceId}/colors`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      const result = data.result || {};

      setInCache(cacheKey, result);

      return result;
    });
  }

  /**
   * Update key color
   */
  async updateKeyColor(
    namespaceId: string,
    keyName: string,
    color: NamespaceColor,
  ): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}/color`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ color }),
      },
    );

    await this.handleResponse(response);

    // Invalidate key colors cache for this namespace
    invalidateCache(`keys:colors:${namespaceId}`);
  }

  /**
   * Create a new namespace
   */
  async createNamespace(title: string): Promise<KVNamespace> {
    const response = await fetchWithBackoff(`${WORKER_API}/api/namespaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ title }),
    });

    await this.handleResponse(response);

    const data = await response.json();

    // Invalidate namespace cache
    this.invalidateNamespaceCache();

    return data.result;
  }

  /**
   * Delete a namespace
   */
  async deleteNamespace(namespaceId: string): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/namespaces/${namespaceId}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );

    await this.handleResponse(response);

    // Invalidate namespace cache
    this.invalidateNamespaceCache();
  }

  /**
   * Rename a namespace
   */
  async renameNamespace(
    namespaceId: string,
    title: string,
  ): Promise<KVNamespace> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/namespaces/${namespaceId}/rename`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ title }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();

    // Invalidate namespace cache
    this.invalidateNamespaceCache();

    return data.result;
  }

  /**
   * Get namespace info
   */
  async getNamespaceInfo(namespaceId: string): Promise<KVNamespace> {
    const response = await fetch(
      `${WORKER_API}/api/namespaces/${namespaceId}/info`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * List keys in a namespace
   */
  async listKeys(
    namespaceId: string,
    options?: {
      prefix?: string;
      cursor?: string;
      limit?: number;
      skipCache?: boolean;
    },
  ): Promise<KVKeyListResponse> {
    const params = new URLSearchParams();
    if (options?.prefix) params.set("prefix", options.prefix);
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit) params.set("limit", options.limit.toString());

    // Create cache key based on namespace and options
    const cacheKey = `keys:${namespaceId}:${params.toString()}`;

    // Check cache first unless skipCache is true or cursor is present (pagination)
    if (!options?.skipCache && !options?.cursor) {
      const cached = getFromCache<KVKeyListResponse>(
        cacheKey,
        CACHE_TTL.DEFAULT,
      );
      if (cached) {
        return cached;
      }
    }

    // Use deduplication to prevent simultaneous duplicate requests
    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/keys/${namespaceId}/list?${params.toString()}`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      const result = data.result;

      // Cache only if not paginating
      if (!options?.cursor) {
        setInCache(cacheKey, result);
      }

      return result;
    });
  }

  /**
   * Get a key's value
   */
  async getKey(namespaceId: string, keyName: string): Promise<KVKeyWithValue> {
    // Add cache-busting parameter to ensure fresh data after edits
    const cacheBuster = `_t=${Date.now()}`;
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}?${cacheBuster}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Create or update a key
   */
  async putKey(
    namespaceId: string,
    keyName: string,
    value: string,
    options?: {
      metadata?: unknown;
      expiration_ttl?: number;
      create_backup?: boolean;
    },
  ): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ value, ...options }),
      },
    );

    await this.handleResponse(response);

    // Invalidate keys cache for this namespace
    this.invalidateKeysCache(namespaceId);
  }

  /**
   * Delete a key
   */
  async deleteKey(namespaceId: string, keyName: string): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );

    await this.handleResponse(response);

    // Invalidate keys cache for this namespace
    this.invalidateKeysCache(namespaceId);
  }

  /**
   * Rename a key
   */
  async renameKey(
    namespaceId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/keys/${namespaceId}/rename`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      },
    );

    await this.handleResponse(response);

    // Invalidate keys cache for this namespace
    this.invalidateKeysCache(namespaceId);
  }

  /**
   * Bulk delete keys (async with job tracking)
   */
  async bulkDeleteKeys(
    namespaceId: string,
    keys: string[],
  ): Promise<BulkJobResponse> {
    const response = await fetchWithBackoff(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ keys }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();

    // Invalidate keys cache for this namespace
    this.invalidateKeysCache(namespaceId);

    return data.result;
  }

  /**
   * Get key metadata from D1
   */
  async getMetadata(
    namespaceId: string,
    keyName: string,
  ): Promise<KeyMetadata> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/${encodeURIComponent(keyName)}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Update key metadata
   */
  async updateMetadata(
    namespaceId: string,
    keyName: string,
    metadata: { tags?: string[]; custom_metadata?: Record<string, unknown> },
  ): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(metadata),
      },
    );

    await this.handleResponse(response);
  }

  /**
   * Search keys
   */
  async searchKeys(options: {
    query?: string;
    namespace_id?: string;
    tags?: string[];
  }): Promise<SearchResult[]> {
    const params = new URLSearchParams();
    if (options.query) params.set("query", options.query);
    if (options.namespace_id) params.set("namespaceId", options.namespace_id);
    if (options.tags) params.set("tags", options.tags.join(","));

    const response = await fetch(
      `${WORKER_API}/api/search?${params.toString()}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Check if backup exists
   */
  async checkBackup(namespaceId: string, keyName: string): Promise<boolean> {
    const response = await fetch(
      `${WORKER_API}/api/backup/${namespaceId}/${encodeURIComponent(keyName)}/check`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result?.exists ?? false;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(namespaceId: string, keyName: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/backup/${namespaceId}/${encodeURIComponent(keyName)}/undo`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    await this.handleResponse(response);
  }

  /**
   * Bulk copy keys to another namespace (async with job tracking)
   */
  async bulkCopyKeys(
    namespaceId: string,
    keys: string[],
    targetNamespaceId: string,
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-copy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ keys, target_namespace_id: targetNamespaceId }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Bulk update TTL for keys (async with job tracking)
   */
  async bulkUpdateTTL(
    namespaceId: string,
    keys: string[],
    expirationTtl: number,
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-ttl`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ keys, expiration_ttl: expirationTtl }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Bulk tag keys (async with job tracking)
   */
  async bulkTagKeys(
    namespaceId: string,
    keys: string[],
    tags: string[],
    operation: "add" | "remove" | "replace" = "replace",
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/bulk-tag`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ keys, tags, operation }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Export namespace (async with job tracking)
   */
  async exportNamespace(
    namespaceId: string,
    format: "json" | "ndjson" = "json",
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/export/${namespaceId}?format=${format}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Import keys to namespace (async with job tracking)
   */
  async importKeys(
    namespaceId: string,
    data: string,
    collision: "skip" | "overwrite" | "fail" = "overwrite",
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/import/${namespaceId}?collision=${collision}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        credentials: "include",
        body: data,
      },
    );

    await this.handleResponse(response);

    const data_result = await response.json();
    return data_result.result;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    const cacheKey = `job:${jobId}:status`;

    // Use deduplication to prevent simultaneous duplicate requests
    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/jobs/${jobId}`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      return data.result;
    });
  }

  /**
   * List R2 backups for a namespace
   */
  async listR2Backups(namespaceId: string): Promise<R2BackupListItem[]> {
    const response = await fetch(
      `${WORKER_API}/api/r2-backup/${namespaceId}/list`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Backup namespace to R2 (async with job tracking)
   */
  async backupToR2(
    namespaceId: string,
    format: "json" | "ndjson" = "json",
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/r2-backup/${namespaceId}?format=${format}`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Restore namespace from R2 backup (async with job tracking)
   */
  async restoreFromR2(
    namespaceId: string,
    backupPath: string,
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/r2-restore/${namespaceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ backupPath }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Batch backup multiple namespaces to R2 (async with job tracking)
   */
  async batchBackupToR2(
    namespaceIds: string[],
    format: "json" | "ndjson" = "json",
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/r2-backup/batch?format=${format}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ namespace_ids: namespaceIds }),
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Batch restore multiple namespaces from R2 backups (async with job tracking)
   */
  async batchRestoreFromR2(
    restoreMap: Record<string, string>,
  ): Promise<BulkJobResponse> {
    const response = await fetch(`${WORKER_API}/api/r2-restore/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ restore_map: restoreMap }),
    });

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Get audit log for namespace (or all namespaces if namespaceId is 'all')
   */
  async getAuditLog(
    namespaceId: string,
    options?: { limit?: number; offset?: number; operation?: string },
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset) params.set("offset", options.offset.toString());
    if (options?.operation) params.set("operation", options.operation);

    // Use /api/audit/all for all namespaces, otherwise use namespace-specific endpoint
    const endpoint =
      namespaceId === "all"
        ? `${WORKER_API}/api/audit/all?${params.toString()}`
        : `${WORKER_API}/api/audit/${namespaceId}?${params.toString()}`;

    const response = await fetch(endpoint, this.getFetchOptions());

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Get audit log for user
   */
  async getUserAuditLog(
    userEmail: string,
    options?: { limit?: number; offset?: number; operation?: string },
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset) params.set("offset", options.offset.toString());
    if (options?.operation) params.set("operation", options.operation);

    const response = await fetch(
      `${WORKER_API}/api/audit/user/${encodeURIComponent(userEmail)}?${params.toString()}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Download export file from completed export job
   */
  async downloadExport(jobId: string, filename: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/jobs/${jobId}/download`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get job events (event timeline) for a specific job
   */
  async getJobEvents(jobId: string): Promise<JobEventsResponse> {
    const response = await fetch(
      `${WORKER_API}/api/jobs/${jobId}/events`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Get list of jobs with optional filters
   */
  async getJobList(options?: {
    limit?: number;
    offset?: number;
    status?: string;
    operation_type?: string;
    namespace_id?: string;
    start_date?: string;
    end_date?: string;
    job_id?: string;
    min_errors?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<JobListResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.offset) params.set("offset", options.offset.toString());
    if (options?.status) params.set("status", options.status);
    if (options?.operation_type)
      params.set("operation_type", options.operation_type);
    if (options?.namespace_id) params.set("namespace_id", options.namespace_id);
    if (options?.start_date) params.set("start_date", options.start_date);
    if (options?.end_date) params.set("end_date", options.end_date);
    if (options?.job_id) params.set("job_id", options.job_id);
    if (options?.min_errors !== undefined)
      params.set("min_errors", options.min_errors.toString());
    if (options?.sort_by) params.set("sort_by", options.sort_by);
    if (options?.sort_order) params.set("sort_order", options.sort_order);

    const response = await fetch(
      `${WORKER_API}/api/jobs?${params.toString()}`,
      this.getFetchOptions(),
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  /**
   * Sync all keys in a namespace to search index
   */
  async syncNamespaceKeys(
    namespaceId: string,
  ): Promise<{ message: string; total_keys: number; synced: number }> {
    const response = await fetch(
      `${WORKER_API}/api/admin/sync-keys/${namespaceId}`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    await this.handleResponse(response);

    const data = await response.json();
    return data.result;
  }

  // ============================================================================
  // KV METRICS
  // ============================================================================

  /**
   * Get KV metrics for a namespace or account-wide
   */
  async getMetrics(
    options: {
      namespaceId?: string;
      range?: KVMetricsTimeRange;
      skipCache?: boolean;
    } = {},
  ): Promise<KVMetricsResponse> {
    const params = new URLSearchParams();
    if (options.range) params.set("range", options.range);
    if (options.namespaceId) params.set("namespaceId", options.namespaceId);
    if (options.skipCache) params.set("skipCache", "true");

    const cacheKey = `metrics:${options.namespaceId ?? "all"}:${options.range ?? "7d"}`;

    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = getFromCache<KVMetricsResponse>(
        cacheKey,
        CACHE_TTL.METRICS,
      );
      if (cached) {
        return cached;
      }
    }

    return deduplicateRequest(cacheKey, async () => {
      const response = await fetchWithBackoff(
        `${WORKER_API}/api/metrics?${params.toString()}`,
        this.getFetchOptions(),
      );

      await this.handleResponse(response);

      const data = await response.json();
      const result = data.result as KVMetricsResponse;

      // Store in cache
      setInCache(cacheKey, result);

      return result;
    });
  }
}

export const api = new APIService();

// ============================================================================
// MIGRATION TYPES
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  description: string;
}

export interface AppliedMigration {
  version: number;
  migration_name: string;
  applied_at: string;
}

export interface LegacyInstallationInfo {
  isLegacy: boolean;
  existingTables: string[];
  suggestedVersion: number;
}

export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: Migration[];
  appliedMigrations: AppliedMigration[];
  isUpToDate: boolean;
  legacy?: LegacyInstallationInfo;
}

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  currentVersion: number;
  errors: string[];
}

// ============================================================================
// MIGRATION API FUNCTIONS
// ============================================================================

/**
 * Get current migration status
 */
export const getMigrationStatus = async (): Promise<MigrationStatus> => {
  const response = await fetch(`${WORKER_API}/api/migrations/status`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to get migration status: ${response.status}`);
  }

  const data = (await response.json()) as {
    result: MigrationStatus;
    success: boolean;
  };
  if (!data.result) {
    throw new Error("Invalid response from migration status endpoint");
  }
  return data.result;
};

/**
 * Apply all pending migrations
 */
export const applyMigrations = async (): Promise<MigrationResult> => {
  const response = await fetch(`${WORKER_API}/api/migrations/apply`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to apply migrations: ${response.status}`);
  }

  const data = (await response.json()) as {
    result: MigrationResult;
    success: boolean;
  };
  if (!data.result) {
    throw new Error("Invalid response from migration apply endpoint");
  }
  return data.result;
};

/**
 * Mark migrations as applied for legacy installations
 */
export const markLegacyMigrations = async (
  version: number,
): Promise<{ markedUpTo: number }> => {
  const response = await fetch(`${WORKER_API}/api/migrations/mark-legacy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ version }),
  });

  if (!response.ok) {
    throw new Error(`Failed to mark legacy migrations: ${response.status}`);
  }

  const data = (await response.json()) as {
    result: { markedUpTo: number };
    success: boolean;
  };
  if (!data.result) {
    throw new Error("Invalid response from mark-legacy endpoint");
  }
  return data.result;
};
