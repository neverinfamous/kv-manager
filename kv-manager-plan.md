# Cloudflare KV Manager - Development Plan

## Project Overview

Build a modern web application for managing Cloudflare Workers KV namespaces and keys, following the D1 Manager architecture and UI patterns. The application will provide comprehensive KV management capabilities beyond what the Cloudflare dashboard offers, with enterprise-grade authentication via Cloudflare Access Zero Trust.

## Architecture

### Tech Stack

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Auth**: Cloudflare Access (Zero Trust)
- **Pattern**: Follow D1 Manager structure exactly (more modern than R2 Manager)

### Key Design Decisions

1. **Durable Objects**: Internal only for bulk operations orchestration (not exposed in UI)
2. **Metadata Storage**: Hybrid approach - D1 for search/audit/tags, KV for lightweight metadata
3. **Versioning**: Single previous version backup per key (not full history)
4. **Project Name**: `kv-manager` (matches created folder)

## Project Structure

```
kv-manager/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── NamespaceView.tsx     # Namespace list with cards
│   │   ├── KeyView.tsx           # Key browser with pagination
│   │   ├── KeyEditor.tsx         # JSON/text editor for values
│   │   ├── BulkOperations.tsx    # Multi-select operations UI
│   │   ├── MetadataEditor.tsx    # Tags and metadata management
│   │   ├── SearchKeys.tsx        # Cross-namespace search
│   │   ├── ThemeToggle.tsx       # Dark/light/system theme
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/
│   │   └── ThemeContext.tsx      # Theme state management
│   ├── services/
│   │   ├── api.ts                # API client for KV operations
│   │   └── auth.ts               # Cloudflare Access auth
│   ├── App.tsx                   # Main app with routing
│   └── main.tsx                  # Entry point
├── worker/                       # Cloudflare Worker backend
│   ├── index.ts                  # Main worker entry + routing
│   ├── routes/
│   │   ├── namespaces.ts         # Namespace CRUD operations
│   │   ├── keys.ts               # Key operations (get/put/delete)
│   │   ├── bulk.ts               # Bulk operations (coordinated by DO)
│   │   ├── metadata.ts           # Tags, search, metadata endpoints
│   │   └── backup.ts             # Backup/restore operations
│   ├── durable-objects/
│   │   ├── BulkOperationDO.ts    # Orchestrate bulk delete/copy/move
│   │   └── ImportExportDO.ts     # Handle large import/export jobs
│   ├── utils/
│   │   ├── auth.ts               # JWT validation
│   │   ├── cors.ts               # CORS handling
│   │   └── helpers.ts            # Common utilities
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces
│   └── schema.sql                # D1 metadata schema
├── wrangler.toml.example         # Production config template
├── wrangler.dev.toml             # Local development config
├── package.json
└── README.md
```

## Core Features

### 1. Namespace Management

- **List Namespaces**: Display all KV namespaces with cards showing ID, title, creation date, estimated key count
- **Create Namespace**: Dialog with name input and validation
- **Delete Namespace**: Confirmation dialog with key count warning
- **Rename Namespace**: Uses Cloudflare API rename endpoint
- **Bulk Operations**: Multi-select checkboxes for bulk delete
- **Protected Namespaces**: Hide system namespaces (e.g., `kv-manager-metadata`)

### 2. Key Management

- **List Keys**: Paginated list with cursor-based pagination (1000 keys per page)
- **Prefix Filtering**: Filter keys by prefix using KV list() prefix parameter
- **Key Inspector**: View key details (value, metadata, TTL, expiration date)
- **Value Editor**: Edit values with syntax highlighting for JSON, Monaco-style editor
- **Create Key**: Dialog with key name, value, optional TTL, optional metadata
- **Delete Key**: Confirmation dialog
- **Bulk Operations**: Multi-select for bulk delete (up to 10,000 keys via REST API)
- **TTL Management**: Display expiration timestamps, ability to update TTL

### 3. Value Types & Preview

- **Auto-Detection**: Detect JSON, text, binary based on content
- **JSON Viewer**: Pretty-printed JSON with collapsible tree view
- **Text Preview**: Plain text display with monospace font
- **Binary Indicator**: Show size and offer download for binary values
- **Size Display**: Show value size in bytes/KB/MB

### 4. Metadata & Tags

- **Custom Tags**: Add/remove tags per key (stored in D1)
- **Metadata Storage**: Store custom metadata in D1 for searchability
- **Lightweight Metadata**: Small metadata can be stored in KV's native metadata field
- **Tag Filtering**: Filter keys by tags in the UI
- **Bulk Tag Operations**: Apply/remove tags to multiple keys at once

