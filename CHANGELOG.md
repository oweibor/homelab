# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
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
- **Reverse Proxy**: Added Traefik with self-signed SSL support for secure local access (`https://*.homelab.local`).
- **Dashboard**: Added Traefik dashboard for service monitoring.
- `config.env.template` for easy user configuration.
- Robust error handling and network safety checks in setup script.

### Security
- 🔒 Traefik dashboard now secured with basic authentication
- ✅ Environment variable validation prevents incomplete deployments
- 📅 SSL certificate monitoring with expiry warnings
