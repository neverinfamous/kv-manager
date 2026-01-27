import React, { useMemo, useState } from "react";
import {
  HardDrive,
  ChevronDown,
  ChevronUp,
  Database,
  Hash,
  Folder,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type KVStorageDataPoint,
  type KVNamespaceMetricsSummary,
} from "@/services/api";

interface KVStorageTabProps {
  storageSeries: KVStorageDataPoint[];
  byNamespace: KVNamespaceMetricsSummary[];
}

type SortField = "namespaceName" | "keyCount" | "byteCount";

// Format bytes to human-readable string
function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Format large numbers with K, M, B suffixes
function formatNumber(num: number | undefined): string {
  if (num === undefined) return "-";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Calculate storage trend (comparing latest to oldest in series)
function calculateTrend(
  series: KVStorageDataPoint[],
  field: "keyCount" | "byteCount",
): { trend: "up" | "down" | "stable"; delta: number } {
  if (series.length < 2) return { trend: "stable", delta: 0 };

  // Sort by date descending
  const sorted = [...series].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const latest = sorted[0]?.[field] ?? 0;
  const oldest = sorted[sorted.length - 1]?.[field] ?? 0;

  if (oldest === 0) return { trend: "stable", delta: 0 };
  const deltaPercent = ((latest - oldest) / oldest) * 100;

  if (Math.abs(deltaPercent) < 1) return { trend: "stable", delta: 0 };
  return {
    trend: deltaPercent > 0 ? "up" : "down",
    delta: Math.abs(deltaPercent),
  };
}

// Render sort indicator icon
function renderSortIcon(
  sortField: SortField,
  sortDirection: "asc" | "desc",
  field: SortField,
): React.JSX.Element | null {
  if (sortField !== field) return null;
  return sortDirection === "asc" ? (
    <ChevronUp className="h-4 w-4 inline ml-1" />
  ) : (
    <ChevronDown className="h-4 w-4 inline ml-1" />
  );
}

// Render trend indicator
function renderTrendIndicator(
  trend: "up" | "down" | "stable",
  delta: number,
): React.JSX.Element | null {
  if (trend === "stable") return null;
  return (
    <span
      className={`text-xs ml-2 flex items-center gap-0.5 ${trend === "up" ? "text-green-600" : "text-red-600"}`}
    >
      {trend === "up" ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {delta.toFixed(1)}%
    </span>
  );
}

export function KVStorageTab({
  storageSeries,
  byNamespace,
}: KVStorageTabProps): React.JSX.Element {
  const [sortField, setSortField] = useState<SortField>("byteCount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(
    null,
  );

  // Calculate total storage across all namespaces
  const totals = useMemo(() => {
    const totalKeys = byNamespace.reduce(
      (sum, ns) => sum + (ns.currentKeyCount ?? 0),
      0,
    );
    const totalBytes = byNamespace.reduce(
      (sum, ns) => sum + (ns.currentByteCount ?? 0),
      0,
    );
    return { totalKeys, totalBytes };
  }, [byNamespace]);

  // Calculate trends
  const keyTrend = useMemo(
    () => calculateTrend(storageSeries, "keyCount"),
    [storageSeries],
  );
  const byteTrend = useMemo(
    () => calculateTrend(storageSeries, "byteCount"),
    [storageSeries],
  );

  // Sort namespaces
  const sortedNamespaces = useMemo(() => {
    return [...byNamespace].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "namespaceName":
          aVal = a.namespaceName ?? a.namespaceId;
          bVal = b.namespaceName ?? b.namespaceId;
          break;
        case "keyCount":
          aVal = a.currentKeyCount ?? 0;
          bVal = b.currentKeyCount ?? 0;
          break;
        case "byteCount":
          aVal = a.currentByteCount ?? 0;
          bVal = b.currentByteCount ?? 0;
          break;
      }

      const modifier = sortDirection === "asc" ? 1 : -1;
      if (typeof aVal === "string") {
        return aVal.localeCompare(bVal as string) * modifier;
      }
      return ((aVal as number) - (bVal as number)) * modifier;
    });
  }, [byNamespace, sortField, sortDirection]);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleExpand = (namespaceId: string): void => {
    setExpandedNamespace((prev) => (prev === namespaceId ? null : namespaceId));
  };

  if (byNamespace.length === 0 && storageSeries.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-lg border">
        <HardDrive className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">
          No storage data available
        </h3>
        <p className="text-muted-foreground">
          Storage metrics will appear once namespaces have been used.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Keys</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <span className="text-2xl font-bold">
                {formatNumber(totals.totalKeys)}
              </span>
              {renderTrendIndicator(keyTrend.trend, keyTrend.delta)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {byNamespace.length} namespace
              {byNamespace.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <span className="text-2xl font-bold">
                {formatBytes(totals.totalBytes)}
              </span>
              {renderTrendIndicator(byteTrend.trend, byteTrend.delta)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Combined across all namespaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Points</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{storageSeries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Storage records collected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Namespace Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Storage by Namespace</CardTitle>
          <CardDescription>
            Click headers to sort, click rows to expand details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th
                    className="text-left py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("namespaceName")}
                  >
                    <Folder className="h-4 w-4 inline mr-2" />
                    Namespace
                    {renderSortIcon(sortField, sortDirection, "namespaceName")}
                  </th>
                  <th
                    className="text-right py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("keyCount")}
                  >
                    Keys
                    {renderSortIcon(sortField, sortDirection, "keyCount")}
                  </th>
                  <th
                    className="text-right py-3 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort("byteCount")}
                  >
                    Size
                    {renderSortIcon(sortField, sortDirection, "byteCount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedNamespaces.map((ns) => (
                  <React.Fragment key={ns.namespaceId}>
                    <tr
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpand(ns.namespaceId)}
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {expandedNamespace === ns.namespaceId ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-muted-foreground rotate-90" />
                          )}
                          <span className="font-medium">
                            {ns.namespaceName ??
                              ns.namespaceId.slice(0, 12) + "..."}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-3 text-muted-foreground">
                        {formatNumber(ns.currentKeyCount)}
                      </td>
                      <td className="text-right py-3 text-muted-foreground">
                        {formatBytes(ns.currentByteCount)}
                      </td>
                    </tr>
                    {expandedNamespace === ns.namespaceId && (
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="py-4 px-6">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">
                                Namespace ID:
                              </span>
                              <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                                {ns.namespaceId}
                              </code>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Total Operations:
                              </span>
                              <span className="ml-2 font-medium">
                                {formatNumber(ns.totalOperations)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
