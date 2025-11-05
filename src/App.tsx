import { useState, useEffect, useCallback } from 'react'
import { api, type KVNamespace, type KVKey } from './services/api'
import { auth } from './services/auth'
import { useTheme } from './hooks/useTheme'
import { Database, Plus, Moon, Sun, Monitor, Loader2, Trash2, Key, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KeyEditorDialog } from './components/KeyEditorDialog'

type View = 
  | { type: 'list' }
  | { type: 'namespace'; namespaceId: string; namespaceTitle: string }

export default function App() {
  const [namespaces, setNamespaces] = useState<KVNamespace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newNamespaceTitle, setNewNamespaceTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [currentView, setCurrentView] = useState<View>({ type: 'list' })
  const { theme, setTheme } = useTheme()
  
  // Rename namespace state
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameNamespaceId, setRenameNamespaceId] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  
  // Bulk operations state
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
  
  // Key browser state
  const [keys, setKeys] = useState<KVKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [keyPrefix, setKeyPrefix] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [keysCursor, setKeysCursor] = useState<string | undefined>()
  const [keysListComplete, setKeysListComplete] = useState(true)
  
  // Create key state
  const [showCreateKeyDialog, setShowCreateKeyDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [newKeyTTL, setNewKeyTTL] = useState('')
  const [newKeyMetadata, setNewKeyMetadata] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  
  // Edit key state
  const [selectedKeyForEdit, setSelectedKeyForEdit] = useState<string | null>(null)

  // Load namespaces on mount
  useEffect(() => {
    loadNamespaces()
  }, [])

  const loadNamespaces = async () => {
    try {
      setLoading(true)
      setError('')
      const ns = await api.listNamespaces()
      setNamespaces(ns)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load namespaces')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNamespace = async () => {
    if (!newNamespaceTitle.trim()) return

    try {
      setCreating(true)
      await api.createNamespace(newNamespaceTitle.trim())
      setShowCreateDialog(false)
      setNewNamespaceTitle('')
      await loadNamespaces()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create namespace')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteNamespace = async (namespaceId: string) => {
    if (!confirm('Are you sure you want to delete this namespace? This action cannot be undone.')) {
      return
    }

    try {
      await api.deleteNamespace(namespaceId)
      await loadNamespaces()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete namespace')
    }
  }

  const handleRenameNamespace = async () => {
    if (!renameTitle.trim()) return

    try {
      setRenaming(true)
      await api.renameNamespace(renameNamespaceId, renameTitle.trim())
      setShowRenameDialog(false)
      setRenameNamespaceId('')
      setRenameTitle('')
      await loadNamespaces()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename namespace')
    } finally {
      setRenaming(false)
    }
  }

  const openRenameDialog = (namespaceId: string, currentTitle: string) => {
    setRenameNamespaceId(namespaceId)
    setRenameTitle(currentTitle)
    setShowRenameDialog(true)
  }

  const cycleTheme = () => {
    const modes: Array<typeof theme> = ['system', 'light', 'dark']
    const currentIndex = modes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % modes.length
    setTheme(modes[nextIndex])
  }

  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor className="h-5 w-5" />
    if (theme === 'light') return <Sun className="h-5 w-5" />
    return <Moon className="h-5 w-5" />
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const toggleNamespaceSelection = (uuid: string) => {
    setSelectedNamespaces(prev => {
      if (prev.includes(uuid)) {
        return prev.filter(id => id !== uuid)
      } else {
        return [...prev, uuid]
      }
    })
  }

  const handleBulkDeleteNamespaces = async () => {
    if (selectedNamespaces.length === 0) return
    
    if (!confirm(`Are you sure you want to delete ${selectedNamespaces.length} namespace(s)? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      await Promise.all(selectedNamespaces.map(id => api.deleteNamespace(id)))
      setSelectedNamespaces([])
      await loadNamespaces()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete namespaces')
    } finally {
      setDeleting(false)
    }
  }

  const loadKeys = useCallback(async (namespaceId: string, append = false, cursor?: string) => {
    try {
      setKeysLoading(true)
      setError('')
      const response = await api.listKeys(namespaceId, { 
        prefix: keyPrefix || undefined,
        cursor: append ? cursor : undefined
      })
      setKeys(prev => append ? [...prev, ...response.keys] : response.keys)
      setKeysCursor(response.cursor)
      setKeysListComplete(response.list_complete)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys')
    } finally {
      setKeysLoading(false)
    }
  }, [keyPrefix])

  const loadMoreKeys = async (namespaceId: string) => {
    await loadKeys(namespaceId, true, keysCursor)
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim() || currentView.type !== 'namespace') return

    // Validate metadata if provided
    if (newKeyMetadata.trim()) {
      try {
        JSON.parse(newKeyMetadata)
      } catch {
        setError('Invalid JSON in metadata field')
        return
      }
    }

    try {
      setCreatingKey(true)
      setError('')
      
      const options: {
        expiration_ttl?: number
        metadata?: unknown
      } = {}
      if (newKeyTTL.trim()) {
        const ttl = parseInt(newKeyTTL)
        if (isNaN(ttl) || ttl <= 0) {
          setError('TTL must be a positive number')
          return
        }
        options.expiration_ttl = ttl
      }
      if (newKeyMetadata.trim()) {
        options.metadata = JSON.parse(newKeyMetadata)
      }

      await api.putKey(
        currentView.namespaceId,
        newKeyName.trim(),
        newKeyValue,
        options
      )

      setShowCreateKeyDialog(false)
      setNewKeyName('')
      setNewKeyValue('')
      setNewKeyTTL('')
      setNewKeyMetadata('')
      
      // Reset pagination and reload keys
      setKeysCursor(undefined)
      setKeysListComplete(true)
      await loadKeys(currentView.namespaceId, false, undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreatingKey(false)
    }
  }

  const toggleKeySelection = (keyName: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(keyName)) {
        return prev.filter(name => name !== keyName)
      } else {
        return [...prev, keyName]
      }
    })
  }

  const handleBulkDeleteKeys = async (namespaceId: string) => {
    if (selectedKeys.length === 0) return
    
    if (!confirm(`Are you sure you want to delete ${selectedKeys.length} key(s)? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      await api.bulkDeleteKeys(namespaceId, selectedKeys)
      setSelectedKeys([])
      setKeysCursor(undefined)
      setKeysListComplete(true)
      await loadKeys(namespaceId, false, undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete keys')
    } finally {
      setDeleting(false)
    }
  }

  // Load keys when viewing a namespace
  useEffect(() => {
    if (currentView.type === 'namespace') {
      setKeysCursor(undefined)
      setKeysListComplete(true)
      loadKeys(currentView.namespaceId)
    } else {
      setKeys([])
      setSelectedKeys([])
      setKeyPrefix('')
      setKeysCursor(undefined)
      setKeysListComplete(true)
    }
  }, [currentView, keyPrefix, loadKeys])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setCurrentView({ type: 'list' })}
          >
            <Database className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">KV Manager</h1>
              <p className="text-sm text-muted-foreground">Manage your Cloudflare Workers KV</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
            >
              {getThemeIcon()}
            </Button>
            <Button variant="outline" onClick={() => auth.logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentView.type === 'list' && (
          <>
            {/* Actions Bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold">Namespaces</h2>
                <p className="text-muted-foreground mt-1">
                  {namespaces.length} {namespaces.length === 1 ? 'namespace' : 'namespaces'}
                </p>
              </div>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Namespace
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty State */}
            {!loading && namespaces.length === 0 && (
              <div className="text-center py-12">
                <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No namespaces yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first KV namespace to get started
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Namespace
                </Button>
              </div>
            )}

            {/* Bulk Actions Bar */}
            {selectedNamespaces.length > 0 && (
              <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedNamespaces.length === namespaces.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedNamespaces(namespaces.map(ns => ns.id))
                      } else {
                        setSelectedNamespaces([])
                      }
                    }}
                  />
                  <span className="font-medium">
                    {selectedNamespaces.length} namespace{selectedNamespaces.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteNamespaces}
                  disabled={deleting}
                >
                  {deleting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-2" /> Delete Selected</>
                  )}
                </Button>
              </div>
            )}

            {/* Namespace Grid */}
            {!loading && namespaces.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {namespaces.map((ns) => {
                  const isSelected = selectedNamespaces.includes(ns.id)
                  return (
                    <Card 
                      key={ns.id} 
                      className={`hover:shadow-lg transition-shadow relative ${
                        isSelected ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <div className="absolute top-4 left-4 z-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleNamespaceSelection(ns.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <CardHeader className="pl-12">
                        <div className="flex items-start justify-between">
                          <Database className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle className="mt-4">{ns.title}</CardTitle>
                        <CardDescription className="font-mono text-xs">{ns.id}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm mb-4">
                          {ns.last_accessed && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Accessed:</span>
                              <span className="font-medium">{formatDate(ns.last_accessed)}</span>
                            </div>
                          )}
                          {ns.estimated_key_count !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Est. Keys:</span>
                              <span className="font-medium">{ns.estimated_key_count}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => setCurrentView({ 
                              type: 'namespace', 
                              namespaceId: ns.id,
                              namespaceTitle: ns.title
                            })}
                          >
                            <Database className="h-3.5 w-3.5 mr-1.5" />
                            Browse Keys
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openRenameDialog(ns.id, ns.title)}
                          >
                            Rename
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteNamespace(ns.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {currentView.type === 'namespace' && (
          <div>
            <Button 
              variant="outline" 
              onClick={() => setCurrentView({ type: 'list' })}
              className="mb-6"
            >
              ← Back to Namespaces
            </Button>

            {/* Key Browser Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold">Keys</h2>
                <p className="text-muted-foreground mt-1">
                  <span className="font-mono">{currentView.namespaceTitle}</span> • {keys.length} {keys.length === 1 ? 'key' : 'keys'}
                </p>
              </div>
              <Button onClick={() => setShowCreateKeyDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Key
              </Button>
            </div>

            {/* Search/Filter Bar */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="key-prefix-filter"
                    name="prefix"
                    placeholder="Filter by prefix..."
                    value={keyPrefix}
                    onChange={(e) => setKeyPrefix(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedKeys.length > 0 && (
              <div className="bg-primary/10 border border-primary rounded-lg p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedKeys.length === keys.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedKeys(keys.map(k => k.name))
                      } else {
                        setSelectedKeys([])
                      }
                    }}
                  />
                  <span className="font-medium">
                    {selectedKeys.length} key{selectedKeys.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleBulkDeleteKeys(currentView.namespaceId)}
                  disabled={deleting}
                >
                  {deleting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-2" /> Delete Selected</>
                  )}
                </Button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Loading State */}
            {keysLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty State */}
            {!keysLoading && keys.length === 0 && (
              <div className="text-center py-12">
                <Key className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No keys found</h3>
                <p className="text-muted-foreground mb-4">
                  {keyPrefix ? `No keys match the prefix "${keyPrefix}"` : 'This namespace is empty'}
                </p>
              </div>
            )}

            {/* Keys Table */}
            {!keysLoading && keys.length > 0 && (
              <>
                <div className="border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="w-12 p-4">
                          <Checkbox
                            checked={selectedKeys.length === keys.length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedKeys(keys.map(k => k.name))
                              } else {
                                setSelectedKeys([])
                              }
                            }}
                          />
                        </th>
                        <th className="text-left p-4 font-semibold">Key Name</th>
                        <th className="text-left p-4 font-semibold">Expiration</th>
                        <th className="w-24 p-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const isSelected = selectedKeys.includes(key.name)
                        return (
                          <tr 
                            key={key.name} 
                            className={`border-t hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}
                          >
                            <td className="p-4">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleKeySelection(key.name)}
                              />
                            </td>
                            <td className="p-4">
                              <div 
                                className="font-mono text-sm cursor-pointer hover:text-primary hover:underline"
                                onClick={() => setSelectedKeyForEdit(key.name)}
                              >
                                {key.name}
                              </div>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {key.expiration ? new Date(key.expiration * 1000).toLocaleString() : 'Never'}
                            </td>
                            <td className="p-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (confirm(`Delete key "${key.name}"?`)) {
                                    try {
                                      await api.deleteKey(currentView.namespaceId, key.name)
                                      setKeysCursor(undefined)
                                      setKeysListComplete(true)
                                      await loadKeys(currentView.namespaceId, false, undefined)
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : 'Failed to delete key')
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Load More Button */}
                {!keysListComplete && (
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="outline"
                      onClick={() => loadMoreKeys(currentView.namespaceId)}
                      disabled={keysLoading}
                    >
                      {keysLoading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Create Namespace Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Namespace</DialogTitle>
            <DialogDescription>
              Enter a title for your new KV namespace. The title must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Namespace Title</Label>
              <Input
                id="title"
                placeholder="my-kv-namespace"
                value={newNamespaceTitle}
                onChange={(e) => setNewNamespaceTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creating) {
                    handleCreateNamespace()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateNamespace} disabled={creating || !newNamespaceTitle.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Namespace Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Namespace</DialogTitle>
            <DialogDescription>
              Enter a new title for this namespace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-title">Namespace Title</Label>
              <Input
                id="rename-title"
                placeholder="my-kv-namespace"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !renaming) {
                    handleRenameNamespace()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameNamespace} disabled={renaming || !renameTitle.trim()}>
              {renaming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Key Dialog */}
      <Dialog open={showCreateKeyDialog} onOpenChange={setShowCreateKeyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Key</DialogTitle>
            <DialogDescription>
              Add a new key-value pair to this namespace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="key-name">Key Name *</Label>
              <Input
                id="key-name"
                placeholder="my-key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key-value">Value *</Label>
              <Textarea
                id="key-value"
                placeholder="Enter the value..."
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                className="font-mono min-h-[200px]"
                rows={10}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key-ttl">TTL (seconds)</Label>
              <Input
                id="key-ttl"
                type="number"
                placeholder="Leave empty for no expiration"
                value={newKeyTTL}
                onChange={(e) => setNewKeyTTL(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key-metadata">Metadata (JSON)</Label>
              <Textarea
                id="key-metadata"
                placeholder='{"key": "value"}'
                value={newKeyMetadata}
                onChange={(e) => setNewKeyMetadata(e.target.value)}
                className="font-mono"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateKeyDialog(false)
                setNewKeyName('')
                setNewKeyValue('')
                setNewKeyTTL('')
                setNewKeyMetadata('')
              }}
              disabled={creatingKey}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()}>
              {creatingKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Key Editor Dialog */}
      {currentView.type === 'namespace' && selectedKeyForEdit && (
        <KeyEditorDialog
          open={!!selectedKeyForEdit}
          onOpenChange={(open) => {
            if (!open) setSelectedKeyForEdit(null)
          }}
          namespaceId={currentView.namespaceId}
          keyName={selectedKeyForEdit}
          onSaved={async () => {
            // Reload keys from the beginning
            setKeysCursor(undefined)
            setKeysListComplete(true)
            // Call loadKeys without cursor to get fresh data
            await loadKeys(currentView.namespaceId, false, undefined)
          }}
        />
      )}
    </div>
  )
}

