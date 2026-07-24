# Cloudflare KV Manager v1.0.0

🎉 **Initial Release** - A modern, full-featured web application for managing Cloudflare Workers KV namespaces and keys, with enterprise-grade authentication via Cloudflare Access Zero Trust.

> **Note:** Features marked with 🆕 are unreleased and available in the latest development version.

## 🆕 Unreleased Features

### Batch R2 Backup & Restore

Multi-namespace backup and restore operations to/from R2 for efficient bulk management:

- **Batch Backup Selected to R2** - Back up multiple selected namespaces to R2 in a single operation
- **Batch Restore Selected from R2** - Restore multiple namespaces from R2 backups simultaneously
- **Namespace Selection Toolbar** - New action buttons appear when namespaces are selected:
  - "Backup Selected to R2" button with format selection (JSON/NDJSON)
  - "Restore Selected from R2" button with per-namespace backup selection
  - "Deselect All" button to clear selection
- **Progress Tracking** - Real-time progress showing namespace count and completion percentage
- **Per-Namespace Processing** - Each namespace processed sequentially with individual audit logging
- **Error Handling** - Partial failures allowed; job completes even if some namespaces fail
- **Job History Integration** - Operations appear as `batch_r2_backup` and `batch_r2_restore` types

**New API Endpoints:**

- `POST /api/r2-backup/batch` - Start batch backup of multiple namespaces
- `POST /api/r2-restore/batch` - Start batch restore of multiple namespaces with backup path mapping

**Database Migration Required:**

