const WORKER_API = import.meta.env.VITE_WORKER_API || window.location.origin

// KV Namespace types
export interface KVNamespace {
  id: string
  title: string
  first_accessed?: string
  last_accessed?: string
  estimated_key_count?: number
}

// KV Key types
export interface KVKey {
  name: string
  expiration?: number
  metadata?: unknown
}

export interface KVKeyListResponse {
  keys: KVKey[]
  list_complete: boolean
  cursor?: string
}

export interface KVKeyWithValue extends KVKey {
  value: string
  size?: number
}

// Metadata types
export interface KeyMetadata {
  namespace_id: string
  key_name: string
  tags?: string[]
  custom_metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

// Search types
export interface SearchResult {
  namespace_id: string
  key_name: string
  tags?: string[]
  custom_metadata?: Record<string, unknown>
  value_preview?: string
}

// Job Progress types
export interface JobProgress {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: {
    total: number
    processed: number
    errors: number
    currentKey?: string
    percentage: number
  }
  result?: {
    processed?: number
    errors?: number
    skipped?: number
    downloadUrl?: string
    format?: string
  }
  error?: string
}

export interface BulkJobResponse {
  job_id: string
  status: string
  ws_url: string
  total_keys?: number
}

// Job Event types
export interface JobEvent {
  id: number
  job_id: string
  event_type: 'started' | 'progress_25' | 'progress_50' | 'progress_75' | 'completed' | 'failed' | 'cancelled'
  user_email: string
  timestamp: string
  details: string | null
}

export interface JobEventDetails {
  total?: number
  processed?: number
  errors?: number
  percentage?: number
  error_message?: string
  [key: string]: unknown
}

export interface JobEventsResponse {
  job_id: string
  events: JobEvent[]
}

// Job List types
export interface JobListItem {
  job_id: string
  namespace_id: string
  operation_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_keys: number | null
  processed_keys: number | null
  error_count: number | null
  percentage: number
  started_at: string
  completed_at: string | null
  user_email: string
}

export interface JobListResponse {
  jobs: JobListItem[]
  total: number
  limit: number
  offset: number
}

class APIService {
  /**
   * Get fetch options with credentials
   */
  private getFetchOptions(init?: RequestInit): RequestInit {
    return {
      ...init,
      credentials: 'include',
      cache: 'no-store'
    }
  }

  /**
   * Handle API response
   */
  private async handleResponse(response: Response): Promise<Response> {
    if (response.status === 401 || response.status === 403) {
      console.error('[API] Authentication error:', response.status);
      localStorage.clear();
      sessionStorage.clear();
      throw new Error(`Authentication error: ${response.status}`);
    }
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return response;
  }

