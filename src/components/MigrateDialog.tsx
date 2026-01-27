import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import type { KVNamespace } from "../services/api";

export type CutoverMode = "copy" | "copy_delete";

interface MigrateDialogProps {
  open: boolean;
  namespaces: KVNamespace[];
  sourceNamespaceId?: string;
  sourceNamespaceTitle?: string;
  selectedKeys?: string[];
  onClose: () => void;
  onSubmit: (params: {
    sourceNamespaceId: string;
    targetNamespaceId: string;
    keys?: string[];
    cutoverMode: CutoverMode;
    migrateMetadata: boolean;
    preserveTTL: boolean;
    createBackup: boolean;
  }) => Promise<void>;
}

export function MigrateDialog({
  open,
  namespaces,
  sourceNamespaceId,
  sourceNamespaceTitle,
  selectedKeys,
  onClose,
  onSubmit,
}: MigrateDialogProps): React.JSX.Element {
  const [targetNamespaceId, setTargetNamespaceId] = useState<string>("");
  const [cutoverMode, setCutoverMode] = useState<CutoverMode>("copy");
  const [migrateMetadata, setMigrateMetadata] = useState(true);
  const [preserveTTL, setPreserveTTL] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For copy_delete mode, backup is required - handled by disabled checkbox

  const availableTargets = namespaces.filter(
    (ns) => ns.id !== sourceNamespaceId,
  );

  const handleSubmit = async (): Promise<void> => {
    if (!sourceNamespaceId || !targetNamespaceId) {
      setError("Please select both source and target namespaces");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        sourceNamespaceId,
        targetNamespaceId,
        ...(selectedKeys ? { keys: selectedKeys } : {}),
        cutoverMode,
        migrateMetadata,
        preserveTTL,
        // Always create backup for copy_delete mode
        createBackup: cutoverMode === "copy_delete" ? true : createBackup,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration failed");
      setIsSubmitting(false);
    }
  };

  const keyCount = selectedKeys?.length || "all";
  const targetNamespace = namespaces.find((ns) => ns.id === targetNamespaceId);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && !isSubmitting && onClose()}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Migrate Keys
          </DialogTitle>
          <DialogDescription>
            Migrate{" "}
            {keyCount === "all"
              ? "all keys"
              : `${keyCount} selected key${keyCount > 1 ? "s" : ""}`}{" "}
            to another namespace
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source */}
          <div className="space-y-2">
            <span className="text-sm font-medium leading-none">
              Source Namespace
            </span>
            <div className="rounded-md border bg-muted/50 p-2 text-sm">
              {sourceNamespaceTitle || sourceNamespaceId || "Not selected"}
            </div>
          </div>

          {/* Target */}
          <div className="space-y-2">
            <Label htmlFor="target-namespace">Target Namespace</Label>
            <Select
              value={targetNamespaceId}
              onValueChange={setTargetNamespaceId}
            >
              <SelectTrigger id="target-namespace">
                <SelectValue placeholder="Select target namespace" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((ns) => (
                  <SelectItem key={ns.id} value={ns.id}>
                    {ns.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cutover Mode */}
          <div className="space-y-2">
            <Label htmlFor="cutover-mode">Cutover Mode</Label>
            <Select
              value={cutoverMode}
              onValueChange={(v) => setCutoverMode(v as CutoverMode)}
            >
              <SelectTrigger id="cutover-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="copy">
                  Copy Only (Keep source keys)
                </SelectItem>
                <SelectItem value="copy_delete">
                  Copy + Delete Source (Move keys)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Warning for copy_delete */}
          {cutoverMode === "copy_delete" && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    Warning: Source keys will be deleted
                  </p>
                  <p className="mt-1">
                    After successful migration and verification, the source keys
                    will be permanently deleted. A backup is recommended and
                    will be created automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3 pt-2">
            <span className="text-sm font-medium">Options</span>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="migrate-metadata"
                checked={migrateMetadata}
                onCheckedChange={(checked) =>
                  setMigrateMetadata(checked === true)
                }
              />
              <Label
                htmlFor="migrate-metadata"
                className="text-sm font-normal cursor-pointer"
              >
                Migrate D1 metadata (tags, custom metadata)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="preserve-ttl"
                checked={preserveTTL}
                onCheckedChange={(checked) => setPreserveTTL(checked === true)}
              />
              <Label
                htmlFor="preserve-ttl"
                className="text-sm font-normal cursor-pointer"
              >
                Preserve key TTL/expiration
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-backup"
                checked={createBackup}
                onCheckedChange={(checked) => setCreateBackup(checked === true)}
                disabled={cutoverMode === "copy_delete"}
              />
              <Label
                htmlFor="create-backup"
                className="text-sm font-normal cursor-pointer"
              >
                Create R2 backup before migration
                {cutoverMode === "copy_delete" && " (required)"}
              </Label>
            </div>
          </div>

          {/* Summary */}
          {targetNamespaceId && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Summary</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>
                  •{" "}
                  {keyCount === "all"
                    ? "All keys"
                    : `${keyCount} key${keyCount > 1 ? "s" : ""}`}{" "}
                  from <strong>{sourceNamespaceTitle}</strong>
                </li>
                <li>
                  • To <strong>{targetNamespace?.title}</strong>
                </li>
                <li>
                  • Mode:{" "}
                  {cutoverMode === "copy"
                    ? "Copy only"
                    : "Move (copy + delete source)"}
                </li>
                {migrateMetadata && <li>• Including D1 metadata</li>}
                {preserveTTL && <li>• Preserving TTL</li>}
                {createBackup && <li>• With R2 backup</li>}
              </ul>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!targetNamespaceId || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Start Migration"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
