#!/bin/bash
# =============================================================
# CREATE QDRANT COLLECTIONS — OpenClaw + Kilo Pipeline
# =============================================================
# Idempotent: safe to re-run at any time.
# All 5 collections use 384-dimensional Cosine vectors
# matching the all-MiniLM-L6-v2 embedding model.
#
# Usage:
#   bash kilo/scripts/create-qdrant-collections.sh
#   bash kilo/scripts/create-qdrant-collections.sh http://localhost:6333
#
# Run AFTER: docker compose up -d qdrant
# Verify with: curl http://localhost:6333/collections

set -euo pipefail

QDRANT_URL="${1:-http://localhost:6333}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${BLUE}──────────────────────────────────────────${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}──────────────────────────────────────────${NC}"; }

# ─── Wait for Qdrant to be ready ────────────────────────────
log_section "Waiting for Qdrant at ${QDRANT_URL}"
MAX_WAIT=60
WAITED=0
until curl -sf "${QDRANT_URL}/healthz" > /dev/null 2>&1; do
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        log_error "Qdrant did not become ready within ${MAX_WAIT}s. Is it running?"
        log_error "Start with: docker compose up -d qdrant"
        exit 1
    fi
    echo -n "."
    sleep 2
    WAITED=$((WAITED + 2))
done
echo ""
log_info "Qdrant is ready."

# ─── Create / verify a single collection ────────────────────
create_collection() {
    local name="$1"
    local description="$2"

    # Check if it already exists
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "${QDRANT_URL}/collections/${name}")

    if [ "$HTTP_STATUS" = "200" ]; then
        log_warn "Collection '${name}' already exists — skipping."
        return 0
    fi

    # Create it using PUT (idempotent)
    RESPONSE=$(curl -sf -X PUT \
        -H "Content-Type: application/json" \
        -d '{
            "vectors": {
                "size": 384,
                "distance": "Cosine"
            }
        }' \
        "${QDRANT_URL}/collections/${name}" 2>&1) || {
        log_error "Failed to create collection '${name}': ${RESPONSE}"
        exit 1
    }

    log_info "Created '${name}' — ${description}"
}

# ─── Create all 5 collections ───────────────────────────────
log_section "Creating 5 Qdrant Collections (384-dim, Cosine)"

create_collection "project_decisions" \
    "Gate 9 T1 enforcer. ADR contradiction check. staging/ always excluded."

create_collection "project_invariants" \
    "Gate 8A T1 (det) + Gate 8B T1 (sem). File-locked append."

create_collection "project_reasoning" \
    "Informs /architect context only. confidence:low gets -0.10 penalty."

create_collection "project_history" \
    "W4 writer only. Prevents re-solving solved problems."

create_collection "project_context" \
    "Gate 10 T2 only. W5 writer. 4000-token cap triggers Ollama summarize."

# ─── Verify all 5 exist ─────────────────────────────────────
log_section "Verifying Collections"

COLLECTIONS=$(curl -sf "${QDRANT_URL}/collections" 2>/dev/null)
EXPECTED=("project_decisions" "project_invariants" "project_reasoning" "project_history" "project_context")

ALL_OK=true
for col in "${EXPECTED[@]}"; do
    if echo "$COLLECTIONS" | grep -q "\"$col\""; then
        log_info "  ✓  ${col}"
    else
        log_error "  ✗  ${col} — NOT FOUND"
        ALL_OK=false
    fi
done

echo ""
if [ "$ALL_OK" = "true" ]; then
    echo -e "${GREEN}  All 5 collections verified. Phase 1 Task 1.10 complete.${NC}"
    echo ""
    echo "  Full collection list:"
    curl -sf "${QDRANT_URL}/collections" | python3 -c \
        "import sys,json; [print('    -', c['name']) for c in json.load(sys.stdin)['result']['collections']]" \
        2>/dev/null || echo "  (install python3 to pretty-print)"
else
    log_error "Some collections are missing. Check Qdrant logs: docker compose logs qdrant"
    exit 1
fi
