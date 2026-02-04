# Cloudflare KV Manager

**Last Updated: February 4, 2026**

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/kv--manager-blue?logo=github)](https://github.com/neverinfamous/kv-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/kv-manager)](https://hub.docker.com/r/writenotenow/kv-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v2.2.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/kv-manager/blob/main/SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/kv-manager/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/kv-manager/)

A full-featured management platform for Cloudflare Workers KV, designed for engineering teams and large-scale workloads. Browse namespaces, run bulk operations, search across your entire KV footprint, manage metadata and tags, automate backups to R2, and secure everything with Cloudflare Access Zero Trust.

**[Live Demo](https://kv.adamic.tech/)** • **[Wiki](https://github.com/neverinfamous/kv-manager/wiki)** • **[Changelog](https://github.com/neverinfamous/kv-manager/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/kv-manager)**

## Tech Stack

**Frontend**: React 19.2.4 | TypeScript 5.9.3 | Vite 7.3.1 | Tailwind CSS 4.1.17 | shadcn/ui

**Backend**: Cloudflare Workers + KV + D1 + R2 + Durable Objects + Zero Trust

## ✨ Key Features

- **🗂️ Namespace & Key Management** - Full CRUD operations with cursor-based pagination and Grid/List view toggle
- **🎨 Color Tags** - 27-color palette for visual namespace organization
- **📊 Dual Metadata System** - KV Native (1024 bytes) + D1 Custom (unlimited) metadata
- **🏷️ Tag Organization** - Unlimited tags stored in D1 for easy filtering and search
- **🔍 Advanced Search** - Cross-namespace search by key name, tags, and custom metadata
- **⚡ Bulk Operations** - Process thousands of keys efficiently (delete, copy, TTL, tags)
- **🔄 NEW! Cross-Namespace Migration** - Migrate keys between namespaces with TTL preservation, metadata migration, and rollback support
- **📥 Import/Export** - JSON/NDJSON support with collision handling
- **☁️ R2 Backup & Restore** - Cloud-native backup with batch operations
- **📈 Job History** - Complete audit trail with event timelines and advanced filtering
- **📊 Metrics Dashboard** - View KV analytics, operation counts, and latency percentiles
- **🏥 NEW! Health Dashboard** - At-a-glance operational status with health score, job history, and backup coverage
- **🔔 Webhooks** - Event-driven HTTP notifications for key operations, bulk jobs, and failures
- **🔐 Enterprise Auth** - Cloudflare Access (Zero Trust) integration
- **🎨 Modern UI** - Dark/light themes, responsive design, built with React + Tailwind CSS

## 🐳 Docker Quick Start

```bash
docker pull writenotenow/kv-manager:latest

docker run -d \
  -p 8787:8787 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name kv-manager \
  writenotenow/kv-manager:latest
```

**[Full Docker Guide →](https://github.com/neverinfamous/kv-manager/wiki/Docker-Deployment)** - Docker Compose, Kubernetes, reverse proxy, security

## 💻 Local Development

**Prerequisites:** Node.js 24+ (LTS), Wrangler CLI

Install dependencies:

```bash
npm install
```

Initialize D1 database:

```bash
npx wrangler d1 execute kv-manager-metadata-dev --local --file=worker/schema.sql
```

Start dev servers (2 terminals):

**Terminal 1** — Frontend:

```bash
npm run dev
```

**Terminal 2** — Worker:

```bash
npx wrangler dev --config wrangler.dev.toml --local
```

## 🚀 Production Deployment

Create D1 database:

```bash
wrangler d1 create kv-manager-metadata
```

Initialize schema (new installation):

```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

Or migrate (existing installation):

```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/migrations/apply_all_migrations.sql
```

Set secrets:

```bash
wrangler secret put ACCOUNT_ID
wrangler secret put API_KEY
wrangler secret put TEAM_DOMAIN
wrangler secret put POLICY_AUD
```

Build and deploy:

```bash
npm run build
wrangler deploy
```

**[Production Deployment Guide →](https://github.com/neverinfamous/kv-manager/wiki/Production-Deployment)** - Complete setup with Cloudflare Access configuration

## 📚 Documentation

### User Guides

- **[User Guide](https://github.com/neverinfamous/kv-manager/wiki/User-Guide)** - Complete usage instructions
- **[Namespace Management](https://github.com/neverinfamous/kv-manager/wiki/Namespace-Management)** - Creating, managing, and organizing namespaces
- **[Key Operations](https://github.com/neverinfamous/kv-manager/wiki/Key-Operations)** - Working with keys and values
- **[Metadata and Tags](https://github.com/neverinfamous/kv-manager/wiki/Metadata-and-Tags)** - Using dual metadata systems
- **[Search and Discovery](https://github.com/neverinfamous/kv-manager/wiki/Search-and-Discovery)** - Finding keys across namespaces
- **[Bulk Operations](https://github.com/neverinfamous/kv-manager/wiki/Bulk-Operations)** - Batch processing at scale
- **[Import and Export](https://github.com/neverinfamous/kv-manager/wiki/Import-and-Export)** - Data migration
- **[R2 Backup and Restore](https://github.com/neverinfamous/kv-manager/wiki/R2-Backup-and-Restore)** - Cloud backups
- **[Job History](https://github.com/neverinfamous/kv-manager/wiki/Job-History)** - Monitoring operations
- **[Audit Logging](https://github.com/neverinfamous/kv-manager/wiki/Audit-Logging)** - Compliance and tracking

### Technical Documentation

- **[API Reference](https://github.com/neverinfamous/kv-manager/wiki/API-Reference)** - Complete REST API documentation
- **[Architecture](https://github.com/neverinfamous/kv-manager/wiki/Architecture)** - System design and components
- **[Database Schema](https://github.com/neverinfamous/kv-manager/wiki/Database-Schema)** - D1 database structure
- **[Authentication](https://github.com/neverinfamous/kv-manager/wiki/Authentication)** - Cloudflare Access integration

### Deployment & Operations

- **[Installation](https://github.com/neverinfamous/kv-manager/wiki/Installation)** - Local development setup
- **[Production Deployment](https://github.com/neverinfamous/kv-manager/wiki/Production-Deployment)** - Deploy to Cloudflare Workers
- **[Docker Deployment](https://github.com/neverinfamous/kv-manager/wiki/Docker-Deployment)** - Docker, Compose, Kubernetes
- **[Migration Guide](https://github.com/neverinfamous/kv-manager/wiki/Migration-Guide)** - Upgrading from older versions
- **[Troubleshooting](https://github.com/neverinfamous/kv-manager/wiki/Troubleshooting)** - Common issues and solutions
- **[Security Best Practices](https://github.com/neverinfamous/kv-manager/wiki/Security-Best-Practices)** - Hardening your deployment

## 🗄️ Database

KV Manager uses Cloudflare D1 (SQLite) for metadata, tags, audit logs, and job tracking.

**[Database Schema Documentation →](https://github.com/neverinfamous/kv-manager/wiki/Database-Schema)**

## 🎨 User Interface

Modern, responsive design with dark/light theme support. Navigate between:

- **Namespaces** - Browse and manage KV namespaces
- **Search** - Cross-namespace key search
- **Job History** - View bulk operations
- **Audit Log** - Operation tracking

## 🔐 Security

- Cloudflare Access JWT validation on all production API requests
- Auth bypassed for localhost development
- Comprehensive audit logging
- Protected namespaces hidden from UI

**[Security Best Practices →](https://github.com/neverinfamous/kv-manager/wiki/Security-Best-Practices)**

## 🆘 Troubleshooting

**Common issues:**

- **Worker not starting** - Ensure Wrangler is installed, Node 24+
- **Frontend connection issues** - Verify `VITE_WORKER_API` in `.env`
- **D1 errors** - Reinitialize with `worker/schema.sql`
- **Search not working** - Keys need D1 metadata (auto-indexed when created via UI)

**[Complete Troubleshooting Guide →](https://github.com/neverinfamous/kv-manager/wiki/Troubleshooting)**

## 🤝 Contributing

Contributions are welcome! Please see **[CONTRIBUTING.md](./CONTRIBUTING.md)** for guidelines.

**[Contributing Guide →](https://github.com/neverinfamous/kv-manager/wiki/Contributing)**

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

## 💬 Support

- **🐛 Issues:** [GitHub Issues](https://github.com/neverinfamous/kv-manager/issues)

- **📧 Email:** admin@adamic.tech

## ⭐ Show Your Support

If you find KV Manager useful, please consider giving it a star on GitHub!

---

**Made with ❤️ for the Cloudflare community**