### 5. Search & Discovery

- **Search by Prefix**: Standard KV prefix-based search
- **Full-Text Search**: Search across key names and metadata (via D1 index)
- **Tag Search**: Find all keys with specific tags
- **Cross-Namespace Search**: Search across all namespaces with results grouped
- **Advanced Filters**: Filter by TTL status, size, date modified

### 6. Backup & Restore (Single Version)

- **Previous Version Storage**: When updating a key, store previous value in special key `__backup__:original-key`
- **Undo Last Change**: Restore previous version from backup key
- **Backup Expiration**: Backup keys expire after 24 hours automatically
- **Bulk Backup**: Before bulk delete, create backups of all affected keys
- **Restore UI**: Simple "Undo" button in key inspector if backup exists

### 7. Import & Export

- **Export Namespace**: Download all keys as JSON or NDJSON file
- **Import Keys**: Upload JSON/NDJSON with key-value pairs
- **Bulk Import**: Use REST API bulk put (up to 10,000 keys at once)
- **Collision Handling**: Options to skip, overwrite, or rename on conflict
- **Progress Tracking**: Show import/export progress via Durable Object
- **Format Options**: JSON (array), NDJSON (line-delimited), CSV

### 8. Bulk Operations (Durable Object Orchestration)

- **Bulk Delete**: Delete multiple keys with progress tracking
- **Bulk Copy**: Copy keys to another namespace
- **Bulk TTL Update**: Set/update TTL on multiple keys
- **Bulk Tag**: Apply tags to selected keys
- **Progress UI**: Real-time progress updates from Durable Object
- **Cancellation**: Ability to cancel long-running operations
- **Error Handling**: Track and display per-key errors

### 9. Monitoring & Audit

- **Operation History**: D1 table tracking all operations (create/update/delete)
- **User Attribution**: Log which user performed each operation
- **Statistics**: Display namespace key count, approximate storage size
- **Recent Activity**: Show last 100 operations in timeline view
- **Audit Export**: Export audit log as CSV

## D1 Metadata Schema

```sql
-- Namespace tracking
CREATE TABLE namespaces (
  namespace_id TEXT PRIMARY KEY,
  namespace_title TEXT NOT NULL,
  first_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Key metadata and tags
CREATE TABLE key_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  tags TEXT, -- JSON array of tags
  custom_metadata TEXT, -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(namespace_id, key_name)
);

CREATE INDEX idx_key_metadata_namespace ON key_metadata(namespace_id);
CREATE INDEX idx_key_metadata_search ON key_metadata(key_name);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace_id TEXT NOT NULL,
  key_name TEXT,
  operation TEXT NOT NULL, -- 'create', 'update', 'delete', 'bulk_delete', etc.
  user_email TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT -- JSON object with operation details
);

CREATE INDEX idx_audit_log_namespace ON audit_log(namespace_id, timestamp DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_email, timestamp DESC);

-- Bulk operation jobs (for tracking DO operations)
CREATE TABLE bulk_jobs (
  job_id TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL, -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  total_keys INTEGER,
  processed_keys INTEGER,
  error_count INTEGER,
  started_at DATETIME,
  completed_at DATETIME,
  user_email TEXT
);

CREATE INDEX idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);
```

## Cloudflare KV REST API Endpoints

### Namespaces

- `GET /accounts/:account_id/storage/kv/namespaces` - List all namespaces
- `POST /accounts/:account_id/storage/kv/namespaces` - Create namespace
- `DELETE /accounts/:account_id/storage/kv/namespaces/:namespace_id` - Delete namespace
- `PUT /accounts/:account_id/storage/kv/namespaces/:namespace_id` - Rename namespace

### Keys

- `GET /accounts/:account_id/storage/kv/namespaces/:namespace_id/keys` - List keys (with prefix, cursor, limit)
- `GET /accounts/:account_id/storage/kv/namespaces/:namespace_id/values/:key_name` - Get key value
- `PUT /accounts/:account_id/storage/kv/namespaces/:namespace_id/values/:key_name` - Write key (with metadata, expiration_ttl)
- `DELETE /accounts/:account_id/storage/kv/namespaces/:namespace_id/values/:key_name` - Delete key
- `GET /accounts/:account_id/storage/kv/namespaces/:namespace_id/metadata/:key_name` - Get metadata only

### Bulk Operations

