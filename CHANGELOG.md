# Changelog

All notable changes to this project will be documented in this file.

## [1.4.1] - 2026-03-02

### 🐛 Bug Fixes

#### Critical

- **hardware-detect.sh**: Remove `set -euo pipefail` to prevent parent shell corruption when sourced
- **hardware-detect.sh**: Fix N-series CPU regex with word boundaries to avoid false positives (e.g., "Xeon E5-2670N")
- **hardware-detect.sh**: Reorder encoder detection priority: NVIDIA NVENC → AMD AMF → Apple → Intel QuickSync
- **config.js**: Change HARDWARE_PROFILE from const to let to allow fallback reassignment on invalid profile
- **config.js**: Add 'autonomous' to TRUST_MODE validator to match onboard.sh wizard options
- **ollama/client.js**: Fix double http:// URL concatenation when OLLAMA_HOST already includes protocol
- **langgraph/checkpoint.js**: Fix incorrect require path from '../logger' to '../../logger'

#### Medium

- **hardware-detect.sh**: Add printf %q quoting for CPU_MODEL and CSTATE_FLAGS to handle spaces in CPU names
- **setup.sh**: Add FLAGS guard to prevent GRUB modification on non-N100 hardware
- **prometheus/prometheus.yml**: Change Ollama metrics endpoint from /api/tags to /metrics

#### Low

- **setup.sh**: Fix typo: rename has_quickysync() to has_quicksync() in fallback function
- **test-ai-stack.sh**: Add OLLAMA_DEFAULT_MODEL fallback chain for deprecated MODEL_CODING

### 📝 Documentation

- Add .markdownlint.json with linting rules for Markdown files
- Add audit/AUDIT_REPORT.md documenting comprehensive code audit findings
- Add plans/ to .gitignore

## [1.4.0] - 2026-03-01

### 🚀 Hardware-Agnostic Architecture (Major Feature)

- **New Hardware Detection Module** (`scripts/hardware-detect.sh`):
  - Comprehensive CPU detection supporting Intel N-series (N95/N97/N100/N200), Celeron, Core i3/i5/i7, AMD (Athlon, Ryzen), and ARM64 (Raspberry Pi, ARM servers)
  - QuickSync hardware acceleration detection
  - AVX2/AVX512 capability detection
  - TDP estimation for power management
  - GPU VRAM detection (NVIDIA, AMD ROCm, Apple Silicon, Intel iGPU)
  - Encoder type detection (quicksync, vaapi, nvenc, amf, videotoolbox)
  - C-state stability fix detection for N-series processors

- **Hardware Profile System**:
  - 14 hardware profiles: n100_like, celeron, core_i3, core_i5, core_i7, amd_low, amd_mid, amd_high, arm64_rpi5, arm64_server, nvidia_small, nvidia_medium, nvidia_large, apple_silicon
  - Profile-based circuit breaker thresholds (0.15 for N100 up to 0.40 for high-end GPUs)
  - Profile-based token budgets for context compression (2000 for RPi5 up to 32768 for GPU servers)

- **Updated `kilo/pipeline/src/config.js`**:
  - Added HARDWARE_PROFILE environment variable support with validation
  - Hardware-aware circuit breaker threshold based on profile
  - 14-profile threshold mapping for adaptive failure tolerance
  - Exported HARDWARE_PROFILE in config object

- **Updated `kilo/pipeline/src/services/ollama/circuitBreaker.js`**:
  - Profile-based thresholds with windowSize, failureThreshold, resetTimeout
  - Adaptive failure tolerance: conservative (0.15) for low-power, aggressive (0.40) for high-end
  - Integration with shared config module

- **Updated `kilo/pipeline/src/services/recovery/compressor.js`**:
  - Hardware-aware token budgets: 2000 (n100_like) to 32768 (nvidia_large)
  - Profile-based context compression limits
  - Removed N100-specific hardcoded values

### 🔧 Configuration Updates

- **Extended `config.env.template`**:
  - Added HARDWARE_PROFILE for pipeline constraints
  - Added GPU_VRAM_GB, ENCODER_TYPE for streaming hardware
  - Added PLEX_HW_ACCEL, PLEX_TRANSCODE_HW for Plex hardware transcoding
  - Added JELLYFIN_HW_ACCEL, JELLYFIN_TRANSCODE_HW for Jellyfin hardware transcoding
  - Added CPU_FAMILY, HAS_QUICKSYNC, HAS_AVX2, HAS_AVX512, TDP_WATTS, CSTATE_FLAGS

