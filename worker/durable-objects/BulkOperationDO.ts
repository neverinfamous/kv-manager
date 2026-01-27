import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  Env,
  JobProgress,
  BulkCopyParams,
  BulkTTLParams,
  BulkTagParams,
  BulkDeleteParams,
  BulkMigrateParams,
} from "../types";
import {
  createCfApiRequest,
  getD1Binding,
  auditLog,
  logJobEvent,
} from "../utils/helpers";
import {
  logWarning,
  logError,
  createErrorContext,
} from "../utils/error-logger";

/**
 * Durable Object for orchestrating bulk KV operations
 */
export class BulkOperationDO {
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  /**
   * Handle incoming requests for job processing
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Job processing endpoints
    if (url.pathname.startsWith("/process/")) {
      const jobType = url.pathname.split("/")[2];

      try {
        const body = (await request.json()) as Record<string, unknown>;

        switch (jobType) {
          case "bulk-copy":
            await this.processBulkCopy(
              body as unknown as BulkCopyParams & { jobId: string },
            );
            break;
          case "bulk-ttl":
            await this.processBulkTTL(
              body as unknown as BulkTTLParams & { jobId: string },
            );
            break;
          case "bulk-tag":
            await this.processBulkTag(
              body as unknown as BulkTagParams & { jobId: string },
            );
            break;
          case "bulk-delete":
            await this.processBulkDelete(
              body as unknown as BulkDeleteParams & { jobId: string },
            );
            break;
          case "bulk-migrate":
            await this.processBulkMigrate(
              body as unknown as BulkMigrateParams & {
                jobId: string;
                keyExpirations?: Record<string, number>;
              },
            );
            break;
          default:
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
          createErrorContext("bulk_operation_do", "fetch"),
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
        createErrorContext("bulk_operation_do", "update_job_db", {
          metadata: {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }

  /**
   * Process bulk copy operation
   */
  async processBulkCopy(
    params: BulkCopyParams & { jobId: string },
  ): Promise<void> {
    const { jobId, sourceNamespaceId, targetNamespaceId, keys, userEmail } =
      params;
    const db = getD1Binding(this.env);

    try {
      // Update status to running
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: keys.length,
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
          total: keys.length,
          source: sourceNamespaceId,
          target: targetNamespaceId,
        }),
      });

      const copyData: { key: string; value: string }[] = [];
      let errorCount = 0;
      let lastMilestone = 0;

      // Fetch all key values from source
      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        if (!keyName) continue;

        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/values/${encodeURIComponent(keyName)}`,
            this.env,
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            copyData.push({ key: keyName, value: value });
          } else {
            errorCount++;
          }
        } catch (err) {
          logWarning(
            `Failed to fetch key: ${keyName}`,
            createErrorContext("bulk_operation_do", "process_bulk_copy", {
              keyName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 50); // First 50% is fetching
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: keys.length,
              processed: i + 1,
              errors: errorCount,
              currentKey: keyName,
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

      // Write to target namespace using bulk API
      const batchSize = 10000;
      let writeProcessed = 0;

      for (let i = 0; i < copyData.length; i += batchSize) {
        const batch = copyData.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${targetNamespaceId}/bulk`,
            this.env,
            {
              method: "PUT",
              body: JSON.stringify(batch),
              headers: { "Content-Type": "application/json" },
            },
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            writeProcessed += batch.length;
          } else {
            await logError(
              this.env,
              `Bulk copy failed: ${await bulkResponse.text()}`,
              createErrorContext("bulk_operation_do", "process_bulk_copy"),
              false,
            );
            errorCount += batch.length;
          }
        } catch (err) {
          await logError(
            this.env,
            err instanceof Error ? err : String(err),
            createErrorContext("bulk_operation_do", "process_bulk_copy", {
              metadata: { operation: "batch_copy" },
            }),
            false,
          );
          errorCount += batch.length;
        }

        // Broadcast progress (second 50% is writing)
        const percentage =
          50 + Math.round((writeProcessed / copyData.length) * 50);
        await this.updateJobInDB(jobId, {
          processed_keys: keys.length,
          error_count: errorCount,
          percentage,
        });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: keys.length,
            processed: keys.length,
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
              processed: keys.length,
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
        processed_keys: writeProcessed,
        error_count: errorCount,
        percentage: 100,
      });

      this.broadcastProgress({
        jobId,
        status: "completed",
        progress: {
          total: keys.length,
          processed: writeProcessed,
          errors: errorCount,
          percentage: 100,
        },
        result: { processed: writeProcessed, errors: errorCount },
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "completed",
        user_email: userEmail,
        details: JSON.stringify({
          processed: writeProcessed,
          errors: errorCount,
          percentage: 100,
        }),
      });

      // Audit log
      await auditLog(db, {
        namespace_id: sourceNamespaceId,
        operation: "bulk_copy",
        user_email: userEmail,
        details: JSON.stringify({
          target_namespace_id: targetNamespaceId,
          total: keys.length,
          processed: writeProcessed,
          errors: errorCount,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("bulk_operation_do", "process_bulk_copy", {
          namespaceId: sourceNamespaceId,
          metadata: { jobId },
        }),
        false,
      );

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: {
          total: keys.length,
          processed: 0,
          errors: keys.length,
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
   * Process bulk TTL update operation
   */
  async processBulkTTL(
    params: BulkTTLParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceId, keys, ttl, userEmail } = params;
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
          total: keys.length,
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
        details: JSON.stringify({ total: keys.length, ttl }),
      });

      let processedCount = 0;
      let errorCount = 0;
      let lastMilestone = 0;

      // Update TTL for each key
      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        if (!keyName) continue;

        try {
          // Get current value
          const getRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
            this.env,
          );
          const getResponse = await fetch(getRequest);

          if (!getResponse.ok) {
            errorCount++;
            continue;
          }

          const value = await getResponse.text();

          // Update with new TTL
          const putRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}?expiration_ttl=${ttl}`,
            this.env,
            {
              method: "PUT",
              body: value,
              headers: { "Content-Type": "text/plain" },
            },
          );

          const putResponse = await fetch(putRequest);

          if (putResponse.ok) {
            processedCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          logWarning(
            `Failed to update TTL for key: ${keyName}`,
            createErrorContext("bulk_operation_do", "process_bulk_ttl", {
              keyName,
              namespaceId,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 100);
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: keys.length,
              processed: i + 1,
              errors: errorCount,
              currentKey: keyName,
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
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        },
        result: { processed: processedCount, errors: errorCount },
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
        operation: "bulk_ttl_update",
        user_email: userEmail,
        details: JSON.stringify({
          ttl,
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("bulk_operation_do", "process_bulk_ttl", {
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
          total: keys.length,
          processed: 0,
          errors: keys.length,
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
   * Process bulk tag operation
   */
  async processBulkTag(
    params: BulkTagParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceId, keys, tags, operation, userEmail } = params;
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
          total: keys.length,
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
        details: JSON.stringify({ total: keys.length, tags, operation }),
      });

      let processedCount = 0;
      let errorCount = 0;
      let lastMilestone = 0;

      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        if (!keyName) continue;

        try {
          if (!db) {
            errorCount++;
            continue;
          }

          // Get existing metadata
          const existing = await db
            .prepare(
              "SELECT tags FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
            )
            .bind(namespaceId, keyName)
            .first();

          let existingTags: string[] = [];
          if (existing && existing["tags"]) {
            try {
              existingTags = JSON.parse(existing["tags"] as string) as string[];
            } catch {
              existingTags = [];
            }
          }

          // Apply tag operation
          let newTags: string[];
          switch (operation) {
            case "add":
              newTags = [...new Set([...existingTags, ...tags])];
              break;
            case "remove":
              newTags = existingTags.filter((t) => !tags.includes(t));
              break;
            case "replace":
              newTags = tags;
              break;
            default:
              newTags = existingTags;
          }

          // Upsert metadata
          await db
            .prepare(
              `
            INSERT INTO key_metadata (namespace_id, key_name, tags, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(namespace_id, key_name) 
            DO UPDATE SET tags = excluded.tags, updated_at = CURRENT_TIMESTAMP
          `,
            )
            .bind(namespaceId, keyName, JSON.stringify(newTags))
            .run();

          processedCount++;
        } catch (err) {
          logWarning(
            `Failed to tag key: ${keyName}`,
            createErrorContext("bulk_operation_do", "process_bulk_tag", {
              keyName,
              namespaceId,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 100);
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: keys.length,
              processed: i + 1,
              errors: errorCount,
              currentKey: keyName,
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
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        },
        result: { processed: processedCount, errors: errorCount },
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
        operation: "bulk_tag",
        user_email: userEmail,
        details: JSON.stringify({
          operation,
          tags,
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("bulk_operation_do", "process_bulk_tag", {
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
          total: keys.length,
          processed: 0,
          errors: keys.length,
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
   * Process bulk delete operation
   */
  async processBulkDelete(
    params: BulkDeleteParams & { jobId: string },
  ): Promise<void> {
    const { jobId, namespaceId, keys, userEmail } = params;
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
          total: keys.length,
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
        details: JSON.stringify({ total: keys.length }),
      });

      let processedCount = 0;
      let errorCount = 0;
      let lastMilestone = 0;

      // Delete keys using bulk API
      const batchSize = 10000;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
            this.env,
            {
              method: "DELETE",
              body: JSON.stringify(batch),
              headers: { "Content-Type": "application/json" },
            },
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            processedCount += batch.length;

            // Also delete D1 metadata entries for these keys
            if (db) {
              try {
                // Delete metadata entries in batches (SQLite has limits on parameters)
                const placeholders = batch.map(() => "?").join(",");
                await db
                  .prepare(
                    `DELETE FROM key_metadata WHERE namespace_id = ? AND key_name IN (${placeholders})`,
                  )
                  .bind(namespaceId, ...batch)
                  .run();
              } catch (metaErr) {
                logWarning(
                  "Failed to delete D1 metadata entries",
                  createErrorContext(
                    "bulk_operation_do",
                    "process_bulk_delete",
                    {
                      namespaceId,
                      metadata: {
                        error:
                          metaErr instanceof Error
                            ? metaErr.message
                            : String(metaErr),
                      },
                    },
                  ),
                );
                // Don't fail the operation if metadata cleanup fails
              }
            }
          } else {
            await logError(
              this.env,
              `Bulk delete failed: ${await bulkResponse.text()}`,
              createErrorContext("bulk_operation_do", "process_bulk_delete", {
                namespaceId,
              }),
              false,
            );
            errorCount += batch.length;
          }
        } catch (err) {
          await logError(
            this.env,
            err instanceof Error ? err : String(err),
            createErrorContext("bulk_operation_do", "process_bulk_delete", {
              namespaceId,
              metadata: { operation: "batch_delete" },
            }),
            false,
          );
          errorCount += batch.length;
        }

        // Broadcast progress
        const percentage = Math.round(((i + batch.length) / keys.length) * 100);
        await this.updateJobInDB(jobId, {
          processed_keys: i + batch.length,
          error_count: errorCount,
          percentage,
        });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: keys.length,
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
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          percentage: 100,
        },
        result: { processed: processedCount, errors: errorCount },
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
        operation: "bulk_delete",
        user_email: userEmail,
        details: JSON.stringify({
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("bulk_operation_do", "process_bulk_delete", {
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
          total: keys.length,
          processed: 0,
          errors: keys.length,
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
   * Process bulk migration operation
   * Migrates keys from source namespace to target namespace with optional:
   * - TTL preservation
   * - D1 metadata migration (tags, custom_metadata)
   * - R2 backup before migration
   * - Source key deletion after verification
   */
  async processBulkMigrate(
    params: BulkMigrateParams & {
      jobId: string;
      keyExpirations?: Record<string, number>;
    },
  ): Promise<void> {
    const {
      jobId,
      sourceNamespaceId,
      targetNamespaceId,
      keys,
      cutoverMode,
      migrateMetadata,
      preserveTTL,
      createBackup,
      userEmail,
      keyExpirations = {},
    } = params;
    const db = getD1Binding(this.env);
    const warnings: string[] = [];

    try {
      // Update status to running
      await this.updateJobInDB(jobId, {
        status: "running",
        processed_keys: 0,
        error_count: 0,
      });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: keys.length,
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
          total: keys.length,
          source: sourceNamespaceId,
          target: targetNamespaceId,
          cutoverMode,
          migrateMetadata,
          preserveTTL,
          createBackup,
        }),
      });

      // Step 1: Optional R2 backup before migration
      let backupPath: string | undefined;
      if (createBackup && this.env.BACKUP_BUCKET) {
        try {
          const timestamp = Date.now();
          backupPath = `backups/${sourceNamespaceId}/pre-migrate-${timestamp}.json`;

          // Fetch all key values for backup
          const backupData: {
            key: string;
            value: string;
            expiration?: number;
          }[] = [];
          for (const keyName of keys) {
            try {
              const valueRequest = createCfApiRequest(
                `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/values/${encodeURIComponent(keyName)}`,
                this.env,
              );
              const valueResponse = await fetch(valueRequest);
              if (valueResponse.ok) {
                const value = await valueResponse.text();
                backupData.push({
                  key: keyName,
                  value,
                  ...(keyExpirations[keyName] !== undefined
                    ? { expiration: keyExpirations[keyName] }
                    : {}),
                });
              }
            } catch {
              // Skip keys that fail to fetch
            }
          }

          await this.env.BACKUP_BUCKET.put(
            backupPath,
            JSON.stringify(backupData, null, 2),
            {
              httpMetadata: { contentType: "application/json" },
            },
          );
        } catch (backupError) {
          warnings.push(
            `Backup creation failed: ${backupError instanceof Error ? backupError.message : "Unknown error"}`,
          );
          logWarning(
            "Failed to create R2 backup before migration",
            createErrorContext("bulk_operation_do", "process_bulk_migrate", {
              metadata: {
                jobId,
                error:
                  backupError instanceof Error
                    ? backupError.message
                    : String(backupError),
              },
            }),
          );
        }
      }

      // Step 2: Fetch key values and optionally expirations from source
      interface MigrateKeyData {
        key: string;
        value: string;
        expiration_ttl?: number;
      }
      const migrateData: MigrateKeyData[] = [];
      let errorCount = 0;
      let lastMilestone = 0;

      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        if (!keyName) continue;

        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/values/${encodeURIComponent(keyName)}`,
            this.env,
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            const item: MigrateKeyData = { key: keyName, value };

            // Calculate TTL from expiration timestamp if preserving TTL
            if (preserveTTL && keyExpirations[keyName] !== undefined) {
              const expiration = keyExpirations[keyName] as number;
              const nowSeconds = Math.floor(Date.now() / 1000);
              const remainingTtl = expiration - nowSeconds;

              // Cloudflare KV minimum TTL is 60 seconds
              if (remainingTtl > 60) {
                item.expiration_ttl = remainingTtl;
              } else if (remainingTtl > 0) {
                // Use minimum TTL for nearly-expired keys
                item.expiration_ttl = 60;
                warnings.push(
                  `Key "${keyName}" had TTL < 60s, set to minimum 60s`,
                );
              }
              // If TTL <= 0, the key is expired - we still migrate it without TTL
            }

            migrateData.push(item);
          } else {
            errorCount++;
          }
        } catch (err) {
          logWarning(
            `Failed to fetch key for migration: ${keyName}`,
            createErrorContext("bulk_operation_do", "process_bulk_migrate", {
              keyName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          errorCount++;
        }

        // Update progress (first 40% is fetching)
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 40);
          await this.updateJobInDB(jobId, {
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage,
          });
          this.broadcastProgress({
            jobId,
            status: "running",
            progress: {
              total: keys.length,
              processed: i + 1,
              errors: errorCount,
              currentKey: keyName,
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
                phase: "fetch",
              }),
            });
            lastMilestone = milestone;
          }
        }
      }

      // Step 3: Write to target namespace using bulk API
      const batchSize = 10000;
      let writeProcessed = 0;

      for (let i = 0; i < migrateData.length; i += batchSize) {
        const batch = migrateData.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${targetNamespaceId}/bulk`,
            this.env,
            {
              method: "PUT",
              body: JSON.stringify(batch),
              headers: { "Content-Type": "application/json" },
            },
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            writeProcessed += batch.length;
          } else {
            await logError(
              this.env,
              `Bulk migrate write failed: ${await bulkResponse.text()}`,
              createErrorContext("bulk_operation_do", "process_bulk_migrate"),
              false,
            );
            errorCount += batch.length;
          }
        } catch (err) {
          await logError(
            this.env,
            err instanceof Error ? err : String(err),
            createErrorContext("bulk_operation_do", "process_bulk_migrate", {
              metadata: { operation: "batch_write" },
            }),
            false,
          );
          errorCount += batch.length;
        }

        // Update progress (40-70% is writing)
        const percentage =
          40 + Math.round((writeProcessed / migrateData.length) * 30);
        await this.updateJobInDB(jobId, {
          processed_keys: keys.length,
          error_count: errorCount,
          percentage,
        });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: keys.length,
            processed: keys.length,
            errors: errorCount,
            percentage,
          },
        });

        // Log milestone
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
              processed: keys.length,
              written: writeProcessed,
              errors: errorCount,
              percentage,
              phase: "write",
            }),
          });
          lastMilestone = milestone;
        }
      }

      // Step 4: Migrate D1 metadata if requested
      let metadataMigrated = 0;
      if (migrateMetadata && db) {
        try {
          // Get source metadata for migrated keys
          for (const keyName of keys) {
            try {
              const sourceMetadata = await db
                .prepare(
                  "SELECT tags, custom_metadata FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
                )
                .bind(sourceNamespaceId, keyName)
                .first<{ tags: string; custom_metadata: string }>();

              if (sourceMetadata) {
                // Upsert to target namespace
                await db
                  .prepare(
                    `
                  INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
                  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                  ON CONFLICT(namespace_id, key_name)
                  DO UPDATE SET tags = excluded.tags, custom_metadata = excluded.custom_metadata, updated_at = datetime('now')
                `,
                  )
                  .bind(
                    targetNamespaceId,
                    keyName,
                    sourceMetadata.tags,
                    sourceMetadata.custom_metadata,
                  )
                  .run();
                metadataMigrated++;
              }
            } catch {
              // Continue on individual key metadata failures
            }
          }
        } catch (metaErr) {
          warnings.push(
            `Metadata migration partially failed: ${metaErr instanceof Error ? metaErr.message : "Unknown error"}`,
          );
        }

        // Update progress (70-80% is metadata migration)
        await this.updateJobInDB(jobId, { percentage: 80 });
        this.broadcastProgress({
          jobId,
          status: "running",
          progress: {
            total: keys.length,
            processed: keys.length,
            errors: errorCount,
            percentage: 80,
          },
        });
      }

      // Step 5: Verification
      let verificationPassed = true;
      let targetKeyCount = 0;
      try {
        // Count keys in target namespace (just the migrated ones)
        for (const keyName of keys) {
          const checkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${targetNamespaceId}/metadata/${encodeURIComponent(keyName)}`,
            this.env,
          );
          const checkResponse = await fetch(checkRequest);
          if (checkResponse.ok) {
            targetKeyCount++;
          }
        }

        // Verification passes if we successfully wrote at least as many as we fetched (minus errors)
        verificationPassed = targetKeyCount >= writeProcessed;
        if (!verificationPassed) {
          warnings.push(
            `Verification warning: expected ${writeProcessed} keys, found ${targetKeyCount}`,
          );
        }
      } catch {
        warnings.push("Verification check failed");
      }

      // Update progress (80-90%)
      await this.updateJobInDB(jobId, { percentage: 90 });
      this.broadcastProgress({
        jobId,
        status: "running",
        progress: {
          total: keys.length,
          processed: keys.length,
          errors: errorCount,
          percentage: 90,
        },
      });

      // Step 6: Handle cutover mode (delete source if copy_delete and verification passed)
      let sourceDeleted = false;
      if (
        cutoverMode === "copy_delete" &&
        verificationPassed &&
        errorCount === 0
      ) {
        try {
          // Delete source keys in batches
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const deleteRequest = createCfApiRequest(
              `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/bulk`,
              this.env,
              {
                method: "DELETE",
                body: JSON.stringify(batch),
                headers: { "Content-Type": "application/json" },
              },
            );
            await fetch(deleteRequest);

            // Also delete D1 metadata if migrated
            if (migrateMetadata && db) {
              try {
                const placeholders = batch.map(() => "?").join(",");
                await db
                  .prepare(
                    `DELETE FROM key_metadata WHERE namespace_id = ? AND key_name IN (${placeholders})`,
                  )
                  .bind(sourceNamespaceId, ...batch)
                  .run();
              } catch {
                // D1 metadata cleanup failure is non-critical
              }
            }
          }
          sourceDeleted = true;
        } catch (deleteErr) {
          warnings.push(
            `Source deletion failed: ${deleteErr instanceof Error ? deleteErr.message : "Unknown error"}`,
          );
        }
      } else if (
        cutoverMode === "copy_delete" &&
        (!verificationPassed || errorCount > 0)
      ) {
        warnings.push(
          "Source keys not deleted due to verification failure or errors",
        );
      }

      // Mark as completed
      await this.updateJobInDB(jobId, {
        status: "completed",
        processed_keys: writeProcessed,
        error_count: errorCount,
        percentage: 100,
      });

      this.broadcastProgress({
        jobId,
        status: "completed",
        progress: {
          total: keys.length,
          processed: writeProcessed,
          errors: errorCount,
          percentage: 100,
        },
        result: {
          keysMigrated: writeProcessed,
          metadataMigrated,
          errors: errorCount,
          verification: {
            passed: verificationPassed,
            sourceKeyCount: keys.length,
            targetKeyCount,
          },
          backupPath,
          sourceDeleted,
          warnings,
        },
      });

      // Log completed event
      await logJobEvent(db, {
        job_id: jobId,
        event_type: "completed",
        user_email: userEmail,
        details: JSON.stringify({
          keysMigrated: writeProcessed,
          metadataMigrated,
          errors: errorCount,
          verificationPassed,
          sourceDeleted,
          backupPath,
          warnings,
        }),
      });

      // Audit log
      await auditLog(db, {
        namespace_id: sourceNamespaceId,
        operation: "bulk_migrate",
        user_email: userEmail,
        details: JSON.stringify({
          target_namespace_id: targetNamespaceId,
          total: keys.length,
          keysMigrated: writeProcessed,
          metadataMigrated,
          errors: errorCount,
          cutoverMode,
          sourceDeleted,
          backupPath,
          job_id: jobId,
        }),
      });
    } catch (error) {
      await logError(
        this.env,
        error instanceof Error ? error : String(error),
        createErrorContext("bulk_operation_do", "process_bulk_migrate", {
          namespaceId: sourceNamespaceId,
          metadata: { jobId },
        }),
        false,
      );

      await this.updateJobInDB(jobId, { status: "failed" });

      this.broadcastProgress({
        jobId,
        status: "failed",
        progress: {
          total: keys.length,
          processed: 0,
          errors: keys.length,
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
}