- `PUT /accounts/:account_id/storage/kv/namespaces/:namespace_id/bulk` - Bulk write (up to 10,000 keys)
- `DELETE /accounts/:account_id/storage/kv/namespaces/:namespace_id/bulk` - Bulk delete (up to 10,000 keys)

## Worker API Endpoints (Our App)

### Namespaces

- `GET /api/namespaces` - List all namespaces with metadata
- `POST /api/namespaces` - Create namespace
- `DELETE /api/namespaces/:namespaceId` - Delete namespace
- `PATCH /api/namespaces/:namespaceId/rename` - Rename namespace
- `GET /api/namespaces/:namespaceId/info` - Get namespace info and stats

### Keys

- `GET /api/keys/:namespaceId/list` - List keys with pagination
- `GET /api/keys/:namespaceId/:keyName` - Get key value and metadata
- `PUT /api/keys/:namespaceId/:keyName` - Create/update key
- `DELETE /api/keys/:namespaceId/:keyName` - Delete key
- `POST /api/keys/:namespaceId/bulk-delete` - Bulk delete keys (initiates DO job)
- `POST /api/keys/:namespaceId/bulk-copy` - Bulk copy keys (initiates DO job)
- `POST /api/keys/:namespaceId/bulk-ttl` - Bulk update TTL (initiates DO job)

### Metadata & Tags

- `GET /api/metadata/:namespaceId/:keyName` - Get D1 metadata and tags
- `PUT /api/metadata/:namespaceId/:keyName` - Update metadata/tags
- `POST /api/metadata/:namespaceId/bulk-tag` - Bulk apply tags

### Search

- `GET /api/search?query=...&namespaceId=...&tags=...` - Search keys across namespaces

### Backup/Restore

- `POST /api/backup/:namespaceId/:keyName/undo` - Restore previous version
- `GET /api/backup/:namespaceId/:keyName/check` - Check if backup exists

### Import/Export

- `GET /api/export/:namespaceId?format=json|ndjson|csv` - Export namespace (initiates DO job)
- `POST /api/import/:namespaceId` - Import keys from file (initiates DO job)
- `GET /api/jobs/:jobId` - Get job status and progress

### Audit

- `GET /api/audit/:namespaceId` - Get audit log for namespace
- `GET /api/audit/user/:userEmail` - Get audit log for user

## Durable Objects

### BulkOperationDO

Handles orchestration of bulk operations that exceed REST API limits or need progress tracking.

**Methods:**

- `startBulkDelete(keys: string[])` - Delete keys in batches of 10,000
- `startBulkCopy(keys: string[], targetNamespaceId: string)` - Copy keys to another namespace
- `startBulkTTLUpdate(keys: string[], ttl: number)` - Update TTL for multiple keys
- `getProgress()` - Return current operation progress
- `cancel()` - Cancel running operation

**Storage:**

- Uses DO storage for operation state
- Updates D1 bulk_jobs table periodically
- Emits progress via WebSocket to frontend (optional enhancement)

### ImportExportDO

Handles large import/export operations with streaming.

**Methods:**

- `startExport(namespaceId: string, format: string)` - Stream all keys to file
- `startImport(namespaceId: string, data: ReadableStream)` - Import from stream
- `getProgress()` - Return current operation progress

**Storage:**

- Temporary file storage in DO for export generation
- Batch processing for imports (10,000 keys at a time)

## UI Components

### NamespaceView Component

- Grid of namespace cards (similar to DatabaseView in D1 Manager)
- Each card shows: namespace ID, title, creation date, estimated key count
- Actions: View Keys, Delete, Rename
- Multi-select checkboxes for bulk operations
- "Create Namespace" button with dialog

### KeyView Component

- Table view of keys with columns: Key Name, Size, TTL, Tags, Actions
- Pagination controls (cursor-based)
- Prefix filter input at top
- Multi-select checkboxes for bulk operations
- "Create Key" button with dialog
- Click key name to open KeyEditor

### KeyEditor Component

- Full-screen dialog or side panel
- Tabs: Value, Metadata, Backup
- Value tab: Monaco-style editor with JSON syntax highlighting
- Metadata tab: TTL input, custom metadata fields, tags
- Backup tab: Show previous version if exists, "Restore" button
- Save/Cancel buttons

### BulkOperations Component

- Appears when keys are selected
- Action buttons: Delete Selected, Copy to Namespace, Update TTL, Apply Tags
- Progress dialog during bulk operations
- Error summary after completion

### SearchKeys Component

