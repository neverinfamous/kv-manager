## [Unreleased]

### Changed
**Dependency Updates**
- Bumped `vite` to `^8.0.0` and `@vitejs/plugin-react` to `^6.0.1` and adapted `manualChunks` configuration
- Updated generic project dependencies to their latest compatible ranges via `npm update`

### Security
- Added exact version override for `undici` to resolve multiple high severity vulnerabilities:
  - GHSA-f269-vfmq-vjvj: Malicious WebSocket 64-bit length overflows parser and crashes the client
  - GHSA-2mjp-6q6p-2qxm: HTTP Request/Response Smuggling issue
  - GHSA-4992-7rv2-5pvq: CRLF Injection in undici via `upgrade` option
  - GHSA-vrm6-8vpv-qv8q: Unbounded Memory Consumption in WebSocket permessage-deflate Decompression
  - GHSA-v9p9-hfj2-hcw8: Unhandled Exception in WebSocket Client Due to Invalid server_max_window_bits Validation
  - GHSA-phc3-fgpg-7m6h: Unbounded Memory Consumption in its DeduplicationHandler via Response Buffering
