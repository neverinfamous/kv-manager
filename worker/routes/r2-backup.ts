import type { Env, APIResponse, R2BackupListItem } from "../types";
import { getD1Binding } from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleR2BackupRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // POST /api/r2-backup/batch - Start batch backup to R2 (CHECK BEFORE SINGLE ENDPOINT!)
    if (url.pathname === "/api/r2-backup/batch" && request.method === "POST") {
      const body = (await request.json()) as { namespace_ids: string[] };
      const namespaceIds = body.namespace_ids;
      const format = url.searchParams.get("format") || "json";

      if (
        !namespaceIds ||
        !Array.isArray(namespaceIds) ||
        namespaceIds.length === 0
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid request: namespace_ids must be a non-empty array",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      logInfo(
        "Starting batch backup",
        createErrorContext("r2_backup", "batch_backup", {
          metadata: { namespaceCount: namespaceIds.length, format },
        }),
      );

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-batch-backup-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: "queued",
            ws_url: `/api/jobs/${jobId}/ws`,
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Create job ID
      const jobId = `r2-batch-backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry - use first namespace ID as primary, store all in metadata
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email, metadata)
          VALUES (?, ?, 'batch_r2_backup', 'queued', ?, CURRENT_TIMESTAMP, ?, ?)
        `,
          )
          .bind(
            jobId,
            namespaceIds[0],
            namespaceIds.length,
            userEmail,
            JSON.stringify({ namespace_ids: namespaceIds }),
          )
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Start processing in DO
      const doRequest = new Request(`https://do/process/batch-r2-backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceIds,
          format: format as "json" | "ndjson",
          userEmail,
        }),
      });

      logInfo(
        "Starting batch backup processing in DO",
        createErrorContext("r2_backup", "batch_backup", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Batch backup DO processing initiated",
        createErrorContext("r2_backup", "batch_backup", {
          metadata: { jobId, responseStatus: doResponse.status },
        }),
      );

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: "queued",
          ws_url: `/api/jobs/${jobId}/ws`,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/r2-restore/batch - Start batch restore from R2 (CHECK BEFORE SINGLE ENDPOINT!)
    if (url.pathname === "/api/r2-restore/batch" && request.method === "POST") {
      const body = (await request.json()) as {
        restore_map: Record<string, string>;
      };
      const restoreMap = body.restore_map;

      if (
        !restoreMap ||
        typeof restoreMap !== "object" ||
        Object.keys(restoreMap).length === 0
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid request: restore_map must be a non-empty object",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const namespaceIds = Object.keys(restoreMap);

      logInfo(
        "Starting batch restore",
        createErrorContext("r2_restore", "batch_restore", {
          metadata: { namespaceCount: namespaceIds.length },
        }),
      );

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-batch-restore-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: "queued",
            ws_url: `/api/jobs/${jobId}/ws`,
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Verify all backups exist
      for (const [nsId, backupPath] of Object.entries(restoreMap)) {
        const backupObject = await env.BACKUP_BUCKET.head(backupPath);
        if (!backupObject) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Backup not found for namespace ${nsId}: ${backupPath}`,
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      }

      // Create job ID
      const jobId = `r2-batch-restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email, metadata)
          VALUES (?, ?, 'batch_r2_restore', 'queued', ?, CURRENT_TIMESTAMP, ?, ?)
        `,
          )
          .bind(
            jobId,
            namespaceIds[0],
            namespaceIds.length,
            userEmail,
            JSON.stringify({ restore_map: restoreMap }),
          )
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Start processing in DO
      const doRequest = new Request(`https://do/process/batch-r2-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          restoreMap,
          userEmail,
        }),
      });

      logInfo(
        "Starting batch restore processing in DO",
        createErrorContext("r2_restore", "batch_restore", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Batch restore DO processing initiated",
        createErrorContext("r2_restore", "batch_restore", {
          metadata: { jobId, responseStatus: doResponse.status },
        }),
      );

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: "queued",
          ws_url: `/api/jobs/${jobId}/ws`,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET /api/r2-backup/:namespaceId/list - List available backups
    const listMatch = url.pathname.match(/^\/api\/r2-backup\/([^/]+)\/list$/);
    if (listMatch && request.method === "GET") {
      const namespaceId = listMatch[1];

      logInfo(
        "Listing backups for namespace",
        createErrorContext("r2_backup", "list_backups", {
          ...(namespaceId && { namespaceId }),
        }),
      );

      if (isLocalDev || !env.BACKUP_BUCKET) {
        // Return mock backups for local dev
        const response: APIResponse<R2BackupListItem[]> = {
          success: true,
          result: [
            {
              path: `backups/${namespaceId}/1234567890.json`,
              timestamp: Date.now() - 86400000,
              size: 1024,
              uploaded: new Date(Date.now() - 86400000).toISOString(),
            },
            {
              path: `backups/${namespaceId}/1234567800.json`,
              timestamp: Date.now() - 172800000,
              size: 2048,
              uploaded: new Date(Date.now() - 172800000).toISOString(),
            },
          ],
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // List backups from R2
      const prefix = `backups/${namespaceId}/`;
      const listed = await env.BACKUP_BUCKET.list({ prefix });

      const backups: R2BackupListItem[] = listed.objects.map((obj) => {
        // Extract timestamp from filename (format: backups/ns-id/timestamp.json)
        const filename = obj.key.split("/").pop() || "";
        const timestamp =
          parseInt(filename.replace(".json", "").replace(".ndjson", "")) || 0;

        return {
          path: obj.key,
          timestamp,
          size: obj.size,
          uploaded: obj.uploaded.toISOString(),
        };
      });

      // Sort by timestamp descending (newest first)
      backups.sort((a, b) => b.timestamp - a.timestamp);

      const response: APIResponse<R2BackupListItem[]> = {
        success: true,
        result: backups,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/r2-backup/:namespaceId - Start backup to R2
    const backupMatch = url.pathname.match(/^\/api\/r2-backup\/([^/]+)$/);
    if (backupMatch && request.method === "POST") {
      const namespaceId = backupMatch[1];
      const format = url.searchParams.get("format") || "json";

      logInfo(
        "Starting backup for namespace",
        createErrorContext("r2_backup", "start_backup", {
          ...(namespaceId && { namespaceId }),
          metadata: { format },
        }),
      );

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-backup-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: "queued",
            ws_url: `/api/jobs/${jobId}/ws`,
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Create job ID for tracking
      const jobId = `r2-backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'r2_backup', 'queued', CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, namespaceId, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/r2-backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceId,
          format: format as "json" | "ndjson",
          userEmail,
        }),
      });

      logInfo(
        "Starting async processing in DO",
        createErrorContext("r2_backup", "start_backup", {
          metadata: { jobId },
        }),
      );

      // Start processing - await to ensure the request is actually sent
      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "DO processing initiated",
        createErrorContext("r2_backup", "start_backup", {
          metadata: { jobId, responseStatus: doResponse.status },
        }),
      );

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: "queued",
          ws_url: `/api/jobs/${jobId}/ws`,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/r2-restore/:namespaceId - Start restore from R2
    const restoreMatch = url.pathname.match(/^\/api\/r2-restore\/([^/]+)$/);
    if (restoreMatch && request.method === "POST") {
      const namespaceId = restoreMatch[1];
      const body = (await request.json()) as { backupPath: string };
      const backupPath = body.backupPath;

      logInfo(
        "Starting restore for namespace",
        createErrorContext("r2_restore", "start_restore", {
          ...(namespaceId && { namespaceId }),
          metadata: { backupPath },
        }),
      );

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-restore-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: "queued",
            ws_url: `/api/jobs/${jobId}/ws`,
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Verify backup exists
      const backupObject = await env.BACKUP_BUCKET.head(backupPath);
      if (!backupObject) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Backup not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // Create job ID
      const jobId = `r2-restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'r2_restore', 'queued', CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, namespaceId, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Start processing in DO
      const doRequest = new Request(`https://do/process/r2-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceId,
          backupPath,
          userEmail,
        }),
      });

      logInfo(
        "Starting async processing in DO",
        createErrorContext("r2_restore", "start_restore", {
          metadata: { jobId },
        }),
      );

      // Await to ensure the request is actually sent
      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "DO processing initiated",
        createErrorContext("r2_restore", "start_restore", {
          metadata: { jobId, responseStatus: doResponse.status },
        }),
      );

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: "queued",
          ws_url: `/api/jobs/${jobId}/ws`,
        },
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
      createErrorContext("r2_backup", "handle_request"),
      isLocalDev,
    );
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}
