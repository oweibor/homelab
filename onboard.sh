#!/bin/bash
# =============================================================================
# HOMELAB ONBOARDING WIZARD v6
# Full-featured bash-based onboarding wizard
# =============================================================================

# =============================================================================
# WINDOWS DETECTION - Check if bash is available
# =============================================================================

# If bash is not available, show Windows installation guide
if ! command -v bash &>/dev/null; then
    clear
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║            HOMELAB ONBOARDING - BASH REQUIRED                       ║"
    echo "╚═══════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "This script requires bash, which is not available in your current environment."
    echo ""
    echo "You have TWO options to run this script on Windows:"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "OPTION 1: Git Bash (Recommended - Quick setup)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "1. Download: https://git-scm.com/download/win"
    echo "2. Run installer with default options"
    echo "3. After install, right-click in folder → 'Git Bash Here'"
    echo "4. Run: ./onboard.sh"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "OPTION 2: WSL (Full Linux in Windows)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "1. Open PowerShell as Administrator"
    echo "2. Run: wsl --install"
    echo "3. Restart computer when prompted"
    echo "4. In Ubuntu terminal: cd /mnt/c/Users/YOUR_USER/Desktop/homelab"
    echo "5. Run: ./onboard.sh"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "Type 'git' to open Git download page, or 'wsl' for WSL help: " CHOICE
    
    if [[ "$CHOICE" == "wsl" || "$CHOICE" == "WSL" ]]; then
        echo ""
        echo "In PowerShell (as Admin), run: wsl --install"
        echo "After restart, in Ubuntu: cd /mnt/c/Users/$(whoami)/Desktop/homelab && ./onboard.sh"
    else
        echo ""
        echo "Opening Git download page..."
        start https://git-scm.com/download/win
    fi
    echo ""
    echo "After installation, run: ./onboard.sh"
    exit 1
fi

set -euo pipefail

# =============================================================================
# COLORS & UI
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
CYAN='\033[0;96m'
MAGENTA='\033[0;95m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# =============================================================================
# SCRIPT DIRECTORY & HARDWARE DETECTION MODULE
# =============================================================================

# Resolve script directory - handles both ./onboard.sh and bash onboard.sh
BASE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# If BASE_DIR is empty or ".", use current working directory
if [ -z "$BASE_DIR" ] || [ "$BASE_DIR" = "." ]; then
    BASE_DIR="$(pwd)"
fi

echo "DEBUG: Initial BASE_DIR = $BASE_DIR"

# Source shared library for hardware detection, model selection, and config generation
if [ -f "$BASE_DIR/onboard-lib.sh" ]; then
    source "$BASE_DIR/onboard-lib.sh"
    log_info "Loaded onboard-lib.sh"
else
    log_warn "onboard-lib.sh not found, using inline functions"
fi

