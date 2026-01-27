/**
 * Migration Routes
 *
 * API endpoints for migrating keys between KV namespaces with optional
 * metadata migration, TTL preservation, and rollback support.
 */

import type {
  Env,
  BulkMigrateParams,
  MigrationResult,
  KVKeyInfo,
} from "../types";
import {
  createCfApiRequest,
  getD1Binding,
  generateJobId,
} from "../utils/helpers";
import { logInfo, logError, createErrorContext } from "../utils/error-logger";

/**
 * Migration request body
 */
interface MigrateKeysBody {
  sourceNamespaceId: string;
  targetNamespaceId: string;
  keys?: string[]; // If omitted, migrate all keys
  cutoverMode?: "copy" | "copy_delete";
  migrateMetadata?: boolean;
  preserveTTL?: boolean;
  createBackup?: boolean;
  runVerification?: boolean;
}

/**
 * Handle migration-related API routes
 */
export async function handleMigrateRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response | null> {
  const method = request.method;
  const path = url.pathname;

  // POST /api/migrate/keys - Migrate keys between namespaces
  if (method === "POST" && path === "/api/migrate/keys") {
    return migrateKeys(request, env, corsHeaders, isLocalDev, userEmail);
  }

  // POST /api/migrate/namespace - Migrate all keys from namespace
  if (method === "POST" && path === "/api/migrate/namespace") {
    return migrateNamespace(request, env, corsHeaders, isLocalDev, userEmail);
  }

  return null;
}

/**
 * Get all keys from a namespace with optional expiration info
 */
async function getAllNamespaceKeys(
  namespaceId: string,
  env: Env,
  _includeExpiration: boolean,
): Promise<{ keys: KVKeyInfo[]; error?: string }> {
  const allKeys: KVKeyInfo[] = [];
  let cursor: string | undefined;

  try {
    do {
      const listUrl = `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?limit=1000${cursor ? `&cursor=${cursor}` : ""}`;
      const listRequest = createCfApiRequest(listUrl, env);
      const listResponse = await fetch(listRequest);

      if (!listResponse.ok) {
        return {
          keys: [],
          error: `Failed to list keys: ${listResponse.status}`,
        };
      }

      interface KeyListResult {
        result: KVKeyInfo[];
        result_info: { cursor?: string };
      }
      const data = (await listResponse.json()) as KeyListResult;
      allKeys.push(...data.result);
      cursor = data.result_info.cursor;
    } while (cursor);

    return { keys: allKeys };
  } catch (error) {
    return {
      keys: [],
      error:
        error instanceof Error ? error.message : "Unknown error listing keys",
    };
  }
}

/**
 * Migrate selected keys between namespaces
 */
