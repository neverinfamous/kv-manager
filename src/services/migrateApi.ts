/**
 * Migration API Service
 *
 * Client functions for cross-namespace key migration operations.
 */

import { apiLogger } from "../lib/logger";
import type { BulkJobResponse } from "./api";

const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin;

// Migration request types
export interface MigrateRequest {
  sourceNamespaceId: string;
  targetNamespaceId: string;
  keys?: string[];
  cutoverMode: "copy" | "copy_delete";
  migrateMetadata: boolean;
  preserveTTL: boolean;
  createBackup: boolean;
}

export interface MigrateNamespaceRequest {
  sourceNamespaceId: string;
  targetNamespaceId: string;
  cutoverMode: "copy" | "copy_delete";
  migrateMetadata: boolean;
  preserveTTL: boolean;
  createBackup: boolean;
}

export interface MigrateResponse {
  success: boolean;
  jobId: string;
  status: string;
  message: string;
  totalKeys?: number;
}

/**
 * Start a migration job for selected keys
 */
export async function migrateKeys(
  request: MigrateRequest,
): Promise<MigrateResponse> {
  apiLogger.info("Starting key migration", {
    source: request.sourceNamespaceId,
    target: request.targetNamespaceId,
    keyCount: request.keys?.length || 0,
  });

  const response = await fetch(`${WORKER_API}/api/migrate/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Migration failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a migration job for all keys in a namespace
 */
export async function migrateNamespace(
  request: MigrateNamespaceRequest,
): Promise<MigrateResponse> {
  apiLogger.info("Starting namespace migration", {
    source: request.sourceNamespaceId,
    target: request.targetNamespaceId,
  });

  const response = await fetch(`${WORKER_API}/api/migrate/namespace`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Migration failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert migration response to BulkJobResponse format for compatibility with BulkProgressDialog
 */
export function toBulkJobResponse(response: MigrateResponse): BulkJobResponse {
  const result: BulkJobResponse = {
    job_id: response.jobId,
    status: response.status,
    ws_url: `/api/jobs/${response.jobId}/ws`,
  };
  if (response.totalKeys !== undefined) {
    result.total_keys = response.totalKeys;
  }
  return result;
}
