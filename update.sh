#!/bin/bash
# ==========================================================
# HOMELAB UPDATE SCRIPT
# Pulls latest images and restarts services
# ==========================================================

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Get the actual user who ran sudo (if run with sudo)
ACTUAL_USER="${SUDO_USER:-$(whoami)}"
USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
HOMELAB_DIR="${HOMELAB_DIR:-$USER_HOME/homelab}"

cd "$HOMELAB_DIR"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              HOMELAB UPDATE SCRIPT                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

log_step "Checking for pending Kilo writer operations..."
if [ -d "/var/kilo/writer_retry" ] && [ "$(ls -A /var/kilo/writer_retry 2>/dev/null)" ]; then
    log_warn "Pending writer operations detected in /var/kilo/writer_retry."
    log_info "Manual drain required: review /var/kilo/writer_retry contents."
    log_info "  To list pending: ls -la /var/kilo/writer_retry/"
fi

log_step "Pulling latest Docker images..."
docker compose pull

log_step "Restarting services with new images..."
docker compose up -d

log_step "Verifying Kilo Pipeline health..."
for i in {1..10}; do
    if curl -sf http://localhost:3100/health | grep -q 'ok'; then
        log_info "Kilo Pipeline is healthy."
        break
    fi
    [ $i -eq 10 ] && log_warn "Kilo Pipeline health check timed out."
    sleep 3
done

log_step "Removing unused images..."
docker image prune -f

echo ""
log_info "Update complete!"
log_info "Check service status with: docker compose ps"
