import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobProgress } from '../services/api';
import { api } from '../services/api';

interface UseBulkJobProgressOptions {
  jobId: string;
  wsUrl: string;
  onComplete?: (result: JobProgress) => void;
  onError?: (error: string) => void;
}

interface UseBulkJobProgressReturn {
  progress: JobProgress | null;
  isConnected: boolean;
  error: string | null;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const MAX_RECONNECT_ATTEMPTS = 5;
const POLLING_INTERVAL = 2000; // 2 seconds

/**
 * Sanitize data for logging to prevent log injection attacks
 * Removes newlines and limits length to prevent log forging
 */
function sanitizeForLog(data: unknown): string {
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    // Remove newlines, carriage returns, and other control characters
    // eslint-disable-next-line no-control-regex
    const sanitized = str.replace(/[\n\r\t\x00-\x1F\x7F]/g, ' ');
    // Limit length to prevent log flooding
    return sanitized.length > 500 ? sanitized.substring(0, 500) + '...[truncated]' : sanitized;
  } catch {
    return '[Unable to sanitize data]';
  }
}

/**
 * Custom hook for tracking bulk job progress via WebSocket with polling fallback
 */
export function useBulkJobProgress({
  jobId,
  wsUrl,
  onComplete,
  onError,
}: UseBulkJobProgressOptions): UseBulkJobProgressReturn {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const hasCompletedRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);

  // Polling fallback
  const startPolling = useCallback(() => {
    // Don't start polling if jobId is empty
    if (!jobId) {
      console.log('[useBulkJobProgress] Skipping polling - missing jobId');
      return;
    }
    
    console.log('[useBulkJobProgress] Starting polling fallback for job:', jobId);
    
    if (pollingIntervalRef.current) {
      return; // Already polling
    }

    const poll = async () => {
      if (!isMountedRef.current || hasCompletedRef.current) {
        return;
      }

      try {
        const jobStatus = await api.getJobStatus(jobId);
        
        const progressUpdate: JobProgress = {
          jobId: jobStatus.job_id as string,
          status: jobStatus.status as 'queued' | 'running' | 'completed' | 'failed',
          progress: {
            total: (jobStatus.total_keys as number) || 0,
            processed: (jobStatus.processed_keys as number) || 0,
            errors: (jobStatus.error_count as number) || 0,
            currentKey: jobStatus.current_key as string | undefined,
            percentage: (jobStatus.percentage as number) || 0,
          },
        };

        setProgress(progressUpdate);

        if (progressUpdate.status === 'completed' || progressUpdate.status === 'failed') {
          hasCompletedRef.current = true;
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (progressUpdate.status === 'completed' && onComplete) {
            onComplete(progressUpdate);
          } else if (progressUpdate.status === 'failed' && onError) {
            onError('Job failed');
          }
        }
      } catch (err) {
        console.error('[useBulkJobProgress] Polling error:', err);
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    };

    // Poll immediately, then on interval
    poll();
    pollingIntervalRef.current = window.setInterval(poll, POLLING_INTERVAL);
  }, [jobId, onComplete, onError]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    stopPolling();
  }, [stopPolling]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current || hasCompletedRef.current) {
      return;
    }

    // Don't attempt to connect if wsUrl or jobId is empty
    if (!wsUrl || !jobId) {
      console.log('[useBulkJobProgress] Skipping connection - missing wsUrl or jobId');
      return;
    }

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = new URL(import.meta.env.VITE_WORKER_API || window.location.origin).host;
    const fullWsUrl = `${protocol}//${host}${wsUrl}`;

    console.log('[useBulkJobProgress] Connecting to WebSocket:', fullWsUrl);

    try {
      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        
        console.log('[useBulkJobProgress] WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        stopPolling(); // Stop polling if it was running
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current || hasCompletedRef.current) return;

        try {
          const data = JSON.parse(event.data) as JobProgress;
          // Sanitize data before logging to prevent log injection
          console.log('[useBulkJobProgress] Received progress:', sanitizeForLog(data));

          setProgress(data);

          if (data.status === 'completed' || data.status === 'failed') {
            hasCompletedRef.current = true;

            if (data.status === 'completed' && onComplete) {
              onComplete(data);
            } else if (data.status === 'failed' && onError) {
              onError(data.error || 'Job failed');
            }

            // Close WebSocket after completion
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          }
        } catch (err) {
          console.error('[useBulkJobProgress] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[useBulkJobProgress] WebSocket error:', sanitizeForLog(event.type));
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;

        console.log('[useBulkJobProgress] WebSocket closed:', event.code, sanitizeForLog(event.reason));
        setIsConnected(false);
        wsRef.current = null;

        // Don't reconnect if job is complete or if closed normally
        if (hasCompletedRef.current || event.code === 1000) {
          return;
        }

        // Try to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS[reconnectAttemptsRef.current] || RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
          reconnectAttemptsRef.current++;

          console.log(`[useBulkJobProgress] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isMountedRef.current && !hasCompletedRef.current && connectRef.current) {
              connectRef.current();
            }
          }, delay);
        } else {
          // Max reconnect attempts reached, fall back to polling
          console.log('[useBulkJobProgress] Max reconnect attempts reached, falling back to polling');
          setError('WebSocket connection failed, using polling fallback');
          startPolling();
        }
      };

      // Send ping to keep connection alive
      const pingInterval = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000); // Ping every 30 seconds

      // Store ping interval for cleanup
      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });
    } catch (err) {
      console.error('[useBulkJobProgress] Failed to create WebSocket:', err);
      setError('Failed to establish WebSocket connection');
      startPolling(); // Fall back to polling immediately
    }
  }, [jobId, wsUrl, onComplete, onError, startPolling, stopPolling]);

  // Store connect in ref to avoid circular dependency
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    // Connect asynchronously to avoid false-positive linting error
    const timeoutId = setTimeout(() => {
      connect();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      isMountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    progress,
    isConnected,
    error,
  };
}