- **Updated `docker-compose.yml`**:
  - Added HARDWARE_PROFILE environment variable to kilo-pipeline service
  - Changed kilo-proxy port from 2375 to 2376 to avoid conflict with docker-proxy
  - Added PLEX_HW_ACCEL and PLEX_TRANSCODE environment variables to Plex service
  - Added devices mapping for DRI (GPU) access

- **Updated `setup.sh`**:
  - Added hardware detection module sourcing
  - Added config migration for existing installations (backward compatibility)
  - Dynamic C-state configuration based on CPU family
  - Default values for new hardware variables: GPU_VRAM_GB, ENCODER_TYPE, PLEX_HW_ACCEL, etc.

- **Updated `onboard.sh`**:
  - Integrated hardware detection module for comprehensive hardware profiling
  - Added QuickSync detection for Intel iGPU hardware acceleration
  - Added AVX2/AVX512 detection for Ollama optimization
  - Added encoder type selection for Plex/Jellyfin hardware transcoding
  - Added TDP display for power management
  - Added hardware profile display in summary

### 📚 Documentation Updates

- **Updated `README.md`**:
  - Rebranded from "Intel N100" to "Low-Power x86 Systems"
  - Added support for Intel N-series (N95/N97/N100/N200) and similar low-power processors
  - Updated hardware requirements to reflect broader compatibility
  - Updated architecture diagram with "Low-Power x86" branding
  - Added AI model recommendations for Intel N-series
  - Changed copyright to "Homelab Contributors"

- **New `plans/hardware-agnostic-refactor-plan.md`**: Detailed planning document for the hardware-agnostic architecture

### 🧹 Cleanup

- **Removed deprecated onboarding documents**:
  - Deleted `implementation_plan/homelab_onboarding_v3.docx`
  - Deleted `implementation_plan/homelab_onboarding_v5.docx`
  - Deleted `implementation_plan/homelab_onboarding_v6.docx`

- **Added new implementation plan**: `implementation_plan/openclaw_langgraph_crawl4ai_plan.docx`

### 🐛 Bug Fixes

- **Fixed Docker host port mismatch**: kilo-pipeline config now uses port 2376 to match docker-compose.yml
- **Fixed invalid hardware profile handling**: config.js now properly defaults to 'n100_like' for unknown profiles
- **Fixed ENCODER_TYPE not set**: onboard.sh now calls get_encoder_type() from hardware-detect.sh
- **Removed N100-specific hardcoding**: Replaced with profile-based configuration throughout

## [1.3.1] - 2026-02-28

### 🐛 Bug Fixes

- **config.env.template**: Added missing environment variables:
  - `PUID` and `PGID` for user permissions
  - `RENDER_GID` for GPU/VAAPI access (referenced in docker-compose.yml)
  - `NEXTCLOUD_DATA_PATH` for Nextcloud data location

- **setup.sh**: Fixed ANTIGRAVITY_VNC_PASSWORD logic to generate random password if not provided
- **setup.sh**: Removed duplicate comment for OpenClaw Token

- **docker-compose.yml**: Added healthchecks to docker-proxy and kilo-proxy services
- **docker-compose.yml**: Fixed service dependencies to use `service_healthy` instead of `service_started`

- **kilo/pipeline/src/services/ollama/client.js**: Fixed Ollama fallback URL from `host.docker.internal` to `ollama` for reliable internal DNS resolution

- **onboard-lib.sh**: Added automatic installation check for `bc` command to prevent hardware detection failures on minimal Ubuntu installations

## [1.3.0] - 2026-02-28

### 🚀 Onboarding Wizard (New Feature)

- **New `onboard.sh` Script**: Added a full-featured bash-based onboarding wizard (v6) that automatically:
  - Detects hardware (RAM, CPU cores, GPU type)
  - Classifies hardware into tiers (INSUFFICIENT, MINIMAL, LOW, MID, HIGH, ULTRA)
  - Selects optimal Ollama models based on available resources
  - Calculates performance tuning parameters (threads, GPU layers, flash attention)
  - Supports NVIDIA, AMD ROCm, Apple Silicon (Metal), and Intel iGPU
  - Generates `config.env` with all settings

- **New `onboard-lib.sh`**: Shared library with reusable functions for:
  - Hardware detection (RAM, CPU, GPU)
  - Speed classification
  - Model selection by tier
  - Performance calculations
  - Config file generation

- **New `onboard-hardware.sh`**: Isolated hardware detection module designed for unit testing

### 🔧 Configuration Improvements