- Migration 003 adds `metadata` column to `bulk_jobs` table for storing batch operation details
- See the [Migration Guide](https://github.com/neverinfamous/kv-manager/wiki/Migration-Guide) for instructions

### R2 Backup & Restore

Complete R2 integration for secure namespace backups directly to Cloudflare R2 storage:

- **Backup to R2** - Create full snapshots of any namespace to R2 with one click
- **Restore from R2** - Browse and select from available backups to restore
- **List Backups** - View all backups with timestamps and file sizes
- **Format Support** - Both JSON and NDJSON backup formats supported
- **Progress Tracking** - Real-time progress updates via HTTP polling (same as Import/Export)
- **Job History** - R2 operations appear in job history with dedicated icons
- **Organized Storage** - Backups stored at `backups/{namespaceId}/{timestamp}.json`
- **Optional Feature** - Works with or without R2 bucket configured
- **UI Integration** - New "Backup to R2" and "Restore from R2" buttons on namespace cards

**Setup:**

```bash
# Create R2 bucket
wrangler r2 bucket create kv-manager-backups

# Add to wrangler.toml
[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "kv-manager-backups"
```

**New API Endpoints:**

- `GET /api/r2-backup/:namespaceId/list` - List available backups for namespace
- `POST /api/r2-backup/:namespaceId` - Start async backup to R2
- `POST /api/r2-restore/:namespaceId` - Start async restore from R2 backup

### Simplified Progress Tracking

Progress tracking has been simplified to use HTTP polling instead of WebSockets:

- **Polling-Only Approach** - Removed WebSocket complexity for more reliable progress tracking
- **1-Second Intervals** - Status polls every second until job completion
- **Automatic Downloads** - Export files download automatically when ready
- **Cleaner Code** - Reduced progress hook from 320 lines to 150 lines
- **No Connection Issues** - Eliminates WebSocket connection failures and rate limiting

**Migration Required:**

- Database migration needed for existing installations (see the [Migration Guide](https://github.com/neverinfamous/kv-manager/wiki/Migration-Guide))
- Single migration file adds: `job_audit_events` table and progress tracking columns
- Idempotent and safe to run multiple times

### Advanced Job History Filters

The Job History UI now includes enterprise-grade filtering and sorting capabilities:

- **Namespace Filter** - Filter jobs by specific namespace
- **Date Range Picker** - Choose preset ranges (Last 24h, 7 days, 30 days) or select custom date range with calendar
- **Job ID Search** - Search for specific jobs by ID with partial matching
- **Error Threshold** - Filter jobs with minimum error count
- **Multi-Column Sorting** - Sort by Started At, Completed At, Total Keys, Error Count, or Progress
- **Sort Order Toggle** - Switch between ascending and descending with one click
- **Clear All Filters** - Reset all filters instantly
- **Combinable Filters** - Use multiple filters simultaneously for precise results

**Technical Details:**

- 7 new query parameters added to `GET /api/jobs` endpoint
- SQL injection prevention with whitelist validation
- Debounced search input (500ms) for optimal performance
- Calendar component with date-fns formatting
- Responsive 3-column grid layout adapting to screen size

## ✨ Key Features

### Namespace Management

- Create, delete, and rename KV namespaces
- Browse namespaces with key counts and metadata
- Export entire namespaces to JSON or NDJSON format
- Import keys from JSON or NDJSON files
- Namespace-level audit logging

### Key Operations

- List keys with cursor-based pagination
- Create, update, and delete individual keys
- Full CRUD operations with dual metadata support
- **TTL (expiration) management** - Minimum 60 seconds
- **KV Native Metadata** - Up to 1024 bytes, stored in Cloudflare KV
- **D1 Custom Metadata** - Unlimited size, stored in D1 database
- Single-version backup and restore

### Metadata & Tags

- **KV Native Metadata** - Store up to 1024 bytes of JSON metadata directly in Cloudflare KV (retrieved with key value)
- **D1 Custom Metadata** - Store unlimited JSON metadata in D1 database (searchable, no size limit)
- **Tags (D1-Backed)** - Add unlimited tags to keys for organization and filtering
- Search and filter by tags
- Bulk tag operations (add/remove/replace)
- Two separate metadata systems for different use cases

### Search & Discovery

- Cross-namespace search by key name
- Filter by specific namespaces
- Filter by tags (multiple tag support)
- Real-time search with debouncing
- Quick navigation to search results

### Bulk Operations

- **Bulk Delete**: Remove multiple keys at once
- **Bulk Copy**: Copy keys between namespaces
- **Bulk TTL Update**: Set expiration on multiple keys
- **Bulk Tag**: Apply tags to multiple keys
- **Real-time Progress Tracking**: WebSocket-based live updates with automatic polling fallback
- **Async Processing**: Operations execute in background via Durable Objects
- **Detailed Progress**: View current key, processed count, errors, and percentage completion
- 🆕 **Operation Cancellation**: Cancel in-progress operations via WebSocket with graceful shutdown
- Batch processing (10,000 keys per operation)

### Import/Export

- Export namespaces in JSON or NDJSON format
- Auto-detect format on import
- **Dual Metadata Support**: Import with both `metadata` (KV native) and `custom_metadata` (D1) fields
- **TTL Support**: Use `ttl` or `expiration_ttl` fields (minimum 60 seconds)
- **Tags Support**: Import tags for organization and search
- Collision handling (skip/overwrite/fail)
- **Real-time Progress Tracking**: WebSocket-based live updates during import/export
- **Async Processing**: Large imports/exports process in background
- Download exported data as files with automatic download trigger

### Audit Logging

- Track all operations with user attribution
- Filter by namespace or user
- Filter by operation type
- Pagination support
- Export audit logs to CSV
- Comprehensive operation tracking

### User Interface

- **Dark/Light Theme**: System, light, and dark theme support
- **Navigation**: Switch between Namespaces, Search, and Audit Log views
- **Responsive Design**: Works on desktop and mobile
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS

## 🛠️ Technology Stack

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Real-time Communication**: WebSocket connections via Durable Objects with HTTP polling fallback
- **Auth**: Cloudflare Access (Zero Trust)

## 📦 Getting Started

See the [README](https://github.com/neverinfamous/kv-manager/blob/main/README.md) for detailed setup instructions for both local development and production deployment.

## 🔒 Security

- Cloudflare Access JWT validation on all API requests
- Auth bypassed for localhost development
- All KV operations require valid auth token
- Audit logging of all destructive operations
- Protected namespaces hidden from UI

## 📝 License

MIT

---

**Full documentation**: https://github.com/neverinfamous/kv-manager/blob/main/README.md
