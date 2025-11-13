import type { Env, APIResponse } from '../types';
import { createCfApiRequest, getD1Binding } from '../utils/helpers';

/**
 * Admin utility routes for maintenance operations
 */
export async function handleAdminRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // POST /api/admin/sync-keys/:namespaceId - Sync all keys in a namespace to D1 metadata
    const syncMatch = url.pathname.match(/^\/api\/admin\/sync-keys\/([^/]+)$/);
    if (syncMatch && request.method === 'POST') {
      const namespaceId = syncMatch[1];

      console.log('[Admin] Syncing keys for namespace:', namespaceId, 'requested by:', userEmail);

      if (isLocalDev || !db) {
        const response: APIResponse = {
          success: true,
          result: { message: 'Local dev mode - sync skipped', synced: 0 }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // List all keys in the namespace
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`,
        env
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Admin] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      const data = await cfResponse.json() as { result: Array<{ name: string }> };
      const keys = data.result || [];

      console.log('[Admin] Found', keys.length, 'keys to sync');

      // Insert metadata entries for all keys (skip if already exists)
      let syncedCount = 0;
      for (const key of keys) {
        try {
          await db
            .prepare(`
              INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
              ON CONFLICT(namespace_id, key_name)
              DO NOTHING
            `)
            .bind(namespaceId, key.name, '[]', '{}')
            .run();
          syncedCount++;
        } catch (err) {
          console.error('[Admin] Failed to sync key:', key.name, err);
          // Continue with other keys
        }
      }

      console.log('[Admin] Successfully synced', syncedCount, 'of', keys.length, 'keys');

      const response: APIResponse = {
        success: true,
        result: {
          message: `Synced ${syncedCount} keys to search index`,
          total_keys: keys.length,
          synced: syncedCount
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('[Admin] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

