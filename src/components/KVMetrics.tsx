import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  Activity,
  Database,
  TrendingUp,
  HardDrive,
} from "lucide-react";
import {
  api,
  type KVNamespace,
  type KVMetricsResponse,
  type KVMetricsTimeRange,
} from "../services/api";
import { KVStorageTab } from "./KVStorageTab";
import { logger } from "../lib/logger";

interface KVMetricsProps {
  namespaces: KVNamespace[];
}

const TIME_RANGE_OPTIONS: { value: KVMetricsTimeRange; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const OPERATION_LABELS: Record<string, string> = {
  read: "Read",
  write: "Write",
  delete: "Delete",
  list: "List",
};

const OPERATION_COLORS: Record<string, string> = {
  read: "bg-blue-500",
  write: "bg-green-500",
  delete: "bg-red-500",
  list: "bg-purple-500",
};

export function KVMetrics({ namespaces }: KVMetricsProps): React.JSX.Element {
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<KVMetricsTimeRange>("7d");
  const [activeTab, setActiveTab] = useState<string>("operations");
  const [metrics, setMetrics] = useState<KVMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadMetrics = useCallback(
    async (skipCache = false): Promise<void> => {
      try {
        setLoading(true);
        setError("");

        const options: Parameters<typeof api.getMetrics>[0] = {
          range: timeRange,
          skipCache,
        };

        if (selectedNamespace !== "all") {
          options.namespaceId = selectedNamespace;
        }

        const data = await api.getMetrics(options);
        setMetrics(data);
        setLastUpdated(new Date());
      } catch (err) {
        logger.error("Failed to load metrics", err);
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    },
    [selectedNamespace, timeRange],
  );

  // Load metrics when filters change
  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleRefresh = (): void => {
    loadMetrics(true);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatLatency = (ms: number): string => {
    if (ms < 1) return "<1ms";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(1)}ms`;
  };

  const getOperationPercentage = (type: string): number => {
    if (!metrics || metrics.summary.totalOperations === 0) return 0;
    return (
      ((metrics.summary.operationsByType[type] ?? 0) /
        metrics.summary.totalOperations) *
      100
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">KV Metrics</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh metrics"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Info Banner */}
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>About Metrics:</strong> Data is from Cloudflare's GraphQL
            Analytics API and may have a delay of a few minutes. Metrics are
            cached for 2 minutes. Use Refresh to fetch the latest data.
          </p>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="metrics-namespace">Namespace</Label>
            <Select
              value={selectedNamespace}
              onValueChange={setSelectedNamespace}
            >
              <SelectTrigger
                id="metrics-namespace"
                name="metrics-namespace"
                aria-label="Select namespace"
              >
                <SelectValue placeholder="Select namespace" />
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

          <div className="space-y-2">
            <Label htmlFor="metrics-time-range">Time Range</Label>
            <Select
              value={timeRange}
              onValueChange={(value) =>
                setTimeRange(value as KVMetricsTimeRange)
              }
            >
              <SelectTrigger
                id="metrics-time-range"
                name="metrics-time-range"
                aria-label="Select time range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Last updated */}
        {lastUpdated && !loading && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !metrics && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Metrics Display with Tabs */}
      {metrics && (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="operations" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage
            </TabsTrigger>
          </TabsList>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Operations */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Operations
                  </CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(metrics.summary.totalOperations)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics.summary.startDate} to {metrics.summary.endDate}
                  </p>
                </CardContent>
              </Card>

              {/* Reads */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Reads</CardTitle>
                  <Database className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(
                      metrics.summary.operationsByType["read"] ?? 0,
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getOperationPercentage("read").toFixed(1)}% of operations
                  </p>
                </CardContent>
              </Card>

              {/* Writes */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Writes</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(
                      metrics.summary.operationsByType["write"] ?? 0,
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getOperationPercentage("write").toFixed(1)}% of operations
                  </p>
                </CardContent>
              </Card>

              {/* Namespaces */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Namespaces
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.summary.namespaceCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    With activity in period
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Operations Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Operations by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(metrics.summary.operationsByType).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No operations recorded in this time period
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(metrics.summary.operationsByType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => (
                        <div key={type} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {OPERATION_LABELS[type] ?? type}
                            </span>
                            <span className="text-muted-foreground">
                              {formatNumber(count)} (
                              {getOperationPercentage(type).toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${OPERATION_COLORS[type] ?? "bg-gray-500"}`}
                              style={{
                                width: `${getOperationPercentage(type)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Latency Stats */}
            {metrics.summary.avgLatencyMs && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Average Latency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">
                        {formatLatency(metrics.summary.avgLatencyMs.p50)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">P50</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {formatLatency(metrics.summary.avgLatencyMs.p90)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">P90</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {formatLatency(metrics.summary.avgLatencyMs.p99)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">P99</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {metrics.summary.totalOperations === 0 && (
              <div className="text-center py-12 bg-card rounded-lg border">
                <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No metrics data</h3>
                <p className="text-muted-foreground mb-4">
                  {selectedNamespace === "all"
                    ? "No operations recorded across any namespace in this time period."
                    : "No operations recorded for this namespace in this time period."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Metrics may take a few minutes to appear after operations are
                  performed.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Storage Tab */}
          <TabsContent value="storage">
            <KVStorageTab
              storageSeries={metrics.storageSeries}
              byNamespace={metrics.byNamespace}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
