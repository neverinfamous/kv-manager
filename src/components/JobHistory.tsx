import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { api, type JobListItem, type KVNamespace } from '../services/api';
import { Loader2, CheckCircle2, XCircle, Ban, AlertCircle, FileText, Download, Upload, Copy, Clock, Tag, Trash2, Search, Calendar as CalendarIcon, ArrowUp, ArrowDown, X } from 'lucide-react';
import { JobHistoryDialog } from './JobHistoryDialog';
import { format } from 'date-fns';

interface JobHistoryProps {
  namespaces: KVNamespace[];
}

export function JobHistory({ namespaces }: JobHistoryProps) {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [jobIdSearch, setJobIdSearch] = useState<string>('');
  const [jobIdInput, setJobIdInput] = useState<string>('');
  const [minErrors, setMinErrors] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('started_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const limit = 20;

  // Debounce job ID search
  useEffect(() => {
    const timer = setTimeout(() => {
      setJobIdSearch(jobIdInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [jobIdInput]);

  const loadJobs = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      setError('');

      const currentOffset = reset ? 0 : offset;
      const options: {
        limit: number;
        offset: number;
        status?: string;
        operation_type?: string;
        namespace_id?: string;
        start_date?: string;
        end_date?: string;
        job_id?: string;
        min_errors?: number;
        sort_by?: string;
        sort_order?: 'asc' | 'desc';
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

      if (namespaceFilter !== 'all') {
        options.namespace_id = namespaceFilter;
      }

      // Handle date range based on preset or custom selection
      if (datePreset !== 'all' && datePreset !== 'custom') {
        const now = new Date();
        let startDate: Date;
        
        switch (datePreset) {
          case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = now;
        }
        
        options.start_date = startDate.toISOString();
      } else if (datePreset === 'custom') {
        if (dateRange.from) {
          options.start_date = dateRange.from.toISOString();
        }
        if (dateRange.to) {
          // Set to end of day
          const endDate = new Date(dateRange.to);
          endDate.setHours(23, 59, 59, 999);
          options.end_date = endDate.toISOString();
        }
      }

      if (jobIdSearch.trim()) {
        options.job_id = jobIdSearch.trim();
      }

      if (minErrors.trim() && !isNaN(parseInt(minErrors))) {
        options.min_errors = parseInt(minErrors);
      }

      options.sort_by = sortBy;
      options.sort_order = sortOrder;

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
  }, [statusFilter, operationFilter, namespaceFilter, datePreset, dateRange, jobIdSearch, minErrors, sortBy, sortOrder, offset, jobs, limit]);

  useEffect(() => {
    loadJobs(true);
  }, [statusFilter, operationFilter, namespaceFilter, datePreset, dateRange, jobIdSearch, minErrors, sortBy, sortOrder, loadJobs]);

  const handleLoadMore = () => {
    loadJobs(false);
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setOperationFilter('all');
    setNamespaceFilter('all');
    setDatePreset('all');
    setDateRange({ from: undefined, to: undefined });
    setJobIdInput('');
    setJobIdSearch('');
    setMinErrors('');
    setSortBy('started_at');
    setSortOrder('desc');
  };

  const handleDatePresetChange = (value: string) => {
    setDatePreset(value);
    if (value !== 'custom') {
      setDateRange({ from: undefined, to: undefined });
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const getDateRangeDisplay = () => {
    if (datePreset === 'all') return 'All Time';
    if (datePreset === '24h') return 'Last 24 Hours';
    if (datePreset === '7d') return 'Last 7 Days';
    if (datePreset === '30d') return 'Last 30 Days';
    if (datePreset === 'custom') {
      if (dateRange.from && dateRange.to) {
        return `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
      }
      if (dateRange.from) {
        return `From ${format(dateRange.from, 'MMM d, yyyy')}`;
      }
      if (dateRange.to) {
        return `Until ${format(dateRange.to, 'MMM d, yyyy')}`;
      }
      return 'Select dates...';
    }
    return 'All Time';
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
        <div className="space-y-4">
          {/* Row 1: Status, Operation Type, Namespace */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            {/* Namespace Filter */}
            <div className="space-y-2">
              <Label>Namespace</Label>
              <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
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

          {/* Row 2: Date Range, Job ID Search, Min Errors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex gap-2">
                <Select value={datePreset} onValueChange={handleDatePresetChange}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                {datePreset === 'custom' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span className="truncate">{getDateRangeDisplay()}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                        numberOfMonths={2}
                        defaultMonth={dateRange.from}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Job ID Search */}
            <div className="space-y-2">
              <Label>Job ID</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Job ID..."
                  value={jobIdInput}
                  onChange={(e) => setJobIdInput(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Min Errors Filter */}
            <div className="space-y-2">
              <Label>Min Errors</Label>
              <Input
                type="number"
                min="0"
                placeholder="Min errors..."
                value={minErrors}
                onChange={(e) => setMinErrors(e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Sort Controls and Reset */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sort By */}
            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Started At" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="started_at">Started At</SelectItem>
                  <SelectItem value="completed_at">Completed At</SelectItem>
                  <SelectItem value="total_keys">Total Keys</SelectItem>
                  <SelectItem value="error_count">Error Count</SelectItem>
                  <SelectItem value="percentage">Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Button
                variant="outline"
                onClick={toggleSortOrder}
                className="w-full justify-start"
              >
                {sortOrder === 'desc' ? (
                  <>
                    <ArrowDown className="mr-2 h-4 w-4" />
                    Descending
                  </>
                ) : (
                  <>
                    <ArrowUp className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                )}
              </Button>
            </div>

            {/* Reset Filters */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button
                variant="outline"
                onClick={handleResetFilters}
                className="w-full"
              >
                <X className="mr-2 h-4 w-4" />
                Clear All Filters
              </Button>
            </div>
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

