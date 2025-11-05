import { useState, useEffect } from 'react'
import { api, type KVNamespace } from './services/api'
import { auth } from './services/auth'
import { useTheme } from './hooks/useTheme'
import { Database, Plus, Moon, Sun, Monitor, Loader2 } from 'lucide-react'
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
  
  // Bulk operations state
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])

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
            <div className="text-center py-12">
              <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Key Browser</h3>
              <p className="text-muted-foreground">
                Namespace: <span className="font-mono">{currentView.namespaceTitle}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Key browsing interface coming soon...
              </p>
            </div>
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
    </div>
  )
}

