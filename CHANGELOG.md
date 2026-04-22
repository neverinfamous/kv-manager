# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/neverinfamous/kv-manager/compare/v2.2.7...HEAD)

## [2.2.7](https://github.com/neverinfamous/kv-manager/compare/v2.2.6...v2.2.7) - 2026-04-22

### Fixed

- Resolved ESLint `react-hooks/set-state-in-effect` cascading render violations across multiple components (`App`, `AuditLog`, `HealthDashboard`, `JobHistory`, `KeyEditorDialog`, etc.) by wrapping synchronous state updates inside `useEffect` with `queueMicrotask`.
- Fixed `react-hooks/immutability` errors in `App.tsx` by reordering function declarations.

### Changed

- **Dependency Updates**
  - Updated React and React DOM to 19.2.5
  - Updated Tailwind CSS to 4.2.4
  - Updated Vite to 8.0.9
  - Updated Wrangler to 4.84.1
  - Updated PostCSS to 8.5.10
  - Updated `lucide-react` to 1.8.0
  - Updated `@cloudflare/workers-types` to 4.20260422.1
  - Updated `@types/node` to 25.6.0
  - Updated Dockerfile and package.json overrides for `tar` (7.5.13) and `minimatch` (10.2.5)

## [2.2.6](https://github.com/neverinfamous/kv-manager/compare/v2.2.5...v2.2.6) - 2026-04-06

### Changed

- Bumped `vite` to `8.0.5`, `eslint` to `10.2.0`, `wrangler` to `4.80.0`, `lucide-react` to `1.7.0`, `jose` to `6.2.2`
- Updated `@cloudflare/workers-types`, `@types/node`, `@tailwindcss/postcss`, `tailwindcss`, `typescript`, `typescript-eslint`

### Security

- Fixed `picomatch` Method Injection vulnerability via exact pins and Docker build layer patching
- Fixed `flatted` Prototype Pollution vulnerability via exact pins
- Fixed `brace-expansion` DoS vulnerability

## [2.2.5](https://github.com/neverinfamous/kv-manager/compare/v2.2.4...v2.2.5) - 2026-03-17

### Changed

- Bumped `vite` to `^8.0.0` and `@vitejs/plugin-react` to `^6.0.1` and adapted `manualChunks` configuration
- Updated generic project dependencies to their latest compatible ranges via `npm update`

### Security

- Added exact version override for `undici` to resolve multiple high-severity vulnerabilities:
  - GHSA-f269-vfmq-vjvj: Malicious WebSocket 64-bit length overflows parser and crashes the client
  - GHSA-2mjp-6q6p-2qxm: HTTP Request/Response Smuggling issue
  - GHSA-4992-7rv2-5pvq: CRLF Injection in undici via `upgrade` option
  - GHSA-vrm6-8vpv-qv8q: Unbounded Memory Consumption in WebSocket permessage-deflate Decompression
  - GHSA-v9p9-hfj2-hcw8: Unhandled Exception in WebSocket Client Due to Invalid server_max_window_bits Validation
  - GHSA-phc3-fgpg-7m6h: Unbounded Memory Consumption in its DeduplicationHandler via Response Buffering

## [2.2.4](https://github.com/neverinfamous/kv-manager/compare/v2.2.3...v2.2.4) - 2026-03-10

### Changed

- `@cloudflare/workers-types`: 4.20260307.1 → 4.20260310.1 (patch)
- `@types/node`: 25.3.5 → 25.4.0 (minor)
- `jose`: 6.2.0 → 6.2.1 (patch)
- `typescript-eslint`: 8.56.1 → 8.57.0 (minor)
- `wrangler`: 4.71.0 → 4.72.0 (minor)
- `tar` override: 7.5.10 → 7.5.11 (patch) — npm + Docker layers
- GitHub Actions: `docker/setup-buildx-action` (v3 → v4), `docker/login-action` (v3 → v4), `docker/metadata-action` (v5 → v6), `docker/build-push-action` (v6 → v7)

### Fixed

- **Empty Vendor Chunk**: Removed `vendor-react` manual chunk from Vite config — Vite 7's automatic JSX runtime inlines React during transform, making the separate chunk empty (0 bytes)

