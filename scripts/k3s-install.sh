#!/bin/bash
# =============================================================================
# K3s Installation Script
# Installs K3s with hardware-aware resource allocation
# =============================================================================

set -euo pipefail

# Configuration
K3S_VERSION="${K3S_VERSION:-v1.31}"
NVIDIA_DEVICE_PLUGIN_VERSION="${NVIDIA_DEVICE_PLUGIN_VERSION:-v0.16.2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }

# Source hardware detection
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOMELAB_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$HOMELAB_DIR/scripts/hardware-detect.sh" ]; then
    source "$HOMELAB_DIR/scripts/hardware-detect.sh"
else
    log_error "hardware-detect.sh not found. Cannot proceed."
fi

# Pre-flight checks
preflight_k3s() {
    log "Running K3s pre-flight checks..."

    # Check root
    if [ "$EUID" -ne 0 ]; then
        log_error "K3s installation requires root. Run with sudo."
    fi

    # Check port 6443
    if ss -tln 2>/dev/null | grep -q ':6443 '; then
        log_error "Port 6443 is already in use. K3s API server cannot bind."
    fi

    # Check network connectivity
    log "Checking network connectivity..."
    if ! curl -sfL --max-time 10 https://get.k3s.io > /dev/null 2>&1; then
        log_error "Cannot reach https://get.k3s.io - network is unavailable."
    fi

    # Check RAM
    local ram_mb
    ram_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0")
    if [ "$ram_mb" -lt 2048 ]; then
        log_error "K3s requires at least 2GB RAM. Detected: $((ram_mb / 1024))GB (${ram_mb}MB)."
    fi

    # Check storage
    local storage
    storage=$(detect_storage_readiness)
    if [ "$storage" = "STORAGE_INSUFFICIENT" ]; then
        log_error "K3s requires at least 20GB free disk space."
    fi
    if [ "$storage" = "STORAGE_CRITICAL" ]; then
        log_warn "Disk space is tight. K3s may encounter issues under load."
    fi

    log_success "Pre-flight checks passed."
}

# Install Helm
install_helm() {
    if command -v helm &>/dev/null; then
        log "Helm already installed: $(helm version --short)"
        return
    fi

    log "Installing Helm..."
    local temp_script
    temp_script=$(mktemp)
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 -o "$temp_script"
    chmod 700 "$temp_script"
    "$temp_script"
    rm -f "$temp_script"
    log_success "Helm installed: $(helm version --short)"
}

# Install NVIDIA runtime for K3s
install_nvidia_runtime() {
    local gpu_vendor
    gpu_vendor=$(detect_gpu_vendor)

    if [ "$gpu_vendor" != "NVIDIA" ]; then
        return
    fi

    log "NVIDIA GPU detected - installing NVIDIA Container Toolkit..."

    # Install NVIDIA drivers if needed
    if ! command -v nvidia-smi &>/dev/null; then
        log "Installing NVIDIA drivers..."
        apt-get update
        apt-get install -y ubuntu-drivers-common || true
        ubuntu-drivers install --gpgpu || log_warn "NVIDIA driver installation failed"
    fi

    # Install NVIDIA Container Toolkit
    local distribution
    distribution=$(. /etc/os-release; echo "${ID}${VERSION_ID}")

    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
        || log_error "Failed to add NVIDIA GPG key"

    # Verify key fingerprint before accepting
    # Note: GPG outputs fingerprints with colons, so we need to remove both spaces AND colons for comparison
    local expected_fp="C95B321B61E88C1809C4F759DDCAE044F796DCB0"
    if ! gpg --no-default-keyring --keyring /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg --fingerprint 2>/dev/null | tr -d ' :' | grep -qi "$expected_fp"; then
        rm -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        log_error "NVIDIA GPG key verification failed! Fingerprint mismatch."
    fi
    curl -sL "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null \
        || log_error "Failed to add NVIDIA repository"

    apt-get update
    apt-get install -y nvidia-container-toolkit

    # Configure K3s containerd
    local k3s_containerd_dir="/var/lib/rancher/k3s/agent/etc/containerd"
    mkdir -p "$k3s_containerd_dir"

    cat > "${k3s_containerd_dir}/config.toml.tmpl" << 'CONTAINERD_EOF'
version = 2

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  runtime_type = "io.containerd.runc.v2"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
  SystemdCgroup = true

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.nvidia]
  runtime_type = "io.containerd.runc.v2"
  privileged_without_host_devices = false

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.nvidia.options]
  BinaryName = "/usr/bin/nvidia-container-runtime"
  SystemdCgroup = true
CONTAINERD_EOF

    log "K3s containerd configured for NVIDIA."

    # Restart K3s
    systemctl restart k3s || true
    log "K3s restarted to load NVIDIA runtime."

    # Install NVIDIA Device Plugin
    log "Installing NVIDIA K8s Device Plugin ${NVIDIA_DEVICE_PLUGIN_VERSION}..."
    kubectl apply -f "https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/${NVIDIA_DEVICE_PLUGIN_VERSION}/deployments/static/nvidia-device-plugin.yml"

    log_success "NVIDIA Container Toolkit installed and configured for K3s."
}

