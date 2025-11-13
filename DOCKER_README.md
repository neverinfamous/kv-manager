# KV Manager - Docker Edition

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/kv--manager-blue?logo=github)](https://github.com/neverinfamous/kv-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/kv-manager)](https://hub.docker.com/r/writenotenow/kv-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/kv-manager/blob/main/SECURITY.md)

**Version:** 1.0.0 | **Last Updated:** November 14, 2025 
**Base Image:** Node.js 22-alpine | **Architecture:** linux/amd64, linux/arm64

A fully containerized version of the KV Manager for Cloudflare. This Docker image provides a modern, full-featured web application for managing Cloudflare Workers KV namespaces and keys with enterprise-grade authentication via Cloudflare Access (Zero Trust).

**🎯 [Try the Live Demo](https://kv.adamic.tech/)** - See KV Manager in action

**📰 [Read the v1.0.0 Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)** - Learn more about features, architecture, and deployment

**🚀 Docker Deployment:** Run the development server in a containerized environment for testing and local development.

---

## 🐳 Quick Start

### Pull and Run

Pull the latest image:

```bash
docker pull writenotenow/kv-manager:latest
```

Run with environment variables:

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

Access the application at `http://localhost:8787`

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    container_name: kv-manager
    ports:
      - "8787:8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Create a `.env` file:

```env
ACCOUNT_ID=your_cloudflare_account_id
API_KEY=your_cloudflare_api_token
TEAM_DOMAIN=https://yourteam.cloudflareaccess.com
POLICY_AUD=your_cloudflare_access_aud_tag
```

Run with Docker Compose:

```bash
docker-compose up -d
```

---

## 🎯 What's Included

This Docker image packages the complete KV Manager with:

### Core Features
- **Namespace Management** - Create, delete, rename, and browse KV namespaces with key counts
- **Key Operations** - Full CRUD operations with cursor-based pagination and TTL management
- **Metadata & Tags (D1-Backed)** - Unlimited tags and custom JSON metadata (no size limit)
- **Search & Discovery** - Cross-namespace search by key name with tag filtering
- **Bulk Operations** - Bulk delete, copy, TTL update, and tag operations with real-time WebSocket progress tracking
- **Operation cancellation** - Job cancelation support for bulk operations
- **Import/Export** - JSON/NDJSON format support with collision handling and live progress updates
- **Async Processing** - Background job execution via Durable Objects for large operations
- **Backup & Restore** - Single-version backup and restore for keys
- **Job History UI** - View complete history of all bulk operations with event timeline visualization, filtering by status and operation type
- **Audit Logging** - Track all operations with user attribution and CSV export
- **Job Event Tracking** - Comprehensive lifecycle event logging (started, 25%, 50%, 75%, completed/failed/cancelled) for all bulk operations
- **Dark/Light Themes** - System-aware theme switching with persistence
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

### Authentication
- **Cloudflare Access (Zero Trust)** - Enterprise-grade authentication with JWT validation
- **Session Management** - Automatic token refresh and secure session handling
- **Local Development Mode** - Authentication bypassed for localhost

### Technical Stack
- React 19.2.0 with TypeScript 5.9.3
- Vite 7.2.2 for optimized production builds
- Tailwind CSS + shadcn/ui for modern UI
- Cloudflare Workers runtime for serverless API
- D1 database for metadata and audit logs
- Durable Objects for orchestration and WebSocket management
- WebSocket connections for real-time progress updates with HTTP polling fallback

---

## 📋 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ACCOUNT_ID` | Your Cloudflare Account ID | `a1b2c3d4e5f6g7h8i9j0` |
| `API_KEY` | Cloudflare API Token with KV Edit permissions | `abc123...xyz789` |
| `TEAM_DOMAIN` | Cloudflare Access team domain | `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Cloudflare Access Application Audience (AUD) tag | `abc123def456...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the application listens on | `8787` |
| `NODE_ENV` | Node environment (production/development) | `production` |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |

---

## 🔧 Configuration Guide

### 1. Set Up Metadata Database

The KV Manager requires a metadata database to store tags, custom metadata, and audit logs.

Login to Wrangler:

```bash
npx wrangler login
```

Create the metadata database:

```bash
npx wrangler d1 create kv-manager-metadata
```

Clone the repository to get schema.sql:

```bash
git clone https://github.com/neverinfamous/kv-manager.git
cd kv-manager
```

Initialize the schema:

```bash
npx wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

### 2. Get Your Cloudflare Account ID

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to any page in your account
3. Copy the Account ID from the URL: `dash.cloudflare.com/{ACCOUNT_ID}/...`

### 3. Create a Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → **Create Custom Token**
3. Set the following permissions:
   - **Account** → **Workers KV Storage** → **Edit**
   - **Account** → **D1** → **Edit**
4. Click **Continue to summary** → **Create Token**
5. Copy the token (it won't be shown again)

### 4. Set Up Cloudflare Access (Zero Trust)

1. Navigate to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Go to **Settings → Authentication**
3. Add GitHub as an identity provider (or use another provider)
4. Create a new Access Application:
   - **Application Type:** Self-hosted
   - **Application Domain:** Your domain where KV Manager will be accessible
   - **Session Duration:** As per your security requirements
5. Configure Access Policies (e.g., allow users from your GitHub organization)
6. Copy the **Application Audience (AUD) tag** from the application settings

### 5. Note Your Team Domain

Your team domain is in the format: `https://yourteam.cloudflareaccess.com`

You can find it in the Zero Trust dashboard under **Settings → Custom Pages**

---

## 🚀 Deployment Options

### Docker Run

**Standard deployment:**
```bash
docker run -d \
  -p 8787:8787 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name kv-manager \
  --restart unless-stopped \
  writenotenow/kv-manager:latest
```

**With custom port:**
```bash
docker run -d \
  -p 3000:8787 \
  -e PORT=8787 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name kv-manager \
  writenotenow/kv-manager:latest
```

**With logging enabled:**
```bash
docker run -d \
  -p 8787:8787 \
  -e LOG_LEVEL=debug \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  --name kv-manager \
  writenotenow/kv-manager:latest
```

### Docker Compose

**Production deployment with health checks:**
```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    container_name: kv-manager
    ports:
      - "8787:8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
      - LOG_LEVEL=info
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - kv-network

networks:
  kv-network:
    driver: bridge
```

**Behind a reverse proxy (Nginx/Traefik):**
```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    container_name: kv-manager
    expose:
      - "8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kv-manager.rule=Host(`kv.yourdomain.com`)"
      - "traefik.http.routers.kv-manager.entrypoints=websecure"
      - "traefik.http.routers.kv-manager.tls.certresolver=myresolver"
    networks:
      - proxy-network

networks:
  proxy-network:
    external: true
```

### Kubernetes

**Basic deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kv-manager
  labels:
    app: kv-manager
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kv-manager
  template:
    metadata:
      labels:
        app: kv-manager
    spec:
      containers:
      - name: kv-manager
        image: writenotenow/kv-manager:latest
        ports:
        - containerPort: 8787
        env:
        - name: ACCOUNT_ID
          valueFrom:
            secretKeyRef:
              name: kv-manager-secrets
              key: account-id
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: kv-manager-secrets
              key: api-key
        - name: TEAM_DOMAIN
          valueFrom:
            secretKeyRef:
              name: kv-manager-secrets
              key: team-domain
        - name: POLICY_AUD
          valueFrom:
            secretKeyRef:
              name: kv-manager-secrets
              key: policy-aud
        livenessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: kv-manager
spec:
  selector:
    app: kv-manager
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8787
  type: LoadBalancer
---
apiVersion: v1
kind: Secret
metadata:
  name: kv-manager-secrets
type: Opaque
stringData:
  account-id: "your_account_id"
  api-key: "your_api_token"
  team-domain: "https://yourteam.cloudflareaccess.com"
  policy-aud: "your_aud_tag"
```

---

## 🔍 Health Checks

The container includes a health endpoint at `/health` that returns:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2025-11-05T12:00:00.000Z"
}
```

Use this endpoint for:
- Docker health checks
- Load balancer health probes
- Kubernetes liveness/readiness probes
- Monitoring and alerting systems

---

## 📊 Container Specifications

### Image Details
- **Base Image:** `node:22-alpine`
- **Size:** ~150MB (compressed)
- **Architecture:** `linux/amd64`, `linux/arm64`
- **Exposed Ports:** `8787`
- **User:** Non-root user (`app`)
- **Working Directory:** `/app`

### Performance
- **Startup Time:** ~2-3 seconds
- **Memory Usage:** 50-100MB (idle)
- **CPU Usage:** Minimal (event-driven)

### Security Features
- Runs as non-root user
- No shell utilities in minimal Alpine base
- Environment-based secret management
- JWT validation for all API requests
- CORS protection enabled
- Rate limiting (configurable)

---

## 🔐 Security Best Practices

### 1. Use Docker Secrets (Docker Swarm)

Create the secrets:

```bash
echo "your_account_id" | docker secret create kv_account_id -
```

```bash
echo "your_api_token" | docker secret create kv_api_key -
```

```bash
echo "https://yourteam.cloudflareaccess.com" | docker secret create kv_team_domain -
```

```bash
echo "your_aud_tag" | docker secret create kv_policy_aud -
```

Deploy with secrets:

```bash
docker service create \
  --name kv-manager \
  --publish 8787:8787 \
  --secret kv_account_id \
  --secret kv_api_key \
  --secret kv_team_domain \
  --secret kv_policy_aud \
  writenotenow/kv-manager:latest
```

### 2. Use Kubernetes Secrets

Create the secret:

```bash
kubectl create secret generic kv-manager-secrets \
  --from-literal=account-id='your_account_id' \
  --from-literal=api-key='your_api_token' \
  --from-literal=team-domain='https://yourteam.cloudflareaccess.com' \
  --from-literal=policy-aud='your_aud_tag'
```

### 3. Restrict Network Access

Docker Compose with network isolation:

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    networks:
      - backend
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    networks:
      - backend
      - frontend

networks:
  backend:
    internal: true
  frontend:
    driver: bridge
```

### 4. Enable Read-Only Root Filesystem

```bash
docker run -d \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /app/tmp \
  -p 8787:8787 \
  -e ACCOUNT_ID=your_account_id \
  -e API_KEY=your_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_aud_tag \
  writenotenow/kv-manager:latest
```

---

## 🐞 Troubleshooting

### Container Won't Start

Check the logs:

```bash
docker logs kv-manager
```

**Common issues:**
- Missing required environment variables
- Invalid API token or Account ID
- Port already in use

**Solution:**

Verify environment variables:

```bash
docker inspect kv-manager | grep -A 10 Env
```

Check if port is available:

```bash
netstat -tuln | grep 8787
```

Restart with correct variables:

```bash
docker rm -f kv-manager
docker run -d [correct options] writenotenow/kv-manager:latest
```

### Authentication Failures

**Symptoms:**
- Redirect loops
- "Failed to authenticate" errors
- 401/403 responses

**Check:**
1. Verify `TEAM_DOMAIN` includes `https://`
2. Confirm `POLICY_AUD` matches your Access application
3. Ensure your user is allowed in Access policies
4. Check if API token has **KV Edit** and **D1 Edit** permissions

Check authentication logs:

```bash
docker logs kv-manager | grep -i "auth\|jwt\|access"
```

### KV Operations Fail

**Symptoms:**
- "Failed to list namespaces" error
- Operations timeout
- 500 errors

**Check:**
1. Verify `ACCOUNT_ID` is correct
2. Confirm `API_KEY` has KV Edit and D1 Edit permissions
3. Check Cloudflare API status
4. Verify KV namespaces exist in your account

Test the API token:

```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"
```

### High Memory Usage

Check container stats:

```bash
docker stats kv-manager
```

Set memory limits:

```bash
docker run -d \
  --memory="512m" \
  --memory-swap="512m" \
  [other options] \
  writenotenow/kv-manager:latest
```

### Networking Issues

**Cannot access from host:**

Check if container is running:

```bash
docker ps | grep kv-manager
```

Check port mapping:

```bash
docker port kv-manager
```

Test connectivity:

```bash
curl http://localhost:8787/health
```

**Cannot access from other containers:**

Ensure containers are on the same network:

```bash
docker network inspect bridge
```

Create custom network:

```bash
docker network create kv-network
```

Run with custom network:

```bash
docker run --network kv-network [other options] writenotenow/kv-manager:latest
```

---

## 📈 Monitoring and Logging

### Docker Logs

Follow logs in real-time:

```bash
docker logs -f kv-manager
```

View last 100 lines:

```bash
docker logs --tail 100 kv-manager
```

View logs since 1 hour ago:

```bash
docker logs --since 1h kv-manager
```

### Log Aggregation

Using Docker logging driver:

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Forward to syslog:

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    logging:
      driver: syslog
      options:
        syslog-address: "tcp://192.168.0.42:514"
        tag: "kv-manager"
```

### Container Stats

View real-time stats:

```bash
docker stats kv-manager
```

View stats for all containers:

```bash
docker stats
```

---

## 🔄 Updates and Maintenance

### Updating to Latest Version

Pull latest image:

```bash
docker pull writenotenow/kv-manager:latest
```

Stop and remove old container:

```bash
docker stop kv-manager
docker rm kv-manager
```

Start new container with same configuration:

```bash
docker run -d [same options as before] writenotenow/kv-manager:latest
```

### Using Docker Compose

Pull latest images:

```bash
docker-compose pull
```

Restart services:

```bash
docker-compose up -d
```

### Version Pinning (Recommended for Production)

Pin to a specific version:

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:1.0.0
    # ... rest of configuration
```

### Automated Updates with Watchtower

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    # ... your configuration

  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 kv-manager
```

---

## 🏗️ Building from Source

If you want to build the Docker image yourself:

### Clone the Repository

```bash
git clone https://github.com/neverinfamous/kv-manager.git
cd kv-manager
```

### Build the Image

Build for your platform:

```bash
docker build -t kv-manager:local .
```

Build for multiple platforms:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t kv-manager:local .
```

### Dockerfile Reference

The Dockerfile uses a multi-stage build for optimal size:

1. **Build Stage** - Compiles TypeScript and bundles React app with Vite
2. **Production Stage** - Copies only production artifacts to minimal Alpine image

**Key features:**
- Minimal attack surface with Alpine Linux
- Non-root user execution
- Optimized layer caching
- Health check integration
- Environment variable validation

---

## 📋 Available Tags

| Tag | Description | Use Case |
|-----|-------------|----------|
| `latest` | Latest stable release from main branch | Development/Testing |
| `v1.0.0` | Specific version number (matches README version) | Production (recommended) |
| `sha-XXXXXX` | Short commit SHA (12 chars) | Reproducible builds and security audits |

---

## 🌐 Reverse Proxy Examples

### Nginx

```nginx
server {
    listen 80;
    server_name kv.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kv.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://kv-manager:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Traefik

```yaml
version: '3.8'

services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    networks:
      - traefik-network
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kv.rule=Host(`kv.yourdomain.com`)"
      - "traefik.http.routers.kv.entrypoints=websecure"
      - "traefik.http.routers.kv.tls=true"
      - "traefik.http.routers.kv.tls.certresolver=letsencrypt"
      - "traefik.http.services.kv.loadbalancer.server.port=8787"

networks:
  traefik-network:
    external: true
```

### Caddy

```caddyfile
kv.yourdomain.com {
    reverse_proxy kv-manager:8787
}
```

---

## 📚 Additional Resources

### Documentation
- **Main Documentation:** [GitHub Repository](https://github.com/neverinfamous/kv-manager)
- **Cloudflare KV:** [Workers KV Documentation](https://developers.cloudflare.com/kv/)
- **Cloudflare D1:** [D1 Documentation](https://developers.cloudflare.com/d1/)
- **Cloudflare Access:** [Zero Trust Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- **Docker Documentation:** [Docker Docs](https://docs.docker.com/)

### Support
- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/kv-manager/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/neverinfamous/kv-manager/discussions)
- 📧 **Email:** admin@adamic.tech

### Community
- **Docker Hub:** [Image Repository](https://hub.docker.com/r/writenotenow/kv-manager)
- **GitHub:** [Source Code](https://github.com/neverinfamous/kv-manager)
- **License:** [MIT License](https://github.com/neverinfamous/kv-manager/blob/main/LICENSE)

---

## 🤝 Contributing

We welcome contributions! See the [CONTRIBUTING.md](https://github.com/neverinfamous/kv-manager/blob/main/CONTRIBUTING.md) guide for details.

---

## 📄 License

MIT License - see [LICENSE](https://github.com/neverinfamous/kv-manager/blob/main/LICENSE) file for details

---

## ⭐ Show Your Support

If you find this project useful, please consider giving it a star on GitHub!

---

**Made with ❤️ for the Cloudflare and Docker communities**

