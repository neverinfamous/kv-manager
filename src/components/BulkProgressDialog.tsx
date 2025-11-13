import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useBulkJobProgress } from '../hooks/useBulkJobProgress';
import type { JobProgress } from '../services/api';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Ban, History } from 'lucide-react';
import { JobHistoryDialog } from './JobHistoryDialog';

interface BulkProgressDialogProps {
  open: boolean;
  jobId: string;
  wsUrl: string;
  operationName: string;
  namespaceName?: string;
  onClose: () => void;
  onComplete?: (result: JobProgress) => void;
}

export function BulkProgressDialog({
  open,
  jobId,
  wsUrl,
  operationName,
  namespaceName,
  onClose,
  onComplete,
}: BulkProgressDialogProps) {
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null);
  const [canClose, setCanClose] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Only use the hook when dialog is open and we have valid params
  const shouldConnect = open && jobId && wsUrl;
  
  const { progress, isConnected, error: connectionError, cancelJob } = useBulkJobProgress({
    jobId: shouldConnect ? jobId : '',
    wsUrl: shouldConnect ? wsUrl : '',
    onComplete: (result) => {
      setCanClose(true);
      setIsCancelling(false);
      
      // Auto-close after 5 seconds on success or cancellation
      if (result.status === 'completed' || result.status === 'cancelled') {
        const timer = window.setTimeout(() => {
          handleClose();
        }, 5000);
        setAutoCloseTimer(timer);
      }
      
      if (onComplete) {
        onComplete(result);
      }
    },
    onError: () => {
      setCanClose(true);
      setIsCancelling(false);
    },
  });

  useEffect(() => {
    return () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
    };
  }, [autoCloseTimer]);

  const handleClose = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    onClose();
  };

  const handleCancel = () => {
    if (!isCancelling && (progress?.status === 'queued' || progress?.status === 'running')) {
      setIsCancelling(true);
      cancelJob();
    }
  };

  const getStatusIcon = () => {
    if (!progress) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }

    switch (progress.status) {
      case 'queued':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <Ban className="h-5 w-5 text-orange-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-gray-500" />;
    }
  };

  const getStatusText = () => {
    if (!progress) {
      return 'Initializing...';
    }

    if (isCancelling && (progress.status === 'queued' || progress.status === 'running')) {
      return 'Cancelling...';
    }

    switch (progress.status) {
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Running';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return progress.status;
    }
  };

  const percentage = progress?.progress?.percentage || 0;
  const total = progress?.progress?.total || 0;
  const processed = progress?.progress?.processed || 0;
  const errors = progress?.progress?.errors || 0;
  const currentKey = progress?.progress?.currentKey;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && canClose && handleClose()}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => {
        if (!canClose) {
          e.preventDefault();
        }
      }} onEscapeKeyDown={(e) => {
        if (!canClose) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon()}
            <span>{operationName}</span>
          </DialogTitle>
          <DialogDescription>
            {namespaceName && `Namespace: ${namespaceName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className="font-medium">{getStatusText()}</span>
          </div>

          {/* Connection Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Connection:</span>
            <span className="font-medium">
              {isConnected ? (
                <span className="text-green-600">WebSocket</span>
              ) : (
                <span className="text-yellow-600">Polling</span>
              )}
            </span>
          </div>

          {/* Progress Bar */}
          {progress && progress.status !== 'failed' && progress.status !== 'cancelled' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress:</span>
                <span className="font-medium">{percentage.toFixed(1)}%</span>
              </div>
              <Progress value={percentage} className="h-2" />
            </div>
          )}

          {/* Details */}
          {progress && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">{total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed:</span>
                <span className="font-medium">{processed.toLocaleString()}</span>
              </div>
              {errors > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Errors:</span>
                  <span className="font-medium text-red-600">{errors.toLocaleString()}</span>
                </div>
              )}
              {currentKey && progress.status === 'running' && (
                <div className="flex flex-col space-y-1">
                  <span className="text-muted-foreground">Current Key:</span>
                  <span className="font-mono text-xs truncate" title={currentKey}>
                    {currentKey}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {(progress?.status === 'failed' || connectionError) && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              <p className="font-medium">Error:</p>
              <p className="mt-1">{progress?.error || connectionError || 'Operation failed'}</p>
            </div>
          )}

          {/* Success Summary */}
          {progress?.status === 'completed' && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
              <p className="font-medium">Operation completed successfully!</p>
              {progress.result && (
                <div className="mt-2 space-y-1">
                  {progress.result.processed !== undefined && (
                    <p>Processed: {progress.result.processed.toLocaleString()} keys</p>
                  )}
                  {progress.result.errors !== undefined && progress.result.errors > 0 && (
                    <p>Errors: {progress.result.errors.toLocaleString()}</p>
                  )}
                  {progress.result.skipped !== undefined && progress.result.skipped > 0 && (
                    <p>Skipped: {progress.result.skipped.toLocaleString()}</p>
                  )}
                </div>
              )}
              {autoCloseTimer && (
                <p className="mt-2 text-xs">Closing automatically in 5 seconds...</p>
              )}
            </div>
          )}

          {/* Cancelled Summary */}
          {progress?.status === 'cancelled' && (
            <div className="rounded-md bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
              <p className="font-medium">Operation was cancelled</p>
              <div className="mt-2 space-y-1">
                <p>Processed: {processed.toLocaleString()} of {total.toLocaleString()} keys</p>
                {errors > 0 && (
                  <p>Errors: {errors.toLocaleString()}</p>
                )}
              </div>
              {autoCloseTimer && (
                <p className="mt-2 text-xs">Closing automatically in 5 seconds...</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {/* Cancel button - only shown when job is running or queued */}
          {!canClose && (progress?.status === 'queued' || progress?.status === 'running') && (
            <Button
              onClick={handleCancel}
              disabled={isCancelling || !isConnected}
              variant="destructive"
              className="mr-auto"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel Operation
                </>
              )}
            </Button>
          )}

          {/* View History button - shown when job is complete */}
          {canClose && (progress?.status === 'completed' || progress?.status === 'failed' || progress?.status === 'cancelled') && (
            <Button
              onClick={() => setShowHistory(true)}
              variant="outline"
              className="mr-auto"
            >
              <History className="mr-2 h-4 w-4" />
              View History
            </Button>
          )}
          
          <Button
            onClick={handleClose}
            disabled={!canClose}
            variant={progress?.status === 'completed' ? 'default' : 'outline'}
          >
            {canClose ? 'Close' : 'Processing...'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Job History Dialog */}
      <JobHistoryDialog
        open={showHistory}
        jobId={jobId}
        onClose={() => setShowHistory(false)}
      />
    </Dialog>
  );
}

