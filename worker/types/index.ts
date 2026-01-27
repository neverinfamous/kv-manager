// Import Cloudflare Workers types
import type {
  Fetcher,
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";

// Cloudflare Worker Environment
export interface Env {
  ASSETS: Fetcher;
  METADATA: D1Database;
  BULK_OPERATION_DO: DurableObjectNamespace;
  IMPORT_EXPORT_DO: DurableObjectNamespace;
  BACKUP_BUCKET?: R2Bucket; // Optional for local dev

  // Cloudflare API credentials (secrets in production, undefined in local dev)
  ACCOUNT_ID?: string;
  API_KEY?: string;

  // Cloudflare Access JWT validation
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;

  // Environment indicator
  ENVIRONMENT?: string;

  // Dynamic KV namespace bindings (configured in wrangler.toml)
  [key: string]: unknown;
}

// KV Namespace API Response Types
export interface KVNamespaceInfo {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
  first_accessed?: string;
  last_accessed?: string;
  estimated_key_count?: number;
}

export interface KVKeyInfo {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

export interface KVKeyListResponse {
  result: KVKeyInfo[];
  result_info: {
    count: number;
    cursor?: string;
  };
  success: boolean;
  errors: unknown[];
  messages: unknown[];
}

// D1 Metadata Types
export interface KeyMetadata {
  id?: number;
  namespace_id: string;
  key_name: string;
  tags?: string; // JSON array
  custom_metadata?: string; // JSON object
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id?: number;
  namespace_id: string;
  key_name?: string;
  operation: string;
  user_email?: string;
  timestamp?: string;
  details?: string; // JSON object
}

export interface BulkJob {
  job_id: string;
  namespace_id: string;
  operation_type: string;
  status: "queued" | "running" | "completed" | "failed";
  total_keys?: number;
  processed_keys?: number;
  error_count?: number;
  current_key?: string;
  percentage?: number;
  started_at?: string;
  completed_at?: string;
  user_email?: string;
}

export interface JobAuditEvent {
  id?: number;
  job_id: string;
  event_type:
    | "started"
    | "progress_25"
    | "progress_50"
    | "progress_75"
    | "completed"
    | "failed";
  user_email: string;
  timestamp?: string;
  details?: string; // JSON object
}

// Job Progress Message Types (used by Durable Objects)
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
  result?: unknown;
  error?: string;
}

export interface BulkCopyParams {
  sourceNamespaceId: string;
  targetNamespaceId: string;
  keys: string[];
  userEmail: string;
}

export interface BulkTTLParams {
  namespaceId: string;
  keys: string[];
  ttl: number;
  userEmail: string;
}

export interface BulkTagParams {
  namespaceId: string;
  keys: string[];
  tags: string[];
  operation: "add" | "remove" | "replace";
  userEmail: string;
}

export interface BulkDeleteParams {
  namespaceId: string;
  keys: string[];
  userEmail: string;
}

export interface ImportParams {
  namespaceId: string;
  importData: {
    name: string;
    value: string;
    metadata?: Record<string, unknown>; // KV native metadata (1024 byte limit)
    custom_metadata?: Record<string, unknown>; // D1 custom metadata (no limit)
    tags?: string[]; // D1 tags
    expiration_ttl?: number; // TTL in seconds
    ttl?: number; // Alternative TTL field name
    expiration?: number; // Unix timestamp expiration
  }[];
  collision: "skip" | "overwrite" | "fail";
  userEmail: string;
}

export interface ExportParams {
  namespaceId: string;
  format: "json" | "ndjson";
  userEmail: string;
}

export interface R2BackupParams {
  namespaceId: string;
  format: "json" | "ndjson";
  userEmail: string;
}

export interface R2RestoreParams {
  namespaceId: string;
  backupPath: string; // e.g., "backups/ns-123/1234567890.json"
  userEmail: string;
}

export interface BatchR2BackupParams {
  namespaceIds: string[];
  format: "json" | "ndjson";
  userEmail: string;
}

export interface BatchR2RestoreParams {
  restoreMap: Record<string, string>; // namespace_id -> backup_path
  userEmail: string;
}

export interface R2BackupListItem {
  path: string;
  timestamp: number;
  size: number;
  uploaded: string;
}

// Bulk Migration Types
export interface BulkMigrateParams {
  sourceNamespaceId: string;
  targetNamespaceId: string;
  keys: string[];
  cutoverMode: "copy" | "copy_delete";
  migrateMetadata: boolean;
  preserveTTL: boolean;
  createBackup: boolean;
  backupPath?: string; // R2 backup path for rollback reference
  userEmail: string;
}

export interface MigrationVerificationResult {
  passed: boolean;
  sourceKeyCount: number;
  targetKeyCount: number;
}

export interface MigrationResult {
  success: boolean;
  keysMigrated: number;
  metadataMigrated: number;
  errors: number;
  verification?: MigrationVerificationResult;
  backupPath?: string;
  warnings: string[];
}

// API Response Wrapper
export interface APIResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  errors?: string[];
}

