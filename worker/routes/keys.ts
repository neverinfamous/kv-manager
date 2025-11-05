import type { Env, APIResponse, KVKeyInfo } from '../types';
import { createCfApiRequest, getD1Binding, auditLog } from '../utils/helpers';

export async function handleKeyRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/keys/:namespaceId/list - List keys in namespace
    const listMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/list$/);
    if (listMatch && request.method === 'GET') {
      const namespaceId = listMatch[1];
      const prefix = url.searchParams.get('prefix') || undefined;
      const limit = url.searchParams.get('limit') || '1000';

      console.log('[Keys] Listing keys for namespace:', namespaceId, { prefix, limit });

      if (isLocalDev) {
        // Return mock keys
        const mockKeys: KVKeyInfo[] = [
          { name: 'test-key-1', expiration: undefined, metadata: {} },
          { name: 'test-key-2', expiration: Math.floor(Date.now() / 1000) + 86400, metadata: {} },
          { name: 'config-key', expiration: undefined, metadata: { version: '1.0' } }
        ];

        const response: APIResponse = {
          success: true,
          result: {
            keys: prefix ? mockKeys.filter(k => k.name.startsWith(prefix)) : mockKeys,
            list_complete: true
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build query params
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      params.set('limit', limit);

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
        env
      );

      const cfResponse = await fetch(cfRequest);
      console.log('[Keys] Cloudflare API response status:', cfResponse.status);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      const data = await cfResponse.json() as { result: KVKeyInfo[] };

      const response: APIResponse = {
        success: true,
        result: {
          keys: data.result || [],
          list_complete: true
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET /api/keys/:namespaceId/:keyName - Get a key's value
    const getMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/([^/]+)$/);
    if (getMatch && request.method === 'GET' && !url.pathname.endsWith('/list')) {
      const namespaceId = getMatch[1];
      const keyName = decodeURIComponent(getMatch[2]);

      console.log('[Keys] Getting key:', keyName, 'from namespace:', namespaceId);

      if (isLocalDev) {
        // Return mock key data
        const mockValue = JSON.stringify({ example: 'data', timestamp: Date.now() });
        const response: APIResponse = {
          success: true,
          result: {
            name: keyName,
            value: mockValue,
            size: mockValue.length,
            metadata: { mock: true }
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      const value = await cfResponse.text();
      
      // Get metadata separately
      const metadataRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/metadata/${encodeURIComponent(keyName)}`,
        env
      );
      
      const metadataResponse = await fetch(metadataRequest);
      let metadata = {};
      
      if (metadataResponse.ok) {
        const metadataData = await metadataResponse.json() as { result?: Record<string, unknown> };
        metadata = metadataData.result || {};
      }

      const response: APIResponse = {
        success: true,
        result: {
          name: keyName,
          value: value,
          size: new Blob([value]).size,
          metadata: metadata
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // PUT /api/keys/:namespaceId/:keyName - Create or update a key
    const putMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/([^/]+)$/);
    if (putMatch && request.method === 'PUT') {
      const namespaceId = putMatch[1];
      const keyName = decodeURIComponent(putMatch[2]);
      const body = await request.json() as { 
        value: string; 
        metadata?: unknown; 
        expiration_ttl?: number;
        create_backup?: boolean;
      };

      if (body.value === undefined) {
        return new Response(JSON.stringify({ error: 'Missing value' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Keys] Putting key:', keyName, 'to namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // If create_backup is true, backup existing value first
      if (body.create_backup) {
        try {
          const existingRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
            env
          );
          const existingResponse = await fetch(existingRequest);
          
          if (existingResponse.ok) {
            const existingValue = await existingResponse.text();
            const backupKey = `__backup__:${keyName}`;
            
            // Store backup with 24 hour TTL
            const backupRequest = createCfApiRequest(
              `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(backupKey)}?expiration_ttl=86400`,
              env,
              {
                method: 'PUT',
                body: existingValue
              }
            );
            await fetch(backupRequest);
            console.log('[Keys] Created backup for key:', keyName);
          }
        } catch (err) {
          console.error('[Keys] Failed to create backup:', err);
          // Continue with put operation even if backup fails
        }
      }

      // Build query params for expiration
      const params = new URLSearchParams();
      if (body.expiration_ttl) {
        params.set('expiration_ttl', body.expiration_ttl.toString());
      }

      const queryString = params.toString() ? `?${params.toString()}` : '';

      // Prepare headers for metadata
      const headers: HeadersInit = {
        'Content-Type': 'text/plain'
      };

      // Add metadata if provided (as JSON string in header or body)
      const requestBody = body.value;
      if (body.metadata) {
        // For KV API, metadata goes in the request as form data or separate field
        // We'll use the simpler text PUT for now
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}${queryString}`,
        env,
        {
          method: 'PUT',
          body: requestBody,
          headers: headers
        }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      // Log audit entry
      const operation = body.create_backup ? 'update' : 'create';
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: keyName,
        operation: operation,
        user_email: userEmail
      });

      const response: APIResponse = {
        success: true
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // DELETE /api/keys/:namespaceId/:keyName - Delete a key
    const deleteMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/(.+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const namespaceId = deleteMatch[1];
      const keyName = decodeURIComponent(deleteMatch[2]);

      console.log('[Keys] Deleting key:', keyName, 'from namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env,
        { method: 'DELETE' }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: keyName,
        operation: 'delete',
        user_email: userEmail
      });

      const response: APIResponse = {
        success: true
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/keys/:namespaceId/bulk-delete - Bulk delete keys
    const bulkDeleteMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/bulk-delete$/);
    if (bulkDeleteMatch && request.method === 'POST') {
      const namespaceId = bulkDeleteMatch[1];
      const body = await request.json() as { keys: string[] };

      if (!body.keys || !Array.isArray(body.keys)) {
        return new Response(JSON.stringify({ error: 'Missing or invalid keys array' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Keys] Bulk deleting', body.keys.length, 'keys from namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
          result: {
            status: 'completed',
            total_keys: body.keys.length,
            processed_keys: body.keys.length
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Use Cloudflare KV bulk delete API
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
        env,
        {
          method: 'DELETE',
          body: JSON.stringify(body.keys)
        }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_delete',
        user_email: userEmail,
        details: JSON.stringify({ key_count: body.keys.length })
      });

      const response: APIResponse = {
        success: true,
        result: {
          status: 'completed',
          total_keys: body.keys.length,
          processed_keys: body.keys.length
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/keys/:namespaceId/bulk-copy - Bulk copy keys to another namespace
    const bulkCopyMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/bulk-copy$/);
    if (bulkCopyMatch && request.method === 'POST') {
      const sourceNamespaceId = bulkCopyMatch[1];
      const body = await request.json() as { keys: string[]; target_namespace_id: string };

      if (!body.keys || !Array.isArray(body.keys) || !body.target_namespace_id) {
        return new Response(JSON.stringify({ error: 'Missing keys array or target_namespace_id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Keys] Bulk copying', body.keys.length, 'keys from', sourceNamespaceId, 'to', body.target_namespace_id);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
          result: {
            job_id: `copy-${Date.now()}`,
            status: 'completed',
            total_keys: body.keys.length,
            processed_keys: body.keys.length,
            error_count: 0
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const jobId = `copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_copy', 'running', ?, CURRENT_TIMESTAMP, ?)
        `).bind(jobId, sourceNamespaceId, body.keys.length, userEmail).run();
      }

      // Fetch all key values from source
      const copyData: Array<{ key: string; value: string }> = [];
      for (const keyName of body.keys) {
        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/values/${encodeURIComponent(keyName)}`,
            env
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            copyData.push({ key: keyName, value: value });
          }
        } catch (err) {
          console.error('[Keys] Failed to fetch key for copy:', keyName, err);
        }
      }

      // Write to target namespace using bulk API
      let processedCount = 0;
      let errorCount = 0;
      const batchSize = 10000;

      for (let i = 0; i < copyData.length; i += batchSize) {
        const batch = copyData.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${body.target_namespace_id}/bulk`,
            env,
            {
              method: 'PUT',
              body: JSON.stringify(batch),
              headers: { 'Content-Type': 'application/json' }
            }
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            processedCount += batch.length;
          } else {
            console.error('[Keys] Bulk copy failed:', await bulkResponse.text());
            errorCount += batch.length;
          }
        } catch (err) {
          console.error('[Keys] Batch copy error:', err);
          errorCount += batch.length;
        }
      }

      // Update job status
      if (db) {
        await db.prepare(`
          UPDATE bulk_jobs 
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP, processed_keys = ?, error_count = ?
          WHERE job_id = ?
        `).bind(processedCount, errorCount, jobId).run();
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: sourceNamespaceId,
        operation: 'bulk_copy',
        user_email: userEmail,
        details: JSON.stringify({ 
          target_namespace_id: body.target_namespace_id,
          total: body.keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId
        })
      });

      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'completed',
          total_keys: body.keys.length,
          processed_keys: processedCount,
          error_count: errorCount
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/keys/:namespaceId/bulk-ttl - Bulk update TTL
    const bulkTtlMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/bulk-ttl$/);
    if (bulkTtlMatch && request.method === 'POST') {
      const namespaceId = bulkTtlMatch[1];
      const body = await request.json() as { keys: string[]; expiration_ttl: number };

      if (!body.keys || !Array.isArray(body.keys) || typeof body.expiration_ttl !== 'number') {
        return new Response(JSON.stringify({ error: 'Missing keys array or expiration_ttl' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Keys] Bulk updating TTL for', body.keys.length, 'keys in namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
          result: {
            job_id: `ttl-${Date.now()}`,
            status: 'completed',
            total_keys: body.keys.length,
            processed_keys: body.keys.length,
            error_count: 0
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const jobId = `ttl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_ttl', 'running', ?, CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, body.keys.length, userEmail).run();
      }

      // Fetch current values and re-write with new TTL
      const updateData: Array<{ key: string; value: string; expiration_ttl: number }> = [];
      for (const keyName of body.keys) {
        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
            env
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            updateData.push({ 
              key: keyName, 
              value: value,
              expiration_ttl: body.expiration_ttl
            });
          }
        } catch (err) {
          console.error('[Keys] Failed to fetch key for TTL update:', keyName, err);
        }
      }

      // Write back with new TTL using bulk API
      let processedCount = 0;
      let errorCount = 0;
      const batchSize = 10000;

      for (let i = 0; i < updateData.length; i += batchSize) {
        const batch = updateData.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
            env,
            {
              method: 'PUT',
              body: JSON.stringify(batch),
              headers: { 'Content-Type': 'application/json' }
            }
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            processedCount += batch.length;
          } else {
            console.error('[Keys] Bulk TTL update failed:', await bulkResponse.text());
            errorCount += batch.length;
          }
        } catch (err) {
          console.error('[Keys] Batch TTL error:', err);
          errorCount += batch.length;
        }
      }

      // Update job status
      if (db) {
        await db.prepare(`
          UPDATE bulk_jobs 
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP, processed_keys = ?, error_count = ?
          WHERE job_id = ?
        `).bind(processedCount, errorCount, jobId).run();
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_ttl_update',
        user_email: userEmail,
        details: JSON.stringify({ 
          ttl: body.expiration_ttl,
          total: body.keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId
        })
      });

      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'completed',
          total_keys: body.keys.length,
          processed_keys: processedCount,
          error_count: errorCount
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
    console.error('[Keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

