# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.4] - 2026-03-10

### Changed

- **Dependency Updates**
  - `@cloudflare/workers-types`: 4.20260307.1 → 4.20260310.1 (patch)
  - `@types/node`: 25.3.5 → 25.4.0 (minor)
  - `jose`: 6.2.0 → 6.2.1 (patch)
  - `typescript-eslint`: 8.56.1 → 8.57.0 (minor)
  - `wrangler`: 4.71.0 → 4.72.0 (minor)
  - `tar` override: 7.5.10 → 7.5.11 (patch) — npm + Docker layers
  - GitHub Actions: `docker/setup-buildx-action` (v3 → v4), `docker/login-action` (v3 → v4), `docker/metadata-action` (v5 → v6), `docker/build-push-action` (v6 → v7)

### Fixed

- **Empty Vendor Chunk**: Removed `vendor-react` manual chunk from Vite config — Vite 7's automatic JSX runtime inlines React during transform, making the separate chunk empty (0 bytes)

## [2.2.3] - 2026-03-07

### Documentation

- **Changelog Migrated:** Moved `Changelog.md` from the wiki repository into the main project root as `CHANGELOG.md`.

### CI/CD

- **Docker Hub Description Fix:** Fixed `Update Docker Hub Description` and `Deployment Summary` steps in `docker-publish.yml` to trigger on tag pushes (`startsWith(github.ref, 'refs/tags/v')`) instead of branch pushes (`refs/heads/main`), which never matched since the workflow only triggers on tag pushes.

## [2.2.2] - 2026-03-07

### Dependencies

- **lucide-react**: Updated 0.575.0 → 0.577.0

### Security

- **tar**: Updated npm bundle and overrides to 7.5.10 to resolve vulnerabilities

## [2.2.1] - 2026-03-01

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

### CI/CD

- **Removed Dependabot Auto-Merge Workflow**: Deleted `dependabot-auto-merge.yml` to prevent automatic merging of dependency PRs
  - Dependabot will still open PRs for visibility into available updates
  - Dependencies are now updated manually in batched local sessions to avoid unnecessary Docker deployments

### Dependencies

- **@cloudflare/workers-types**: Updated 4.20260210.0 → 4.20260305.0
- **@tailwindcss/postcss**: Updated 4.1.18 → 4.2.1
- **@types/node**: Updated 25.2.3 → 25.3.3
- **@types/react**: Updated 19.2.13 → 19.2.14
- **eslint**: Updated 9.39.2 → 10.0.2
- **@eslint/js**: Updated 9.39.2 → 10.0.1
- **eslint-plugin-react-refresh**: Updated 0.5.0 → 0.5.2
- **globals**: Updated 17.3.0 → 17.4.0
- **lucide-react**: Updated 0.563.0 → 0.575.0
- **react-day-picker**: Updated 9.13.2 → 9.14.0
- **tailwind-merge**: Updated 3.4.0 → 3.5.0
- **tailwindcss**: Updated 4.1.18 → 4.2.1
- **typescript-eslint**: Updated 8.55.0 → 8.56.1
- **wrangler**: Updated 4.64.0 → 4.69.0

### Security

- **GHSA-7r86-cg39-jmmj** (minimatch ReDoS, high severity): Patched combinatorial backtracking in `matchOne()` with multiple non-adjacent GLOBSTAR segments
  - Updated minimatch override from `^10.2.1` → `^10.2.3` (resolves to 10.2.4)
  - Replaced scoped `@typescript-eslint/typescript-estree` override with top-level `minimatch` override to cover all transitive paths (eslint + typescript-estree)
  - **Docker**: Added minimatch@10.2.4 patch for npm CLI's bundled minimatch in both builder and runtime stages
- **GHSA-3ppc-4f35-3m26** (minimatch ReDoS): Resolved all npm audit vulnerabilities
  - ESLint 10 upgrade eliminated eslint-chain minimatch vulnerability
  - Removed `brace-expansion` ^2.0.2 override (incompatible with minimatch 10.x; original vulnerability no longer relevant)
- **CVE-2026-26960** (tar path traversal): Updated tar override 7.5.2 → 7.5.8
- **CI/CD CodeQL Deprecation Fix**: Removed deprecated `fail-on: error` input from `github/codeql-action/analyze@v4` in both `codeql.yml` and `docker-publish.yml` workflows

### Fixed

- **CodeQL Semicolon Insertion**: Fixed automatic semicolon insertion warning in `handleMigrate` function (`App.tsx:929`)
  - Added explicit semicolon to `setError('')` statement to avoid reliance on JavaScript's automatic semicolon insertion
  - Resolves CodeQL alert #46 (`js/automatic-semicolon-insertion`)
- **ESLint Zero-Suppression Sweep**: Eliminated all 12 `eslint-disable` comments through proper code refactoring
  - **react-refresh/only-export-components**: Extracted utility variants to separate files
    - Created `badge-variants.ts` and `button-variants.ts` for CVA variants
    - Created `theme-context-types.ts` to separate context definition from `ThemeProvider` component
    - Updated `calendar.tsx` to import from `button-variants.ts`
  - **react-hooks/exhaustive-deps**: Converted inline functions to `useCallback` with proper dependencies
    - `AuditLog.tsx`: Converted `loadLogs` to `useCallback`
    - `JobHistory.tsx`: Converted `loadJobs` to `useCallback` with functional state updates
    - `JobHistoryDialog.tsx`: Converted `loadEvents` to `useCallback`
    - `MetadataEditor.tsx`: Converted `loadMetadata` to `useCallback`
    - `SearchKeys.tsx`: Converted `performSearch` to `useCallback`
    - `useNamespaceViewPreference.ts`: Removed redundant mount-only sync (useState initializer handles SSR)
  - **@typescript-eslint/no-unused-vars**: Made `wsUrl` optional in `useBulkJobProgress` hook for API compatibility
  - **@typescript-eslint/no-explicit-any**: Replaced `any` types with proper typing
    - `api.ts`: `inFlightRequests` now uses `Promise<unknown>` instead of `Promise<any>`
    - `worker/index.ts`: ASSETS.fetch uses `unknown` intermediate cast instead of `any`