## [2.2.3](https://github.com/neverinfamous/kv-manager/compare/v2.2.2...v2.2.3) - 2026-03-07

### Changed

- Moved `Changelog.md` from the wiki repository into the main project root as `CHANGELOG.md`
- Fixed `Update Docker Hub Description` and `Deployment Summary` steps in `docker-publish.yml` to trigger on tag pushes (`startsWith(github.ref, 'refs/tags/v')`) instead of branch pushes (`refs/heads/main`)

## [2.2.2](https://github.com/neverinfamous/kv-manager/compare/v2.2.1...v2.2.2) - 2026-03-07

### Changed

- `lucide-react`: 0.575.0 → 0.577.0

### Security

- Updated `tar` npm bundle and overrides to 7.5.10 to resolve vulnerabilities

## [2.2.1](https://github.com/neverinfamous/kv-manager/compare/v2.2.0...v2.2.1) - 2026-03-01

### Changed

- **Node.js 24 LTS Baseline**: Upgraded from Node 20 to Node 24 LTS across all configurations
  - Dockerfile updated to use `node:24-alpine` for both builder and runtime stages
  - GitHub Actions workflows updated to use Node 24.x as primary version
  - `package.json` now includes `engines` field requiring Node.js >=24.0.0
  - README prerequisites updated to specify Node.js 24+ (LTS)
