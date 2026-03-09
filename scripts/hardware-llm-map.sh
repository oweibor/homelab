#!/bin/bash
# =============================================================================
# HARDWARE TO LLM MAPPING MODULE
# Maps detected hardware to optimal Ollama models
# Based on hardware_llm_table_v4_plan.md
# =============================================================================

# Source hardware detection if not already loaded
MAP_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${HARDWARE_PROFILE:-}" ]; then
    source "$MAP_SCRIPT_DIR/hardware-detect.sh" 2>/dev/null || true
fi

# =============================================================================
# CPU LLM MAPPING
# =============================================================================

# Get LLM models for CPU-based inference
# Usage: get_llm_models_cpu
get_llm_models_cpu() {
    local profile="$1"
    local ram_gb="${2:-8}"
    
    # Default models for insufficient RAM
    if [ "$ram_gb" -lt 4 ]; then
        echo "CODING=tinyllama:1.1b-q4:PLANNING=tinyllama:1.1b-q4:QUICK=tinyllama:1.1b-q4"
        return
    fi
    
    case "$profile" in
        n100_like|n100)
            # N100/N95/N97/N200 - 4 cores, 8GB RAM typical
            if [ "$ram_gb" -ge 16 ]; then
                echo "CODING=qwen2.5-coder:3b-q4:PLANNING=gemma2:2b-q4:QUICK=phi3.5:mini-q4"
            else
                echo "CODING=qwen2.5-coder:1.5b-q4:PLANNING=gemma2:2b-q4:QUICK=phi3.5:mini-q4"
            fi
            ;;
        n305)
            # N305 - 8 cores, 16-32GB RAM
            if [ "$ram_gb" -ge 32 ]; then
                echo "CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-q5"
            else
                echo "CODING=qwen2.5-coder:7b-q4:PLANNING=llama3.2:3b-q5:QUICK=phi3.5:mini-q4"
            fi
            ;;
        celeron)
            # Celeron/Pentium - limited AVX, very constrained
            echo "CODING=tinyllama:1.1b-q4:PLANNING=tinyllama:1.1b-q4:QUICK=tinyllama:1.1b-q4"
            ;;
        core_i3)
            # Core i3 - 4 cores, 16GB typical
            echo "CODING=qwen2.5-coder:7b-q4:PLANNING=mistral:7b-q4:QUICK=phi3.5:mini-q4"
            ;;
        core_i5)
            # Core i5 - 6 cores, 16GB typical
            echo "CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-q5"
            ;;
        core_i7)
            # Core i7 - 8+ cores, 32GB typical
            echo "CODING=deepseek-coder-v2:16b-q4:PLANNING=llama3.1:8b-q5:QUICK=phi3.5:mini-q5"
            ;;
        core_i9)
            # Core i9 - high performance
            echo "CODING=deepseek-coder-v2:16b-q8:PLANNING=mixtral:8x7b-q4:QUICK=phi3.5:mini-fp16"
            ;;
        amd_low)
            # AMD Athlon / low-end Ryzen
            echo "CODING=qwen2.5-coder:3b-q4:PLANNING=gemma2:2b-q4:QUICK=phi3.5:mini-q4"
            ;;
        amd_mid)
            # AMD Ryzen 5 / mid-range
            echo "CODING=qwen2.5-coder:7b-q4:PLANNING=mistral:7b-q4:QUICK=phi3.5:mini-q4"
            ;;
        amd_high)
            # AMD Ryzen 7/9 - high performance
            if [ "$ram_gb" -ge 32 ]; then
                echo "CODING=deepseek-coder-v2:16b-q4:PLANNING=llama3.1:8b-q5:QUICK=phi3.5:mini-q5"
            else
                echo "CODING=deepseek-coder-v2:16b-q4:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-q4"
            fi
            ;;
        arm64_rpi5)
            # Raspberry Pi 5
            echo "CODING=qwen2.5-coder:0.5b-q4:PLANNING=tinyllama:1.1b-q4:QUICK=tinyllama:1.1b-q4"
            ;;
        arm64_rk3588)
            # Rockchip RK3588
            echo "CODING=qwen2.5-coder:1.5b-q4:PLANNING=tinyllama:1.1b-q4:QUICK=tinyllama:1.1b-q4"
            ;;
        arm64_server)
            # Generic ARM server
            echo "CODING=qwen2.5-coder:1.5b-q4:PLANNING=gemma2:2b-q4:QUICK=phi3.5:mini-q4"
            ;;
        *)
            # Unknown - conservative fallback
            echo "CODING=qwen2.5-coder:1.5b-q4:PLANNING=gemma2:2b-q4:QUICK=phi3.5:mini-q4"
            ;;
    esac
}

