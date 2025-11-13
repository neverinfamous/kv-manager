import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env, JobProgress, ImportParams, ExportParams } from '../types';
import { createCfApiRequest, getD1Binding, auditLog, logJobEvent } from '../utils/helpers';

interface SessionAttachment {
  sessionId: string;
}

/**
 * Durable Object for handling large import/export operations with WebSocket progress updates
 * Uses Hibernation API to minimize duration charges
 */
export class ImportExportDO {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, SessionAttachment>;
  private exportResults: Map<string, string>; // Store export results temporarily
  private cancelledJobs: Set<string>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.exportResults = new Map();
    this.cancelledJobs = new Set();
  }

  /**
   * Handle incoming requests (WebSocket upgrades and job initiation)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Job processing endpoints
    if (url.pathname.startsWith('/process/')) {
      const jobType = url.pathname.split('/')[2];
      console.log('[ImportExportDO] Received processing request for job type:', jobType);
      
      try {
        const contentType = request.headers.get('Content-Type');
        let body: unknown;
        
        if (contentType?.includes('application/json')) {
          body = await request.json();
          console.log('[ImportExportDO] Processing job with params:', JSON.stringify(body));
        } else {
          // For imports with raw data
          const text = await request.text();
          body = { data: text };
        }
        
        switch (jobType) {
          case 'import':
            console.log('[ImportExportDO] Starting import process');
            await this.processImport(body as ImportParams & { jobId: string });
            break;
          case 'export':
            console.log('[ImportExportDO] Starting export process');
            await this.processExport(body as ExportParams & { jobId: string });
            break;
          default:
            console.log('[ImportExportDO] Unknown job type:', jobType);
            return new Response(JSON.stringify({ error: 'Unknown job type' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[ImportExportDO] Processing error:', error);
        return new Response(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Download export result
    if (url.pathname.startsWith('/download/')) {
      const jobId = url.pathname.split('/')[2];
      const exportData = this.exportResults.get(jobId);
      
      if (!exportData) {
        return new Response(JSON.stringify({ error: 'Export data not found or expired' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Return the export data and clean up
      this.exportResults.delete(jobId);
      
      const format = exportData.startsWith('[') ? 'json' : 'ndjson';
      return new Response(exportData, {
        headers: {
          'Content-Type': format === 'ndjson' ? 'application/x-ndjson' : 'application/json',
          'Content-Disposition': `attachment; filename="export-${jobId}.${format}"`
        }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle WebSocket upgrade
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleWebSocketUpgrade(_request: Request): Response {
    // @ts-expect-error - WebSocketPair is available in Workers runtime
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Use Hibernation API
    // @ts-expect-error - WebSocket types differ between DOM and Workers runtime but are compatible
    this.state.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    // @ts-expect-error - WebSocket types differ between DOM and Workers runtime but are compatible
    this.sessions.set(server, { sessionId });

    console.log('[ImportExportDO] WebSocket connected:', sessionId);

    return new Response(null, {
      status: 101,
      // @ts-expect-error - webSocket property is available in Workers runtime
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages (Hibernation API)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    try {
      const data = typeof message === 'string' ? message : new TextDecoder().decode(message);
      console.log('[ImportExportDO] Received message:', data);
      
      const parsed = JSON.parse(data);
      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (parsed.type === 'cancel' && parsed.jobId) {
        // Handle cancellation request
        await this.cancelJob(parsed.jobId);
      }
    } catch (error) {
      console.error('[ImportExportDO] Message error:', error);
    }
  }

  /**
   * Handle WebSocket close (Hibernation API)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      console.log('[ImportExportDO] WebSocket closed:', session.sessionId, code, reason);
      this.sessions.delete(ws);
    }
    // Don't try to close an already closed WebSocket
    // Code 1005 is reserved and should never be sent explicitly
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
        // Use 1000 (normal closure) if we received a reserved code like 1005
        const closeCode = (code === 1005 || code === 1006) ? 1000 : code;
        ws.close(closeCode, 'Durable Object is closing WebSocket');
      }
    } catch (error) {
      console.error('[ImportExportDO] Error closing WebSocket:', error);
    }
  }

  /**
   * Handle WebSocket errors (Hibernation API)
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[ImportExportDO] WebSocket error:', error);
    this.sessions.delete(ws);
  }

  /**
   * Broadcast progress to all connected WebSocket clients
   */
  private broadcastProgress(progress: JobProgress): void {
    const message = JSON.stringify(progress);
    
    this.state.getWebSockets().forEach((ws) => {
      try {
        ws.send(message);
      } catch (error) {
        console.error('[ImportExportDO] Failed to send to client:', error);
      }
    });
  }

  /**
   * Update job status in D1
   */
  private async updateJobInDB(
    jobId: string, 
    updates: {
      status?: string;
      total_keys?: number;
      processed_keys?: number;
      error_count?: number;
      current_key?: string;
      percentage?: number;
    }
  ): Promise<void> {
    const db = getD1Binding(this.env);
    if (!db) return;

    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (updates.status !== undefined) {
        setClauses.push('status = ?');
        values.push(updates.status);
        if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
          setClauses.push('completed_at = CURRENT_TIMESTAMP');
        }
      }
      if (updates.total_keys !== undefined) {
        setClauses.push('total_keys = ?');
        values.push(updates.total_keys);
      }
      if (updates.processed_keys !== undefined) {
        setClauses.push('processed_keys = ?');
        values.push(updates.processed_keys);
      }
      if (updates.error_count !== undefined) {
        setClauses.push('error_count = ?');
        values.push(updates.error_count);
      }
      if (updates.current_key !== undefined) {
        setClauses.push('current_key = ?');
        values.push(updates.current_key);
      }
      if (updates.percentage !== undefined) {
        setClauses.push('percentage = ?');
        values.push(updates.percentage);
      }

      values.push(jobId);

      await db.prepare(`
        UPDATE bulk_jobs 
        SET ${setClauses.join(', ')}
        WHERE job_id = ?
      `).bind(...values).run();
    } catch (error) {
      console.error('[ImportExportDO] DB update error:', error);
    }
  }

  /**
   * Cancel a job
   */
  private async cancelJob(jobId: string): Promise<void> {
    console.log('[ImportExportDO] Cancelling job:', jobId);
    this.cancelledJobs.add(jobId);
    
    // Acknowledge cancellation request via WebSocket
    this.broadcastProgress({
      jobId,
      status: 'running',
      progress: { total: 0, processed: 0, errors: 0, percentage: 0 }
    });
  }

  /**
   * Handle job cancellation - update DB, log event, broadcast
   */
  private async handleCancellation(
    jobId: string,
    userEmail: string,
    processed: number,
    errors: number,
    total: number
  ): Promise<void> {
    const db = getD1Binding(this.env);
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    // Update job status to cancelled
    await this.updateJobInDB(jobId, {
      status: 'cancelled',
      processed_keys: processed,
      error_count: errors,
      percentage
    });

    // Log cancellation event
    await logJobEvent(db, {
      job_id: jobId,
      event_type: 'cancelled',
      user_email: userEmail,
      details: JSON.stringify({ processed, errors, percentage, total })
    });

    // Broadcast cancelled status
    this.broadcastProgress({
      jobId,
      status: 'cancelled',
      progress: {
        total,
        processed,
        errors,
        percentage
      }
    });

    // Clean up from cancelled jobs set
    this.cancelledJobs.delete(jobId);
  }

  /**
   * Process import operation
   */
  async processImport(params: ImportParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, importData, collision, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: importData.length, processed: 0, errors: 0, percentage: 0 }
      });

      // Log started event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'started',
        user_email: userEmail,
        details: JSON.stringify({ total: importData.length, collision })
      });

      let processedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let lastMilestone = 0;

      // Process imports in batches
      const batchSize = 100;
      
      for (let i = 0; i < importData.length; i += batchSize) {
        // Check for cancellation
        if (this.cancelledJobs.has(jobId)) {
          console.log('[ImportExportDO] Job cancelled during import:', jobId);
          await this.handleCancellation(jobId, userEmail, processedCount, errorCount, importData.length);
          return;
        }

        const batch = importData.slice(i, i + batchSize);

        for (const item of batch) {
          try {
            // Check if key exists for collision handling
            if (collision === 'skip' || collision === 'fail') {
              const checkRequest = createCfApiRequest(
                `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(item.name)}`,
                this.env
              );
              const checkResponse = await fetch(checkRequest);

              if (checkResponse.ok) {
                if (collision === 'skip') {
                  skippedCount++;
                  continue;
                } else if (collision === 'fail') {
                  throw new Error(`Key already exists: ${item.name}`);
                }
              }
            }

            // Build URL with optional expiration_ttl
            let url = `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(item.name)}`;
            if (item.expiration_ttl) {
              url += `?expiration_ttl=${item.expiration_ttl}`;
            }

            // Put key
            const putRequest = createCfApiRequest(
              url,
              this.env,
              {
                method: 'PUT',
                body: item.value,
                headers: { 
                  'Content-Type': 'text/plain',
                  ...(item.metadata ? { 'metadata': JSON.stringify(item.metadata) } : {})
                }
              }
            );

            const putResponse = await fetch(putRequest);

            if (putResponse.ok) {
              processedCount++;
            } else {
              console.error('[ImportExportDO] Failed to import key:', item.name, await putResponse.text());
              errorCount++;
            }
          } catch (err) {
            console.error('[ImportExportDO] Import error for key:', item.name, err);
            errorCount++;
            
            if (collision === 'fail') {
              // Stop processing on fail mode
              throw err;
            }
          }
        }

        // Broadcast progress after each batch
        const percentage = Math.round(((i + batch.length) / importData.length) * 100);
        await this.updateJobInDB(jobId, { 
          processed_keys: i + batch.length,
          error_count: errorCount,
          percentage
        });
        this.broadcastProgress({
          jobId,
          status: 'running',
          progress: { 
            total: importData.length, 
            processed: i + batch.length, 
            errors: errorCount,
            percentage 
          }
        });

        // Log milestone events
        const milestone = Math.floor(percentage / 25) * 25;
        if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
          await logJobEvent(db, {
            job_id: jobId,
            event_type: `progress_${milestone}` as 'progress_25' | 'progress_50' | 'progress_75',
            user_email: userEmail,
            details: JSON.stringify({ processed: i + batch.length, errors: errorCount, percentage })
          });
          lastMilestone = milestone;
        }
      }

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed',
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: importData.length, 
          processed: processedCount, 
          errors: errorCount,
          percentage: 100 
        },
        result: { 
          processed: processedCount, 
          errors: errorCount,
          skipped: skippedCount 
        }
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'completed',
        user_email: userEmail,
        details: JSON.stringify({ processed: processedCount, errors: errorCount, skipped: skippedCount, percentage: 100 })
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'import',
        user_email: userEmail,
        details: JSON.stringify({ 
          total: importData.length,
          processed: processedCount,
          errors: errorCount,
          skipped: skippedCount,
          collision,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[ImportExportDO] Import error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: importData.length, processed: 0, errors: importData.length, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'failed',
        user_email: userEmail,
        details: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
      });
    }
  }

  /**
   * Process export operation
   */
  async processExport(params: ExportParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, format, userEmail } = params;
    const db = getD1Binding(this.env);

    console.log('[ImportExportDO] Starting export processing for job:', jobId, 'namespace:', namespaceId, 'format:', format);

    try {
      console.log('[ImportExportDO] Updating job status to running:', jobId);
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 }
      });

      // Log started event
      console.log('[ImportExportDO] Logging started event for job:', jobId);
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'started',
        user_email: userEmail,
        details: JSON.stringify({ format })
      });

      // List all keys in namespace
      let allKeys: Array<{ name: string }> = [];
      let cursor: string | undefined;
      
      do {
        const params = new URLSearchParams();
        params.set('limit', '1000');
        if (cursor) params.set('cursor', cursor);

        const listRequest = createCfApiRequest(
          `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
          this.env
        );
        const listResponse = await fetch(listRequest);
        
        if (!listResponse.ok) {
          throw new Error(`Failed to list keys: ${listResponse.status}`);
        }

        const listData = await listResponse.json() as { 
          result: Array<{ name: string }>;
          result_info: { cursor?: string };
        };
        
        allKeys = allKeys.concat(listData.result || []);
        cursor = listData.result_info?.cursor;

        // Update progress for listing phase (first 10%)
        const percentage = Math.min(10, Math.round((allKeys.length / 10000) * 10));
        this.broadcastProgress({
          jobId,
          status: 'running',
          progress: { 
            total: allKeys.length, 
            processed: 0, 
            errors: 0,
            percentage 
          }
        });
      } while (cursor);

      console.log('[ImportExportDO] Found', allKeys.length, 'keys to export');

      // Update total count and status to running
      await this.updateJobInDB(jobId, { 
        status: 'running',
        total_keys: allKeys.length,
        processed_keys: 0, 
        error_count: 0, 
        percentage: 10 
      });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: allKeys.length, processed: 0, errors: 0, percentage: 10 }
      });

      // Fetch all key values
      const exportData: Array<{ name: string; value: string; metadata: Record<string, unknown> }> = [];
      let errorCount = 0;
      let lastMilestone = 0;

      for (let i = 0; i < allKeys.length; i++) {
        // Check for cancellation
        if (this.cancelledJobs.has(jobId)) {
          console.log('[ImportExportDO] Job cancelled during export:', jobId);
          await this.handleCancellation(jobId, userEmail, exportData.length, errorCount, allKeys.length);
          return;
        }

        const key = allKeys[i];
        
        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
            this.env
          );
          const valueResponse = await fetch(valueRequest);
          
          if (valueResponse.ok) {
            const value = await valueResponse.text();
            exportData.push({
              name: key.name,
              value: value,
              metadata: {}
            });
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error('[ImportExportDO] Failed to fetch key:', key.name, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === allKeys.length - 1) {
          // 10% for listing, 90% for fetching values
          const percentage = 10 + Math.round(((i + 1) / allKeys.length) * 90);
          await this.updateJobInDB(jobId, { 
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: key.name,
            percentage
          });
          this.broadcastProgress({
            jobId,
            status: 'running',
            progress: { 
              total: allKeys.length, 
              processed: i + 1, 
              errors: errorCount,
              currentKey: key.name,
              percentage 
            }
          });

          // Log milestone events
          const milestone = Math.floor(percentage / 25) * 25;
          if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
            await logJobEvent(db, {
              job_id: jobId,
              event_type: `progress_${milestone}` as 'progress_25' | 'progress_50' | 'progress_75',
              user_email: userEmail,
              details: JSON.stringify({ processed: i + 1, errors: errorCount, percentage })
            });
            lastMilestone = milestone;
          }
        }
      }

      // Format response data
      const responseBody = format === 'ndjson'
        ? exportData.map(item => JSON.stringify(item)).join('\n')
        : JSON.stringify(exportData, null, 2);

      // Store export result temporarily (will be cleaned up after download)
      this.exportResults.set(jobId, responseBody);

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed',
        processed_keys: exportData.length,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: allKeys.length, 
          processed: exportData.length, 
          errors: errorCount,
          percentage: 100 
        },
        result: { 
          processed: exportData.length, 
          errors: errorCount,
          downloadUrl: `/api/jobs/${jobId}/download`,
          format
        }
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'completed',
        user_email: userEmail,
        details: JSON.stringify({ processed: exportData.length, errors: errorCount, percentage: 100 })
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'export',
        user_email: userEmail,
        details: JSON.stringify({ 
          format,
          key_count: exportData.length,
          errors: errorCount,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[ImportExportDO] Export error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: 'failed',
        user_email: userEmail,
        details: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
      });
    }
  }
}
