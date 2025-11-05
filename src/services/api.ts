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
   * Bulk delete keys
   */
  async bulkDeleteKeys(namespaceId: string, keys: string[]): Promise<{ status: string; total_keys: number; processed_keys: number }> {
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
}

export const api = new APIService()