- **ESLint 10 Migration**: Upgraded from ESLint 9 to ESLint 10
  - Updated `eslint` 9.39.2 → 10.0.1 and `@eslint/js` 9.39.2 → 10.0.1
  - Fixed 2 `no-useless-assignment` violations in `worker/index.ts` and `src/components/JobHistoryDialog.tsx`
  - Updated `tsconfig.app.json` target/lib from ES2020 → ES2022 (required for `Error` `cause` option)
  - Added `eslint-plugin-react-hooks` eslint peer dep override (plugin hasn't declared ESLint 10 support yet)
  - Removed `brace-expansion` override (no longer needed; was incompatible with minimatch 10.x)
- Removed `dependabot-auto-merge.yml` — dependencies are now updated manually in batched local sessions
- `@cloudflare/workers-types`: 4.20260210.0 → 4.20260305.0
- `@tailwindcss/postcss`: 4.1.18 → 4.2.1
- `@types/node`: 25.2.3 → 25.3.3
- `@types/react`: 19.2.13 → 19.2.14
- `eslint`: 9.39.2 → 10.0.2
- `@eslint/js`: 9.39.2 → 10.0.1
- `eslint-plugin-react-refresh`: 0.5.0 → 0.5.2
- `globals`: 17.3.0 → 17.4.0
- `lucide-react`: 0.563.0 → 0.575.0
- `react-day-picker`: 9.13.2 → 9.14.0
- `tailwind-merge`: 3.4.0 → 3.5.0
- `tailwindcss`: 4.1.18 → 4.2.1
- `typescript-eslint`: 8.55.0 → 8.56.1
- `wrangler`: 4.64.0 → 4.69.0

### Fixed

- **CodeQL Semicolon Insertion**: Fixed automatic semicolon insertion warning in `handleMigrate` function (`App.tsx:929`) — added explicit semicolon to `setError('')` statement (CodeQL alert #46)
- **ESLint Zero-Suppression Sweep**: Eliminated all 12 `eslint-disable` comments through proper code refactoring
  - **react-refresh/only-export-components**: Extracted utility variants to separate files (`badge-variants.ts`, `button-variants.ts`, `theme-context-types.ts`); updated `calendar.tsx` to import from `button-variants.ts`
  - **react-hooks/exhaustive-deps**: Converted inline functions to `useCallback` with proper dependencies in `AuditLog.tsx`, `JobHistory.tsx`, `JobHistoryDialog.tsx`, `MetadataEditor.tsx`, `SearchKeys.tsx`, and `useNamespaceViewPreference.ts`
  - **@typescript-eslint/no-unused-vars**: Made `wsUrl` optional in `useBulkJobProgress` hook for API compatibility
  - **@typescript-eslint/no-explicit-any**: `api.ts` uses `Promise<unknown>` for `inFlightRequests`; `worker/index.ts` uses `unknown` intermediate cast for `ASSETS.fetch`

### Security

- **GHSA-7r86-cg39-jmmj** (minimatch ReDoS, high severity): Updated minimatch override `^10.2.1` → `^10.2.3`; replaced scoped `@typescript-eslint/typescript-estree` override with top-level `minimatch` override; added minimatch@10.2.4 Docker patch for both builder and runtime stages
- **GHSA-3ppc-4f35-3m26** (minimatch ReDoS): ESLint 10 upgrade eliminated the eslint-chain minimatch vulnerability; removed `brace-expansion` ^2.0.2 override (incompatible with minimatch 10.x)
- **CVE-2026-26960** (tar path traversal): Updated tar override 7.5.2 → 7.5.8
- **CI/CD CodeQL Deprecation Fix**: Removed deprecated `fail-on: error` input from `github/codeql-action/analyze@v4` in `codeql.yml` and `docker-publish.yml`

## [2.2.0](https://github.com/neverinfamous/kv-manager/compare/v2.1.0...v2.2.0) - 2026-01-08

### Added

- **Health Dashboard**: New tab providing at-a-glance operational status
  - System health score (0-100) based on job failures, backup coverage, and metadata tracking
  - Summary cards: Namespaces, Keys Tracked, R2 Backups, Recent Jobs
  - Failed jobs alert with error counts and timestamps
  - Low metadata coverage warnings for namespaces needing attention
  - R2 backup status with last backup date
  - Namespace organization stats (colors, metadata coverage)
  - 2-minute cache TTL with manual refresh capability
  - Backend: parallelized D1 queries with graceful degradation
  - Mock data for local development mode
- **Cross-Namespace Bulk Key Migration**: Migrate keys between namespaces with rollback support
  - Two API endpoints: `/api/migrate/keys` (selected keys) and `/api/migrate/namespace` (all keys)
  - Cutover modes: `copy` (keep source) and `copy_delete` (remove source after verification)
  - TTL preservation, D1 metadata migration, pre-migration R2 backup (optional), and verification step
  - Progress tracking via job history and real-time polling; batch operations using Cloudflare bulk API (10K keys/batch)
  - Full audit trail for compliance
- **Enhanced Metrics Dashboard with Storage Tab**: Upgraded metrics dashboard with tabbed interface
  - **Operations Tab**: View operational metrics (read/write counts, latency percentiles)
  - **Storage Tab**: View storage metrics (key count, byte count) per namespace with trend indicators
  - New GraphQL dataset: `kvStorageAdaptiveGroups` alongside existing `kvOperationsAdaptiveGroups`
  - Time range selector: Last 24 hours, Last 7 days, Last 30 days
  - Storage summary cards with trending arrows; namespace breakdown table with sortable columns and expandable rows
  - Updated API response format with `summary`, `byNamespace`, `operationsSeries`, and `storageSeries`

### Changed

- **TailwindCSS v4 Upgrade**: Major upgrade from TailwindCSS 3.4.19 to 4.1.17
  - Migrated from `tailwindcss` PostCSS plugin to new `@tailwindcss/postcss` package
  - Replaced `@tailwind` directives with `@import "tailwindcss"` syntax
  - Added `@theme` directive for CSS variable-based color registration (shadcn/ui compatibility)
  - Removed `autoprefixer` dependency (now bundled in TailwindCSS v4)
  - Updated `postcss.config.js` to use new plugin structure
- **Dependency Updates**
  - `eslint`: 9.39.1 → 9.39.2
  - `@eslint/js`: 9.39.1 → 9.39.2
  - `@types/node`: 24.10.1 → 25.0.2
  - `typescript-eslint`: 8.48.1 → 8.49.0
  - `wrangler`: 4.53.0 → 4.55.0
  - `vite`: 7.2.7 → 7.3.0
  - `react`: 19.2.1 → 19.2.3
  - `react-dom`: 19.2.1 → 19.2.3

### Security

- **Stack Trace Exposure Prevention**: Fixed CodeQL security alerts by preventing internal error details from being exposed to users
  - Replaced exposed error messages in `worker/routes/colors.ts` (2 instances) and `worker/routes/import-export.ts` (1 instance) with generic user-facing messages
  - Error details still logged server-side via centralized error logger

## [2.1.0](https://github.com/neverinfamous/kv-manager/compare/v2.0.0...v2.1.0) - 2025-12-11

### Added

- **Namespace Color Tags**: Visual color organization for namespaces in Grid and List views
  - 27-color palette organized in rows by hue (reds, oranges, yellows, greens, blues, purples, neutrals)
  - Color picker dropdown with fixed positioning to prevent clipping in table/grid layouts
  - Color indicator dot next to namespace icon; bottom border stripe on Grid view cards
  - Optimistic UI updates with rollback on API failure
  - New API endpoints: `GET /api/namespaces/colors`, `PUT /api/namespaces/:id/color`
  - Database migration version 4 adds `namespace_colors` table
  - Full WCAG accessibility: aria-labels, keyboard navigation, focus indicators
- **Key Color Tags**: Visual color organization for individual keys in the Keys list
  - Same 27-color palette as namespace colors; color picker at start of each key row
  - Optimistic UI updates with rollback on API failure
  - New API endpoints: `GET /api/keys/:namespaceId/colors`, `PUT /api/keys/:namespaceId/:keyName/color`
  - Database migration version 5 adds `key_colors` table
- **Create Key Metadata Fields**: Enhanced Create Key dialog with full metadata support
  - KV Native Metadata (JSON) field with live validation and formatting via `JsonEditor`
  - Tags section with inline add/remove functionality (keyboard support: Enter to add)
  - Custom Metadata (JSON) field for D1-backed searchable metadata
  - Tags and custom metadata saved to D1 on key creation for enhanced search
  - Full WCAG accessibility: labeled inputs, aria-labels on remove buttons

### Fixed

- **Bulk TTL Update UI Refresh**: Fixed Expiration column not updating after bulk TTL update
  - Added `skipCache` parameter to `loadKeys()` function
  - After bulk operations complete, key list now fetches fresh data bypassing API cache

## [2.0.0](https://github.com/neverinfamous/kv-manager/compare/v1.0.0...v2.0.0) - 2025-12-09

### Added

- **Automated Database Migrations**: In-app database upgrade system with visual banner
  - Yellow upgrade banner appears when schema migrations are pending; one-click "Upgrade Now" button
  - Automatic legacy installation detection; green success banner auto-hides after 5 seconds
  - Schema version tracking via `schema_version` table
  - Three initial migrations: initial_schema, job_audit_events, webhooks
  - New API endpoints: `GET /api/migrations/status`, `POST /api/migrations/apply`, `POST /api/migrations/mark-legacy`
  - Full WCAG compliance with ARIA labels and keyboard navigation
- **Rename Key Feature**: Rename individual keys while preserving value, metadata, and tags
  - Pencil icon button in keys list; rename dialog with keyboard support (Enter to submit)
  - Atomic backend operation (copy value/metadata to new key, then delete old key)
  - Full audit logging with old/new name details; D1 metadata automatically migrated to new key name
- **Enhanced JSON Metadata Editors**: Improved JSON input experience in Create/Edit Key dialogs
  - New reusable `JsonEditor` component with live validation and formatting
  - Real-time "✓ Valid JSON" / "✗ Invalid JSON" status indicator with debounced validation (300ms)
  - Auto-completion for braces `{}`, brackets `[]`, and quotes `""`; smart backspace for matched pairs
  - "Format" button to pretty-print JSON with 2-space indentation
  - Save buttons disabled when JSON is invalid; full ARIA accessibility (`aria-describedby`, `aria-invalid`, `aria-live="polite"`)
  - Applied to: Create Key metadata field, Edit Key KV Native Metadata, MetadataEditor Custom Metadata
- **UI Improvements**
  - Namespace filter bar to filter namespaces by name on the main page
  - Namespace cards display estimated key count (fetched via batched parallel API calls)
  - Tooltips on key action buttons ("Rename Key", "Delete Key")
  - Namespace cards show "ID:" prefix; namespace ID is clickable to copy to clipboard
  - Cloudflare KV dashboard link icon in header (next to theme toggle)
  - **Namespace View Toggle**: Grid/List toggle in filter bar; list view is the default; preference persisted in localStorage; full keyboard accessibility using ARIA radiogroup pattern; all action icons displayed inline with hover tooltips
  - Fixed accessibility: added `htmlFor`/`id` to Label/Select pairs in Export, Backup, and Restore dialogs
- **Audit Log Enhancements**: View namespace deletion and other cross-namespace events
  - "All Namespaces" option (now the default) to view audit entries across all namespaces
  - Added missing operation types to filter: Create/Rename/Delete Namespace, Rename Key, R2 Backup/Restore
  - Shows namespace title/ID in log entries when viewing "All Namespaces"
  - New backend endpoint: `GET /api/audit/all`
- **KV Metrics Dashboard**: View Cloudflare KV analytics and performance data
  - New "Metrics" tab between Search and Job History
  - Real-time metrics from Cloudflare's GraphQL Analytics API
  - Summary cards: total operations, reads, writes, data points; operations breakdown with progress bars; average latency table with P50/P90/P99 percentiles
  - Namespace selector; date range presets: Last 7/14/30/90 days; refresh button; 2-minute cache TTL with exponential backoff for rate limiting
  - Backend GraphQL proxy: `GET /api/metrics` and `GET /api/metrics/:namespaceId`
  - Full accessibility with ARIA labels and keyboard navigation
- **Webhook Management UI**: Full frontend interface for webhook configuration
  - New "Webhooks" tab in main navigation; visual webhook list with status badges
  - Create/Edit/Delete webhook dialogs; event selector with all 13 KV-specific event types
  - Test webhook button; toggle enabled/disabled state inline; HMAC signature indicator
  - New components: `WebhookManager.tsx`, `webhookApi.ts`, `types/webhook.ts`
- **Webhook Notifications**: Event-driven HTTP notifications for key operations
  - Supported events: key_create, key_update, key_delete, bulk operations, backup/restore, job_failed
  - Optional HMAC-SHA256 signatures for payload verification; fire-and-forget dispatch (non-blocking)
  - New API endpoints: GET/POST/PUT/DELETE `/api/webhooks`, POST `/api/webhooks/:id/test`
  - Database schema with `webhooks` table; migration file: `add_webhooks.sql`
- **Centralized Error Logging**: Structured error logging system for all worker routes
  - Module-prefixed error codes (e.g., `KEY_CREATE_FAILED`, `BLK_DELETE_FAILED`, `BKP_RESTORE_FAILED`)
  - Severity levels: error, warning, info; automatic webhook triggering for job failures
  - Consistent log format: `[LEVEL] [module] [CODE] message (context)`; stack trace capture
  - New utilities: `worker/utils/error-logger.ts`, `worker/utils/webhooks.ts`
- **Migration Infrastructure**: Comprehensive migration system for database updates
  - Single migration file: `apply_all_migrations.sql` for one-step updates; idempotent migrations safe to run multiple times
  - Detailed migration guide with troubleshooting and verification steps for both production (`--remote`) and development (`--local`) databases
- **Advanced Job History Filters**: Comprehensive filtering and sorting system for job history
  - **Namespace Filter**, **Date Range Filter** (presets or custom calendar picker), **Job ID Search** (debounced, 500ms), **Error Threshold Filter**, **Multi-Column Sorting**, **Sort Order Toggle**, **Clear All Filters**
  - All filters combinable; responsive 3-column grid with 9 filter controls
  - New UI components: Popover and Calendar (react-day-picker with date-fns)
  - Extended `GET /api/jobs` with 7 new query parameters: `namespace_id`, `start_date`, `end_date`, `job_id`, `min_errors`, `sort_by`, `sort_order`; sort column validated via whitelist to prevent SQL injection
- **Job History UI**: Comprehensive user interface for viewing job event timelines and operation history
  - New "Job History" navigation tab; filtering by status and operation type; pagination with "Load More"
  - Job cards with operation type, namespace, status, timestamps, and progress summary
  - Event timeline visualization with color-coded status indicators and milestone markers
  - "View History" button in BulkProgressDialog after job completion
  - Relative and absolute timestamp formatting; user authorization (users see only their own jobs)
  - New components: `JobHistory.tsx`, `JobHistoryDialog.tsx`; new API methods: `api.getJobList()`, `api.getJobEvents()`
- **New API Endpoints**:
  - `GET /api/jobs` — Paginated job list with filtering (limit, offset, status, operation_type)
  - `GET /api/jobs/:jobId/events` — Retrieve audit event history for a specific job (user-authorized)
  - `GET /api/jobs/:jobId/ws` — WebSocket endpoint for real-time job progress updates
  - `GET /api/jobs/:jobId/download` — Download endpoint for completed export files
- **Job Audit Event Logging**: Lifecycle event tracking for all bulk and import/export jobs
  - New `job_audit_events` D1 table: stores `started`, `progress_25`, `progress_50`, `progress_75`, `completed`, `failed`, `cancelled` events with JSON metadata
  - User-based access control; helper function `logJobEvent()` in `worker/utils/helpers.ts`
- **WebSocket-based Real-time Progress Tracking**: All bulk operations use WebSocket connections for live progress updates
  - Async processing via Cloudflare Durable Objects; Hibernation API for cost efficiency
  - Automatic fallback to HTTP polling with exponential backoff reconnection
  - Progress dialog component `BulkProgressDialog` and custom hook `useBulkJobProgress`
- **Enhanced Import/Export Operations**: Async import/export with real-time progress tracking
  - Export files temporarily stored in Durable Object storage and served via download endpoint
  - Automatic download trigger on export job completion
- **Database Schema Enhancements**:
  - `current_key` and `percentage` columns added to `bulk_jobs`
  - `job_audit_events` table with foreign key to `bulk_jobs`, indexed by `job_id` and `user_email`
  - `metadata` column added to `bulk_jobs` for batch operation details
  - Schema supports `cancelled` status in `bulk_jobs.status` and `job_audit_events.event_type`

### Changed

- **Build Optimization**: Significant reduction in bundle size and improved caching
  - Replaced 2MB Vite placeholder favicon with inline SVG data URI (~200 bytes)
  - Configured Vite manual chunks: `vendor-react` (11 KB gzip), `vendor-radix` (33 KB gzip), `vendor-date` (19 KB gzip), `vendor-icons` (3.5 KB gzip), `vendor-utils` (0.5 KB gzip)
  - Lazy loading for `SearchKeys`, `AuditLog`, `JobHistory`, `KVMetrics` with Suspense spinner fallback
  - Main bundle reduced from 518 KB → 298 KB (−42%); eliminated "chunks larger than 500 KB" build warning
- **Documentation Consolidation**: Migration instructions integrated into main README; removed separate `MIGRATION_GUIDE.md`
- **Batch R2 Backup & Restore**: Multi-namespace backup and restore operations to/from R2
  - **Batch Backup Selected to R2** and **Batch Restore Selected from R2** via batch action toolbar
  - Format selection (JSON/NDJSON) for batch backups; per-namespace backup selection in restore dialog
  - Progress tracking per namespace; individual audit log entries for each namespace in batch
  - Job history integration with `batch_r2_backup` and `batch_r2_restore` types
  - New API endpoints: `POST /api/r2-backup/batch`, `POST /api/r2-restore/batch`
- **R2 Backup & Restore**: Complete R2 integration for namespace backups
  - Backup and restore full namespace snapshots; organized storage: `backups/{namespaceId}/{timestamp}.json`
  - JSON and NDJSON formats; progress tracking identical to Import/Export; optional R2 bucket binding
  - New API endpoints: `GET /api/r2-backup/:namespaceId/list`, `POST /api/r2-backup/:namespaceId`, `POST /api/r2-restore/:namespaceId`
  - New wrangler.toml R2 binding: `BACKUP_BUCKET`; audit logging for both operation types
- **Import/Export Metadata Support**: Enhanced import with dual metadata system support
  - `metadata` field → Cloudflare KV native metadata (1024 byte limit); `custom_metadata` field → D1 database (unlimited, searchable); `tags` field → D1 for organization
  - Supports both `ttl` and `expiration_ttl` field names; bulk write API for proper KV native metadata storage
- **Progress Tracking**: Switched from WebSocket connections to HTTP polling for increased reliability
  - 1-second polling intervals until completion; reduced progress hook from 320 to 150 lines (−47%)
  - Export files download automatically on polling detection
- **Import Processing**: Switched from individual PUT requests to bulk write API
  - Batched writes (100 keys per batch); separates KV native metadata from D1 custom metadata; D1 entries always created for search indexing
- **Maximum TypeScript Strictness**: All strict type-checking options enabled
  - `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `allowUnusedLabels: false`, `allowUnreachableCode: false`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`, `verbatimModuleSyntax` (worker)
- **Maximum ESLint Strictness**: Using `strictTypeChecked` + `stylisticTypeChecked` rulesets
  - `explicit-function-return-type`, `strict-boolean-expressions`, `prefer-nullish-coalescing`, `prefer-optional-chain`, `prefer-regexp-exec`, `consistent-type-imports/exports/definitions`, `no-unsafe-*`, `array-type`
- **Navigation Structure**: Added "Job History" as primary nav tab; reordered to place Job History before Audit Log
- **Bulk Operations Architecture**: All bulk operations (delete, copy, TTL, tag) are now asynchronous — operations return immediately with `job_id`, `status`, and `ws_url`; progress tracking uses detailed WebSocket-based updates
- **Import/Export Flow**: Export no longer blocks the HTTP request; results served from Durable Object storage
- **Frontend UX**: Progress dialog shows real-time updates; connection status indicator (WebSocket vs polling); auto-close on success; cancel button with loading state; post-completion "View History" button
- **TypeScript Types**: Updated `ImportParams` interface to support dual metadata system (`metadata`, `custom_metadata`, `expiration` fields with inline documentation)
- **Dependency Updates**
  - `wrangler`: 4.50.0 → 4.53.0
  - `@cloudflare/workers-types`: 4.20251128.0 → 4.20251205.0
  - `@eslint/js`: 9.13.0 → 9.39.1
  - `eslint`: 9.36.0 → 9.39.1
  - `esbuild`: 0.25.10 → 0.27.1
  - `eslint-plugin-react-refresh`: 0.4.14 → 0.4.24
  - `globals`: 16.4.0 → 16.5.0
  - `jose`: 6.1.2 → 6.1.3
  - `lucide-react`: 0.555.0 → 0.556.0
  - `react-day-picker`: 9.11.3 → 9.12.0
  - `typescript-eslint`: 8.47.0 → 8.48.1
  - `@radix-ui/react-label`: 2.1.7 → 2.1.8

### Fixed

- **Edit Key Dialog TTL Not Loading**: Backend GET key endpoint now fetches expiration from Cloudflare KV keys list endpoint; frontend calculates remaining TTL from expiration timestamp
- **KV Native Metadata Not Persisting**: Backend now uses Cloudflare KV bulk write API to save value with metadata; properly stores and retrieves metadata in Workers environment
- **Edit Key Dialog Value Not Refreshing**: Added cache-busting parameter to `getKey` API calls; timestamp-based key prop forces dialog remount on each open
- **Orphaned D1 Metadata on Key Delete**: Single key delete and bulk delete now remove associated D1 metadata (tags, custom_metadata) to prevent ghost metadata on key recreation
- **Create New Key TTL Validation**: Added inline error message for TTL between 1-59 seconds; Create button disabled when TTL is invalid
- **Edit Key Dialog TTL Display**: TTL field no longer pre-populated with decreasing remaining time — now shows "Current expiration" date/time; inline validation error for TTL < 60s; Save Changes button disabled when TTL is invalid
- **Search Not Finding Tags**: Main search field now searches both key names AND tags; separate "Filter by Specific Tags" field retained for explicit tag filtering
- **Edit Key Dialog UX Improvements**: "Metadata saved" success confirmation auto-hides after 3 seconds; browser autocomplete disabled on tag input to prevent dark mode styling issues
- **Edit Key Dialog Save Button**: Save Changes button now tracks changes to value, metadata, and TTL separately; changing only KV Native Metadata or only TTL now enables the button
- **Accessibility**: Removed unconnected `<Label>` elements from Select components in Job History UI; added `aria-label` to all SelectTrigger components; replaced `&nbsp;` spacing hack with proper flex layout
- **Database Schema**: Added idempotent migrations for `job_audit_events` table, `current_key` and `percentage` columns in `bulk_jobs`, and `metadata` column in `bulk_jobs`
- **TypeScript Strict Mode Compliance**: Resolved all 108 TypeScript errors introduced by strict type-checking
  - Fixed webhook type system with separate `WebhookDB` and `Webhook` interfaces
  - Corrected database storage types (`events` as JSON string, `enabled` as 0/1)
  - Added null checks for array access in `BulkOperationDO.ts`; fixed index signature access violations
  - Removed 11 unused `@ts-expect-error` directives; fixed `exactOptionalPropertyTypes` violations
  - Fixed `useEffect` return type in `ThemeContext.tsx`; removed unused `state` properties from DO classes
- **Error Logging Prefixes**: Added missing module prefixes — `worker` → `WRK_`, `export` → `EXP_`, `import` → `IMP_`, `jobs` → `JOB_`; all modules now show proper prefixes instead of fallback `ERR_`
- **Error Logging Compliance**: Converted 100+ ad-hoc `console.log/error/warn` statements across all worker modules to use centralized error logger with structured context; critical errors trigger webhook notifications
- **Export Job Polling Rate Limits**: Fixed 429 errors during namespace export — increased base polling interval (2s → 3s), increased rate limit backoff (3s → 5s, up to 15s max), added 500ms initial delay, `isPollingRef` guard to prevent multiple polling instances
- **HTTP Polling Rate Limits**: Implemented exponential backoff for 429 responses — base interval 1s → 2s; increases by 3s on rate limit (up to 10s max); interval resets on successful polls; rate limit errors handled silently
- **WebSocket Connection Loop**: Added parameter validation in `useBulkJobProgress` to prevent connection attempts with empty `jobId` or `wsUrl`; conditional guard in `BulkProgressDialog` to only invoke hook when dialog is open with valid parameters
- **Deprecated API Usage**: Replaced `String.prototype.substr()` with `slice()`; replaced `React.ElementRef` with `React.ComponentRef`; replaced `MediaQueryList.addListener/removeListener` with `addEventListener/removeEventListener`
- **Type Safety**: Added explicit type assertions for `JSON.parse()` results; proper type guards for `request.json()`; fixed unsafe member access on `unknown` and `error` typed values; fixed template literal expressions to use `String()` conversions; fixed index signature property access to bracket notation
- **Log Injection Prevention**: Modified WebSocket message logging to only output safe, non-user-controlled fields (status, percentage, processed/total counts); removed logging of key names, error messages, and close reasons
- **Bulk Operations Job Completion**: Changed fire-and-forget pattern to `await stub.fetch(doRequest)` in all bulk operation routes — jobs now properly transition from "queued" to "running" to "completed"/"failed"

### Removed

- **WebSocket Support**: Removed unused WebSocket infrastructure from worker and Durable Objects (BulkOperationDO, ImportExportDO); frontend exclusively uses HTTP polling
- **Job Cancellation Feature**: Removed non-functional job cancellation — cancel button, `cancelJob` function, cancellation logic in Durable Objects, and `'cancelled'` TypeScript type; database schema retains `'cancelled'` status for backward compatibility with historical records

## [1.0.0](https://github.com/neverinfamous/kv-manager/releases/tag/v1.0.0) - 2025-11-05

### Added

- Initial release of Cloudflare KV Manager
- Full namespace management (create, delete, rename, browse)
- Complete key CRUD operations with cursor-based pagination
- TTL (expiration) management for keys
- D1-backed metadata and unlimited tagging system
- Cross-namespace search with tag filtering
- Bulk operations: delete, copy, TTL update, tag
- Import/Export in JSON and NDJSON formats
- Single-version backup and restore
- Comprehensive audit logging with CSV export
- Cloudflare Access (Zero Trust) authentication
- Dark/Light/System theme support
- Responsive design for desktop and mobile
- Docker deployment support; Kubernetes deployment examples; reverse proxy configurations (Nginx, Traefik, Caddy)
- React 19.2.0 + TypeScript 5.9.3 frontend; Vite 7.1.12 build system
- Tailwind CSS 3.4.18 + shadcn/ui components
- Cloudflare Workers backend with KV, D1, and Durable Objects
- JWT validation for all API requests; CORS configuration for local development
