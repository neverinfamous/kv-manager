# Cloudflare KV Manager

A modern web application for managing Cloudflare Workers KV namespaces and keys, with enterprise-grade authentication via Cloudflare Access Zero Trust.

## Features

- **Namespace Management**: Create, delete, rename, and browse KV namespaces
- **Key Operations**: List, create, update, and delete keys with pagination
- **Metadata & Tags**: Add tags and custom metadata stored in D1 for enhanced search
- **Search & Discovery**: Search across key names, tags, and metadata
- **Backup & Restore**: Single-version backup for key values
- **Bulk Operations**: Bulk delete, copy, and TTL updates via Durable Objects
- **Import/Export**: Export namespaces to JSON/NDJSON and import key-value pairs
- **Audit Logging**: Track all operations with user attribution
- **Dark/Light Theme**: System, light, and dark theme support

## Architecture

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Auth**: Cloudflare Access (Zero Trust)

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

Terminal 1 (Frontend):
```bash
npm run dev
```

Terminal 2 (Worker):
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
# Copy the database_id to wrangler.toml
```

3. **Initialize D1 schema**:
```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

4. **Set secrets**:
```bash
wrangler secret put ACCOUNT_ID
wrangler secret put API_KEY
wrangler secret put TEAM_DOMAIN
wrangler secret put POLICY_AUD
```

5. **Build and deploy**:
```bash
npm run build
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
- `POST /api/namespaces` - Create namespace
- `DELETE /api/namespaces/:id` - Delete namespace
- `PATCH /api/namespaces/:id/rename` - Rename namespace
- `GET /api/namespaces/:id/info` - Get namespace info

### Keys
- `GET /api/keys/:namespaceId/list` - List keys with pagination
- `GET /api/keys/:namespaceId/:keyName` - Get key value
- `PUT /api/keys/:namespaceId/:keyName` - Create/update key
- `DELETE /api/keys/:namespaceId/:keyName` - Delete key
- `POST /api/keys/:namespaceId/bulk-delete` - Bulk delete

### Metadata
- `GET /api/metadata/:namespaceId/:keyName` - Get metadata
- `PUT /api/metadata/:namespaceId/:keyName` - Update metadata

### Search
- `GET /api/search?query=...&namespaceId=...&tags=...` - Search keys

### Backup
- `POST /api/backup/:namespaceId/:keyName/undo` - Restore previous version
- `GET /api/backup/:namespaceId/:keyName/check` - Check if backup exists

### Import/Export
- `GET /api/export/:namespaceId?format=json|ndjson` - Export namespace
- `POST /api/import/:namespaceId` - Import keys
- `GET /api/jobs/:jobId` - Get job status

### Audit
- `GET /api/audit/:namespaceId` - Get audit log for namespace
- `GET /api/audit/user/:userEmail` - Get audit log for user

## Database Schema

The D1 database stores:
- Namespace tracking (first/last accessed timestamps)
- Key metadata and tags
- Audit log (all operations with user attribution)
- Bulk operation jobs (status and progress tracking)

See `worker/schema.sql` for the complete schema.

## Theme Support

- **System** (default): Follows OS preference
- **Light**: Light mode
- **Dark**: Dark mode

Theme preference is stored in localStorage.

## Security

- Cloudflare Access JWT validation on all API requests
- Auth bypassed for localhost development
- All KV operations require valid auth token
- Audit logging of all destructive operations
- Protected namespaces hidden from UI

## Troubleshooting

### Worker not starting
- Ensure `wrangler` is installed: `npm install -g wrangler`
- Check Node.js version (18+ required)
- Try clearing Wrangler cache: `rm -rf ~/.wrangler`

### Frontend not connecting to worker
- Verify `VITE_WORKER_API` in `.env` points to `http://localhost:8787`
- Check CORS configuration in `worker/utils/cors.ts`
- Ensure both dev servers are running

### D1 database errors
- Reinitialize schema: `npx wrangler d1 execute kv-manager-metadata-dev --local --file=worker/schema.sql`
- Check D1 binding in `wrangler.dev.toml`

### Mock data not appearing
- Mock data is only returned when `ACCOUNT_ID` and `API_KEY` are not set
- Check console logs for `[Auth] Localhost detected, skipping JWT validation`

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
