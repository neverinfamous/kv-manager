/**
 * Monitoring Thresholds Routes for KV Manager
 *
 * CRUD operations for monitoring threshold configuration.
 */

import type {
  Env,
  APIResponse,
  MonitoringThresholdDB,
  MonitoringThreshold,
} from "../types";
import { logError } from "../utils/error-logger";
import { auditLog } from "../utils/helpers";

/**
 * Input type for creating/updating thresholds
 */
interface ThresholdBody {
  namespace_id?: string;
  storage_bytes_threshold?: number | null;
  operation_rate_threshold?: number | null;
  latency_p99_threshold_ms?: number | null;
  enabled?: boolean;
}

/**
 * Generate current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Convert MonitoringThresholdDB to MonitoringThreshold
 */
function dbToThreshold(db: MonitoringThresholdDB): MonitoringThreshold {
  const result: MonitoringThreshold = {
    namespace_id: db.namespace_id,
    storage_bytes_threshold: db.storage_bytes_threshold,
    operation_rate_threshold: db.operation_rate_threshold,
    latency_p99_threshold_ms: db.latency_p99_threshold_ms,
    enabled: db.enabled === 1,
    created_at: db.created_at,
    updated_at: db.updated_at,
    updated_by: db.updated_by,
  };
  if (db.namespace_name !== undefined) {
    result.namespace_name = db.namespace_name;
  }
  return result;
}

/**
 * Mock thresholds for local development
 */
const MOCK_THRESHOLDS: MonitoringThreshold[] = [
  {
    namespace_id: "mock-namespace-id",
    namespace_name: "Mock Namespace",
    storage_bytes_threshold: 1000000,
    operation_rate_threshold: 50,
    latency_p99_threshold_ms: 100.5,
    enabled: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    updated_by: "dev@localhost",
  },
];

export async function handleThresholdRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response | null> {
  const method = request.method;
  const path = url.pathname;

  // GET /api/thresholds - List all thresholds
  if (method === "GET" && path === "/api/thresholds") {
    return listThresholds(env, corsHeaders, isLocalDev);
  }

  // POST /api/thresholds - Create/upsert threshold
  if (method === "POST" && path === "/api/thresholds") {
    return createThreshold(request, env, corsHeaders, isLocalDev, userEmail);
  }

  // GET/PUT/DELETE /api/thresholds/:namespaceId
  const singleMatch = /^\/api\/thresholds\/([^/]+)$/.exec(path);
  if (singleMatch) {
    const namespaceId = singleMatch[1];
    if (!namespaceId) {
      return jsonResponse(
        { success: false, error: "Namespace ID required" },
        corsHeaders,
        400,
      );
    }

    if (method === "GET") {
      return getThreshold(namespaceId, env, corsHeaders, isLocalDev);
    }

    if (method === "PUT") {
      return updateThreshold(namespaceId, request, env, corsHeaders, isLocalDev, userEmail);
    }

    if (method === "DELETE") {
      return deleteThreshold(namespaceId, env, corsHeaders, isLocalDev, userEmail);
    }
  }

  // Route not matched
  return null;
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: APIResponse | Record<string, unknown>,
  corsHeaders: HeadersInit,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Validate numeric thresholds
 */
function validateNumericThresholds(body: ThresholdBody): string | null {
  if (body.storage_bytes_threshold !== undefined && body.storage_bytes_threshold !== null && body.storage_bytes_threshold < 0) {
    return "storage_bytes_threshold must be non-negative";
  }
  if (body.operation_rate_threshold !== undefined && body.operation_rate_threshold !== null && body.operation_rate_threshold < 0) {
    return "operation_rate_threshold must be non-negative";
  }
  if (body.latency_p99_threshold_ms !== undefined && body.latency_p99_threshold_ms !== null && body.latency_p99_threshold_ms <= 0) {
    return "latency_p99_threshold_ms must be positive";
  }
  return null;
}

/**
 * List all thresholds
 */
async function listThresholds(
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
): Promise<Response> {
  if (isLocalDev) {
    return jsonResponse(
      { success: true, result: { thresholds: MOCK_THRESHOLDS } },
      corsHeaders,
    );
  }

  try {
    const result = await env.METADATA.prepare(
      `SELECT t.*, n.namespace_title as namespace_name 
       FROM monitoring_thresholds t
       LEFT JOIN namespaces n ON t.namespace_id = n.namespace_id
       ORDER BY t.created_at DESC`
    ).all<MonitoringThresholdDB>();

    const thresholds = result.results.map(dbToThreshold);
    return jsonResponse({ success: true, result: { thresholds } }, corsHeaders);
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "thresholds", operation: "list" },
      isLocalDev,
    );
    return jsonResponse(
      { success: false, error: "Failed to list thresholds" },
      corsHeaders,
      500,
    );
  }
}

