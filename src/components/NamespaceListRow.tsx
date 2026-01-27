import * as React from "react";
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  Pencil,
  Trash2,
  CloudUpload,
  CloudDownload,
} from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import type { KVNamespace, NamespaceColor } from "../services/api";
import { NamespaceColorPicker } from "./NamespaceColorPicker";

interface NamespaceListRowProps {
  /** Namespace data */
  namespace: KVNamespace;
  /** Whether this namespace is selected */
  isSelected: boolean;
  /** Current color of the namespace */
  color?: NamespaceColor;
  /** Toggle selection callback */
  onToggleSelection: () => void;
  /** Navigate to browse keys */
  onBrowseKeys: () => void;
  /** Open export dialog */
  onExport: () => void;
  /** Open import dialog */
  onImport: () => void;
  /** Open R2 backup dialog */
  onBackupR2: () => void;
  /** Open R2 restore dialog */
  onRestoreR2: () => void;
  /** Sync namespace to search index */
  onSync: () => void;
  /** Open rename dialog */
  onRename: () => void;
  /** Delete namespace */
  onDelete: () => void;
  /** Change namespace color */
  onColorChange: (color: NamespaceColor) => void;
}

/**
 * Single namespace row for the list (table) view.
 *
 * Shows: checkbox, namespace title/ID, est. keys, actions.
 * All actions are shown as inline icon buttons with hover tooltips.
 */
export function NamespaceListRow({
  namespace,
  isSelected,
  color,
  onToggleSelection,
  onBrowseKeys,
  onExport,
  onImport,
  onBackupR2,
  onRestoreR2,
  onSync,
  onRename,
  onDelete,
  onColorChange,
}: NamespaceListRowProps): React.JSX.Element {
  const handleCopyId = async (): Promise<void> => {
    await navigator.clipboard.writeText(namespace.id);
  };

  return (
    <tr
      className={`border-t hover:bg-muted/50 ${isSelected ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
    >
      {/* Checkbox */}
      <td className="p-4">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          aria-label={`Select namespace ${namespace.title}`}
        />
      </td>

      {/* Namespace Title & ID */}
      <td className="p-4">
        <div className="flex items-center gap-3">
          <NamespaceColorPicker
            value={color ?? null}
            onChange={onColorChange}
          />
          <Database className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div
              className="font-medium cursor-pointer hover:text-primary hover:underline"
              onClick={onBrowseKeys}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBrowseKeys();
                }
              }}
            >
              {namespace.title}
            </div>
            <div
              className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
              onClick={handleCopyId}
              title="Click to copy ID"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handleCopyId();
                }
              }}
            >
              ID: {namespace.id}
            </div>
          </div>
        </div>
      </td>

      {/* Est. Keys */}
      <td className="p-4 text-sm">
        {namespace.estimated_key_count !== undefined
          ? namespace.estimated_key_count.toLocaleString()
          : "—"}
      </td>

      {/* Actions - All inline icon buttons with hover tooltips */}
      <td className="p-4">
        <div className="flex items-center justify-end gap-0.5">
          {/* Browse Keys */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBrowseKeys}
            title="Browse Keys"
            aria-label={`Browse keys in ${namespace.title}`}
            className="h-8 w-8 p-0"
          >
            <Database className="h-4 w-4" />
          </Button>

          {/* Export */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            title="Export Namespace"
            aria-label={`Export namespace ${namespace.title}`}
            className="h-8 w-8 p-0"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* Import */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onImport}
            title="Import to Namespace"
            aria-label={`Import to namespace ${namespace.title}`}
            className="h-8 w-8 p-0"
          >
            <Upload className="h-4 w-4" />
          </Button>

          {/* Backup to R2 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackupR2}
            title="Backup to R2"
            aria-label={`Backup namespace ${namespace.title} to R2`}
            className="h-8 w-8 p-0"
          >
            <CloudUpload className="h-4 w-4" />
          </Button>

          {/* Restore from R2 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRestoreR2}
            title="Restore from R2"
            aria-label={`Restore namespace ${namespace.title} from R2`}
            className="h-8 w-8 p-0"
          >
            <CloudDownload className="h-4 w-4" />
          </Button>

          {/* Sync Search */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            title="Sync Search Index"
            aria-label={`Sync search index for namespace ${namespace.title}`}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {/* Rename */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRename}
            title="Rename Namespace"
            aria-label={`Rename namespace ${namespace.title}`}
            className="h-8 w-8 p-0"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title="Delete Namespace"
            aria-label={`Delete namespace ${namespace.title}`}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