## [2.2.0] - 2026-01-08

### Security

- **Stack Trace Exposure Prevention**: Fixed CodeQL security alerts by preventing internal error details from being exposed to users
  - Replaced exposed error messages in `worker/routes/colors.ts` (2 instances) with generic user-facing messages
  - Replaced exposed error message in `worker/routes/import-export.ts` (1 instance) with generic user-facing message
  - Error details are still logged server-side for debugging via centralized error logger
  - Prevents attackers from using stack traces to understand application structure and internal components

### Changed

- **TailwindCSS v4 Upgrade**: Major upgrade from TailwindCSS 3.4.19 to 4.1.17
  - Migrated from `tailwindcss` PostCSS plugin to new `@tailwindcss/postcss` package
  - Replaced `@tailwind` directives with `@import "tailwindcss"` syntax
  - Added `@theme` directive for CSS variable-based color registration (shadcn/ui compatibility)
  - Removed `autoprefixer` dependency (now bundled in TailwindCSS v4)
  - Updated `postcss.config.js` to use new plugin structure
- **Dependency Updates**: Updated npm dependencies to latest versions
  - `eslint`: 9.39.1 → 9.39.2
  - `@eslint/js`: 9.39.1 → 9.39.2
  - `@types/node`: 24.10.1 → 25.0.2
  - `typescript-eslint`: 8.48.1 → 8.49.0
  - `wrangler`: 4.53.0 → 4.55.0
  - `vite`: 7.2.7 → 7.3.0
  - `react`: 19.2.1 → 19.2.3
  - `react-dom`: 19.2.1 → 19.2.3

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
  - TTL preservation: Maintains key expiration during migration
  - D1 metadata migration: Transfers tags and custom_metadata to target namespace
  - Pre-migration R2 backup: Optional safety backup before migration (recommended for `copy_delete`)
  - Verification step: Confirms target contains all migrated keys before source deletion
  - Progress tracking: Integrated with job history and real-time polling
  - Batch operations: Uses Cloudflare bulk API (10K keys per batch) for efficiency
  - Audit logging: Full trail of migration operations for compliance

- **Enhanced Metrics Dashboard with Storage Tab**: Upgraded metrics dashboard with tabbed interface
  - **Operations Tab**: View operational metrics (read/write counts, latency percentiles)
  - **Storage Tab**: View storage metrics (key count, byte count) per namespace with trend indicators
  - New GraphQL dataset: `kvStorageAdaptiveGroups` for storage metrics alongside existing `kvOperationsAdaptiveGroups`
  - Time range selector: Last 24 hours, Last 7 days, Last 30 days
  - Storage summary cards with trending arrows (green/red) showing storage growth or decline
  - Namespace breakdown table with sortable columns and expandable rows
  - Updated API response format with `summary`, `byNamespace`, `operationsSeries`, and `storageSeries`

## [2.1.0] - 2025-12-11

### Added

- **Namespace Color Tags**: Visual color organization for namespaces in Grid and List views
  - 27-color palette organized in rows by hue (reds, oranges, yellows, greens, blues, purples, neutrals)
  - Color picker dropdown with fixed positioning to prevent clipping in table/grid layouts
  - Color indicator dot displayed next to namespace icon
  - Bottom border stripe on Grid view cards showing selected color
  - Optimistic UI updates with rollback on API failure
  - New API endpoints: `GET /api/namespaces/colors`, `PUT /api/namespaces/:id/color`
  - Database migration version 4 adds `namespace_colors` table
  - Full WCAG accessibility: aria-labels, keyboard navigation, focus indicators
- **Key Color Tags**: Visual color organization for individual keys in the Keys list
  - Same 27-color palette as namespace colors
  - Color picker at start of each key row for quick access
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
  - After bulk operations complete, keys list now fetches fresh data bypassing API cache
  - Expiration timestamps now update immediately without requiring page refresh

## [2.0.0] - 2025-12-09

### Added

- **Automated Database Migrations**: In-app database upgrade system with visual banner
  - Yellow upgrade banner appears when schema migrations are pending
  - One-click "Upgrade Now" button to apply all pending migrations
  - Automatic legacy installation detection for existing deployments
  - Green success banner after successful upgrade (auto-hides after 5 seconds)
  - Schema version tracking via `schema_version` table
  - Three initial migrations: initial_schema, job_audit_events, webhooks
  - New API endpoints: `GET /api/migrations/status`, `POST /api/migrations/apply`, `POST /api/migrations/mark-legacy`
  - Full WCAG accessibility compliance with ARIA labels and keyboard navigation
- **Rename Key Feature**: Rename individual keys while preserving value, metadata, and tags
  - New Pencil icon button in keys list for quick access to rename
  - Rename dialog with current/new name fields and keyboard support (Enter to submit)
  - Backend atomic rename operation (copy value/metadata to new key, then delete old key)
  - Full audit logging for rename operations with old/new name details
  - D1 metadata (tags, custom_metadata) automatically migrated to new key name
  - Proper accessibility: aria-labels on buttons, labeled form inputs
- **Enhanced JSON Metadata Editors**: Improved JSON input experience in Create/Edit Key dialogs
  - New reusable `JsonEditor` component with live validation and formatting
  - Real-time "✓ Valid JSON" / "✗ Invalid JSON" status indicator with debounced validation (300ms)
  - Auto-completion for braces `{}`, brackets `[]`, and quotes `""`
  - Smart backspace to delete matched pairs together
  - "Format" button to pretty-print JSON with 2-space indentation
  - Save buttons disabled when JSON is invalid (prevents saving malformed metadata)
  - Full ARIA accessibility: `aria-describedby`, `aria-invalid`, `aria-live="polite"` for status announcements
  - Applied to: Create Key metadata field, Edit Key KV Native Metadata, MetadataEditor Custom Metadata