- Search input with prefix/full-text toggle
- Tag filter chips
- Namespace filter dropdown
- Results table with namespace column
- Click result to navigate to key in KeyView

## Local Development Setup

### Environment Variables (.env)

```
VITE_WORKER_API=http://localhost:8787
```

### Development Workflow

1. **Terminal 1**: `npm run dev` (Vite frontend on :5173)
2. **Terminal 2**: `npx wrangler dev --config wrangler.dev.toml --local` (Worker on :8787)
3. Auth disabled for localhost requests
4. Mock data for namespaces/keys when no credentials provided

### Mock Data (Local Dev)

- 2-3 mock namespaces with realistic IDs
- 10-20 mock keys per namespace
- Sample JSON and text values
- Mock metadata and tags

## Production Deployment

### Prerequisites

- Cloudflare account
- Wrangler CLI installed
- Domain (optional, can use workers.dev)

### Secrets

```bash
wrangler secret put ACCOUNT_ID
wrangler secret put API_KEY
wrangler secret put TEAM_DOMAIN
wrangler secret put POLICY_AUD
```

### D1 Setup

```bash
wrangler d1 create kv-manager-metadata
wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

### Deploy

```bash
npm run build
wrangler deploy
```

## Theme Support

- System (default) - follows OS preference
- Light mode
- Dark mode
- Theme toggle button in header
- Preference stored in localStorage

## Security

- Cloudflare Access JWT validation on all API requests
- Auth bypassed for localhost development
- All KV operations require valid auth token
- Audit logging of all destructive operations
- Protected namespaces hidden from UI

## Key Technical Considerations

### KV Limitations

- **Eventually Consistent**: Values may take up to 60 seconds to propagate globally
- **List Limit**: Maximum 1000 keys per list() call, requires cursor pagination
- **Bulk Limit**: REST API bulk operations limited to 10,000 keys
- **Metadata Size**: Native KV metadata limited to 1024 bytes
- **Write Rate**: 1 write per second per key (Workers API)

### Workarounds

- **Large Namespaces**: Use cursor pagination, show progress for bulk ops
- **Metadata Storage**: Hybrid D1/KV approach - searchable metadata in D1
- **Bulk Operations**: Durable Objects for operations exceeding 10,000 keys
- **Consistency**: Show warnings about eventual consistency, offer refresh button

### Performance Optimizations

- Cache namespace list in D1 to avoid excessive Cloudflare API calls
- Batch D1 metadata updates during bulk operations
- Use KV's native metadata field for small, non-searchable metadata
- Paginate key lists on frontend to avoid rendering thousands of rows
- Debounce search/filter inputs

## Testing Strategy

### Local Development Testing

- Mock all Cloudflare API responses
- Test UI with sample data
- Verify routing and navigation
- Test bulk operation progress UI

### Production Testing

- Create test namespace
- Test key CRUD operations
- Test bulk operations with < 100 keys
- Verify audit logging
- Test backup/restore functionality

## Future Enhancements (Post v1.0)

### Advanced Features

- **Scheduled Backups**: Cron-triggered exports to R2
- **Key Versioning**: Full version history (not just single backup)
- **Analytics Dashboard**: Key access patterns, storage trends
- **Namespace Templates**: Pre-configured key structures for common use cases
- **Key Expiration Alerts**: Notifications before keys expire
- **Batch Export to R2**: Export large namespaces directly to R2 bucket

### Durable Object Manager (Future Separate Tool)

- Once KV Manager is stable, extract DO orchestration patterns
- Build standalone DO Manager with similar UI
- Share common components (auth, theme, layout) across D1/R2/KV/DO managers
- Create unified "Cloudflare Data Suite" landing page

## Success Criteria

### MVP (v1.0) Must Have

- ✅ Namespace CRUD with card-based UI
- ✅ Key list with pagination and prefix filtering
- ✅ Key editor with JSON/text support
- ✅ Create/update/delete keys with TTL
- ✅ Bulk delete (up to 10,000 keys)
- ✅ Single-version backup/undo
- ✅ D1 metadata for tags and search
- ✅ Audit logging
- ✅ Import/export (JSON format)
- ✅ Cloudflare Access authentication
- ✅ Dark/light theme support
- ✅ Local development with mock data

### Nice to Have (v1.x)

- Bulk copy between namespaces
- Bulk TTL updates
- CSV export format
- WebSocket progress updates
- Advanced search with filters
- Tag-based organization

### Post v1.0

- R2 backup integration
- Scheduled jobs
- Analytics dashboard
- Full version history