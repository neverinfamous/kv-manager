import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { api, type JobListItem, type KVNamespace } from '../services/api';
import { Loader2, CheckCircle2, XCircle, Ban, AlertCircle, FileText, Download, Upload, Copy, Clock, Tag, Trash2 } from 'lucide-react';
import { JobHistoryDialog } from './JobHistoryDialog';

interface JobHistoryProps {
  namespaces: KVNamespace[];
}

export function JobHistory({ namespaces }: JobHistoryProps) {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState<string>('all');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    loadJobs(true);
  }, [statusFilter, operationFilter]);

  const loadJobs = async (reset = false) => {
    try {
      setLoading(true);
      setError('');

      const currentOffset = reset ? 0 : offset;
      const options: {
        limit: number;
        offset: number;
        status?: string;
        operation_type?: string;
      } = {
        limit,
        offset: currentOffset,
      };

      if (statusFilter !== 'all') {
        options.status = statusFilter;
      }

      if (operationFilter !== 'all') {
        options.operation_type = operationFilter;
      }

      const data = await api.getJobList(options);

      if (reset) {
        setJobs(data.jobs);
        setOffset(limit);
      } else {
        setJobs([...jobs, ...data.jobs]);
        setOffset(currentOffset + limit);
      }

      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load job history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load job history');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    loadJobs(false);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            <Ban className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case 'queued':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <AlertCircle className="h-3 w-3 mr-1" />
            Queued
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getOperationIcon = (operationType: string) => {
    switch (operationType) {
      case 'export':
        return <Download className="h-4 w-4" />;
      case 'import':
        return <Upload className="h-4 w-4" />;
      case 'bulk_copy':
        return <Copy className="h-4 w-4" />;
      case 'bulk_delete':
        return <Trash2 className="h-4 w-4" />;
      case 'bulk_ttl_update':
        return <Clock className="h-4 w-4" />;
      case 'bulk_tag':
        return <Tag className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getOperationLabel = (operationType: string) => {
    switch (operationType) {
      case 'export':
        return 'Export';
      case 'import':
        return 'Import';
      case 'bulk_copy':
        return 'Bulk Copy';
      case 'bulk_delete':
        return 'Bulk Delete';
      case 'bulk_ttl_update':
        return 'Bulk TTL Update';
      case 'bulk_tag':
        return 'Bulk Tag';
      default:
        return operationType;
    }
  };

  const getNamespaceTitle = (namespaceId: string) => {
    const namespace = namespaces.find((ns) => ns.id === namespaceId);
    return namespace?.title || namespaceId;
  };

  const hasMore = offset < total;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Job History</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View history and event timeline for all bulk operations
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Operation Type Filter */}
          <div className="space-y-2">
            <Label>Operation Type</Label>
            <Select value={operationFilter} onValueChange={setOperationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Operations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="import">Import</SelectItem>
                <SelectItem value="bulk_copy">Bulk Copy</SelectItem>
                <SelectItem value="bulk_delete">Bulk Delete</SelectItem>
                <SelectItem value="bulk_ttl_update">Bulk TTL Update</SelectItem>
                <SelectItem value="bulk_tag">Bulk Tag</SelectItem>
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

      {/* Loading State */}
      {loading && jobs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          Loading job history...
        </div>
      )}

      {/* Empty State */}
      {!loading && jobs.length === 0 && (
        <div className="bg-card rounded-lg border p-12 text-center text-muted-foreground">
          <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
          <p>No bulk operations match the selected filters</p>
        </div>
      )}

      {/* Job List */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card
              key={job.job_id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedJobId(job.job_id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {getOperationIcon(job.operation_type)}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {getOperationLabel(job.operation_type)}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {getNamespaceTitle(job.namespace_id)}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(job.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Started</div>
                    <div className="font-medium" title={new Date(job.started_at).toLocaleString()}>
                      {formatTimestamp(job.started_at)}
                    </div>
                  </div>
                  {job.total_keys !== null && (
                    <div>
                      <div className="text-muted-foreground text-xs">Total Keys</div>
                      <div className="font-medium">{job.total_keys.toLocaleString()}</div>
                    </div>
                  )}
                  {job.processed_keys !== null && (
                    <div>
                      <div className="text-muted-foreground text-xs">Processed</div>
                      <div className="font-medium">{job.processed_keys.toLocaleString()}</div>
                    </div>
                  )}
                  {job.error_count !== null && job.error_count > 0 && (
                    <div>
                      <div className="text-muted-foreground text-xs">Errors</div>
                      <div className="font-medium text-red-600 dark:text-red-400">
                        {job.error_count.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs text-muted-foreground font-mono">
                  Job ID: {job.job_id}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button onClick={handleLoadMore} variant="outline" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load More (${jobs.length} of ${total})`
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Job History Dialog */}
      {selectedJobId && (
        <JobHistoryDialog
          open={!!selectedJobId}
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}