- **UI Improvements**
  - Added namespace filter bar to filter namespaces by name on the main page
  - Namespace cards now display estimated key count (fetched via batched parallel API calls)
  - Added tooltips to key action buttons: "Rename Key" and "Delete Key" on hover
  - Namespace cards now show "ID:" prefix before namespace ID for clarity
  - Namespace ID is now clickable to copy to clipboard
  - Added Cloudflare KV dashboard link icon in header (next to theme toggle)
  - **Namespace View Toggle**: Grid/List view option for Namespaces page
    - New toggle button in filter bar to switch between Grid (cards) and List (table) views
    - List view is the default for better performance with many namespaces
    - User preference persisted in localStorage across sessions
    - Full keyboard accessibility using ARIA radiogroup pattern
    - All action icons displayed inline with hover tooltips (Browse, Export, Import, Backup R2, Restore R2, Sync, Rename, Delete)
  - Fixed accessibility: added `htmlFor`/`id` to Label/Select pairs in Export, Backup, and Restore dialogs
- **Audit Log Enhancements**: View namespace deletion and other cross-namespace events
  - New "All Namespaces" option (now the default) to view audit entries across all namespaces
  - Essential for viewing deleted namespace events which were previously inaccessible
  - Added missing operation types to filter: Create/Rename/Delete Namespace, Rename Key, R2 Backup/Restore
  - Shows namespace title/ID in log entries when viewing "All Namespaces"
  - New backend endpoint: `GET /api/audit/all`
- **KV Metrics Dashboard**: View Cloudflare KV analytics and performance data
  - New "Metrics" tab positioned between Search and Job History
  - Real-time metrics from Cloudflare's GraphQL Analytics API
  - Summary cards showing total operations, reads, writes, and data points
  - Operations breakdown with visual progress bars by type (read/write/delete/list)
  - Average latency table with P50, P90, P99 percentiles by operation type
  - Namespace selector to view metrics for specific namespace or all namespaces
  - Date range presets: Last 7/14/30/90 days
  - Refresh button to bypass cache and fetch latest metrics
  - 2-minute cache TTL with exponential backoff for rate limiting
  - Backend GraphQL proxy: `GET /api/metrics` and `GET /api/metrics/:namespaceId`
  - Full accessibility with ARIA labels and keyboard navigation

### Changed

- **Build Optimization**: Significant reduction in bundle size and improved caching
  - Replaced 2MB Vite placeholder favicon with inline SVG data URI (~200 bytes)
  - Configured Vite manual chunks to split vendor libraries:
    - `vendor-react`: React core (11 KB gzip)
    - `vendor-radix`: Radix UI primitives (33 KB gzip)
    - `vendor-date`: date-fns and react-day-picker (19 KB gzip)
    - `vendor-icons`: lucide-react icons (3.5 KB gzip)
    - `vendor-utils`: class-variance-authority, jszip, jose (0.5 KB gzip)
  - Implemented lazy loading for route-level components with React.lazy and Suspense:
    - SearchKeys, AuditLog, JobHistory, KVMetrics now load on-demand
    - Added loading spinner fallback during chunk loading
  - Main bundle reduced from 518 KB → 298 KB (-42%)
  - Eliminated "chunks larger than 500 KB" build warning
  - Better caching: vendor chunks rarely change, enabling browser cache reuse

### Fixed

- **Edit Key Dialog TTL Not Loading**: Fixed TTL field not showing existing expiration when reopening Edit Key dialog
  - Backend GET key endpoint now fetches expiration from Cloudflare KV keys list endpoint
  - Frontend now calculates remaining TTL from expiration timestamp and displays it
  - Expiration is returned as Unix timestamp in API response
- **KV Native Metadata Not Persisting**: Fixed KV native metadata being ignored when saving keys
  - Backend now uses the Cloudflare KV bulk write API to properly save value with metadata
  - The bulk write API reliably handles metadata in Workers environment (single-key FormData approach was unreliable)
  - Metadata is now properly stored in Cloudflare KV and retrieved on subsequent loads
- **Edit Key Dialog UX Improvements**: Improved feedback and styling in the Metadata & Tags tab
  - Added "Metadata saved" success confirmation with checkmark icon after saving D1 metadata
  - Success message auto-hides after 3 seconds
  - Disabled browser autocomplete on tag input to prevent dark mode styling issues with native dropdown
- **Edit Key Dialog Value Not Refreshing**: Fixed issue where edited values weren't showing after reopening dialog
  - Added cache-busting parameter to getKey API calls to ensure fresh data
  - Added timestamp-based key prop to force dialog remount on each open
  - Ensures dialog always loads latest data from server after edits
- **Orphaned D1 Metadata on Key Delete**: Fixed tags and custom metadata persisting after key deletion
  - Single key delete now also removes associated D1 metadata (tags, custom_metadata)
  - Bulk delete operation now cleans up D1 metadata entries for all deleted keys
  - Prevents old metadata from appearing when recreating a key with the same name
- **Create New Key TTL Validation**: Fixed Create button being clickable when TTL < 60
  - Added inline error message when TTL is between 1-59 seconds
  - Create button is now disabled when TTL is invalid
  - Prevents users from accidentally creating keys with very short TTLs
- **Edit Key Dialog TTL Display**: Fixed confusing TTL behavior showing decreasing values
  - TTL field is no longer pre-populated with remaining time (which decreased on each reload)
  - Now shows "Current expiration" date/time if key has an expiration set
  - Users can enter a new TTL to update the expiration
  - Added inline validation error for TTL < 60 seconds
  - Save Changes button disabled when TTL is invalid
- **Search Not Finding Tags**: Fixed search to find keys by both name and tags
  - Main search field now searches both key names AND tags
  - Updated UI labels to reflect combined search functionality
  - Separate "Filter by Specific Tags" field remains for explicit tag filtering