// Mock Data Type for Local Development
export interface MockKVData {
  namespaces: KVNamespaceInfo[];
  keys: Record<string, KVKeyInfo[]>;
  values: Record<string, string>;
  metadata: Record<string, KeyMetadata>;
  auditLog: AuditLogEntry[];
  bulkJobs: BulkJob[];
}

// Webhook Types
// Database representation (as stored in D1)
export interface WebhookDB {
  id: string;
  name: string;
  url: string;
  events: string; // JSON string of WebhookEventType[]
  secret?: string | null;
  enabled: number; // 0 or 1
  created_at: string;
  updated_at?: string;
}

// API representation (for frontend/API responses)
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secret?: string;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export type WebhookEventType =
  | "key.created"
  | "key.updated"
  | "key.deleted"
  | "namespace.created"
  | "namespace.deleted"
  | "job.completed"
  | "job.failed";

export interface WebhookTestResult {
  success: boolean;
  statusText?: string;
  error?: string;
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: unknown;
}

// Error Logging Types
export interface ErrorContext {
  module: string;
  operation: string;
  entityId?: string;
  [key: string]: unknown;
}

export type ErrorSeverity = "error" | "warning" | "info";

export interface StructuredError {
  level: ErrorSeverity;
  module: string;
  code: string;
  message: string;
  context?: ErrorContext;
  stack?: string;
  timestamp: string;
}

// CORS Types
export type CorsHeaders = HeadersInit;

// ============================================================================
// KV METRICS TYPES
// ============================================================================

// Time range options for metrics queries
export type KVMetricsTimeRange = "24h" | "7d" | "30d";

// Operation data point from kvOperationsAdaptiveGroups
export interface KVOperationDataPoint {
  date: string;
  namespaceId?: string | undefined;
  actionType: string;
  requests: number;
  latencyMsP50?: number | undefined;
  latencyMsP90?: number | undefined;
  latencyMsP99?: number | undefined;
}

// Storage data point from kvStorageAdaptiveGroups
export interface KVStorageDataPoint {
  date: string;
  namespaceId: string;
  keyCount: number;
  byteCount: number;
}

// Per-namespace metrics summary
export interface KVNamespaceMetricsSummary {
  namespaceId: string;
  namespaceName?: string | undefined;
  totalOperations: number;
  operationsByType: Record<string, number>;
  p50LatencyMs?: number | undefined;
  p90LatencyMs?: number | undefined;
  p99LatencyMs?: number | undefined;
  currentKeyCount?: number | undefined;
  currentByteCount?: number | undefined;
}

// Full metrics response
export interface KVMetricsResponse {
  summary: {
    timeRange: KVMetricsTimeRange;
    startDate: string;
    endDate: string;
    totalOperations: number;
    operationsByType: Record<string, number>;
    avgLatencyMs?:
      | {
          p50: number;
          p90: number;
          p99: number;
        }
      | undefined;
    totalKeyCount?: number | undefined;
    totalByteCount?: number | undefined;
    namespaceCount: number;
  };
  byNamespace: KVNamespaceMetricsSummary[];
  operationsSeries: KVOperationDataPoint[];
  storageSeries: KVStorageDataPoint[];
}

// GraphQL response types for KV analytics
export interface KVOperationsGraphQLGroup {
  sum?: { requests?: number };
  dimensions?: { date?: string; actionType?: string; namespaceId?: string };
  quantiles?: {
    latencyMsP50?: number;
    latencyMsP90?: number;
    latencyMsP99?: number;
  };
}

export interface KVStorageGraphQLGroup {
  max?: { keyCount?: number; byteCount?: number };
  dimensions?: { date?: string; namespaceId?: string };
}

export interface KVAnalyticsResult {
  viewer: {
    accounts: {
      kvOperationsAdaptiveGroups?: KVOperationsGraphQLGroup[];
      kvStorageAdaptiveGroups?: KVStorageGraphQLGroup[];
    }[];
  };
}

export interface GraphQLAnalyticsResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// Migration Types (for API responses)
export interface MigrationStatusResponse {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: { version: number; name: string; description: string }[];
  appliedMigrations: {
    version: number;
    migration_name: string;
    applied_at: string;
  }[];
  isUpToDate: boolean;
  legacy?: LegacyInstallationInfoResponse;
}

export interface LegacyInstallationInfoResponse {
  isLegacy: boolean;
  existingTables: string[];
  suggestedVersion: number;
}

export interface MigrationResultResponse {
  success: boolean;
  migrationsApplied: number;
  currentVersion: number;
  errors: string[];
}