# Source hardware detection module
if [ -f "$BASE_DIR/scripts/hardware-detect.sh" ]; then
    source "$BASE_DIR/scripts/hardware-detect.sh"
    
    # Detect hardware profile (v2 with N305 support)
    HARDWARE_PROFILE=$(get_hardware_profile_v2)
    TOTAL_RAM_GB=$(get_total_ram_gb)
    GPU_VRAM_GB=$(get_gpu_vram_gb)
    NVIDIA_GPU_MODEL=$(get_nvidia_gpu_model)
    
    # Export hardware detection variables for use throughout script
    HAS_QUICKSYNC=$(has_quicksync)
    HAS_AVX2=$(has_avx2)
    HAS_AVX512=$(has_avx512)
    CSTATE_FLAGS=$(get_cstate_flags)
    CPU_FAMILY=$(detect_cpu_family)
    TDP_WATTS=$(get_tdp_watts)
    ENCODER_TYPE=$(get_encoder_type)
    
    # Source LLM mapping module
    if [ -f "$BASE_DIR/scripts/hardware-llm-map.sh" ]; then
        if source "$BASE_DIR/scripts/hardware-llm-map.sh"; then
            # Get hardware-aware LLM models
            LLM_MODELS=$(get_llm_models)
            
            # Parse model values using robust bash parameter expansion
            # Format: CODING=model:PLANNING=model:QUICK=model
            IFS=':' read -ra PARTS <<< "$LLM_MODELS"
            for part in "${PARTS[@]}"; do
                case "$part" in
                    CODING=*)
                        OLLAMA_MODEL_CODING="${part#CODING=}"
                        ;;
                    PLANNING=*)
                        OLLAMA_MODEL_PLANNING="${part#PLANNING=}"
                        ;;
                    QUICK=*)
                        OLLAMA_MODEL_QUICK="${part#QUICK=}"
                        ;;
                esac
            done
            
            log_info "Hardware-aware LLM models selected:"
            log_info "  Coding: $OLLAMA_MODEL_CODING"
            log_info "  Planning: $OLLAMA_MODEL_PLANNING"
            log_info "  Quick: $OLLAMA_MODEL_QUICK"
        else
            log_warn "Failed to source hardware-llm-map.sh, using defaults"
        fi
        
        # Export for Docker/container use
        export OLLAMA_MODEL_CODING OLLAMA_MODEL_PLANNING OLLAMA_MODEL_QUICK
    fi
else
    log_warn "hardware-detect.sh not found, using legacy detection"
    HARDWARE_PROFILE="unknown"
    HAS_QUICKSYNC=0
    HAS_AVX2=0
    HAS_AVX512=0
    CSTATE_FLAGS=""
    CPU_FAMILY="UNKNOWN"
    TDP_WATTS=15
    ENCODER_TYPE="none"
fi

