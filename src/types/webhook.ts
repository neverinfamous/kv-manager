/**
 * Webhook Types for KV Manager
 *
 * Defines webhook event types and data structures for external monitoring integration.
 */

/**
 * Webhook event types for KV Manager
 */
export type WebhookEventType =
  | "key_create"
  | "key_update"
  | "key_delete"
  | "bulk_delete_complete"
  | "bulk_copy_complete"
  | "bulk_ttl_complete"
  | "bulk_tag_complete"
  | "import_complete"
  | "export_complete"
  | "backup_complete"
  | "restore_complete"
  | "job_failed"
  | "batch_complete";

/**
 * Webhook from API
 */
export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string; // JSON array of WebhookEventType
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Webhook create/update request
 */
export interface WebhookInput {
  name: string;
  url: string;
  secret?: string | null;
  events: WebhookEventType[];
  enabled?: boolean;
}

/**
 * Webhook test result
 */
export interface WebhookTestResult {
  success: boolean;
  message?: string;
  statusCode?: number;
  statusText?: string;
  error?: string;
}

/**
 * API response types
 */
export interface WebhooksResponse {
  success: boolean;
  result?: {
    webhooks: Webhook[];
  };
  error?: string;
}

export interface WebhookResponse {
  success: boolean;
  result?: {
    webhook: Webhook;
  };
  error?: string;
}

export interface WebhookTestResponse {
  success: boolean;
  result?: WebhookTestResult;
  error?: string;
}

/**
 * Event type labels for UI display
 */
export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  key_create: "Key Created",
  key_update: "Key Updated",
  key_delete: "Key Deleted",
  bulk_delete_complete: "Bulk Delete Complete",
  bulk_copy_complete: "Bulk Copy Complete",
  bulk_ttl_complete: "Bulk TTL Update Complete",
  bulk_tag_complete: "Bulk Tag Update Complete",
  import_complete: "Import Complete",
  export_complete: "Export Complete",
  backup_complete: "Backup Complete",
  restore_complete: "Restore Complete",
  job_failed: "Job Failed",
  batch_complete: "Batch Operation Complete",
};

/**
 * All available webhook event types
 */
export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = [
  "key_create",
  "key_update",
  "key_delete",
  "bulk_delete_complete",
  "bulk_copy_complete",
  "bulk_ttl_complete",
  "bulk_tag_complete",
  "import_complete",
  "export_complete",
  "backup_complete",
  "restore_complete",
  "job_failed",
  "batch_complete",
];
