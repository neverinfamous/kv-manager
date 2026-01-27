import { useState, useEffect, useCallback } from "react";
import { logger } from "../lib/logger";

export type NamespaceViewMode = "grid" | "list";

const STORAGE_KEY = "kv-manager-namespace-view";

/**
 * Get stored view preference from localStorage
 * Defaults to 'list' for better performance with many namespaces
 */
function getStoredViewMode(): NamespaceViewMode {
  if (typeof window === "undefined") return "list";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "grid" || stored === "list") {
    return stored;
  }
  return "list";
}

interface UseNamespaceViewPreferenceReturn {
  viewMode: NamespaceViewMode;
  setViewMode: (mode: NamespaceViewMode) => void;
}

/**
 * Hook to manage namespace view mode preference with localStorage persistence.
 *
 * Default is 'list' for better performance when many namespaces exist.
 * User preference is persisted immediately on change.
 */
export function useNamespaceViewPreference(): UseNamespaceViewPreferenceReturn {
  const [viewMode, setViewModeState] =
    useState<NamespaceViewMode>(getStoredViewMode);

  // Sync with localStorage on mount (handles SSR hydration)
  useEffect(() => {
    const stored = getStoredViewMode();
    if (stored !== viewMode) {
      setViewModeState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setViewMode = useCallback((mode: NamespaceViewMode): void => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    logger.info(`Namespace view mode changed to ${mode}`, { viewMode: mode });
  }, []);

  return { viewMode, setViewMode };
}
