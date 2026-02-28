#!/bin/bash
set -euo pipefail
# ==========================================================
# NEXTCLOUD PRODUCTIVITY SUITE EXPANSION CONFIGURATOR
# Installs: Talk, Groupware (Calendar/Contacts/Mail), and AI Assistant
# ==========================================================

# Use current directory or homelab path
HOMELAB_DIR="${1:-$(pwd)}"
if [ ! -f "$HOMELAB_DIR/.env" ]; then
    HOMELAB_DIR="$HOME/homelab"
fi

if [ ! -f "$HOMELAB_DIR/.env" ]; then
    echo "Error: Homelab directory not found. Please provide path: ./configure-nextcloud-plus.sh /path/to/homelab"
    exit 1
fi

# Load environment variables (handling CRLF and unquoted values)
# We use a temp file to safely source the variables
TEMP_ENV=$(mktemp)
cat "$HOMELAB_DIR/.env" | tr -d '\r' > "$TEMP_ENV"
set -a
source "$TEMP_ENV"
set +a
rm "$TEMP_ENV"

echo "Waiting for Nextcloud to finish initializing..."
until docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ status 2>/dev/null | grep -q "installed: true"; do
    printf "."
    sleep 5
done
echo -e "\nNextcloud is ready."

# --- APP INSTALLATION ---
APPS=("spreed" "calendar" "contacts" "mail" "assistant" "ai_integration" "llm_ollama")

for app in "${APPS[@]}"; do
    echo "Installing/Updating $app..."
    output=$(docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
        php occ app:install "$app" 2>&1) || {
        if echo "$output" | grep -qi "already installed"; then
            echo "$app already installed, skipping."
        else
            echo "ERROR: Failed to install $app: $output"
            exit 1
        fi
    }
    docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
        php occ app:enable "$app" || true
done

# --- CONFIGURE TALK (SPREED) ---
echo "Configuring Nextcloud Talk (STUN/TURN)..."

# Detect the server's LAN IP for STUN/TURN.
# STUN/TURN addresses are sent to browser clients as ICE server candidates,
# so they must be reachable from the LAN — NOT localhost.
SERVER_IP=$(ip -4 route get 1 2>/dev/null | awk '{print $7; exit}')
if [ -z "${SERVER_IP:-}" ]; then
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "${SERVER_IP:-}" ]; then
    echo "⚠️ Could not detect server LAN IP. Falling back to manual entry."
    read -p "Enter this server's LAN IP address: " SERVER_IP
fi
echo "Using server IP for STUN/TURN: $SERVER_IP"

# TURN_SECRET and TURN_REALM should be in .env from the NetBird setup
TURN_SECRET="${TURN_SECRET:-}"
TURN_REALM="${TURN_REALM:-homelab.local}"

if [ -n "$TURN_SECRET" ]; then
    # STUN — browser clients connect to the server's LAN IP
    docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
        php occ config:app:set spreed stun_servers --value="[\"$SERVER_IP:3478\"]"
    
    # TURN — browser clients relay media through the server's LAN IP
    # Using jq for safe JSON construction if available, otherwise printf
    if command -v jq &>/dev/null; then
        TURN_JSON=$(jq -nc --arg server "$SERVER_IP:3478" --arg secret "$TURN_SECRET" \
            '[{"server":$server,"secret":$secret,"protocols":"udp,tcp"}]')
    else
        TURN_JSON=$(printf '[{"server":"%s:3478","secret":"%s","protocols":"udp,tcp"}]' "$SERVER_IP" "$TURN_SECRET")
    fi
    docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
        php occ config:app:set spreed turn_servers --value="$TURN_JSON"
    
    echo "✅ Talk configured with Coturn at $SERVER_IP:3478."
else
    echo "⚠️ TURN_SECRET not found in .env. Skipping advanced Talk configuration."
fi

# --- CONFIGURE AI ASSISTANT ---
echo "Configuring Nextcloud Assistant (Ollama)..."
docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:app:set llm_ollama base_url --value="http://ollama:11434"

# Use first model from OLLAMA_MODEL env var, fallback to llama3.2:3b
DEFAULT_LLM_MODEL=$(echo "${OLLAMA_MODEL:-llama3.2:3b}" | awk '{print $1}')
docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:app:set llm_ollama default_model --value="$DEFAULT_LLM_MODEL"

echo "✅ AI Assistant linked to Ollama."

# --- FINAL SYSTEM UPDATE ---
docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ upgrade || true

echo ""
echo "=========================================================="
echo "✅ NEXTCLOUD PRODUCTIVITY SUITE CONFIGURED!"
echo "=========================================================="
echo "   Apps Installed: Talk, Calendar, Contacts, Mail, Assistant"
echo "   AI Backend: Ollama (http://ollama:11434)"
echo "   STUN/TURN: Coturn at $SERVER_IP:3478"
echo ""
echo "   Access: https://nextcloud.homelab.local"
echo "=========================================================="
