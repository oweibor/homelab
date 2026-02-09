#!/bin/bash
# ==========================================================
# HOMELAB HOSTS UPDATER (macOS / Linux / Ubuntu)
# Usage: sudo ./update-hosts.sh 192.168.1.100
# ==========================================================

SERVER_IP=$1
HOSTS_FILE="/etc/hosts"
DOMAINS=(
    "traefik.homelab.local"
    "ha.homelab.local"
    "plex.homelab.local"
    "n8n.homelab.local"
    "chat.homelab.local"
    "antigravity.homelab.local"
    "openclaw.homelab.local"
)

if [ -z "$SERVER_IP" ]; then
    echo "Usage: sudo $0 <SERVER_IP>"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo ""
echo "Adding Homelab domains to $HOSTS_FILE..."
echo "----------------------------------------"

ADDED=0
TEMP_ENTRIES=""

for DOMAIN in "${DOMAINS[@]}"; do
    if grep -q "$DOMAIN" "$HOSTS_FILE"; then
        echo "  - Skipping $DOMAIN (already exists)"
    else
        echo "  - Adding $DOMAIN -> $SERVER_IP"
        TEMP_ENTRIES+="$SERVER_IP $DOMAIN\n"
        ADDED=$((ADDED + 1))
    fi
done

if [ $ADDED -gt 0 ]; then
    echo -e "\n# --- Homelab Domains Start ---" >> "$HOSTS_FILE"
    echo -ne "$TEMP_ENTRIES" >> "$HOSTS_FILE"
    echo -e "# --- Homelab Domains End ---" >> "$HOSTS_FILE"
    echo -e "\nSuccessfully added $ADDED domains."
else
    echo -e "\nAll domains are already present."
fi

echo "Done! You can now access https://traefik.homelab.local"
