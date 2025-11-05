import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { formatBytes, isValidJSON, formatJSON } from '../lib/utils'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface KeyEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceId: string
  keyName: string
  onSaved: () => void
}

export function KeyEditorDialog({
  open,
  onOpenChange,
  namespaceId,
  keyName,
  onSaved,
}: KeyEditorDialogProps) {
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [originalValue, setOriginalValue] = useState('')
  const [metadata, setMetadata] = useState('')
  const [ttl, setTTL] = useState('')
  const [hasBackup, setHasBackup] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'value' | 'metadata' | 'backup'>('value')
  const [valueSize, setValueSize] = useState(0)
  const [isJSON, setIsJSON] = useState(false)
  const [showFormatted, setShowFormatted] = useState(false)

  // Define callbacks before useEffect
  const loadKeyData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await api.getKey(namespaceId, keyName)
      setValue(result.value)
      setOriginalValue(result.value)
      setValueSize(result.size || new Blob([result.value]).size)
      
      if (result.metadata) {
        setMetadata(JSON.stringify(result.metadata, null, 2))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load key')
    } finally {
      setLoading(false)
    }
  }, [namespaceId, keyName])

  const checkBackup = useCallback(async () => {
    try {
      const exists = await api.checkBackup(namespaceId, keyName)
      setHasBackup(exists)
    } catch {
      setHasBackup(false)
    }
  }, [namespaceId, keyName])

  // Load key data when dialog opens
  useEffect(() => {
    if (open && keyName) {
      loadKeyData()
      checkBackup()
    } else {
      // Reset state when dialog closes
      setValue('')
      setOriginalValue('')
      setMetadata('')
      setTTL('')
      setError('')
      setActiveTab('value')
      setShowFormatted(false)
    }
  }, [open, keyName, namespaceId, loadKeyData, checkBackup])

  // Detect if value is JSON
  useEffect(() => {
    const validJSON = isValidJSON(value)
    setIsJSON(validJSON)
  }, [value])

  const handleSave = async () => {
    // Validate metadata if provided
    if (metadata.trim()) {
      if (!isValidJSON(metadata)) {
        setError('Invalid JSON in metadata field')
        return
      }
    }

    // Validate TTL if provided
    if (ttl.trim()) {
      const ttlNum = parseInt(ttl)
      if (isNaN(ttlNum) || ttlNum <= 0) {
        setError('TTL must be a positive number')
        return
      }
    }

    try {
      setSaving(true)
      setError('')

      const options: {
        create_backup: boolean
        expiration_ttl?: number
        metadata?: unknown
      } = {
        create_backup: true // Always create backup when editing
      }

      if (ttl.trim()) {
        options.expiration_ttl = parseInt(ttl)
      }

      if (metadata.trim()) {
        options.metadata = JSON.parse(metadata)
      }

      await api.putKey(namespaceId, keyName, value, options)
      
      // Notify parent to refresh (await if it returns a promise)
      await Promise.resolve(onSaved())
      
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async () => {
    if (!confirm('Are you sure you want to restore the previous version? Current changes will be lost.')) {
      return
    }

    try {
      setRestoring(true)
      setError('')
      await api.restoreBackup(namespaceId, keyName)
      
      // Reload the key data in the dialog
      await loadKeyData()
      setHasBackup(false)
      
      // Notify parent to refresh the list (await if it returns a promise)
      await Promise.resolve(onSaved())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup')
    } finally {
      setRestoring(false)
    }
  }

  const getDisplayValue = () => {
    if (showFormatted && isJSON) {
      return formatJSON(value)
    }
    return value
  }

  const toggleFormatting = () => {
    if (isJSON) {
      setShowFormatted(!showFormatted)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Key</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{keyName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'value' | 'metadata' | 'backup')} className="flex-1 flex flex-col">
              <TabsList>
                <TabsTrigger value="value">Value</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="backup">Backup</TabsTrigger>
              </TabsList>

              <TabsContent value="value" className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Size: {formatBytes(valueSize)}
                    {isJSON && <span className="ml-2">• JSON detected</span>}
                  </div>
                  {isJSON && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleFormatting}
                    >
                      {showFormatted ? 'Show Minified' : 'Format JSON'}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="key-value-editor"
                  name="key-value"
                  value={getDisplayValue()}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setValueSize(new Blob([e.target.value]).size)
                    if (showFormatted) setShowFormatted(false)
                  }}
                  className="font-mono flex-1 min-h-[400px]"
                  placeholder="Enter value..."
                />
              </TabsContent>

              <TabsContent value="metadata" className="flex-1 flex flex-col gap-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-ttl">TTL (seconds)</Label>
                    <Input
                      id="edit-ttl"
                      type="number"
                      placeholder="Leave empty for no expiration"
                      value={ttl}
                      onChange={(e) => setTTL(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Set time-to-live in seconds. Key will expire after this duration.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-metadata">Custom Metadata (JSON)</Label>
                    <Textarea
                      id="edit-metadata"
                      placeholder='{"key": "value"}'
                      value={metadata}
                      onChange={(e) => setMetadata(e.target.value)}
                      className="font-mono min-h-[200px]"
                      rows={8}
                    />
                    <p className="text-sm text-muted-foreground">
                      Optional JSON metadata to store with this key.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="backup" className="flex-1 flex flex-col gap-4">
                {hasBackup ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-muted p-4">
                      <h4 className="font-semibold mb-2">Backup Available</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        A backup of the previous version of this key exists. You can restore it to undo your last change.
                      </p>
                      <Button
                        variant="outline"
                        onClick={handleRestore}
                        disabled={restoring}
                      >
                        {restoring ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restoring...</>
                        ) : (
                          <><RotateCcw className="h-4 w-4 mr-2" /> Restore Previous Version</>
                        )}
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Note: Backups are automatically created when you edit a key and expire after 24 hours.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-muted p-8 text-center">
                    <p className="text-muted-foreground">
                      No backup available for this key.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {error && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || value === originalValue}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Save Changes</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