- **Added typecheck to eslint with strictest settings.**
- **Error Logging Compliance**: Converted remaining 17 `console.log` statements in `ImportExportDO.ts` to use centralized error logger
  - All R2 backup/restore progress logs now use `logInfo()` with structured context
  - Includes module (`import_export`), operation, namespaceId, and relevant metadata
  - Log format: `[INFO] [import_export] [IO_R2_BACKUP] message (context)`
  - Operations covered: `r2_backup`, `r2_restore`, `batch_r2_backup`, `batch_r2_restore`
- **TypeScript Strict Mode Compliance**: Resolved all 108 TypeScript errors introduced by strict type-checking
  - Fixed webhook type system with separate `WebhookDB` and `Webhook` interfaces for database vs API representation
  - Corrected database storage types: `events` stored as JSON string, `enabled` as number (0/1)
  - Fixed undefined handling for regex match results across all route handlers
  - Added null checks for array access in `BulkOperationDO.ts` to prevent undefined errors
  - Fixed index signature access violations by using bracket notation throughout worker code
  - Removed 11 unused `@ts-expect-error` directives that were no longer needed
  - Fixed `exactOptionalPropertyTypes` violations using conditional property inclusion
  - Fixed `useEffect` return type in `ThemeContext.tsx` to always return cleanup function or undefined
  - Removed unused `state` properties from Durable Object classes (`BulkOperationDO`, `ImportExportDO`)
  - Fixed ESLint array-type rule by changing `Array<T>` to `T[]` syntax
  - Files affected: `webhooks.ts`, `keys.ts`, `namespaces.ts`, `import-export.ts`, `r2-backup.ts`, `search.ts`, `BulkOperationDO.ts`, `ImportExportDO.ts`, `ThemeContext.tsx`, `App.tsx`

### Changed

- **Dependency Updates**: Updated all npm dependencies to latest versions
  - Wrangler: 4.50.0 → 4.53.0
  - @cloudflare/workers-types: 4.20251128.0 → 4.20251205.0
  - @eslint/js: 9.13.0 → 9.39.1
  - eslint: 9.36.0 → 9.39.1
  - esbuild: 0.25.10 → 0.27.1
  - eslint-plugin-react-refresh: 0.4.14 → 0.4.24
  - globals: 16.4.0 → 16.5.0
  - jose: 6.1.2 → 6.1.3
  - lucide-react: 0.555.0 → 0.556.0
  - react-day-picker: 9.11.3 → 9.12.0
  - typescript-eslint: 8.47.0 → 8.48.1
  - @radix-ui/react-label: 2.1.7 → 2.1.8
  - Tailwind CSS maintained at 3.4.18 (latest stable v3)

### Added

- **Centralized Error Logging System** - Full integration of structured error logging across all worker modules
  - Converted 100+ ad-hoc `console.log/error/warn` statements to use centralized error logger
  - All logging now includes structured context: module, operation, namespaceId, keyName, userId, metadata
  - Critical errors (job failures, API errors) automatically trigger webhook notifications
  - Consistent log format: `[LEVEL] [module] [CODE] message (context)`
  - Module-prefixed error codes for easy identification (e.g., `KEY_CREATE_FAILED`, `IMPORT_FAILED`)
  - Automatic stack trace capture for debugging
  - Files converted: BulkOperationDO, ImportExportDO, index.ts, all routes (admin, audit, backup, import-export, keys, metadata, namespaces, r2-backup, search, webhooks), utilities (auth, helpers, webhooks)

### Changed

- **Maximum TypeScript Strictness** - All strict type-checking options enabled
  - All `strict` family options explicitly enabled
  - `exactOptionalPropertyTypes: true` - precise optional property handling
  - `noUncheckedIndexedAccess: true` - returns `T | undefined` for indexed access
  - `noPropertyAccessFromIndexSignature: true` - requires bracket notation
  - `noImplicitOverride: true` - requires explicit override keyword
  - `noImplicitReturns: true` - all code paths must return
  - `noFallthroughCasesInSwitch: true` - prevent switch fallthrough
  - `allowUnusedLabels: false`, `allowUnreachableCode: false`
  - `useUnknownInCatchVariables: true` - catch variables are `unknown`
  - `forceConsistentCasingInFileNames: true`
  - `verbatimModuleSyntax: true` (worker)
- **Maximum ESLint Strictness** - Using `strictTypeChecked` + `stylisticTypeChecked` rulesets
  - `@typescript-eslint/explicit-function-return-type` - Require explicit return types
  - `@typescript-eslint/strict-boolean-expressions` - Enforce strict boolean expressions
  - `@typescript-eslint/prefer-nullish-coalescing` - Enforce `??` over `||`
  - `@typescript-eslint/prefer-optional-chain` - Enforce `?.` syntax
  - `@typescript-eslint/prefer-regexp-exec` - Prefer `RegExp.exec()` for performance
  - `@typescript-eslint/consistent-type-imports` - Enforce `type` imports
  - `@typescript-eslint/consistent-type-exports` - Enforce `type` exports
  - `@typescript-eslint/consistent-type-definitions` - Enforce `interface` over `type`
  - `@typescript-eslint/no-unsafe-*` rules - All enabled for strict `any` handling
  - `@typescript-eslint/array-type` - Enforce `T[]` over `Array<T>`
- **Code Quality Improvements**
  - Fixed all resulting TypeScript errors across frontend and worker code
  - Converted all `String.match()` to `RegExp.exec()` for performance
  - Converted all `Array<T>` to `T[]` for consistency
  - Replaced all `||` with `??` for nullish coalescing
  - Converted all validation checks to optional chaining
  - Fixed index signature property access to use bracket notation (frontend and worker)
  - Converted inline `type` aliases to `interface` declarations
  - Fixed `exactOptionalPropertyTypes` violations using conditional spreads

### Fixed

