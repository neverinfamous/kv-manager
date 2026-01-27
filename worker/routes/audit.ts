import type { Env, APIResponse } from "../types";
import { getD1Binding } from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleAuditRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  _userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/audit/all - Get all audit logs across all namespaces
    if (url.pathname === "/api/audit/all" && request.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const operationType = url.searchParams.get("operation");

      logInfo(
        "Getting all audit logs",
        createErrorContext("audit", "get_all_logs", {
          metadata: { limit, offset, operationType: operationType || "all" },
        }),
      );

      if (isLocalDev || !db) {
        // Return mock audit log with namespace operations
        const mockAuditLog = [
          {
            id: 1,
            namespace_id: "deleted-namespace-123",
            key_name: null,
            operation: "delete_namespace",
            user_email: "admin@example.com",
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            details: JSON.stringify({ title: "old-cache" }),
          },
          {
            id: 2,
            namespace_id: "mock-namespace-1",
            key_name: "test-key-1",
            operation: "create",
            user_email: "user@example.com",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: JSON.stringify({ source: "web" }),
          },
          {
            id: 3,
            namespace_id: "mock-namespace-2",
            key_name: null,
            operation: "create_namespace",
            user_email: "admin@example.com",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: JSON.stringify({ title: "new-cache" }),
          },
          {
            id: 4,
            namespace_id: "mock-namespace-1",
            key_name: null,
            operation: "r2_backup",
            user_email: "user@example.com",
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            details: JSON.stringify({ format: "json", keys_count: 150 }),
          },
        ];

        const filtered = operationType
          ? mockAuditLog.filter((log) => log.operation === operationType)
          : mockAuditLog;

        const response: APIResponse = {
          success: true,
          result: filtered.slice(offset, offset + limit),
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build query - no namespace filter
      let sql = "SELECT * FROM audit_log WHERE 1=1";
      const bindings: (string | number)[] = [];

      if (operationType) {
        sql += " AND operation = ?";
        bindings.push(operationType);
      }

      sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      bindings.push(limit, offset);

      const results = await db
        .prepare(sql)
        .bind(...bindings)
        .all();

      const response: APIResponse = {
        success: true,
        result: results.results || [],
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET /api/audit/:namespaceId - Get audit log for namespace
    const namespaceMatch = url.pathname.match(/^\/api\/audit\/([^/]+)$/);
    if (namespaceMatch && request.method === "GET") {
      const namespaceId = namespaceMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Invalid namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const operationType = url.searchParams.get("operation");

      logInfo(
        "Getting audit log for namespace",
        createErrorContext("audit", "get_log", {
          ...(namespaceId && { namespaceId }),
          metadata: { limit, offset },
        }),
      );

      if (isLocalDev || !db) {
        // Return mock audit log
        const mockAuditLog = [
          {
            id: 1,
            namespace_id: namespaceId,
            key_name: "test-key-1",
            operation: "create",
            user_email: "user@example.com",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: JSON.stringify({ source: "web" }),
          },
          {
            id: 2,
            namespace_id: namespaceId,
            key_name: "test-key-2",
            operation: "update",
            user_email: "user@example.com",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: JSON.stringify({ backup_created: true }),
          },
          {
            id: 3,
            namespace_id: namespaceId,
            key_name: null,
            operation: "bulk_delete",
            user_email: "admin@example.com",
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            details: JSON.stringify({ key_count: 10 }),
          },
        ];

        const filtered = operationType
          ? mockAuditLog.filter((log) => log.operation === operationType)
          : mockAuditLog;

        const response: APIResponse = {
          success: true,
          result: filtered.slice(offset, offset + limit),
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build query
      let sql = "SELECT * FROM audit_log WHERE namespace_id = ?";
      const bindings: (string | number)[] = [namespaceId];

      if (operationType) {
        sql += " AND operation = ?";
        bindings.push(operationType);
      }

      sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      bindings.push(limit, offset);

      const results = await db
        .prepare(sql)
        .bind(...bindings)
        .all();

      const response: APIResponse = {
        success: true,
        result: results.results || [],
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET /api/audit/user/:userEmail - Get audit log for user
    const userMatch = url.pathname.match(/^\/api\/audit\/user\/([^/]+)$/);
    if (userMatch && request.method === "GET") {
      const userEmailEncoded = userMatch[1];
      if (!userEmailEncoded) {
        return new Response(JSON.stringify({ error: "Invalid user email" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const targetUserEmail = decodeURIComponent(userEmailEncoded);
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const operationType = url.searchParams.get("operation");

      logInfo(
        "Getting audit log for user",
        createErrorContext("audit", "get_user_log", {
          userId: targetUserEmail,
          metadata: { limit, offset },
        }),
      );

      if (isLocalDev || !db) {
        // Return mock audit log
        const mockAuditLog = [
          {
            id: 1,
            namespace_id: "mock-namespace-1",
            key_name: "test-key-1",
            operation: "create",
            user_email: targetUserEmail,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: JSON.stringify({ source: "web" }),
          },
          {
            id: 2,
            namespace_id: "mock-namespace-2",
            key_name: "config-key",
            operation: "update",
            user_email: targetUserEmail,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: JSON.stringify({ backup_created: true }),
          },
        ];

        const filtered = operationType
          ? mockAuditLog.filter((log) => log.operation === operationType)
          : mockAuditLog;

        const response: APIResponse = {
          success: true,
          result: filtered.slice(offset, offset + limit),
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build query
      let sql = "SELECT * FROM audit_log WHERE user_email = ?";
      const bindings: (string | number)[] = [targetUserEmail];

      if (operationType) {
        sql += " AND operation = ?";
        bindings.push(operationType);
      }

      sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      bindings.push(limit, offset);

      const results = await db
        .prepare(sql)
        .bind(...bindings)
        .all();

      const response: APIResponse = {
        success: true,
        result: results.results || [],
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    await logError(
      env,
      error instanceof Error ? error : String(error),
      createErrorContext("audit", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
