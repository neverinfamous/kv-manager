import { useState, useEffect, useRef, useCallback } from "react";
import type { JobProgress } from "../services/api";
import { api } from "../services/api";
import { bulkJobLogger } from "../lib/logger";

interface UseBulkJobProgressOptions {
  jobId: string;
  /** @deprecated wsUrl is no longer used (polling only) but kept for API compatibility */
  wsUrl?: string;
  onComplete?: (result: JobProgress) => void;
  onError?: (error: string) => void;
}

interface UseBulkJobProgressReturn {
  progress: JobProgress | null;
  error: string | null;
}

const POLLING_INTERVAL = 3000; // Poll every 3 seconds
const MAX_POLLING_INTERVAL = 10000; // Max 10 seconds between polls
const RATE_LIMIT_BACKOFF = 3000; // Add 3 seconds on rate limit

// ============================================================================
// GLOBAL SINGLETON POLLING MANAGER
// Ensures only ONE polling loop per job, regardless of how many hook instances exist
// ============================================================================

interface PollingState {
  intervalId: number | null;
  currentInterval: number;
  subscribers: Set<
    (progress: JobProgress | null, error: string | null) => void
  >;
  lastProgress: JobProgress | null;
  lastError: string | null;
  isCompleted: boolean;
  consecutiveErrors: number;
}

// Global map of active polling jobs
const activePollingJobs = new Map<string, PollingState>();

function getOrCreatePollingState(jobId: string): PollingState {
  let state = activePollingJobs.get(jobId);
  if (!state) {
    state = {
      intervalId: null,
      currentInterval: POLLING_INTERVAL,
      subscribers: new Set(),
      lastProgress: null,
      lastError: null,
      isCompleted: false,
      consecutiveErrors: 0,
    };
    activePollingJobs.set(jobId, state);
  }
  return state;
}

function notifySubscribers(state: PollingState): void {
  state.subscribers.forEach((callback) => {
    callback(state.lastProgress, state.lastError);
  });
}

async function pollJob(jobId: string): Promise<void> {
  const state = activePollingJobs.get(jobId);
  if (!state || state.isCompleted) {
    return;
  }

  try {
    const jobStatus = await api.getJobStatus(jobId);

    // Reset consecutive errors and interval on success
    state.consecutiveErrors = 0;
    if (state.currentInterval !== POLLING_INTERVAL) {
      state.currentInterval = POLLING_INTERVAL;
      // Restart polling with normal interval
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = window.setInterval(
          () => pollJob(jobId),
          state.currentInterval,
        );
      }
    }

    const currentKey = jobStatus["current_key"];
    const progressObj: {
      total: number;
      processed: number;
      errors: number;
      currentKey?: string;
      percentage: number;
    } = {
      total: (jobStatus["total_keys"] as number) || 0,
      processed: (jobStatus["processed_keys"] as number) || 0,
      errors: (jobStatus["error_count"] as number) || 0,
      percentage: (jobStatus["percentage"] as number) || 0,
    };
    if (currentKey && typeof currentKey === "string") {
      progressObj.currentKey = currentKey;
    }

    const progressUpdate: JobProgress = {
      jobId: jobStatus["job_id"] as string,
      status: jobStatus["status"] as
        | "queued"
        | "running"
        | "completed"
        | "failed",
      progress: progressObj,
      ...(jobStatus["download_url"]
        ? {
            result: {
              downloadUrl: jobStatus["download_url"] as string,
              format: (jobStatus["format"] as string) || "json",
              processed: (jobStatus["processed_keys"] as number) || 0,
              errors: (jobStatus["error_count"] as number) || 0,
            },
          }
        : {}),
    };

    state.lastProgress = progressUpdate;
    state.lastError = null;
    notifySubscribers(state);

    if (
      progressUpdate.status === "completed" ||
      progressUpdate.status === "failed"
    ) {
      state.isCompleted = true;
      stopPollingJob(jobId);
    }
  } catch (err) {
    const isRateLimit =
      err instanceof Error &&
      (err.message.includes("429") ||
        err.message.includes("Too Many Requests"));

    if (isRateLimit) {
      // Increase polling interval on rate limit
      state.currentInterval = Math.min(
        state.currentInterval + RATE_LIMIT_BACKOFF,
        MAX_POLLING_INTERVAL,
      );
      bulkJobLogger.warn("Rate limited, slowing polling", {
        interval: state.currentInterval,
      });

      // Restart polling with new interval
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = window.setInterval(
          () => pollJob(jobId),
          state.currentInterval,
        );
      }
      return;
    }

    // For non-rate-limit errors
    bulkJobLogger.error("Polling error", err);
    state.consecutiveErrors++;

    if (state.consecutiveErrors >= 10) {
      bulkJobLogger.error("Too many consecutive errors, stopping polling");
      state.lastError = "Connection error - polling stopped";
      notifySubscribers(state);
      stopPollingJob(jobId);
    } else {
      state.lastError = err instanceof Error ? err.message : "Polling failed";
      notifySubscribers(state);
    }
  }
}

function startPollingJob(jobId: string): void {
  const state = getOrCreatePollingState(jobId);

  // Already polling this job - don't start another loop
  if (state.intervalId) {
    return;
  }

  // Already completed - don't poll again
  if (state.isCompleted) {
    return;
  }

  // Start polling - immediate first poll, then on interval
  pollJob(jobId);
  state.intervalId = window.setInterval(
    () => pollJob(jobId),
    state.currentInterval,
  );
}

function stopPollingJob(jobId: string): void {
  const state = activePollingJobs.get(jobId);
  if (state?.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function subscribeToJob(
  jobId: string,
  callback: (progress: JobProgress | null, error: string | null) => void,
): () => void {
  const state = getOrCreatePollingState(jobId);
  state.subscribers.add(callback);

  // If already have data, notify immediately
  if (state.lastProgress || state.lastError) {
    callback(state.lastProgress, state.lastError);
  }

  // Start polling if not already
  startPollingJob(jobId);

  // Return unsubscribe function
  return () => {
    state.subscribers.delete(callback);

    // If no more subscribers and not completed, stop polling
    if (state.subscribers.size === 0 && !state.isCompleted) {
      stopPollingJob(jobId);
      activePollingJobs.delete(jobId);
    }
  };
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Custom hook for tracking bulk job progress via HTTP polling
 *
 * Uses a global singleton manager to ensure only ONE polling loop per job,
 * even if multiple hook instances exist (e.g., from React StrictMode).
 */
export function useBulkJobProgress({
  jobId,
  onComplete,
  onError,
}: UseBulkJobProgressOptions): UseBulkJobProgressReturn {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  // Handle progress updates
  const handleUpdate = useCallback(
    (newProgress: JobProgress | null, newError: string | null) => {
      setProgress(newProgress);
      setError(newError);

      if (newProgress?.status === "completed" && onCompleteRef.current) {
        onCompleteRef.current(newProgress);
      } else if (newProgress?.status === "failed" && onErrorRef.current) {
        onErrorRef.current("Job failed");
      }
    },
    [],
  );

  // Subscribe to job updates
  useEffect(() => {
    if (!jobId) {
      return;
    }

    const unsubscribe = subscribeToJob(jobId, handleUpdate);

    return (): void => {
      unsubscribe();
    };
  }, [jobId, handleUpdate]);

  return {
    progress,
    error,
  };
}
