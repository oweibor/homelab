#!/bin/bash
# ==========================================================
# COMPLETE LOW-POWER X86 OWEIBO SETUP SCRIPT
# System Configuration + Bluetooth + Static IP + Docker Stack
# Intel N-series (N95/N97/N100/N200) / Ubuntu Server 24.04+
# ==========================================================

set -euo pipefail

# ============================================
# COLOR CODES & LOGGING
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

# ============================================
# HELPER FUNCTIONS
# ============================================

# Source hardware detection module with fallback
# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR

# Initial log (config.env check is now handled in main())
log_info "Initializing Oweibo Setup Stack..."

# Source hardware detection module with fallback (matching onboard.sh)
if [ -f "$SCRIPT_DIR/onboard-lib.sh" ]; then
    source "$SCRIPT_DIR/onboard-lib.sh"
    log_info "Loaded onboard-lib.sh"
fi

if [ -f "$SCRIPT_DIR/scripts/hardware-detect.sh" ]; then
    source "$SCRIPT_DIR/scripts/hardware-detect.sh"
    
    # Detect hardware profile
    HARDWARE_PROFILE=$(get_hardware_profile_v2)
    log_info "Detected hardware profile: $HARDWARE_PROFILE"
fi

# ============================================
# ONBOARDING WIZARD FUNCTIONS
# ============================================

run_onboarding_wizard() {
    log_step "Starting Oweibo Onboarding Wizard..."
    
    # 1. Physical detection
    local RAM_GB=$(detect_ram)
    local CPU_CORES=$(detect_cpu_cores)
    local GPU_RES=$(detect_gpu)
    local GPU_TYPE=$(echo "$GPU_RES" | awk '{print $1}')
    local VRAM_GB=$(echo "$GPU_RES" | awk '{print $2}')
    
    # 2. Classification
    local CLASS_RES=$(classify_hardware "$RAM_GB" "$CPU_CORES" "$GPU_TYPE" "$VRAM_GB")
    local TIER=$(echo $CLASS_RES | awk '{print $1}')
    local SPEED_CLASS=$(echo $CLASS_RES | awk '{print $2}')
    
    # 3. Interactive Selection (Wizard Style)
    echo ""
    echo "  Detected Hardware Summary:"
    echo "  - RAM: $RAM_GB GB"
    echo "  - CPU: $CPU_CORES cores"
    echo "  - GPU: $GPU_TYPE ($VRAM_GB GB VRAM)"
    echo "  - Tier: $TIER ($SPEED_CLASS)"
    echo ""
    
    echo "  Select Setup Mode:"
    echo "    1) QuickStart - Use auto hardware defaults (Recommended)"
    echo "    2) Custom     - Interactively choose models and modes"
    echo ""
    read -p "  Select [1]: " MODE_CHOICE
    MODE_CHOICE="${MODE_CHOICE:-1}"
    
    local CODING_MODEL GENERAL_MODEL QUICK_MODEL
    local AI_MODE="local"
    local TRUST_MODE="supervised"

    if [ "$MODE_CHOICE" = "2" ]; then
        # Actually choose models from tiers
        # (Simplified for now - can use select_models library function)
        read -r CODING_MODEL GENERAL_MODEL QUICK_MODEL <<< "$(select_models "$TIER" "$GPU_TYPE")"
        
        echo ""
        echo "  Default Models for your system:"
        echo "  - Coding: $CODING_MODEL"
        echo "  - General: $GENERAL_MODEL"
        echo "  - Quick: $QUICK_MODEL"
        echo ""
        read -p "  Use these models? [Y/n]: " MODEL_CONFIRM
        if [[ ! "${MODEL_CONFIRM:-y}" =~ ^[Yy] ]]; then
            while true; do
                read -p "  Enter Coding Model: " CODING_MODEL
                read -p "  Enter General Model: " GENERAL_MODEL
                read -p "  Enter Quick Model: " QUICK_MODEL
                if [[ "$CODING_MODEL" =~ ^[a-zA-Z0-9:\.-]+$ ]] && \
                   [[ "$GENERAL_MODEL" =~ ^[a-zA-Z0-9:\.-]+$ ]] && \
                   [[ "$QUICK_MODEL" =~ ^[a-zA-Z0-9:\.-]+$ ]]; then
                    break
                else
                    echo "  [!] Invalid model format. Use alphanumeric characters, colons, or dashes."
                fi
            done
        fi
        
        echo ""
        echo "  Select AI Mode: (1: local, 2: hybrid)"
        read -p "  Select [1]: " AI_VAL
        [ "$AI_VAL" = "2" ] && AI_MODE="hybrid" || AI_MODE="local"
    else
        # QuickStart
        read -r CODING_MODEL GENERAL_MODEL QUICK_MODEL <<< "$(select_models "$TIER" "$GPU_TYPE")"
    fi
    
    # 4. Config writing
    generate_config "$SCRIPT_DIR/config.env" \
        "$RAM_GB" "$CPU_CORES" "$GPU_TYPE" "$VRAM_GB" \
        "$TIER" "$SPEED_CLASS" \
        "$CODING_MODEL" "$GENERAL_MODEL" "$QUICK_MODEL"
    
    log_success "Onboarding complete! Configuration saved to config.env"
}