# Spinner
spin() {
    local pid=$1
    local msg=$2
    local chars="/-\|"
    while kill -0 $pid 2>/dev/null; do
        for (( i=0; i<${#chars}; i++ )); do
            printf "\r%s %s" "${chars:$i:1}" "$msg"
            sleep 0.1
        done
    done
    printf "\r"
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

preflight_checks() {
    log_info "In preflight_checks, BASE_DIR = $BASE_DIR"
    log_step "Running pre-flight checks..."
    
    # Check if running as root or with sudo
    local is_root=0
    if [ "$EUID" -eq 0 ]; then
        is_root=1
    fi
    
    # Determine actual user
    if [ -n "${SUDO_USER:-}" ]; then
        ACTUAL_USER="$SUDO_USER"
    elif [ -n "${USERNAME:-}" ]; then
        ACTUAL_USER="$USERNAME"
    elif [ -n "${USER:-}" ]; then
        ACTUAL_USER="$USER"
    else
        ACTUAL_USER="$(whoami)"
    fi
    
    if [ -z "$ACTUAL_USER" ] || [ "$ACTUAL_USER" = "root" ]; then
        if [ "$is_root" -eq 1 ]; then
            # Running as root directly - allow for testing
            log_warn "Running as root directly (not via sudo) - some features may not work"
            ACTUAL_USER="$USER"
        else
            log_error "Cannot determine non-root user"
            exit 1
        fi
    fi
    
    # Check required files
    # BASE_DIR already defined at top of script
    log_info "Checking for setup.sh in: $BASE_DIR"
    if [ ! -f "$BASE_DIR/setup.sh" ]; then
        log_error "setup.sh not found in $BASE_DIR"
        # Try alternative paths
        if [ -f "./setup.sh" ]; then
            log_info "Found setup.sh in current directory"
        fi
        ls -la "$BASE_DIR/" 2>/dev/null || log_error "Cannot list BASE_DIR contents"
        exit 1
    fi
    
    # Check disk space (10GB minimum)
    local available_gb
    available_gb=$(df -P "$BASE_DIR" | tail -1 | awk '{print int($4/1024/1024)}')
    if [ "$available_gb" -lt 10 ]; then
        log_error "Insufficient disk space: ${available_gb}GB (need 10GB)"
        exit 1
    fi
    
    log_info "Pre-flight checks passed (user: $ACTUAL_USER)"
}

# =============================================================================
# HARDWARE DETECTION
# =============================================================================

detect_hardware() {
    log_step "Detecting hardware..."
    
    # RAM
    local ram_kb
    ram_kb=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}')
    RAM_GB=$(echo "scale=1; ${ram_kb:-3145728} / 1024 / 1024" | bc 2>/dev/null || echo "3")
    EFFECTIVE_RAM=$(echo "scale=1; $RAM_GB - 2.0" | bc 2>/dev/null || echo "1")
    if (( $(echo "$EFFECTIVE_RAM < 0" | bc -l 2>/dev/null || echo 0) )); then
        EFFECTIVE_RAM=1
    fi
    
    # CPU cores
    CPU_CORES=$(lscpu 2>/dev/null | awk '/^Core\(s\) per socket/{c=$NF} /^Socket\(s\)/{s=$NF} END{print c*s}' || echo "4")
    CPU_CORES=${CPU_CORES:-4}
    
    # GPU detection
    GPU_TYPE="none"
    VRAM_GB=0
    
    # NVIDIA
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        GPU_TYPE="nvidia"
        VRAM_GB=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | awk '{print int($1/1024)}')
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    fi
    
    # AMD ROCm
    if [ "$GPU_TYPE" = "none" ] && command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null 2>&1; then
            GPU_TYPE="amd"
            local vram_free
            vram_free=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Free Memory" | awk '{print $NF}' | head -1)
            if [ -n "$vram_free" ]; then
                VRAM_GB=$((vram_free / 1024))
            fi
        fi
    fi
    
    # Apple Silicon
    if [ "$GPU_TYPE" = "none" ] && command -v system_profiler &>/dev/null; then
        local chip
        chip=$(system_profiler SPHardwareDataType 2>/dev/null | grep 'Chip' | awk '{print $NF}')
        if [[ "$chip" =~ Apple ]]; then
            GPU_TYPE="metal"
            local total_mem
            total_mem=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1073741824}')
            VRAM_GB=$((total_mem - 2))
        fi
    fi
    
    # Intel iGPU with QuickSync support
    if [ "$GPU_TYPE" = "none" ] && lspci 2>/dev/null | grep -qi "vga.*intel"; then
        # Check if QuickSync is available for hardware acceleration
        if [ "$HAS_QUICKSYNC" = "1" ]; then
            GPU_TYPE="quicksync"
        else
            GPU_TYPE="igpu"
        fi
        VRAM_GB=1
    fi
    
    # Classify hardware
    classify_hardware
    
    log_info "Detected: ${RAM_GB}GB RAM, ${CPU_CORES} cores, ${GPU_TYPE:-none} (${VRAM_GB}GB VRAM), Profile: ${HARDWARE_PROFILE}"
    log_info "CPU Features: QuickSync=${HAS_QUICKSYNC}, AVX2=${HAS_AVX2}, AVX512=${HAS_AVX512}, TDP=${TDP_WATTS}W"
}

# =============================================================================
# HARDWARE CLASSIFICATION
# =============================================================================

classify_hardware() {
    # Determine tier
    if (( $(echo "$EFFECTIVE_RAM < 1" | bc -l 2>/dev/null || echo 1) )); then
        TIER="INSUFFICIENT"
    elif (( $(echo "$EFFECTIVE_RAM < 4" | bc -l 2>/dev/null || echo 0) )); then
        TIER="MINIMAL"
    elif (( $(echo "$EFFECTIVE_RAM < 8" | bc -l 2>/dev/null || echo 0) )); then
        TIER="LOW"
    elif (( $(echo "$EFFECTIVE_RAM < 16" | bc -l 2>/dev/null || echo 0) )); then
        TIER="MID"
    elif (( $(echo "$EFFECTIVE_RAM < 32" | bc -l 2>/dev/null || echo 0) )); then
        TIER="HIGH"
    else
        TIER="ULTRA"
    fi
    
    # GPU bonus
    if [ "$GPU_TYPE" = "nvidia" ] || [ "$GPU_TYPE" = "amd" ] || [ "$GPU_TYPE" = "metal" ]; then
        if [ "$VRAM_GB" -ge 8 ]; then
            case $TIER in
                MINIMAL) TIER="LOW" ;;
                LOW) TIER="MID" ;;
                MID) TIER="HIGH" ;;
                HIGH) TIER="ULTRA" ;;
            esac
        fi
    fi
    
    # Speed class
    case $TIER in
        INSUFFICIENT) SPEED_CLASS="INSUFFICIENT" ;;
        MINIMAL) SPEED_CLASS="CPU_MARGINAL" ;;
        LOW) SPEED_CLASS="LOW_CPU" ;;
        MID)
            if [ "$GPU_TYPE" = "none" ]; then
                SPEED_CLASS="LOW_CPU"
            elif [ "$GPU_TYPE" = "igpu" ] || [ "$GPU_TYPE" = "quicksync" ]; then
                SPEED_CLASS="IGPU_OK"
            else
                SPEED_CLASS="GPU_GOOD"
            fi
            ;;
        HIGH|ULTRA) SPEED_CLASS="GPU_GREAT" ;;
        *) SPEED_CLASS="UNKNOWN" ;;
    esac
}

