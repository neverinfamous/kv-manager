# =============================================================================
# KV Manager - Cloudflare Workers Deployment
# =============================================================================
# Multi-stage build for optimal image size and security
# Production-ready image: ~150MB
# =============================================================================

# -----------------
# Stage 1: Builder
# -----------------
FROM node:24-alpine AS builder

WORKDIR /app

# Upgrade npm to latest version to fix CVE-2024-21538 (cross-spawn vulnerability)
RUN npm install -g npm@latest

# Patch npm's own bundled dependencies:
# - CVE-2025-64756, CVE-2026-118773 (glob): npm bundles vulnerable glob@13.0.6 / glob@10.4.5 (in node-gyp)
# - CVE-2025-64118 (tar): npm bundles vulnerable tar@7.5.1
# - GHSA-7r86-cg39-jmmj, GHSA-g3hv-75wg-m249 (minimatch ReDoS): npm bundles vulnerable minimatch@10.2.2
# - CVE-2026-33671 (picomatch Method Injection): npm bundles vulnerable picomatch@4.0.3 inside tinyglobby
# We download patched versions first, then replace all vulnerable ones
RUN cd /tmp && \
    npm pack glob@14.0.4 && \
    npm pack path-scurry@3.0.0 && \
    npm pack tar@7.5.22 && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    npm pack brace-expansion@5.0.12 && \
    npm pack @isaacs/nonrecursive-glob-match@1.1.0 && \
    npm pack minimatch@11.0.5 && \
    npm pack picomatch@4.0.7 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/path-scurry && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tar && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/nonrecursive-glob-match && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    tar -xzf glob-14.0.4.tgz && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/glob && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf package && \
    tar -xzf path-scurry-3.0.0.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/path-scurry && \
    tar -xzf tar-7.5.22.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tar && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/@isaacs && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    tar -xzf brace-expansion-5.0.12.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/brace-expansion && \
    tar -xzf isaacs-nonrecursive-glob-match-1.1.0.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/nonrecursive-glob-match && \
    tar -xzf minimatch-11.0.5.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.7.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    rm -rf /tmp/*

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# -----------------
# Stage 2: Production dependencies pruning
# -----------------
# Prune dev dependencies from the builder stage to get production-only node_modules
# This avoids running npm ci under QEMU emulation on ARM64 which causes illegal instruction errors
FROM builder AS deps

# Remove devDependencies to get production-only node_modules
# pnpm prune removes packages not listed in dependencies (keeps only production deps)
RUN pnpm prune --prod

# -----------------
# Stage 3: Runtime
# -----------------
FROM node:24-alpine AS runtime

WORKDIR /app

# Upgrade npm to latest version and patch its bundled glob, minimatch, brace-expansion, picomatch, and tar
RUN npm install -g npm@latest && \
    cd /tmp && \
    npm pack glob@14.0.4 && \
    npm pack path-scurry@3.0.0 && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    npm pack brace-expansion@5.0.12 && \
    npm pack @isaacs/nonrecursive-glob-match@1.1.0 && \
    npm pack minimatch@11.0.5 && \
    npm pack picomatch@4.0.7 && \
    npm pack tar@7.5.22 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/path-scurry && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/nonrecursive-glob-match && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf glob-14.0.4.tgz && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/glob && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf package && \
    tar -xzf path-scurry-3.0.0.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/path-scurry && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/@isaacs && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion && \
    tar -xzf brace-expansion-5.0.12.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/brace-expansion && \
    tar -xzf isaacs-nonrecursive-glob-match-1.1.0.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/@isaacs/nonrecursive-glob-match && \
    tar -xzf minimatch-11.0.5.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.7.tgz && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    tar -xzf tar-7.5.22.tgz && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tar && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tar && \
    rm -rf /tmp/*

# Install wrangler globally with security patches for its bundled dependencies
# Wrangler bundles vulnerable versions of glob, cross-spawn, brace-expansion, minimatch, ip-address, and undici
# We patch these by installing fixed versions that npm will use to satisfy wrangler's deps
RUN npm install -g wrangler@latest && \
    # Patch all globally installed packages' vulnerable dependencies (npm, wrangler)
    # Find and replace vulnerable minimatch versions
    find /usr/local/lib/node_modules -type d -name "minimatch" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                [7-9].*|10.*|11.0.0) \
                    parent_nm=$(dirname "$dir"); \
                    (cd /tmp && \
                     npm pack minimatch@11.0.5 && \
                     npm pack brace-expansion@5.0.12 && \
                     npm pack @isaacs/nonrecursive-glob-match@1.1.0 && \
                     tar -xzf minimatch-11.0.5.tgz && rm -rf "$dir"/* && cp -r /tmp/package/* "$dir/" && rm -rf /tmp/package && \
                     tar -xzf brace-expansion-5.0.12.tgz && rm -rf "$parent_nm/brace-expansion" && mv /tmp/package "$parent_nm/brace-expansion" && \
                     tar -xzf isaacs-nonrecursive-glob-match-1.1.0.tgz && mkdir -p "$parent_nm/@isaacs" && rm -rf "$parent_nm/@isaacs/nonrecursive-glob-match" && mv /tmp/package "$parent_nm/@isaacs/nonrecursive-glob-match" && \
                     rm -rf /tmp/*) ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable glob versions
    find /usr/local/lib/node_modules -type d -name "glob" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                9.*|1[0-3].*|14.0.[0-1]) \
                    parent_nm=$(dirname "$dir"); \
                    (cd /tmp && \
                     npm pack glob@14.0.4 && \
                     npm pack path-scurry@3.0.0 && \
                     tar -xzf glob-14.0.4.tgz && rm -rf "$dir"/* && cp -r /tmp/package/* "$dir/" && rm -rf /tmp/package && \
                     tar -xzf path-scurry-3.0.0.tgz && rm -rf "$parent_nm/path-scurry" && mv /tmp/package "$parent_nm/path-scurry" && \
                     rm -rf /tmp/*) ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable cross-spawn versions
    find /usr/local/lib/node_modules -type d -name "cross-spawn" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                7.0.[0-4]) \
                    (cd /tmp && npm pack cross-spawn@7.0.6 && tar -xzf cross-spawn-7.0.6.tgz) && \
                    rm -rf "$dir"/* && \
                    cp -r /tmp/package/* "$dir/" && \
                    rm -rf /tmp/cross-spawn-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable brace-expansion versions
    find /usr/local/lib/node_modules -type d -name "brace-expansion" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                2.0.0|2.0.1|2.0.2) \
                    (cd /tmp && npm pack brace-expansion@2.1.7 && tar -xzf brace-expansion-2.1.7.tgz) && \
                    rm -rf "$dir"/* && \
                    cp -r /tmp/package/* "$dir/" && \
                    rm -rf /tmp/brace-expansion-* /tmp/package ;; \
                5.0.7|5.0.8) \
                    (cd /tmp && npm pack brace-expansion@5.0.12 && tar -xzf brace-expansion-5.0.12.tgz) && \
                    rm -rf "$dir"/* && \
                    cp -r /tmp/package/* "$dir/" && \
                    rm -rf /tmp/brace-expansion-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable ip-address versions
    find /usr/local/lib/node_modules -type d -name "ip-address" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                10.2.0|10.2.1|10.[3-6].*|10.7.[0-4]) \
                    (cd /tmp && npm pack ip-address@10.7.6 && tar -xzf ip-address-10.7.6.tgz) && \
                    rm -rf "$dir"/* && \
                    cp -r /tmp/package/* "$dir/" && \
                    rm -rf /tmp/ip-address-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable undici versions
    find /usr/local/lib/node_modules -type d -name "undici" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                6.26.*|6.27.*|6.28.*|6.29.0) \
                    (cd /tmp && npm pack undici@6.29.1 && tar -xzf undici-6.29.1.tgz) && \
                    rm -rf "$dir"/* && \
                    cp -r /tmp/package/* "$dir/" && \
                    rm -rf /tmp/undici-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    npm cache clean --force

# Install runtime dependencies only
# Security Notes:
# - Application dependencies: pruned to production-only via pnpm prune --prod; overrides in pnpm-workspace.yaml pin minimatch@11.0.5, glob@14.0.4, tar@7.5.22, picomatch@4.0.7, cross-spawn@7.0.6, flatted@3.4.4, undici@7.30.1
# - Globally bundled dependencies (npm & wrangler): patched to glob@14.0.4 (with path-scurry@3.0.0), minimatch@11.0.5 (with brace-expansion@5.0.12 & @isaacs/nonrecursive-glob-match@1.1.0), @isaacs/brace-expansion@5.0.1, brace-expansion@2.1.7, tar@7.5.22, picomatch@4.0.7, cross-spawn@7.0.6, ip-address@10.7.6, and undici@6.29.1
# - Alpine system packages: nghttp2 (>=1.70.0, CVE-2026-58055) and musl/musl-utils (1.2.6-r6, CVE-2026-107891) are upgraded from Alpine edge/main; openssl (libcrypto3/libssl3), zlib, curl, and ca-certificates are upgraded from the Alpine repository
RUN apk add --no-cache nghttp2>=1.70.0 --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main && \
    apk add --no-cache \
    curl \
    ca-certificates && \
    apk upgrade --no-cache libcrypto3 libssl3 zlib && \
    apk upgrade --no-cache musl musl-utils --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main

# Create non-root user for security
# Note: Alpine Linux uses GID 1000 for 'users' group, so we use a different GID
RUN addgroup -g 1001 app && \
    adduser -D -u 1001 -G app app

# Copy package files (for reference only, deps already installed)
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy production dependencies from deps stage (already pruned to production-only)
# This avoids running npm ci under QEMU emulation which causes illegal instruction errors
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/wrangler.toml.example ./wrangler.toml.example

# Set ownership to non-root user
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose Wrangler dev server port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Default command: Run Wrangler in development mode
# Override with specific commands for production deployment
CMD ["wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]
