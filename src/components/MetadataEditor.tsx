import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { X } from 'lucide-react'
import { api } from '../services/api'
import { isValidJSON } from '../lib/utils'

interface MetadataEditorProps {
  namespaceId: string
  keyName: string
  onSave?: () => void
}

export function MetadataEditor({ namespaceId, keyName, onSave }: MetadataEditorProps) {
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [customMetadata, setCustomMetadata] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [metadataError, setMetadataError] = useState('')

  useEffect(() => {
    loadMetadata()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaceId, keyName])

  const loadMetadata = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await api.getMetadata(namespaceId, keyName)
      setTags(data.tags || [])
      setCustomMetadata(data.custom_metadata ? JSON.stringify(data.custom_metadata, null, 2) : '')
    } catch (err) {
      console.error('Failed to load metadata:', err)
      setError(err instanceof Error ? err.message : 'Failed to load metadata')
    } finally {
      setLoading(false)
    }
  }

  const handleAddTag = () => {
    const tag = newTag.trim()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      setMetadataError('')

      // Validate custom metadata JSON
      let parsedMetadata = {}
      if (customMetadata.trim()) {
        if (!isValidJSON(customMetadata)) {
          setMetadataError('Invalid JSON format')
          return
        }
        parsedMetadata = JSON.parse(customMetadata)
      }

      await api.updateMetadata(namespaceId, keyName, {
        tags,
        custom_metadata: parsedMetadata
      })

      onSave?.()
    } catch (err) {
      console.error('Failed to save metadata:', err)
      setError(err instanceof Error ? err.message : 'Failed to save metadata')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading metadata...</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-2 rounded">
          {error}
        </div>
      )}

      {/* Tags Section */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
            placeholder="Add a tag..."
            className="flex-1"
          />
          <Button onClick={handleAddTag} variant="outline" size="sm">
            Add Tag
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Custom Metadata Section */}
      <div className="space-y-2">
        <Label>Custom Metadata (JSON)</Label>
        <Textarea
          value={customMetadata}
          onChange={(e) => {
            setCustomMetadata(e.target.value)
            setMetadataError('')
          }}
          placeholder='{"key": "value"}'
          className="font-mono text-sm min-h-[150px]"
        />
        {metadataError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {metadataError}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Enter valid JSON for custom metadata fields
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Metadata'}
        </Button>
      </div>
    </div>
  )
}

