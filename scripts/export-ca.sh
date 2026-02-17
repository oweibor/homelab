#!/bin/bash
# ============================================================
# Export mkcert Root CA for Client Device Trust
# ============================================================
# This script copies the mkcert root CA certificate to a
# convenient location and provides instructions for installing
# it on Windows, macOS, Linux, iOS, and Android devices.
#
# Usage: sudo ./scripts/export-ca.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

HOMELAB_DIR="${HOME}/homelab"
CA_SOURCE="${HOMELAB_DIR}/traefik/certs/ca/rootCA.pem"
CA_DEST="${HOMELAB_DIR}/certs-for-clients/homelab-ca.crt"

if [ ! -f "$CA_SOURCE" ]; then
    echo -e "${YELLOW}[WARN]${NC} Root CA not found at $CA_SOURCE"
    echo "Run setup.sh first to generate certificates with mkcert."
    exit 1
fi

mkdir -p "$(dirname "$CA_DEST")"
cp "$CA_SOURCE" "$CA_DEST"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Root CA Exported Successfully                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  📁 CA File: ${BLUE}$CA_DEST${NC}"
echo ""
echo -e "  ${GREEN}Install on your devices to trust *.homelab.local:${NC}"
echo ""
echo "  📱 iOS/iPadOS:"
echo "     1. AirDrop or email the .crt file to your device"
echo "     2. Settings → General → VPN & Device Management → Install"
echo "     3. Settings → General → About → Certificate Trust Settings → Enable"
echo ""
echo "  🤖 Android:"
echo "     1. Transfer .crt file to device"
echo "     2. Settings → Security → Install from storage"
echo ""
echo "  🪟 Windows (PowerShell as Admin):"
echo "     Import-Certificate -FilePath \\\\<SERVER-IP>\\Media\\homelab-ca.crt -CertStoreLocation Cert:\\LocalMachine\\Root"
echo ""
echo "  🍎 macOS:"
echo "     sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain homelab-ca.crt"
echo ""
echo "  🐧 Linux:"
echo "     sudo cp homelab-ca.crt /usr/local/share/ca-certificates/"
echo "     sudo update-ca-certificates"
echo ""