/**
 * Get a single threshold
 */
async function getThreshold(
  namespaceId: string,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
): Promise<Response> {
  if (isLocalDev) {
    const threshold = MOCK_THRESHOLDS.find((t) => t.namespace_id === namespaceId);
    if (!threshold) {
      return jsonResponse(
        { success: false, error: "Threshold not found" },
        corsHeaders,
        404,
      );
    }
    return jsonResponse({ success: true, result: { threshold } }, corsHeaders);
  }

  try {
    const dbResult = await env.METADATA.prepare(
      `SELECT t.*, n.namespace_title as namespace_name 
       FROM monitoring_thresholds t
       LEFT JOIN namespaces n ON t.namespace_id = n.namespace_id
       WHERE t.namespace_id = ?`
    )
      .bind(namespaceId)
      .first<MonitoringThresholdDB>();

    if (!dbResult) {
      return jsonResponse(
        { success: false, error: "Threshold not found" },
        corsHeaders,
        404,
      );
    }

    const threshold = dbToThreshold(dbResult);
    return jsonResponse({ success: true, result: { threshold } }, corsHeaders);
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "thresholds", operation: "get" },
      isLocalDev,
    );
    return jsonResponse(
      { success: false, error: "Failed to get threshold" },
      corsHeaders,
      500,
    );
  }
}

/**
 * Create or upsert a threshold
 */
async function createThreshold(
  request: Request,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  try {
    const body: ThresholdBody = await request.json();

    if (!body.namespace_id) {
      return jsonResponse(
        { success: false, error: "namespace_id is required" },
        corsHeaders,
        400,
      );
    }

    if (
      body.storage_bytes_threshold == null &&
      body.operation_rate_threshold == null &&
      body.latency_p99_threshold_ms == null
    ) {
      return jsonResponse(
        { success: false, error: "At least one threshold field must be set" },
        corsHeaders,
        400,
      );
    }

    const validationError = validateNumericThresholds(body);
    if (validationError) {
      return jsonResponse(
        { success: false, error: validationError },
        corsHeaders,
        400,
      );
    }

    const now = nowISO();
    const enabledVal = body.enabled ?? true;

    if (isLocalDev) {
      const existingIdx = MOCK_THRESHOLDS.findIndex(t => t.namespace_id === body.namespace_id);
      
      const newThreshold: MonitoringThreshold = {
        namespace_id: body.namespace_id,
        namespace_name: "Mock Namespace",
        storage_bytes_threshold: body.storage_bytes_threshold ?? null,
        operation_rate_threshold: body.operation_rate_threshold ?? null,
        latency_p99_threshold_ms: body.latency_p99_threshold_ms ?? null,
        enabled: enabledVal,
        created_at: existingIdx >= 0 ? (MOCK_THRESHOLDS[existingIdx]?.created_at ?? now) : now,
        updated_at: now,
        updated_by: userEmail,
      };

      if (existingIdx >= 0) {
        MOCK_THRESHOLDS[existingIdx] = newThreshold;
      } else {
        MOCK_THRESHOLDS.push(newThreshold);
      }

      return jsonResponse(
        { success: true, result: { threshold: newThreshold } },
        corsHeaders,
        201,
      );
    }

    // Check if namespace exists
    const nsExists = await env.METADATA.prepare("SELECT id FROM namespaces WHERE id = ?").bind(body.namespace_id).first();
    if (!nsExists) {
      return jsonResponse(
        { success: false, error: "Namespace not found" },
        corsHeaders,
        404,
      );
    }

    const sbt = body.storage_bytes_threshold ?? null;
    const ort = body.operation_rate_threshold ?? null;
    const lpt = body.latency_p99_threshold_ms ?? null;
    const enabledNum = enabledVal ? 1 : 0;

    await env.METADATA.prepare(
      `INSERT INTO monitoring_thresholds 
        (namespace_id, storage_bytes_threshold, operation_rate_threshold, latency_p99_threshold_ms, enabled, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (namespace_id) DO UPDATE SET
        storage_bytes_threshold = excluded.storage_bytes_threshold,
        operation_rate_threshold = excluded.operation_rate_threshold,
        latency_p99_threshold_ms = excluded.latency_p99_threshold_ms,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by`
    )
      .bind(
        body.namespace_id,
        sbt,
        ort,
        lpt,
        enabledNum,
        now,
        now,
        userEmail
      )
      .run();

    const dbResult = await env.METADATA.prepare(
      `SELECT t.*, n.name as namespace_name 
       FROM monitoring_thresholds t
       LEFT JOIN namespaces n ON t.namespace_id = n.id
       WHERE t.namespace_id = ?`
    )
      .bind(body.namespace_id)
      .first<MonitoringThresholdDB>();

    if (!dbResult) {
      return jsonResponse(
        { success: false, error: "Failed to create/upsert threshold" },
        corsHeaders,
        500,
      );
    }

    const threshold = dbToThreshold(dbResult);
    
    if (!isLocalDev) {
      void auditLog(env.METADATA, {
        namespace_id: body.namespace_id,
        operation: "threshold_create",
        user_email: userEmail,
        details: JSON.stringify({ threshold }),
      });
    }

    return jsonResponse(
      { success: true, result: { threshold } },
      corsHeaders,
      201,
    );
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "thresholds", operation: "create" },
      isLocalDev,
    );
    return jsonResponse(
      { success: false, error: "Failed to create threshold" },
      corsHeaders,
      500,
    );
  }
}