# =============================================================================
# GPU LLM MAPPING
# =============================================================================

# Get LLM models for GPU-based inference
# Usage: get_llm_models_gpu
get_llm_models_gpu() {
    local vram_gb="$1"
    local nvidia_model="$2"
    local gpu_models=""
    
    # NVIDIA GPU-specific selections
    if [ -n "$nvidia_model" ] && [ "$nvidia_model" != "none" ]; then
        case "$nvidia_model" in
            *3060*)
                if echo "$nvidia_model" | grep -q "12"; then
                    gpu_models="CODING=qwen2.5-coder:14b-q5:PLANNING=llama3.1:8b-fp16:QUICK=phi3.5:mini-fp16"
                else
                    gpu_models="CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-fp16"
                fi
                ;;
            *3070*)
                gpu_models="CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q5:QUICK=phi3.5:mini-fp16"
                ;;
            *3080*)
                gpu_models="CODING=qwen2.5-coder:14b-q4:PLANNING=llama3.1:8b-q8:QUICK=phi3.5:mini-fp16"
                ;;
            *3090*|*4090*)
                gpu_models="CODING=deepseek-coder-v2:33b-q4:PLANNING=mixtral:8x7b-q5:QUICK=phi3.5:mini-fp16"
                ;;
            *4060*)
                if echo "$nvidia_model" | grep -q "16"; then
                    gpu_models="CODING=qwen2.5-coder:32b-q4:PLANNING=mixtral:8x7b-q4:QUICK=phi3.5:mini-fp16"
                else
                    gpu_models="CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-fp16"
                fi
                ;;
            *4070*)
                gpu_models="CODING=qwen2.5-coder:14b-fp16:PLANNING=llama3.1:8b-fp16:QUICK=phi3.5:mini-fp16"
                ;;
            *4080*)
                gpu_models="CODING=qwen2.5-coder:32b-q5:PLANNING=mixtral:8x7b-q5:QUICK=phi3.5:mini-fp16"
                ;;
            *)
                # Unknown NVIDIA - will fall through to VRAM-based selection
                ;;
        esac
    fi
    
    # VRAM-based fallback for AMD, unknown NVIDIA, or when NVIDIA selection failed
    if [ -z "$gpu_models" ]; then
        case "$vram_gb" in
            8)
                gpu_models="CODING=qwen2.5-coder:7b-q5:PLANNING=llama3.1:8b-q4:QUICK=phi3.5:mini-fp16"
                ;;
            10)
                gpu_models="CODING=qwen2.5-coder:14b-q4:PLANNING=llama3.1:8b-q5:QUICK=phi3.5:mini-fp16"
                ;;
            12)
                gpu_models="CODING=qwen2.5-coder:14b-q5:PLANNING=llama3.1:8b-fp16:QUICK=phi3.5:mini-fp16"
                ;;
            16)
                gpu_models="CODING=qwen2.5-coder:32b-q4:PLANNING=mixtral:8x7b-q4:QUICK=phi3.5:mini-fp16"
                ;;
            24)
                gpu_models="CODING=deepseek-coder-v2:33b-q4:PLANNING=mixtral:8x7b-q5:QUICK=phi3.5:mini-fp16"
                ;;
            *)
                # Not enough VRAM for GPU inference
                gpu_models=""
                ;;
        esac
    fi
    
    echo "$gpu_models"
}

# =============================================================================
# UNIFIED LLM SELECTION
# =============================================================================

# Get optimal LLM models based on available hardware
# Usage: get_llm_models
# Output: CODING=model:PLANNING=model:QUICK=model
get_llm_models() {
    local profile="${HARDWARE_PROFILE:-unknown}"
    local ram_gb="${TOTAL_RAM_GB:-8}"
    local vram_gb="${GPU_VRAM_GB:-0}"
    local nvidia_model="${NVIDIA_GPU_MODEL:-none}"
    
    # If we have a discrete GPU with sufficient VRAM, prefer GPU inference
    if [ "$vram_gb" -ge 8 ]; then
        local gpu_models
        gpu_models=$(get_llm_models_gpu "$vram_gb" "$nvidia_model")
        if [ -n "$gpu_models" ]; then
            echo "$gpu_models"
            return
        fi
    fi
    
    # Fall back to CPU-based models
    get_llm_models_cpu "$profile" "$ram_gb"
}

