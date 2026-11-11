# Changelog

All notable changes to this project are documented in this file.
This changelog is auto-generated from Git history using [lib-git-history](https://github.com/neverinfamous/adamic).

## [Unreleased]

### Security

- Harden origin validation, enforce strict ALLOWED_ORIGINS credentialed CORS allowlisting, block untrusted cross-origin state-changing API requests with 403 Forbidden (GHSA-j3r9-4pwc-c8mh), restrict local dev auth bypass to unauthenticated mock mode when no production or Access secrets are configured (GHSA-x3mg-rm2g-357p / GHSA-p483-22hw-9vjv), disable workers_dev and preview_urls by default in wrangler configs, and update README.md, DOCKER_README.md, and SECURITY.md. by **Chris** ([cb69c52](https://github.com/neverinfamous/kv-manager/commit/cb69c525841ab0bb46cfbc9e5396eea9abab4ff4))

## [v2.3.2]

### Code Quality

- --- product: "Cloudflare KV Manager" version: "2.3.2" date: "2026-10-30" slug: "cloudflare-kv-manager-v2-3-2" npm_package: "" docker_image: "writenotenow/kv-manager" github_repo: "neverinfamous/kv-manager" description: "Refreshes dependencies, patches undici CVEs, and hardens the Docker image and CI pipeline." --- # Cloudflare KV Manager v2.3.2 ## Highlights; **Security Patch Release**: All known dependency vulnerabilities are resolved, including 18 `undici` advisories. You get a safer local toolchain and Docker image.; **Hardened Container**: The image drops from 18 known vulnerabilities to a single unrated `musl` finding that awaits an upstream Alpine fix.; **Fresh Stack**: React 19.3, Vite 8.3, Wrangler 4.156, and the latest Radix UI components. ## Changed; **deps**: Updated all runtime and development dependencies, and refreshed overrides for `undici`, `tar`, `minimatch`, `picomatch`, and `flatted`.; **ci**: Pinned every GitHub Action to a commit SHA and every runner to `ubuntu-24.04` for reproducible builds.; **ci**: Updated GitHub Actions to Node 24 releases to resolve deprecation warnings. ## Security; **deps**: Raised `undici` to 7.30.1, clearing all open Dependabot alerts for the project.; **docker**: Patched bundled `undici` and `ip-address`, and upgraded OpenSSL, zlib, and musl in the runtime image. ## Install ```bash docker pull writenotenow/kv-manager:v2.3.2 ``` [Full Changelog](https://github.com/neverinfamous/kv-manager/compare/v2.3.1...v2.3.2) by **Chris LeRoux** ([92e2392](https://github.com/neverinfamous/kv-manager/commit/92e2392b7faf53c4b6df1aa59437b29d1d9e0dc0))

## [v2.3.1]

### Code Quality

- --- product: "Cloudflare KV Manager" version: "2.3.1" date: "2026-08-17" slug: "cloudflare-kv-manager-v2-3-1" npm_package: "" docker_image: "writenotenow/kv-manager" github_repo: "neverinfamous/kv-manager" description: "Enhances screen reader accessibility in the webhook manager and updates core dependencies." --- # Cloudflare KV Manager v2.3.1 ## Highlights; **Enhanced Accessibility**: The Webhook Manager has been fully audited and updated to ensure perfect screen reader compatibility, eliminating broken associations.; **Dependency & Build Maintenance**: Core dependencies have been updated and Vite 8 legacy build warnings have been suppressed for a cleaner, more secure build pipeline. ## Changed; **build**: Suppress legacy `configLoader` warnings in Vite 8 to provide cleaner build logs and smoother developer experience. ## Fixed; **a11y**: Nest form inputs directly inside their corresponding labels in the Webhook Manager, resolving screen reader association warnings.; **a11y**: Replace an invalid events label with a styled division to eliminate lingering accessibility complaints without sacrificing visual design. ## Security; **deps**: Update project dependencies, resolve overrides, and sync `esbuild` to the latest version for enhanced stability and safety. ## Install ```bash docker pull writenotenow/kv-manager:v2.3.1 ``` [Full Changelog](https://github.com/neverinfamous/kv-manager/compare/v2.3.0...v2.3.1) by **Chris** ([89736bf](https://github.com/neverinfamous/kv-manager/commit/89736bfee672929504f449cc0eb54170cca74285))

## [v2.3.0]

### Features

- implement documented health penalty deductions and audit log integration for active threshold breaches by **Chris** ([cf68c1a](https://github.com/neverinfamous/kv-manager/commit/cf68c1a5a485d0e4e4a45543355f2c4f635bdd68))
- add scheduled threshold monitoring for KV metrics (#140) by **Chris** ([8cbb653](https://github.com/neverinfamous/kv-manager/commit/8cbb653545815bced23b743e53f8597658b0f9b4))

### Bug Fixes

- prevent orphaned threshold states from penalizing health score by **Chris** ([9b22704](https://github.com/neverinfamous/kv-manager/commit/9b22704f2b64578d355b117bb3d06def848340f3))
- bypass rigid 404 namespace validation on threshold creation by upserting missing UI selections by **Chris** ([6d4f35c](https://github.com/neverinfamous/kv-manager/commit/6d4f35c8de056dd172d05fddff991a1670f36ae0))
- correct remaining namespace JOIN column names in threshold mutations by **Chris** ([e45b3a6](https://github.com/neverinfamous/kv-manager/commit/e45b3a6f19a49e7dfccda6f2de02754115b198a8))
- unwrap json response correctly in threshold service by **Chris** ([ba54eb1](https://github.com/neverinfamous/kv-manager/commit/ba54eb15c0cb14252d3a867404fcff23635484da))
- correct namespace JOIN column names in threshold listing by **Chris** ([a7b10b1](https://github.com/neverinfamous/kv-manager/commit/a7b10b1f91f0204b77921debe6be0b5ab18857f1))
- update tar override in Dockerfile to 7.5.19 to patch CVEs (#192) by **Chris LeRoux** ([2d66703](https://github.com/neverinfamous/kv-manager/commit/2d66703b949b92c7fc9c5e20b5729301f2565ee9))
- update tar override in Dockerfile to 7.5.19 to patch CVEs by **Chris** ([d022a6f](https://github.com/neverinfamous/kv-manager/commit/d022a6fec73fec51315a027cc730c5925d2dc8e8))
- update tar override to 7.5.19 to patch CVEs (#191) by **Chris LeRoux** ([d8e7cb7](https://github.com/neverinfamous/kv-manager/commit/d8e7cb76daa8f7561302eea70f562ec501079790))
- update tar override to 7.5.19 to patch CVEs by **Chris** ([e731ace](https://github.com/neverinfamous/kv-manager/commit/e731ace9e3d2f9e49ac97b5113d305d11c320bf0))

### Code Quality

- --- product: "Cloudflare KV Manager" version: "2.3.0" date: "2026-07-25" slug: "cloudflare-kv-manager-v2-3-0" npm_package: "" docker_image: "writenotenow/kv-manager" github_repo: "neverinfamous/kv-manager" description: "Introduces scheduled threshold monitoring for KV metrics, automated health deductions, and audit logging." --- # Cloudflare KV Manager v2.3.0 ## Highlights; **Scheduled Threshold Monitoring**: Automatically track KV metric thresholds on a schedule to ensure consistent performance monitoring.; **Automated Health Penalties**: Integrate active threshold breaches directly with the health scoring system and audit logs to improve visibility and accountability. ## Added; **monitoring**: Add scheduled threshold monitoring for KV metrics (#140). This allows you to proactively track and alert on key performance indicators.; **monitoring**: Implement documented health penalty deductions and audit log integration for active threshold breaches, ensuring your health scores accurately reflect current system state. ## Changed; **main**: Synchronize docs and configuration to align with the newly introduced scheduled threshold monitoring system. ## Fixed; **monitoring**: Prevent orphaned threshold states from penalizing your overall health score, ensuring accurate metrics.; **api**: Correct namespace JOIN column names in both threshold listing and mutations to resolve data retrieval errors.; **api**: Bypass rigid 404 namespace validation on threshold creation by automatically upserting missing UI selections.; **ui**: Unwrap JSON responses correctly in the threshold service to restore UI stability and data rendering.; **config**: Resolve CRLF invisible character corruption in the `wrangler.toml` triggers block, preventing unexpected deployment failures.; **deps**: Update dependencies and security patches for enhanced stability and safety. ## Install ```bash docker pull writenotenow/kv-manager:v2.3.0 ``` [Full Changelog](https://github.com/neverinfamous/kv-manager/compare/v2.2.10...v2.3.0) by **Chris** ([1009824](https://github.com/neverinfamous/kv-manager/commit/1009824485829f029884a647a17ac8cf06c51aaf))
- --- product: "Cloudflare KV Manager" version: "2.2.10" date: "2026-07-23" slug: "kv-manager" npm_package: "" docker_image: "writenotenow/kv-manager" github_repo: "neverinfamous/kv-manager" description: "Pnpm v11 migration, robust CI/CD safety gates, and enhanced documentation alignment." --- # Cloudflare KV Manager v2.2.10 ## Highlights; **Pnpm v11 Workspaces**: We have migrated the entire project to `pnpm` workspaces for faster, deterministic installations and improved dependency resolution across modules.; **Robust CI/CD Pipelines**: Migrated our GitHub Actions workflows to `pnpm` and enforced stricter safety gates, ensuring high standards for code quality and security on every push.; **Enhanced Marketing Alignment**: We have rigorously audited and updated our documentation, release notes, and community guidelines for consistent adversarial marketing language and readability. ## Changed; **deps**: Migrated to pnpm v11 workspace, updated major node/workers types, resolved vulnerabilities, and configured allowBuilds to improve dependency security and build times.; **core**: Applied doc-audit marketing and consistency enhancements to documentation, optimizing community templates and readmes.; **actions**: Enforced safety gates and migrated GitHub workflows to pnpm to tighten CI pipeline reliability.; **repo**: Applied adversarial marketing guidelines to historical release notes and updated gitignore. ## Fixed; **deps**: Replaced deprecated pnpm overrides catalog syntax to resolve install warnings.; **lint**: Ignored the `.agents` directory in our eslint config to prevent linting conflicts with auto-generated scripts. ## Removed; **repo**: Removed `UNRELEASED.md` as git history is now the single source of truth. ## Install ```bash docker pull writenotenow/kv-manager:v2.2.10 ``` [Full Changelog](https://github.com/neverinfamous/kv-manager/compare/v2.2.9...v2.2.10) by **Chris** ([68e5118](https://github.com/neverinfamous/kv-manager/commit/68e511862108032d36d4a64b16d412ef6708f3c4))

## [v2.2.1]

### Bug Fixes

- add CI/CD CodeQL gating + semicolon insertion fix by **Temp** ([bf8bce6](https://github.com/neverinfamous/kv-manager/commit/bf8bce6e723651d481cfba738b877da3a1bf7da8))

## [v2.2.0]

### Bug Fixes

- read Docker image version from VERSION file instead of README by **Temp** ([d6aaf62](https://github.com/neverinfamous/kv-manager/commit/d6aaf62e6e0d1c8d51f95b526476bb33fc33d779))

## [v2.1.0]

### Bug Fixes

- replace undefined comparisons with truthy checks to fix CodeQL warnings by **Temp** ([be098f0](https://github.com/neverinfamous/kv-manager/commit/be098f0a0b985b93e4ea049afc7af3c4a636c09f))

## [v2.0.0]

### Features

- release v2.0.0 - automated migrations, metrics dashboard, webhooks, UI enhancements by **Temp** ([6a9dee5](https://github.com/neverinfamous/kv-manager/commit/6a9dee5c27d87d161aa56f37b95e6ff414e0ab9f))

### Bug Fixes

- patch wrangler's bundled vulnerable dependencies by **Temp** ([ab9cff7](https://github.com/neverinfamous/kv-manager/commit/ab9cff742a894259f0f4009e1130a5c306b72d5b))

## [v1.0.0]

### Features

- implement key browser and bulk operations by **Temp** ([fca7f5b](https://github.com/neverinfamous/kv-manager/commit/fca7f5b329f2aedab99fb805e049e37039f1ef89))

### Bug Fixes

- implement key listing and deletion endpoints by **Temp** ([173a11f](https://github.com/neverinfamous/kv-manager/commit/173a11f2af4ccaa7d284a6f6275c9fbe3fbbb242))
- include wrangler.toml in repository for CI/CD deployment by **Temp** ([00c2a17](https://github.com/neverinfamous/kv-manager/commit/00c2a17fa11aa6ce213df5a6f1877e8d872c56e4))