/**
 * Update a threshold
 */
async function updateThreshold(
  namespaceId: string,
  request: Request,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  try {
    const body: ThresholdBody = await request.json();
    const now = nowISO();

    const validationError = validateNumericThresholds(body);
    if (validationError) {
      return jsonResponse(
        { success: false, error: validationError },
        corsHeaders,
        400,
      );
    }

    if (isLocalDev) {
      const index = MOCK_THRESHOLDS.findIndex((t) => t.namespace_id === namespaceId);
      if (index === -1) {
        return jsonResponse(
          { success: false, error: "Threshold not found" },
          corsHeaders,
          404,
        );
      }

      const existing = MOCK_THRESHOLDS[index];
      if (!existing) {
        return jsonResponse(
          { success: false, error: "Threshold not found" },
          corsHeaders,
          404,
        );
      }
      const updated: MonitoringThreshold = {
        ...existing,
        updated_at: now,
        updated_by: userEmail,
      };

      if (body.storage_bytes_threshold !== undefined) updated.storage_bytes_threshold = body.storage_bytes_threshold;
      if (body.operation_rate_threshold !== undefined) updated.operation_rate_threshold = body.operation_rate_threshold;
      if (body.latency_p99_threshold_ms !== undefined) updated.latency_p99_threshold_ms = body.latency_p99_threshold_ms;
      if (body.enabled !== undefined) updated.enabled = body.enabled;

      if (
        updated.storage_bytes_threshold == null &&
        updated.operation_rate_threshold == null &&
        updated.latency_p99_threshold_ms == null
      ) {
        return jsonResponse(
          { success: false, error: "At least one threshold field must be set" },
          corsHeaders,
          400,
        );
      }

      MOCK_THRESHOLDS[index] = updated;
      return jsonResponse(
        { success: true, result: { threshold: MOCK_THRESHOLDS[index] } },
        corsHeaders,
      );
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.storage_bytes_threshold !== undefined) {
      updates.push("storage_bytes_threshold = ?");
      values.push(body.storage_bytes_threshold);
    }
    if (body.operation_rate_threshold !== undefined) {
      updates.push("operation_rate_threshold = ?");
      values.push(body.operation_rate_threshold);
    }
    if (body.latency_p99_threshold_ms !== undefined) {
      updates.push("latency_p99_threshold_ms = ?");
      values.push(body.latency_p99_threshold_ms);
    }
    if (body.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(body.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return jsonResponse(
        { success: false, error: "No fields to update" },
        corsHeaders,
        400,
      );
    }

    updates.push("updated_at = ?");
    values.push(now);
    updates.push("updated_by = ?");
    values.push(userEmail);
    values.push(namespaceId);

    const existingDb = await env.METADATA.prepare("SELECT * FROM monitoring_thresholds WHERE namespace_id = ?").bind(namespaceId).first<MonitoringThresholdDB>();
    if (!existingDb) {
      return jsonResponse(
        { success: false, error: "Threshold not found" },
        corsHeaders,
        404,
      );
    }

    await env.METADATA.prepare(
      `UPDATE monitoring_thresholds SET ${updates.join(", ")} WHERE namespace_id = ?`
    )
      .bind(...values)
      .run();

    // Verify it doesn't violate "at least one set" constraint
    const checkDb = await env.METADATA.prepare("SELECT * FROM monitoring_thresholds WHERE namespace_id = ?").bind(namespaceId).first<MonitoringThresholdDB>();
    if (checkDb && checkDb.storage_bytes_threshold == null && checkDb.operation_rate_threshold == null && checkDb.latency_p99_threshold_ms == null) {
      // Revert if invalid (naive rollback simulation for simplicity)
      await env.METADATA.prepare(
        `UPDATE monitoring_thresholds SET 
         storage_bytes_threshold = ?, operation_rate_threshold = ?, latency_p99_threshold_ms = ?, enabled = ?, updated_at = ?, updated_by = ? 
         WHERE namespace_id = ?`
      ).bind(existingDb.storage_bytes_threshold, existingDb.operation_rate_threshold, existingDb.latency_p99_threshold_ms, existingDb.enabled, existingDb.updated_at, existingDb.updated_by, namespaceId).run();
      
      return jsonResponse(
        { success: false, error: "At least one threshold field must be set" },
        corsHeaders,
        400,
      );
    }

    const resultDb = await env.METADATA.prepare(
      `SELECT t.*, n.name as namespace_name 
       FROM monitoring_thresholds t
       LEFT JOIN namespaces n ON t.namespace_id = n.id
       WHERE t.namespace_id = ?`
    )
      .bind(namespaceId)
      .first<MonitoringThresholdDB>();

    if (!resultDb) {
      return jsonResponse(
        { success: false, error: "Failed to fetch updated threshold" },
        corsHeaders,
        500,
      );
    }

    const threshold = dbToThreshold(resultDb);
    
    if (!isLocalDev) {
      void auditLog(env.METADATA, {
        namespace_id: namespaceId,
        operation: "threshold_update",
        user_email: userEmail,
        details: JSON.stringify({ updates }),
      });
    }

    return jsonResponse({ success: true, result: { threshold } }, corsHeaders);
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "thresholds", operation: "update" },
      isLocalDev,
    );
    return jsonResponse(
      { success: false, error: "Failed to update threshold" },
      corsHeaders,
      500,
    );
  }
}

