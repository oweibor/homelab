#!/bin/bash
# ==========================================================
# COMPLETE N100 HOMELAB SETUP SCRIPT
# System Configuration + Bluetooth + Static IP + Docker Stack
# Intel N100 / Ubuntu Server 24.04+
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
show_spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
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
            rm -f /etc/netplan/99-homelab-static.yaml 2>/dev/null || true
            # Restore backups
            cp -a /etc/netplan/backup/*.yaml /etc/netplan/ 2>/dev/null || true
            netplan apply 2>/dev/null || true
            log_info "Backup restored."
        fi

        # Stop any started containers if we were in the middle of deployment
        if [ -n "${HOMELAB_DIR:-}" ] && [ -f "$HOMELAB_DIR/docker-compose.yml" ]; then
             # Check if docker is running first
             if systemctl is-active --quiet docker; then
                 log_warn "Stopping any started containers..."
                 # We need to su to the user to run docker compose down correctly with user context
                 if [ -n "${ACTUAL_USER:-}" ]; then
                     su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose down" 2>/dev/null || true
                 fi
             fi
        fi
        log_error "Setup failed. Check logs above for details."
    fi
    exit $exit_code
}
trap cleanup EXIT

# ============================================
# PRE-CHECKS & USER VALIDATION
# ============================================
if [ "$EUID" -ne 0 ]; then 
    log_error "Please run as root: sudo ./complete-homelab-setup.sh"
    exit 1
fi

# Get the actual user who ran sudo
ACTUAL_USER="${SUDO_USER:-}"
if [ -z "$ACTUAL_USER" ] || [ "$ACTUAL_USER" = "root" ]; then
    log_error "Cannot determine non-root user. Do not run directly as root."
    log_error "Usage: sudo ./complete-homelab-setup.sh"
    exit 1
fi

if ! id "$ACTUAL_USER" >/dev/null 2>&1; then
    log_error "User $ACTUAL_USER does not exist"
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
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        N100 HOMELAB COMPLETE SETUP SCRIPT                  ║"
echo "║                                                            ║"
echo "║  This script will configure:                               ║"
echo "║  1. System updates & dependencies                          ║"
echo "║  2. Bluetooth hardware & D-Bus                             ║"
echo "║  3. Static IP configuration                                ║"
echo "║  4. Docker & Docker Compose                                ║"
echo "║  5. Performance optimizations (CPU C-states, governor)     ║"
echo "║  6. Docker stack (HA, Plex, Ollama, n8n, Samba)            ║"
echo "║                                                            ║"
printf "║  Running as user: %-40s ║\n" "$ACTUAL_USER"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
read -p "Press ENTER to continue or Ctrl+C to abort..."
echo ""

# ============================================
# STEP 1: SYSTEM UPDATES
# ============================================
log_step "STEP 1: Updating Ubuntu & Installing Dependencies"
log_step "STEP 1: Updating Ubuntu & Installing Dependencies"
export DEBIAN_FRONTEND=noninteractive

log_info "Updating package lists..."
apt update -qq &
show_spinner $!

log_info "Upgrading packages (this may take a while)..."
apt upgrade -y -qq &
show_spinner $!

log_info "Installing dependencies..."
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
show_spinner $!

unset DEBIAN_FRONTEND
log_info "System updated successfully"
echo ""


# ============================================
# STEP 2: BLUETOOTH CONFIGURATION
# ============================================
log_step "STEP 2: Configuring Bluetooth Hardware"

# Verify D-Bus (critical for Home Assistant)
if ! systemctl is-active --quiet dbus; then
    log_warn "D-Bus service not running. Starting now..."
    systemctl start dbus
fi

if ! dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames &>/dev/null; then
    log_error "D-Bus system bus is not accessible. Home Assistant Bluetooth may not work."
    log_warn "This can happen in containers or minimal installations."
    read -p "Continue anyway? (yes/no) [no]: " CONTINUE
    if [[ ! "${CONTINUE:-no}" =~ ^[Yy][Ee]?[Ss]?$ ]]; then
        exit 1
    fi
else
    log_info "D-Bus system bus is accessible"
fi

# Unblock Bluetooth
if rfkill list bluetooth 2>/dev/null | grep -q "yes"; then
    log_warn "Bluetooth is blocked. Unblocking now..."
    rfkill unblock bluetooth
    sleep 1
fi

# Enable and start Bluetooth service
systemctl enable bluetooth 2>/dev/null || log_warn "Bluetooth service not found"
systemctl start bluetooth 2>/dev/null || log_warn "Could not start Bluetooth service"

# Verify Bluetooth hardware
if command -v bluetoothctl &> /dev/null; then
     if bluetoothctl show | grep -q "Controller"; then
        log_info "Bluetooth controller detected via bluetoothctl"
     else
        log_warn "No Bluetooth controller found via bluetoothctl"
     fi
elif command -v hcitool &> /dev/null && hcitool dev 2>/dev/null | grep -q "hci"; then
    log_info "Bluetooth hardware detected via hcitool:"
    hcitool dev | grep hci
else
    log_warn "No Bluetooth hardware detected. Check BIOS settings or USB dongle"
fi

# Force HCI0 radio up (fixes N100 Bluetooth issues)
if command -v hciconfig &> /dev/null && hciconfig 2>/dev/null | grep -q "hci0"; then
    log_info "Ensuring hci0 radio is up"
    hciconfig hci0 up 2>/dev/null || log_warn "Could not bring hci0 up (may already be active)"
    sleep 1
fi
echo ""

# ============================================
# STEP 3: NETWORK CONFIGURATION
# ============================================

log_step "STEP 3: Detecting physical network interfaces..."

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
FULL_IP=$(ip -o -4 addr show "$INTERFACE" | awk '{print $4}')
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
    fi
fi

# Configure static IP
if [ "${SKIP_NETWORK:-false}" != "true" ]; then
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
                 log_error "No current IP to use. Please enter manual IP."
                 # Assume user will retry or script fails - simple exit for now
                 exit 1
            fi
            log_info "Will make current DHCP IP ($CURRENT_IP) static"
        fi

        # Get gateway if not detected
        while [ -z "${GATEWAY:-}" ]; do
            read -p "Enter gateway IP: " GATEWAY
            if ! validate_ip "$GATEWAY"; then
                log_error "Invalid gateway IP"
                GATEWAY=""
            fi
        done

        # Get DNS servers
        read -p "Enter DNS servers (space or comma-separated) [1.1.1.1 8.8.8.8]: " DNS_INPUT
        DNS_INPUT=${DNS_INPUT:-"1.1.1.1 8.8.8.8"}
        DNS_SERVERS=$(echo "$DNS_INPUT" | tr ' ' ',' | sed 's/,\+/,/g' | sed 's/^,//;s/,$//')

        # Validate DNS servers
        IFS=',' read -r -a DNS_ARRAY <<< "$DNS_SERVERS"
        for dns in "${DNS_ARRAY[@]}"; do
            dns=$(echo "$dns" | xargs)
            if ! validate_ip "$dns"; then
                log_error "Invalid DNS server: $dns"
                exit 1
            fi
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
        mv "$TEMP_NETPLAN" /etc/netplan/99-homelab-static.yaml
        chmod 600 /etc/netplan/99-homelab-static.yaml

        # NOW safe to move old configs to backup instead of deleting
        for f in /etc/netplan/*.yaml; do
            [ "$f" = "/etc/netplan/99-homelab-static.yaml" ] && continue
            if [ -f "$f" ]; then
                 mv "$f" /etc/netplan/backup/ 2>/dev/null || true
            fi
        done

        # Validate YAML
        if netplan generate >/dev/null 2>&1; then
            log_info "YAML syntax is valid"
        else
            log_error "YAML syntax error detected"
            cat /etc/netplan/99-homelab-static.yaml
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
            rm -f /etc/netplan/99-homelab-static.yaml
            cp -a /etc/netplan/backup/*.yaml /etc/netplan/ 2>/dev/null || true
            netplan apply
            exit 1
        fi
    else
        log_info "Skipping static IP configuration"
        CONFIGURED_IP=${CURRENT_IP:-}
    fi
else
    CONFIGURED_IP=${CURRENT_IP:-}
fi
echo ""


# ============================================
# STEP 4: DOCKER INSTALLATION
# ============================================
log_step "STEP 4: Installing Docker & Docker Compose"

if command -v docker &> /dev/null; then
    log_info "Docker already installed: $(docker --version)"
else
    # Remove old Docker versions
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
    log_info "Installing Docker packages..."
    apt update -qq &
    show_spinner $!
    
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin &
    show_spinner $!

    # Enable Docker
    systemctl enable docker
    systemctl start docker
    log_info "Docker installed successfully"
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
echo ""


# ============================================
# STEP 5: PERFORMANCE OPTIMIZATIONS
# ============================================
log_step "STEP 5: Applying Performance Optimizations"

# CPU governor to performance
log_info "Setting CPU governor to performance..."
for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    if [ -f "$cpu" ]; then
        echo performance | tee "$cpu" >/dev/null 2>&1 || true
    fi
done

# Persistent CPU governor
if [ -d /etc/default ]; then
    echo 'GOVERNOR="performance"' | tee /etc/default/cpufrequtils >/dev/null
    systemctl disable ondemand 2>/dev/null || true
fi

# Sysctl optimizations
SYSCTL_CONF="/etc/sysctl.d/99-homelab.conf"
if [ ! -f "$SYSCTL_CONF" ]; then
    tee "$SYSCTL_CONF" >/dev/null <<EOF
vm.dirty_ratio=10
vm.dirty_background_ratio=5
EOF
    sysctl -p "$SYSCTL_CONF" >/dev/null
    log_info "Sysctl optimizations applied"
fi

# GRUB C-state optimization (N100 stability)
GRUB_FILE="/etc/default/grub"
FLAGS="intel_idle.max_cstate=2 processor.max_cstate=2"
GRUB_MODIFIED=false

# Idempotent GRUB check
if grep -q "intel_idle.max_cstate" "$GRUB_FILE"; then
    log_info "GRUB already configured for C-state optimization"
else
    # Backup GRUB config
    cp "$GRUB_FILE" "${GRUB_FILE}.backup-$(date +%Y%m%d-%H%M%S)"

    # Only append if not present - Safer sed to target the closing quote of the variable
    # NOTE: This assumes GRUB_CMDLINE_LINUX_DEFAULT is on one line and ends with a double quote.
    # Standard Ubuntu Server defaults match this.
    if sed -i '/^GRUB_CMDLINE_LINUX_DEFAULT=/ s/"$/ '"$FLAGS"'"/' "$GRUB_FILE"; then
        update-grub
        GRUB_MODIFIED=true
        log_info "GRUB updated (backup saved)"
    else
        log_warn "Failed to update GRUB automatically. Please check /etc/default/grub"
    fi
fi
echo ""


# ============================================
# STEP 6: HOMELAB DIRECTORY STRUCTURE
# ============================================
log_step "STEP 6: Creating Homelab Directory Structure"

HOMELAB_DIR="$USER_HOME/homelab"
mkdir -p "$HOMELAB_DIR"/{homeassistant,plex/config,plex/transcode,media,n8n,samba,backups,open-webui}

# Set permissions
PUID=$(id -u "$ACTUAL_USER")
PGID=$(id -g "$ACTUAL_USER")

chown -R "$ACTUAL_USER:$ACTUAL_USER" "$HOMELAB_DIR"
# Correctly use user's UID for n8n ownership (usually maps to 1000, but safer to use PUID)
chown -R "$PUID:$PGID" "$HOMELAB_DIR/n8n"
chmod 770 "$HOMELAB_DIR/plex/transcode"
chmod 770 "$HOMELAB_DIR/media"

log_info "Directory structure created at $HOMELAB_DIR"
echo ""

# ============================================
# STEP 7: GENERATE SERVICE CREDENTIALS
# ============================================
log_step "STEP 7: Generating Service Credentials"

# Samba credentials
SAMBA_ENV="$HOMELAB_DIR/samba/.env"
if [ ! -f "$SAMBA_ENV" ]; then
    SAMBA_USER="$ACTUAL_USER"
    # Stronger password
    SAMBA_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
    echo "SAMBA_USER=$SAMBA_USER" > "$SAMBA_ENV"
    echo "SAMBA_PASS=$SAMBA_PASS" >> "$SAMBA_ENV"
    chmod 600 "$SAMBA_ENV"
    chown "$ACTUAL_USER:$ACTUAL_USER" "$SAMBA_ENV"
    log_info "Samba credentials generated"
else
    log_info "Using existing Samba credentials"
    source "$SAMBA_ENV"
fi

# n8n credentials
N8N_ENV="$HOMELAB_DIR/n8n/.env"
if [ ! -f "$N8N_ENV" ]; then
    N8N_USER="admin"
    # Stronger password
    N8N_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
    echo "N8N_USER=$N8N_USER" > "$N8N_ENV"
    echo "N8N_PASS=$N8N_PASS" >> "$N8N_ENV"
    chmod 600 "$N8N_ENV"
    chown "$ACTUAL_USER:$ACTUAL_USER" "$N8N_ENV"
    log_info "n8n credentials generated"
else
    log_info "Using existing n8n credentials"
    source "$N8N_ENV"
fi

echo ""

# ============================================
# STEP 8: DOCKER COMPOSE CONFIGURATION
# ============================================
log_step "STEP 8: Configuring Docker Stack"

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
ENV_FILE="$HOMELAB_DIR/.env"
CONFIG_TEMPLATE="config.env.template"

# Load config template if exists in current directory
if [ -f "$CONFIG_TEMPLATE" ]; then
    log_info "Loading configuration from $CONFIG_TEMPLATE"
    # Read template but don't export yet (we want to control the write)
    # We'll just append non-empty lines to our new .env
    # Note: simple sourcing here for variables needed in script, but for .env generation we want clean append
    set -a
    source "$CONFIG_TEMPLATE"
    set +a
else
    log_info "No config template found at "$CONFIG_TEMPLATE""
fi

# Initialize .env file
echo "# Generated by setup.sh - $(date)" > "$ENV_FILE"

# --- Add Users/Groups ---
echo "PUID=$PUID" >> "$ENV_FILE"
echo "PGID=$PGID" >> "$ENV_FILE"
echo "RENDER_GID=$RENDER_GID" >> "$ENV_FILE"

# --- Add Credentials (referenced from Samba/n8n logic above) ---
# N8N
if [ -n "${N8N_USER:-}" ] && [ -n "${N8N_PASS:-}" ]; then
    echo "N8N_USER=$N8N_USER" >> "$ENV_FILE"
    echo "N8N_PASS=$N8N_PASS" >> "$ENV_FILE"
elif [ -f "$HOMELAB_DIR/n8n/.env" ]; then
    # Fallback to reading the files we just created/verified in Step 7
    grep "N8N_USER" "$HOMELAB_DIR/n8n/.env" >> "$ENV_FILE"
    grep "N8N_PASS" "$HOMELAB_DIR/n8n/.env" >> "$ENV_FILE"
fi

# SAMBA
if [ -n "${SAMBA_USER:-}" ] && [ -n "${SAMBA_PASS:-}" ]; then
    echo "SAMBA_USER=$SAMBA_USER" >> "$ENV_FILE"
    echo "SAMBA_PASS=$SAMBA_PASS" >> "$ENV_FILE"
elif [ -f "$HOMELAB_DIR/samba/.env" ]; then
    grep "SAMBA_USER" "$HOMELAB_DIR/samba/.env" >> "$ENV_FILE"
    grep "SAMBA_PASS" "$HOMELAB_DIR/samba/.env" >> "$ENV_FILE"
fi

# --- Add Configuration Variables ---
# Timezone
if [ -n "${TIMEZONE:-}" ]; then
    TZ="$TIMEZONE"
else
    TZ=$(cat /etc/timezone 2>/dev/null || echo "Etc/UTC")
fi
echo "TZ=$TZ" >> "$ENV_FILE"

# Ollama Model
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:1b llama3.2:3b}"
echo "OLLAMA_MODEL=$OLLAMA_MODEL" >> "$ENV_FILE"

# Plex Claim
if [ -n "${PLEX_CLAIM:-}" ]; then
    echo "PLEX_CLAIM=$PLEX_CLAIM" >> "$ENV_FILE"
fi

chmod 600 "$ENV_FILE"
chown "$ACTUAL_USER:$ACTUAL_USER" "$ENV_FILE"
log_info "Environment configuration generated at $ENV_FILE"

# Copy docker-compose.yml
SOURCE_COMPOSE="docker-compose.yml"
DEST_COMPOSE="$HOMELAB_DIR/docker-compose.yml"

if [ -f "$SOURCE_COMPOSE" ]; then
    if [ "$PWD" != "$HOMELAB_DIR" ]; then
        cp "$SOURCE_COMPOSE" "$DEST_COMPOSE"
        chown "$ACTUAL_USER:$ACTUAL_USER" "$DEST_COMPOSE"
        log_info "Copied docker-compose.yml to $HOMELAB_DIR"
    else
        log_info "Running from $HOMELAB_DIR, skipping file copy"
    fi
    
    # Validate docker-compose.yml syntax using the user context
    if su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose config >/dev/null 2>&1"; then
        log_info "Docker Compose file validated (available at $DEST_COMPOSE)"
    else
        log_error "Docker Compose file has syntax errors!"
        su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose config"
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
log_step "STEP 9: Deploying Docker Stack"

cd "$HOMELAB_DIR"

log_info "Pulling latest images (this may take a while)..."
# Pull in background, capture error if fails
if ! (su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose pull" >/dev/null 2>&1) & then
    PID=$!
    show_spinner $PID
    wait $PID
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        log_error "Failed to pull Docker images"
        exit 1
    fi
else
    # Immediate failure
    log_error "Failed to pull Docker images"
    exit 1
fi

log_info "Starting containers..."
if ! su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose up -d"; then
    log_error "Failed to start Docker stack"
    exit 1
fi

# Verify containers are running
sleep 5
# Check for containers that exited with non-zero status (actual failures)
FAILED_CONTAINERS=$(su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose ps -a --format '{{.Service}} {{.State}} {{.Status}}' 2>/dev/null" | grep -E "exited \([1-9]|Exited \([1-9]" || true)

if [ -n "$FAILED_CONTAINERS" ]; then
    log_error "The following containers failed (non-zero exit):"
    echo "$FAILED_CONTAINERS"
    log_error "Check logs with: cd $HOMELAB_DIR && docker compose logs <service-name>"
    exit 1
fi

log_success "Docker stack deployed successfully"
echo ""


# ============================================
# STEP 10: OLLAMA MODEL DOWNLOAD
# ============================================
log_step "STEP 10: Downloading Ollama Model"

log_info "Waiting for Ollama API (max 60s)..."
TIMEOUT=60
until curl -s http://localhost:11434/api/tags >/dev/null 2>&1 || [ $TIMEOUT -eq 0 ]; do
    sleep 2
    ((TIMEOUT-=2))
done

if [ $TIMEOUT -gt 0 ]; then
    log_info "Downloading Ollama models: $OLLAMA_MODEL"
    log_info "Download size estimates: 1b=~1GB, 3b=~2GB, 7b=~4GB"
    sleep 5
    
    # Iterate through models and pull each one
    for model in $OLLAMA_MODEL; do
        log_info "Pulling model: $model..."
        # Synchronous pull with -T to stream output to console so user sees progress
        if su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose exec -T ollama ollama pull '$model'"; then
             log_success "Ollama model $model downloaded successfully"
        else
             log_warn "Ollama model $model download failed. Try manually: docker compose exec ollama ollama pull $model"
        fi
    done
else
    log_warn "Ollama didn't start in time. Pull models manually."
fi

echo ""

# ============================================
# STEP 11: HEALTH CHECKS
# ============================================
log_step "STEP 11: Running Service Health Checks"

sleep 5  # Give services a moment to bind ports

FAILED_CHECKS=()

# Check Home Assistant (8123)
if ! curl -m 5 -sf http://localhost:8123 >/dev/null 2>&1; then
    FAILED_CHECKS+=("Home Assistant (8123)")
fi

# Check Plex (32400) - curl returns 401 usually which means it's running
if ! curl -m 5 -sf -o /dev/null -w "%{http_code}" http://localhost:32400/web | grep -q "200\|401"; then
     # Strict check might fail if not initialized, but connection refused is the main worry
     if ! curl -m 5 -s http://localhost:32400 >/dev/null 2>&1; then
        FAILED_CHECKS+=("Plex (32400)")
     fi
fi

# Check Ollama (11434)
if ! curl -m 5 -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    FAILED_CHECKS+=("Ollama (11434)")
fi

# Check n8n (5678)
if ! curl -m 5 -sf http://localhost:5678 >/dev/null 2>&1; then
    FAILED_CHECKS+=("n8n (5678)")
fi

# Check Samba (445) - TCP check since it's not HTTP
# Using bash's built-in TCP capability to avoid needing netcat
if ! timeout 2 bash -c '</dev/tcp/localhost/445' >/dev/null 2>&1; then
    FAILED_CHECKS+=("Samba (445)")
fi

# Check Watchtower (Container running check as it has no ports)
if ! su - "$ACTUAL_USER" -c "cd '$HOMELAB_DIR' && docker compose ps --format '{{.State}}' watchtower 2>/dev/null" | grep -q "running"; then
    FAILED_CHECKS+=("Watchtower (Container not running)")
fi

if [ ${#FAILED_CHECKS[@]} -gt 0 ]; then
    log_warn "The following services are not responding:"
    printf '  - %s\n' "${FAILED_CHECKS[@]}"
    log_warn "This might be normal if they are still initializing."
    log_warn "Check logs with: cd $HOMELAB_DIR && docker compose logs -f <service>"
else
    log_success "All services (including Samba & Watchtower) appear to be functional."
fi

echo ""
echo ""

# ============================================
# COMPLETION SUMMARY
# ============================================
clear
# Get statuses for summary
BT_STATUS=$(systemctl is-active bluetooth || echo "inactive")
DBUS_STATUS=$(systemctl is-active dbus || echo "inactive")

echo "╔════════════════════════════════════════════════════════════╗"
echo "║              HOMELAB SETUP COMPLETE!                       ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  SYSTEM CONFIGURATION                                      ║"
printf "║  - Bluetooth: %-44s ║\n" "$BT_STATUS"
printf "║  - D-Bus:     %-44s ║\n" "$DBUS_STATUS"
printf "║  - Network:   %-44s ║\n" "${INTERFACE:-Unknown}"
printf "║  - IP Addr:   %-44s ║\n" "${CONFIGURED_IP:-Unknown}"
printf "║  - Gateway:   %-44s ║\n" "${GATEWAY:-N/A}"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  SERVICES (All running on ${CONFIGURED_IP:-localhost})                 ║"
echo "║                                                            ║"
printf "║  Home Assistant:   %-40s║\n" "http://${CONFIGURED_IP:-localhost}:8123"
printf "║  Plex:             %-40s║\n" "http://${CONFIGURED_IP:-localhost}:32400/web"
printf "║  n8n:              %-40s║\n" "http://${CONFIGURED_IP:-localhost}:5678"
echo "║    - Username: ${N8N_USER:-See details above}                                   ║"
echo "║    - Password: ${N8N_PASS:-See details above}                                   ║"
printf "║  Ollama API:       %-40s║\n" "http://${CONFIGURED_IP:-localhost}:11434"
printf "║  Samba Media:      %-40s║\n" "smb://${CONFIGURED_IP:-localhost}/Media"
echo "║    - User: ${SAMBA_USER:-See details above}                                     ║"
echo "║    - Pass: ${SAMBA_PASS:-See details above}                                     ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  MAINTENANCE                                               ║"
echo "║  - Watchtower: Auto-updates every Sunday at 3 AM           ║"
echo "║  - Credentials: $HOMELAB_DIR/samba/.env                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ "${GRUB_MODIFIED:-false}" = "true" ]; then
    log_warn "IMPORTANT: GRUB was updated. REBOOT REQUIRED for CPU optimizations:"
    echo "  sudo reboot"
else
    log_info "No reboot needed. All services are running."
fi
echo ""
log_info "Verification commands:"
echo "  - docker ps                        # Check running containers"
echo "  - ip addr show ${INTERFACE:-}          # Verify network config"
echo "  - bluetoothctl show                # Check Bluetooth status"
echo ""
log_info "Setup complete! Enjoy your homelab."
