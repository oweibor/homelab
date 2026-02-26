# kilo-pipeline — Production Dockerfile
# =====================================================
# OpenClaw + Kilo Code v9 — Phase 2 Pipeline Foundation
#
# Base: node:20-slim (not alpine — native modules for @xenova/transformers)
# Memory budget: 1 GB (set in docker-compose.yml)
# Model: MiniLM-L6-v2 via @xenova/transformers (CPU, quantized, ~80 MB)
#
# Build: docker compose build kilo-pipeline
# Run:   docker compose up -d kilo-pipeline

# ── Stage 1: Install dependencies ──────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Install system deps for native modules + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ── Stage 2: Production image ──────────────────────────────────
FROM node:20-slim

WORKDIR /app

# curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r kilo && useradd -r -g kilo -m kilo

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Copy source
COPY src/ ./src/

# Create model cache directory (persists via volume if configured)
RUN mkdir -p /app/models && chown kilo:kilo /app/models

# Create checkpoint directory (overridden by volume mount in compose)
RUN mkdir -p /var/kilo/checkpoints && chown kilo:kilo /var/kilo/checkpoints

# Switch to non-root
USER kilo

# Expose pipeline port
EXPOSE 3100

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:3100/health || exit 1

CMD ["node", "src/index.js"]
