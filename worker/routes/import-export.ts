import type { Env, APIResponse } from '../types';
import { getD1Binding } from '../utils/helpers';

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
        const jobId = `export-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: 'queued',
            ws_url: `/api/jobs/${jobId}/ws`
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create job ID for tracking
      const jobId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'export', 'queued', CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, userEmail).run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          namespaceId,
          format: format as 'json' | 'ndjson',
          userEmail
        })
      });

      // Don't await - let it process in background
      // @ts-expect-error - Request types are compatible at runtime
      stub.fetch(doRequest).catch(err => {
        console.error('[Export] DO processing error:', err);
      });

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'queued',
          ws_url: `/api/jobs/${jobId}/ws`
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
        const jobId = `import-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: 'queued',
            ws_url: `/api/jobs/${jobId}/ws`
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
          VALUES (?, ?, 'import', 'queued', ?, CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, importData.length, userEmail).run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          namespaceId,
          importData,
          collision: collisionHandling as 'skip' | 'overwrite' | 'fail',
          userEmail
        })
      });

      // Don't await - let it process in background
      // @ts-expect-error - Request types are compatible at runtime
      stub.fetch(doRequest).catch(err => {
        console.error('[Import] DO processing error:', err);
      });

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'queued',
          ws_url: `/api/jobs/${jobId}/ws`,
          total_keys: importData.length
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET /api/jobs - Get list of user's jobs
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      console.log('[Jobs] Getting job list for user:', userEmail);

      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      const operationType = url.searchParams.get('operation_type');

      if (isLocalDev || !db) {
        // Return mock jobs for local dev
        const response: APIResponse = {
          success: true,
          result: {
            jobs: [
              {
                job_id: 'export-123',
                namespace_id: 'test-namespace',
                operation_type: 'export',
                status: 'completed',
                total_keys: 1000,
                processed_keys: 1000,
                error_count: 0,
                percentage: 100,
                started_at: new Date(Date.now() - 3600000).toISOString(),
                completed_at: new Date().toISOString(),
                user_email: 'dev@localhost'
              },
              {
                job_id: 'import-456',
                namespace_id: 'test-namespace',
                operation_type: 'import',
                status: 'failed',
                total_keys: 500,
                processed_keys: 250,
                error_count: 10,
                percentage: 50,
                started_at: new Date(Date.now() - 7200000).toISOString(),
                completed_at: new Date(Date.now() - 7000000).toISOString(),
                user_email: 'dev@localhost'
              }
            ],
            total: 2,
            limit,
            offset
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build query with filters
      let query = 'SELECT * FROM bulk_jobs WHERE user_email = ?';
      const bindings: (string | number)[] = [userEmail];

      if (status) {
        query += ' AND status = ?';
        bindings.push(status);
      }

      if (operationType) {
        query += ' AND operation_type = ?';
        bindings.push(operationType);
      }

      query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
      bindings.push(limit, offset);

      const jobs = await db.prepare(query).bind(...bindings).all();

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM bulk_jobs WHERE user_email = ?';
      const countBindings: (string | number)[] = [userEmail];

      if (status) {
        countQuery += ' AND status = ?';
        countBindings.push(status);
      }

      if (operationType) {
        countQuery += ' AND operation_type = ?';
        countBindings.push(operationType);
      }

      const countResult = await db.prepare(countQuery).bind(...countBindings).first();
      const total = (countResult?.total as number) || 0;

      const response: APIResponse = {
        success: true,
        result: {
          jobs: jobs.results || [],
          total,
          limit,
          offset
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

    // GET /api/jobs/:jobId/events - Get job audit events
    const eventsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
    if (eventsMatch && request.method === 'GET') {
      const jobId = eventsMatch[1];

      console.log('[Jobs] Getting events for job:', jobId);

      if (!db) {
        return new Response(JSON.stringify({ error: 'Database not available' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (isLocalDev) {
        // Return mock events for local dev
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            events: [
              {
                id: 1,
                job_id: jobId,
                event_type: 'started',
                user_email: 'dev@localhost',
                timestamp: new Date().toISOString(),
                details: JSON.stringify({ total: 100 })
              },
              {
                id: 2,
                job_id: jobId,
                event_type: 'completed',
                user_email: 'dev@localhost',
                timestamp: new Date().toISOString(),
                details: JSON.stringify({ processed: 100, errors: 0, percentage: 100 })
              }
            ]
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // First, get the job to check ownership
      const job = await db.prepare(
        'SELECT user_email FROM bulk_jobs WHERE job_id = ?'
      ).bind(jobId).first();

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Verify user owns this job
      if (job.user_email !== userEmail) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Fetch all events for this job
      const events = await db.prepare(
        'SELECT * FROM job_audit_events WHERE job_id = ? ORDER BY timestamp ASC'
      ).bind(jobId).all();

      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          events: events.results || []
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