# =============================================================================
# MODEL SELECTION
# =============================================================================

select_models() {
    log_step "Selecting models for $TIER tier..."
    
    case $TIER in
        INSUFFICIENT)
            log_error "Insufficient RAM to run AI models"
            exit 1
            ;;
        MINIMAL)
            CODING_MODEL="qwen2.5-coder:3b"
            GENERAL_MODEL="llama3.2:3b"
            QUICK_MODEL="llama3.2:1b"
            ;;
        LOW)
            CODING_MODEL="qwen2.5-coder:3b"
            GENERAL_MODEL="llama3.2:3b"
            QUICK_MODEL="qwen2.5:3b"
            ;;
        MID)
            if [ "$GPU_TYPE" = "none" ]; then
                CODING_MODEL="qwen2.5-coder:7b"
                GENERAL_MODEL="llama3.2:8b"
                QUICK_MODEL="phi4-mini:3.8b"
            else
                CODING_MODEL="qwen2.5-coder:7b"
                GENERAL_MODEL="llama3.2:8b"
                QUICK_MODEL="phi4-mini:3.8b"
            fi
            ;;
        HIGH)
            CODING_MODEL="qwen2.5-coder:14b"
            GENERAL_MODEL="mistral-small:22b"
            QUICK_MODEL="phi4-mini:3.8b"
            ;;
        ULTRA)
            CODING_MODEL="deepseek-r1-distill:14b"
            GENERAL_MODEL="qwen2.5:32b"
            QUICK_MODEL="phi4-mini:3.8b"
            ;;
    esac
    
    log_info "Selected: $CODING_MODEL (coding), $GENERAL_MODEL (general), $QUICK_MODEL (quick)"
}

# =============================================================================
# PERFORMANCE CALCULATIONS
# =============================================================================

