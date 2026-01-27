/**
 * Logger utility for structured logging
 *
 * This abstraction enables:
 * - External logging service integration (Sentry, LogRocket, Datadog, etc.)
 * - Environment-aware log levels
 * - Structured logging with context
 * - Centralized logging configuration
 *
 * To integrate with an external service, update the log methods below.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** App/module prefix */
  prefix: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: import.meta.env.PROD ? "warn" : "debug",
  timestamps: true,
  prefix: "KV-Manager",
};

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];

    if (this.config.timestamps) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${this.config.prefix}]`);
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);

    return parts.join(" ");
  }

  /**
   * Debug level - verbose information for development
   * Not shown in production by default
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog("debug")) return;

    const formattedMessage = this.formatMessage("debug", message);

    if (context) {
      console.debug(formattedMessage, context);
    } else {
      console.debug(formattedMessage);
    }
  }

  /**
   * Info level - general information
   * Not shown in production by default
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;

    const formattedMessage = this.formatMessage("info", message);

    if (context) {
      console.info(formattedMessage, context);
    } else {
      console.info(formattedMessage);
    }
  }

  /**
   * Warning level - potential issues that don't break functionality
   * Shown in production
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog("warn")) return;

    const formattedMessage = this.formatMessage("warn", message);

    // 🔌 EXTERNAL SERVICE INTEGRATION POINT
    // Add your warning tracking here, e.g.:
    // Sentry.captureMessage(message, { level: 'warning', extra: context })

    if (context) {
      console.warn(formattedMessage, context);
    } else {
      console.warn(formattedMessage);
    }
  }

  /**
   * Error level - errors that need attention
   * Always shown, sent to external services
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog("error")) return;

    const formattedMessage = this.formatMessage("error", message);

    // 🔌 EXTERNAL SERVICE INTEGRATION POINT
    // Add your error tracking here, e.g.:
    // if (error instanceof Error) {
    //   Sentry.captureException(error, { extra: { message, ...context } })
    // } else {
    //   Sentry.captureMessage(message, { level: 'error', extra: { error, ...context } })
    // }

    if (error) {
      console.error(formattedMessage, error, context ?? "");
    } else if (context) {
      console.error(formattedMessage, context);
    } else {
      console.error(formattedMessage);
    }
  }

  /**
   * Create a child logger with a specific module prefix
   */
  child(module: string): Logger {
    return new Logger({
      ...this.config,
      prefix: `${this.config.prefix}:${module}`,
    });
  }
}

// Default logger instance
export const logger = new Logger();

// Pre-configured module loggers for common use cases
export const apiLogger = logger.child("API");
export const authLogger = logger.child("Auth");
export const bulkJobLogger = logger.child("BulkJob");