# Classic spinner (fallback)
show_spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while kill -0 "$pid" 2>/dev/null; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Fancy Braille spinner with message
show_fancy_spinner() {
    local pid=$1
    local message=${2:-"Working..."}
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local i=0
    
    while kill -0 $pid 2>/dev/null; do
        printf "\r  ${BLUE}${frames[i]}${NC} %s " "$message"
        i=$(( (i + 1) % ${#frames[@]} ))
        sleep 0.1
    done
    wait $pid 2>/dev/null
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        printf "\r  ${GREEN}✓${NC} %s \n" "$message"
    else
        printf "\r  ${RED}✗${NC} %s \n" "$message"
    fi
    return $exit_code
}

# Progress bar with percentage
show_progress_bar() {
    local current=$1
    local total=$2
    local label=${3:-"Progress"}
    local width=40
    local pct=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r  ${BLUE}▶${NC} %s [" "$label"
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%%" "$pct"
    
    if [ $current -eq $total ]; then
        echo ""
    fi
}

# Box-styled step header
show_step_header() {
    local step_num=$1
    local step_name=$2
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    printf "  │  ${BLUE}STEP %s${NC}: %-51s │\n" "$step_num" "$step_name"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
}

# Success banner
show_success_banner() {
    local message=$1
    echo ""
    echo "  ╔═════════════════════════════════════════════════════════════╗"
    printf "  ║  ${GREEN}✓${NC} %-57s ║\n" "$message"
    echo "  ╚═════════════════════════════════════════════════════════════╝"
    echo ""
}


# ============================================
# ERROR HANDLING & CLEANUP
# ============================================
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Script encountered an error (exit code: $exit_code)"
        
        # Only rollback network if we actually changed it and made a backup
        if [ -d /etc/netplan/backup ] && [ "$(ls -A /etc/netplan/backup 2>/dev/null)" ]; then
            log_warn "Restoring network configuration backup..."
            # Remove only the file we likely created
            rm -f /etc/netplan/99-oweibo-static.yaml 2>/dev/null || true
            # Restore backups
            cp -a /etc/netplan/backup/*.yaml /etc/netplan/ 2>/dev/null || true
            netplan apply 2>/dev/null || true
            log_info "Backup restored."
        fi

        # Note: We intentionally do not run `docker compose down` here.
        # Tearing down the stack on a failed update could destroy a working production environment.
        if [ -n "${OWEIBO_DIR:-}" ] && [ -f "$OWEIBO_DIR/docker-compose.yml" ]; then
            log_warn "If containers were partially deployed, they have been left running to prevent data loss."
        fi
        log_error "Setup failed. Check logs above for details."
    fi
    exit $exit_code
}
trap cleanup EXIT

# ============================================
# SYSTEM SETUP LOGIC
# ============================================

run_setup() {
    log_info "Starting system setup logic..."
    
    # Get the actual user who ran sudo/script
    # If in sudo, SUDO_USER is set. Otherwise use get_actual_user if available
    if [ -f "$SCRIPT_DIR/onboard-lib.sh" ]; then
        ACTUAL_USER=$(get_actual_user)
    else
        ACTUAL_USER="${SUDO_USER:-$(whoami)}"
    fi
    
    if [ -z "$ACTUAL_USER" ] || [ "$ACTUAL_USER" = "root" ]; then
        log_error "Cannot determine non-root user. Please run with sudo."
        exit 1
    fi

USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
if [ -z "$USER_HOME" ] || [ ! -d "$USER_HOME" ]; then
    log_error "Cannot determine home directory for $ACTUAL_USER"
    exit 1
fi

# Check available disk space (need at least 10GB)
# Use /home partition or root if /home is on root
CHECK_DIR="$USER_HOME"
AVAILABLE_GB=$(df -P "$CHECK_DIR" | tail -1 | awk '{print int($4/1024/1024)}')
if [ "$AVAILABLE_GB" -lt 10 ]; then
    log_error "Insufficient disk space. Need 10GB, have ${AVAILABLE_GB}GB in $CHECK_DIR"
    log_error "Free up space and try again"
    exit 1
fi
log_info "Disk space check: ${AVAILABLE_GB}GB available"

# ============================================
# VALIDATE IP FUNCTION
# ============================================
validate_ip() {
    local ip=${1:-}
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        IFS='.' read -r -a octets <<< "$ip"
        for octet in "${octets[@]}"; do
            if [ "$octet" -gt 255 ]; then
                return 1
            fi
        done
        return 0
    fi
    return 1
}
# ============================================
# BANNER
# ============================================
clear
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │       AUTONOMOUS AGENT FACTORY — SETUP SCRIPT               │"
echo "  │                                                            │"
echo "  │  This script will configure:                               │"
echo "  │  1. System updates & dependencies                          │"
echo "  │  2. Static IP configuration                                │"
echo "  │  3. Docker & Docker Compose                                │"
echo "  │  4. Performance optimizations (CPU C-states, governor)     │"
echo "  │  5. Agent stack (OpenClaw, Kilo, Qdrant, Ollama, Crawl4AI) │"
echo "  │  6. Persistent agent mode (systemd)                        │"
echo "  │                                                            │"
printf "  │  Running as user: %-40s │\n" "$ACTUAL_USER"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""
read -p "  Press ENTER to continue or Ctrl+C to abort..."
echo ""

# ============================================
# STEP 1: SYSTEM UPDATES
# ============================================
show_step_header "1" "Updating Ubuntu & Installing Dependencies"
export DEBIAN_FRONTEND=noninteractive

apt update -qq &
APT_PID=$!
show_fancy_spinner $APT_PID "Updating package lists"
wait $APT_PID || { log_error "apt update failed"; exit 1; }

apt upgrade -y -qq &
APT_PID=$!
show_fancy_spinner $APT_PID "Upgrading packages (this may take a while)"
wait $APT_PID || { log_error "apt upgrade failed"; exit 1; }

apt install -y -qq \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    htop \
    bluez \
    rfkill \
    iproute2 \
    dbus \
    cpufrequtils \
    openssl 2>&1 | grep -v "already installed" || true &
APT_PID=$!
show_fancy_spinner $APT_PID "Installing dependencies"
wait $APT_PID || { log_error "Failed to install dependencies"; exit 1; }

# Keep DEBIAN_FRONTEND=noninteractive for remaining apt operations
show_success_banner "System updated successfully"
echo ""


# Step 2 (Bluetooth) — Removed: not required for agent platform


# ============================================
# STEP 3: NETWORK CONFIGURATION
# ============================================

show_step_header "3" "Detecting physical network interfaces..."

# Detect physical interfaces with carrier signal AND up state
SMART_INTERFACES=()
for dev in /sys/class/net/*; do
    DEV_NAME=$(basename "$dev")
    # Skip virtual interfaces
    if [[ "$DEV_NAME" =~ ^(lo|docker|veth|br-|virt) ]]; then
        continue
    fi
    # Check if physical device with carrier signal OR up state (relaxed check)
    IS_UP=0
    HAS_CARRIER=0
    
    [ -f "$dev/operstate" ] && [ "$(cat "$dev/operstate")" = "up" ] && IS_UP=1
    [ -f "$dev/carrier" ] && [ "$(cat "$dev/carrier")" -eq 1 ] && HAS_CARRIER=1
    
    # Accept if Up AND Carrier (ideal), or just Up (could be slow carrier), or Carrier (plugged but down)
    if [ $IS_UP -eq 1 ] || [ $HAS_CARRIER -eq 1 ]; then
        SMART_INTERFACES+=("$DEV_NAME")
    fi
done

# Check if any interfaces found
if [ ${#SMART_INTERFACES[@]} -eq 0 ]; then
    log_error "No active physical network interfaces found. Plug in Ethernet and try again."
    exit 1
fi

# Single interface - auto-select
if [ ${#SMART_INTERFACES[@]} -eq 1 ]; then
    INTERFACE="${SMART_INTERFACES[0]}"
    log_info "Single active physical interface found: $INTERFACE"

# Multiple interfaces - smart selection with optional override
else
    DEFAULT_ROUTE_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
    
    # Smart auto-select based on default route
    if [[ " ${SMART_INTERFACES[*]} " =~ " $DEFAULT_ROUTE_IFACE " ]]; then
        INTERFACE="$DEFAULT_ROUTE_IFACE"
        log_info "Multiple interfaces detected. Smart-selected: $INTERFACE (has default route)"
    else
        # Fallback priority: eth* > en* > first available
        INTERFACE=""
        for prefix in "eth" "en"; do
            for iface in "${SMART_INTERFACES[@]}"; do
                if [[ "$iface" =~ ^$prefix ]]; then
                    INTERFACE="$iface"
                    break 2
                fi
            done
        done
        [ -z "$INTERFACE" ] && INTERFACE="${SMART_INTERFACES[0]}"
        log_info "Multiple interfaces detected. Auto-selected: $INTERFACE"
    fi
    
    # Optional: Allow user override (controlled by environment variable or flag)
    # Set ALLOW_INTERFACE_OVERRIDE=true to enable interactive selection
    if [ "${ALLOW_INTERFACE_OVERRIDE:-false}" = "true" ]; then
        log_warn "Available interfaces:"
        for i in "${!SMART_INTERFACES[@]}"; do
            echo "  $((i+1))) ${SMART_INTERFACES[$i]}"
        done
        echo ""
        echo "Auto-selected: $INTERFACE"
        
        TIMEOUT_OCCURRED=false
        USER_INPUT=""
        read -t 30 -p "Accept auto-selection? (Y/n): " USER_INPUT || TIMEOUT_OCCURRED=true
        
        if [ "$TIMEOUT_OCCURRED" != "true" ]; then
            case "${USER_INPUT,,}" in
                n|no)
                    read -p "Select interface number (1-${#SMART_INTERFACES[@]}): " CHOICE
                    if [[ "$CHOICE" =~ ^[0-9]+$ ]] && [ "$CHOICE" -le "${#SMART_INTERFACES[@]}" ] && [ "$CHOICE" -ge 1 ]; then
                        INTERFACE="${SMART_INTERFACES[$((CHOICE-1))]}"
                        log_info "User selected: $INTERFACE"
                    else
                        log_error "Invalid selection. Exiting."
                        exit 1
                    fi
                    ;;
                y|yes|"")
                    log_info "Using auto-selected interface: $INTERFACE"
                    ;;
                *)
                    log_warn "Invalid input. Using auto-selected interface: $INTERFACE"
                    ;;
            esac
        else
            log_info "No input within 30s. Using auto-selected interface: $INTERFACE"
        fi
    fi
fi

# Validate selected interface still exists and is up
if [ ! -d "/sys/class/net/$INTERFACE" ]; then
    log_error "Selected interface $INTERFACE no longer exists"
    exit 1
fi

log_success "Using network interface: $INTERFACE"

# Get current network configuration
FULL_IP=$(ip -o -4 addr show "$INTERFACE" | awk '{print $4}' | head -n1)
CURRENT_IP=${FULL_IP%/*}

if [ -z "${CURRENT_IP:-}" ]; then
    log_warn "Interface $INTERFACE has no IPv4 address assigned"
else
    log_info "Current IP configuration: $CURRENT_IP"
fi

PREFIX=${FULL_IP#*/}
[ "$PREFIX" = "$FULL_IP" ] && PREFIX=24

# Detect gateway
GATEWAY=$(ip route show default | awk '/default/ {print $3}' | head -n1)
if [ -z "${GATEWAY:-}" ]; then
     GATEWAY=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $3; exit}')
fi

log_info "Network Detection Results:"
echo "  Interface: $INTERFACE"
echo "  Current IP: ${CURRENT_IP:-Unknown}/$PREFIX"
echo "  Gateway: ${GATEWAY:-Not detected}"

# Check for existing static configuration
if grep -rIq "dhcp4: no" /etc/netplan/ 2>/dev/null; then
    log_info "Static IP configuration already exists"
    grep -r "addresses:" /etc/netplan/*.yaml 2>/dev/null | head -2
    read -p "Reconfigure network? (yes/no) [no]: " RECONFIG
    if [[ ! "${RECONFIG:-no}" =~ ^[Yy][Ee]?[Ss]?$ ]]; then
        log_info "Keeping existing configuration"
        SKIP_NETWORK=true
    else
        # User wants to reconfigure - clear the flag to proceed with manual config
        SKIP_NETWORK=false
    fi
else
    # No existing static config - offer to configure current IP as static
    if [ -n "${CURRENT_IP:-}" ]; then
        read -p "Configure current IP ($CURRENT_IP) as static? (yes/no) [yes]: " CONFIG_STATIC
        if [[ "${CONFIG_STATIC:-yes}" =~ ^[Yy][Ee]?[Ss]?$ ]] || [ -z "${CONFIG_STATIC:-}" ]; then
            # Use current IP as static - set up variables for netplan generation
            NEW_IP="${CURRENT_IP}"
            # Network configuration will be generated below
            log_info "Will configure current IP as static: $NEW_IP/$PREFIX"
        else
            # User declined - skip redundant prompt below
            SKIP_NETWORK=true
            CONFIGURED_IP=${CURRENT_IP:-}
        fi
    fi
fi

# Configure static IP
if [ "${SKIP_NETWORK:-false}" != "true" ]; then
    # If NEW_IP was already set (from earlier prompt), skip the static IP question
    if [ -n "${NEW_IP:-}" ]; then
        log_info "Using current IP as static: $NEW_IP/$PREFIX"
    else
        read -p "Configure static IP? (yes/no) [no]: " OPTION
        if [[ "${OPTION:-no}" =~ ^[Yy][Ee]?[Ss]?$ ]]; then
            
            log_info "Would you like to manually assign an IP address? (yes/no) [no]"
            read -p "Choice: " MANUAL_IP

            if [[ "${MANUAL_IP:-no}" =~ ^[Yy][Ee]?[Ss]?$ ]]; then
                while true; do
                    read -p "Enter IP address: " NEW_IP
                    if validate_ip "$NEW_IP"; then
                        break
                    else
                        log_error "Invalid IP address format. Please try again."
                    fi
                done
                log_info "Will configure static IP: $NEW_IP"
            else
                NEW_IP=${CURRENT_IP:-}
                if [ -z "$NEW_IP" ]; then
                    log_warn "No current DHCP IP detected. Please enter a static IP manually."
                    while true; do
                        read -p "Enter IP address: " NEW_IP
                        if validate_ip "$NEW_IP"; then
                            break
                        else
                            log_error "Invalid IP address format. Please try again."
                        fi
                    done
                    log_info "Will configure static IP: $NEW_IP"
                else
                    log_info "Will make current DHCP IP ($CURRENT_IP) static"
                fi
            fi
        else
            log_info "Skipping static IP configuration"
            CONFIGURED_IP=${CURRENT_IP:-}
        fi
    fi
    
    # If NEW_IP is set (either from above or from earlier prompt), generate netplan config
    if [ -n "${NEW_IP:-}" ]; then

        # Get gateway if not detected
        while [ -z "${GATEWAY:-}" ]; do
            read -p "Enter gateway IP: " GATEWAY
            if ! validate_ip "$GATEWAY"; then
                log_error "Invalid gateway IP"
                GATEWAY=""
            fi
        done

        # Get and validate DNS servers
        while true; do
            read -p "Enter DNS servers (space or comma-separated) [1.1.1.1 8.8.8.8]: " DNS_INPUT
            DNS_INPUT=${DNS_INPUT:-"1.1.1.1 8.8.8.8"}
            DNS_SERVERS=$(echo "$DNS_INPUT" | tr ' ' ',' | sed 's/,\+/,/g' | sed 's/^,//;s/,$//')

            IFS=',' read -r -a DNS_ARRAY <<< "$DNS_SERVERS"
            all_valid=true
            for dns in "${DNS_ARRAY[@]}"; do
                dns=$(echo "$dns" | xargs)
                if ! validate_ip "$dns"; then
                    log_error "Invalid DNS server: $dns"
                    all_valid=false
                    break
                fi
            done
            if $all_valid; then
                break
            fi
            log_info "Please re-enter DNS servers."
        done

        log_info "DNS servers will be set to: $DNS_SERVERS"

        # Backup existing netplan configuration
        log_info "Creating backup of existing network configuration"
        mkdir -p /etc/netplan/backup
        # Safe backup - verify files exist first
        if ls /etc/netplan/*.yaml 1> /dev/null 2>&1; then
            cp /etc/netplan/*.yaml /etc/netplan/backup/ 2>/dev/null || true
            # DO NOT Remove yet - wait until new file is generated
        fi

        # Generate netplan configuration
        log_info "Generating netplan configuration file"
        # Temporarily use a temp file to ensure write success
        TEMP_NETPLAN=$(mktemp)
        cat > "$TEMP_NETPLAN" << EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    $INTERFACE:
      dhcp4: no
      addresses: [$NEW_IP/$PREFIX]
      routes:
        - to: default
          via: $GATEWAY
      nameservers:
        addresses: [$DNS_SERVERS]
EOF

        # safe move
        mv "$TEMP_NETPLAN" /etc/netplan/99-oweibo-static.yaml
        chmod 600 /etc/netplan/99-oweibo-static.yaml

        # NOW safe to move old configs to backup instead of deleting
        for f in /etc/netplan/*.yaml; do
            [ "$f" = "/etc/netplan/99-oweibo-static.yaml" ] && continue
            if [ -f "$f" ]; then
                 mv "$f" /etc/netplan/backup/ 2>/dev/null || true
            fi
        done

        # Validate YAML
        if netplan generate >/dev/null 2>&1; then
            log_info "YAML syntax is valid"
        else
            log_error "YAML syntax error detected"
            cat /etc/netplan/99-oweibo-static.yaml
            exit 1
        fi

        # Apply with safety timeout
        log_warn "╔════════════════════════════════════════════════════════════╗"
        log_warn "║  TESTING NETWORK CONFIG - 120 SECOND TIMEOUT              ║"
        log_warn "║  Press ENTER within 120s to ACCEPT                        ║"
        log_warn "║  If you LOSE CONNECTION, it will AUTO-ROLLBACK            ║"
        log_warn "╚════════════════════════════════════════════════════════════╝"
        echo ""

        if netplan try --timeout 120; then
            log_info "Static IP $NEW_IP applied successfully"
            rm -rf /etc/netplan/backup
            CONFIGURED_IP=$NEW_IP
        else
            log_error "Configuration rejected or timed out. Reverting..."
            rm -f /etc/netplan/99-oweibo-static.yaml
            cp -a /etc/netplan/backup/*.yaml /etc/netplan/ 2>/dev/null || true
            netplan apply
            exit 1
        fi
    fi
else
    CONFIGURED_IP=${CURRENT_IP:-}
fi
echo ""


# ============================================
# STEP 4: DOCKER INSTALLATION
# ============================================
show_step_header "4" "Installing Docker & Docker Compose"

if command -v docker &> /dev/null; then
    log_info "Docker already installed: $(docker --version)"
else
    # Remove old Docker versions
    log_info "Removing old Docker versions..."
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Add Docker GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    apt update -qq &
    APT_UPDATE_PID=$!
    show_fancy_spinner $APT_UPDATE_PID "Updating package lists for Docker"
    wait $APT_UPDATE_PID || { log_error "apt update failed"; exit 1; }
    
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin &
    APT_DOCKER_PID=$!
    show_fancy_spinner $APT_DOCKER_PID "Installing Docker packages"
    wait $APT_DOCKER_PID || { log_error "Docker installation failed"; exit 1; }

    # Enable Docker
    systemctl enable docker
    systemctl start docker
fi

# Add user to docker group
if ! groups "$ACTUAL_USER" | grep -qw docker; then
    usermod -aG docker "$ACTUAL_USER"
    log_info "Added $ACTUAL_USER to docker group (re-login required)"
fi

# Verify Docker Compose v2
if docker compose version >/dev/null 2>&1; then
    log_info "Docker Compose v2 available: $(docker compose version)"
else
    log_error "Docker Compose v2 not available"
    exit 1
fi

show_success_banner "Docker setup completed successfully"
echo ""


# ============================================
# STEP 5: PERFORMANCE OPTIMIZATIONS
# ============================================
show_step_header "5" "Applying Performance Optimizations"

# CPU governor to performance
log_info "Setting CPU governor to performance..."
for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    if [ -f "$cpu" ]; then
        echo performance | tee "$cpu" >/dev/null 2>&1 || true
    fi
done

show_success_banner "Performance optimizations applied"

# Persistent CPU governor
if [ -d /etc/default ]; then
    echo 'GOVERNOR="performance"' | tee /etc/default/cpufrequtils >/dev/null
    systemctl disable ondemand 2>/dev/null || true
fi

# Sysctl optimizations
SYSCTL_CONF="/etc/sysctl.d/99-oweibo.conf"
if [ ! -f "$SYSCTL_CONF" ]; then
    tee "$SYSCTL_CONF" >/dev/null <<EOF
vm.dirty_ratio=10
vm.dirty_background_ratio=5
# IP forwarding for NetBird/Tailscale subnet routing
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
    sysctl -p "$SYSCTL_CONF" >/dev/null
    log_info "Sysctl optimizations applied (includes IP forwarding for NetBird)"
fi

# GRUB C-state optimization (hardware-specific stability)
GRUB_FILE="/etc/default/grub"

# Use hardware detection module for dynamic C-state configuration
if needs_cstate_fix; then
    CSTATE_FLAGS=$(get_cstate_flags)
    log_info "Detected $(get_hardware_profile) hardware - enabling C-state optimization"
else
    CSTATE_FLAGS=""
fi
FLAGS="$CSTATE_FLAGS"
GRUB_MODIFIED=false

# Only apply C-state fix if needed (N-series processors)
if [ -z "$FLAGS" ]; then
    log_info "No C-state flags specified, skipping GRUB modification"
elif grep -q "intel_idle.max_cstate" "$GRUB_FILE"; then
    log_info "GRUB already configured for C-state optimization"
else
    # Backup GRUB config
    cp "$GRUB_FILE" "${GRUB_FILE}.backup-$(date +%Y%m%d-%H%M%S)"

    # Only append if not present - robust regex to insert flags before the closing quote
    if sed -i -E 's/^(GRUB_CMDLINE_LINUX_DEFAULT=".*)(".*)/\1 '"$FLAGS"'\2/' "$GRUB_FILE"; then
        update-grub
        GRUB_MODIFIED=true
        log_info "GRUB updated (backup saved)"
    else
        log_warn "Failed to update GRUB automatically. Please check /etc/default/grub"
    fi
fi
echo ""


# ============================================
# STEP 6: OWEIBO DIRECTORY STRUCTURE
# ============================================
show_step_header "6" "Creating Oweibo Directory Structure"

OWEIBO_DIR="$USER_HOME/oweibo"
mkdir -p "$OWEIBO_DIR"/{openclaw,backups}

# Copy kilo-pipeline source from repo to oweibo directory
log_info "Copying kilo-pipeline source to oweibo directory..."
if [ -d "$SCRIPT_DIR/kilo/pipeline" ]; then
    mkdir -p "$OWEIBO_DIR/kilo/pipeline"
    if [ "$(readlink -f "$SCRIPT_DIR/kilo/pipeline" 2>/dev/null)" != "$(readlink -f "$OWEIBO_DIR/kilo/pipeline" 2>/dev/null)" ]; then
        cp -r "$SCRIPT_DIR/kilo/pipeline/." "$OWEIBO_DIR/kilo/pipeline/"
        chown -R "$ACTUAL_USER:$ACTUAL_USER" "$OWEIBO_DIR/kilo/pipeline"
        log_success "kilo-pipeline source files copied"
    else
        log_info "kilo-pipeline already in oweibo directory (source and destination are the same)"
    fi
else
    log_warn "kilo/pipeline source not found in repo at $SCRIPT_DIR/kilo/pipeline"
fi

chown -R "$ACTUAL_USER:$ACTUAL_USER" "$OWEIBO_DIR"


# Phase 1 — Task 1.1: /var/kilo/ host directory tree
# Created here so fresh installs (sudo ./setup.sh) provision it automatically.
log_info "Provisioning /var/kilo/ host directory tree (Phase 1)..."
if [ ! -d /var/kilo ]; then
    mkdir -p /var/kilo/{checkpoints,assertion_cache,known_good,writer_retry,failure_ledger,qdrant-backups}
    mkdir -p /var/kilo/quarantine/{decisions,invariants,tasks}
    chown -R "$ACTUAL_USER:$ACTUAL_USER" /var/kilo
    chmod -R 777 /var/kilo
    log_success "/var/kilo/ provisioned."
else
    log_info "/var/kilo/ already exists — ensuring all subdirectories are present."
    # Idempotent: add any missing subdirs and ensure permissions
    mkdir -p /var/kilo/{checkpoints,assertion_cache,known_good,writer_retry,failure_ledger,qdrant-backups}
    mkdir -p /var/kilo/quarantine/{decisions,invariants,tasks}
    chown -R "$ACTUAL_USER:$ACTUAL_USER" /var/kilo
    chmod -R 777 /var/kilo
fi

# Define agent-only subdirectories for idempotent creation
declare -a DIRS=(
    "backups"
    "openclaw"
    # Kilo Pipeline directories
    "kilo/pipeline"
    "kilo/scripts"
    "kilo/.kilo/decisions"
    "kilo/.kilo/history"
    "kilo/.kilo/reasoning"
    "kilo/.kilo/rejected"
    "kilo/.kilo/staging"
)

for dir in "${DIRS[@]}"; do
    mkdir -p "$OWEIBO_DIR/$dir"
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$OWEIBO_DIR/$dir"
done

log_success "Agent directory structure verified at $OWEIBO_DIR"

# Set permissions
PUID=$(id -u "$ACTUAL_USER")
PGID=$(id -g "$ACTUAL_USER")

chown -R "$ACTUAL_USER:$ACTUAL_USER" "$OWEIBO_DIR/kilo"

show_success_banner "Directory structure created at $OWEIBO_DIR"

# Phase 7 — Task 7.6: kilo/.kilo/ directory tree + invariants init
log_info "Provisioning kilo/.kilo/ project directory tree (Phase 7)..."
KILO_PROJECT_DIR="$OWEIBO_DIR/kilo/.kilo"
mkdir -p "$KILO_PROJECT_DIR"/{decisions,invariants,reasoning,history,staging,rejected}
if [ ! -f "$KILO_PROJECT_DIR/invariants/invariants.yaml" ]; then
    echo "# Kilo Pipeline - Stable Invariants" > "$KILO_PROJECT_DIR/invariants/invariants.yaml"
    echo "invariants: []" >> "$KILO_PROJECT_DIR/invariants/invariants.yaml"
fi
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$KILO_PROJECT_DIR"
log_success "kilo/.kilo/ provisioned."
echo ""

# HACS pre-install — Removed: Home Assistant deleted from agent stack


# ============================================
# STEP 7: GENERATE SERVICE CREDENTIALS
# ============================================
show_step_header "7" "Generating Service Credentials"
# Grafana credentials — Removed: Grafana deleted from agent stack
# NetBird TURN credentials — Removed: NetBird deleted from agent stack

# OpenClaw gateway token
OPENCLAW_ENV="$OWEIBO_DIR/openclaw/.env"
if [ ! -f "$OPENCLAW_ENV" ]; then
    OPENCLAW_TOKEN=$(openssl rand -hex 16)
    echo "OPENCLAW_TOKEN=$OPENCLAW_TOKEN" > "$OPENCLAW_ENV"
    chmod 600 "$OPENCLAW_ENV"
    chown "$ACTUAL_USER:$ACTUAL_USER" "$OPENCLAW_ENV"
    log_info "OpenClaw gateway token generated"
else
    log_info "Using existing OpenClaw credentials"
    source "$OPENCLAW_ENV"
fi


# ============================================
# KILO CLI: Agentic AI Orchestration from Terminal
# ============================================
log_info "Setting up Kilo CLI (AI agent orchestration)..."

# Install Node.js 20 LTS if not present
if ! command -v node &>/dev/null; then
    log_info "Installing Node.js 20 LTS..."
    # Check if we're on a Debian-based system
    if [ -f /etc/debian_version ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
        apt install -y -qq nodejs >/dev/null 2>&1 || log_warn "Failed to install nodejs via apt"
    else
        # Fallback for non-Debian systems - try package manager or nvm
        if command -v dnf &>/dev/null; then
            dnf module reset nodejs -y >/dev/null 2>&1 || true
            dnf module enable nodejs:20 -y >/dev/null 2>&1 || true
            dnf install -y nodejs >/dev/null 2>&1 || true
        elif command -v pacman &>/dev/null; then
            pacman -Sy --noconfirm nodejs >/dev/null 2>&1 || true
        elif command -v apk &>/dev/null; then
            apk add --no-cache nodejs npm >/dev/null 2>&1 || true
        else
            log_warn "Could not install Node.js automatically. Please install Node.js 20+ manually."
        fi
    fi
    if command -v node &>/dev/null; then
        log_info "Node.js $(node --version) installed"
    fi
else
    log_info "Node.js already installed: $(node --version)"
fi

# Install Kilo CLI globally
if ! command -v kilo &>/dev/null; then
    log_info "Installing Kilo CLI..."
    npm install -g @kilocode/cli >/dev/null 2>&1 && \
        log_info "Kilo CLI installed: $(kilo --version 2>/dev/null || echo 'installed')" || \
        log_warn "Kilo CLI installation failed. Install manually: npm install -g @kilocode/cli"
else
    log_info "Kilo CLI already installed"
fi

# Configure Kilo for local Ollama
KILO_CONFIG_DIR="$USER_HOME/.config/kilocode"
KILO_CONFIG_FILE="$KILO_CONFIG_DIR/kilocode.json"

if [ ! -f "$KILO_CONFIG_FILE" ]; then
    log_info "Configuring Kilo CLI for local Ollama..."
    mkdir -p "$KILO_CONFIG_DIR"
    # Default to qwen2.5-coder:3b for coding tasks
    cat > "$KILO_CONFIG_FILE" <<EOF
{
  "apiProvider": "ollama",
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "model": "qwen2.5-coder:3b",
    "numCtx": 32768
  }
}
EOF
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$USER_HOME/.config"
    log_info "Kilo CLI configured (Model: qwen2.5-coder:3b)"
else
    log_info "Kilo CLI configuration already exists"
fi
# ============================================
# OPENCLAW SKILL CONFIGURATION
# ============================================
log_info "Configuring OpenClaw Skills & Models..."

OPENCLAW_CONFIG_DIR="$OWEIBO_DIR/openclaw"
OPENCLAW_CONFIG_FILE="$OPENCLAW_CONFIG_DIR/openclaw.json"
mkdir -p "$OPENCLAW_CONFIG_DIR"

# Load model configuration from config.env if available
CONFIG_ENV_FILE="$OWEIBO_DIR/.env"
if [ -f "$CONFIG_ENV_FILE" ]; then
    # Safely export variables without evaluating arbitrary strings
    while IFS='=' read -r key val; do
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        # Strip exact leading/trailing single/double quotes safely
        val="${val%\"}"
        val="${val#\"}"
        val="${val%\'}"
        val="${val#\'}"
        export "$key=$val"
    done < "$CONFIG_ENV_FILE"
fi

# Set defaults if not loaded from config
# Support both new OLLAMA_* names and legacy MODEL_* names
OLLAMA_DEFAULT_MODEL="${OLLAMA_DEFAULT_MODEL:-${MODEL_CODING:-qwen2.5-coder:3b}}"
OLLAMA_GENERAL_MODEL="${OLLAMA_GENERAL_MODEL:-${MODEL_GENERAL:-llama3.2:3b}}"
OLLAMA_QUICK_MODEL="${OLLAMA_QUICK_MODEL:-${MODEL_QUICK:-llama3.2:1b}}"

# Legacy variable support for backward compatibility
MODEL_CODING="$OLLAMA_DEFAULT_MODEL"
MODEL_GENERAL="$OLLAMA_GENERAL_MODEL"
MODEL_QUICK="$OLLAMA_QUICK_MODEL"

# 2. Generate OpenClaw Config (Dynamic Model Routing)
TEMP_JSON=$(mktemp)
cat > "$TEMP_JSON" <<EOF
{
  "_meta": {
    "version": "v10",
    "workflow": "autonomous-agent-factory",
    "updated": "$(date +%Y-%m-%d)",
    "notes": "Dynamically generated for Agent Factory."
  },
  "skills": {
    "kilo_cli": {
      "enabled": true,
      "description": "Delegate autonomous coding tasks through the Kilo v9 autonomous loop. Kilo runs a 9-stage pipeline: /architect plans, /orchestrator executes via /code + /debug + /review + /ask, a semantic guard with 11 gates protects the workspace, and a 5-store memory system ensures cross-task continuity. Use this for anything that requires writing, testing, iterating, or debugging code.",
      "dirs": {
        "queue": "/home/node/.openclaw/kilo-bridge/queue",
        "signals": "/home/node/.openclaw/kilo-bridge/signals",
        "workspace": "/home/node/.openclaw/kilo-bridge/workspace",
        "kilo_memory": "/home/node/.openclaw/kilo-bridge/workspace/.kilo"
      },
      "poll_interval_ms": 5000,
      "task_schema": {
        "id": "uuid-generated-by-openclaw",
        "instruction": "The full coding task description",
        "context": "Stack, file paths, constraints, auth strategy, DB schema, env vars, related prior tasks",
        "stack_hint": "bash|node-webapp|python-webapp|scraper|ai-worker|vector-store|fullstack",
        "priority": "normal|high|low",
        "trust_mode": "\${TRUST_MODE:-supervised}",
        "created_by": "openclaw",
        "created_at": "ISO8601 timestamp",
        "parent_task": "uuid of parent task if subtask, else null",
        "memory_refs": "comma-separated prior task IDs whose .kilo/history/ entries are relevant"
      },
      "stack_context_templates": {
        "bash_script": {
          "include_in_context": [
            "Target shell: bash 5.x / sh / zsh — specify",
            "Execution environment: cron | systemd | manual | Docker entrypoint",
            "Dependencies allowed: curl | jq | awk | sed | python3 — specify which",
            "Secrets: env vars only — never hardcode",
            "Idempotency required: yes/no"
          ]
        },
        "web_app": {
          "include_in_context": [
            "Framework: Express | Fastify | Next.js | FastAPI | Flask — specify",
            "Auth strategy: JWT | session+cookie | OAuth2 | API key",
            "Database: PostgreSQL | MySQL | SQLite | MongoDB — ORM or raw",
            "Vector store: Qdrant | Pgvector | Weaviate | Chroma — specify",
            "AI integration: Ollama (local) | OpenAI | Anthropic",
            "Validation: Zod | Joi | Pydantic — specify",
            "Port: specify — default 3000/8000"
          ],
          "invariants_to_enforce": [
            "Auth checks never removed from protected routes",
            "All DB queries parameterised — no string interpolation",
            "Secrets only from env vars — never hardcoded",
            "Vector store collection schema never modified without migration"
          ]
        }
      },
      "delegation_rules": {
        "always_delegate_to_kilo": [
          "Write any new application, service, or module",
          "Build or extend a REST / tRPC / GraphQL API",
          "Implement auth — JWT, session, OAuth2, API key middleware",
          "Set up or extend a database schema — ORM models, migrations, indexes",
          "Implement Qdrant or pgvector integration",
          "Integrate Ollama / OpenAI / LangChain / LangGraph",
          "Fix a bug by iterating through errors",
          "Refactor or extend existing code",
          "Install and configure dependencies",
          "Write and run unit, integration, or smoke tests"
        ],
        "handle_directly": [
          "Simple file reads or configuration checks",
          "Answering questions or explaining concepts",
          "Planning and breaking tasks into subtasks",
          "Reviewing a Kilo result signal"
        ],
        "delegate_then_supervise": [
          "Multi-service implementations — break into ordered subtasks",
          "Auth implementation — Kilo writes middleware, OpenClaw verifies invariants",
          "Deployment scripts — Kilo writes scripts, OpenClaw reviews before execution"
        ],
        "never_delegate_to_kilo": [
          "Executing destructive DB operations on production data",
          "Pushing to git remote — OpenClaw stages and confirms first",
          "Running deployment commands against production"
        ]
      },
      "autonomous_behavior": {
        "on_task_completed": "Read result from signal file. Extract: files_created, files_modified, gate_results, fix_source. Report to user/webhook.",
        "on_task_failed": "Read failure signal. Extract: error_class, strategy_attempted. If attempts < max: reformulate and requeue. If convergence_exit=true: escalate to user.",
        "on_gate_rejection": "Read gate failure from signal. If T2: requeue with gate context. If T1: escalate to user immediately.",
        "max_requeue_attempts": 2,
        "requeue_strategy": {
          "convergence_exit": "never — escalate to user",
          "t1_gate_failure": "never — escalate to user",
          "t2_gate_failure": "requeue once with gate_name",
          "simple_error": "requeue with error details"
        }
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": [
      {
        "id": "ollama",
        "type": "openai-completions",
        "baseUrl": "http://ollama:11434/v1",
        "models": [
          "$MODEL_CODING",
          "$MODEL_GENERAL",
          "$MODEL_QUICK"
        ],
        "circuit_breaker": {
          "timeout_s": 30,
          "retries": 2,
          "failure_threshold": 0.15,
          "reset_timeout_ms": 300000,
          "min_calls_before_evaluation": 3,
          "confidence_threshold": 60
        }
      }
    ]
  },
  "agents": {
    "defaults": {
      "model": {
        "architect": "ollama/$MODEL_CODING",
        "orchestrator": "ollama/$MODEL_CODING",
        "coding": "ollama/$MODEL_CODING",
        "planning": "ollama/$MODEL_GENERAL",
        "delegation": "ollama/$MODEL_QUICK",
        "fast": "ollama/$MODEL_QUICK"
      },
      "behavior": {
        "autonomous_iteration": true,
        "max_plan_depth": 6,
        "report_on_completion": true
      },
      "skills": {
        "kilo_cli": {
          "enabled": true
        }
      },
      "pipeline": {
        "enabled": "\${OPENCLAW_KILO_ENABLED:-true}",
        "endpoint": "http://kilo-pipeline:3100",
        "trust_mode": "\${TRUST_MODE:-supervised}",
        "token": "\${OPENCLAW_TOKEN}"
      },
      "autonomy": {
        "persistent_mode": "\${PERSISTENT_MODE:-true}",
        "task_queue_enabled": "\${TASK_QUEUE_ENABLED:-true}",
        "notify_webhook": "\${NOTIFY_WEBHOOK:-}"
      }
    }
  },
  "trust_mode_documentation": {
    "supervised": {
      "description": "All T1 gate failures pause for approval. T2 also pause.",
      "behavior": "Pipeline never auto-promotes risky changes."
    },
    "graduated": {
      "description": "Deterministic changes auto-promote. Semantic/structural route to staging.",
      "behavior": "T1 violations always escalate."
    },
    "autonomous": {
      "description": "All gate results advisory only. Pipeline never pauses.",
      "behavior": "Errors trigger requeue up to max_requeue_attempts. Only convergence_exit escalates.",
      "warning": "Disables all human-in-the-loop gates. Only for batch/automated/non-production."
    }
  }
}
EOF

if command -v jq >/dev/null 2>&1; then
    if jq . "$TEMP_JSON" >/dev/null 2>&1; then
        mv "$TEMP_JSON" "$OPENCLAW_CONFIG_FILE"
        log_info "OpenClaw configuration validated and saved."
    else
        log_error "Generated OpenClaw JSON is invalid! Please check variables."
        mv "$TEMP_JSON" "$OPENCLAW_CONFIG_FILE.invalid"
        log_warn "Saved invalid config to $OPENCLAW_CONFIG_FILE.invalid for debugging."
    fi
else
    mv "$TEMP_JSON" "$OPENCLAW_CONFIG_FILE"
fi

chown -R "$ACTUAL_USER:$ACTUAL_USER" "$OWEIBO_DIR/openclaw"
log_info "OpenClaw configured: Coding=$MODEL_CODING, General=$MODEL_GENERAL, Quick=$MODEL_QUICK"

# Observability (Prometheus/Grafana) — Removed: deleted from agent stack


# ============================================
# STEP 8: DOCKER COMPOSE CONFIGURATION
# ============================================
show_step_header "8" "Configuring Docker Stack"

# Get render group GID - Handle missing/fail cases
RENDER_GID=$(getent group render | cut -d: -f3 2>/dev/null)
if [ -z "$RENDER_GID" ]; then
    log_warn "Render group not found. Hardware acceleration may not work."
    log_warn "Creating render group (gid 109)..."
    groupadd -g 109 render 2>/dev/null || true
    RENDER_GID=$(getent group render | cut -d: -f3 2>/dev/null)
fi
RENDER_GID=${RENDER_GID:-109}
PUID=$(id -u "$ACTUAL_USER")
PGID=$(id -g "$ACTUAL_USER")

# Prepare .env content
ENV_FILE="$OWEIBO_DIR/.env"
CONFIG_TEMPLATE="config.env.template"
ONBOARD_CONFIG="config.env"

# Load configuration - priority: config.env (from onboarding) > config.env.template
if [ -f "$ONBOARD_CONFIG" ]; then
    # Onboarding wizard wrote config.env - use this
    log_info "Loading onboarding configuration from $ONBOARD_CONFIG"
    set -a
    source "$ONBOARD_CONFIG"
    set +a
    log_info "Loaded: SPEED_CLASS=$SPEED_CLASS TIER=$RESOURCE_TIER MODEL=$OLLAMA_DEFAULT_MODEL"
elif [ -f "$CONFIG_TEMPLATE" ]; then
    # Fall back to template for manual configuration
    log_info "Loading configuration from $CONFIG_TEMPLATE"
    set -a
    source "$CONFIG_TEMPLATE"
    set +a
else
    log_warn "No configuration file found. Using defaults."
fi

# === CONFIG MIGRATION: Add new hardware variables for existing installations ===
# This ensures backward compatibility with existing config.env files
log_info "Running config migration for hardware-agnostic support..."

# Source hardware detection module if not already available
if ! declare -f get_hardware_profile >/dev/null 2>&1; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/scripts/hardware-detect.sh" ]; then
        source "$SCRIPT_DIR/scripts/hardware-detect.sh"
        log_info "Loaded # Initialize .env file
# First, source existing .env to preserve tokens if not overridden in shell env
if [ -f "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a 2>/dev/null || true
fi

echo "# Generated by setup.sh - $(date)" > "$ENV_FILE"

# --- Add Users/Groups ---
echo "PUID=$PUID" >> "$ENV_FILE"
echo "PGID=$PGID" >> "$ENV_FILE"
echo "ACTUAL_USER=$ACTUAL_USER" >> "$ENV_FILE"

# --- Add Configuration Variables ---
# Timezone
if [ -n "${TIMEZONE:-}" ]; then
    TZ="$TIMEZONE"
else
    TZ=$(cat /etc/timezone 2>/dev/null || echo "Etc/UTC")
fi
echo "TZ=$TZ" >> "$ENV_FILE"

# Phase 7 — Kilo Pipeline Hardening Variables
echo "TRUST_MODE=${TRUST_MODE:-supervised}" >> "$ENV_FILE"
echo "QDRANT_HOST=http://qdrant:6333" >> "$ENV_FILE"
echo "KILO_PIPELINE_PORT=3100" >> "$ENV_FILE"
echo "OPENCLAW_KILO_ENABLED=true" >> "$ENV_FILE"

# Agent Autonomy Settings
echo "PERSISTENT_MODE=${PERSISTENT_MODE:-true}" >> "$ENV_FILE"
echo "TASK_QUEUE_ENABLED=${TASK_QUEUE_ENABLED:-true}" >> "$ENV_FILE"
echo "NOTIFY_WEBHOOK=${NOTIFY_WEBHOOK:-}" >> "$ENV_FILE"

# Hardware Constraints
echo "HARDWARE_PROFILE=${HARDWARE_PROFILE:-n100_like}" >> "$ENV_FILE"
echo "OLLAMA_MEM_LIMIT=${OLLAMA_MEM_LIMIT:-4g}" >> "$ENV_FILE"
echo "CRAWL4AI_MAX_CONCURRENT=${CRAWL4AI_MAX_CONCURRENT:-5}" >> "$ENV_FILE"
echo "CRAWL4AI_MEMORY_LIMIT=${CRAWL4AI_MEMORY_LIMIT:-800m}" >> "$ENV_FILE"

# Ollama Models - support both new and legacy naming
if [ -z "${OLLAMA_MODEL:-}" ]; then
    OLLAMA_MODEL="$OLLAMA_QUICK_MODEL $OLLAMA_GENERAL_MODEL $OLLAMA_DEFAULT_MODEL"
fi
echo "OLLAMA_MODEL=$OLLAMA_MODEL" >> "$ENV_FILE"

# OpenClaw Model Configuration
echo "OLLAMA_DEFAULT_MODEL=$OLLAMA_DEFAULT_MODEL" >> "$ENV_FILE"
echo "OLLAMA_GENERAL_MODEL=$OLLAMA_GENERAL_MODEL" >> "$ENV_FILE"
echo "OLLAMA_QUICK_MODEL=$OLLAMA_QUICK_MODEL" >> "$ENV_FILE"

fi

# OpenClaw Token
if [ -n "${OPENCLAW_TOKEN:-}" ]; then
    echo "OPENCLAW_TOKEN=$OPENCLAW_TOKEN" >> "$ENV_FILE"
elif [ -f "$OWEIBO_DIR/openclaw/.env" ]; then
    grep "OPENCLAW_TOKEN" "$OWEIBO_DIR/openclaw/.env" >> "$ENV_FILE" || true
fi

# Home Assistant Token
# All legacy lifestyle app variables (Home Assistant, Nextcloud, Obsidian, etc.) have been completely removed.

chmod 600 "$ENV_FILE"
chown "$ACTUAL_USER:$ACTUAL_USER" "$ENV_FILE"
log_info "Environment configuration generated at $ENV_FILE"

# Validate required environment variables
log_info "Validating environment configuration..."
REQUIRED_VARS=("PUID" "PGID" "TZ" "OPENCLAW_TOKEN" "ACTUAL_USER")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE"; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    log_error "Required environment variables missing from $ENV_FILE:"
    printf '  - %s\n' "${MISSING_VARS[@]}"
    log_error "Please check the configuration and try again."
    exit 1
fi
log_info "All required environment variables validated"

# Copy docker-compose.yml
SOURCE_COMPOSE="docker-compose.yml"
DEST_COMPOSE="$OWEIBO_DIR/docker-compose.yml"

if [ -f "$SOURCE_COMPOSE" ]; then
    if [ "$PWD" != "$OWEIBO_DIR" ]; then
        cp "$SOURCE_COMPOSE" "$DEST_COMPOSE"
        chown "$ACTUAL_USER:$ACTUAL_USER" "$DEST_COMPOSE"
        log_info "Copied docker-compose.yml to $OWEIBO_DIR"
    else
        log_info "Running from $OWEIBO_DIR, skipping file copy"
    fi
    
    # Validate docker-compose.yml syntax using the user context
    if su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose config > /dev/null 2>&1"; then
        log_info "Docker Compose file validated (available at $DEST_COMPOSE)"
    else
        log_error "Docker Compose file has syntax errors!"
        su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose config"
        exit 1
    fi
else
    log_error "Source docker-compose.yml not found in current directory!"
    log_error "Expected location: $(pwd)/$SOURCE_COMPOSE"
    exit 1
fi
echo ""


# ============================================
# STEP 9: DEPLOY DOCKER STACK
# ============================================
show_step_header "9" "Deploying Docker Stack"

cd "$OWEIBO_DIR"

# Build local images first (kilo-pipeline is built locally, not pulled)
log_info "Building local images (kilo-pipeline)..."
if ! su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose build kilo-pipeline"; then
    log_warn "Failed to build kilo-pipeline (node:20-slim base image may not be accessible)"
    log_warn "If you see 'failed to solve node:20-slim' error, this is a DNS issue."
    log_warn "Fix:"
    log_warn "  Linux:   Create /etc/docker/daemon.json with: {\"dns\": [\"1.1.1.1\", \"8.8.8.8\"]}"
    log_warn "           Then run: sudo systemctl restart docker"
    log_warn "  Windows: Create C:\\ProgramData\\Docker\\config\\daemon.json with: {\"dns\": [\"1.1.1.1\", \"8.8.8.8\"]}"
    log_warn "           Then restart Docker Desktop"
    log_warn "  Or use a registry mirror: docker.io/library/node:20-slim"
    log_error "Cannot continue without kilo-pipeline image. Exiting..."
    exit 1
fi

# Check network connectivity before pulling images (best effort - won't fail script)
log_info "Checking network connectivity..."
NETWORK_CHECKS_PASSED=true

# Test DNS resolution for common registries (with fallback for Windows)
for domain in "docker.io" "ghcr.io" "public.ecr.aws" "gcr.io"; do
    if command -v host >/dev/null 2>&1; then
        if ! host "$domain" >/dev/null 2>&1; then
            log_warn "DNS resolution failed for $domain"
            NETWORK_CHECKS_PASSED=false
        fi
    elif command -v nslookup >/dev/null 2>&1; then
        if ! nslookup "$domain" >/dev/null 2>&1; then
            log_warn "DNS resolution failed for $domain"
            NETWORK_CHECKS_PASSED=false
        fi
    else
        # Neither host nor nslookup available - skip DNS check
        break
    fi
done

# Test basic internet connectivity (with fallback for Windows)
if command -v ping >/dev/null 2>&1; then
    # Use -c for Linux, -n for Windows
    PING_COUNT=1
    if [ "$(uname)" = "Windows_NT" ] || [ "$(uname)" = "CYGWIN_NT-6.3" ]; then
        if ! ping -n 1 8.8.8.8 >/dev/null 2>&1; then
            log_warn "No internet connectivity detected"
            NETWORK_CHECKS_PASSED=false
        fi
    else
        if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
            log_warn "No internet connectivity detected"
            NETWORK_CHECKS_PASSED=false
        fi
    fi
fi

if [ "$NETWORK_CHECKS_PASSED" = false ]; then
    log_warn "Network issues detected. You may experience Docker image pull failures."
    log_warn "Check your DNS settings and internet connection."
fi

# Pull pre-built images with retry logic and verbose output
log_info "Pulling latest images (this may take a while)..."
PULL_SUCCESS=false
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$PULL_SUCCESS" = false ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -gt 1 ]; then
        log_info "Retry $RETRY_COUNT/$MAX_RETRIES after brief pause..."
        sleep 5
    fi
    
    # Capture full output for debugging
    PULL_OUTPUT=$(su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose pull" 2>&1)
    PULL_EXIT_CODE=$?
    
    if [ $PULL_EXIT_CODE -eq 0 ]; then
        PULL_SUCCESS=true
    else
        # Check for specific errors
        echo "$PULL_OUTPUT" | grep -i "resolve\|not found\|no such image" && log_warn "Image resolution failed - check registry/network"
        echo "$PULL_OUTPUT" | grep -i "rate limit" && log_warn "Docker Hub rate limit exceeded - try: docker login"
        echo "$PULL_OUTPUT" | grep -i "connection\|network\|timeout" && log_warn "Network error - check internet connection"
        
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            log_warn "Image pull failed with exit code $PULL_EXIT_CODE, retrying..."
        fi
    fi
done

if [ "$PULL_SUCCESS" = false ]; then
    log_warn "Failed to pull images after $MAX_RETRIES attempts"
    log_warn "This may be due to:\n"
    log_warn "  - Docker Hub rate limiting (try: docker login)"
    log_warn "  - Network/firewall issues"
    log_warn "  - Registry downtime"
    log_warn "Continuing with available images..."
fi

log_info "Starting containers..."
if ! su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose up -d"; then
    log_error "Failed to start Docker stack"
    exit 1
fi

# Verify containers are running
sleep 5
# Check for containers that exited with non-zero status (actual failures)
FAILED_CONTAINERS=$(su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose ps -a --format '{{.Service}} {{.State}} {{.Status}}' 2>/dev/null" | grep -E "exited \([1-9]|Exited \([1-9]" || true)

if [ -n "$FAILED_CONTAINERS" ]; then
    log_error "The following containers failed (non-zero exit):"
    echo "$FAILED_CONTAINERS"
    log_error "Check logs with: cd $OWEIBO_DIR && docker compose logs <service-name>"
    exit 1
fi

show_success_banner "Docker stack deployed successfully"
echo ""


# ============================================
# STEP 10: OLLAMA MODEL DOWNLOAD
# ============================================
show_step_header "10" "Downloading Ollama Model"

log_info "Waiting for Ollama API (max 60s)..."
TIMEOUT=60
until curl -s http://localhost:11434/api/tags >/dev/null 2>&1 || [ $TIMEOUT -le 0 ]; do
    sleep 2
    ((TIMEOUT-=2)) || true
done

if [ $TIMEOUT -gt 0 ]; then
    log_info "Downloading Ollama models: $OLLAMA_MODEL"
    log_info "Download size estimates: 1b=~1GB, 3b=~2GB, 7b=~4GB"
    sleep 5
    
    # Iterate through models and pull each one
    for model in $OLLAMA_MODEL; do
        su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose exec -T ollama ollama pull '$model'" >/dev/null 2>&1 &
        MOD_PID=$!
        show_fancy_spinner $MOD_PID "Ollama model: $model"
        wait $MOD_PID || log_warn "Ollama model download failed for $model"
    done
    show_success_banner "Ollama models downloaded successfully"
else
    log_warn "Ollama didn't start in time. Pull models manually."
fi

echo ""

# ============================================
# STEP 11: HEALTH CHECKS
# ============================================
show_step_header "11" "Running Service Health Checks"

sleep 5  # Give services a moment to bind ports

FAILED_CHECKS=()

# Check Ollama (11434)
if ! curl -m 5 -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    FAILED_CHECKS+=("Ollama (11434)")
fi

# Check OpenClaw (18789)
if ! curl -m 5 -sf http://localhost:18789 >/dev/null 2>&1; then
    FAILED_CHECKS+=("OpenClaw (18789)")
fi

# Check Qdrant (6333) — Phase 1 Task 1.12
if ! curl -m 5 -sf http://localhost:6333/healthz >/dev/null 2>&1; then
    FAILED_CHECKS+=("Qdrant vector DB (6333)")
fi

# Check kilo-pipeline (3100) — OpenClaw Kilo integration
if ! curl -m 5 -sf http://localhost:3100/health >/dev/null 2>&1; then
    log_warn "  kilo-pipeline (3100) not responding — check docker compose logs kilo-pipeline"
fi

# Check Watchtower (Container running check as it has no ports)
if ! su - "$ACTUAL_USER" -c "cd '$OWEIBO_DIR' && docker compose ps --format '{{.State}}' watchtower 2>/dev/null" | grep -q "running"; then
    FAILED_CHECKS+=("Watchtower (Container not running)")
fi

if [ ${#FAILED_CHECKS[@]} -gt 0 ]; then
    log_warn "The following services are not responding:"
    printf '  - %s\n' "${FAILED_CHECKS[@]}"
    log_warn "This might be normal if they are still initializing."
    log_warn "Check logs with: cd $OWEIBO_DIR && docker compose logs -f <service>"
else
    log_success "All services appear to be functional."
fi

echo ""
echo ""

# ============================================
# STEP 12: SYSTEMD SERVICE FOR PERSISTENCE
# ============================================
show_step_header "12" "Setting up Systemd Persistence"

if [ "${PERSISTENT_MODE:-true}" = "true" ]; then
    SERVICE_FILE="/etc/systemd/system/openclaw-agent.service"
    log_info "Creating Agent systemd service..."

    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=OpenClaw Autonomous Agent Platform
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$OWEIBO_DIR
User=$ACTUAL_USER
Group=$ACTUAL_USER
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable openclaw-agent.service
    log_success "Created and enabled openclaw-agent.service"
else
    log_info "Skipping systemd service (PERSISTENT_MODE is false)"
fi

# Ensure maintenance scripts are executable
[ -f "$OWEIBO_DIR/check-ssl-expiry.sh" ] && chmod +x "$OWEIBO_DIR/check-ssl-expiry.sh"
[ -f "$OWEIBO_DIR/update.sh" ] && chmod +x "$OWEIBO_DIR/update.sh"
[ -f "$OWEIBO_DIR/backup-oweibo.sh" ] && chmod +x "$OWEIBO_DIR/backup-oweibo.sh"

# Register weekly SSL check cron job (Every Sunday at midnight)
CRON_JOB="0 0 * * 0 $OWEIBO_DIR/check-ssl-expiry.sh >> /var/log/oweibo-cron.log 2>&1"
if (crontab -l 2>/dev/null | grep -v "check-ssl-expiry.sh"; echo "$CRON_JOB") | crontab -u "$ACTUAL_USER" - 2>/dev/null; then
    log_success "Weekly SSL monitoring cron job registered."
else
    # Fallback to system crontab if user crontab fails
    log_warn "User crontab failed, trying system crontab..."
    echo "$CRON_JOB" >> /etc/cron.d/oweibo-ssl
    chmod 0644 /etc/cron.d/oweibo-ssl
    log_success "Weekly SSL monitoring cron job registered (system crontab)."
fi

# Register weekly Oweibo backup cron job (Every Sunday at 2 AM)
BACKUP_CRON="0 2 * * 0 $OWEIBO_DIR/backup-oweibo.sh >> /var/log/oweibo-cron.log 2>&1"
if (crontab -l 2>/dev/null | grep -v "backup-oweibo.sh"; echo "$BACKUP_CRON") | crontab -u "$ACTUAL_USER" - 2>/dev/null; then
    log_success "Weekly automated backup cron job registered (Sundays at 2 AM)."
else
    # Fallback to system crontab if user crontab fails
    log_warn "User crontab failed for backup, trying system crontab..."
    echo "$BACKUP_CRON" >> /etc/cron.d/oweibo-backup
    chmod 0644 /etc/cron.d/oweibo-backup
    log_success "Weekly automated backup cron job registered (system crontab, Sundays at 2 AM)."
fi


# ============================================
# COMPLETION SUMMARY
# ============================================
clear
show_success_banner "AGENT FACTORY SETUP COMPLETE!"

echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  SYSTEM CONFIGURATION                                       │"
printf "  │  - User:       %-44s │\n" "$ACTUAL_USER"
printf "  │  - Network:    %-44s │\n" "${INTERFACE:-Unknown}"
printf "  │  - IP Addr:    %-44s │\n" "${CONFIGURED_IP:-Unknown}"
echo "  ├─────────────────────────────────────────────────────────────┤"
echo "  │  AGENT SERVICES (Local Access)                              │"
printf "  │  - Ollama API:      %-39s │\n" "http://${CONFIGURED_IP:-localhost}:11434"
printf "  │  - Open WebUI:      %-39s │\n" "http://${CONFIGURED_IP:-localhost}:3000"
printf "  │  - OpenClaw API:    %-39s │\n" "http://${CONFIGURED_IP:-localhost}:18789"
printf "  │  - Kilo Pipeline:   %-39s │\n" "http://${CONFIGURED_IP:-localhost}:3100"
printf "  │  - Qdrant Vector:   %-39s │\n" "http://${CONFIGURED_IP:-localhost}:6333"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""

if [ "${GRUB_MODIFIED:-false}" = "true" ]; then
    log_warn "IMPORTANT: GRUB was updated. REBOOT REQUIRED for CPU optimizations:"
    echo "  sudo reboot"
else
    show_success_banner "No reboot needed. All services are running."
fi

echo ""
log_info "Verification commands:"
echo "  - docker ps                        # Check running containers"
echo "  - ip addr show ${INTERFACE:-}      # Verify network config"
echo "  - systemctl status openclaw-agent  # Check persistence service"
echo ""
    show_success_banner "Setup complete! Enjoy your Agent Factory."
}

# ============================================
# MAIN ENTRY POINT
# ============================================

main() {
    local force_wizard=0
    local agent_only=0
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --wizard)
                force_wizard=1
                shift
                ;;
            --agent-only)
                agent_only=1
                log_info "Running in Agent Only mode"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    # 1. Onboarding check (Smart Auto-Start)
    if [ "$force_wizard" -eq 1 ] || [ ! -f "$SCRIPT_DIR/config.env" ]; then
        if [ ! -f "$SCRIPT_DIR/config.env" ]; then
            echo ""
            echo "  ┌─────────────────────────────────────────────────────────────┐"
            echo "  │  Welcome to Oweibo Setup!                                   │"
            echo "  │  No configuration found. I'll run the wizard now.           │"
            echo "  └─────────────────────────────────────────────────────────────┘"
            echo ""
        fi
        
        # If running as root, re-run as non-root for wizard (proper file ownership)
        if [ "$EUID" -eq 0 ]; then
            if [ -n "$SUDO_USER" ]; then
                log_info "Re-running wizard as $SUDO_USER for proper file ownership..."
                exec sudo -u "$SUDO_USER" bash "$0" --wizard
            fi
        fi
        
        # Run wizard phase
        run_onboarding_wizard
        
        # Ask if they want to proceed with installation or just save config
        echo ""
        read -p "  Config saved. Continue with installation? [Y/n]: " CONTINUE
        if [[ ! "${CONTINUE:-y}" =~ ^[Yy]$ ]]; then
            log_info "Config saved to config.env. Run './setup.sh' again to install."
            exit 0
        fi
    fi

    # 2. Elevation Check
    if [ "$EUID" -ne 0 ]; then
        # Check if we should re-exec as root
        if command -v sudo >/dev/null 2>&1; then
            log_info "Elevating to root for installation..."
            
            # Filter out --wizard from arguments to avoid repeating it
            local args=()
            for arg in "$@"; do
                [[ "$arg" != "--wizard" ]] && args+=("$arg")
            done
            
            exec sudo bash "$0" "${args[@]}"
        else
            log_error "Significant system changes require root. Please run as root."
            exit 1
        fi
    fi

    # 3. Final Execution
    # Ensure config is loaded
    if [ -f "$SCRIPT_DIR/config.env" ]; then
        source "$SCRIPT_DIR/config.env"
    else
        log_error "config.env not found even after wizard. Fatal error."
        exit 1
    fi

    run_setup
}

# Trap cleanup for the whole process
trap cleanup EXIT

# GO!
main "$@"
