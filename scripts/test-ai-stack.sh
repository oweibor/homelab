#!/bin/bash

# Test Agent Factory Stack Connectivity
LOG_FILE="agent-stack-test.log"
echo "Testing Agent Factory Stack..." | tee "$LOG_FILE"
echo "=============================" | tee -a "$LOG_FILE"

# Source config if present
if [ -f "$(dirname "$0")/../.env" ]; then
    source "$(dirname "$0")/../.env"
elif [ -f "$HOME/homelab/.env" ]; then
    source "$HOME/homelab/.env"
fi

# 1. Check Ollama Connectivity
if curl -s http://localhost:11434/api/tags >/dev/null; then
    echo "✅ Ollama API is reachable (Port 11434)." | tee -a "$LOG_FILE"
else
    echo "❌ Ollama API is NOT reachable!" | tee -a "$LOG_FILE"
fi

# 2. Check Open WebUI (Local Proxy)
if curl -s http://localhost:3000 >/dev/null; then
    echo "✅ Open WebUI is reachable (Port 3000)." | tee -a "$LOG_FILE"
else
    echo "❌ Open WebUI is NOT reachable!" | tee -a "$LOG_FILE"
fi

# 3. Check OpenClaw Connectivity
if curl -s http://localhost:18789 >/dev/null; then
    echo "✅ OpenClaw API is reachable (Port 18789)." | tee -a "$LOG_FILE"
else
    echo "❌ OpenClaw API NOT reachable!" | tee -a "$LOG_FILE"
fi

# 4. Check Kilo Pipeline
if curl -s http://localhost:3100/health >/dev/null; then
    echo "✅ Kilo Pipeline is reachable (Port 3100)." | tee -a "$LOG_FILE"
else
    echo "❌ Kilo Pipeline is NOT reachable!" | tee -a "$LOG_FILE"
fi

# 5. Check Qdrant
if curl -s http://localhost:6333/healthz >/dev/null; then
    echo "✅ Qdrant Vector DB is reachable (Port 6333)." | tee -a "$LOG_FILE"
else
    echo "❌ Qdrant Vector DB is NOT reachable!" | tee -a "$LOG_FILE"
fi

echo "=============================" | tee -a "$LOG_FILE"
echo "Test Complete. Check $LOG_FILE for details." | tee -a "$LOG_FILE"
