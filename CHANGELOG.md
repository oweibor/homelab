# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