calculate_performance() {
    # Threads
    if [ "$GPU_TYPE" = "metal" ]; then
        if [ "$CPU_CORES" -gt 8 ]; then
            OLLAMA_THREADS=8
        else
            OLLAMA_THREADS=$CPU_CORES
        fi
    else
        OLLAMA_THREADS=$((CPU_CORES * 75 / 100))
        [ "$OLLAMA_THREADS" -lt 1 ] && OLLAMA_THREADS=1
        [ "$OLLAMA_THREADS" -gt 12 ] && OLLAMA_THREADS=12
    fi
    
    # GPU layers
    OLLAMA_NUM_GPU=0
    if [ "$GPU_TYPE" = "nvidia" ] || [ "$GPU_TYPE" = "amd" ]; then
        [ "$VRAM_GB" -ge 6 ] && OLLAMA_NUM_GPU=999
    elif [ "$GPU_TYPE" = "metal" ]; then
        OLLAMA_NUM_GPU=999
    fi
    
    # Flash attention - enable for GPU or when CPU has AVX2/AVX512
    if [ "$GPU_TYPE" = "nvidia" ] || [ "$GPU_TYPE" = "metal" ]; then
        FLASH_ATTN=1
    elif [ "$HAS_AVX2" = "1" ] || [ "$HAS_AVX512" = "1" ]; then
        FLASH_ATTN=1
    else
        FLASH_ATTN=0
    fi
    
    # Metal
    [ "$GPU_TYPE" = "metal" ] && METAL=1 || METAL=0
    
    # QuickSync optimization - reduce threads for iGPU encoding
    if [ "$GPU_TYPE" = "quicksync" ]; then
        # QuickSync uses iGPU for encoding, limit CPU threads
        [ "$OLLAMA_THREADS" -gt 4 ] && OLLAMA_THREADS=4
    fi
}

# =============================================================================
# DISPLAY FUNCTIONS
# =============================================================================

show_banner() {
    clear
    echo ""
    echo -e "${CYAN}██╗  ██╗ ██████╗ ███╗   ███╗███████╗██╗      █████╗ ██████╗${NC}"
    echo -e "${CYAN}██║  ██║██╔═══██╗████╗ ████║██╔════╝██║     ██╔══██╗██╔══██╗${NC}"
    echo -e "${CYAN}██████║██║   ██║██╔████╔██║█████╗  ██║     ███████║██████╔╝${NC}"
    echo -e "${CYAN}██╔══██║██║   ██║██║╚██╔╝██║██╔══╝  ██║     ██╔══██║██╔══██╗${NC}"
    echo -e "${CYAN}██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗███████╗██║  ██║██████╔╝${NC}"
    echo -e "${CYAN}╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝${NC}"
    echo ""
    echo -e "${MAGENTA}                HOMELAB ONBOARDING WIZARD v6${NC}"
    echo ""
    echo ""
}

show_hardware_summary() {
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    printf "  │  %-20s %-35s │\n" "RAM:" "${RAM_GB}GB available (${EFFECTIVE_RAM}GB effective)"
    printf "  │  %-20s %-35s │\n" "CPU:" "${CPU_CORES} physical cores"
    printf "  │  %-20s %-35s │\n" "GPU:" "${GPU_TYPE:-none} (${VRAM_GB}GB VRAM)"
    echo "  ├─────────────────────────────────────────────────────────────┤"
    printf "  │  %-20s %-35s │\n" "Profile:" "${HARDWARE_PROFILE}"
    printf "  │  %-20s %-35s │\n" "Tier:" "$TIER"
    printf "  │  %-20s %-35s │\n" "Speed Class:" "$SPEED_CLASS"
    echo "  ├─────────────────────────────────────────────────────────────┤"
    printf "  │  %-20s %-35s │\n" "QuickSync:" "${HAS_QUICKSYNC}"
    printf "  │  %-20s %-35s │\n" "AVX2:" "${HAS_AVX2}"
    printf "  │  %-20s %-35s │\n" "TDP:" "${TDP_WATTS}W"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
}

show_model_selection() {
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  MODEL SELECTION                                          │"
    echo "  ├─────────────────────────────────────────────────────────────┤"
    printf "  │  %-15s %-35s │\n" "Coding:" "$CODING_MODEL"
    printf "  │  %-15s %-35s │\n" "General:" "$GENERAL_MODEL"
    printf "  │  %-15s %-35s │\n" "Quick:" "$QUICK_MODEL"
    echo "  ├─────────────────────────────────────────────────────────────┤"
    printf "  │  %-15s %-35s │\n" "Threads:" "$OLLAMA_THREADS"
    printf "  │  %-15s %-35s │\n" "GPU Layers:" "$OLLAMA_NUM_GPU"
    printf "  │  %-15s %-35s │\n" "Flash Attention:" "$FLASH_ATTN"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
}

