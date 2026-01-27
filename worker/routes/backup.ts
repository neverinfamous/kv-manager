import type { Env, APIResponse } from "../types";
import { createCfApiRequest, getD1Binding, auditLog } from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleBackupRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/backup/:namespaceId/:keyName/check - Check if backup exists
    const checkMatch = url.pathname.match(
      /^\/api\/backup\/([^/]+)\/(.+)\/check$/,
    );
    if (checkMatch && request.method === "GET") {
      const namespaceId = checkMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Invalid namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyNameEncoded = checkMatch[2];
      if (!keyNameEncoded) {
        return new Response(JSON.stringify({ error: "Invalid key name" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyName = decodeURIComponent(keyNameEncoded);
      const backupKey = `__backup__:${keyName}`;

      logInfo(
        "Checking backup for key",
        createErrorContext("backup", "check_backup", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev) {
        // In local dev, randomly return true/false for demo
        const response: APIResponse = {
          success: true,
          result: { exists: Math.random() > 0.5 },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Check if backup key exists in KV
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(backupKey)}`,
        env,
      );

      const cfResponse = await fetch(cfRequest);
      const exists = cfResponse.ok;

      logInfo(
        "Backup check result",
        createErrorContext("backup", "check_backup", {
          ...(namespaceId && { namespaceId }),
          keyName,
          metadata: { exists },
        }),
      );

      const response: APIResponse = {
        success: true,
        result: { exists },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/backup/:namespaceId/:keyName/undo - Restore from backup
    const undoMatch = url.pathname.match(
      /^\/api\/backup\/([^/]+)\/(.+)\/undo$/,
    );
    if (undoMatch && request.method === "POST") {
      const namespaceId = undoMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Invalid namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyNameEncoded = undoMatch[2];
      if (!keyNameEncoded) {
        return new Response(JSON.stringify({ error: "Invalid key name" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyName = decodeURIComponent(keyNameEncoded);
      const backupKey = `__backup__:${keyName}`;

      logInfo(
        "Restoring backup for key",
        createErrorContext("backup", "restore_backup", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Get backup value
      const getBackupRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(backupKey)}`,
        env,
      );

      const backupResponse = await fetch(getBackupRequest);

      if (!backupResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Backup not found or expired" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const backupValue = await backupResponse.text();

      // Restore the backup value to the original key
      const restoreRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env,
        {
          method: "PUT",
          body: backupValue,
          headers: {
            "Content-Type": "text/plain",
          },
        },
      );

      const restoreResponse = await fetch(restoreRequest);

      if (!restoreResponse.ok) {
        const errorText = await restoreResponse.text();
        await logError(
          env,
          `Failed to restore backup: ${restoreResponse.status}`,
          createErrorContext("backup", "restore_backup", {
            ...(namespaceId && { namespaceId }),
            keyName,
            metadata: { errorText },
          }),
          isLocalDev,
        );
        throw new Error(`Failed to restore backup: ${restoreResponse.status}`);
      }

      // Delete the backup key after successful restore
      const deleteBackupRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(backupKey)}`,
        env,
        { method: "DELETE" },
      );

      await fetch(deleteBackupRequest);

      // Log audit entry
      const auditEntry: Omit<
        import("../types").AuditLogEntry,
        "id" | "timestamp"
      > = {
        namespace_id: namespaceId,
        operation: "restore_backup",
        user_email: userEmail,
      };
      if (keyName) {
        auditEntry.key_name = keyName;
      }
      await auditLog(db, auditEntry);

      logInfo(
        "Restore completed successfully",
        createErrorContext("backup", "restore_backup", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      const response: APIResponse = {
        success: true,
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
      createErrorContext("backup", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
