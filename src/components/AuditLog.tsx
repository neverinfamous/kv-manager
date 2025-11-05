import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Download } from 'lucide-react'
import { api, type KVNamespace } from '../services/api'

interface AuditLogProps {
  namespaces: KVNamespace[]
  selectedNamespaceId?: string
}

interface AuditEntry {
  id: number
  namespace_id: string
  key_name: string | null
  operation: string
  user_email: string
  timestamp: string
  details: string | null
}

export function AuditLog({ namespaces, selectedNamespaceId }: AuditLogProps) {
  const [viewMode, setViewMode] = useState<'namespace' | 'user'>('namespace')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(selectedNamespaceId || '')
  const [operationFilter, setOperationFilter] = useState<string>('all')
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 50

  useEffect(() => {
    if (selectedNamespaceId) {
      setSelectedNamespace(selectedNamespaceId)
      setViewMode('namespace')
    }
  }, [selectedNamespaceId])

  useEffect(() => {
    if (viewMode === 'namespace' && selectedNamespace) {
      loadLogs(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedNamespace, operationFilter])

  const loadLogs = async (reset = false) => {
    if (viewMode === 'namespace' && !selectedNamespace) return

    try {
      setLoading(true)
      setError('')

      const currentOffset = reset ? 0 : offset
      const options: { limit: number; offset: number; operation?: string } = {
        limit,
        offset: currentOffset
      }

      if (operationFilter !== 'all') {
        options.operation = operationFilter
      }

      const data = await api.getAuditLog(selectedNamespace, options)
      
      if (reset) {
        setLogs(data as unknown as AuditEntry[])
        setOffset(limit)
      } else {
        setLogs([...logs, ...(data as unknown as AuditEntry[])])
        setOffset(currentOffset + limit)
      }

      setHasMore(data.length === limit)
    } catch (err) {
      console.error('Failed to load audit log:', err)
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = () => {
    loadLogs(false)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'User', 'Operation', 'Key Name', 'Namespace', 'Details']
    const rows = logs.map(log => [
      log.timestamp,
      log.user_email || '',
      log.operation,
      log.key_name || '',
      log.namespace_id,
      log.details || ''
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${selectedNamespace}-${new Date().toISOString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const operationColors: Record<string, string> = {
    create: 'text-green-600 dark:text-green-400',
    update: 'text-blue-600 dark:text-blue-400',
    delete: 'text-red-600 dark:text-red-400',
    bulk_delete: 'text-red-700 dark:text-red-300',
    bulk_copy: 'text-purple-600 dark:text-purple-400',
    bulk_ttl_update: 'text-orange-600 dark:text-orange-400',
    export: 'text-cyan-600 dark:text-cyan-400',
    import: 'text-indigo-600 dark:text-indigo-400'
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Audit Log</h2>
          {logs.length > 0 && (
            <Button onClick={handleExportCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Namespace Selector */}
          <div className="space-y-2">
            <Label>Namespace</Label>
            <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
              <SelectTrigger>
                <SelectValue placeholder="Select a namespace" />
              </SelectTrigger>
              <SelectContent>
                {namespaces.map((ns) => (
                  <SelectItem key={ns.id} value={ns.id}>
                    {ns.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operation Filter */}
          <div className="space-y-2">
            <Label>Operation Type</Label>
            <Select value={operationFilter} onValueChange={setOperationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Operations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="bulk_delete">Bulk Delete</SelectItem>
                <SelectItem value="bulk_copy">Bulk Copy</SelectItem>
                <SelectItem value="bulk_ttl_update">Bulk TTL Update</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="import">Import</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Audit Log Entries */}
      {!selectedNamespace ? (
        <div className="bg-card rounded-lg border p-12 text-center text-muted-foreground">
          Select a namespace to view audit log
        </div>
      ) : loading && logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading audit log...
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card rounded-lg border p-12 text-center text-muted-foreground">
          No audit log entries found
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y">
          {logs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold text-sm ${operationColors[log.operation] || 'text-foreground'}`}>
                      {log.operation.toUpperCase()}
                    </span>
                    {log.key_name && (
                      <span className="font-mono text-sm text-muted-foreground">
                        {log.key_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.user_email || 'Unknown user'} • {formatTimestamp(log.timestamp)}
                  </div>
                  {log.details && (
                    <div className="text-xs text-muted-foreground mt-2 font-mono bg-muted p-2 rounded">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="p-4 text-center">
              <Button onClick={handleLoadMore} variant="outline" disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

