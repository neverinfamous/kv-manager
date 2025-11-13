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
      const namespaceId = url.searchParams.get('namespace_id');
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      const jobId = url.searchParams.get('job_id');
      const minErrors = url.searchParams.get('min_errors');
      const sortBy = url.searchParams.get('sort_by') || 'started_at';
      const sortOrder = url.searchParams.get('sort_order') || 'desc';

      if (isLocalDev || !db) {
        // Return mock jobs for local dev with varied data
        const response: APIResponse = {
          success: true,
          result: {
            jobs: [
              {
                job_id: 'export-123-abc',
                namespace_id: 'test-namespace-1',
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
                job_id: 'import-456-def',
                namespace_id: 'test-namespace-2',
                operation_type: 'import',
                status: 'failed',
                total_keys: 500,
                processed_keys: 250,
                error_count: 10,
                percentage: 50,
                started_at: new Date(Date.now() - 7200000).toISOString(),
                completed_at: new Date(Date.now() - 7000000).toISOString(),
                user_email: 'dev@localhost'
              },
              {
                job_id: 'bulk-copy-789-ghi',
                namespace_id: 'test-namespace-1',
                operation_type: 'bulk_copy',
                status: 'completed',
                total_keys: 2500,
                processed_keys: 2500,
                error_count: 5,
                percentage: 100,
                started_at: new Date(Date.now() - 86400000).toISOString(),
                completed_at: new Date(Date.now() - 86300000).toISOString(),
                user_email: 'dev@localhost'
              },
              {
                job_id: 'bulk-delete-999-jkl',
                namespace_id: 'test-namespace-3',
                operation_type: 'bulk_delete',
                status: 'completed',
                total_keys: 150,
                processed_keys: 150,
                error_count: 0,
                percentage: 100,
                started_at: new Date(Date.now() - 172800000).toISOString(),
                completed_at: new Date(Date.now() - 172700000).toISOString(),
                user_email: 'dev@localhost'
              }
            ],
            total: 4,
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

      if (namespaceId) {
        query += ' AND namespace_id = ?';
        bindings.push(namespaceId);
      }

      if (startDate) {
        query += ' AND started_at >= ?';
        bindings.push(startDate);
      }

      if (endDate) {
        query += ' AND started_at <= ?';
        bindings.push(endDate);
      }

      if (jobId) {
        query += ' AND job_id LIKE ?';
        bindings.push(`%${jobId}%`);
      }

      if (minErrors) {
        const minErrorsNum = parseInt(minErrors);
        if (!isNaN(minErrorsNum)) {
          query += ' AND error_count >= ?';
          bindings.push(minErrorsNum);
        }
      }

      // Validate sort column to prevent SQL injection
      const validSortColumns = ['started_at', 'completed_at', 'total_keys', 'error_count', 'percentage'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'started_at';
      const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      query += ` ORDER BY ${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;
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

      if (namespaceId) {
        countQuery += ' AND namespace_id = ?';
        countBindings.push(namespaceId);
      }

      if (startDate) {
        countQuery += ' AND started_at >= ?';
        countBindings.push(startDate);
      }

      if (endDate) {
        countQuery += ' AND started_at <= ?';
        countBindings.push(endDate);
      }

      if (jobId) {
        countQuery += ' AND job_id LIKE ?';
        countBindings.push(`%${jobId}%`);
      }

      if (minErrors) {
        const minErrorsNum = parseInt(minErrors);
        if (!isNaN(minErrorsNum)) {
          countQuery += ' AND error_count >= ?';
          countBindings.push(minErrorsNum);
        }
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

      try {
        // Fetch all events for this job
        console.log('[Jobs] Fetching events for job:', jobId);
        const events = await db.prepare(
          'SELECT * FROM job_audit_events WHERE job_id = ? ORDER BY timestamp ASC'
        ).bind(jobId).all<{ id: number; job_id: string; event_type: string; user_email: string; timestamp: string; details: string | null }>();

        console.log('[Jobs] Found', events.results?.length || 0, 'events');

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
      } catch (dbError) {
        console.error('[Jobs] Database error while fetching job events:', dbError);
        const errorMessage = dbError instanceof Error ? dbError.message : 'Database query failed';
        return new Response(JSON.stringify({ 
          error: 'Database error',
          message: errorMessage
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('[ImportExport] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[ImportExport] Error stack:', errorStack);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        message: isLocalDev ? errorMessage : undefined,
        stack: isLocalDev ? errorStack : undefined
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

