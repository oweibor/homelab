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
*   **Traefik**: Reverse proxy for secure HTTPS access and pretty hostnames.

## Requirements

*   **Hardware**: Any PC with at least 4 cores, 8GB+ RAM, 128GB+ Storage.
*   **OS**: Ubuntu Server 24.04 LTS (fresh install recommended).
*   **User**: Root access (sudo) required.

## Quick Start

**The One-Liner (Recommended)**:
Run this on your Ubuntu Server to clone and deploy automatically:
```bash
git clone https://github.com/oweibor/homelab.git ~/homelab-setup && cd ~/homelab-setup && sudo ./setup.sh
```

### Manual Installation
1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/oweibor/homelab.git
    cd homelab
    ```
2.  **Configure** (Optional):
    ```bash
    cp config.env.template config.env
    nano config.env
    ```
3.  **Run**:
    ```bash
    sudo ./setup.sh
    ```

## Post-Install

Access your services at:
*   **Traefik Dashboard**: `https://traefik.homelab.local`
*   **Home Assistant**: `https://ha.homelab.local` (or `http://<IP>:8123`)
*   **Plex**: `https://plex.homelab.local` (or `http://<IP>:32400/web`)
*   **n8n**: `https://n8n.homelab.local` (or `http://<IP>:5678`)
*   **Open WebUI**: `https://chat.homelab.local` (or `http://<IP>:3000`)
*   **Samba Share**: `\\<IP>\Media`

**Note:** You must add the `.homelab.local` domains to your client machine's `hosts` file pointing to the server IP.

## Existing Installations (Migration)

If you already have a server with Docker running, **do not run `setup.sh` directly**, as it may overwrite your system configurations.

Instead, follow these steps to adopt the Docker stack:
1.  **Clone the Repo**: `git clone https://github.com/oweibor/homelab.git`
2.  **Copy Compose File**: Copy `docker-compose.yml` to your preferred directory.
3.  **Setup Traefik**:
    *   Copy the `traefik/` directory to your project root.
    *   Ensure `traefik/certs/` exists (generate certs or bring your own).
4.  **Configure Env**:
    *   Create a `.env` file based on `config.env.template`.
    *   Key variables needed: `TZ`, `PUID`, `PGID`, `OLLAMA_MODEL`.
5.  **Deploy**:
    ```bash
    docker compose up -d
    ```

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) for details.
