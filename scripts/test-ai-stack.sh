#!/bin/bash

# Test AI Stack Connectivity and Model Status

# Source config if present (check both project root and homelab directory)
# Project root takes precedence, homelab directory is fallback
if [ -f "$(dirname "$0")/../.env" ]; then
    source "$(dirname "$0")/../.env"
elif [ -f "$HOME/homelab/.env" ]; then
    source "$HOME/homelab/.env"
fi

LOG_FILE="ai-stack-test.log"
echo "Testing AI Stack..." | tee "$LOG_FILE"

# 0. Check for dependencies
HAS_JQ=false
if command -v jq &>/dev/null; then
    HAS_JQ=true
fi

# 1. Check Ollama Connectivity
if curl -s http://localhost:11434/api/tags >/dev/null; then
    echo "✅ Ollama is reachable." | tee -a "$LOG_FILE"
else
    echo "❌ Ollama is NOT reachable!" | tee -a "$LOG_FILE"
    exit 1
fi

# 2. Check Required Models
# Build model list from wizard output, fall back to legacy defaults
REQUIRED_MODELS=(
  "${OLLAMA_DEFAULT_MODEL:-${MODEL_CODING:-qwen2.5-coder:3b}}"
  "${MODEL_GENERAL:-llama3.2:3b}"
  "${MODEL_QUICK:-llama3.2:1b}"
)

# Deduplicate while preserving first occurrence (order matters for priority)
REQUIRED_MODELS=($(printf '%s\n' "${REQUIRED_MODELS[@]}" | awk '!seen[$0]++'))

# Get the coding model for OpenClaw config check
CODING_MODEL="${OLLAMA_DEFAULT_MODEL:-${MODEL_CODING:-qwen2.5-coder:3b}}"

if [ "$HAS_JQ" = true ]; then
    INSTALLED_MODELS=$(curl -s http://localhost:11434/api/tags | jq -r '.models[].name')
else
    # Fallback to grep parsing if jq is missing
    INSTALLED_MODELS=$(curl -s http://localhost:11434/api/tags | grep -oP '(?<="name":")[^"]*')
fi

for model in "${REQUIRED_MODELS[@]}"; do
    if echo "$INSTALLED_MODELS" | grep -q "$model"; then
        echo "✅ Model found: $model" | tee -a "$LOG_FILE"
    else
        echo "❌ Model MISSING: $model" | tee -a "$LOG_FILE"
        echo "   Run: docker compose exec ollama ollama pull $model" | tee -a "$LOG_FILE"
    fi
done

# 3. Check OpenClaw Connectivity
if curl -s http://localhost:18789 >/dev/null; then
    echo "✅ OpenClaw Dashboard reachable (Port 18789)." | tee -a "$LOG_FILE"
else
    echo "❌ OpenClaw Dashboard NOT reachable! (Check port 18789)" | tee -a "$LOG_FILE"
fi

# 4. Verify OpenClaw Config
CONFIG_FILE="./openclaw/openclaw.json"
if [ -f "$CONFIG_FILE" ]; then
    if grep -q "$CODING_MODEL" "$CONFIG_FILE"; then
         echo "✅ OpenClaw Config found & correct (Coding Model: $CODING_MODEL)." | tee -a "$LOG_FILE"
    else
         echo "❌ OpenClaw Config exists but MISSING model '$CODING_MODEL'!" | tee -a "$LOG_FILE"
    fi
else
    echo "❌ OpenClaw Config NOT found at $CONFIG_FILE" | tee -a "$LOG_FILE"
fi

echo "Test Complete. Check $LOG_FILE for details." | tee -a "$LOG_FILE"