# Unified model extraction helper
# Usage: get_model_value <models_string> <key>
# Output: The value for the given key
get_model_value() {
    local models="$1"
    local key="$2"
    
    # Use IFS to split by delimiter (robust against colons in model names)
    IFS=':' read -ra PARTS <<< "$models"
    for part in "${PARTS[@]}"; do
        case "$part" in
            ${key}=*)
                echo "${part#${key}=}"
                return
                ;;
        esac
    done
}

# Generate JSON for openclaw.json model configuration
# Usage: generate_openclaw_models_json
generate_openclaw_models_json() {
    local models
    models=$(get_llm_models)
    
    local coding planning quick
    coding=$(get_model_value "$models" "CODING")
    planning=$(get_model_value "$models" "PLANNING")
    quick=$(get_model_value "$models" "QUICK")
    
    cat << EOF
{
  "models": [
    {
      "id": "ollama",
      "type": "openai-completions",
      "baseUrl": "http://ollama:11434/v1",
      "models": [
        "$coding",
        "$planning",
        "$quick"
      ]
    }
  ],
  "agent_defaults": {
    "model": {
      "architect": "$coding",
      "orchestrator": "$coding",
      "coding": "$coding",
      "planning": "$planning",
      "delegation": "$quick",
      "fast": "$quick"
    }
  },
  "_meta": {
    "hardware_profile": "${HARDWARE_PROFILE:-unknown}",
    "total_ram_gb": "${TOTAL_RAM_GB:-unknown}",
    "gpu_vram_gb": "${GPU_VRAM_GB:-0}",
    "nvidia_model": "${NVIDIA_GPU_MODEL:-none}",
    "generated_by": "hardware-llm-map.sh"
  }
}
EOF
}

# =============================================================================
# OLLAMA PULL COMMANDS
# =============================================================================

# Generate ollama pull commands for selected models
# Usage: get_ollama_pull_commands
get_ollama_pull_commands() {
    local models
    models=$(get_llm_models)
    
    local coding planning quick
    coding=$(get_model_value "$models" "CODING")
    planning=$(get_model_value "$models" "PLANNING")
    quick=$(get_model_value "$models" "QUICK")
    
    # Get unique models (avoid pulling same model twice)
    echo "ollama pull $coding"
    if [ "$planning" != "$coding" ]; then
        echo "ollama pull $planning"
    fi
    if [ "$quick" != "$coding" ] && [ "$quick" != "$planning" ]; then
        echo "ollama pull $quick"
    fi
}

# =============================================================================
# PRINT FUNCTIONS
# =============================================================================

# Print selected models summary
# Usage: print_model_summary
print_model_summary() {
    local models
    models=$(get_llm_models)
    
    local coding planning quick
    coding=$(get_model_value "$models" "CODING")
    planning=$(get_model_value "$models" "PLANNING")
    quick=$(get_model_value "$models" "QUICK")
    
    echo "LLM Model Selection:"
    echo "  Hardware Profile: ${HARDWARE_PROFILE:-unknown}"
    echo "  Total RAM: ${TOTAL_RAM_GB:-unknown} GB"
    echo "  GPU VRAM: ${GPU_VRAM_GB:-0} GB"
    echo ""
    echo "  Coding Model:     $coding"
    echo "  Planning Model:   $planning"
    echo "  Quick Tasks:      $quick"
}

# If script is run directly, print summary
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    # Source hardware detection to get values
    if [ -f "$SCRIPT_DIR/hardware-detect.sh" ]; then
        source "$SCRIPT_DIR/hardware-detect.sh"
        
        # Run detection
        HARDWARE_PROFILE=$(get_hardware_profile_v2)
        TOTAL_RAM_GB=$(get_total_ram_gb)
        GPU_VRAM_GB=$(get_gpu_vram_gb)
        NVIDIA_GPU_MODEL=$(get_nvidia_gpu_model)
    fi
    
    print_model_summary
    echo ""
    echo "Ollama pull commands:"
    get_ollama_pull_commands
fi
