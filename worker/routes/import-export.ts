import type { Env, APIResponse } from '../types';
import { getD1Binding, createCfApiRequest, auditLog } from '../utils/helpers';

export async function handleImportExportRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/export/:namespaceId - Export namespace
    const exportMatch = url.pathname.match(/^\/api\/export\/([^/]+)$/);
    if (exportMatch && request.method === 'GET') {
      const namespaceId = exportMatch[1];
      const format = url.searchParams.get('format') || 'json';

      console.log('[Export] Exporting namespace:', namespaceId, 'format:', format);

      if (isLocalDev) {
        // Return mock export data
        const mockData = [
          { name: 'test-key-1', value: 'value1', metadata: { mock: true } },
          { name: 'test-key-2', value: 'value2', metadata: {} }
        ];

        const responseBody = format === 'ndjson'
          ? mockData.map(item => JSON.stringify(item)).join('\n')
          : JSON.stringify(mockData);

        return new Response(responseBody, {
          headers: {
            'Content-Type': format === 'ndjson' ? 'application/x-ndjson' : 'application/json',
            'Content-Disposition': `attachment; filename="${namespaceId}-export.${format === 'ndjson' ? 'ndjson' : 'json'}"`,
            ...corsHeaders
          }
        });
      }

      // Create job ID for tracking
      const jobId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'export', 'running', CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, userEmail).run();
      }

      // List all keys in namespace
      const listRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`,
        env
      );
      const listResponse = await fetch(listRequest);
      
      if (!listResponse.ok) {
        throw new Error(`Failed to list keys: ${listResponse.status}`);
      }

      const listData = await listResponse.json() as { result: Array<{ name: string }> };
      const keys = listData.result || [];

      // Fetch all key values
      const exportData: Array<{ name: string; value: string; metadata: Record<string, unknown> }> = [];
      for (const key of keys) {
        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
            env
          );
          const valueResponse = await fetch(valueRequest);
          
          if (valueResponse.ok) {
            const value = await valueResponse.text();
            exportData.push({
              name: key.name,
              value: value,
              metadata: {}
            });
          }
        } catch (err) {
          console.error('[Export] Failed to fetch key:', key.name, err);
        }
      }

      // Update job status
      if (db) {
        await db.prepare(`
          UPDATE bulk_jobs 
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP, total_keys = ?, processed_keys = ?
          WHERE job_id = ?
        `).bind(exportData.length, exportData.length, jobId).run();
      }

      // Format response
      const responseBody = format === 'ndjson'
        ? exportData.map(item => JSON.stringify(item)).join('\n')
        : JSON.stringify(exportData, null, 2);

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'export',
        user_email: userEmail,
        details: JSON.stringify({ format, key_count: exportData.length, job_id: jobId })
      });

      return new Response(responseBody, {
        headers: {
          'Content-Type': format === 'ndjson' ? 'application/x-ndjson' : 'application/json',
          'Content-Disposition': `attachment; filename="${namespaceId}-export.${format === 'ndjson' ? 'ndjson' : 'json'}"`,
          ...corsHeaders
        }
      });
    }

    // POST /api/import/:namespaceId - Import keys
    const importMatch = url.pathname.match(/^\/api\/import\/([^/]+)$/);
    if (importMatch && request.method === 'POST') {
      const namespaceId = importMatch[1];
      const body = await request.text();
      const collisionHandling = url.searchParams.get('collision') || 'overwrite';

      console.log('[Import] Importing to namespace:', namespaceId, 'collision:', collisionHandling);

      // Parse import data (auto-detect JSON vs NDJSON)
      let importData: Array<{ name: string; value: string; metadata?: Record<string, unknown>; expiration_ttl?: number }>;
      
      try {
        // Try JSON array first
        importData = JSON.parse(body);
        if (!Array.isArray(importData)) {
          throw new Error('Expected array');
        }
      } catch {
        // Try NDJSON
        importData = body.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      }

      console.log('[Import] Parsed', importData.length, 'items');

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
          result: {
            job_id: `mock-job-${Date.now()}`,
            status: 'completed',
            total_keys: importData.length,
            processed_keys: importData.length,
            error_count: 0
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create job ID
      const jobId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'import', 'running', ?, CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, importData.length, userEmail).run();
      }

      // Process in batches of 10,000 (Cloudflare API limit)
      let processedCount = 0;
      let errorCount = 0;
      const batchSize = 10000;

      for (let i = 0; i < importData.length; i += batchSize) {
        const batch = importData.slice(i, i + batchSize);
        
        // Prepare bulk write format: array of objects with key, value, metadata, expiration_ttl
        const bulkData = batch.map(item => {
          const entry: { key: string; value: string; metadata?: Record<string, unknown>; expiration_ttl?: number } = {
            key: item.name,
            value: item.value
          };
          if (item.metadata) entry.metadata = item.metadata;
          if (item.expiration_ttl) entry.expiration_ttl = item.expiration_ttl;
          return entry;
        });

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
            env,
            {
              method: 'PUT',
              body: JSON.stringify(bulkData),
              headers: { 'Content-Type': 'application/json' }
            }
          );

          const bulkResponse = await fetch(bulkRequest);
          
          if (bulkResponse.ok) {
            processedCount += batch.length;
          } else {
            console.error('[Import] Bulk write failed:', await bulkResponse.text());
            errorCount += batch.length;
          }
        } catch (err) {
          console.error('[Import] Batch error:', err);
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

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'import',
        user_email: userEmail,
        details: JSON.stringify({ 
          total: importData.length, 
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
          total_keys: importData.length,
          processed_keys: processedCount,
          error_count: errorCount
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET /api/jobs/:jobId - Get job status
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && request.method === 'GET') {
      const jobId = jobMatch[1];

      console.log('[Jobs] Getting status for job:', jobId);

      if (isLocalDev || !db) {
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: 'completed',
            total_keys: 100,
            processed_keys: 100,
            error_count: 0,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const job = await db.prepare(
        'SELECT * FROM bulk_jobs WHERE job_id = ?'
      ).bind(jobId).first();

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

    const response: APIResponse = {
      success: true,
        result: job
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
    console.error('[ImportExport] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

