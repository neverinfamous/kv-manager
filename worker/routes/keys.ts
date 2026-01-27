import type { Env, APIResponse, KVKeyInfo } from "../types";
import { createCfApiRequest, getD1Binding, auditLog } from "../utils/helpers";
import {
  logInfo,
  logWarning,
  logError,
  createErrorContext,
} from "../utils/error-logger";

export async function handleKeyRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/keys/:namespaceId/list - List keys in namespace
    const listMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/list$/);
    if (listMatch && request.method === "GET") {
      const namespaceId = listMatch[1];
      const prefix = url.searchParams.get("prefix") || undefined;
      const limit = url.searchParams.get("limit") || "1000";

      logInfo(
        "Listing keys for namespace",
        createErrorContext("keys", "list_keys", {
          ...(namespaceId && { namespaceId }),
          metadata: { prefix, limit },
        }),
      );

      if (isLocalDev) {
        // Return mock keys
        const mockKeys: KVKeyInfo[] = [
          { name: "test-key-1", metadata: {} },
          {
            name: "test-key-2",
            expiration: Math.floor(Date.now() / 1000) + 86400,
            metadata: {},
          },
          { name: "config-key", metadata: { version: "1.0" } },
        ];

        const response: APIResponse = {
          success: true,
          result: {
            keys: prefix
              ? mockKeys.filter((k) => k.name.startsWith(prefix))
              : mockKeys,
            list_complete: true,
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Build query params
      const params = new URLSearchParams();
      if (prefix) params.set("prefix", prefix);
      params.set("limit", limit);

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
        env,
      );

      const cfResponse = await fetch(cfRequest);
      logInfo(
        "Cloudflare API response",
        createErrorContext("keys", "list_keys", {
          ...(namespaceId && { namespaceId }),
          metadata: { status: cfResponse.status },
        }),
      );

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("keys", "list_keys", {
            ...(namespaceId && { namespaceId }),
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      const data = (await cfResponse.json()) as { result: KVKeyInfo[] };

      const response: APIResponse = {
        success: true,
        result: {
          keys: data.result || [],
          list_complete: true,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET /api/keys/:namespaceId/:keyName - Get a key's value
    const getMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/([^/]+)$/);
    if (
      getMatch &&
      request.method === "GET" &&
      !url.pathname.endsWith("/list")
    ) {
      const namespaceId = getMatch[1];
      const keyNameEncoded = getMatch[2];
      if (!namespaceId || !keyNameEncoded) {
        return new Response(
          JSON.stringify({ error: "Missing namespace ID or key name" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
      const keyName = decodeURIComponent(keyNameEncoded);

      logInfo(
        "Getting key",
        createErrorContext("keys", "get_key", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev) {
        // Return mock key data
        const mockValue = JSON.stringify({
          example: "data",
          timestamp: Date.now(),
        });
        const response: APIResponse = {
          success: true,
          result: {
            name: keyName,
            value: mockValue,
            size: mockValue.length,
            metadata: { mock: true },
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env,
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("keys", "get_key", {
            ...(namespaceId && { namespaceId }),
            keyName,
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      const value = await cfResponse.text();

      // Get metadata separately
      const metadataRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/metadata/${encodeURIComponent(keyName)}`,
        env,
      );

      const metadataResponse = await fetch(metadataRequest);
      let metadata = {};

      if (metadataResponse.ok) {
        const metadataData = (await metadataResponse.json()) as {
          result?: Record<string, unknown>;
        };
        metadata = metadataData.result || {};
      }

      // Fetch key info (including expiration) from keys list endpoint
      // The /values endpoint doesn't return expiration, but /keys does
      let expiration: number | undefined;
      try {
        const keyInfoRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?prefix=${encodeURIComponent(keyName)}&limit=100`,
          env,
        );
        const keyInfoResponse = await fetch(keyInfoRequest);
        if (keyInfoResponse.ok) {
          const keyInfoData = (await keyInfoResponse.json()) as {
            result?: KVKeyInfo[];
          };
          // Find the exact key match (prefix search might return multiple keys)
          const keyInfo = keyInfoData.result?.find((k) => k.name === keyName);
          if (keyInfo?.expiration) {
            expiration = keyInfo.expiration;
          }
        }
      } catch {
        // If fetching key info fails, continue without expiration
        logWarning(
          "Failed to fetch key expiration info",
          createErrorContext("keys", "get_key", {
            ...(namespaceId && { namespaceId }),
            keyName,
          }),
        );
      }

      const response: APIResponse = {
        success: true,
        result: {
          name: keyName,
          value: value,
          size: new Blob([value]).size,
          metadata: metadata,
          expiration: expiration,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // PUT /api/keys/:namespaceId/:keyName - Create or update a key
    const putMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/([^/]+)$/);
    if (putMatch && request.method === "PUT") {
      const namespaceId = putMatch[1];
      const keyNameEncoded = putMatch[2];
      if (!namespaceId || !keyNameEncoded) {
        return new Response(
          JSON.stringify({ error: "Missing namespace ID or key name" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
      const keyName = decodeURIComponent(keyNameEncoded);
      const body = (await request.json()) as {
        value: string;
        metadata?: unknown;
        expiration_ttl?: number;
        create_backup?: boolean;
      };

      if (body.value === undefined) {
        return new Response(JSON.stringify({ error: "Missing value" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      logInfo(
        "Putting key",
        createErrorContext("keys", "put_key", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // If create_backup is true, backup existing value first
      if (body.create_backup) {
        try {
          const existingRequest = createCfApiRequest(
            `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
            env,
          );
          const existingResponse = await fetch(existingRequest);

          if (existingResponse.ok) {
            const existingValue = await existingResponse.text();
            const backupKey = `__backup__:${keyName}`;

            // Store backup with 24 hour TTL
            const backupRequest = createCfApiRequest(
              `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(backupKey)}?expiration_ttl=86400`,
              env,
              {
                method: "PUT",
                body: existingValue,
              },
            );
            await fetch(backupRequest);
            logInfo(
              "Created backup for key",
              createErrorContext("keys", "put_key", {
                ...(namespaceId && { namespaceId }),
                keyName,
              }),
            );
          }
        } catch (err) {
          logWarning(
            "Failed to create backup",
            createErrorContext("keys", "put_key", {
              ...(namespaceId && { namespaceId }),
              keyName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          // Continue with put operation even if backup fails
        }
      }

      let cfRequest: Request;

      // If metadata is provided, use the bulk write API which properly handles metadata
      // The single key PUT endpoint with FormData doesn't work reliably in Workers
      if (body.metadata) {
        interface BulkWriteItem {
          key: string;
          value: string;
          metadata?: unknown;
          expiration_ttl?: number;
        }

        const bulkItem: BulkWriteItem = {
          key: keyName,
          value: body.value,
          metadata: body.metadata,
        };

        if (body.expiration_ttl) {
          bulkItem.expiration_ttl = body.expiration_ttl;
        }

        cfRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
          env,
          {
            method: "PUT",
            body: JSON.stringify([bulkItem]),
          },
        );
      } else {
        // No metadata - use simple text/plain request for single key
        const params = new URLSearchParams();
        if (body.expiration_ttl) {
          params.set("expiration_ttl", body.expiration_ttl.toString());
        }
        const queryString = params.toString() ? `?${params.toString()}` : "";

        cfRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}${queryString}`,
          env,
          {
            method: "PUT",
            body: body.value,
            headers: {
              "Content-Type": "text/plain",
            },
          },
        );
      }

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("keys", "put_key", {
            ...(namespaceId && { namespaceId }),
            keyName,
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      // Ensure metadata entry exists in D1 for search functionality
      // This creates an empty entry if one doesn't exist, making the key searchable
      if (db) {
        try {
          await db
            .prepare(
              `
              INSERT INTO key_metadata (namespace_id, key_name, tags, custom_metadata, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
              ON CONFLICT(namespace_id, key_name)
              DO UPDATE SET updated_at = datetime('now')
            `,
            )
            .bind(namespaceId, keyName, "[]", "{}")
            .run();
          logInfo(
            "Ensured metadata entry exists for key",
            createErrorContext("keys", "put_key", {
              ...(namespaceId && { namespaceId }),
              keyName,
            }),
          );
        } catch (err) {
          logWarning(
            "Failed to create/update metadata entry",
            createErrorContext("keys", "put_key", {
              ...(namespaceId && { namespaceId }),
              keyName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          // Don't fail the whole operation if metadata creation fails
        }
      }

      // Log audit entry
      const operation = body.create_backup ? "update" : "create";
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: keyName,
        operation: operation,
        user_email: userEmail,
      });

      const response: APIResponse = {
        success: true,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // DELETE /api/keys/:namespaceId/:keyName - Delete a key
    const deleteMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/(.+)$/);
    if (deleteMatch && request.method === "DELETE") {
      const namespaceId = deleteMatch[1];
      const keyNameEncoded = deleteMatch[2];
      if (!namespaceId || !keyNameEncoded) {
        return new Response(
          JSON.stringify({ error: "Missing namespace ID or key name" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
      const keyName = decodeURIComponent(keyNameEncoded);

      logInfo(
        "Deleting key",
        createErrorContext("keys", "delete_key", {
          ...(namespaceId && { namespaceId }),
          keyName,
        }),
      );

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env,
        { method: "DELETE" },
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        await logError(
          env,
          `Cloudflare API error: ${errorText}`,
          createErrorContext("keys", "delete_key", {
            ...(namespaceId && { namespaceId }),
            keyName,
            metadata: { status: cfResponse.status },
          }),
          isLocalDev,
        );
        throw new Error(
          `Cloudflare API error: ${cfResponse.status} - ${errorText}`,
        );
      }

      // Delete D1 metadata entry (tags, custom_metadata) for this key
      if (db) {
        try {
          await db
            .prepare(
              "DELETE FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
            )
            .bind(namespaceId, keyName)
            .run();
          logInfo(
            "Deleted metadata entry for key",
            createErrorContext("keys", "delete_key", {
              ...(namespaceId && { namespaceId }),
              keyName,
            }),
          );
        } catch (err) {
          logWarning(
            "Failed to delete metadata entry",
            createErrorContext("keys", "delete_key", {
              ...(namespaceId && { namespaceId }),
              keyName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
          // Don't fail the whole operation if metadata deletion fails
        }
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: keyName,
        operation: "delete",
        user_email: userEmail,
      });

      const response: APIResponse = {
        success: true,
      };

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // POST /api/keys/:namespaceId/bulk-delete - Bulk delete keys (async with DO)
    const bulkDeleteMatch = url.pathname.match(
      /^\/api\/keys\/([^/]+)\/bulk-delete$/,
    );
    if (bulkDeleteMatch && request.method === "POST") {
      const namespaceId = bulkDeleteMatch[1];
      const body = (await request.json()) as { keys: string[] };

      if (!body.keys || !Array.isArray(body.keys)) {
        return new Response(
          JSON.stringify({ error: "Missing or invalid keys array" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      logInfo(
        "Bulk deleting keys from namespace",
        createErrorContext("keys", "bulk_delete", {
          ...(namespaceId && { namespaceId }),
          metadata: { keyCount: body.keys.length },
        }),
      );

      if (isLocalDev) {
        const jobId = `delete-${Date.now()}`;
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
      const jobId = `delete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_delete', 'queued', ?, CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, namespaceId, body.keys.length, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.BULK_OPERATION_DO.idFromName(jobId);
      const stub = env.BULK_OPERATION_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceId,
          keys: body.keys,
          userEmail,
        }),
      });

      logInfo(
        "Starting bulk delete processing in DO",
        createErrorContext("keys", "bulk_delete", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Bulk delete DO processing initiated",
        createErrorContext("keys", "bulk_delete", {
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

    // POST /api/keys/:namespaceId/bulk-copy - Bulk copy keys to another namespace
    const bulkCopyMatch = url.pathname.match(
      /^\/api\/keys\/([^/]+)\/bulk-copy$/,
    );
    if (bulkCopyMatch && request.method === "POST") {
      const sourceNamespaceId = bulkCopyMatch[1];
      const body = (await request.json()) as {
        keys: string[];
        target_namespace_id: string;
      };

      if (
        !body.keys ||
        !Array.isArray(body.keys) ||
        !body.target_namespace_id
      ) {
        return new Response(
          JSON.stringify({
            error: "Missing keys array or target_namespace_id",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      logInfo(
        "Bulk copying keys",
        createErrorContext("keys", "bulk_copy", {
          ...(sourceNamespaceId !== undefined && {
            namespaceId: sourceNamespaceId,
          }),
          metadata: {
            keyCount: body.keys.length,
            targetNamespaceId: body.target_namespace_id,
          },
        }),
      );

      if (isLocalDev) {
        const jobId = `copy-${Date.now()}`;
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

      const jobId = `copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_copy', 'queued', ?, CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, sourceNamespaceId, body.keys.length, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.BULK_OPERATION_DO.idFromName(jobId);
      const stub = env.BULK_OPERATION_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/bulk-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          sourceNamespaceId,
          targetNamespaceId: body.target_namespace_id,
          keys: body.keys,
          userEmail,
        }),
      });

      logInfo(
        "Starting bulk copy processing in DO",
        createErrorContext("keys", "bulk_copy", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Bulk copy DO processing initiated",
        createErrorContext("keys", "bulk_copy", {
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

    // POST /api/keys/:namespaceId/bulk-ttl - Bulk update TTL
    const bulkTtlMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/bulk-ttl$/);
    if (bulkTtlMatch && request.method === "POST") {
      const namespaceId = bulkTtlMatch[1];
      const body = (await request.json()) as {
        keys: string[];
        expiration_ttl: number;
      };

      if (
        !body.keys ||
        !Array.isArray(body.keys) ||
        typeof body.expiration_ttl !== "number"
      ) {
        return new Response(
          JSON.stringify({ error: "Missing keys array or expiration_ttl" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      logInfo(
        "Bulk updating TTL for keys",
        createErrorContext("keys", "bulk_ttl", {
          ...(namespaceId && { namespaceId }),
          metadata: { keyCount: body.keys.length, ttl: body.expiration_ttl },
        }),
      );

      if (isLocalDev) {
        const jobId = `ttl-${Date.now()}`;
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

      const jobId = `ttl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db
          .prepare(
            `
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
          VALUES (?, ?, 'bulk_ttl', 'queued', ?, CURRENT_TIMESTAMP, ?)
        `,
          )
          .bind(jobId, namespaceId, body.keys.length, userEmail)
          .run();
      }

      // Get Durable Object stub and start async processing
      const id = env.BULK_OPERATION_DO.idFromName(jobId);
      const stub = env.BULK_OPERATION_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/bulk-ttl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          namespaceId,
          keys: body.keys,
          ttl: body.expiration_ttl,
          userEmail,
        }),
      });

      logInfo(
        "Starting bulk TTL processing in DO",
        createErrorContext("keys", "bulk_ttl", {
          metadata: { jobId },
        }),
      );

      const doResponse = await stub.fetch(doRequest);
      logInfo(
        "Bulk TTL DO processing initiated",
        createErrorContext("keys", "bulk_ttl", {
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

    // POST /api/keys/:namespaceId/rename - Rename a key
    const renameMatch = /^\/api\/keys\/([^/]+)\/rename$/.exec(url.pathname);
    if (renameMatch && request.method === "POST") {
      const namespaceId = renameMatch[1];
      if (!namespaceId) {
        return new Response(JSON.stringify({ error: "Missing namespace ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const body = (await request.json()) as {
        old_name: string;
        new_name: string;
      };

      if (!body.old_name || !body.new_name) {
        return new Response(
          JSON.stringify({ error: "Missing old_name or new_name" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const oldName = body.old_name;
      const newName = body.new_name.trim();

      if (oldName === newName) {
        return new Response(
          JSON.stringify({ error: "Old and new names are the same" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      logInfo(
        "Renaming key",
        createErrorContext("keys", "rename_key", {
          ...(namespaceId && { namespaceId }),
          keyName: oldName,
          metadata: { newName },
        }),
      );

      if (isLocalDev) {
        const response: APIResponse = { success: true };
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Step 1: Get the existing key value
      const valueRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(oldName)}`,
        env,
      );
      const valueResponse = await fetch(valueRequest);

      if (!valueResponse.ok) {
        const errorText = await valueResponse.text();
        await logError(
          env,
          `Key not found: ${errorText}`,
          createErrorContext("keys", "rename_key", {
            ...(namespaceId && { namespaceId }),
            keyName: oldName,
            metadata: {
              status: valueResponse.status,
              code: "KEY_RENAME_FAILED",
            },
          }),
          isLocalDev,
        );
        return new Response(JSON.stringify({ error: "Key not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const value = await valueResponse.text();

      // Step 2: Get KV native metadata
      const metadataRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/metadata/${encodeURIComponent(oldName)}`,
        env,
      );
      const metadataResponse = await fetch(metadataRequest);
      let kvMetadata: Record<string, unknown> = {};
      if (metadataResponse.ok) {
        const metadataData = (await metadataResponse.json()) as {
          result?: Record<string, unknown>;
        };
        kvMetadata = metadataData.result ?? {};
      }

      // Step 3: Get expiration info from keys list
      let expiration: number | undefined;
      try {
        const keyInfoRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?prefix=${encodeURIComponent(oldName)}&limit=100`,
          env,
        );
        const keyInfoResponse = await fetch(keyInfoRequest);
        if (keyInfoResponse.ok) {
          const keyInfoData = (await keyInfoResponse.json()) as {
            result?: { name: string; expiration?: number }[];
          };
          const keyInfo = keyInfoData.result?.find((k) => k.name === oldName);
          if (keyInfo?.expiration) {
            expiration = keyInfo.expiration;
          }
        }
      } catch {
        logWarning(
          "Failed to fetch key expiration info for rename",
          createErrorContext("keys", "rename_key", {
            ...(namespaceId && { namespaceId }),
            keyName: oldName,
          }),
        );
      }

      // Step 4: Get D1 metadata (tags, custom_metadata)
      let d1Tags: string[] = [];
      let d1CustomMetadata: Record<string, unknown> = {};
      if (db) {
        try {
          const d1Result = await db
            .prepare(
              "SELECT tags, custom_metadata FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
            )
            .bind(namespaceId, oldName)
            .first<{ tags: string; custom_metadata: string }>();
          if (d1Result) {
            d1Tags = JSON.parse(d1Result.tags || "[]") as string[];
            d1CustomMetadata = JSON.parse(
              d1Result.custom_metadata || "{}",
            ) as Record<string, unknown>;
          }
        } catch (err) {
          logWarning(
            "Failed to fetch D1 metadata for rename",
            createErrorContext("keys", "rename_key", {
              ...(namespaceId && { namespaceId }),
              keyName: oldName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        }
      }

      // Step 5: Write to new key name with value and metadata
      let putRequest: Request;
      const hasMetadata = Object.keys(kvMetadata).length > 0;

      if (hasMetadata) {
        // Use bulk write API for metadata support
        interface BulkWriteItem {
          key: string;
          value: string;
          metadata?: Record<string, unknown>;
          expiration?: number;
        }

        const bulkItem: BulkWriteItem = {
          key: newName,
          value: value,
          metadata: kvMetadata,
        };

        if (expiration) {
          bulkItem.expiration = expiration;
        }

        putRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
          env,
          {
            method: "PUT",
            body: JSON.stringify([bulkItem]),
          },
        );
      } else {
        // Simple write without metadata
        const params = new URLSearchParams();
        if (expiration) {
          params.set("expiration", expiration.toString());
        }
        const queryString = params.toString() ? `?${params.toString()}` : "";

        putRequest = createCfApiRequest(
          `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(newName)}${queryString}`,
          env,
          {
            method: "PUT",
            body: value,
            headers: { "Content-Type": "text/plain" },
          },
        );
      }

      const putResponse = await fetch(putRequest);

      if (!putResponse.ok) {
        const errorText = await putResponse.text();
        await logError(
          env,
          `Failed to write new key: ${errorText}`,
          createErrorContext("keys", "rename_key", {
            ...(namespaceId && { namespaceId }),
            keyName: newName,
            metadata: { status: putResponse.status, code: "KEY_RENAME_FAILED" },
          }),
          isLocalDev,
        );
        return new Response(
          JSON.stringify({ error: "Failed to create renamed key" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // Step 6: Create D1 metadata entry for new key
      if (db) {
        try {
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
              namespaceId,
              newName,
              JSON.stringify(d1Tags),
              JSON.stringify(d1CustomMetadata),
            )
            .run();
        } catch (err) {
          logWarning(
            "Failed to create D1 metadata for new key",
            createErrorContext("keys", "rename_key", {
              ...(namespaceId && { namespaceId }),
              keyName: newName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        }
      }

      // Step 7: Delete old key from KV (only after successful write)
      const deleteRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(oldName)}`,
        env,
        { method: "DELETE" },
      );
      const deleteResponse = await fetch(deleteRequest);

      if (!deleteResponse.ok) {
        logWarning(
          "Failed to delete old key after rename",
          createErrorContext("keys", "rename_key", {
            ...(namespaceId && { namespaceId }),
            keyName: oldName,
            metadata: { status: deleteResponse.status },
          }),
        );
        // Don't fail the operation - the rename was successful, just cleanup failed
      }

      // Step 8: Delete old D1 metadata entry
      if (db) {
        try {
          await db
            .prepare(
              "DELETE FROM key_metadata WHERE namespace_id = ? AND key_name = ?",
            )
            .bind(namespaceId, oldName)
            .run();
        } catch (err) {
          logWarning(
            "Failed to delete old D1 metadata",
            createErrorContext("keys", "rename_key", {
              ...(namespaceId && { namespaceId }),
              keyName: oldName,
              metadata: {
                error: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        }
      }

      // Step 9: Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: newName,
        operation: "rename",
        user_email: userEmail,
        details: JSON.stringify({ old_name: oldName, new_name: newName }),
      });

      logInfo(
        "Key renamed successfully",
        createErrorContext("keys", "rename_key", {
          ...(namespaceId && { namespaceId }),
          keyName: newName,
          metadata: { oldName },
        }),
      );

      const response: APIResponse = { success: true };

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
      createErrorContext("keys", "handle_request"),
      isLocalDev,
    );
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
