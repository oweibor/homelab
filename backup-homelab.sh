#!/bin/bash
# ==========================================================
# HOMELAB WEEKLY BACKUP SCRIPT
# ==========================================================
# Scope: Backs up critical service configurations and env files.
# Exclusion: Excludes media files and transcodes to save space.
set -euo pipefail

# Get the actual user who ran sudo
ACTUAL_USER="${SUDO_USER:-$(whoami)}"
USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
HOMELAB_DIR="${HOMELAB_DIR:-$USER_HOME/homelab}"
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
    --exclude='var/kilo/checkpoints/*' \
    .env \
    */.env \
    homeassistant/ \
    plex/config/ \
    n8n/ \
    traefik/ \
    open-webui/ \
    antigravity/config/ \
    openclaw/ \
    kilo/.kilo/ \
    /var/kilo/ \
    obsidian/config/ \
    anythingllm/storage/ \
    nextcloud/data/ \
    grafana/data/ \
    prometheus/data/ \
    homepage/ 2>> "$LOG_FILE"

if [ $? -eq 0 ]; then
    log "Backup successful: ${BACKUP_FILE}"
else
    log "ERROR: Backup failed. Check logs for details."
    exit 1
fi

# 1b. Qdrant snapshot (Phase 1 — Task 1.11)
# Creates a Qdrant snapshot via the REST API and copies it to /var/kilo/qdrant-backups/
log "Creating Qdrant vector snapshots..."
QDRANT_BACKUP_DIR="/var/kilo/qdrant-backups"
mkdir -p "$QDRANT_BACKUP_DIR"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^qdrant$"; then
    for COLLECTION in project_decisions project_invariants project_reasoning project_history project_context; do
        SNAP_RESP=$(curl -sf -X POST \
            "http://localhost:6333/collections/${COLLECTION}/snapshots" 2>/dev/null || echo "")
        if [ -n "$SNAP_RESP" ]; then
            SNAP_NAME=$(echo "$SNAP_RESP" | \
                python3 -c "import sys,json; print(json.load(sys.stdin)['result']['name'])" 2>/dev/null || echo "")
            if [ -n "$SNAP_NAME" ]; then
                docker cp "qdrant:/qdrant/storage/snapshots/${COLLECTION}/${SNAP_NAME}" \
                    "${QDRANT_BACKUP_DIR}/${COLLECTION}-${TIMESTAMP}.snapshot" 2>>"$LOG_FILE" && \
                    log "Qdrant snapshot saved: ${COLLECTION}-${TIMESTAMP}.snapshot" || \
                    log "WARN: Failed to copy snapshot for ${COLLECTION}"
            fi
        else
            log "WARN: Qdrant snapshot API call failed for ${COLLECTION} (Qdrant may be down)"
        fi
    done

    # Rotate Qdrant snapshots — keep last 4 per collection
    for COLLECTION in project_decisions project_invariants project_reasoning project_history project_context; do
        ls -1t "${QDRANT_BACKUP_DIR}/${COLLECTION}-"*.snapshot 2>/dev/null | tail -n +5 | while read -r old; do
            log "Removing old snapshot: $old"
            rm -f "$old"
        done
    done
else
    log "WARN: Qdrant container is not running — skipping vector snapshots"
fi


# 2. Rotation policy (Keep last 4 weekly backups)
log "Cleaning up old backups (keeping last 4)..."
cd "$BACKUP_DIR" || exit 1
# Safer rotation using a loop and sorted file list
# shellcheck disable=SC2012
ls -1t homelab-backup-*.tar.gz 2>/dev/null | tail -n +5 | while read -r old_backup; do
    log "Removing old backup: $old_backup"
    rm -f "$old_backup"
done

log "Weekly backup complete."
