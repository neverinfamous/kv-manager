import type { Env, APIResponse, KVNamespaceInfo } from "../types";
import {
  createCfApiRequest,
  getD1Binding,
  getMockNamespaceInfo,
  auditLog,
} from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleNamespaceRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/namespaces - List all namespaces (with key counts)
    if (url.pathname === "/api/namespaces" && request.method === "GET") {
      if (isLocalDev) {
        const mockNamespaces = getMockNamespaceInfo();
        const response: APIResponse<KVNamespaceInfo[]> = {
          success: true,
          result: mockNamespaces,
        };
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces`,
        env,
      );
      const cfResponse = await fetch(cfRequest);
      const data = (await cfResponse.json()) as { result: KVNamespaceInfo[] };
      const namespaces = data.result || [];

      // Fetch key counts for each namespace using batched parallel requests (max 5 concurrent)
      const BATCH_SIZE = 5;
      const namespacesWithCounts: KVNamespaceInfo[] = [];

      for (let i = 0; i < namespaces.length; i += BATCH_SIZE) {
        const batch = namespaces.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (ns) => {
            try {
              // Fetch keys with limit=1000 to get count (and detect if there are more)
              const keysRequest = createCfApiRequest(
                `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${ns.id}/keys?limit=1000`,
                env,
              );
              const keysResponse = await fetch(keysRequest);
              if (keysResponse.ok) {
                const keysData = (await keysResponse.json()) as {
                  result?: unknown[];
                  result_info?: { cursor?: string };
                };
                const keyCount = keysData.result?.length ?? 0;
                const hasMore = !!keysData.result_info?.cursor;
                return {
                  ...ns,
                  // If there are more keys (cursor exists), show "1000+" equivalent
                  estimated_key_count: hasMore ? keyCount : keyCount,
                };
              }
              return ns; // Return without count if fetch fails
            } catch {
              return ns; // Return without count on error
            }
          }),
        );
        namespacesWithCounts.push(...batchResults);
      }

      const response: APIResponse<KVNamespaceInfo[]> = {
        success: true,
        result: namespacesWithCounts,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/namespaces - Create namespace
    if (url.pathname === "/api/namespaces" && request.method === "POST") {
      const body = (await request.json()) as { title: string };

      if (!body.title) {
        return new Response(JSON.stringify({ error: "Missing title" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (isLocalDev) {
        const mockNamespace: KVNamespaceInfo = {
          id: `mock-${Date.now()}`,
          title: body.title,
          first_accessed: new Date().toISOString(),
          last_accessed: new Date().toISOString(),
          estimated_key_count: 0,
        };

        const response: APIResponse<KVNamespaceInfo> = {
          success: true,
          result: mockNamespace,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      logInfo(
        "Creating namespace",
        createErrorContext("namespaces", "create_namespace", {
          metadata: { title: body.title, accountId: env.ACCOUNT_ID },
        }),
      );

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces`,
        env,
        {
          method: "POST",
          body: JSON.stringify({ title: body.title }),
        },
      );

      const cfResponse = await fetch(cfRequest);
      logInfo(
        "Cloudflare API response",
        createErrorContext("namespaces", "create_namespace", {
          metadata: { status: cfResponse.status },
        }),
      );

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("namespaces", "create_namespace", {
            metadata: { status: cfResponse.status, title: body.title },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      const data = (await cfResponse.json()) as { result: KVNamespaceInfo };

      // Log audit entry
      await auditLog(db, {
        namespace_id: data.result.id,
        operation: "create_namespace",
        user_email: userEmail,
        details: JSON.stringify({ title: body.title }),
      });

      const response: APIResponse<KVNamespaceInfo> = {
        success: true,
        result: data.result,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // PATCH /api/namespaces/:namespaceId/rename - Rename namespace
    const renameMatch = url.pathname.match(
      /^\/api\/namespaces\/([^/]+)\/rename$/,
    );
    if (renameMatch && request.method === "PATCH") {
      const namespaceId = renameMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Missing namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const body = (await request.json()) as { title: string };

      if (!body.title) {
        return new Response(JSON.stringify({ error: "Missing title" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      logInfo(
        "Renaming namespace",
        createErrorContext("namespaces", "rename_namespace", {
          ...(namespaceId && { namespaceId }),
          metadata: { newTitle: body.title },
        }),
      );

      if (isLocalDev) {
        const response: APIResponse<KVNamespaceInfo> = {
          success: true,
          result: {
            id: namespaceId,
            title: body.title,
            first_accessed: new Date().toISOString(),
            last_accessed: new Date().toISOString(),
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}`,
        env,
        {
          method: "PUT",
          body: JSON.stringify({ title: body.title }),
        },
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("namespaces", "rename_namespace", {
            ...(namespaceId && { namespaceId }),
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      const data = (await cfResponse.json()) as { result: KVNamespaceInfo };

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: "rename_namespace",
        user_email: userEmail,
        details: JSON.stringify({ new_title: body.title }),
      });

      const response: APIResponse<KVNamespaceInfo> = {
        success: true,
        result: data.result,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // DELETE /api/namespaces/:namespaceId - Delete namespace
    const deleteMatch = url.pathname.match(/^\/api\/namespaces\/([^/]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      const namespaceId = deleteMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Missing namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}`,
        env,
        { method: "DELETE" },
      );

      await fetch(cfRequest);

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: "delete_namespace",
        user_email: userEmail,
      });

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
      createErrorContext("namespaces", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
