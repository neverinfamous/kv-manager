import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Search, ExternalLink } from 'lucide-react'
import { api, type SearchResult, type KVNamespace } from '../services/api'

interface SearchKeysProps {
  namespaces: KVNamespace[]
  onNavigateToKey?: (namespaceId: string, keyName: string) => void
}

export function SearchKeys({ namespaces, onNavigateToKey }: SearchKeysProps) {
  const [query, setQuery] = useState('')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTriggered, setSearchTriggered] = useState(false)

  // Debounce search
  useEffect(() => {
    if (!query && !tagFilter) {
      setResults([])
      setSearchTriggered(false)
      return
    }

    const timer = setTimeout(() => {
      performSearch()
    }, 300)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedNamespace, tagFilter])

  const performSearch = async () => {
    try {
      setLoading(true)
      setError('')
      setSearchTriggered(true)

      const searchOptions: {
        query?: string
        namespace_id?: string
        tags?: string[]
      } = {}

      if (query) searchOptions.query = query
      if (selectedNamespace !== 'all') searchOptions.namespace_id = selectedNamespace
      if (tagFilter) searchOptions.tags = tagFilter.split(',').map(t => t.trim()).filter(Boolean)

      const data = await api.searchKeys(searchOptions)
      setResults(data)
    } catch (err) {
      console.error('Search failed:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleNavigate = (result: SearchResult) => {
    onNavigateToKey?.(result.namespace_id, result.key_name)
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-2xl font-bold mb-4">Search Keys</h2>

        {/* Search Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Query Input */}
            <div className="space-y-2">
              <Label>Search Query</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search key names..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Namespace Filter */}
            <div className="space-y-2">
              <Label>Namespace</Label>
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger>
                  <SelectValue placeholder="All Namespaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Namespaces</SelectItem>
                  {namespaces.map((ns) => (
                    <SelectItem key={ns.id} value={ns.id}>
                      {ns.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tag Filter */}
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="e.g., production, config"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground">
          Searching...
        </div>
      )}

      {/* Results */}
      {!loading && searchTriggered && (
        <div className="bg-card rounded-lg border">
          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No results found</p>
              <p className="text-sm mt-1">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="divide-y">
              <div className="p-4 bg-muted/50">
                <p className="text-sm font-medium">
                  Found {results.length} result{results.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="divide-y">
                {results.map((result, index) => (
                  <div key={`${result.namespace_id}-${result.key_name}-${index}`} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {result.key_name}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Namespace: {namespaces.find(ns => ns.id === result.namespace_id)?.title || result.namespace_id}
                        </div>
                        {result.tags && result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {result.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => handleNavigate(result)}
                        variant="outline"
                        size="sm"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Key
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

