// Import Cloudflare Workers types
import type { Fetcher, D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';

// Cloudflare Worker Environment
export interface Env {
  ASSETS: Fetcher
  METADATA: D1Database
  BULK_OPERATION_DO: DurableObjectNamespace
  IMPORT_EXPORT_DO: DurableObjectNamespace
  
  // Cloudflare API credentials (secrets in production, undefined in local dev)
  ACCOUNT_ID?: string
  API_KEY?: string
  
  // Cloudflare Access JWT validation
  TEAM_DOMAIN?: string
  POLICY_AUD?: string
  
  // Environment indicator
  ENVIRONMENT?: string
  
  // Dynamic KV namespace bindings (configured in wrangler.toml)
  [key: string]: unknown
}

// KV Namespace API Response Types
export interface KVNamespaceInfo {
  id: string
  title: string
  supports_url_encoding?: boolean
  first_accessed?: string
  last_accessed?: string
  estimated_key_count?: number
}

export interface KVKeyInfo {
  name: string
  expiration?: number
  metadata?: unknown
}

export interface KVKeyListResponse {
  result: KVKeyInfo[]
  result_info: {
    count: number
    cursor?: string
  }
  success: boolean
  errors: unknown[]
  messages: unknown[]
}

// D1 Metadata Types
export interface KeyMetadata {
  id?: number
  namespace_id: string
  key_name: string
  tags?: string // JSON array
  custom_metadata?: string // JSON object
  created_at?: string
  updated_at?: string
}

export interface AuditLogEntry {
  id?: number
  namespace_id: string
  key_name?: string
  operation: string
  user_email?: string
  timestamp?: string
  details?: string // JSON object
}

export interface BulkJob {
  job_id: string
  namespace_id: string
  operation_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_keys?: number
  processed_keys?: number
  error_count?: number
  started_at?: string
  completed_at?: string
  user_email?: string
}

// API Response Wrapper
export interface APIResponse<T = unknown> {
  success: boolean
  result?: T
  error?: string
  errors?: string[]
}

// Mock Data Type for Local Development
export interface MockKVData {
  namespaces: KVNamespaceInfo[]
  keys: Record<string, KVKeyInfo[]>
  values: Record<string, string>
  metadata: Record<string, KeyMetadata>
  auditLog: AuditLogEntry[]
  bulkJobs: BulkJob[]
}

