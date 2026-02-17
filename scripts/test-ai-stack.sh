#!/bin/bash

# Test AI Stack Connectivity and Model Status

LOG_FILE="ai-stack-test.log"
echo "Testing AI Stack..." | tee "$LOG_FILE"

# 1. Check Ollama Connectivity
if curl -s http://localhost:11434/api/tags >/dev/null; then
    echo "✅ Ollama is reachable." | tee -a "$LOG_FILE"
else
    echo "❌ Ollama is NOT reachable!" | tee -a "$LOG_FILE"
    exit 1
fi

# 2. Check Required Models
REQUIRED_MODELS=("llama3.2:1b" "llama3.2:3b" "qwen2.5-coder:3b")
INSTALLED_MODELS=$(curl -s http://localhost:11434/api/tags | grep -oP '(?<="name":")[^"]*')

for model in "${REQUIRED_MODELS[@]}"; do
    if echo "$INSTALLED_MODELS" | grep -q "$model"; then
        echo "✅ Model found: $model" | tee -a "$LOG_FILE"
    else
        echo "❌ Model MISSING: $model" | tee -a "$LOG_FILE"
        echo "   Run: docker compose exec ollama ollama pull $model" | tee -a "$LOG_FILE"
    fi
done

# 3. Check OpenClaw Connectivity
if curl -s http://localhost:3005 >/dev/null; then # Mapped port 3005:3000
    echo "✅ OpenClaw Dashboard reachable (Port 3005)." | tee -a "$LOG_FILE"
else
    echo "❌ OpenClaw Dashboard NOT reachable!" | tee -a "$LOG_FILE"
fi

# 4. Verify OpenClaw Config
CONFIG_FILE="./openclaw/config/openclaw.json"
if [ -f "$CONFIG_FILE" ]; then
    if grep -q "qwen2.5-coder:3b" "$CONFIG_FILE"; then
         echo "✅ OpenClaw Config found & correct (Coding Model: qwen2.5)." | tee -a "$LOG_FILE"
    else
         echo "❌ OpenClaw Config exists but MISSING model 'qwen2.5-coder:3b'!" | tee -a "$LOG_FILE"
    fi
else
    echo "❌ OpenClaw Config NOT found at $CONFIG_FILE" | tee -a "$LOG_FILE"
fi

echo "Test Complete. Check $LOG_FILE for details." | tee -a "$LOG_FILE"
