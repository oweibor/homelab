#!/bin/bash
# =============================================================================
# HOMELAB ONBOARDING LIBRARY
# Shared functions for hardware detection, model selection, and config generation
# =============================================================================

set -euo pipefail

# =============================================================================
# COLORS
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
CYAN='\033[0;96m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# =============================================================================
# HARDWARE DETECTION
# =============================================================================

# Helper: Robust float math using awk (replaces bc)
# Usage: calc <expression>
calc() {
    awk "BEGIN { print $1 }"
}

# Helper: Robust GB calculation from KB
# Usage: calc_gb <kb_value>
calc_gb() {
    local kb=$1
    if [[ -z "$kb" || "$kb" -le 0 ]]; then echo "0.0"; return; fi
    awk -v kb="$kb" 'BEGIN { printf "%.1f", kb / 1024 / 1024 }'
}

# Helper: Robust user detection
# Returns: The non-root user that initiated the script
get_actual_user() {
    local actual_user=""
    if [ -n "${SUDO_USER:-}" ]; then
        actual_user="$SUDO_USER"
    elif [ -n "${USERNAME:-}" ]; then
        actual_user="$USERNAME"
    elif [ -n "${USER:-}" ]; then
        actual_user="$USER"
    else
        actual_user="$(whoami)"
    fi
    
    # If still root and not in a special testing environment, we might have an issue
    if [[ "$actual_user" == "root" && "${ALLOW_ROOT:-0}" != "1" ]]; then
        # Check logged in users
        actual_user=$(who | awk '{print $1}' | head -1)
    fi
    
    echo "${actual_user:-root}"
}

detect_ram() {
    # Uses MemAvailable, not total RAM
    local ram_kb
    ram_kb=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}')
    if [ -z "$ram_kb" ]; then
        ram_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
    fi
    calc_gb "${ram_kb:-4194304}"
}

detect_cpu_cores() {
    # Physical cores only
    local cores
    cores=$(lscpu | awk '/^Core\(s\) per socket/{c=$NF} /^Socket\(s\)/{s=$NF} END{print c*s}')
    echo "${cores:-4}"
}

detect_gpu() {
    local gpu_type="none"
    local vram_gb=0
    
    # NVIDIA
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi &>/dev/null; then
            gpu_type="nvidia"
            vram_gb=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | awk '{print int($1/1024)}')
        fi
    fi
    
    # AMD ROCm
    if [ "$gpu_type" = "none" ] && command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null; then
            gpu_type="amd"
            vram_gb=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Free Memory" | awk '{print $NF}' | head -1)
            vram_gb=$((vram_gb / 1024))
        fi
    fi
    
    # Apple Silicon
    if [ "$gpu_type" = "none" ] && command -v system_profiler &>/dev/null; then
        local chip
        chip=$(system_profiler SPHardwareDataType 2>/dev/null | grep 'Chip' | awk '{print $NF}')
        if [[ "$chip" =~ Apple ]]; then
            gpu_type="metal"
            local total_mem
            total_mem=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1073741824}')
            vram_gb=$((total_mem - 2))  # Reserve 2GB for OS
        fi
    fi
    
    # Intel iGPU (basic detection)
    if [ "$gpu_type" = "none" ]; then
        if lspci | grep -i "vga" | grep -qi intel; then
            gpu_type="igpu"
            vram_gb=1  # Shared memory, assume 1GB
        fi
    fi
    
    echo "$gpu_type $vram_gb"
}

# =============================================================================
# SPEED CLASSIFICATION
# =============================================================================

classify_hardware() {
    local ram_gb=$1
    local cpu_cores=$2
    local gpu_type=$3
    local vram_gb=$4
    
    local tier="MID"
    local speed_class="CPU_ONLY"
    
    # Base tier by RAM
    if (( $(awk -v r="$ram_gb" 'BEGIN { print (r < 3.0) }') )); then
        tier="INSUFFICIENT"
    elif (( $(awk -v r="$ram_gb" 'BEGIN { print (r < 6.0) }') )); then
        tier="MINIMAL"
    elif (( $(awk -v r="$ram_gb" 'BEGIN { print (r < 10.0) }') )); then
        tier="LOW"
    elif (( $(awk -v r="$ram_gb" 'BEGIN { print (r < 20.0) }') )); then
        tier="MID"
    elif (( $(awk -v r="$ram_gb" 'BEGIN { print (r < 40.0) }') )); then
        tier="HIGH"
    else
        tier="ULTRA"
    fi
    
    # GPU bonus
    if [ "$gpu_type" = "nvidia" ] || [ "$gpu_type" = "amd" ] || [ "$gpu_type" = "metal" ]; then
        if [ "$vram_gb" -ge 8 ]; then
            # Upgrade one tier
            case $tier in
                MINIMAL) tier="LOW" ;;
                LOW) tier="MID" ;;
                MID) tier="HIGH" ;;
                HIGH) tier="ULTRA" ;;
            esac
        fi
    fi
    
    # Speed class
    case $tier in
        INSUFFICIENT) speed_class="INSUFFICIENT" ;;
        MINIMAL) speed_class="CPU_MARGINAL" ;;
        LOW) speed_class="LOW_CPU" ;;
        MID) 
            if [ "$gpu_type" = "none" ]; then
                speed_class="LOW_CPU"
            elif [ "$gpu_type" = "igpu" ] || [ "$gpu_type" = "quicksync" ]; then
                speed_class="IGPU_OK"
            else
                speed_class="GPU_GOOD"
            fi
            ;;
        HIGH|ULTRA) speed_class="GPU_GREAT" ;;
    esac
    
    echo "$tier $speed_class"
}

