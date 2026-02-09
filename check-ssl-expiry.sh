#!/bin/bash
# ==========================================================
# SSL CERTIFICATE EXPIRY MONITOR
# Checks certificate expiration and warns if expiring soon
# ==========================================================

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get the actual user who ran sudo (if run with sudo)
ACTUAL_USER="${SUDO_USER:-$(whoami)}"
USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
HOMELAB_DIR="${HOMELAB_DIR:-$USER_HOME/homelab}"

# Certificate paths
CERT_DIR="$HOMELAB_DIR/traefik/certs"
CERT_FILE="$CERT_DIR/homelab.local.crt"

# Warning threshold in days
WARNING_DAYS=30

# Check if certificate exists
if [ ! -f "$CERT_FILE" ]; then
    log_error "Certificate not found at $CERT_FILE"
    exit 1
fi

# Get certificate expiry date
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY_DATE" +%s 2>/dev/null)
CURRENT_EPOCH=$(date +%s)

# Calculate days until expiry
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

# Display certificate info
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           SSL CERTIFICATE EXPIRY CHECK                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log_info "Certificate: $CERT_FILE"
log_info "Expires on: $EXPIRY_DATE"
echo ""

# Check expiry status
if [ $DAYS_UNTIL_EXPIRY -lt 0 ]; then
    log_error "Certificate has EXPIRED!"
    log_error "Expired $((-$DAYS_UNTIL_EXPIRY)) days ago"
    echo ""
    log_warn "To renew the certificate, run:"
    echo "  cd $HOMELAB_DIR"
    echo "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    echo "    -keyout traefik/certs/homelab.local.key \\"
    echo "    -out traefik/certs/homelab.local.crt \\"
    echo "    -subj \"/CN=homelab.local/O=Homelab/C=US\""
    echo "  docker compose restart traefik"
    exit 2
elif [ $DAYS_UNTIL_EXPIRY -lt $WARNING_DAYS ]; then
    log_warn "Certificate expires in $DAYS_UNTIL_EXPIRY days!"
    log_warn "Consider renewing soon."
    echo ""
    log_info "To renew the certificate, run:"
    echo "  cd $HOMELAB_DIR"
    echo "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    echo "    -keyout traefik/certs/homelab.local.key \\"
    echo "    -out traefik/certs/homelab.local.crt \\"
    echo "    -subj \"/CN=homelab.local/O=Homelab/C=US\""
    echo "  docker compose restart traefik"
    exit 1
else
    log_info "Certificate is valid for $DAYS_UNTIL_EXPIRY days"
    log_info "No action needed"
    exit 0
fi