async function migrateKeys(
  request: Request,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  let body: MigrateKeysBody;
  try {
    body = (await request.json()) as MigrateKeysBody;
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const {
    sourceNamespaceId,
    targetNamespaceId,
    keys,
    cutoverMode = "copy",
    migrateMetadata = true,
    preserveTTL = true,
    createBackup = false,
  } = body;

  // Validation
  if (!sourceNamespaceId || !targetNamespaceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "sourceNamespaceId and targetNamespaceId are required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (sourceNamespaceId === targetNamespaceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Source and target namespace cannot be the same",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!keys || keys.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "keys array is required and must not be empty",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  logInfo(
    `Starting key migration: ${keys.length} keys from ${sourceNamespaceId} to ${targetNamespaceId}`,
    createErrorContext("migrate", "migrate_keys_start", { userId: userEmail }),
  );

  // Mock for local development
  if (isLocalDev) {
    const mockResult: MigrationResult = {
      success: true,
      keysMigrated: keys.length,
      metadataMigrated: migrateMetadata ? keys.length : 0,
      errors: 0,
      verification: {
        passed: true,
        sourceKeyCount: keys.length,
        targetKeyCount: keys.length,
      },
      warnings: [],
    };
    return new Response(JSON.stringify(mockResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create job record and dispatch to Durable Object
  const jobId = generateJobId("migrate");
  const db = getD1Binding(env);

  try {
    // Create job record
    if (db) {
      await db
        .prepare(
          `
        INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email)
        VALUES (?, ?, 'migrate', 'queued', ?, CURRENT_TIMESTAMP, ?)
      `,
        )
        .bind(jobId, sourceNamespaceId, keys.length, userEmail)
        .run();
    }

    // Dispatch to Durable Object for async processing
    const doId = env.BULK_OPERATION_DO.idFromName(jobId);
    const stub = env.BULK_OPERATION_DO.get(doId);

    const params: BulkMigrateParams & { jobId: string } = {
      jobId,
      sourceNamespaceId,
      targetNamespaceId,
      keys,
      cutoverMode,
      migrateMetadata,
      preserveTTL,
      createBackup,
      userEmail,
    };

    const doRequest = new Request("https://do/process/bulk-migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    // Fire and await - we need to wait for the DO to start processing
    await stub.fetch(doRequest);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        status: "queued",
        message: `Migration job started for ${keys.length} keys`,
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    await logError(
      env,
      error instanceof Error ? error : String(error),
      createErrorContext("migrate", "migrate_keys_error", {
        userId: userEmail,
      }),
      isLocalDev,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to start migration job",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Migrate all keys from one namespace to another
 */
async function migrateNamespace(
  request: Request,
  env: Env,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string,
): Promise<Response> {
  let body: MigrateKeysBody;
  try {
    body = (await request.json()) as MigrateKeysBody;
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const {
    sourceNamespaceId,
    targetNamespaceId,
    cutoverMode = "copy",
    migrateMetadata = true,
    preserveTTL = true,
    createBackup = true, // Default to true for full namespace migration
  } = body;

  // Validation
  if (!sourceNamespaceId || !targetNamespaceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "sourceNamespaceId and targetNamespaceId are required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (sourceNamespaceId === targetNamespaceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Source and target namespace cannot be the same",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  logInfo(
    `Starting full namespace migration from ${sourceNamespaceId} to ${targetNamespaceId}`,
    createErrorContext("migrate", "migrate_namespace_start", {
      userId: userEmail,
    }),
  );

  // Mock for local development
  if (isLocalDev) {
    const mockResult: MigrationResult = {
      success: true,
      keysMigrated: 50,
      metadataMigrated: migrateMetadata ? 50 : 0,
      errors: 0,
      verification: { passed: true, sourceKeyCount: 50, targetKeyCount: 50 },
      warnings: [],
    };
    if (createBackup) {
      mockResult.backupPath = `backups/${sourceNamespaceId}/1234567890.json`;
    }
    return new Response(
      JSON.stringify({ jobId: "mock-job-id", ...mockResult }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Get all keys from source namespace
  const { keys: sourceKeys, error: listError } = await getAllNamespaceKeys(
    sourceNamespaceId,
    env,
    preserveTTL,
  );

  if (listError) {
    return new Response(JSON.stringify({ success: false, error: listError }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (sourceKeys.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Source namespace has no keys to migrate",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Extract key names for migration
  const keyNames = sourceKeys.map((k) => k.name);

  // Create job record and dispatch to Durable Object
  const jobId = generateJobId("migrate");
  const db = getD1Binding(env);

  try {
    // Create job record
    if (db) {
      await db
        .prepare(
          `
        INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, total_keys, started_at, user_email, metadata)
        VALUES (?, ?, 'migrate', 'queued', ?, CURRENT_TIMESTAMP, ?, ?)
      `,
        )
        .bind(
          jobId,
          sourceNamespaceId,
          keyNames.length,
          userEmail,
          JSON.stringify({
            targetNamespaceId,
            cutoverMode,
            fullNamespace: true,
          }),
        )
        .run();
    }

    // Dispatch to Durable Object for async processing
    const doId = env.BULK_OPERATION_DO.idFromName(jobId);
    const stub = env.BULK_OPERATION_DO.get(doId);

    const params: BulkMigrateParams & {
      jobId: string;
      keyExpirations?: Record<string, number>;
    } = {
      jobId,
      sourceNamespaceId,
      targetNamespaceId,
      keys: keyNames,
      cutoverMode,
      migrateMetadata,
      preserveTTL,
      createBackup,
      userEmail,
    };

    // Pass expiration data for TTL preservation
    if (preserveTTL) {
      const expirations = Object.fromEntries(
        sourceKeys
          .filter((k) => k.expiration !== undefined)
          .map((k) => [k.name, k.expiration as number]),
      );
      if (Object.keys(expirations).length > 0) {
        params.keyExpirations = expirations;
      }
    }

    const doRequest = new Request("https://do/process/bulk-migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    // Fire and await
    await stub.fetch(doRequest);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        status: "queued",
        message: `Migration job started for ${keyNames.length} keys`,
        totalKeys: keyNames.length,
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    await logError(
      env,
      error instanceof Error ? error : String(error),
      createErrorContext("migrate", "migrate_namespace_error", {
        userId: userEmail,
      }),
      isLocalDev,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to start migration job",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}
