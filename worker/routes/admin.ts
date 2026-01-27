import type { Env, APIResponse } from "../types";
import { createCfApiRequest, getD1Binding } from "../utils/helpers";
import {
  logInfo,
  logWarning,
  logError,
  createErrorContext,
} from "../utils/error-logger";

/**
 * Admin utility routes for maintenance operations
 */
export async function handleAdminRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // POST /api/admin/sync-keys/:namespaceId - Sync all keys in a namespace to D1 metadata
    const syncMatch = url.pathname.match(/^\/api\/admin\/sync-keys\/([^/]+)$/);
    if (syncMatch && request.method === "POST") {
      const namespaceId = syncMatch[1];

      logInfo(
        "Syncing keys for namespace",
        createErrorContext("admin", "sync_keys", {
          ...(namespaceId && { namespaceId }),
          userId: userEmail,
        }),
      );

      if (isLocalDev || !db) {
        const response: APIResponse = {
          success: true,
          result: { message: "Local dev mode - sync skipped", synced: 0 },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // List all keys in the namespace
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`,
        env,
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("admin", "sync_keys", {
            ...(namespaceId && { namespaceId }),
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      const data = (await cfResponse.json()) as { result: { name: string }[] };
      const keys = data.result || [];

      logInfo(
        `Found ${keys.length} keys to sync`,
        createErrorContext("admin", "sync_keys", {
          ...(namespaceId && { namespaceId }),
          metadata: { keyCount: keys.length },
        }),
      );

      // Insert metadata entries for all keys (skip if already exists)
      let syncedCount = 0;
      for (const key of keys) {
        try {
          await db
            .prepare(
              `
              INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
              ON CONFLICT(namespace_id, key_name)
              DO NOTHING
            `,
            )
            .bind(namespaceId, key.name, "[]", "{}")
            .run();
          syncedCount++;
        } catch (err) {
          logWarning(
            `Failed to sync key: ${key.name}`,
            createErrorContext("admin", "sync_keys", {
              ...(namespaceId && { namespaceId }),
              keyName: key.name,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          // Continue with other keys
        }
      }

      logInfo(
        `Successfully synced ${syncedCount} of ${keys.length} keys`,
        createErrorContext("admin", "sync_keys", {
          ...(namespaceId && { namespaceId }),
          metadata: { syncedCount, totalKeys: keys.length },
        }),
      );

      const response: APIResponse = {
        success: true,
        result: {
          message: `Synced ${syncedCount} keys to search index`,
          total_keys: keys.length,
          synced: syncedCount,
        },
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
      createErrorContext("admin", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