# =============================================================================
# INTERACTIVE MENUS
# =============================================================================

select_mode() {
    echo "  Select Setup Mode:"
    echo ""
    echo "    1) QuickStart    - ~90 sec - Auto hardware, no cloud, all defaults"
    echo "    2) Full Setup   - ~15 min - All options interactively"
    echo "    3) Restore      - Load existing config.env"
    echo ""
    read -p "  Select [1]: " MODE_CHOICE
    MODE_CHOICE="${MODE_CHOICE:-1}"
}

select_ai_mode() {
    echo ""
    echo "  Select AI Mode:"
    echo ""
    echo "    1) local          - Ollama only (default, privacy-first)"
    echo "    2) hybrid         - Ollama + cloud fallback"
    echo "    3) cloud-primary  - Cloud first, Ollama fallback"
    echo ""
    read -p "  Select [1]: " AI_CHOICE
    AI_CHOICE="${AI_CHOICE:-1}"
    
    case $AI_CHOICE in
        1) AI_MODE="local" ;;
        2) AI_MODE="hybrid" ;;
        3) AI_MODE="cloud-primary" ;;
        *) AI_MODE="local" ;;
    esac
}

select_trust_mode() {
    echo ""
    echo "  Select Trust Mode (Kilo pipeline):"
    echo ""
    echo "    1) supervised   - All gate failures pause for approval (recommended)"
    echo "    2) graduated    - Deterministic changes auto-promote, risky → staging"
    echo "    3) autonomous   - Pipeline never pauses, all gates advisory"
    echo ""
    read -p "  Select [1]: " TRUST_CHOICE
    TRUST_CHOICE="${TRUST_CHOICE:-1}"
    
    case $TRUST_CHOICE in
        1) TRUST_MODE="supervised" ;;
        2) TRUST_MODE="graduated" ;;
        3) TRUST_MODE="autonomous" ;;
        *) TRUST_MODE="supervised" ;;
    esac
}

confirm_review() {
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  REVIEW & CONFIRM                                          │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  Hardware:  $RAM_GB GB RAM | $CPU_CORES cores | $GPU_TYPE | $TIER tier"
    echo "  Models:   $CODING_MODEL | $GENERAL_MODEL | $QUICK_MODEL"
    echo "  AI Mode:  $AI_MODE"
    echo "  Trust:    $TRUST_MODE"
    echo ""
    read -p "  Write config and continue? [Y/n]: " CONFIRM
    CONFIRM="${CONFIRM:-y}"
    
    if [[ ! "$CONFIRM" =~ ^[Yy] ]]; then
        log_info "Aborted."
        exit 0
    fi
}

# =============================================================================
# CONFIG GENERATION
# =============================================================================

generate_config() {
    log_step "Generating configuration..."
    
    local config_file="$BASE_DIR/config.env"
    
    # Backup existing config if present
    if [ -f "$config_file" ]; then
        log_warn "Existing config found, backing up to config.env.bak"
        cp "$config_file" "$config_file.bak"
    fi
    
    # Determine Plex/Jellyfin hardware acceleration settings
    local PLEX_HW="disabled"
    local JELLYFIN_HW="None"
    local PLEX_TRANSCODE="0"
    local JELLYFIN_TRANSCODE="0"
    
    case "$ENCODER_TYPE" in
        nvenc)
            PLEX_HW="nv"
            JELLYFIN_HW="NVIDIA"
            PLEX_TRANSCODE="1"
            JELLYFIN_TRANSCODE="1"
            ;;
        amf)
            PLEX_HW="vaapi"
            JELLYFIN_HW="AMD"
            PLEX_TRANSCODE="1"
            JELLYFIN_TRANSCODE="1"
            ;;
        videotoolbox)
            PLEX_HW="qs"
            JELLYFIN_HW="AppleVT"
            PLEX_TRANSCODE="1"
            JELLYFIN_TRANSCODE="1"
            ;;
        quicksync)
            PLEX_HW="qs"
            JELLYFIN_HW="QSV"
            PLEX_TRANSCODE="1"
            JELLYFIN_TRANSCODE="1"
            ;;
        vaapi)
            PLEX_HW="vaapi"
            JELLYFIN_HW="VAAPI"
            PLEX_TRANSCODE="1"
            JELLYFIN_TRANSCODE="1"
            ;;
    esac
    
    cat > "$config_file" << EOF
