import type {
  D1Database,
  KVNamespace,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import type {
  Env,
  KVNamespaceInfo,
  KVKeyInfo,
  KeyMetadata,
  AuditLogEntry,
  BulkJob,
  MockKVData,
  JobAuditEvent,
} from "../types";
import { logInfo, logWarning, createErrorContext } from "./error-logger";

/**
 * Create a Cloudflare API request with authentication
 */
export function createCfApiRequest(
  endpoint: string,
  env: Env,
  init?: RequestInit,
): Request {
  const url = `https://api.cloudflare.com/client/v4${endpoint}`;

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${env.API_KEY}`);

  // Only set Content-Type if not using FormData (FormData sets its own Content-Type with boundary)
  const isFormData = init?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Request(url, {
    ...init,
    headers,
  });
}

/**
 * Generate a unique job ID with optional prefix
 */
export function generateJobId(prefix = "job"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get D1 database binding
 */
export function getD1Binding(env: Env): D1Database | null {
  return env.METADATA || null;
}

/**
 * Get KV namespace binding by ID from environment
 */
export function getKvBinding(
  env: Env,
  namespaceId: string,
): KVNamespace | null {
  // Try to find the binding in the environment
  // In production, wrangler binds KV namespaces to env variables
  const binding = env[`KV_${namespaceId}`] as KVNamespace | undefined;
  return binding || null;
}

/**
 * Get Durable Object binding
 */
export function getDoBinding(
  env: Env,
  name: "BULK_OPERATION_DO" | "IMPORT_EXPORT_DO",
): DurableObjectNamespace | null {
  return env[name] || null;
}

/**
 * Mock data for local development
 */
const mockData: MockKVData = {
  namespaces: [
    {
      id: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      title: "production-cache",
      first_accessed: "2024-01-15T10:30:00Z",
      last_accessed: "2024-11-05T08:45:00Z",
      estimated_key_count: 1247,
    },
    {
      id: "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7",
      title: "session-store",
      first_accessed: "2024-02-01T14:20:00Z",
      last_accessed: "2024-11-05T09:15:00Z",
      estimated_key_count: 3892,
    },
    {
      id: "c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8",
      title: "feature-flags",
      first_accessed: "2024-03-10T11:00:00Z",
      last_accessed: "2024-11-04T16:30:00Z",
      estimated_key_count: 42,
    },
  ],
  keys: {},
  values: {},
  metadata: {},
  auditLog: [],
  bulkJobs: [],
};

export function getMockKvData(): MockKVData {
  return mockData;
}

export function getMockNamespaceInfo(): KVNamespaceInfo[] {
  return mockData.namespaces;
}

export function getMockKeyInfo(namespaceId: string): KVKeyInfo[] {
  return mockData.keys[namespaceId] || [];
}

export function getMockKeyMetadata(
  namespaceId: string,
  keyName: string,
): KeyMetadata | null {
  const key = `${namespaceId}:${keyName}`;
  return mockData.metadata[key] || null;
}

export function getMockAuditLogEntry(): AuditLogEntry[] {
  return mockData.auditLog;
}

export function getMockBulkJob(): BulkJob[] {
  return mockData.bulkJobs;
}

/**
 * Log an audit entry to D1
 */
export async function auditLog(
  db: D1Database | null,
  entry: Omit<AuditLogEntry, "id" | "timestamp">,
): Promise<void> {
  if (!db) {
    logWarning(
      "No D1 binding, skipping audit log",
      createErrorContext("audit", "log_entry"),
    );
    return;
  }

  try {
    await db
      .prepare(
        `INSERT INTO audit_log (namespace_id, key_name, operation, user_email, details)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.namespace_id,
        entry.key_name || null,
        entry.operation,
        entry.user_email || null,
        entry.details || null,
      )
      .run();
  } catch (error) {
    // Note: No env/isLocalDev available in this context, log synchronously
    logWarning(
      "Failed to log audit entry",
      createErrorContext("audit", "log_entry", {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }
}

/**
 * Log a job audit event to D1
 */
export async function logJobEvent(
  db: D1Database | null,
  event: Omit<JobAuditEvent, "id" | "timestamp">,
): Promise<void> {
  if (!db) {
    logWarning(
      "No D1 binding, skipping event log",
      createErrorContext("job_audit", "log_event"),
    );
    return;
  }

  try {
    await db
      .prepare(
        `INSERT INTO job_audit_events (job_id, event_type, user_email, details)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        event.job_id,
        event.event_type,
        event.user_email,
        event.details || null,
      )
      .run();
    logInfo(
      `Logged ${event.event_type} event for job`,
      createErrorContext("job_audit", "log_event", {
        metadata: { jobId: event.job_id, eventType: event.event_type },
      }),
    );
  } catch (error) {
    logWarning(
      "Failed to log job event",
      createErrorContext("job_audit", "log_event", {
        metadata: {
          jobId: event.job_id,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }
}

/**
 * Get or create namespace tracking in D1
 */
export async function getNamespaceTitle(
  db: D1Database | null,
  namespaceId: string,
  title?: string,
): Promise<string | null> {
  if (!db) return title || null;

  try {
    // Try to get existing title
    const existing = await db
      .prepare("SELECT namespace_title FROM namespaces WHERE namespace_id = ?")
      .bind(namespaceId)
      .first<{ namespace_title: string }>();

    if (existing) {
      // Update last_accessed
      await db
        .prepare(
          "UPDATE namespaces SET last_accessed = CURRENT_TIMESTAMP WHERE namespace_id = ?",
        )
        .bind(namespaceId)
        .run();

      return existing.namespace_title;
    }

    // Create new entry if title provided
    if (title) {
      await db
        .prepare(
          `INSERT INTO namespaces (namespace_id, namespace_title)
           VALUES (?, ?)`,
        )
        .bind(namespaceId, title)
        .run();

      return title;
    }

    return null;
  } catch (error) {
    logWarning(
      "Failed to get/create namespace",
      createErrorContext("namespaces", "get_title", {
        namespaceId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    return title || null;
  }
}

/**
 * Get namespace ID from title
 */
export async function getNamespaceId(
  db: D1Database | null,
  title: string,
): Promise<string | null> {
  if (!db) return null;

  try {
    const result = await db
      .prepare("SELECT namespace_id FROM namespaces WHERE namespace_title = ?")
      .bind(title)
      .first<{ namespace_id: string }>();

    return result?.namespace_id || null;
  } catch (error) {
    logWarning(
      "Failed to get namespace ID",
      createErrorContext("namespaces", "get_id", {
        metadata: {
          title,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    return null;
  }
}

/**
 * Get KV namespace binding from environment
 * This is a placeholder - in practice, namespaces would need to be bound in wrangler.toml
 */
export function getNamespaceBinding(
  env: Env,
  namespaceId: string,
): KVNamespace | null {
  // Check if there's a binding for this namespace
  // Bindings are added dynamically via wrangler.toml
  const binding = env[`KV_${namespaceId.replace(/-/g, "_")}`] as
    | KVNamespace
    | undefined;
  return binding || null;
}

/**
 * Get KV namespace binding by ID
 */
export function getNamespaceBindingFromId(
  env: Env,
  namespaceId: string,
): KVNamespace | null {
  return getNamespaceBinding(env, namespaceId);
}

/**
 * Get KV namespace binding by title (requires D1 lookup)
 */
export async function getNamespaceBindingFromTitle(
  env: Env,
  db: D1Database | null,
  title: string,
): Promise<KVNamespace | null> {
  const namespaceId = await getNamespaceId(db, title);
  if (!namespaceId) return null;
  return getNamespaceBinding(env, namespaceId);
}

/**
 * Get KV namespace binding from either title or ID
 */
export async function getNamespaceBindingFromTitleOrId(
  env: Env,
  db: D1Database | null,
  identifier: string,
): Promise<{ binding: KVNamespace | null; namespaceId: string | null }> {
  // Try as ID first
  let binding = getNamespaceBinding(env, identifier);
  if (binding) {
    return { binding, namespaceId: identifier };
  }

  // Try as title
  const namespaceId = await getNamespaceId(db, identifier);
  if (namespaceId) {
    binding = getNamespaceBinding(env, namespaceId);
    return { binding, namespaceId };
  }

  return { binding: null, namespaceId: null };
}
