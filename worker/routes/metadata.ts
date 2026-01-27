import type { Env, APIResponse } from "../types";
import { getD1Binding } from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

export async function handleMetadataRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/metadata/:namespaceId/:keyName - Get metadata and tags
    const getMatch = url.pathname.match(/^\/api\/metadata\/([^/]+)\/([^/]+)$/);
    if (getMatch && request.method === "GET") {
      const namespaceId = getMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Invalid namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyNameEncoded = getMatch[2];
      if (!keyNameEncoded) {
        return new Response(JSON.stringify({ error: "Invalid key name" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyName = decodeURIComponent(keyNameEncoded);

      logInfo(
        "Getting metadata for key",
        createErrorContext("metadata", "get_metadata", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev || !db) {
        // Return mock metadata
        const response: APIResponse = {
          success: true,
          result: {
            namespace_id: namespaceId,
            key_name: keyName,
            tags: ["mock", "example"],
            custom_metadata: { environment: "dev", version: "1.0" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Query D1 for metadata
      const result = await db
        .prepare(
          "SELECT * FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
        )
        .bind(namespaceId, keyName)
        .first();

      if (!result) {
        const response: APIResponse = {
          success: true,
          result: {
            namespace_id: namespaceId,
            key_name: keyName,
            tags: [],
            custom_metadata: {},
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const response: APIResponse = {
        success: true,
        result: {
          namespace_id: result["namespace_id"] as string,
          key_name: result["key_name"] as string,
          tags: result["tags"] ? JSON.parse(result["tags"] as string) : [],
          custom_metadata: result["custom_metadata"]
            ? JSON.parse(result["custom_metadata"] as string)
            : {},
          created_at: result["created_at"] as string | undefined,
          updated_at: result["updated_at"] as string | undefined,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // PUT /api/metadata/:namespaceId/:keyName - Update metadata and tags
    const putMatch = url.pathname.match(/^\/api\/metadata\/([^/]+)\/([^/]+)$/);
    if (putMatch && request.method === "PUT") {
      const namespaceId = putMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Invalid namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyNameEncoded = putMatch[2];
      if (!keyNameEncoded) {
        return new Response(JSON.stringify({ error: "Invalid key name" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const keyName = decodeURIComponent(keyNameEncoded);
      const body = (await request.json()) as {
        tags?: string[];
        custom_metadata?: Record<string, unknown>;
      };

      logInfo(
        "Updating metadata for key",
        createErrorContext("metadata", "update_metadata", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev || !db) {
        const response: APIResponse = {
          success: true,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Upsert metadata
      await db
        .prepare(
          `
        INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(namespace_id, key_name) 
        DO UPDATE SET 
          tags = excluded.tags, 
          custom_metadata = excluded.custom_metadata, 
          updated_at = CURRENT_TIMESTAMP
      `,
        )
        .bind(
          namespaceId,
          keyName,
          body.tags ? JSON.stringify(body.tags) : null,
          body.custom_metadata ? JSON.stringify(body.custom_metadata) : null,
        )
        .run();

      const response: APIResponse = {
        success: true,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/metadata/:namespaceId/bulk-tag - Bulk apply tags
    const bulkTagMatch = url.pathname.match(
      /^\/api\/metadata\/([^/]+)\/bulk-tag$/,
    );
    if (bulkTagMatch && request.method === "POST") {
      const namespaceId = bulkTagMatch[1];
      const body = (await request.json()) as {
        keys: string[];
        tags: string[];
        operation?: "add" | "remove" | "replace";
      };

      if (
        !body.keys ||
        !Array.isArray(body.keys) ||
        !body.tags ||
        !Array.isArray(body.tags)
      ) {
        return new Response(
          JSON.stringify({ error: "Missing or invalid keys or tags array" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const operation = body.operation || "replace";
      logInfo(
        "Bulk tag operation",
        createErrorContext("metadata", "bulk_tag", {
          ...(namespaceId && { namespaceId }),
          metadata: { operation, keyCount: body.keys.length, tags: body.tags },
        }),
      );

      if (isLocalDev) {
        const jobId = `tag-${Date.now()}`;
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

      // Generate job ID and create job entry in D1
      const jobId = `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_tag', 'queued', ?, CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, namespaceId, body.keys.length, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.BULK_OPERATION_DO.idFromName(jobId);
      const stub = env.BULK_OPERATION_DO.get(id);

      // Start processing in DO
      const doRequest = new Request(`https://do/process/bulk-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceId,
          keys: body.keys,
          tags: body.tags,
          operation,
          userEmail,
        }),
      });

      logInfo(
        "Starting bulk tag processing in DO",
        createErrorContext("metadata", "bulk_tag", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Bulk tag DO processing initiated",
        createErrorContext("metadata", "bulk_tag", {
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
          total_keys: body.keys.length,
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
      createErrorContext("metadata", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
