import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { X, Check } from "lucide-react";
import { api } from "../services/api";
import { isValidJSON } from "../lib/utils";
import { logger } from "../lib/logger";
import { JsonEditor } from "./ui/JsonEditor";

interface MetadataEditorProps {
  namespaceId: string;
  keyName: string;
  onSave?: () => void;
  /** Whether the KV Native Metadata in parent is valid (disables Save if false) */
  kvMetadataValid?: boolean;
}

export function MetadataEditor({
  namespaceId,
  keyName,
  onSave,
  kvMetadataValid = true,
}: MetadataEditorProps): React.JSX.Element {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [customMetadata, setCustomMetadata] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCustomMetadataValid, setIsCustomMetadataValid] = useState(true);

  const loadMetadata = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError("");
      const data = await api.getMetadata(namespaceId, keyName);
      setTags(data.tags || []);
      setCustomMetadata(
        data.custom_metadata
          ? JSON.stringify(data.custom_metadata, null, 2)
          : "",
      );
    } catch (err) {
      logger.error("Failed to load metadata", err);
      setError(err instanceof Error ? err.message : "Failed to load metadata");
    } finally {
      setLoading(false);
    }
  }, [namespaceId, keyName]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const handleAddTag = (): void => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string): void => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true);
      setError("");
      setSaveSuccess(false);

      // Parse custom metadata JSON (JsonEditor already validates, but double-check)
      let parsedMetadata = {};
      if (customMetadata.trim()) {
        if (!isValidJSON(customMetadata)) {
          setError("Invalid JSON format in custom metadata");
          return;
        }
        parsedMetadata = JSON.parse(customMetadata);
      }

      await api.updateMetadata(namespaceId, keyName, {
        tags,
        custom_metadata: parsedMetadata,
      });

      // Show success feedback
      setSaveSuccess(true);
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);

      onSave?.();
    } catch (err) {
      logger.error("Failed to save metadata", err);
      setError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Loading metadata...</div>
    );
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
        <Label htmlFor="tag-input">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="tag-input"
            name="tag-input"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Add a tag..."
            className="flex-1"
            autoComplete="off"
          />
          <Button onClick={handleAddTag} variant="outline" size="sm">
            Add Tag
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="flex items-center gap-1"
              >
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
      <JsonEditor
        id="custom-metadata"
        name="custom-metadata"
        label="Custom Metadata (JSON)"
        value={customMetadata}
        onChange={setCustomMetadata}
        onValidityChange={setIsCustomMetadataValid}
        placeholder='{"key": "value"}'
        helpText="Enter valid JSON for custom metadata fields"
        rows={6}
      />

      <div className="flex items-center justify-end gap-3">
        {saveSuccess && (
          <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <span>Metadata saved</span>
          </div>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !isCustomMetadataValid || !kvMetadataValid}
        >
          {saving ? "Saving..." : "Save Metadata"}
        </Button>
      </div>
    </div>
  );
}
