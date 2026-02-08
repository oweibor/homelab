# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
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