- **Extended `config.env.template`**: Added 90+ new configuration options:
  - Hardware classification variables (SPEED_CLASS, RESOURCE_TIER)
  - Individual model selection (OLLAMA_DEFAULT_MODEL, OLLAMA_GENERAL_MODEL, OLLAMA_QUICK_MODEL)
  - Performance tuning (OLLAMA_NUM_THREADS, OLLAMA_NUM_GPU, OLLAMA_FLASH_ATTENTION, OLLAMA_METAL)
  - Context window sizes per role (OLLAMA_CTX_CODING, OLLAMA_CTX_GENERAL, OLLAMA_CTX_QUICK)
  - AI mode selection (local, hybrid, cloud-primary)
  - Trust modes (supervised, graduated, autonomous)
  - Legacy variable support for backward compatibility

- **Updated `docker-compose.yml`**: Added Ollama environment variables with proper defaults for all new parameters

- **Updated `setup.sh`**:
  - Now loads configuration from `config.env` (generated by onboard.sh)
  - Supports both new OLLAMA_*and legacy MODEL_* variable names
  - Enhanced OpenClaw v9 configuration with Kilo pipeline integration
  - Dynamic model routing based on role (architect, orchestrator, coding, planning, delegation)

### 🧪 Testing & Validation

- **Updated `test-ai-stack.sh`**:
  - Now sources configuration from `config.env`
  - Dynamic model validation based on configured models
  - Supports deduplication of model lists

- **Fixed Bash Compatibility**: Replaced ternary operators with if/else blocks for Bash 3.x compatibility

### 🤖 Kilo Pipeline Integration

- **Updated `kilo/pipeline/src/services/ollama/client.js`**: Now reads OLLAMA_DEFAULT_MODEL from environment with fallback to legacy MODEL_CODING

## [1.2.0] - 2026-02-26

### 🦾 Autonomous AI Pipeline (Kilo) - Phase 6

- **OpenClaw x Kilo Wiring**: Successfully linked OpenClaw to the Kilo v9 autonomous loop.
- **Task Delegation**: Implemented delegation rules in `openclaw.json` for writing code, implementing APIs, and fixing bugs.
- **Trust Modes**: Introduced `supervised`, `graduated`, and `autonomous` trust levels for fine-grained control over AI autonomy.
- **Observability**: Implemented `/metrics` endpoint in `kilo-pipeline` and provisioned a custom Grafana dashboard for pipeline performance.

### 🛡️ System Hardening & Resilience - Phase 7

- **Kill-Switch**: Added `OPENCLAW_KILO_ENABLED` environment variable to bypass the pipeline instantly in emergencies.
- **Script Resilience**:
  - `update.sh`: Added logic to drain `writer_retry` queues and verify service health post-update.
  - `backup-homelab.sh`: Integrated `/var/kilo` path and Qdrant vector backups.
- **Automated Provisioning**: `setup.sh` now automates the creation of `/var/kilo` hierarchy and invariant files.
- **Disk Alerting**: Added Prometheus/Grafana alerts for `/var/kilo` partitioning and filesystem health.

### 📓 Obsidian & RAG Integration - Phase 8

- **Nextcloud Vault Sync**: Architected a dual-access vault system where Obsidian notes live in Nextcloud (`~/homelab/nextcloud/data/admin/files/Obsidian`).
- **AnythingLLM Integration**: Deployed AnythingLLM for Retrieval-Augmented Generation (RAG) over the Obsidian vault, linked to local Ollama embeddings.
- **Browser-based Editing**: Deployed `linuxserver/obsidian` with KasmVNC security hardening and Traefik SSL routing.
- **Resource Constraints**: Applied 2GB RAM and 1.5 CPU limits to all productivity containers to ensure N100 stability.

## [1.1.0] - 2026-02-19

### 🚀 Massive Architectural Expansion

- **ONLYOFFICE & Nextcloud Integration**: Added a fully integrated, self-hosted office suite. Nextcloud acts as the file hub and AI Assistant, while ONLYOFFICE provides professional document editing.
- **Homepage Dashboard**: Added central service dashboard (`ghcr.io/gethomepage/homepage`) with Docker auto-discovery and service widgets (Plex, Jellyfin, Ollama, etc.).
- **Nextcloud AI Assistant**: Pre-configured to bridge with the local Ollama instance for secure, private AI document analysis.
- **Jellyfin Media Server**: Integrated Jellyfin as a high-performance, open-source alternative to Plex, featuring full Intel QuickSync hardware acceleration support for the N100.
- **Advanced Reverse Proxy Support**: Implemented specialized Traefik headers for ONLYOFFICE and Nextcloud to support seamless iframe embedding and CORS safety.
- **Enhanced Monitoring**: Refined Jellyfin health checks and Ollama RAM optimization.

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