  /**
   * List all KV namespaces
   */
  async listNamespaces(): Promise<KVNamespace[]> {
    const response = await fetch(`${WORKER_API}/api/namespaces`, 
      this.getFetchOptions()
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result || []
  }

  /**
   * Create a new namespace
   */
  async createNamespace(title: string): Promise<KVNamespace> {
    const response = await fetch(`${WORKER_API}/api/namespaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ title })
    })
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Delete a namespace
   */
  async deleteNamespace(namespaceId: string): Promise<void> {
    const response = await fetch(`${WORKER_API}/api/namespaces/${namespaceId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    await this.handleResponse(response);
  }

  /**
   * Rename a namespace
   */
  async renameNamespace(namespaceId: string, title: string): Promise<KVNamespace> {
    const response = await fetch(`${WORKER_API}/api/namespaces/${namespaceId}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ title })
    })
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get namespace info
   */
  async getNamespaceInfo(namespaceId: string): Promise<KVNamespace> {
    const response = await fetch(`${WORKER_API}/api/namespaces/${namespaceId}/info`, {
      credentials: 'include'
    })
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * List keys in a namespace
   */
  async listKeys(
    namespaceId: string,
    options?: { prefix?: string; cursor?: string; limit?: number }
  ): Promise<KVKeyListResponse> {
    const params = new URLSearchParams()
    if (options?.prefix) params.set('prefix', options.prefix)
    if (options?.cursor) params.set('cursor', options.cursor)
    if (options?.limit) params.set('limit', options.limit.toString())

    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/list?${params.toString()}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get a key's value
   */
  async getKey(namespaceId: string, keyName: string): Promise<KVKeyWithValue> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Create or update a key
   */
  async putKey(
    namespaceId: string,
    keyName: string,
    value: string,
    options?: { metadata?: unknown; expiration_ttl?: number; create_backup?: boolean }
  ): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ value, ...options })
      }
    )
    
    await this.handleResponse(response);
  }

  /**
   * Delete a key
   */
  async deleteKey(namespaceId: string, keyName: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: 'DELETE',
        credentials: 'include'
      }
    )
    
    await this.handleResponse(response);
  }

  /**
   * Bulk delete keys (async with job tracking)
   */
  async bulkDeleteKeys(namespaceId: string, keys: string[]): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ keys })
      }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get key metadata from D1
   */
  async getMetadata(namespaceId: string, keyName: string): Promise<KeyMetadata> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/${encodeURIComponent(keyName)}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Update key metadata
   */
  async updateMetadata(
    namespaceId: string,
    keyName: string,
    metadata: { tags?: string[]; custom_metadata?: Record<string, unknown> }
  ): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/${encodeURIComponent(keyName)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(metadata)
      }
    )
    
    await this.handleResponse(response);
  }

  /**
   * Search keys
   */
  async searchKeys(options: {
    query?: string;
    namespace_id?: string;
    tags?: string[];
  }): Promise<SearchResult[]> {
    const params = new URLSearchParams()
    if (options.query) params.set('query', options.query)
    if (options.namespace_id) params.set('namespaceId', options.namespace_id)
    if (options.tags) params.set('tags', options.tags.join(','))

    const response = await fetch(
      `${WORKER_API}/api/search?${params.toString()}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Check if backup exists
   */
  async checkBackup(namespaceId: string, keyName: string): Promise<boolean> {
    const response = await fetch(
      `${WORKER_API}/api/backup/${namespaceId}/${encodeURIComponent(keyName)}/check`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result.exists
  }

  /**
   * Restore from backup
   */
  async restoreBackup(namespaceId: string, keyName: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/backup/${namespaceId}/${encodeURIComponent(keyName)}/undo`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    
    await this.handleResponse(response);
  }

  /**
   * Bulk copy keys to another namespace (async with job tracking)
   */
  async bulkCopyKeys(
    namespaceId: string, 
    keys: string[], 
    targetNamespaceId: string
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-copy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ keys, target_namespace_id: targetNamespaceId })
      }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Bulk update TTL for keys (async with job tracking)
   */
  async bulkUpdateTTL(
    namespaceId: string, 
    keys: string[], 
    expirationTtl: number
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/keys/${namespaceId}/bulk-ttl`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ keys, expiration_ttl: expirationTtl })
      }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Bulk tag keys (async with job tracking)
   */
  async bulkTagKeys(
    namespaceId: string,
    keys: string[],
    tags: string[],
    operation: 'add' | 'remove' | 'replace' = 'replace'
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/metadata/${namespaceId}/bulk-tag`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ keys, tags, operation })
      }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Export namespace (async with job tracking)
   */
  async exportNamespace(namespaceId: string, format: 'json' | 'ndjson' = 'json'): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/export/${namespaceId}?format=${format}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Import keys to namespace (async with job tracking)
   */
  async importKeys(
    namespaceId: string,
    data: string,
    collision: 'skip' | 'overwrite' | 'fail' = 'overwrite'
  ): Promise<BulkJobResponse> {
    const response = await fetch(
      `${WORKER_API}/api/import/${namespaceId}?collision=${collision}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        credentials: 'include',
        body: data
      }
    )
    
    await this.handleResponse(response);
    
    const data_result = await response.json()
    return data_result.result
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    const response = await fetch(
      `${WORKER_API}/api/jobs/${jobId}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get audit log for namespace
   */
  async getAuditLog(
    namespaceId: string,
    options?: { limit?: number; offset?: number; operation?: string }
  ): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.operation) params.set('operation', options.operation)

    const response = await fetch(
      `${WORKER_API}/api/audit/${namespaceId}?${params.toString()}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get audit log for user
   */
  async getUserAuditLog(
    userEmail: string,
    options?: { limit?: number; offset?: number; operation?: string }
  ): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.operation) params.set('operation', options.operation)

    const response = await fetch(
      `${WORKER_API}/api/audit/user/${encodeURIComponent(userEmail)}?${params.toString()}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Download export file from completed export job
   */
  async downloadExport(jobId: string, filename: string): Promise<void> {
    const response = await fetch(
      `${WORKER_API}/api/jobs/${jobId}/download`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Get job events (event timeline) for a specific job
   */
  async getJobEvents(jobId: string): Promise<JobEventsResponse> {
    const response = await fetch(
      `${WORKER_API}/api/jobs/${jobId}/events`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }

  /**
   * Get list of jobs with optional filters
   */
  async getJobList(options?: {
    limit?: number
    offset?: number
    status?: string
    operation_type?: string
    namespace_id?: string
    start_date?: string
    end_date?: string
    job_id?: string
    min_errors?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }): Promise<JobListResponse> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())
    if (options?.status) params.set('status', options.status)
    if (options?.operation_type) params.set('operation_type', options.operation_type)
    if (options?.namespace_id) params.set('namespace_id', options.namespace_id)
    if (options?.start_date) params.set('start_date', options.start_date)
    if (options?.end_date) params.set('end_date', options.end_date)
    if (options?.job_id) params.set('job_id', options.job_id)
    if (options?.min_errors !== undefined) params.set('min_errors', options.min_errors.toString())
    if (options?.sort_by) params.set('sort_by', options.sort_by)
    if (options?.sort_order) params.set('sort_order', options.sort_order)

    const response = await fetch(
      `${WORKER_API}/api/jobs?${params.toString()}`,
      { credentials: 'include' }
    )
    
    await this.handleResponse(response);
    
    const data = await response.json()
    return data.result
  }
}

export const api = new APIService()

