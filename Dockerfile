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
# - CVE-2025-64756 (glob): npm bundles vulnerable glob@11.0.3 and glob@10.4.5 (in node-gyp)
# - CVE-2025-64118 (tar): npm bundles vulnerable tar@7.5.1
# - GHSA-7r86-cg39-jmmj (minimatch ReDoS): npm bundles vulnerable minimatch@10.2.2
# - CVE-2026-33671 (picomatch Method Injection): npm bundles vulnerable picomatch@4.0.3 inside tinyglobby
# We download patched versions first, then replace all vulnerable ones
RUN cd /tmp && \
    npm pack glob@11.1.0 && \
    npm pack tar@7.5.13 && \
    npm pack minimatch@10.2.5 && \
    npm pack picomatch@4.0.4 && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tar && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    tar -xzf glob-11.1.0.tgz && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/glob && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules && \
    cp -r package /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob && \
    rm -rf package && \
    tar -xzf tar-7.5.13.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tar && \
    tar -xzf minimatch-10.2.5.tgz && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.4.tgz && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    rm -rf /tmp/*

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# -----------------
# Stage 2: Production dependencies pruning
# -----------------
# Prune dev dependencies from the builder stage to get production-only node_modules
# This avoids running npm ci under QEMU emulation on ARM64 which causes illegal instruction errors
FROM builder AS deps

# Remove devDependencies to get production-only node_modules
# npm prune removes packages not listed in dependencies (keeps only production deps)
RUN npm prune --omit=dev && \
    npm cache clean --force

# -----------------
# Stage 3: Runtime
# -----------------
FROM node:24-alpine AS runtime

WORKDIR /app

# Upgrade npm to latest version and patch its bundled minimatch and picomatch
RUN npm install -g npm@latest && \
    cd /tmp && npm pack minimatch@10.2.5 && npm pack picomatch@4.0.4 && \
    tar -xzf minimatch-10.2.5.tgz && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    mv package /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    tar -xzf picomatch-4.0.4.tgz && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules && \
    mv package /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch && \
    rm -rf /tmp/*

# Install wrangler globally with security patches for its bundled dependencies
# Wrangler bundles vulnerable versions of glob, cross-spawn, and brace-expansion
# We patch these by installing fixed versions that npm will use to satisfy wrangler's deps
RUN npm install -g wrangler@latest && \
    # Patch wrangler's bundled vulnerable dependencies
    cd /usr/local/lib/node_modules/wrangler && \
    # Find and replace vulnerable glob versions
    find . -type d -name "glob" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                10.4.*|10.3.*|10.2.*) \
                    rm -rf "$dir"/* && \
                    cd /tmp && npm pack glob@10.5.0 && tar -xzf glob-10.5.0.tgz && \
                    cp -r package/* "$dir/" && rm -rf /tmp/glob-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable cross-spawn versions
    find . -type d -name "cross-spawn" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                7.0.[0-4]) \
                    rm -rf "$dir"/* && \
                    cd /tmp && npm pack cross-spawn@7.0.6 && tar -xzf cross-spawn-7.0.6.tgz && \
                    cp -r package/* "$dir/" && rm -rf /tmp/cross-spawn-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    # Find and replace vulnerable brace-expansion versions
    find . -type d -name "brace-expansion" -path "*/node_modules/*" | while read dir; do \
        if [ -f "$dir/package.json" ]; then \
            version=$(grep -o '"version": *"[^"]*"' "$dir/package.json" | head -1 | cut -d'"' -f4); \
            case "$version" in \
                2.0.0|2.0.1|2.0.2) \
                    rm -rf "$dir"/* && \
                    cd /tmp && npm pack brace-expansion@2.1.0 && tar -xzf brace-expansion-2.1.0.tgz && \
                    cp -r package/* "$dir/" && rm -rf /tmp/brace-expansion-* /tmp/package ;; \
            esac; \
        fi; \
    done && \
    npm cache clean --force

# Install runtime dependencies only
# Security Notes:
# - curl 8.14.1-r2 has CVE-2025-10966 (MEDIUM) with no fix available yet (Alpine base package)
# - busybox 1.37.0-r19 has CVE-2025-46394 & CVE-2024-58251 (LOW) with no fixes available yet (Alpine base package)
# Alpine base package vulnerabilities (curl, busybox) are accepted risks with no available patches
RUN apk add --no-cache \
    curl \
    ca-certificates

# Create non-root user for security
# Note: Alpine Linux uses GID 1000 for 'users' group, so we use a different GID
RUN addgroup -g 1001 app && \
    adduser -D -u 1001 -G app app

# Copy package files (for reference only, deps already installed)
COPY package*.json ./

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
