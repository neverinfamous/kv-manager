import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  Activity,
  Database,
  HardDrive,
  Briefcase,
  Palette,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  fetchHealthSummary,
  calculateHealthScore,
  type HealthSummary,
  type LowMetadataNamespace,
  type RecentFailedJob,
} from "../services/healthApi";
import { logger } from "../lib/logger";

export function HealthDashboard(): React.JSX.Element {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadHealth = useCallback(async (skipCache = false): Promise<void> => {
    try {
      setLoading(true);
      setError("");

      const data = await fetchHealthSummary(skipCache);
      setHealth(data);
      setLastUpdated(new Date());
    } catch (err) {
      logger.error("Failed to load health summary", err);
      setError(
        err instanceof Error ? err.message : "Failed to load health summary",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadHealth();
    });
  }, [loadHealth]);

  const handleRefresh = (): void => {
    loadHealth(true);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  const healthScore = health ? calculateHealthScore(health) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Health Dashboard</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh health data"
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
            <strong>About Health:</strong> This dashboard shows the operational
            status of your KV namespaces, job history, and backup coverage. Data
            is cached for 2 minutes.
          </p>
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
      {loading && !health && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Health Data */}
      {health && healthScore && (
        <div className="space-y-6">
          {/* Health Score Banner */}
          <Card className="overflow-hidden">
            <div
              className={`p-6 ${
                healthScore.score >= 90
                  ? "bg-gradient-to-r from-green-500/10 to-green-600/10"
                  : healthScore.score >= 70
                    ? "bg-gradient-to-r from-blue-500/10 to-blue-600/10"
                    : healthScore.score >= 50
                      ? "bg-gradient-to-r from-yellow-500/10 to-yellow-600/10"
                      : "bg-gradient-to-r from-red-500/10 to-red-600/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium mb-1">System Health</h3>
                  <p className={`text-4xl font-bold ${healthScore.color}`}>
                    {healthScore.label}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-bold">{healthScore.score}</p>
                  <p className="text-sm text-muted-foreground">out of 100</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Namespaces */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Namespaces
                </CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.namespaces.total}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {health.namespaces.withMetadata} with tracked keys
                </p>
              </CardContent>
            </Card>

            {/* Keys Tracked */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Keys Tracked
                </CardTitle>
                <HardDrive className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.keys.totalTracked.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {health.keys.orphanedMetadata > 0
                    ? `${health.keys.orphanedMetadata} orphaned records`
                    : "D1 metadata entries"}
                </p>
              </CardContent>
            </Card>

            {/* Backups */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  R2 Backups
                </CardTitle>
                <Palette className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.storage.totalBackups}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {health.storage.backupCoverage} namespace
                  {health.storage.backupCoverage !== 1 ? "s" : ""} with backups
                </p>
              </CardContent>
            </Card>

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Recent Jobs
                </CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {health.recentJobs.last24h}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Last 24h ({health.recentJobs.last7d} in 7d)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Failed Jobs Alert */}
          {health.recentJobs.failedLast24h > 0 && (
            <Card className="border-red-500/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-500">
                  <XCircle className="h-5 w-5" />
                  Failed Jobs ({health.recentJobs.failedLast24h} in last 24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {health.recentFailedJobs.length > 0 ? (
                  <div className="space-y-2">
                    {health.recentFailedJobs.map((job: RecentFailedJob) => (
                      <div
                        key={job.jobId}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {job.operationType}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Job: {job.jobId.substring(0, 8)}... •{" "}
                            {job.errorCount} error
                            {job.errorCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(job.completedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Failed jobs detected but details unavailable.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Low Metadata Coverage */}
          {health.lowMetadataNamespaces.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Low Metadata Coverage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  These namespaces have few or no keys tracked in D1 metadata.
                  Consider adding metadata to enable search and tagging
                  features.
                </p>
                <div className="space-y-2">
                  {health.lowMetadataNamespaces.map(
                    (ns: LowMetadataNamespace) => (
                      <div
                        key={ns.namespaceId}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {ns.namespaceTitle || ns.namespaceId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ns.trackedKeyCount} key
                            {ns.trackedKeyCount !== 1 ? "s" : ""} tracked
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Clear State */}
          {health.recentJobs.failedLast24h === 0 &&
            health.lowMetadataNamespaces.length === 0 && (
              <Card className="border-green-500/50">
                <CardContent className="flex items-center gap-4 p-6">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <h3 className="font-semibold">All Systems Operational</h3>
                    <p className="text-sm text-muted-foreground">
                      No failed jobs or alerts detected. Your KV fleet is
                      healthy.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Backup Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Backup Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Total R2 Backups</p>
                  <p className="text-2xl font-bold">
                    {health.storage.totalBackups}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Last Backup</p>
                  <p className="text-lg font-semibold">
                    {health.storage.lastBackupDate
                      ? formatDate(health.storage.lastBackupDate)
                      : "No backups yet"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Namespace Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">
                    Namespaces with Colors
                  </p>
                  <p className="text-2xl font-bold">
                    {health.namespaces.withColors} / {health.namespaces.total}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {health.namespaces.total > 0
                      ? `${Math.round((health.namespaces.withColors / health.namespaces.total) * 100)}% coverage`
                      : "No namespaces"}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">
                    Namespaces with Metadata
                  </p>
                  <p className="text-2xl font-bold">
                    {health.namespaces.withMetadata} / {health.namespaces.total}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {health.namespaces.total > 0
                      ? `${Math.round((health.namespaces.withMetadata / health.namespaces.total) * 100)}% have tracked keys`
                      : "No namespaces"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
