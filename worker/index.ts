import type { Env } from "./types";
import { validateAccessJWT } from "./utils/auth";
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  isLocalDevelopment,
} from "./utils/cors";
import { logInfo, logError, createErrorContext } from "./utils/error-logger";
import { handleNamespaceRoutes } from "./routes/namespaces";
import { handleKeyRoutes } from "./routes/keys";
import { handleMetadataRoutes } from "./routes/metadata";
import { handleSearchRoutes } from "./routes/search";
import { handleBackupRoutes } from "./routes/backup";
import { handleImportExportRoutes } from "./routes/import-export";
import { handleAuditRoutes } from "./routes/audit";
import { handleAdminRoutes } from "./routes/admin";
import { handleR2BackupRoutes } from "./routes/r2-backup";
import { handleMetricsRoutes } from "./routes/metrics";
import { handleMigrationRoutes } from "./routes/migrations";
import { handleColorRoutes } from "./routes/colors";
import { handleWebhookRoutes } from "./routes/webhooks";
import { handleHealthRoutes } from "./routes/health";
import { handleMigrateRoutes } from "./routes/migrate";

/**
 * Main request handler
 */
async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  logInfo(
    `[Request] ${request.method} ${url.pathname}`,
    createErrorContext("worker", "handle_request", {
      metadata: { method: request.method, pathname: url.pathname },
    }),
  );

  // Handle CORS
  const corsHeaders = getCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return handleCorsPreflightRequest(corsHeaders);
  }

  // If not an API request, serve static assets
  if (!url.pathname.startsWith("/api/")) {
    // ASSETS binding expects different Request type from standard fetch
    return env.ASSETS.fetch(request) as unknown as Response;
  }

  // Authentication
  const isLocalhost = isLocalDevelopment(request);
  let userEmail: string | null;

  if (isLocalhost) {
    logInfo(
      "Localhost detected, skipping JWT validation",
      createErrorContext("auth", "check_auth"),
    );
    userEmail = "dev@localhost";
  } else {
    userEmail = await validateAccessJWT(request, env);
    if (!userEmail) {
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });
    }
  }

  // Check if we're in local dev mode (no credentials)
  const isLocalDev = isLocalhost && (!env.ACCOUNT_ID || !env.API_KEY);

  // Route API requests
  // Handle namespace colors first (more specific route)
  const colorResponse = await handleColorRoutes(
    request,
    env,
    url,
    corsHeaders,
    isLocalDev,
    userEmail,
  );
  if (colorResponse) return colorResponse;

  if (url.pathname.startsWith("/api/namespaces")) {
    return await handleNamespaceRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/keys")) {
    return await handleKeyRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/metadata")) {
    return await handleMetadataRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/search")) {
    return await handleSearchRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/health")) {
    return await handleHealthRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/metrics")) {
    return await handleMetricsRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/backup")) {
    return await handleBackupRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  // Download endpoint for export results
  const downloadMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/download$/);
  if (downloadMatch && request.method === "GET") {
    const jobId = downloadMatch[1];
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Invalid job ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    logInfo(
      "Download request for job",
      createErrorContext("worker", "download", {
        metadata: { jobId },
      }),
    );

    const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
    const stub = env.IMPORT_EXPORT_DO.get(id);

    // Forward to DO's download endpoint
    const doUrl = new URL(request.url);
    doUrl.pathname = `/download/${jobId}`;
    const doRequest = new Request(doUrl.toString(), request);

    return await stub.fetch(doRequest);
  }

  if (
    url.pathname.startsWith("/api/export") ||
    url.pathname.startsWith("/api/import") ||
    url.pathname.startsWith("/api/jobs")
  ) {
    return await handleImportExportRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (
    url.pathname.startsWith("/api/r2-backup") ||
    url.pathname.startsWith("/api/r2-restore")
  ) {
    return await handleR2BackupRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/audit")) {
    return await handleAuditRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/admin")) {
    return await handleAdminRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
  }

  if (url.pathname.startsWith("/api/migrations")) {
    const migrationResponse = await handleMigrationRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
    if (migrationResponse) return migrationResponse;
  }

  if (url.pathname.startsWith("/api/webhooks")) {
    const webhookResponse = await handleWebhookRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
    if (webhookResponse) return webhookResponse;
  }

  if (url.pathname.startsWith("/api/migrate")) {
    const migrateResponse = await handleMigrateRoutes(
      request,
      env,
      url,
      corsHeaders,
      isLocalDev,
      userEmail,
    );
    if (migrateResponse) return migrateResponse;
  }

  // 404 for unknown API routes
  return new Response(
    JSON.stringify({
      error: "Not Found",
      message: `Route ${url.pathname} not found`,
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
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
      await logError(
        env,
        err instanceof Error ? err : String(err),
        createErrorContext("worker", "unhandled_error"),
        isLocalDevelopment(request),
      );
      const corsHeaders = getCorsHeaders(request);
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: "An unexpected error occurred. Please try again later.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }
  },
};

/**
 * Durable Object Exports
 */
export { BulkOperationDO } from "./durable-objects/BulkOperationDO";
export { ImportExportDO } from "./durable-objects/ImportExportDO";
