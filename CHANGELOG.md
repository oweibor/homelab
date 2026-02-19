# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-19

### 🚀 Massive Architectural Expansion
- **ONLYOFFICE & Nextcloud Integration**: Added a fully integrated, self-hosted office suite. Nextcloud acts as the file hub and AI Assistant, while ONLYOFFICE provides professional document editing.
- **Nextcloud AI Assistant**: Pre-configured to bridge with the local Ollama instance for secure, private AI document analysis.
- **Jellyfin Media Server**: Integrated Jellyfin as a high-performance, open-source alternative to Plex, featuring full Intel QuickSync hardware acceleration support for the N100.
- **Advanced Reverse Proxy Support**: Implemented specialized Traefik headers for ONLYOFFICE and Nextcloud to support seamless iframe embedding and CORS safety.

### 🛡️ Security & Performance Optimizations
- **Global Frame Protection Update**: Relaxed `frameDeny` from `true` to `SAMEORIGIN` in the global `secure-headers` middleware. This correctly unblocks Home Assistant and n8n internal iframes while still preventing third-party clickjacking.
- **Environment Synchronization**: `setup.sh` now persists `ACTUAL_USER` in `.env`, resolving critical path resolution issues for Nextcloud data volumes.
- **Ollama Memory Optimization**: Added `OLLAMA_KEEP_ALIVE=5m` to ensure large AI models are unloaded from system RAM after 5 minutes of inactivity, maximizing performance on low-power hardware.

### 🔧 Fixes
- **ONLYOFFICE Connectivity**: Fixed a critical typo in the `StorageUrl` configuration that prevented document updates from saving back to Nextcloud.
- **Jellyfin Accessibility**: Added host port mapping for `8096` to allow direct access during initial setup before Traefik is fully configured.
- **Template Cleanup**: Removed orphaned `N8N_USER` and `N8N_PASS` variables from `.env.example`.
- **Config Resiliency**: Consolidated all TLS store configurations into `dynamic.yaml` for a cleaner separation from static Traefik infrastructure.


### 🔧 Fixes
- **OpenClaw Environment**: Updated `OLLAMA_API_BASE` to `OLLAMA_HOST` for correct agent identification.
- **OpenClaw Network**: Standardized internal and external ports to `18789` for consistent routing, healthchecks, and setup summary.
- **NetBird Management**: Resolved double TLS termination. The container now listens on HTTP (Port 80) internally, with Traefik handling SSL termination exclusively.
- **open-webui**: Pinned image to stable release `v0.8.3` to prevent unplanned breaking changes from the `:main` tag.
- **n8n Modernization**: Pruned orphaned `N8N_USER` and `N8N_PASS` variables from the setup logic as credentials are now managed in-app.
- **Infrastructure Persistence**: Standardized the monitoring stack (Grafana/Prometheus) with local bind mounts for consistent data management.
- **NetBird Signal**: Moved behind Traefik with gRPC (`h2c`) support on `netbird.homelab.local`, removing direct port exposure for better security.
- **Samba Networking**: Corrected port 139 mapping from UDP to TCP for NetBIOS Session service compatibility.

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
