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
- `config.env.template` for easy user configuration.
- Robust error handling and network safety checks in setup script.