- **Export Job Polling Rate Limits**: Fixed 429 "Too Many Requests" errors during namespace export
  - Increased base polling interval from 2s to 3s
  - Increased rate limit backoff from 3s to 5s (up to 15s max)
  - Added 500ms initial delay before first poll to let jobs initialize
  - Added `isPollingRef` guard to prevent multiple polling instances
  - Separate cleanup for initial timer and polling interval
  - Stored `onComplete`/`onError` callbacks in refs to prevent effect re-runs
  - Only reset completed state when jobId actually changes (not on every render)
  - Export, import, R2 backup, and R2 restore now poll correctly without repeated 429 errors

- **Error Logging Prefixes**: Added missing module prefixes to error logger
  - Added `worker` → `WRK_` prefix
  - Added `export` → `EXP_` prefix
  - Added `import` → `IMP_` prefix
  - Added `jobs` → `JOB_` prefix
  - Added `job_audit` → `JOB_` prefix
  - All modules now show proper prefixes instead of fallback `ERR_`

- **Deprecated API Usage**: Replaced all deprecated APIs with modern equivalents
  - Replaced `String.prototype.substr()` with `String.prototype.slice()` across all worker routes
  - Replaced `React.ElementRef` with `React.ComponentRef` in UI components
  - Replaced `MediaQueryList.addListener/removeListener` with `addEventListener/removeEventListener` in ThemeContext

- **Type Safety Improvements**: Comprehensive type safety fixes across all worker routes
  - Added explicit type assertions for `JSON.parse()` results to eliminate `any` type propagation
  - Added proper type guards for `request.json()` return values
  - Fixed unsafe member access on `unknown` and `error` typed values
  - Added explicit `string | undefined` handling for regex match results
  - Fixed template literal expressions to only accept string types via explicit `String()` conversions
  - Removed unnecessary conditional checks flagged by strict linting
  - Fixed property access on index signatures to use bracket notation

- **exactOptionalPropertyTypes Compliance**: Fixed all optional property type mismatches
  - Updated object literals to explicitly handle `undefined` for optional properties
  - Fixed `KVKeyInfo` objects to not assign `undefined` to optional `expiration` property
  - Fixed audit log entries to properly type `namespace_id` and `key_name` parameters
  - Fixed webhook test results to properly handle optional `statusCode` and `error` properties

### Removed

- **WebSocket Support**: Removed unused WebSocket infrastructure
  - Removed WebSocket upgrade endpoint from worker
  - Removed WebSocket handler methods from Durable Objects (BulkOperationDO, ImportExportDO)
  - Removed WebSocket session tracking and broadcasting
  - Converted `broadcastProgress()` to no-op methods to preserve compatibility
  - Updated comments to reflect HTTP polling architecture
  - Rationale: Frontend exclusively uses HTTP polling; WebSocket code was dead weight adding complexity

- **Job Cancellation Feature**: Removed non-functional job cancellation capability
  - Removed cancel button from bulk progress dialog
  - Removed `cancelJob` function from progress tracking hook
  - Removed cancellation logic from Durable Objects (BulkOperationDO, ImportExportDO)
  - Removed `'cancelled'` status from TypeScript type definitions
  - Removed cancelled status UI indicators from job history
  - Note: Database schema retains `'cancelled'` status for backward compatibility with existing historical records
  - Rationale: Feature never worked after migration to HTTP polling, and jobs complete too quickly to make cancellation practical

### Added

- **Webhook Management UI**: Full frontend interface for webhook configuration
  - New "Webhooks" tab in main navigation
  - Visual webhook list with status badges (enabled/disabled)
  - Create/Edit/Delete webhook dialogs
  - Event selector with all 13 KV-specific event types
  - Test webhook button with success/failure feedback
  - Toggle enabled/disabled state inline
  - HMAC signature indicator (Shield icon)
  - URL preview in webhook cards
  - Responsive design matching app aesthetic
  - New components: `WebhookManager.tsx`, `webhookApi.ts`, `types/webhook.ts`

- **Webhook Notifications**: Event-driven HTTP notifications for key operations
  - Configure webhooks via API endpoints
  - Supported events: key_create, key_update, key_delete, bulk operations, backup/restore, job_failed
  - Optional HMAC-SHA256 signatures for payload verification
  - Test webhooks to verify endpoint connectivity
  - Fire-and-forget dispatch (non-blocking)
  - New API endpoints: GET/POST/PUT/DELETE `/api/webhooks`, POST `/api/webhooks/:id/test`
  - Database schema with `webhooks` table
  - Migration file: `add_webhooks.sql`

- **Centralized Error Logging**: Structured error logging system for all worker routes
  - Module-prefixed error codes (e.g., `KEY_CREATE_FAILED`, `BLK_DELETE_FAILED`, `BKP_RESTORE_FAILED`)
  - Severity levels: error, warning, info
  - Automatic webhook triggering for job failures
  - Consistent log format across all modules: `[LEVEL] [module] [CODE] message (context)`
  - Stack trace capture for debugging
  - New utilities: `worker/utils/error-logger.ts`, `worker/utils/webhooks.ts`

### Changed

- **Documentation Consolidation**: Migration instructions integrated into main README
  - Removed separate `MIGRATION_GUIDE.md` - essential info now in README
  - Generic database names in examples (users choose their own)
  - Clearer distinction between new installs and upgrades
  - Migration script (`apply_all_migrations.sql`) now includes all migrations including webhooks

- **Batch R2 Backup & Restore**: Multi-namespace backup and restore operations to/from R2
  - **Batch Backup Selected to R2**: Back up multiple selected namespaces to R2 in a single operation
  - **Batch Restore Selected from R2**: Restore multiple namespaces from R2 backups simultaneously
  - New batch action toolbar buttons when namespaces are selected
  - Format selection (JSON/NDJSON) for batch backups
  - Per-namespace backup selection in batch restore dialog
  - Progress tracking for batch operations with namespace count
  - Individual audit log entries for each namespace in batch
  - Job history integration with `batch_r2_backup` and `batch_r2_restore` operation types
  - Two new API endpoints:
    - `POST /api/r2-backup/batch` - Start batch backup of multiple namespaces
    - `POST /api/r2-restore/batch` - Start batch restore of multiple namespaces
  - Batch processing with progress updates and error handling per namespace
  - Metadata column added to `bulk_jobs` table for storing batch operation details

