import type { Env, APIResponse, KVNamespaceInfo } from '../types';
import { createCfApiRequest, getD1Binding, getMockNamespaceInfo, auditLog } from '../utils/helpers';

export async function handleNamespaceRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/namespaces - List all namespaces
    if (url.pathname === '/api/namespaces' && request.method === 'GET') {
      if (isLocalDev) {
        const mockNamespaces = getMockNamespaceInfo();
        const response: APIResponse<KVNamespaceInfo[]> = {
          success: true,
          result: mockNamespaces
        };
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(`/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces`, env);
      const cfResponse = await fetch(cfRequest);
      const data = await cfResponse.json() as { result: KVNamespaceInfo[] };

      const response: APIResponse<KVNamespaceInfo[]> = {
        success: true,
        result: data.result || []
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/namespaces - Create namespace
    if (url.pathname === '/api/namespaces' && request.method === 'POST') {
      const body = await request.json() as { title: string };

      if (!body.title) {
        return new Response(JSON.stringify({ error: 'Missing title' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (isLocalDev) {
        const mockNamespace: KVNamespaceInfo = {
          id: `mock-${Date.now()}`,
          title: body.title,
          first_accessed: new Date().toISOString(),
          last_accessed: new Date().toISOString(),
          estimated_key_count: 0
        };

        const response: APIResponse<KVNamespaceInfo> = {
          success: true,
          result: mockNamespace
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Namespaces] Creating namespace:', body.title);
      console.log('[Namespaces] Account ID:', env.ACCOUNT_ID);
      
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces`,
        env,
        {
          method: 'POST',
          body: JSON.stringify({ title: body.title })
        }
      );

      const cfResponse = await fetch(cfRequest);
      console.log('[Namespaces] Cloudflare API response status:', cfResponse.status);
      
      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Namespaces] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }
      
      const data = await cfResponse.json() as { result: KVNamespaceInfo };

      // Log audit entry
      await auditLog(db, {
        namespace_id: data.result.id,
        operation: 'create_namespace',
        user_email: userEmail,
        details: JSON.stringify({ title: body.title })
      });

      const response: APIResponse<KVNamespaceInfo> = {
        success: true,
        result: data.result
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // PATCH /api/namespaces/:namespaceId/rename - Rename namespace
    const renameMatch = url.pathname.match(/^\/api\/namespaces\/([^/]+)\/rename$/);
    if (renameMatch && request.method === 'PATCH') {
      const namespaceId = renameMatch[1];
      const body = await request.json() as { title: string };

      if (!body.title) {
        return new Response(JSON.stringify({ error: 'Missing title' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Namespaces] Renaming namespace:', namespaceId, 'to:', body.title);

      if (isLocalDev) {
        const response: APIResponse<KVNamespaceInfo> = {
          success: true,
          result: {
            id: namespaceId,
            title: body.title,
            first_accessed: new Date().toISOString(),
            last_accessed: new Date().toISOString()
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}`,
        env,
        {
          method: 'PUT',
          body: JSON.stringify({ title: body.title })
        }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Namespaces] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      const data = await cfResponse.json() as { result: KVNamespaceInfo };

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'rename_namespace',
        user_email: userEmail,
        details: JSON.stringify({ new_title: body.title })
      });

      const response: APIResponse<KVNamespaceInfo> = {
        success: true,
        result: data.result
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // DELETE /api/namespaces/:namespaceId - Delete namespace
    const deleteMatch = url.pathname.match(/^\/api\/namespaces\/([^/]+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const namespaceId = deleteMatch[1];

      if (isLocalDev) {
        const response: APIResponse = {
          success: true
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}`,
        env,
        { method: 'DELETE' }
      );

      await fetch(cfRequest);

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'delete_namespace',
        user_email: userEmail
      });

      const response: APIResponse = {
        success: true
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
    console.error('[Namespaces] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