# Get K8s overlay directory
get_k8s_overlay() {
    local gpu_tier hardware_profile

    gpu_tier=$(get_gpu_tier)
    hardware_profile=$(get_hardware_profile)

    # Prefer GPU-specific overlay
    if [ -d "$HOMELAB_DIR/k8s/overlays/$gpu_tier" ]; then
        echo "$gpu_tier"
    elif [ -d "$HOMELAB_DIR/k8s/overlays/$hardware_profile" ]; then
        echo "$hardware_profile"
    else
        echo "high-perf"
    fi
}

# Install K3s
install_k3s() {
    log "Installing K3s ${K3S_VERSION}..."

    # Install K3s with embedded containerd
    # Download to temp file first to avoid curl|bash supply chain risk
    local k3s_install_script
    k3s_install_script=$(mktemp)
    log "Downloading K3s install script..."
    if ! curl -sfL https://get.k3s.io -o "$k3s_install_script" 2>/dev/null; then
        rm -f "$k3s_install_script"
        log_error "Failed to download K3s install script"
    fi
    chmod 700 "$k3s_install_script"
    log "Running K3s install script..."
    "$k3s_install_script" INSTALL_K3S_VERSION="$K3S_VERSION" INSTALL_K3S_SKIP_START=true
    rm -f "$k3s_install_script"

    # Start K3s
    systemctl enable k3s --now || true

    # Wait for K3s to be ready
    sleep 5
    kubectl wait --for=condition=Ready nodes --all --timeout=60s || true

    # Install Helm
    install_helm

    # Install Traefik via Helm (disable built-in)
    log "Adding Traefik Helm repository..."
    if helm repo add traefik https://traefik.github.io/charts 2>&1; then
        log "Traefik Helm repo added successfully"
    else
        log_warn "Failed to add Traefik Helm repo (may already exist)"
    fi
    helm repo update
    helm install traefik traefik/traefik \
        --namespace homelab \
        --create-namespace \
        --set ports.websecure.tls.enabled=true \
        --set ingressClass.enabled=true \
        --set ingressClass.isDefaultClass=true

    # Install NVIDIA runtime if applicable
    install_nvidia_runtime

    # Apply base manifests
    log "Applying base manifests..."
    kubectl apply -k "$HOMELAB_DIR/k8s/base"

    # Apply hardware-specific overlay
    local overlay
    overlay=$(get_k8s_overlay)
    log "Applying overlay: $overlay"
    kubectl apply -k "$HOMELAB_DIR/k8s/overlays/$overlay"

    # Apply service manifests
    log "Applying service manifests..."
    kubectl apply -k "$HOMELAB_DIR/k8s/services/traefik"
    kubectl apply -k "$HOMELAB_DIR/k8s/services/ollama"
    kubectl apply -k "$HOMELAB_DIR/k8s/services/qdrant"

    log_success "K3s installation complete! Overlay: $overlay"
}

# Uninstall K3s
uninstall_k3s() {
    log "Uninstalling K3s..."

    # Remove Helm releases
    helm uninstall traefik --namespace homelab 2>/dev/null || true

    # Remove K3s
    if [ -f /usr/local/bin/k3s-uninstall.sh ]; then
        /usr/local/bin/k3s-uninstall.sh
    fi

    # Clean up NVIDIA Container Toolkit repositories (if present)
    if [ -f /etc/apt/sources.list.d/nvidia-container-toolkit.list ]; then
        rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list
        log "Removed NVIDIA Container Toolkit repository"
    fi
    if [ -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg ]; then
        rm -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        log "Removed NVIDIA GPG key"
    fi

    log_success "K3s uninstall complete!"
}

# Show usage
usage() {
    cat << EOF
Usage: $0 {install|uninstall|preflight|overlay}

Commands:
    install     Install K3s with hardware-aware configuration
    uninstall   Remove K3s from the system
    preflight   Run pre-flight checks only
    overlay     Show which overlay will be applied

Environment Variables:
    K3S_VERSION                      K3s version (default: v1.31)
    NVIDIA_DEVICE_PLUGIN_VERSION      NVIDIA device plugin version (default: v0.16.2)
    FORCE_DEPLOYMENT                 Override deployment detection (k3s|docker)

EOF
}

# Main entry point
case "${1:-install}" in
    install)
        preflight_k3s
        install_k3s
        ;;
    uninstall)
        uninstall_k3s
        ;;
    preflight)
        preflight_k3s
        ;;
    overlay)
        echo "Overlay: $(get_k8s_overlay)"
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        log_error "Unknown command: $1"
        usage
        exit 1
        ;;
esac
