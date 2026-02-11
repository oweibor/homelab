#!/bin/bash
# ==========================================================
# HOMELAB WEEKLY BACKUP SCRIPT
# ==========================================================
# Scope: Backs up critical service configurations and env files.
# Exclusion: Excludes media files and transcodes to save space.
# Rotation: Keeps the last 4 weekly backups.
# ==========================================================

USER_HOME=$(eval echo "~$SUDO_USER")
HOMELAB_DIR="${USER_HOME}/homelab"
BACKUP_DIR="${HOMELAB_DIR}/backups"
LOG_FILE="${HOMELAB_DIR}/logs/backup.log"
TIMESTAMP=$(date +%Y%m%d)
BACKUP_FILE="homelab-backup-${TIMESTAMP}.tar.gz"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting weekly homelab backup..."

# 1. Create the compressed archive
log "Compressing critical configurations..."
cd "$HOMELAB_DIR" || { log "ERROR: Could not enter homelab directory"; exit 1; }

tar -czf "${BACKUP_DIR}/${BACKUP_FILE}" \
    --exclude='media' \
    --exclude='plex/transcode' \
    --exclude='backups' \
    --exclude='logs' \
    .env \
    */.env \
    homeassistant/ \
    plex/config/ \
    n8n/ \
    traefik/ \
    open-webui/ \
    antigravity/config/ \
    openclaw/ 2>> "$LOG_FILE"

if [ $? -eq 0 ]; then
    log "Backup successful: ${BACKUP_FILE}"
else
    log "ERROR: Backup failed. Check logs for details."
    exit 1
fi

# 2. Rotation policy (Keep last 4 weekly backups)
log "Cleaning up old backups (keeping last 4)..."
cd "$BACKUP_DIR" || exit 1
ls -1t homelab-backup-*.tar.gz | tail -n +5 | xargs -r rm

log "Weekly backup complete."
