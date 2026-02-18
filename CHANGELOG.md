# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.0] - 2026-02-18

### 🔐 Security Overhaul
- **Zero-Trust Docker Architecture**: Finalized 100% isolation of the Docker socket. Application containers (Traefik, OpenClaw) use a read-only proxy, and high-privilege services (Watchtower) are now migrated to a dedicated write-proxy.
- **Dedicated Watchtower Proxy**: introduced `docker-proxy-watchtower` with scoped `POST` and `IMAGES` permissions on a private `watchtower-net` network.
- **NetBird Management Correction**: Fixed environment variable casing (`mgmt` -> `MGMT`), resolved the port 443 conflict with Traefik by mapping API to 33071, and explicitly exposed gRPC port 33073.
- **Setup Script Hardening**: Improved variable persistence in `setup.sh` by ensuring all generated credentials (Samba, n8n, OpenClaw) are correctly sourced and available in the script context. Enforced strict `600` permissions on all sensitive environment files.

### 🛡️ Traefik Security (Phase 4)
- **Automatic HTTPS**: Wildcard SSL certificates via `mkcert` and Traefik.
- **Secure Headers**: Global OWASP-compliant headers (HSTS, CSP-lite, X-Frame-Options) applied to all services.
- **Restricted Socket Access**: Traefik migrated to `docker-proxy`.
- **mkcert Locally-Trusted SSL**: Replaced OpenSSL self-signed certs with mkcert. Generates wildcard `*.homelab.local` certificates trusted by the host OS — **zero browser warnings**. Includes OpenSSL fallback for air-gapped environments. Client CA export script (`scripts/export-ca.sh`) for trusting certs on phones and laptops.
- **Global Security Headers**: Applied OWASP Top 5 security headers to all Traefik-proxied services:
  - `Strict-Transport-Security` (HSTS, 2 years with preload)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` (anti-clickjacking)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### 🌐 NetBird (Replaces Tailscale)
- **Self-Hosted Mesh VPN**: Complete NetBird stack (Management, Signal, Dashboard, Coturn) running locally.
- **Embedded IdP**: Zero cloud dependency. Authentication is handled by the local management server.
- **Local Dashboard**: Full management UI at `https://netbird.homelab.local`.
> **Note**: Remote access from outside the LAN requires port forwarding and a public domain. Defined setup is for **local mesh networking only**.

### 🤖 AI Integration (New)
- **OpenClaw**: Fully configured autonomous agent.
  - **Model Routing**: `qwen2.5-coder:3b` (Coding), `llama3.2:3b` (General Skills).
  - **Smart Home**: Integrated with Home Assistant via Long-Lived Access Token.
  - **Status Check**: New verification script `scripts/test-ai-stack.sh`.
  - **Critical Fix**: Corrected directory structure to single volume (`./openclaw` -> `/home/node/.openclaw`) to match internal agent layout.

### 📊 Observability Stack (Enhanced)
- **Configuration Generation**: `setup.sh` now automatically generates `prometheus.yml` and Grafana provisioning files.
- **Metrics**: Default scrape targets configured for Docker containers.

### 📊 Observability Stack
- **Prometheus**: Metrics collection engine with 30-day retention. Scrapes Traefik, cAdvisor, node-exporter, and Ollama.
- **Grafana**: Beautiful metrics dashboards at `grafana.homelab.local`. Pre-provisioned with Prometheus datasource and a custom "Homelab Infrastructure Overview" dashboard (CPU/memory per container, host gauges, network traffic, Traefik request rates).
- **cAdvisor**: Container-level resource metrics (CPU, memory, network, disk I/O per container).
- **Node Exporter**: Host-level system metrics (CPU, memory, disk, network).
- **Traefik Metrics**: Enabled Prometheus metrics endpoint on port 8082 for request rate and latency tracking.

### 🤖 AI Orchestration
- **Kilo CLI**: Agentic AI orchestration from the terminal. Setup script installs Node.js 20 LTS and `@kilocode/cli` globally. Leverages local Ollama for private, offline AI agent workflows.

### Added
- **Reliability & Health Monitoring**:
  - Native Docker healthchecks for all bridge network services (Ollama, n8n, etc.)
  - Traefik service healthchecks for host-networked services (Home Assistant, Plex)
  - Real-time "Healthy" status mapping in Traefik to prevent "Bad Gateway" errors
- **Automated Backup Strategy**:
  - Weekly automated backup script (`backup-homelab.sh`) with 4-week rotation
  - Integration with `crontab` via `setup.sh` (Sundays at 2 AM)
- **Security Hardening**:
  - Docker Socket Proxy implementation to mitigate container escape risks for AI agents
  - Granular permission control (RO socket access) for OpenClaw
- **Infrastructure Enhancements**:
  - Automated HACS (Home Assistant Community Store) installation in `setup.sh`
  - Explicit client-side domain mapping documentation and commands
  - Enhanced system architecture Mermaid diagrams in README
- **AI Development Tools**:
  - Antigravity: Google's agent-first code editor (VNC/web access at port 6080)
  - OpenClaw: AI coding agent with sandboxed Docker execution
- **UI Enhancements**:
  - Fancy Braille spinner animation during long operations
  - Progress bar with percentage indicator
  - Box-styled step headers for better visual organization
  - Success banners for completed steps
- **Security Enhancements**:
  - Traefik dashboard now requires authentication (default: admin/admin)
  - Environment variable validation in setup script
  - SSL certificate expiry monitoring script (`check-ssl-expiry.sh`)
  - `.env.example` file with all required variables documented
- **Maintenance Tools**:
  - `update.sh` script for easy service updates
  - Comprehensive troubleshooting section in README
  - Security documentation with credential management
  - Certificate renewal instructions
- Initial release of the automated homelab setup script (`setup.sh`).
- Docker Compose stack including:
    - Watchtower
    - Home Assistant (Host Mode)
    - Plex (Hardware Transcoding enabled)
    - Ollama (Llama 3.2 1b & 3b pre-configured)
    - Open WebUI
    - n8n
    - Samba
    - Traefik (Reverse Proxy)
    - Antigravity (Code Editor)
    - OpenClaw (AI Agent)
- **Reverse Proxy**: Added Traefik with self-signed SSL support for secure local access (`https://*.homelab.local`).
- **Dashboard**: Added Traefik dashboard for service monitoring.
- `config.env.template` for easy user configuration.
- Robust error handling and network safety checks in setup script.

### Security
- 🔒 Traefik dashboard now secured with basic authentication
- ✅ Environment variable validation prevents incomplete deployments
- 📅 SSL certificate monitoring with expiry warnings