# =============================================================================
# MODEL SELECTION
# =============================================================================

select_models() {
    local tier=$1
    local gpu_type=$2
    
    local coding_model=""
    local general_model=""
    local quick_model=""
    
    case $tier in
        INSUFFICIENT)
            log_error "Insufficient RAM to run any model"
            return 1
            ;;
        MINIMAL)
            coding_model="qwen2.5-coder:3b"
            general_model="llama3.2:3b"
            quick_model="llama3.2:1b"
            ;;
        LOW)
            coding_model="qwen2.5-coder:3b"
            general_model="llama3.2:3b"
            quick_model="qwen2.5:3b"
            ;;
        MID)
            if [ "$gpu_type" = "none" ]; then
                coding_model="qwen2.5-coder:7b"
                general_model="llama3.2:8b"
                quick_model="phi4-mini:3.8b"
            else
                coding_model="qwen2.5-coder:7b"
                general_model="llama3.2:8b"
                quick_model="phi4-mini:3.8b"
            fi
            ;;
        HIGH)
            coding_model="qwen2.5-coder:14b"
            general_model="mistral-small:22b"
            quick_model="phi4-mini:3.8b"
            ;;
        ULTRA)
            coding_model="deepseek-r1-distill:14b"
            general_model="qwen2.5:32b"
            quick_model="phi4-mini:3.8b"
            ;;
    esac
    
    echo "$coding_model $general_model $quick_model"
}

# =============================================================================
# PERFORMANCE TUNING
# =============================================================================

calculate_threads() {
    local cores=$1
    local gpu_type=$2
    
    # Apple Silicon - use performance cores only
    if [ "$gpu_type" = "metal" ]; then
        if [ "$cores" -gt 8 ]; then
            echo "8"
        else
            echo "$cores"
        fi
        return
    fi
    
    # Formula: 75% of cores, max 12
    local threads=$((cores * 75 / 100))
    if [ "$threads" -lt 1 ]; then
        threads=1
    elif [ "$threads" -gt 12 ]; then
        threads=12
    fi
    
    echo "$threads"
}

# =============================================================================
# CONFIG FILE GENERATION
# =============================================================================

generate_config() {
    local output_file=$1
    local ram_gb=$2
    local cpu_cores=$3
    local gpu_type=$4
    local vram_gb=$5
    local tier=$6
    local speed_class=$7
    local coding_model=$8
    local general_model=$9
    local quick_model=${10}
    
    local threads
    threads=$(calculate_threads "$cpu_cores" "$gpu_type")
    
    # Calculate GPU layers
    local gpu_layers=0
    if [ "$gpu_type" = "nvidia" ] || [ "$gpu_type" = "amd" ]; then
        if [ "$vram_gb" -ge 6 ]; then
            gpu_layers=999  # Full offload
        fi
    elif [ "$gpu_type" = "metal" ]; then
        gpu_layers=999
    fi
    
    # Flash attention
    local flash_attn=0
    if [ "$gpu_type" = "nvidia" ] || [ "$gpu_type" = "metal" ]; then
        flash_attn=1
    fi
    
    cat > "$output_file" << EOF
# Homelab Configuration - Generated by onboard.sh
# $(date)

# =============================================================================
# HARDWARE CLASSIFICATION
# =============================================================================
SPEED_CLASS=$speed_class
RESOURCE_TIER=$tier

# =============================================================================
# OLLAMA MODELS
# =============================================================================
OLLAMA_DEFAULT_MODEL=$coding_model
OLLAMA_GENERAL_MODEL=$general_model
OLLAMA_QUICK_MODEL=$quick_model
OLLAMA_MODEL="$coding_model $general_model $quick_model"

# =============================================================================
# PERFORMANCE TUNING
# =============================================================================
OLLAMA_NUM_THREADS=$threads
OLLAMA_FLASH_ATTENTION=$flash_attn
OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_NUM_GPU=$gpu_layers
OLLAMA_KEEP_ALIVE=5m
OLLAMA_METAL=$([ "$gpu_type" = "metal" ] && echo 1 || echo 0)

# Context windows
OLLAMA_CTX_CODING=8192
OLLAMA_CTX_GENERAL=4096
OLLAMA_CTX_QUICK=2048

# =============================================================================
# AI MODE
# =============================================================================
AI_MODE=local
TRUST_MODE=supervised

# =============================================================================
# SERVICE TOGGLES
# =============================================================================
SERVICES_ENABLED=all
EOF
    
    log_info "Generated $output_file"
}

# =============================================================================
# EXPORT FUNCTIONS
# =============================================================================

export -f detect_ram detect_cpu_cores detect_gpu classify_hardware
export -f select_models calculate_threads generate_config
export -f log_info log_warn log_error log_step
