/**
 * Centralized Error Logging System
 *
 * Provides structured error logging with consistent format across all modules.
 * Integrates with webhooks to automatically notify external systems of critical errors.
 */

import type {
  Env,
  ErrorContext,
  ErrorSeverity,
  StructuredError,
} from "../types";
import { triggerWebhooks, createJobFailedWebhookData } from "./webhooks";

/**
 * Generate current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Error code prefixes by module
 */
const ERROR_CODE_PREFIXES: Record<string, string> = {
  namespaces: "NS",
  keys: "KEY",
  metadata: "META",
  search: "SRC",
  audit: "AUD",
  backup: "BKP",
  import_export: "IO",
  bulk: "BLK",
  webhooks: "WHK",
  auth: "AUTH",
  admin: "ADM",
  r2_backup: "R2",
  worker: "WRK",
  export: "EXP",
  import: "IMP",
  jobs: "JOB",
  job_audit: "JOB",
  metrics: "MET",
  migrations: "MIG",
};

/**
 * Generate an error code from context with appropriate suffix based on severity
 */
function generateErrorCode(
  context: ErrorContext,
  level: ErrorSeverity,
): string {
  const prefix = ERROR_CODE_PREFIXES[context.module] ?? "ERR";
  const operation = context.operation.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  // Use appropriate suffix based on severity level
  switch (level) {
    case "error":
      return `${prefix}_${operation}_FAILED`;
    case "warning":
      return `${prefix}_${operation}_WARN`;
    case "info":
      return `${prefix}_${operation}`;
    default:
      return `${prefix}_${operation}`;
  }
}

/**
 * Format error for console logging with structured output
 */
function formatForConsole(error: StructuredError): string {
  const parts = [
    `[${error.level.toUpperCase()}]`,
    `[${error.module}]`,
    `[${error.code}]`,
    error.message,
  ];

  if (error.context) {
    const namespaceId = error.context["namespaceId"];
    if (namespaceId) {
      parts.push(`(ns: ${namespaceId})`);
    }
    const keyName = error.context["keyName"];
    if (keyName) {
      parts.push(`(key: ${keyName})`);
    }
  }

  return parts.join(" ");
}

/**
 * Create a structured error object
 */
export function createStructuredError(
  error: Error | string,
  context: ErrorContext,
  level: ErrorSeverity = "error",
): StructuredError {
  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    timestamp: nowISO(),
    level,
    module: context.module,
    code: generateErrorCode(context, level),
    message,
    context,
    ...(stack !== undefined && { stack }),
  };
}

/**
 * Log an error with structured format
 * Automatically triggers webhooks for error-level logs when jobId is provided
 */
export async function logError(
  env: Env,
  error: Error | string,
  context: ErrorContext,
  isLocalDev: boolean,
  options: {
    triggerWebhook?: boolean;
    jobId?: string;
  } = {},
): Promise<StructuredError> {
  const structuredError = createStructuredError(error, context, "error");

  // Log to console with structured format
  console.error(formatForConsole(structuredError));
  if (structuredError.stack) {
    console.error("[Stack]", structuredError.stack);
  }

  // Log metadata if present
  const metadata = context["metadata"];
  if (
    metadata &&
    typeof metadata === "object" &&
    Object.keys(metadata).length > 0
  ) {
    console.error("[Metadata]", JSON.stringify(metadata));
  }

  // Trigger webhook for job failures
  if (options.triggerWebhook !== false && options.jobId) {
    try {
      await triggerWebhooks(
        env,
        "job.failed",
        createJobFailedWebhookData(
          options.jobId,
          context.operation,
          structuredError.message,
          (context["namespaceId"] as string | undefined) ?? null,
          (context["userId"] as string | undefined) ?? null,
        ),
        isLocalDev,
      );
    } catch (webhookError) {
      console.error("[ErrorLogger] Failed to trigger webhook:", webhookError);
    }
  }

  return structuredError;
}

/**
 * Log a warning with structured format
 */
export function logWarning(
  message: string,
  context: ErrorContext,
): StructuredError {
  const structuredError = createStructuredError(message, context, "warning");

  console.warn(formatForConsole(structuredError));

  const metadata = context["metadata"];
  if (
    metadata &&
    typeof metadata === "object" &&
    Object.keys(metadata).length > 0
  ) {
    console.warn("[Metadata]", JSON.stringify(metadata));
  }

  return structuredError;
}

/**
 * Log an info message with structured format
 */
export function logInfo(
  message: string,
  context: ErrorContext,
): StructuredError {
  const structuredError = createStructuredError(message, context, "info");

  console.log(formatForConsole(structuredError));

  return structuredError;
}

/**
 * Format error for webhook payload
 */
export function formatErrorForWebhook(
  error: StructuredError,
): Record<string, unknown> {
  return {
    timestamp: error.timestamp,
    level: error.level,
    code: error.code,
    message: error.message,
    module: error.context?.module ?? error.module,
    operation: error.context?.operation ?? "unknown",
    namespace_id: error.context?.["namespaceId"],
    key_name: error.context?.["keyName"],
    user_id: error.context?.["userId"],
    metadata: error.context?.["metadata"],
  };
}

/**
 * Create error context helper
 */
export function createErrorContext(
  module: string,
  operation: string,
  options: {
    namespaceId?: string;
    keyName?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): ErrorContext {
  return {
    module,
    operation,
    ...options,
  };
}

/**
 * Wrap an async operation with error logging
 * Logs errors and optionally triggers webhooks on failure
 */
export async function withErrorLogging<T>(
  env: Env,
  context: ErrorContext,
  isLocalDev: boolean,
  operation: () => Promise<T>,
  options: {
    triggerWebhook?: boolean;
    jobId?: string;
    rethrow?: boolean;
  } = {},
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const logOptions: { triggerWebhook?: boolean; jobId?: string } = {};
    if (options.triggerWebhook !== undefined) {
      logOptions.triggerWebhook = options.triggerWebhook;
    }
    if (options.jobId !== undefined) {
      logOptions.jobId = options.jobId;
    }

    await logError(
      env,
      error instanceof Error ? error : String(error),
      context,
      isLocalDev,
      logOptions,
    );

    if (options.rethrow !== false) {
      throw error;
    }

    return null;
  }
}