/**
 * Delete a threshold
 */
async function deleteThreshold(
  namespaceId: string,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  if (isLocalDev) {
    const index = MOCK_THRESHOLDS.findIndex((t) => t.namespace_id === namespaceId);
    if (index === -1) {
      return jsonResponse(
        { success: false, error: "Threshold not found" },
        corsHeaders,
        404,
      );
    }
    MOCK_THRESHOLDS.splice(index, 1);
    return jsonResponse(
      { success: true, result: { deleted: true } },
      corsHeaders,
    );
  }

  try {
    const existing = await env.METADATA.prepare(
      "SELECT namespace_id FROM monitoring_thresholds WHERE namespace_id = ?"
    )
      .bind(namespaceId)
      .first();

    if (!existing) {
      return jsonResponse(
        { success: false, error: "Threshold not found" },
        corsHeaders,
        404,
      );
    }

    await env.METADATA.prepare("DELETE FROM monitoring_thresholds WHERE namespace_id = ?")
      .bind(namespaceId)
      .run();

    if (!isLocalDev) {
      void auditLog(env.METADATA, {
        namespace_id: namespaceId,
        operation: "threshold_delete",
        user_email: userEmail,
        details: JSON.stringify({}),
      });
    }

    return jsonResponse(
      { success: true, result: { deleted: true } },
      corsHeaders,
    );
  } catch (error) {
    void logError(
      env,
      error instanceof Error ? error : String(error),
      { module: "thresholds", operation: "delete" },
      isLocalDev,
    );
    return jsonResponse(
      { success: false, error: "Failed to delete threshold" },
      corsHeaders,
      500,
    );
  }
}