# Homelab Configuration - Generated by onboard.sh
# $(date)

# =============================================================================
# HARDWARE CLASSIFICATION
# =============================================================================
SPEED_CLASS=$SPEED_CLASS
RESOURCE_TIER=$TIER
HARDWARE_PROFILE=$HARDWARE_PROFILE
CPU_FAMILY=$CPU_FAMILY

# =============================================================================
# CPU CAPABILITIES
# =============================================================================
HAS_QUICKSYNC=$HAS_QUICKSYNC
HAS_AVX2=$HAS_AVX2
HAS_AVX512=$HAS_AVX512
TDP_WATTS=$TDP_WATTS
CSTATE_FLAGS="$CSTATE_FLAGS"

# =============================================================================
# GPU & STREAMING
# =============================================================================
GPU_VRAM_GB=$VRAM_GB
ENCODER_TYPE=$ENCODER_TYPE
PLEX_HW_ACCEL=$PLEX_HW
JELLYFIN_HW_ACCEL=$JELLYFIN_HW
PLEX_TRANSCODE_HW=$PLEX_TRANSCODE
JELLYFIN_TRANSCODE_HW=$JELLYFIN_TRANSCODE

# =============================================================================
# OLLAMA MODELS
# =============================================================================
OLLAMA_DEFAULT_MODEL=$CODING_MODEL
OLLAMA_GENERAL_MODEL=$GENERAL_MODEL
OLLAMA_QUICK_MODEL=$QUICK_MODEL
OLLAMA_MODEL="$CODING_MODEL $GENERAL_MODEL $QUICK_MODEL"

# =============================================================================
# PERFORMANCE TUNING
# =============================================================================
OLLAMA_NUM_THREADS=$OLLAMA_THREADS
OLLAMA_FLASH_ATTENTION=$FLASH_ATTN
OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_NUM_GPU=$OLLAMA_NUM_GPU
OLLAMA_KEEP_ALIVE=5m
OLLAMA_METAL=$METAL

# Context windows
OLLAMA_CTX_CODING=8192
OLLAMA_CTX_GENERAL=4096
OLLAMA_CTX_QUICK=2048

# =============================================================================
# AI MODE & TRUST
# =============================================================================
AI_MODE=$AI_MODE
TRUST_MODE=$TRUST_MODE

# =============================================================================
# SERVICE TOGGLES
# =============================================================================
SERVICES_ENABLED=all
EOF
    
    log_success "Configuration written to $config_file"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    show_banner
    
    # Pre-flight
    preflight_checks
    
    # Detect hardware
    detect_hardware
    
    # Show hardware
    show_hardware_summary
    
    # Select mode
    select_mode
    
    if [ "$MODE_CHOICE" = "3" ]; then
        # Restore mode
        if [ -f "$BASE_DIR/config.env" ]; then
            log_info "Loading existing config..."
            . "$BASE_DIR/config.env"
        else
            log_error "No config.env found"
            exit 1
        fi
    else
        # Auto-select models
        select_models
        calculate_performance
        show_model_selection
        
        if [ "$MODE_CHOICE" = "2" ]; then
            # Full mode - let user customize
            select_ai_mode
            select_trust_mode
        else
            # QuickStart - use defaults
            AI_MODE="local"
            TRUST_MODE="supervised"
        fi
        
        # Review
        confirm_review
        
        # Generate
        generate_config
    fi
    
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  Configuration complete!                                     │"
    echo "  │                                                             │"
    echo "  │  Next steps:                                                │"
    echo "  │    sudo ./setup.sh                                          │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
}

main "$@"