- **R2 Backup & Restore**: Complete R2 integration for namespace backups
  - **Backup to R2**: Create full snapshots of namespaces directly to R2 storage
  - **Restore from R2**: Select and restore from available R2 backups via UI
  - **List Backups**: View all available backups with timestamps and file sizes
  - Organized storage structure: `backups/{namespaceId}/{timestamp}.json`
  - Support for both JSON and NDJSON backup formats
  - Progress tracking identical to Import/Export operations (HTTP polling)
  - Job history integration with R2 backup/restore operation types
  - Optional R2 bucket binding (app works without R2 configured)
  - Mock data support in local development mode
  - Three new API endpoints:
    - `GET /api/r2-backup/:namespaceId/list` - List available backups
    - `POST /api/r2-backup/:namespaceId` - Start async backup to R2
    - `POST /api/r2-restore/:namespaceId` - Start async restore from R2
  - New wrangler.toml R2 bucket binding: `BACKUP_BUCKET`
  - UI buttons added to namespace cards for easy access
  - Backup/Restore dialogs with format selection and backup list
  - Audit logging for both r2_backup and r2_restore operations
  - Complete documentation in README with setup instructions

- **Import/Export Metadata Support**: Enhanced import functionality with dual metadata system support
  - Import now supports both `metadata` (KV native) and `custom_metadata` (D1) fields
  - `metadata` field stores data in Cloudflare KV (1024 byte limit, retrieved with key)
  - `custom_metadata` field stores data in D1 database (unlimited size, searchable)
  - `tags` field stores tags in D1 for organization and search
  - Support for both `ttl` and `expiration_ttl` field names in imports
  - Bulk write API implementation for proper KV native metadata storage
  - Comprehensive import format documentation with field descriptions

### Changed

- **Progress Tracking Simplified**: Removed WebSocket connections in favor of HTTP polling for increased reliability
  - Polling-only approach with 1-second intervals until job completion
  - Eliminates WebSocket connection failures, rate limiting, and complexity
  - Reduced progress hook from 320 lines to 150 lines (~47% reduction)
  - Export files download automatically when ready via polling detection
  - API still returns `ws_url` for compatibility, but it's not used
  - Note: WebSocket infrastructure remains in Durable Objects but is not utilized by frontend

- **Import Processing**: Switched from individual PUT requests to bulk write API
  - Improves import performance with batched writes (100 keys per batch)
  - Properly handles KV native metadata via bulk write API
  - Separates KV native metadata from D1 custom metadata storage
  - D1 entries always created for imported keys (enables search indexing)

### Fixed

- **Import Metadata Handling**: Fixed incorrect metadata field mapping during imports
  - `metadata` field now correctly stored in KV native metadata (not D1)
  - `custom_metadata` field correctly stored in D1 database
  - Previous bug caused `metadata` to be duplicated into D1 custom metadata
  - Import now properly distinguishes between the two metadata systems

- **TTL Validation**: Added minimum TTL validation to prevent API errors
  - Cloudflare KV requires minimum 60 seconds for TTL
  - Added validation in both Create Key and Edit Key dialogs
  - Clear error message: "TTL must be at least 60 seconds (Cloudflare KV minimum)"
  - HTML5 `min="60"` attribute added to TTL input fields
  - Updated placeholder text and help text to indicate minimum value

- **Edit Key Dialog**: Fixed Save Changes button not enabling when only metadata/TTL changed
  - Button now tracks changes to value, metadata, and TTL separately
  - Changing only KV Native Metadata now enables Save Changes button
  - Changing only TTL now enables Save Changes button
  - Added state tracking for original metadata and TTL values

- **Accessibility**: Removed empty label warnings in Job History UI
  - Removed unconnected `<Label>` elements from Select components
  - Added `aria-label` attributes to all SelectTrigger components
  - Replaced spacing hack (`<Label>&nbsp;</Label>`) with proper flex layout
