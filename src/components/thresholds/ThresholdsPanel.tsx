import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Pencil, Trash2, Monitor } from 'lucide-react';
import {
  MonitoringThreshold,
  ThresholdInput,
  listThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
} from '../../services/thresholds';

interface ThresholdsPanelProps {
  namespaces: { id: string; title: string }[];
}

export function ThresholdsPanel({ namespaces }: ThresholdsPanelProps): React.JSX.Element {
  const [thresholds, setThresholds] = useState<MonitoringThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<MonitoringThreshold | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formNamespaceId, setFormNamespaceId] = useState('');
  const [formStorageBytes, setFormStorageBytes] = useState('');
  const [formOpRate, setFormOpRate] = useState('');
  const [formLatency, setFormLatency] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  const fetchThresholds = async (): Promise<void> => {
    try {
      setLoading(true);
      const data = await listThresholds();
      setThresholds(data);
      setError('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        const data = await listThresholds();
        if (!cancelled) {
          setThresholds(data);
          setError('');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return (): void => { cancelled = true; };
  }, []);

  const handleOpenDialog = (threshold?: MonitoringThreshold): void => {
    if (threshold) {
      setEditingThreshold(threshold);
      setFormNamespaceId(threshold.namespace_id);
      setFormStorageBytes(threshold.storage_bytes_threshold?.toString() || '');
      setFormOpRate(threshold.operation_rate_threshold?.toString() || '');
      setFormLatency(threshold.latency_p99_threshold_ms?.toString() || '');
      setFormEnabled(threshold.enabled);
    } else {
      setEditingThreshold(null);
      setFormNamespaceId('');
      setFormStorageBytes('');
      setFormOpRate('');
      setFormLatency('');
      setFormEnabled(true);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    if (!formNamespaceId) return;

    try {
      setSaving(true);
      const input: ThresholdInput = {
        namespace_id: formNamespaceId,
        storage_bytes_threshold: formStorageBytes ? parseInt(formStorageBytes, 10) : null,
        operation_rate_threshold: formOpRate ? parseInt(formOpRate, 10) : null,
        latency_p99_threshold_ms: formLatency ? parseInt(formLatency, 10) : null,
        enabled: formEnabled,
      };

      if (editingThreshold) {
        await updateThreshold(formNamespaceId, input);
      } else {
        await createThreshold(input);
      }
      setIsDialogOpen(false);
      fetchThresholds();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (namespaceId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this threshold?')) return;
    try {
      await deleteThreshold(namespaceId);
      fetchThresholds();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  const formatBytes = (bytes: number | null): string => {
    if (bytes === null) return 'N/A';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return bytes + ' B';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Monitoring Thresholds</h2>
          <p className="text-muted-foreground">
            Configure alerting thresholds for namespace metrics.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Threshold
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Monitor className="h-5 w-5 mr-2" />
            Configured Thresholds
          </CardTitle>
          <CardDescription>
            Manage your namespace monitoring rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : thresholds.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No thresholds configured. Click "Add Threshold" to create one.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Namespace</th>
                    <th className="px-4 py-3 text-left font-medium">Storage</th>
                    <th className="px-4 py-3 text-left font-medium">Op Rate</th>
                    <th className="px-4 py-3 text-left font-medium">Latency P99</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {thresholds.map((t) => (
                    <tr key={t.namespace_id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {t.namespace_name || namespaces.find((n) => n.id === t.namespace_id)?.title || t.namespace_id}
                      </td>
                      <td className="px-4 py-3">{formatBytes(t.storage_bytes_threshold)}</td>
                      <td className="px-4 py-3">{t.operation_rate_threshold !== null ? `${t.operation_rate_threshold} ops/s` : 'N/A'}</td>
                      <td className="px-4 py-3">{t.latency_p99_threshold_ms !== null ? `${t.latency_p99_threshold_ms} ms` : 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {t.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(t.namespace_id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingThreshold ? 'Edit Threshold' : 'Add Threshold'}</DialogTitle>
            <DialogDescription>
              Configure alert thresholds for the namespace. Leave fields empty to disable that specific alert.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="namespace" className="text-right">
                Namespace
              </Label>
              <div className="col-span-3">
                <Select
                  value={formNamespaceId}
                  onValueChange={setFormNamespaceId}
                  disabled={!!editingThreshold}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select namespace" />
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
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="storage" className="text-right">
                Storage (Bytes)
              </Label>
              <Input
                id="storage"
                type="number"
                value={formStorageBytes}
                onChange={(e) => setFormStorageBytes(e.target.value)}
                placeholder="e.g. 1073741824 for 1GB"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="opRate" className="text-right">
                Op Rate (ops/s)
              </Label>
              <Input
                id="opRate"
                type="number"
                value={formOpRate}
                onChange={(e) => setFormOpRate(e.target.value)}
                placeholder="e.g. 1000"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="latency" className="text-right">
                P99 Latency (ms)
              </Label>
              <Input
                id="latency"
                type="number"
                value={formLatency}
                onChange={(e) => setFormLatency(e.target.value)}
                placeholder="e.g. 100"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="enabled" className="text-right">
                Enabled
              </Label>
              <div className="col-span-3 flex items-center">
                <Checkbox
                  id="enabled"
                  checked={formEnabled}
                  onCheckedChange={(checked) => setFormEnabled(checked as boolean)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formNamespaceId}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
