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
# ENVIRONMENT SANITIZATION
# =============================================================================
# Ensure a basic stable PATH
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

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
# Use a more robust absolute path resolution
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [ -z "$BASE_DIR" ] || [ "$BASE_DIR" = "." ]; then
    BASE_DIR="$(pwd -P)"
fi

# Export for sub-shells if needed
export BASE_DIR

# Source shared library for hardware detection, model selection, and config generation
if [ -f "$BASE_DIR/onboard-lib.sh" ]; then
    # shellcheck source=./onboard-lib.sh
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
    log_info "Checking for setup.sh in: $BASE_DIR"
    if [ ! -f "$BASE_DIR/setup.sh" ]; then
        log_error "setup.sh not found in $BASE_DIR"
        # Try relative as fallback
        if [ -f "./setup.sh" ]; then
            BASE_DIR="$(pwd -P)"
            log_info "Re-resolved BASE_DIR to: $BASE_DIR"
        else
            ls -la "$BASE_DIR/" 2>/dev/null || log_error "Cannot list BASE_DIR contents"
            exit 1
        fi
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

# Wrapper: Unified hardware detection
detect_hardware() {
    log_step "Detecting hardware..."
    
    # RAM
    RAM_GB=$(detect_ram)
    EFFECTIVE_RAM=$(awk -v r="$RAM_GB" 'BEGIN { printf "%.1f", r - 2.0 }')
    # Ensure it's not negative
    if (( $(awk -v e="$EFFECTIVE_RAM" 'BEGIN { print (e < 0.0) }') )); then
        EFFECTIVE_RAM="0.0"
    fi
    
    CPU_CORES=$(detect_cpu_cores)
    
    # GPU detection (returns "type vram")
    read -r GPU_TYPE VRAM_GB <<< "$(detect_gpu)"
    
    # Classification
    read -r TIER SPEED_CLASS <<< "$(classify_hardware "$RAM_GB" "$CPU_CORES" "$GPU_TYPE" "$VRAM_GB")"
    
    # Profile (already detected at top level, but ensure it's synced)
    HARDWARE_PROFILE=$(get_hardware_profile_v2)
    
    log_info "Detected: ${RAM_GB}GB RAM, ${CPU_CORES} cores, ${GPU_TYPE:-none} (${VRAM_GB}GB VRAM), Profile: ${HARDWARE_PROFILE}"
    log_info "Classification: Tier=$TIER, Speed Class=$SPEED_CLASS"
}

# Wrapper: Model selection
select_models_wrapped() {
    log_step "Selecting optimal models for $TIER tier..."
    
    # Use library function (returns "coding general quick")
    read -r CODING_MODEL GENERAL_MODEL QUICK_MODEL <<< "$(select_models "$TIER" "$GPU_TYPE")"
    
    log_info "Selected: $CODING_MODEL (coding), $GENERAL_MODEL (general), $QUICK_MODEL (quick)"
}

# Wrapper: Performance calculation
calculate_performance_wrapped() {
    log_step "Calculating performance parameters..."
    
    OLLAMA_THREADS=$(calculate_threads "$CPU_CORES" "$GPU_TYPE")
    
    # GPU layers and Flash Attention
    OLLAMA_NUM_GPU=0
    if [[ "$GPU_TYPE" == "nvidia" || "$GPU_TYPE" == "amd" || "$GPU_TYPE" == "metal" ]]; then
        if [ "$VRAM_GB" -ge 6 ]; then
            OLLAMA_NUM_GPU=999
        fi
    fi
    
    FLASH_ATTN=0
    if [[ "$GPU_TYPE" == "nvidia" || "$GPU_TYPE" == "metal" || "$HAS_AVX2" == "1" ]]; then
        FLASH_ATTN=1
    fi
    
    METAL=0
    if [ "$GPU_TYPE" = "metal" ]; then METAL=1; fi
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
        select_models_wrapped
        calculate_performance_wrapped
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
    read -p "  Configuration complete! Start setup.sh now? [y/N]: " START_SETUP
    if [[ "$START_SETUP" =~ ^[Yy]$ ]]; then
        echo ""
        log_info "Preparing to launch setup.sh..."
        
        # Absolute path verification
        local setup_path="$BASE_DIR/setup.sh"
        if [ ! -f "$setup_path" ]; then
            log_error "Critical: setup.sh not found at: $setup_path"
            exit 1
        fi
        
        # Check for Windows/Git Bash environment
        local is_windows=0
        if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" ]]; then
            is_windows=1
        fi
        
        # Execution logic
        if [ "$is_windows" -eq 1 ]; then
            log_info "Windows detected, launching directly with bash: $setup_path"
            # Use 'bash' explicitly to avoid execution bit issues
            exec bash "$setup_path"
        elif command -v sudo >/dev/null 2>&1; then
            log_info "Launching with sudo: $setup_path"
            # Use 'sudo bash' to ensure script runs in bash even if sudo environment is restricted
            exec sudo bash "$setup_path"
        else
            log_warn "sudo not found in PATH."
            if [ "$EUID" -eq 0 ]; then
                log_info "Already running as root, launching directly..."
                exec bash "$setup_path"
            else
                log_error "This script requires root privileges. Please run: sudo ./setup.sh"
                exit 1
            fi
        fi
    else
        echo ""
        echo "  ┌─────────────────────────────────────────────────────────────┐"
        echo "  │  Configuration complete!                                     │"
        echo "  │                                                             │"
        echo "  │  Next steps:                                                │"
        echo "  │    sudo ./setup.sh                                          │"
        echo "  └─────────────────────────────────────────────────────────────┘"
        echo ""
    fi
}

main "$@"