- **Database Schema**: Added missing columns to production databases
  - Created migrations for `job_audit_events` table
  - Created migrations for `current_key` and `percentage` columns in `bulk_jobs`
  - Created migration for `metadata` column in `bulk_jobs` (required for batch operations)
  - All migrations are idempotent and safe to run multiple times
  - Migration guide provided at [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

### Technical Improvements

- **TypeScript Types**: Updated `ImportParams` interface to support dual metadata system
  - Clarified `metadata` field for KV native metadata
  - Added `custom_metadata` field for D1 database storage
  - Added `expiration` field for Unix timestamp expiration
  - Comprehensive inline documentation for each field

### Added

- **Migration Infrastructure**: Comprehensive migration system for database updates
  - Single migration file: `apply_all_migrations.sql` for one-step updates
  - Idempotent migrations safe to run multiple times
  - Detailed migration guide with troubleshooting and verification steps
  - Instructions for both production (`--remote`) and development (`--local`) databases

- **Advanced Job History Filters**: Comprehensive filtering and sorting system for job history
  - **Namespace Filter**: Filter jobs by specific namespace from dropdown
  - **Date Range Filter**: Select preset ranges (Last 24h, Last 7 days, Last 30 days) or custom date range with calendar picker
  - **Job ID Search**: Debounced text search with partial matching (500ms delay)
  - **Error Threshold Filter**: Filter jobs by minimum error count
  - **Multi-Column Sorting**: Sort by Started At, Completed At, Total Keys, Error Count, or Progress Percentage
  - **Sort Order Toggle**: Switch between ascending/descending with visual arrow indicators
  - **Clear All Filters**: Single button to reset all filters to defaults
  - **Combinable Filters**: All filters work simultaneously for precise job discovery
  - **Enhanced UI Layout**: Responsive 3-column grid with 9 filter controls organized in 3 rows
  - New UI components: Popover and Calendar (react-day-picker with date-fns)
  - Real-time filter updates with automatic data reload
- **Enhanced Job History API**:
  - Extended `GET /api/jobs` endpoint with 7 new query parameters:
    - `namespace_id` - Filter by specific namespace
    - `start_date`, `end_date` - Filter by date range (ISO timestamps)
    - `job_id` - Search by job ID (partial match with SQL LIKE)
    - `min_errors` - Filter jobs with error_count >= threshold
    - `sort_by` - Column to sort by (started_at, completed_at, total_keys, error_count, percentage)
    - `sort_order` - Sort direction (asc or desc, default: desc)
  - SQL injection prevention: Sort column validation with whitelist
  - Enhanced mock data with varied namespaces and timestamps for testing
  - Backward compatible with existing filter parameters (status, operation_type)

- **Job History UI**: Comprehensive user interface for viewing job event timelines and operation history
  - New "Job History" navigation tab displaying all user's bulk operations
  - Job list view with filtering by status (completed, failed, cancelled, running, queued) and operation type
  - Pagination support with "Load More" functionality for large job histories
  - Job cards showing operation type, namespace, status, timestamps, and progress summary
  - Click any job card to view detailed event timeline in modal dialog
  - Event timeline visualization with color-coded status indicators and milestone markers
  - "View History" button in BulkProgressDialog appears after job completion
  - Visual timeline showing: started → progress_25 → progress_50 → progress_75 → completed/failed/cancelled
  - Detailed event metadata display including processed counts, error counts, and percentages
  - Relative and absolute timestamp formatting (e.g., "2h ago" with hover for full date/time)
  - User authorization: users can only view their own job history
  - Empty state handling and error messaging
  - Dual access: view history from both progress dialog and dedicated history page

- **New API Endpoints for Job History**:
  - `GET /api/jobs` - Retrieve paginated list of user's jobs with filtering support
    - Query params: `limit`, `offset`, `status`, `operation_type`
    - Returns job metadata, timestamps, progress stats, and status
    - Ordered by `started_at DESC` (newest first)
  - Enhanced `GET /api/jobs/:jobId/events` endpoint now integrated with UI components

- **Operation Cancellation Support**: Users can now cancel in-progress bulk operations
  - Cancel button appears in progress dialog during `queued` or `running` operations
  - WebSocket-based cancellation via `{ type: "cancel", jobId }` message protocol
  - Graceful cancellation: operations complete current batch/item before stopping
  - Job status updates to `cancelled` in D1 database
  - Cancellation events logged to `job_audit_events` table with partial progress
  - Visual feedback: orange status indicator, cancelled summary with processed counts
  - Cancel button disabled when WebSocket is not connected (polling fallback limitation)
  - Cancelled jobs auto-close progress dialog after 5 seconds

- **Job Audit Event Logging**: Comprehensive lifecycle event tracking for all bulk operations and import/export jobs
  - New `job_audit_events` D1 table stores milestone events: `started`, `progress_25`, `progress_50`, `progress_75`, `completed`, `failed`, `cancelled`
  - Events include detailed JSON metadata: processed counts, error counts, percentages, and operation-specific data
  - User-based access control: users can only view events for their own jobs
  - Foundation for job history viewing and event replay functionality
  - New API endpoint: `GET /api/jobs/:jobId/events` - Returns chronological event history for a specific job

- **WebSocket-based Real-time Progress Tracking**: All bulk operations now use WebSocket connections for live progress updates
  - Async processing via Cloudflare Durable Objects for bulk delete, copy, TTL update, and tag operations
  - Real-time progress updates showing current key being processed, processed count, error count, and completion percentage
  - WebSocket connections managed by Durable Objects using the Hibernation API for cost efficiency
  - Automatic fallback to HTTP polling if WebSocket connection fails or is not supported
  - Exponential backoff reconnection strategy for dropped WebSocket connections
  - Progress dialog component (`BulkProgressDialog`) showing detailed operation status
  - Custom React hook (`useBulkJobProgress`) for managing WebSocket/polling lifecycle

- **Enhanced Import/Export Operations**:
  - Import and export operations now run asynchronously with real-time progress tracking
  - Export files are temporarily stored in Durable Object storage and served via dedicated download endpoint
  - Automatic download trigger when export job completes
  - Live progress updates during large import/export operations

- **New API Endpoints**:
  - `GET /api/jobs/:jobId/ws` - WebSocket endpoint for real-time job progress updates
  - `GET /api/jobs/:jobId/download` - Download endpoint for completed export files
  - `GET /api/jobs/:jobId/events` - Retrieve audit event history for a specific job (user-authorized)

- **Database Schema Enhancements**:
  - Added `current_key` column to `bulk_jobs` table to track the key currently being processed
  - Added `percentage` column to `bulk_jobs` table to store completion percentage (0-100)
  - Added `job_audit_events` table with foreign key to `bulk_jobs` for lifecycle event tracking
  - Indexed by `job_id` and `user_email` for efficient querying
  - Schema already supports `cancelled` status in `bulk_jobs.status` and `job_audit_events.event_type`

### Changed

- **Navigation Structure**:
  - Added "Job History" as a primary navigation tab alongside Namespaces, Search, and Audit Log
  - Reordered navigation to place Job History before Audit Log for better user flow
- **Bulk Operations Architecture**:
  - Refactored all bulk operations (delete, copy, TTL, tag) to be asynchronous
  - Operations now return immediately with `job_id`, `status`, and `ws_url` instead of waiting for completion
  - Progress tracking moved from simple status checks to detailed WebSocket-based updates
  - Bulk operations now show detailed progress: X of Y keys processed, current key name, percentage
- **Import/Export Flow**:
  - Export operations no longer block the HTTP request
  - Import operations process files asynchronously in the background
  - Export results are served from Durable Object storage instead of inline response

- **Frontend User Experience**:
  - Progress dialog now shows real-time updates instead of static loading spinner
  - Users can see which key is currently being processed
  - Connection status indicator shows whether using WebSocket or polling fallback
  - Auto-close progress dialog on successful completion after brief delay
  - Cancel button with loading state during cancellation
  - Visual distinction for cancelled operations (orange indicator, dedicated summary section)
  - Post-completion "View History" button for immediate access to job event timeline
  - Persistent job history accessible from dedicated navigation tab

### Technical Improvements

- **New Frontend Components**:
  - `JobHistory.tsx` - Full-page job list view with filtering and pagination
  - `JobHistoryDialog.tsx` - Modal component for detailed event timeline visualization
  - Enhanced `BulkProgressDialog.tsx` with "View History" button integration
- **New API Methods**:
  - `api.getJobList(options)` - Fetch paginated job list with filters (status, operation_type)
  - `api.getJobEvents(jobId)` - Retrieve event timeline for specific job
- **TypeScript Type Definitions**:
  - `JobEvent` - Individual event structure with type-safe event_type enum
  - `JobEventDetails` - Parsed JSON metadata for event details
  - `JobEventsResponse` - API response structure for events endpoint
  - `JobListItem` - Job metadata including progress and timestamps
  - `JobListResponse` - Paginated job list response with total count
- Implemented two Durable Object classes:
  - `BulkOperationDO` - Handles bulk delete, copy, TTL, and tag operations with milestone event logging and cancellation support
  - `ImportExportDO` - Handles import and export operations with file storage, milestone event logging, and cancellation support
- Added `logJobEvent()` helper function in `worker/utils/helpers.ts` for consistent event logging
- Added `JobAuditEvent` TypeScript interface for type-safe event handling
- All 6 operation methods (bulk copy, delete, TTL, tag, import, export) now log milestone events automatically
- Events stored indefinitely in D1 for complete job history tracking
- Added proper TypeScript type definitions for all WebSocket messages and job parameters
- Implemented graceful error handling and recovery for WebSocket connections
- Added comprehensive logging for debugging WebSocket connections and job processing
- Fixed all ESLint and TypeScript linting errors related to React hooks and Workers types
- Cancellation logic integrated into all 6 operation processing methods (copy, delete, TTL, tag, import, export)
- Added `cancelledJobs: Set<string>` to track cancellation requests in Durable Objects
- `cancelJob()` function in `useBulkJobProgress` hook sends cancellation messages via WebSocket
- `handleCancellation()` helper method in both Durable Objects for consistent cancellation handling
- TypeScript types updated: `JobProgress.status` now includes `'cancelled'` in all type definitions
- Cancel button component in `BulkProgressDialog` with appropriate disabled states and visual feedback

### Fixed

- **Bulk Operations Job Completion**: Fixed bulk operations never completing due to Durable Object not being invoked
  - Changed fire-and-forget pattern to `await stub.fetch(doRequest)` in all bulk operation routes
  - Affects bulk delete, bulk copy, bulk TTL, and bulk tag operations
  - Jobs now properly transition from "queued" to "running" to "completed"/"failed"
  - Added logging for Durable Object invocation status

- **CRITICAL**: HTTP polling rate limit errors causing 429 responses
  - Implemented exponential backoff for polling intervals on 429 errors
  - Increased base polling interval from 1s to 2s
  - Dynamic interval adjustment: increases by 3s on rate limit (up to 10s max)
  - Interval resets to 2s on successful polls
  - Rate limit errors handled silently (no user-facing error messages)
  - Fixed React hooks dependency loop causing multiple polling instances
  - Used `useRef` for callbacks to prevent unnecessary effect re-runs
  - Added guard to prevent multiple interval timers from being created

- **CRITICAL**: WebSocket connection loop causing 429 rate limit errors
  - Added parameter validation in `useBulkJobProgress` hook to prevent connection attempts with empty jobId or wsUrl
  - Added conditional guard in `BulkProgressDialog` to only invoke hook when dialog is open and has valid parameters
  - Prevents infinite reconnection loops and API request floods
- **SECURITY**: Log injection vulnerability in WebSocket message handling
  - Modified logging to only output safe, non-user-controlled fields (status, percentage, processed count, total count)
  - Removed logging of potentially malicious user-controlled strings like key names, error messages, and close reasons
  - Prevents malicious log forging via WebSocket messages
  - Uses defensive logging approach: only log known-safe data types (numbers, enums)
- React hooks immutability issues in `useBulkJobProgress` hook
- Circular dependency in WebSocket connection callback
- TypeScript type compatibility issues between DOM and Cloudflare Workers WebSocket types
- Proper cleanup of WebSocket connections and polling intervals on component unmount

## [1.0.0] - 2025-11-05

### Added

- Initial release of Cloudflare KV Manager
- Full namespace management (create, delete, rename, browse)
- Complete key operations with CRUD functionality
- Cursor-based pagination for key listings
- TTL (expiration) management for keys
- D1-backed metadata and unlimited tagging system
- Cross-namespace search with tag filtering
- Bulk operations (delete, copy, TTL update, tag)
- Import/Export in JSON and NDJSON formats
- Single-version backup and restore
- Comprehensive audit logging with CSV export
- Cloudflare Access (Zero Trust) authentication
- Dark/Light/System theme support
- Responsive design for desktop and mobile
- Docker deployment support
- Kubernetes deployment examples
- Reverse proxy configurations (Nginx, Traefik, Caddy)

### Technical

- React 19.2.0 + TypeScript 5.9.3 frontend
- Vite 7.1.12 build system
- Tailwind CSS 3.4.18 + shadcn/ui components
- Cloudflare Workers backend
- Cloudflare KV for key-value storage
- Cloudflare D1 for metadata and audit logs
- Cloudflare Durable Objects for orchestration
- JWT validation for all API requests
- CORS configuration for local development

---

## Links

- [GitHub Repository](https://github.com/neverinfamous/kv-manager)
- [Docker Hub](https://hub.docker.com/r/writenotenow/kv-manager)
- [Live Demo](https://kv.adamic.tech/)
- [Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)
