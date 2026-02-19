#!/bin/bash
# ==========================================================
# ONLYOFFICE -> NEXTCLOUD INTEGRATION CONFIGURATOR
# Run this AFTER first "docker compose up -d"
# ==========================================================

# Use current directory or homelab path
HOMELAB_DIR="${1:-$(pwd)}"
if [ ! -f "$HOMELAB_DIR/.env" ]; then
    HOMELAB_DIR="$HOME/homelab"
fi

if [ ! -f "$HOMELAB_DIR/.env" ]; then
    echo "Error: Homelab directory not found. Please provide path: ./configure-onlyoffice.sh /path/to/homelab"
    exit 1
fi

# Load environment variables
source "$HOMELAB_DIR/.env"

echo "Waiting for Nextcloud to finish initializing (checking 'occ status')..."
until docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ status 2>/dev/null | grep -q "installed: true"; do
    printf "."
    sleep 5
done
echo -e "\nNextcloud is ready."

echo "Installing ONLYOFFICE connector app..."
docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ app:install onlyoffice || echo "App already installed or installation failed."

echo "Configuring ONLYOFFICE connector settings..."
docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:system:set onlyoffice DocumentServerUrl \
    --value="https://office.homelab.local"

docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:system:set onlyoffice DocumentServerInternalUrl \
    --value="http://onlyoffice:80"

docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:system:set onlyoffice StorageUrl \
    --value="http://nextcloud:80"

docker compose -f "$HOMELAB_DIR/docker-compose.yml" exec -T nextcloud \
    php occ config:system:set onlyoffice jwt_secret \
    --value="$ONLYOFFICE_JWT_SECRET"

echo "✅ ONLYOFFICE connected to Nextcloud!"
echo "   Access your files at: https://nextcloud.homelab.local"
echo "   Create a new .docx or .xlsx to test the local AI-powered editor."
