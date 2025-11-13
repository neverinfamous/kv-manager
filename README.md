# Cloudflare KV Manager

*Last Updated: November 13, 2025*

A modern, full-featured web application for managing Cloudflare Workers KV namespaces and keys, with enterprise-grade authentication via Cloudflare Access Zero Trust.

**🎯 [Try the Live Demo](https://kv.adamic.tech/)** - See KV Manager in action

**📰 [Read the v1.0.0 Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)** - Learn more about features, architecture, and deployment

## Features

### Namespace Management
- Create, delete, and rename KV namespaces
- Browse namespaces with key counts and metadata
- Export entire namespaces to JSON or NDJSON format
- Import keys from JSON or NDJSON files
- Namespace-level audit logging

### Key Operations
- List keys with cursor-based pagination
- Create, update, and delete individual keys
- Full CRUD operations with metadata support
- TTL (expiration) management
- KV native metadata (1024 byte limit)
- Single-version backup and restore

### Metadata & Tags (D1-Backed)
- Add unlimited tags to keys for organization
- Store custom JSON metadata (no size limit)
- Search and filter by tags
- Bulk tag operations (add/remove/replace)
- Separate from KV's native metadata system

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
- **Operation Cancellation**: Cancel in-progress operations via WebSocket
- Progress tracking with job IDs
- Batch processing (10,000 keys per operation)

### Import/Export
- Export namespaces in JSON or NDJSON format
- Auto-detect format on import
- Collision handling (skip/overwrite/fail)
- Progress tracking for large operations
- Download exported data as files

### Job History
- **Job History UI** - View complete history of all bulk operations
- Timeline visualization showing job lifecycle events
- Filter jobs by status (completed, failed, cancelled, running, queued)
- Filter by operation type (export, import, bulk delete, bulk copy, bulk TTL, bulk tag)
- Job cards displaying operation details, namespace, timestamps, and progress
- Click any job to view detailed event timeline with milestones
- "View History" button in progress dialog for immediate access
- Pagination support for large job histories
- User-specific history (only see your own jobs)

### Audit Logging
- Track all operations with user attribution
- Filter by namespace or user
- Filter by operation type
- Pagination support
- Export audit logs to CSV
- Comprehensive operation tracking
- **Job lifecycle event tracking** - Milestone events (started, 25%, 50%, 75%, completed/failed/cancelled) for all bulk operations
- Event history API for job replay and debugging

### User Interface
- **Dark/Light Theme**: System, light, and dark theme support
- **Navigation**: Switch between Namespaces, Search, Job History, and Audit Log views
- **Responsive Design**: Works on desktop and mobile
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS

## Architecture

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.2.2 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Real-time Progress**: WebSocket connections via Durable Objects with polling fallback
- **Auth**: Cloudflare Access (Zero Trust)

### WebSocket-Based Progress Tracking

All bulk operations (copy, delete, TTL updates, tag operations, import, export) now use **WebSocket connections** for real-time progress updates:

- **Async Processing**: Operations start immediately and process in background via Durable Objects
- **Real-Time Updates**: Progress, current key, percentage, and errors stream via WebSocket
- **Operation Cancellation**: Cancel running operations via WebSocket with graceful shutdown
- **Graceful Fallback**: Automatic fallback to HTTP polling if WebSocket connection fails
- **Reconnection**: Exponential backoff reconnection strategy for dropped connections
- **Progress Details**: See total keys, processed count, errors, current key being processed, and percentage completion

## Docker Deployment

**🐳 Quick Start with Docker**

Pull the latest image:

```bash
docker pull writenotenow/kv-manager:latest
```

Run the container:

```bash
docker run -d \
  -p 8787:8787 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name kv-manager \
  writenotenow/kv-manager:latest
```

Access at `http://localhost:8787`

**📖 Full Docker Documentation:** See [DOCKER_README.md](./DOCKER_README.md) for complete deployment guides including:
- Docker Compose configurations
- Kubernetes deployments
- Reverse proxy examples (Nginx, Traefik, Caddy)
- Security best practices
- Troubleshooting guide

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)

### Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Create environment file**:
```bash
cp .env.example .env
```

3. **Initialize local D1 database**:
```bash
npx wrangler d1 execute kv-manager-metadata-dev --local --file=worker/schema.sql
```

4. **Start the development servers**:

In Terminal 1, start the frontend:

```bash
npm run dev
```

In Terminal 2, start the worker:

```bash
npx wrangler dev --config wrangler.dev.toml --local
```

5. **Access the application**:
- Frontend: http://localhost:5173
- Worker API: http://localhost:8787

### Local Development Notes

- Authentication is **bypassed** for localhost requests
- Mock data is returned when no Cloudflare credentials are provided
- No secrets required for local development
- CORS is configured to allow `http://localhost:5173`

## Production Deployment

### Prerequisites

- Cloudflare account
- Domain (optional, can use workers.dev)
- Cloudflare Access configured for your domain

### Setup

1. **Create production configuration**:
```bash
cp wrangler.toml.example wrangler.toml
```

2. **Create D1 database**:

```bash
wrangler d1 create kv-manager-metadata
```

Copy the `database_id` from the output to your `wrangler.toml` file.

3. **Initialize D1 schema**:
```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

4. **Set secrets**:

Set your Cloudflare Account ID:

```bash
wrangler secret put ACCOUNT_ID
```

Set your API Key:

```bash
wrangler secret put API_KEY
```

Set your Team Domain:

```bash
wrangler secret put TEAM_DOMAIN
```

Set your Policy AUD tag:

```bash
wrangler secret put POLICY_AUD
```

5. **Build and deploy**:

Build the application:

```bash
npm run build
```

Deploy to Cloudflare:

```bash
wrangler deploy
```

### Production Notes

- All API requests require valid Cloudflare Access JWT
- Audit logging captures all destructive operations
- D1 stores metadata, tags, and audit logs
- Durable Objects handle bulk operations exceeding 10,000 keys

## API Endpoints

### Namespaces
- `GET /api/namespaces` - List all namespaces
- `POST /api/namespaces` - Create a new namespace
- `DELETE /api/namespaces/:id` - Delete a namespace
- `PATCH /api/namespaces/:id/rename` - Rename a namespace
- `GET /api/namespaces/:id/info` - Get namespace information and statistics

### Keys
- `GET /api/keys/:namespaceId/list` - List keys with cursor-based pagination
- `GET /api/keys/:namespaceId/:keyName` - Get a key's value and metadata
- `PUT /api/keys/:namespaceId/:keyName` - Create or update a key
- `DELETE /api/keys/:namespaceId/:keyName` - Delete a key
- `POST /api/keys/:namespaceId/bulk-delete` - Delete multiple keys
- `POST /api/keys/:namespaceId/bulk-copy` - Copy keys to another namespace
- `POST /api/keys/:namespaceId/bulk-ttl` - Update TTL on multiple keys

### Metadata & Tags
- `GET /api/metadata/:namespaceId/:keyName` - Get D1-backed metadata and tags
- `PUT /api/metadata/:namespaceId/:keyName` - Update metadata and tags
- `POST /api/metadata/:namespaceId/bulk-tag` - Apply tags to multiple keys (add/remove/replace)

### Search
- `GET /api/search` - Search keys across namespaces
  - Query params: `query` (key name pattern), `namespace_id`, `tags` (comma-separated)

### Backup & Restore
- `POST /api/backup/:namespaceId/:keyName/undo` - Restore key to previous version
- `GET /api/backup/:namespaceId/:keyName/check` - Check if backup exists

### Import/Export
- `GET /api/export/:namespaceId` - Start async export of namespace keys and values
  - Query params: `format` (json|ndjson)
  - Returns: `job_id`, `status`, `ws_url`
- `POST /api/import/:namespaceId` - Start async import of keys into namespace
  - Query params: `collision` (skip|overwrite|fail)
  - Returns: `job_id`, `status`, `ws_url`
- `GET /api/jobs/:jobId` - Get status of bulk job (polling endpoint)
- `GET /api/jobs/:jobId/ws` - WebSocket endpoint for real-time progress updates
- `GET /api/jobs/:jobId/download` - Download completed export file

### Job History
- `GET /api/jobs` - Get paginated list of user's jobs
  - Query params: 
    - `limit`, `offset` - Pagination
    - `status` - Filter by job status (completed, failed, cancelled, running, queued)
    - `operation_type` - Filter by operation (export, import, bulk_copy, bulk_delete, bulk_ttl_update, bulk_tag)
    - `namespace_id` - Filter by specific namespace
    - `start_date`, `end_date` - Filter by date range (ISO timestamps)
    - `job_id` - Search by job ID (partial match with LIKE)
    - `min_errors` - Filter jobs with error_count >= threshold
    - `sort_by` - Column to sort by (started_at, completed_at, total_keys, error_count, percentage)
    - `sort_order` - Sort direction (asc or desc, default: desc)
  - Returns: Job list with metadata, progress, and timestamps
- `GET /api/jobs/:jobId/events` - Get lifecycle event history for a job
  - Returns: Chronological list of events (started, progress_25, progress_50, progress_75, completed/failed/cancelled)
  - Use case: Job history UI, debugging, event replay

### Audit Logs
- `GET /api/audit/:namespaceId` - Get audit log for a namespace
  - Query params: `limit`, `offset`, `operation`
- `GET /api/audit/user/:userEmail` - Get audit log for a specific user
  - Query params: `limit`, `offset`, `operation`

## Database Schema

The D1 database (`kv-manager-metadata`) stores:

### Tables

#### `key_metadata`
- Stores tags and custom metadata for keys
- JSON fields for flexible schema
- Indexed by `namespace_id` and `key_name`

#### `audit_log`
- Tracks all operations (create, update, delete, bulk operations)
- User attribution via email
- Timestamp, operation type, and details
- Indexed for efficient querying

#### `job_audit_events`
- Tracks lifecycle events for all bulk jobs (started, progress_25, progress_50, progress_75, completed, failed, cancelled)
- Stores detailed JSON metadata for each event (processed counts, error counts, percentages)
- Foreign key relationship to `bulk_jobs` table
- Indexed by `job_id` and `user_email` for efficient querying
- Foundation for job history and event replay functionality

#### `bulk_jobs`
- Tracks import/export and bulk operation progress
- Status tracking (queued, running, completed, failed)
- Progress counters (total, processed, errors)
- Job metadata and timestamps

#### `namespace_metadata`
- First and last accessed timestamps
- Namespace-level statistics

See `worker/schema.sql` for the complete schema definition.

## User Interface

### Navigation
- **Namespaces View**: Browse and manage KV namespaces
- **Search View**: Cross-namespace key search with filters
- **Job History View**: View all bulk operations with event timelines
- **Audit Log View**: Operation history and tracking

### Theme Support
- **System** (default): Follows OS preference
- **Light**: Light mode
- **Dark**: Dark mode

Theme preference is stored in localStorage and persists across sessions.

## Security

- Cloudflare Access JWT validation on all API requests
- Auth bypassed for localhost development
- All KV operations require valid auth token
- Audit logging of all destructive operations
- Protected namespaces hidden from UI

## Usage Guide

### Managing Namespaces
1. View all namespaces on the main page
2. Click **Create Namespace** to add a new one
3. Use **Export** to download namespace data (JSON/NDJSON)
4. Use **Import** to upload keys from a file
5. Click **Browse Keys** to view namespace contents
6. Use the three-dot menu for rename/delete operations

### Working with Keys
1. Browse keys in a namespace with pagination
2. Click **Add Key** to create a new key-value pair
3. Select multiple keys using checkboxes for bulk operations
4. Edit individual keys by clicking on them
5. View and modify TTL (expiration) settings
6. Add tags and custom metadata in the "Metadata & Tags" tab

### Bulk Operations
1. Select multiple keys using checkboxes
2. Choose from available bulk actions:
   - **Copy to Namespace**: Duplicate keys to another namespace
   - **Update TTL**: Set expiration time on selected keys
   - **Apply Tags**: Add, remove, or replace tags
   - **Delete Selected**: Remove multiple keys at once
3. Monitor progress with job status tracking
4. Cancel operations in progress using the Cancel button (requires WebSocket connection)

### Searching
1. Click **Search** in the navigation bar
2. Enter a key name pattern (supports partial matches)
3. Filter by specific namespace (optional)
4. Filter by tags (comma-separated, optional)
5. Click any result to navigate to that key

### Job History
1. Click **Job History** in the navigation bar
2. View all your bulk operations (import, export, bulk delete, etc.)
3. Use advanced filters to find specific jobs:
   - **Status Filter**: Filter by completed, failed, cancelled, running, or queued
   - **Operation Type**: Filter by export, import, bulk copy, bulk delete, bulk TTL, or bulk tag
   - **Namespace Filter**: Filter jobs by specific namespace
   - **Date Range**: Select preset ranges (Last 24h, Last 7 days, Last 30 days) or custom date range
   - **Job ID Search**: Search for jobs by their ID (partial matches supported)
   - **Min Errors**: Filter jobs with a minimum error count threshold
4. Sort results by:
   - Started At (default)
   - Completed At
   - Total Keys
   - Error Count
   - Progress Percentage
5. Toggle sort order between ascending and descending
6. Click **Clear All Filters** to reset all filters to defaults
7. Click any job card to view detailed event timeline
8. See milestone events: started → 25% → 50% → 75% → completed
9. After any bulk operation completes, click **View History** in the progress dialog

### Audit Logs
1. Click **Audit Log** in the navigation bar
2. Select a namespace to view its operation history
3. Filter by operation type (create, update, delete, etc.)
4. Use pagination to browse historical entries
5. Export logs to CSV for external analysis

## Troubleshooting

### Worker not starting

Ensure `wrangler` is installed:

```bash
npm install -g wrangler
```

Check Node.js version (18+ required):

```bash
node --version
```

Try clearing Wrangler cache:

```bash
rm -rf ~/.wrangler
```

### Frontend not connecting to worker
- Verify `VITE_WORKER_API` in `.env` points to `http://localhost:8787`
- Check CORS configuration in `worker/utils/cors.ts`
- Ensure both dev servers are running

### D1 database errors

Reinitialize the schema:

```bash
npx wrangler d1 execute kv-manager-metadata-dev --local --file=worker/schema.sql
```

Check D1 binding in `wrangler.dev.toml`

Verify database exists:

```bash
npx wrangler d1 list
```

### Mock data not appearing
- Mock data is only returned when `ACCOUNT_ID` and `API_KEY` are not set
- Check console logs for `[Auth] Localhost detected, skipping JWT validation`
- Ensure worker is running with `--local` flag

### Import/Export issues
- Verify file format is valid JSON or NDJSON
- Check file size (large imports may take time)
- Monitor job status using the returned `job_id`
- Check browser console for detailed error messages

### Search not returning results
- Ensure metadata exists in D1 database
- Check that keys have been tagged (if filtering by tags)
- Verify D1 database is properly initialized
- Try searching without filters first

### WebSocket connection issues
- Progress tracking automatically falls back to HTTP polling if WebSocket fails
- Check browser console for connection errors
- Verify firewall/proxy settings allow WebSocket connections
- WebSocket connections use same origin as API (ws:// for http://, wss:// for https://)
- For development, ensure worker is running on expected port (default: 8787)

---

### Future Enhancements:
1. R2 backup integration
2. Batch operations to R2

---

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
