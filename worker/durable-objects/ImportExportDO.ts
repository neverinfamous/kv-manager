import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  Env,
  JobProgress,
  ImportParams,
  ExportParams,
  R2BackupParams,
  R2RestoreParams,
  BatchR2BackupParams,
  BatchR2RestoreParams,
} from "../types";
import {
  createCfApiRequest,
  getD1Binding,
  auditLog,
  logJobEvent,
} from "../utils/helpers";
import {
  logInfo,
  logWarning,
  logError,
  createErrorContext,
} from "../utils/error-logger";

/**
 * Durable Object for handling large import/export operations
 */
export class ImportExportDO {
  private env: Env;
  private exportResults: Map<string, string>; // Store export results temporarily

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
    this.exportResults = new Map();
  }

  /**
   * Handle incoming requests for job processing and downloads
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Job processing endpoints
    if (url.pathname.startsWith("/process/")) {
      const jobType = url.pathname.split("/")[2];
      logInfo(
        `Received processing request for job type: ${jobType}`,
        createErrorContext("import_export_do", "fetch", {
          metadata: { jobType },
        }),
      );

      try {
        const contentType = request.headers.get("Content-Type");
        let body: unknown;

        if (contentType?.includes("application/json")) {
          body = await request.json();
          logInfo(
            "Processing job with params",
            createErrorContext("import_export_do", "fetch", {
              metadata: { params: body },
            }),
          );
        } else {
          // For imports with raw data
          const text = await request.text();
          body = { data: text };
        }

        switch (jobType) {
          case "import":
            logInfo(
              "Starting import process",
              createErrorContext("import_export_do", "process_import"),
            );
            await this.processImport(body as ImportParams & { jobId: string });
            break;
          case "export":
            logInfo(
              "Starting export process",
              createErrorContext("import_export_do", "process_export"),
            );
            await this.processExport(body as ExportParams & { jobId: string });
            break;
          case "r2-backup":
            logInfo(
              "Starting R2 backup process",
              createErrorContext("import_export_do", "process_r2_backup"),
            );
            await this.processR2Backup(
              body as R2BackupParams & { jobId: string },
            );
            break;
          case "r2-restore":
            logInfo(
              "Starting R2 restore process",
              createErrorContext("import_export_do", "process_r2_restore"),
            );
            await this.processR2Restore(
              body as R2RestoreParams & { jobId: string },
            );
            break;
          case "batch-r2-backup":
            logInfo(
              "Starting batch R2 backup process",
              createErrorContext("import_export_do", "process_batch_r2_backup"),
            );
            await this.processBatchR2Backup(
              body as BatchR2BackupParams & { jobId: string },
            );
            break;
          case "batch-r2-restore":
            logInfo(
              "Starting batch R2 restore process",
              createErrorContext(
                "import_export_do",
                "process_batch_r2_restore",
              ),
            );
            await this.processBatchR2Restore(
              body as BatchR2RestoreParams & { jobId: string },
            );
            break;
          default:
            logWarning(
              `Unknown job type: ${jobType}`,
              createErrorContext("import_export_do", "fetch", {
                metadata: { jobType },
              }),
            );
            return new Response(JSON.stringify({ error: "Unknown job type" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        await logError(
          this.env,
          error instanceof Error ? error : String(error),
          createErrorContext("import_export_do", "fetch"),
          false,
        );
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Download export result
    if (url.pathname.startsWith("/download/")) {
      const pathParts = url.pathname.split("/");
      const jobId = pathParts[2];
      if (!jobId) {
        return new Response(JSON.stringify({ error: "Invalid job ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const exportData = this.exportResults.get(jobId);

      if (!exportData) {
        return new Response(
          JSON.stringify({ error: "Export data not found or expired" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Return the export data and clean up
      this.exportResults.delete(jobId);

      const format = exportData.startsWith("[") ? "json" : "ndjson";
      return new Response(exportData, {
        headers: {
          "Content-Type":
            format === "ndjson" ? "application/x-ndjson" : "application/json",
          "Content-Disposition": `attachment; filename="export-${jobId}.${format}"`,
        },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Broadcast progress (no-op: WebSocket support removed, progress tracked via D1 polling)
   */

  private broadcastProgress(_progress: JobProgress): void {
    // No-op: Frontend uses HTTP polling instead of WebSockets
    // This method is kept to avoid refactoring all process methods
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
    },
  ): Promise<void> {
    const db = getD1Binding(this.env);
    if (!db) return;

    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (updates.status !== undefined) {
        setClauses.push("status = ?");
        values.push(updates.status);
        if (updates.status === "completed" || updates.status === "failed") {
          setClauses.push("completed_at = CURRENT_TIMESTAMP");
        }
      }
      if (updates.total_keys !== undefined) {
        setClauses.push("total_keys = ?");
        values.push(updates.total_keys);
      }
      if (updates.processed_keys !== undefined) {
        setClauses.push("processed_keys = ?");
        values.push(updates.processed_keys);
      }
      if (updates.error_count !== undefined) {
        setClauses.push("error_count = ?");
        values.push(updates.error_count);
      }
      if (updates.current_key !== undefined) {
        setClauses.push("current_key = ?");
        values.push(updates.current_key);
      }
      if (updates.percentage !== undefined) {
        setClauses.push("percentage = ?");
        values.push(updates.percentage);
      }

      values.push(jobId);

      await db
        .prepare(
          `
        UPDATE bulk_jobs 
        SET ${setClauses.join(", ")}
        WHERE job_id = ?
      `,
        )
        .bind(...values)
        .run();
    } catch (error) {
      logWarning(
        "DB update error",
        createErrorContext("import_export_do", "update_job_db", {
          metadata: {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }

  /**
   * Process import operation
   */
  async processImport(params: ImportParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, importData, collision, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: importData.length,
          processed: 0,
          errors: 0,
          percentage: 0,
        },
      });

      // Log started event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({ total: importData.length, collision }),
      });

      let processedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let lastMilestone = 0;

      // Process imports using bulk write API (supports metadata)
      // Batch size of 10,000 is KV API limit
      const batchSize = 100;

      for (let i = 0; i < importData.length; i += batchSize) {
        const batch = importData.slice(i, i + batchSize);

        // Check for collisions if needed
        if (collision === "skip" || collision === "fail") {
          for (const item of batch) {
            try {
              const checkRequest = createCfApiRequest(
                `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(item.name)}`,
                this.env,
              );
              const checkResponse = await fetch(checkRequest);

              if (checkResponse.ok) {
                if (collision === "skip") {
                  skippedCount++;
                  // Mark this item to skip
                  (item as { _skip?: boolean })._skip = true;
                } else if (collision === "fail") {
                  throw new Error(`Key already exists: ${item.name}`);
                }
              }
            } catch (err) {
              logWarning(
                `Collision check error for key: ${item.name}`,
                createErrorContext("import_export_do", "process_import", {
                  keyName: item.name,
                  metadata: {
                    error: err instanceof Error ? err.message : String(err),
                  },
                }),
              );
              if (collision === "fail") {
                throw err;
              }
            }
          }
        }

        // Prepare bulk write data
        const bulkData = batch
          .filter((item) => !(item as { _skip?: boolean })._skip)
          .map((item) => {
            // Support both 'ttl' and 'expiration_ttl' field names
            const ttlValue = item.ttl || item.expiration_ttl;

            const kvItem: {
              key: string;
              value: string;
              expiration_ttl?: number;
              expiration?: number;
              metadata?: Record<string, unknown>;
              base64?: boolean;
            } = {
              key: item.name,
              value: item.value,
            };

            if (ttlValue) {
              kvItem.expiration_ttl = ttlValue;
            }
            if (item.expiration) {
              kvItem.expiration = item.expiration;
            }
            if (item.metadata) {
              // KV native metadata
              kvItem.metadata = item.metadata;
            }

            return kvItem;
          });

        // Use bulk write API
        if (bulkData.length > 0) {
          try {
            const bulkRequest = createCfApiRequest(
              `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
              this.env,
              {
                method: "PUT",
                body: JSON.stringify(bulkData),
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );

            const bulkResponse = await fetch(bulkRequest);

            if (bulkResponse.ok) {
              processedCount += bulkData.length;

              // Store tags and D1 custom_metadata if provided
              // Note: 'metadata' field goes to KV native (above), 'custom_metadata' goes to D1 (here)
              for (const item of batch) {
                if ((item as { _skip?: boolean })._skip) continue;

                // Always create/update D1 entry for imported keys (for search indexing)
                // But only store tags/custom_metadata if explicitly provided
                if (db) {
                  try {
                    // Important: Use custom_metadata field only, NOT metadata field
                    const customMetadataValue = item.custom_metadata
                      ? JSON.stringify(item.custom_metadata)
                      : null;
                    const tagsValue = item.tags
                      ? JSON.stringify(item.tags)
                      : null;

                    // Log what we're storing for debugging
                    if (tagsValue || customMetadataValue) {
                      logInfo(
                        `Storing D1 metadata for ${item.name}`,
                        createErrorContext(
                          "import_export_do",
                          "process_import",
                          {
                            keyName: item.name,
                            namespaceId,
                            metadata: {
                              hasTags: tagsValue !== null,
                              hasCustomMetadata: customMetadataValue !== null,
                            },
                          },
                        ),
                      );
                    }

                    await db
                      .prepare(
                        `
                      INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
                      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                      ON CONFLICT(namespace_id, key_name) 
                      DO UPDATE SET 
                        tags = excluded.tags, 
                        custom_metadata = excluded.custom_metadata, 
                        updated_at = CURRENT_TIMESTAMP
                    `,
                      )
                      .bind(
                        namespaceId,
                        item.name,
                        tagsValue,
                        customMetadataValue,
                      )
                      .run();
                  } catch (dbErr) {
                    logWarning(
                      `Failed to store D1 metadata for key: ${item.name}`,
                      createErrorContext("import_export_do", "process_import", {
                        keyName: item.name,
                        namespaceId,
                        metadata: {
                          error:
                            dbErr instanceof Error
                              ? dbErr.message
                              : String(dbErr),
                        },
                      }),
                    );
                    // Don't fail the import if D1 metadata storage fails
                  }
                }
              }
            } else {
              const errorText = await bulkResponse.text();
              console.error("[ImportExportDO] Bulk write failed:", errorText);
              errorCount += bulkData.length;
            }
          } catch (err) {
            console.error("[ImportExportDO] Bulk write error:", err);
            errorCount += bulkData.length;

            if (collision === "fail") {
              throw err;
            }
          }
        }

        // Broadcast progress after each batch
        const percentage = Math.round(
          ((i + batch.length) / importData.length) * 100,
        );
        await this.updateJobInDB(jobId, {
          processed_keys: i + batch.length,
          error_count: errorCount,
          percentage,
        });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: importData.length,
            processed: i + batch.length,
            errors: errorCount,
            percentage,
          },
        });

        // Log milestone events
        const milestone = Math.floor(percentage / 25) * 25;
        if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
          await logJobEvent(db, {
            job_id: jobId,
            event_type: `progress_${milestone}` as
              | "progress_25"
              | "progress_50"
              | "progress_75",
            user_email: userEmail,
            details: JSON.stringify({
              processed: i + batch.length,
              errors: errorCount,
              percentage,
            }),
          });
          lastMilestone = milestone;
        }
      }

      // Mark as completed
      await this.updateJobInDB(jobId, {
        status: "completed",
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100,
      });

      this.broadcastProgress({
        jobId,
        status: "completed",
        progress: {
          total: importData.length,
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        },
        result: {
          processed: processedCount,
          errors: errorCount,
          skipped: skippedCount,
        },
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "completed",
        user_email: userEmail,
        details: JSON.stringify({
          processed: processedCount,
          errors: errorCount,
          skipped: skippedCount,
          percentage: 100,
        }),
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: "import",
        user_email: userEmail,
        details: JSON.stringify({
          total: importData.length,
          processed: processedCount,
          errors: errorCount,
          skipped: skippedCount,
          collision,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("import_export_do", "process_import", {
          namespaceId,
          metadata: { jobId },
        }),
        false,
      );

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: {
          total: importData.length,
          processed: 0,
          errors: importData.length,
          percentage: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "failed",
        user_email: userEmail,
        details: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  }

  /**
   * Process export operation
   */
  async processExport(params: ExportParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, format, userEmail } = params;
    const db = getD1Binding(this.env);

    logInfo(
      "Starting export processing",
      createErrorContext("import_export_do", "process_export", {
        namespaceId,
        metadata: { jobId, format },
      }),
    );

    try {
      logInfo(
        "Updating job status to running",
        createErrorContext("import_export_do", "process_export", {
          metadata: { jobId },
        }),
      );
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
      });

      // Log started event
      logInfo(
        "Logging started event",
        createErrorContext("import_export_do", "process_export", {
          metadata: { jobId },
        }),
      );
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({ format }),
      });

      // List all keys in namespace
      let allKeys: { name: string }[] = [];
      let cursor: string | undefined;

      do {
        const params = new URLSearchParams();
        params.set("limit", "1000");
        if (cursor) params.set("cursor", cursor);

        const listRequest = createCfApiRequest(
          `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
          this.env,
        );
        const listResponse = await fetch(listRequest);

        if (!listResponse.ok) {
          throw new Error(`Failed to list keys: ${listResponse.status}`);
        }

        const listData = (await listResponse.json()) as {
          result: { name: string }[];
          result_info: { cursor?: string };
        };

        allKeys = allKeys.concat(listData.result || []);
        cursor = listData.result_info?.cursor;

        // Update progress for listing phase (first 10%)
        const percentage = Math.min(
          10,
          Math.round((allKeys.length / 10000) * 10),
        );
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: allKeys.length,
            processed: 0,
            errors: 0,
            percentage,
          },
        });
      } while (cursor);

      logInfo(
        `Found ${allKeys.length} keys to export`,
        createErrorContext("import_export_do", "process_export", {
          namespaceId,
          metadata: { keyCount: allKeys.length },
        }),
      );

      // Update total count and status to running
      await this.updateJobInDB(jobId, {
        status: "running",
        total_keys: allKeys.length,
        processed_keys: 0,
        error_count: 0,
        percentage: 10,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: allKeys.length,
          processed: 0,
          errors: 0,
          percentage: 10,
        },
      });

      // Fetch all key values
      const exportData: {
        name: string;
        value: string;
        metadata: Record<string, unknown>;
      }[] = [];
      let errorCount = 0;
      let lastMilestone = 0;

      for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];
        if (!key) continue;

        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
            this.env,
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            exportData.push({
              name: key.name,
              value: value,
              metadata: {},
            });
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error("[ImportExportDO] Failed to fetch key:", key.name, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === allKeys.length - 1) {
          // 10% for listing, 90% for fetching values
          const percentage = 10 + Math.round(((i + 1) / allKeys.length) * 90);
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            ...(key ? { current_key: key.name } : {}),
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: allKeys.length,
              processed: i + 1,
              errors: errorCount,
              ...(key ? { currentKey: key.name } : {}),
              percentage,
            },
          });

          // Log milestone events
          const milestone = Math.floor(percentage / 25) * 25;
          if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
            await logJobEvent(db, {
              job_id: jobId,
              event_type: `progress_${milestone}` as
                | "progress_25"
                | "progress_50"
                | "progress_75",
              user_email: userEmail,
              details: JSON.stringify({
                processed: i + 1,
                errors: errorCount,
                percentage,
              }),
            });
            lastMilestone = milestone;
          }
        }
      }

      // Format response data
      const responseBody =
        format === "ndjson"
          ? exportData.map((item) => JSON.stringify(item)).join("\n")
          : JSON.stringify(exportData, null, 2);

      // Store export result temporarily (will be cleaned up after download)
      this.exportResults.set(jobId, responseBody);

      // Mark as completed
      await this.updateJobInDB(jobId, {
        status: "completed",
        processed_keys: exportData.length,
        error_count: errorCount,
        percentage: 100,
      });

      this.broadcastProgress({
        jobId,
        status: "completed",
        progress: {
          total: allKeys.length,
          processed: exportData.length,
          errors: errorCount,
          percentage: 100,
        },
        result: {
          processed: exportData.length,
          errors: errorCount,
          downloadUrl: `/api/jobs/${jobId}/download`,
          format,
        },
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "completed",
        user_email: userEmail,
        details: JSON.stringify({
          processed: exportData.length,
          errors: errorCount,
          percentage: 100,
        }),
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: "export",
        user_email: userEmail,
        details: JSON.stringify({
          format,
          key_count: exportData.length,
          errors: errorCount,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("import_export_do", "process_export", {
          namespaceId,
          metadata: { jobId },
        }),
        false,
      );

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "failed",
        user_email: userEmail,
        details: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  }

  /**
   * Process R2 backup operation
   */
  async processR2Backup(
    params: R2BackupParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceId, format, userEmail } = params;
    const db = getD1Binding(this.env);

    logInfo(
      "Starting R2 backup processing",
      createErrorContext("import_export_do", "process_r2_backup", {
        namespaceId,
        metadata: { jobId, format },
      }),
    );

    try {
      logInfo(
        "Updating job status to running",
        createErrorContext("import_export_do", "process_r2_backup", {
          metadata: { jobId },
        }),
      );
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
      });

      // Log started event
      logInfo(
        "Logging started event",
        createErrorContext("import_export_do", "process_r2_backup", {
          metadata: { jobId },
        }),
      );
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({ format }),
      });

      // List all keys in namespace (same as export)
      let allKeys: { name: string }[] = [];
      let cursor: string | undefined;

      do {
        const params = new URLSearchParams();
        params.set("limit", "1000");
        if (cursor) params.set("cursor", cursor);

        const listRequest = createCfApiRequest(
          `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
          this.env,
        );
        const listResponse = await fetch(listRequest);

        if (!listResponse.ok) {
          throw new Error(`Failed to list keys: ${listResponse.status}`);
        }

        const listData = (await listResponse.json()) as {
          result: { name: string }[];
          result_info: { cursor?: string };
        };

        allKeys = allKeys.concat(listData.result || []);
        cursor = listData.result_info?.cursor;

        // Update progress for listing phase (first 10%)
        const percentage = Math.min(
          10,
          Math.round((allKeys.length / 10000) * 10),
        );
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: allKeys.length,
            processed: 0,
            errors: 0,
            percentage,
          },
        });
      } while (cursor);

      logInfo(
        `Found ${allKeys.length} keys to backup`,
        createErrorContext("import_export", "r2_backup", {
          namespaceId,
          metadata: { keyCount: allKeys.length },
        }),
      );

      // Update total count and status to running
      await this.updateJobInDB(jobId, {
        status: "running",
        total_keys: allKeys.length,
        processed_keys: 0,
        error_count: 0,
        percentage: 10,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: allKeys.length,
          processed: 0,
          errors: 0,
          percentage: 10,
        },
      });

      // Fetch all key values (same as export)
      const exportData: {
        name: string;
        value: string;
        metadata: Record<string, unknown>;
      }[] = [];
      let errorCount = 0;
      let lastMilestone = 0;

      for (let i = 0; i < allKeys.length; i++) {
        const key = allKeys[i];
        if (!key) continue;

        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
            this.env,
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            exportData.push({
              name: key.name,
              value: value,
              metadata: {},
            });
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error("[ImportExportDO] Failed to fetch key:", key.name, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === allKeys.length - 1) {
          // 10% for listing, 90% for fetching values
          const percentage = 10 + Math.round(((i + 1) / allKeys.length) * 90);
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            ...(key ? { current_key: key.name } : {}),
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: allKeys.length,
              processed: i + 1,
              errors: errorCount,
              ...(key ? { currentKey: key.name } : {}),
              percentage,
            },
          });

          // Log milestone events
          const milestone = Math.floor(percentage / 25) * 25;
          if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
            await logJobEvent(db, {
              job_id: jobId,
              event_type: `progress_${milestone}` as
                | "progress_25"
                | "progress_50"
                | "progress_75",
              user_email: userEmail,
              details: JSON.stringify({
                processed: i + 1,
                errors: errorCount,
                percentage,
              }),
            });
            lastMilestone = milestone;
          }
        }
      }

      // Format response data
      const responseBody =
        format === "ndjson"
          ? exportData.map((item) => JSON.stringify(item)).join("\n")
          : JSON.stringify(exportData, null, 2);

      // Store in R2 instead of temporary storage
      if (this.env.BACKUP_BUCKET) {
        const timestamp = Date.now();
        const extension = format === "ndjson" ? "ndjson" : "json";
        const backupPath = `backups/${namespaceId}/${timestamp}.${extension}`;

        logInfo(
          `Storing backup to R2: ${backupPath}`,
          createErrorContext("import_export", "r2_backup", {
            namespaceId,
            metadata: { backupPath },
          }),
        );

        await this.env.BACKUP_BUCKET.put(backupPath, responseBody, {
          httpMetadata: {
            contentType:
              format === "ndjson" ? "application/x-ndjson" : "application/json",
          },
        });

        logInfo(
          "Backup stored successfully in R2",
          createErrorContext("import_export", "r2_backup", {
            namespaceId,
            metadata: { backupPath },
          }),
        );

        // Mark as completed
        await this.updateJobInDB(jobId, {
          status: "completed",
          processed_keys: exportData.length,
          error_count: errorCount,
          percentage: 100,
        });

        this.broadcastProgress({
          jobId,
          status: "completed",
          progress: {
            total: allKeys.length,
            processed: exportData.length,
            errors: errorCount,
            percentage: 100,
          },
          result: {
            processed: exportData.length,
            errors: errorCount,
            backup_path: backupPath,
            format,
          },
        });

        // Log completed event
        await logJobEvent(db, {
          job_id: jobId,
          event_type: "completed",
          user_email: userEmail,
          details: JSON.stringify({
            processed: exportData.length,
            errors: errorCount,
            percentage: 100,
            backup_path: backupPath,
          }),
        });

        // Audit log
        await auditLog(db, {
          namespace_id: namespaceId,
          operation: "r2_backup",
          user_email: userEmail,
          details: JSON.stringify({
            format,
            key_count: exportData.length,
            errors: errorCount,
            job_id: jobId,
            backup_path: backupPath,
          }),
        });
      } else {
        throw new Error("R2 bucket not configured");
      }
    } catch (error) {
      console.error("[ImportExportDO] R2 backup error:", error);

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "failed",
        user_email: userEmail,
        details: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  }

  /**
   * Process R2 restore operation
   */
  async processR2Restore(
    params: R2RestoreParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceId, backupPath, userEmail } = params;
    const db = getD1Binding(this.env);

    logInfo(
      `Starting R2 restore processing for job: ${jobId} from: ${backupPath}`,
      createErrorContext("import_export", "r2_restore", {
        namespaceId,
        metadata: { jobId, backupPath },
      }),
    );

    try {
      // Fetch backup data from R2
      if (!this.env.BACKUP_BUCKET) {
        throw new Error("R2 bucket not configured");
      }

      logInfo(
        `Fetching backup from R2: ${backupPath}`,
        createErrorContext("import_export", "r2_restore", {
          namespaceId,
          metadata: { backupPath },
        }),
      );
      const backupObject = await this.env.BACKUP_BUCKET.get(backupPath);

      if (!backupObject) {
        throw new Error("Backup not found in R2");
      }

      const backupData = await backupObject.text();
      logInfo(
        `Backup data fetched, size: ${backupData.length}`,
        createErrorContext("import_export", "r2_restore", {
          namespaceId,
          metadata: { backupPath, dataSize: backupData.length },
        }),
      );

      // Parse import data (auto-detect JSON vs NDJSON)
      let importData: {
        name: string;
        value: string;
        metadata?: Record<string, unknown>;
        custom_metadata?: Record<string, unknown>;
        tags?: string[];
        expiration_ttl?: number;
        ttl?: number;
        expiration?: number;
      }[];

      try {
        // Try JSON array first
        importData = JSON.parse(backupData);
        if (!Array.isArray(importData)) {
          throw new Error("Expected array");
        }
      } catch {
        // Try NDJSON
        importData = backupData
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));
      }

      logInfo(
        `Parsed ${importData.length} items from backup`,
        createErrorContext("import_export", "r2_restore", {
          namespaceId,
          metadata: { itemCount: importData.length },
        }),
      );

      // Now process as import with overwrite collision handling
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
        total_keys: importData.length,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: importData.length,
          processed: 0,
          errors: 0,
          percentage: 0,
        },
      });

      // Log started event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({
          total: importData.length,
          backup_path: backupPath,
        }),
      });

      let processedCount = 0;
      let errorCount = 0;
      let lastMilestone = 0;

      // Process imports using bulk write API (same as import)
      const batchSize = 100;

      for (let i = 0; i < importData.length; i += batchSize) {
        const batch = importData.slice(i, i + batchSize);

        // Prepare bulk write data
        const bulkData = batch.map((item) => {
          const ttlValue = item.ttl || item.expiration_ttl;

          const kvItem: {
            key: string;
            value: string;
            expiration_ttl?: number;
            expiration?: number;
            metadata?: Record<string, unknown>;
            base64?: boolean;
          } = {
            key: item.name,
            value: item.value,
          };

          if (ttlValue) {
            kvItem.expiration_ttl = ttlValue;
          }
          if (item.expiration) {
            kvItem.expiration = item.expiration;
          }
          if (item.metadata) {
            kvItem.metadata = item.metadata;
          }

          return kvItem;
        });

        // Use bulk write API
        if (bulkData.length > 0) {
          try {
            const bulkRequest = createCfApiRequest(
              `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
              this.env,
              {
                method: "PUT",
                body: JSON.stringify(bulkData),
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );

            const bulkResponse = await fetch(bulkRequest);

            if (bulkResponse.ok) {
              processedCount += bulkData.length;

              // Store tags and D1 custom_metadata if provided
              for (const item of batch) {
                if (db) {
                  try {
                    const customMetadataValue = item.custom_metadata
                      ? JSON.stringify(item.custom_metadata)
                      : null;
                    const tagsValue = item.tags
                      ? JSON.stringify(item.tags)
                      : null;

                    await db
                      .prepare(
                        `
                      INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
                      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                      ON CONFLICT(namespace_id, key_name) 
                      DO UPDATE SET 
                        tags = excluded.tags, 
                        custom_metadata = excluded.custom_metadata, 
                        updated_at = CURRENT_TIMESTAMP
                    `,
                      )
                      .bind(
                        namespaceId,
                        item.name,
                        tagsValue,
                        customMetadataValue,
                      )
                      .run();
                  } catch (dbErr) {
                    console.error(
                      "[ImportExportDO] Failed to store D1 metadata for key:",
                      item.name,
                      dbErr,
                    );
                  }
                }
              }
            } else {
              const errorText = await bulkResponse.text();
              console.error("[ImportExportDO] Bulk write failed:", errorText);
              errorCount += bulkData.length;
            }
          } catch (err) {
            console.error("[ImportExportDO] Bulk write error:", err);
            errorCount += bulkData.length;
          }
        }

        // Broadcast progress after each batch
        const percentage = Math.round(
          ((i + batch.length) / importData.length) * 100,
        );
        await this.updateJobInDB(jobId, {
          processed_keys: i + batch.length,
          error_count: errorCount,
          percentage,
        });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: importData.length,
            processed: i + batch.length,
            errors: errorCount,
            percentage,
          },
        });

        // Log milestone events
        const milestone = Math.floor(percentage / 25) * 25;
        if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
          await logJobEvent(db, {
            job_id: jobId,
            event_type: `progress_${milestone}` as
              | "progress_25"
              | "progress_50"
              | "progress_75",
            user_email: userEmail,
            details: JSON.stringify({
              processed: i + batch.length,
              errors: errorCount,
              percentage,
            }),
          });
          lastMilestone = milestone;
        }
      }

      // Mark as completed
      await this.updateJobInDB(jobId, {
        status: "completed",
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100,
      });

      this.broadcastProgress({
        jobId,
        status: "completed",
        progress: {
          total: importData.length,
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        },
        result: {
          processed: processedCount,
          errors: errorCount,
        },
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "completed",
        user_email: userEmail,
        details: JSON.stringify({
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        }),
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: "r2_restore",
        user_email: userEmail,
        details: JSON.stringify({
          total: importData.length,
          processed: processedCount,
          errors: errorCount,
          backup_path: backupPath,
          job_id: jobId,
        }),
      });
    } catch (error) {
      console.error("[ImportExportDO] R2 restore error:", error);

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: { total: 0, processed: 0, errors: 0, percentage: 0 },
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Log failed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "failed",
        user_email: userEmail,
        details: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  }

  /**
   * Process batch R2 backup - backup multiple namespaces
   */
  private async processBatchR2Backup(
    params: BatchR2BackupParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceIds, format, userEmail } = params;
    const db = getD1Binding(this.env);

    logInfo(
      `Starting batch R2 backup job ${jobId} for ${namespaceIds.length} namespaces`,
      createErrorContext("import_export", "batch_r2_backup", {
        metadata: { jobId, namespaceCount: namespaceIds.length },
      }),
    );

    // Update job status to running
    if (db) {
      await db
        .prepare(
          "UPDATE bulk_jobs SET status = ?, processed_keys = 0, error_count = 0 WHERE job_id = ?",
        )
        .bind("running", jobId)
        .run();

      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({
          total: namespaceIds.length,
          namespaces: namespaceIds,
        }),
      });
    }

    let processed = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each namespace sequentially
    for (const namespaceId of namespaceIds) {
      try {
        logInfo(
          `Backing up namespace ${namespaceId} (${processed + 1}/${namespaceIds.length})`,
          createErrorContext("import_export", "batch_r2_backup", {
            namespaceId,
            metadata: {
              jobId,
              progress: `${processed + 1}/${namespaceIds.length}`,
            },
          }),
        );

        // List all keys in the namespace
        let allKeys: { name: string }[] = [];
        let cursor: string | undefined;

        do {
          const url = cursor
            ? `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000&cursor=${cursor}`
            : `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`;

          const listRequest = createCfApiRequest(url, this.env);
          const listResponse = await fetch(listRequest);
          const listData = (await listResponse.json()) as {
            result: { name: string }[];
            result_info?: { cursor?: string };
          };

          allKeys = allKeys.concat(listData.result || []);
          cursor = listData.result_info?.cursor;
        } while (cursor);

        logInfo(
          `Found ${allKeys.length} keys in namespace ${namespaceId}`,
          createErrorContext("import_export", "batch_r2_backup", {
            namespaceId,
            metadata: { keyCount: allKeys.length },
          }),
        );

        // Fetch all key values
        const exportData: {
          name: string;
          value: string;
          metadata: Record<string, unknown>;
        }[] = [];

        for (const key of allKeys) {
          try {
            const valueRequest = createCfApiRequest(
              `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
              this.env,
            );
            const valueResponse = await fetch(valueRequest);

            if (valueResponse.ok) {
              const value = await valueResponse.text();
              exportData.push({
                name: key.name,
                value: value,
                metadata: {},
              });
            } else {
              console.error(
                `[ImportExportDO] Failed to fetch key ${key.name}: HTTP ${valueResponse.status}`,
              );
            }
          } catch (err) {
            console.error(
              `[ImportExportDO] Error fetching key ${key.name}:`,
              err,
            );
          }
        }

        // Store in R2
        const timestamp = Date.now();
        const backupPath = `backups/${namespaceId}/${timestamp}.${format === "ndjson" ? "ndjson" : "json"}`;
        const backupContent =
          format === "ndjson"
            ? exportData.map((item) => JSON.stringify(item)).join("\n")
            : JSON.stringify(exportData, null, 2);

        if (!this.env.BACKUP_BUCKET) {
          throw new Error("BACKUP_BUCKET is not configured");
        }

        await this.env.BACKUP_BUCKET.put(backupPath, backupContent, {
          httpMetadata: {
            contentType:
              format === "ndjson" ? "application/x-ndjson" : "application/json",
          },
        });

        logInfo(
          `Backed up namespace ${namespaceId} to ${backupPath}`,
          createErrorContext("import_export", "batch_r2_backup", {
            namespaceId,
            metadata: { backupPath, keyCount: exportData.length },
          }),
        );

        // Log audit event for this namespace
        if (db) {
          const auditEntry: Omit<
            import("../types").AuditLogEntry,
            "id" | "timestamp"
          > = {
            namespace_id: namespaceId,
            user_email: userEmail,
            operation: "batch_r2_backup",
            details: JSON.stringify({
              job_id: jobId,
              backup_path: backupPath,
              key_count: allKeys.length,
            }),
          };
          await auditLog(db, auditEntry);
        }

        processed++;

        // Update progress
        const percentage = Math.round((processed / namespaceIds.length) * 100);
        if (db) {
          await db
            .prepare(
              "UPDATE bulk_jobs SET processed_keys = ?, percentage = ? WHERE job_id = ?",
            )
            .bind(processed, percentage, jobId)
            .run();

          // Log milestone events
          if (percentage === 25 || percentage === 50 || percentage === 75) {
            await logJobEvent(db, {
              job_id: jobId,
              event_type: `progress_${percentage}` as
                | "progress_25"
                | "progress_50"
                | "progress_75",
              user_email: userEmail,
              details: JSON.stringify({
                processed,
                total: namespaceIds.length,
                percentage,
              }),
            });
          }
        }
      } catch (err) {
        errors++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errorDetails.push(`Namespace ${namespaceId}: ${errorMsg}`);
        console.error(
          `[ImportExportDO] Error backing up namespace ${namespaceId}:`,
          err,
        );
      }
    }

    // Mark job as completed or failed
    const finalStatus = errors === namespaceIds.length ? "failed" : "completed";

    if (db) {
      await db
        .prepare(
          `
        UPDATE bulk_jobs 
        SET status = ?, processed_keys = ?, error_count = ?, percentage = 100, completed_at = CURRENT_TIMESTAMP
        WHERE job_id = ?
      `,
        )
        .bind(finalStatus, processed, errors, jobId)
        .run();

      await logJobEvent(db, {
        job_id: jobId,
        event_type: finalStatus as "completed" | "failed",
        user_email: userEmail,
        details: JSON.stringify({
          processed,
          errors,
          total: namespaceIds.length,
          percentage: 100,
          error_details: errorDetails.length > 0 ? errorDetails : undefined,
        }),
      });
    }

    logInfo(
      `Batch R2 backup job ${jobId} ${finalStatus}. Processed: ${processed}, Errors: ${errors}`,
      createErrorContext("import_export", "batch_r2_backup", {
        metadata: { jobId, status: finalStatus, processed, errors },
      }),
    );
  }

  /**
   * Process batch R2 restore - restore multiple namespaces from backups
   */
  private async processBatchR2Restore(
    params: BatchR2RestoreParams & { jobId: string },
  ): Promise<void> {
    const { jobId, restoreMap, userEmail } = params;
    const db = getD1Binding(this.env);
    const namespaceIds = Object.keys(restoreMap);

    logInfo(
      `Starting batch R2 restore job ${jobId} for ${namespaceIds.length} namespaces`,
      createErrorContext("import_export", "batch_r2_restore", {
        metadata: { jobId, namespaceCount: namespaceIds.length },
      }),
    );

    // Update job status to running
    if (db) {
      await db
        .prepare(
          "UPDATE bulk_jobs SET status = ?, processed_keys = 0, error_count = 0 WHERE job_id = ?",
        )
        .bind("running", jobId)
        .run();

      await logJobEvent(db, {
        job_id: jobId,
        event_type: "started",
        user_email: userEmail,
        details: JSON.stringify({
          total: namespaceIds.length,
          namespaces: namespaceIds,
        }),
      });
    }

    let processed = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each namespace sequentially
    for (const namespaceId of namespaceIds) {
      const backupPath = restoreMap[namespaceId];

      try {
        logInfo(
          `Restoring namespace ${namespaceId} from ${backupPath} (${processed + 1}/${namespaceIds.length})`,
          createErrorContext("import_export", "batch_r2_restore", {
            namespaceId,
            metadata: {
              jobId,
              backupPath,
              progress: `${processed + 1}/${namespaceIds.length}`,
            },
          }),
        );

        // Retrieve backup from R2
        if (!this.env.BACKUP_BUCKET) {
          throw new Error("BACKUP_BUCKET is not configured");
        }
        if (!backupPath) {
          throw new Error("Backup path is undefined");
        }
        const backupObject = await this.env.BACKUP_BUCKET.get(backupPath);
        if (!backupObject) {
          throw new Error(`Backup not found: ${backupPath}`);
        }

        const backupContent = await backupObject.text();

        // Parse backup data (auto-detect format)
        let importData: {
          name: string;
          value: string;
          metadata?: unknown;
          expiration?: number;
          expiration_ttl?: number;
        }[];
        try {
          importData = JSON.parse(backupContent);
          if (!Array.isArray(importData)) {
            throw new Error("Expected array");
          }
        } catch {
          // Try NDJSON
          importData = backupContent
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line));
        }

        logInfo(
          `Parsed ${importData.length} items from backup`,
          createErrorContext("import_export", "batch_r2_restore", {
            namespaceId,
            metadata: { itemCount: importData.length },
          }),
        );

        // Restore keys to namespace
        let keyErrors = 0;
        for (const item of importData) {
          try {
            const putRequest = createCfApiRequest(
              `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(item.name)}`,
              this.env,
              {
                method: "PUT",
                body: item.value,
                headers: { "Content-Type": "text/plain" },
              },
            );

            const putResponse = await fetch(putRequest);
            if (!putResponse.ok) {
              keyErrors++;
            }
          } catch (err) {
            keyErrors++;
            console.error(
              `[ImportExportDO] Error restoring key ${item.name}:`,
              err,
            );
          }
        }

        logInfo(
          `Restored namespace ${namespaceId}. Keys: ${importData.length}, Errors: ${keyErrors}`,
          createErrorContext("import_export", "batch_r2_restore", {
            namespaceId,
            metadata: { keyCount: importData.length, keyErrors },
          }),
        );

        // Log audit event
        if (db) {
          const auditEntry: Omit<
            import("../types").AuditLogEntry,
            "id" | "timestamp"
          > = {
            namespace_id: namespaceId,
            user_email: userEmail,
            operation: "batch_r2_restore",
            details: JSON.stringify({
              job_id: jobId,
              backup_path: backupPath,
              key_count: importData.length,
              key_errors: keyErrors,
            }),
          };
          await auditLog(db, auditEntry);
        }

        if (keyErrors > 0) {
          errors++;
          errorDetails.push(
            `Namespace ${namespaceId}: ${keyErrors} key errors`,
          );
        }

        processed++;

        // Update progress
        const percentage = Math.round((processed / namespaceIds.length) * 100);
        if (db) {
          await db
            .prepare(
              "UPDATE bulk_jobs SET processed_keys = ?, error_count = ?, percentage = ? WHERE job_id = ?",
            )
            .bind(processed, errors, percentage, jobId)
            .run();

          // Log milestone events
          if (percentage === 25 || percentage === 50 || percentage === 75) {
            await logJobEvent(db, {
              job_id: jobId,
              event_type: `progress_${percentage}` as
                | "progress_25"
                | "progress_50"
                | "progress_75",
              user_email: userEmail,
              details: JSON.stringify({
                processed,
                errors,
                total: namespaceIds.length,
                percentage,
              }),
            });
          }
        }
      } catch (err) {
        errors++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        errorDetails.push(`Namespace ${namespaceId}: ${errorMsg}`);
        console.error(
          `[ImportExportDO] Error restoring namespace ${namespaceId}:`,
          err,
        );
      }
    }

    // Mark job as completed or failed
    const finalStatus = errors === namespaceIds.length ? "failed" : "completed";

    if (db) {
      await db
        .prepare(
          `
        UPDATE bulk_jobs 
        SET status = ?, processed_keys = ?, error_count = ?, percentage = 100, completed_at = CURRENT_TIMESTAMP
        WHERE job_id = ?
      `,
        )
        .bind(finalStatus, processed, errors, jobId)
        .run();

      await logJobEvent(db, {
        job_id: jobId,
        event_type: finalStatus as "completed" | "failed",
        user_email: userEmail,
        details: JSON.stringify({
          processed,
          errors,
          total: namespaceIds.length,
          percentage: 100,
          error_details: errorDetails.length > 0 ? errorDetails : undefined,
        }),
      });
    }

    logInfo(
      `Batch R2 restore job ${jobId} ${finalStatus}. Processed: ${processed}, Errors: ${errors}`,
      createErrorContext("import_export", "batch_r2_restore", {
        metadata: { jobId, status: finalStatus, processed, errors },
      }),
    );
  }
}
