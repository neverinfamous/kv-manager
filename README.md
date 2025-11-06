# Cloudflare KV Manager

*Last Updated: November 5, 2025*

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
- Progress tracking with job IDs
- Batch processing (10,000 keys per operation)

### Import/Export
- Export namespaces in JSON or NDJSON format
- Auto-detect format on import
- Collision handling (skip/overwrite/fail)
- Progress tracking for large operations
- Download exported data as files

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

## Architecture

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Auth**: Cloudflare Access (Zero Trust)

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
- `GET /api/export/:namespaceId` - Export namespace keys and values
  - Query params: `format` (json|ndjson)
- `POST /api/import/:namespaceId` - Import keys into namespace
  - Query params: `collision` (skip|overwrite|fail)
- `GET /api/jobs/:jobId` - Get status of import/export job

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

### Searching
1. Click **Search** in the navigation bar
2. Enter a key name pattern (supports partial matches)
3. Filter by specific namespace (optional)
4. Filter by tags (comma-separated, optional)
5. Click any result to navigate to that key

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

## Next Steps:

### Immediate Priorities:
1. Add WebSocket support for real-time progress
2. Implement Durable Objects for large operations
3. Add advanced search filters
4. Create analytics dashboard

### Future Enhancements:
1. R2 backup integration
2. Scheduled jobs (cron triggers)
3. Full version history
4. Key expiration alerts
5. Namespace templates
6. Batch operations to R2

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
