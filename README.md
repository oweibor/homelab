# N100 Homelab Setup

A comprehensive, automated setup script and Docker stack for deploying a self-hosted homelab on an Intel N100 (or similar) mini-PC running Ubuntu Server 24.04+.

## Features

*   **Automated System Config**: configuring static IP, DNS, and system optimizations (C-states, CPU governor) for Intel N100 efficiency.
*   **Docker Stack**: Pre-configured `docker-compose.yml` for core services.
*   **Security**: Automatic firewall configuration, secure credential generation for services.
*   **Hardware Acceleration**: Configures Intel QuickSync for Plex transcoding.

### Included Services

*   **Home Assistant**: Home automation core (Host mode).
*   **Plex**: Media server with hardware transcoding (Host mode).
*   **Ollama**: Local LLM inference server (GPU enabled where supported).
*   **Open WebUI**: User-friendly chat interface for Ollama.
*   **n8n**: Workflow automation tool.
*   **Samba**: Network file sharing for media.
*   **Watchtower**: Automated container updates.

## Requirements

*   **Hardware**: Any PC with at least 4 cores, 8GB+ RAM, 128GB+ Storage.
*   **OS**: Ubuntu Server 24.04 LTS (fresh install recommended).
*   **User**: Root access (sudo) required.

## Quick Start

1.  **Clone or Download** this repository to your machine.
2.  **Configure Environment**:
    ```bash
    cp config.env.template config.env
    nano config.env
    ```
    *   Set your `TIMEZONE`.
    *   Add your `PLEX_CLAIM` token (claim one at [plex.tv/claim](https://www.plex.tv/claim/)). If omitted, you will need to manually sign in to the Plex Web UI to claim the server after the initial setup.
    *   (Optional) Customize `OLLAMA_MODEL`.

3.  **Run the Setup Script**:
    ```bash
    chmod +x setup.sh
    sudo ./setup.sh
    ```
4.  **Follow the Prompts**: The script will guide you through network configuration and deployment.

## Post-Install

Access your services at:
*   **Home Assistant**: `http://<IP>:8123`
*   **Plex**: `http://<IP>:32400/web`
*   **n8n**: `http://<IP>:5678`
*   **Open WebUI**: `http://<IP>:3000`
*   **Samba Share**: `\\<IP>\Media`

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) for details.
