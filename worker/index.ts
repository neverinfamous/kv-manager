import type { Env } from './types';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { validateAccessJWT } from './utils/auth';
import { getCorsHeaders, handleCorsPreflightRequest, isLocalDevelopment } from './utils/cors';
import { handleNamespaceRoutes } from './routes/namespaces';
import { handleKeyRoutes } from './routes/keys';
import { handleMetadataRoutes } from './routes/metadata';
import { handleSearchRoutes } from './routes/search';
import { handleBackupRoutes } from './routes/backup';
import { handleImportExportRoutes } from './routes/import-export';
import { handleAuditRoutes } from './routes/audit';
import { handleAdminRoutes } from './routes/admin';

/**
 * Main request handler
 */
async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  console.log('[Request]', request.method, url.pathname);

  // Handle CORS
  const corsHeaders = getCorsHeaders(request);
  if (request.method === 'OPTIONS') {
    return handleCorsPreflightRequest(corsHeaders);
  }

  // If not an API request, serve static assets
  if (!url.pathname.startsWith('/api/')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return env.ASSETS.fetch(request as any) as any;
  }

  // Authentication
  const isLocalhost = isLocalDevelopment(request);
  let userEmail: string | null = null;

  if (isLocalhost) {
    console.log('[Auth] Localhost detected, skipping JWT validation');
    userEmail = 'dev@localhost';
  } else {
    userEmail = await validateAccessJWT(request, env);
    if (!userEmail) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
  }

  // Check if we're in local dev mode (no credentials)
  const isLocalDev = isLocalhost && (!env.ACCOUNT_ID || !env.API_KEY);

  // Route API requests
  if (url.pathname.startsWith('/api/namespaces')) {
    return await handleNamespaceRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/keys')) {
    return await handleKeyRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/metadata')) {
    return await handleMetadataRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/search')) {
    return await handleSearchRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/backup')) {
    return await handleBackupRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  // WebSocket endpoint for job progress
  const wsJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/ws$/);
  if (wsJobMatch && request.headers.get('Upgrade') === 'websocket') {
    const jobId = wsJobMatch[1];
    console.log('[Worker] WebSocket upgrade request for job:', jobId);
    
    // Determine which DO to use based on job type
    const jobType = jobId.split('-')[0]; // e.g., "copy", "import", "export", etc.
    
    let doNamespace: DurableObjectNamespace;
    if (jobType === 'import' || jobType === 'export') {
      doNamespace = env.IMPORT_EXPORT_DO;
    } else {
      doNamespace = env.BULK_OPERATION_DO;
    }
    
    // Get Durable Object stub using job ID
    const id = doNamespace.idFromName(jobId);
    const stub = doNamespace.get(id);
    
    // Forward the WebSocket upgrade request to the DO
    // @ts-expect-error - Request types are compatible at runtime
    return await stub.fetch(request);
  }

  // Download endpoint for export results
  const downloadMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/download$/);
  if (downloadMatch && request.method === 'GET') {
    const jobId = downloadMatch[1];
    console.log('[Worker] Download request for job:', jobId);
    
    const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
    const stub = env.IMPORT_EXPORT_DO.get(id);
    
    // Forward to DO's download endpoint
    const doUrl = new URL(request.url);
    doUrl.pathname = `/download/${jobId}`;
    const doRequest = new Request(doUrl.toString(), request);
    
    // @ts-expect-error - Request types are compatible at runtime
    return await stub.fetch(doRequest);
  }

  if (url.pathname.startsWith('/api/export') || url.pathname.startsWith('/api/import') || url.pathname.startsWith('/api/jobs')) {
    return await handleImportExportRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/audit')) {
    return await handleAuditRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  if (url.pathname.startsWith('/api/admin')) {
    return await handleAdminRoutes(request, env, url, corsHeaders, isLocalDev, userEmail);
  }

  // 404 for unknown API routes
  return new Response(
    JSON.stringify({ error: 'Not Found', message: `Route ${url.pathname} not found` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    }
  );
}

/**
 * Cloudflare Worker Entry Point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleApiRequest(request, env);
    } catch (err) {
      console.error('[Worker] Unhandled error:', err);
      const corsHeaders = getCorsHeaders(request);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred. Please try again later.'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }
  }
};

/**
 * Durable Object Exports
 */
export { BulkOperationDO } from './durable-objects/BulkOperationDO';
export { ImportExportDO } from './durable-objects/ImportExportDO';

