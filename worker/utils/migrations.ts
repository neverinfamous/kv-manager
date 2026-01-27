/**
 * Database Migration System
 *
 * Provides automated schema migrations for the KV Manager metadata database.
 * Tracks applied migrations in the schema_version table and applies pending
 * migrations when triggered by the user via the UI upgrade banner.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { logInfo, logWarning, createErrorContext } from "./error-logger";

// ============================================
// Types
// ============================================

export interface Migration {
  version: number;
  name: string;
  description: string;
  sql: string;
}

export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: Migration[];
  appliedMigrations: AppliedMigration[];
  isUpToDate: boolean;
}

export interface AppliedMigration {
  version: number;
  migration_name: string;
  applied_at: string;
}

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  currentVersion: number;
  errors: string[];
}

export interface LegacyInstallationInfo {
  isLegacy: boolean;
  existingTables: string[];
  suggestedVersion: number;
}

// ============================================
// Migration Registry
// ============================================

/**
 * All migrations in order. Each migration should be idempotent where possible
 * (using IF NOT EXISTS, etc.) to handle edge cases gracefully.
 *
 * IMPORTANT: Never modify existing migrations. Always add new ones.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    description:
      "Base schema with namespaces, key_metadata, audit_log, bulk_jobs",
    sql: `
      -- Namespace tracking
      CREATE TABLE IF NOT EXISTS namespaces (
        namespace_id TEXT PRIMARY KEY,
        namespace_title TEXT NOT NULL,
        first_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Key metadata and tags
      CREATE TABLE IF NOT EXISTS key_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace_id TEXT NOT NULL,
        key_name TEXT NOT NULL,
        tags TEXT,
        custom_metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(namespace_id, key_name)
      );

      CREATE INDEX IF NOT EXISTS idx_key_metadata_namespace ON key_metadata(namespace_id);
      CREATE INDEX IF NOT EXISTS idx_key_metadata_search ON key_metadata(key_name);

      -- Audit log
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace_id TEXT NOT NULL,
        key_name TEXT,
        operation TEXT NOT NULL,
        user_email TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_namespace ON audit_log(namespace_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_email, timestamp DESC);

      -- Bulk operation jobs
      CREATE TABLE IF NOT EXISTS bulk_jobs (
        job_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL,
        total_keys INTEGER,
        processed_keys INTEGER,
        error_count INTEGER,
        current_key TEXT,
        percentage REAL DEFAULT 0,
        started_at DATETIME,
        completed_at DATETIME,
        user_email TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);
    `,
  },
  {
    version: 2,
    name: "job_audit_events",
    description: "Add job_audit_events table for tracking job lifecycle events",
    sql: `
      CREATE TABLE IF NOT EXISTS job_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        user_email TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT,
        FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);
    `,
  },
  {
    version: 3,
    name: "webhooks",
    description: "Add webhooks table for external observability notifications",
    sql: `
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
    `,
  },
  {
    version: 4,
    name: "namespace_colors",
    description: "Add namespace_colors table for visual organization",
    sql: `
      CREATE TABLE IF NOT EXISTS namespace_colors (
        namespace_id TEXT PRIMARY KEY,
        color TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_namespace_colors_updated ON namespace_colors(updated_at DESC);
    `,
  },
  {
    version: 5,
    name: "key_colors",
    description: "Add key_colors table for key visual organization",
    sql: `
      CREATE TABLE IF NOT EXISTS key_colors (
        namespace_id TEXT NOT NULL,
        key_name TEXT NOT NULL,
        color TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        PRIMARY KEY (namespace_id, key_name)
      );

      CREATE INDEX IF NOT EXISTS idx_key_colors_namespace ON key_colors(namespace_id);
      CREATE INDEX IF NOT EXISTS idx_key_colors_updated ON key_colors(updated_at DESC);
    `,
  },
  {
    version: 6,
    name: "webhooks_add_name",
    description: "Add name column to webhooks table",
    sql: `
      ALTER TABLE webhooks ADD COLUMN name TEXT NOT NULL DEFAULT '';
    `,
  },
];

// ============================================
// Migration Functions
// ============================================

/**
 * Ensures the schema_version table exists.
 * This is called before any migration checks.
 */
