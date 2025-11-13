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
  cancelJob: () => void;
}

const RECONNECT_DELAYS = [500, 1000, 2000]; // Faster backoff for quick jobs
const MAX_RECONNECT_ATTEMPTS = 3; // Fail faster and switch to polling
const POLLING_INTERVAL = 1000; // Poll every second for faster feedback

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
  const hasCancelledRef = useRef(false);
  const isConnectingRef = useRef(false); // Prevent multiple simultaneous connections

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
          // Include download URL for completed export jobs
          result: jobStatus.download_url ? {
            downloadUrl: jobStatus.download_url as string,
            format: jobStatus.format as string || 'json',
            processed: (jobStatus.processed_keys as number) || 0,
            errors: (jobStatus.error_count as number) || 0,
          } : undefined,
        };

        setProgress(progressUpdate);

        if (progressUpdate.status === 'completed' || progressUpdate.status === 'failed' || progressUpdate.status === 'cancelled') {
          hasCompletedRef.current = true;
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (progressUpdate.status === 'completed' && onComplete) {
            onComplete(progressUpdate);
          } else if (progressUpdate.status === 'failed' && onError) {
            onError('Job failed');
          } else if (progressUpdate.status === 'cancelled' && onError) {
            onError('Job was cancelled');
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

  // Cancel job
  const cancelJob = useCallback(() => {
    if (hasCancelledRef.current) {
      console.log('[useBulkJobProgress] Job already cancelled');
      return;
    }

    console.log('[useBulkJobProgress] Cancelling job:', jobId);
    hasCancelledRef.current = true;

    // Send cancel message via WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'cancel', jobId }));
        console.log('[useBulkJobProgress] Cancel message sent via WebSocket');
      } catch (err) {
        console.error('[useBulkJobProgress] Failed to send cancel message:', err);
        setError('Failed to send cancellation request');
      }
    } else {
      console.warn('[useBulkJobProgress] WebSocket not connected, cannot cancel via WebSocket');
      setError('Cannot cancel: WebSocket not connected');
    }
  }, [jobId]);

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
    // Prevent multiple simultaneous connection attempts
    if (wsRef.current || hasCompletedRef.current || isConnectingRef.current) {
      return;
    }

    // Don't attempt to connect if wsUrl or jobId is empty
    if (!wsUrl || !jobId) {
      console.log('[useBulkJobProgress] Skipping connection - missing wsUrl or jobId');
      return;
    }

    // Mark as connecting
    isConnectingRef.current = true;

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
        isConnectingRef.current = false; // Connection established
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        stopPolling(); // Stop polling if it was running
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current || hasCompletedRef.current) return;

        try {
          const data = JSON.parse(event.data) as JobProgress;
          // Log only safe, non-user-controlled metadata to prevent log injection
          console.log('[useBulkJobProgress] Received progress update:', {
            status: data.status,
            percentage: data.progress?.percentage,
            processed: data.progress?.processed,
            total: data.progress?.total
          });

          setProgress(data);

          if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            hasCompletedRef.current = true;

            if (data.status === 'completed' && onComplete) {
              onComplete(data);
            } else if (data.status === 'failed' && onError) {
              onError(data.error || 'Job failed');
            } else if (data.status === 'cancelled' && onError) {
              onError('Job was cancelled');
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

      ws.onerror = () => {
        console.error('[useBulkJobProgress] WebSocket error occurred');
        isConnectingRef.current = false; // Connection failed
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;

        // Only log the numeric close code, not the reason (which could contain user data)
        console.log('[useBulkJobProgress] WebSocket closed with code:', event.code);
        isConnectingRef.current = false; // Connection closed
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
      isConnectingRef.current = false; // Connection attempt failed
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
    cancelJob,
  };
}

