# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

- **Database Schema Enhancements**:
  - Added `current_key` column to `bulk_jobs` table to track the key currently being processed
  - Added `percentage` column to `bulk_jobs` table to store completion percentage (0-100)

### Changed
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

### Technical Improvements
- Implemented two Durable Object classes:
  - `BulkOperationDO` - Handles bulk delete, copy, TTL, and tag operations
  - `ImportExportDO` - Handles import and export operations with file storage
- Added proper TypeScript type definitions for all WebSocket messages and job parameters
- Implemented graceful error handling and recovery for WebSocket connections
- Added comprehensive logging for debugging WebSocket connections and job processing
- Fixed all ESLint and TypeScript linting errors related to React hooks and Workers types

### Fixed
- **CRITICAL**: WebSocket connection loop causing 429 rate limit errors
  - Added parameter validation in `useBulkJobProgress` hook to prevent connection attempts with empty jobId or wsUrl
  - Added conditional guard in `BulkProgressDialog` to only invoke hook when dialog is open and has valid parameters
  - Prevents infinite reconnection loops and API request floods
- **SECURITY**: Log injection vulnerability in WebSocket message handling
  - Added `sanitizeForLog()` function to remove newlines and control characters from logged data
  - Prevents malicious log forging via WebSocket messages
  - Limits log entry length to prevent log flooding
  - Sanitizes WebSocket event data, progress data, and error messages before logging
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