export async function ensureSchemaVersionTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      migration_name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `,
    )
    .run();
}

/**
 * Gets the current schema version from the database.
 * Returns 0 if no migrations have been applied yet.
 */
export async function getCurrentVersion(db: D1Database): Promise<number> {
  try {
    const result = await db
      .prepare("SELECT MAX(version) as version FROM schema_version")
      .first<{ version: number | null }>();

    return result?.version ?? 0;
  } catch {
    // Table might not exist yet
    return 0;
  }
}

/**
 * Gets all applied migrations from the database.
 */
export async function getAppliedMigrations(
  db: D1Database,
): Promise<AppliedMigration[]> {
  try {
    const result = await db
      .prepare(
        "SELECT version, migration_name, applied_at FROM schema_version ORDER BY version ASC",
      )
      .all<AppliedMigration>();

    return result.results;
  } catch {
    return [];
  }
}

/**
 * Gets the migration status including current version and pending migrations.
 */
export async function getMigrationStatus(
  db: D1Database,
): Promise<MigrationStatus> {
  await ensureSchemaVersionTable(db);

  const currentVersion = await getCurrentVersion(db);
  const appliedMigrations = await getAppliedMigrations(db);
  const lastMigration = MIGRATIONS[MIGRATIONS.length - 1];
  const latestVersion = lastMigration?.version ?? 0;

  const pendingMigrations = MIGRATIONS.filter(
    (m) => m.version > currentVersion,
  );

  return {
    currentVersion,
    latestVersion,
    pendingMigrations,
    appliedMigrations,
    isUpToDate: currentVersion >= latestVersion,
  };
}

/**
 * Applies all pending migrations in order.
 * Returns the result of the migration process.
 */
export async function applyMigrations(
  db: D1Database,
): Promise<MigrationResult> {
  const errors: string[] = [];
  let migrationsApplied = 0;

  try {
    await ensureSchemaVersionTable(db);
    const currentVersion = await getCurrentVersion(db);
    const pendingMigrations = MIGRATIONS.filter(
      (m) => m.version > currentVersion,
    );

    if (pendingMigrations.length === 0) {
      logInfo(
        "No pending migrations",
        createErrorContext("migrations", "apply"),
      );
      return {
        success: true,
        migrationsApplied: 0,
        currentVersion,
        errors: [],
      };
    }

    logInfo(
      `Applying ${pendingMigrations.length} migration(s)`,
      createErrorContext("migrations", "apply", {
        metadata: {
          currentVersion,
          pendingCount: pendingMigrations.length,
          migrations: pendingMigrations.map((m) => m.name),
        },
      }),
    );

    for (const migration of pendingMigrations) {
      try {
        logInfo(
          `Applying migration ${migration.version}: ${migration.name}`,
          createErrorContext("migrations", "apply_single", {
            metadata: { version: migration.version, name: migration.name },
          }),
        );

        // Split SQL into individual statements and execute each
        const statements = migration.sql
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          try {
            await db.prepare(statement).run();
          } catch (stmtErr) {
            const stmtError =
              stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
            // Handle idempotent ALTER TABLE ADD COLUMN - if column already exists, treat as success
            if (
              statement.toLowerCase().includes("alter table") &&
              statement.toLowerCase().includes("add column") &&
              stmtError.includes("duplicate column name")
            ) {
              logInfo(
                `Column already exists, skipping: ${statement.substring(0, 50)}...`,
                createErrorContext("migrations", "apply_single", {
                  metadata: {
                    version: migration.version,
                    statement: statement.substring(0, 100),
                  },
                }),
              );
              continue; // Column already exists, that's fine
            }
            throw stmtErr; // Re-throw other errors
          }
        }

        // Record the migration as applied
        await db
          .prepare(
            "INSERT INTO schema_version (version, migration_name) VALUES (?, ?)",
          )
          .bind(migration.version, migration.name)
          .run();

        migrationsApplied++;

        logInfo(
          `Migration ${migration.version} applied successfully`,
          createErrorContext("migrations", "apply_single", {
            metadata: { version: migration.version, name: migration.name },
          }),
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(
          `Migration ${migration.version} (${migration.name}): ${errorMessage}`,
        );

        logWarning(
          `Failed to apply migration ${migration.version}: ${errorMessage}`,
          createErrorContext("migrations", "apply_single", {
            metadata: {
              version: migration.version,
              name: migration.name,
              error: errorMessage,
            },
          }),
        );

        // Stop on first error - don't apply further migrations
        break;
      }
    }

    const newVersion = await getCurrentVersion(db);

    return {
      success: errors.length === 0,
      migrationsApplied,
      currentVersion: newVersion,
      errors,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(`Migration system error: ${errorMessage}`);

    logWarning(
      `Migration system error: ${errorMessage}`,
      createErrorContext("migrations", "apply", {
        metadata: { error: errorMessage },
      }),
    );

    const currentVersion = await getCurrentVersion(db).catch(() => 0);

    return {
      success: false,
      migrationsApplied,
      currentVersion,
      errors,
    };
  }
}

/**
 * Detects if the database has existing tables but no schema_version tracking.
 * This helps identify installations that predate the migration system.
 */
export async function detectLegacyInstallation(
  db: D1Database,
): Promise<LegacyInstallationInfo> {
  try {
    // Check for existing tables
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_version'",
      )
      .all<{ name: string }>();

    const existingTables = result.results.map((r) => r.name);

    // Check if schema_version exists and has entries
    const versionCheck = await getCurrentVersion(db);

    if (versionCheck > 0) {
      // Already tracking versions
      return {
        isLegacy: false,
        existingTables,
        suggestedVersion: versionCheck,
      };
    }

    // Detect which migrations have effectively been applied based on existing tables
    let suggestedVersion = 0;

    if (
      existingTables.includes("namespaces") &&
      existingTables.includes("key_metadata")
    ) {
      suggestedVersion = 1;
    }
    if (existingTables.includes("job_audit_events")) {
      suggestedVersion = 2;
    }
    if (existingTables.includes("webhooks")) {
      suggestedVersion = 3;
    }

    return {
      isLegacy: suggestedVersion > 0,
      existingTables,
      suggestedVersion,
    };
  } catch {
    return { isLegacy: false, existingTables: [], suggestedVersion: 0 };
  }
}

/**
 * Marks migrations as applied without running them.
 * Used for legacy installations that already have the tables.
 */
export async function markMigrationsAsApplied(
  db: D1Database,
  upToVersion: number,
): Promise<void> {
  await ensureSchemaVersionTable(db);

  const migrationsToMark = MIGRATIONS.filter((m) => m.version <= upToVersion);

  for (const migration of migrationsToMark) {
    // Check if already marked
    const existing = await db
      .prepare("SELECT version FROM schema_version WHERE version = ?")
      .bind(migration.version)
      .first();

    if (!existing) {
      await db
        .prepare(
          "INSERT INTO schema_version (version, migration_name) VALUES (?, ?)",
        )
        .bind(migration.version, migration.name)
        .run();

      logInfo(
        `Marked migration ${migration.version} as applied (legacy)`,
        createErrorContext("migrations", "mark_applied", {
          metadata: { version: migration.version, name: migration.name },
        }),
      );
    }
  }
}
