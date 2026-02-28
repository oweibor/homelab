#!/bin/bash
# =============================================================================
# HARDWARE DETECTION MODULE
# Isolated hardware discovery functions for unit testing
# =============================================================================

set -euo pipefail

# =============================================================================
# RAM DETECTION
# =============================================================================

# Get available RAM in GB (MemAvailable, not total)
get_ram_gb() {
    local ram_kb
    ram_kb=$(grep MemAvailable /proc/meminfo 2>/dev/null | awk '{print $2}')
    
    if [ -z "$ram_kb" ]; then
        # Fallback for non-Linux systems
        echo "4"
        return
    fi
    
    local ram_gb
    ram_gb=$(echo "scale=1; $ram_kb / 1024 / 1024" | bc 2>/dev/null || echo "4")
    echo "$ram_gb"
}

# Get effective RAM after OS buffer (2GB)
get_effective_ram_gb() {
    local ram_gb
    ram_gb=$(get_ram_gb)
    local effective
    effective=$(echo "scale=1; $ram_gb - 2.0" | bc 2>/dev/null || echo "2")
    
    if (( $(echo "$effective < 0" | bc -l 2>/dev/null || echo 0) )); then
        effective=0
    fi
    
    echo "$effective"
}

# =============================================================================
# CPU DETECTION  
# =============================================================================

# Get physical CPU cores (not logical threads)
get_cpu_cores() {
    local cores
    cores=$(lscpu 2>/dev/null | awk '/^Core\(s\) per socket/{c=$NF} /^Socket\(s\)/{s=$NF} END{print c*s}')
    
    if [ -z "$cores" ]; then
        # Fallback
        cores=$(nproc 2>/dev/null || echo "4")
    fi
    
    echo "$cores"
}

# Get CPU architecture
get_cpu_arch() {
    local arch
    arch=$(uname -m 2>/dev/null || echo "x86_64")
    echo "$arch"
}

# =============================================================================
# GPU DETECTION
# =============================================================================

# Detect GPU type and VRAM
detect_gpu() {
    local gpu_type="none"
    local vram_gb=0
    local gpu_label="None"
    
    # NVIDIA
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi &>/dev/null; then
            gpu_type="nvidia"
            vram_gb=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | awk '{print int($1/1024)}')
            local gpu_name
            gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
            gpu_label="NVIDIA $gpu_name"
        fi
    fi
    
    # AMD ROCm
    if [ "$gpu_type" = "none" ] && command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null; then
            gpu_type="amd"
            local vram_free
            vram_free=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Free Memory" | awk '{print $NF}' | head -1)
            if [ -n "$vram_free" ]; then
                vram_gb=$((vram_free / 1024))
            fi
            gpu_label="AMD GPU"
        fi
    fi
    
    # Apple Silicon (Metal)
    if [ "$gpu_type" = "none" ] && command -v system_profiler &>/dev/null; then
        local chip
        chip=$(system_profiler SPHardwareDataType 2>/dev/null | grep 'Chip' | awk '{print $NF}')
        if [[ "$chip" =~ Apple ]]; then
            gpu_type="metal"
            local total_mem
            total_mem=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1073741824}')
            # All RAM is available as VRAM on Apple Silicon
            vram_gb=$((total_mem - 2))  # Reserve 2GB for OS
            
            local gpu_cores
            gpu_cores=$(system_profiler SPDisplaysDataType 2>/dev/null | grep 'Total Number of Cores' | awk '{print $NF}')
            gpu_label="Apple $chip (${gpu_cores:-?} cores)"
        fi
    fi
    
    # Intel integrated GPU
    if [ "$gpu_type" = "none" ]; then
        if lspci 2>/dev/null | grep -qi "vga.*intel"; then
            gpu_type="igpu"
            vram_gb=1  # Shared memory estimate
            gpu_label="Intel Integrated GPU"
        fi
    fi
    
    echo "$gpu_type $vram_gb $gpu_label"
}

# Get GPU type only
get_gpu_type() {
    local result
    result=$(detect_gpu)
    echo "$result" | awk '{print $1}'
}

# Get VRAM in GB
get_vram_gb() {
    local result
    result=$(detect_gpu)
    echo "$result" | awk '{print $2}'
}

# =============================================================================
# STORAGE DETECTION
# =============================================================================

# Get free storage in GB for a path
get_free_storage_gb() {
    local path="${1:-$HOME}"
    local free_gb
    free_gb=$(df -P "$path" 2>/dev/null | tail -1 | awk '{print int($4/1024/1024)}')
    echo "${free_gb:-10}"
}

# =============================================================================
# SPEED CLASSIFICATION
# =============================================================================

# Classify hardware into tiers
classify_tier() {
    local ram_gb=$1
    local vram_gb=$2
    
    if (( $(echo "$ram_gb < 3" | bc -l 2>/dev/null || echo 1) )); then
        echo "INSUFFICIENT"
    elif (( $(echo "$ram_gb < 6" | bc -l 2>/dev/null || echo 0) )); then
        echo "MINIMAL"
    elif (( $(echo "$ram_gb < 10" | bc -l 2>/dev/null || echo 0) )); then
        echo "LOW"
    elif (( $(echo "$ram_gb < 20" | bc -l 2>/dev/null || echo 0) )); then
        echo "MID"
    elif (( $(echo "$ram_gb < 40" | bc -l 2>/dev/null || echo 0) )); then
        echo "HIGH"
    else
        echo "ULTRA"
    fi
}

# Get speed class based on hardware
get_speed_class() {
    local ram_gb=$1
    local cpu_cores=$2
    local gpu_type=$3
    local vram_gb=$4
    
    local tier
    tier=$(classify_tier "$ram_gb" "$vram_gb")
    
    # Apply GPU bonus
    if [ "$gpu_type" = "nvidia" ] || [ "$gpu_type" = "amd" ] || [ "$gpu_type" = "metal" ]; then
        if [ "$vram_gb" -ge 8 ]; then
            case $tier in
                MINIMAL) tier="LOW" ;;
                LOW) tier="MID" ;;
                MID) tier="HIGH" ;;
                HIGH) tier="ULTRA" ;;
            esac
        fi
    fi
    
    # Map tier to speed class
    case $tier in
        INSUFFICIENT) echo "INSUFFICIENT" ;;
        MINIMAL) echo "CPU_MARGINAL" ;;
        LOW) echo "LOW_CPU" ;;
        MID)
            if [ "$gpu_type" = "none" ]; then
                echo "LOW_CPU"
            else
                echo "GPU_GOOD"
            fi
            ;;
        HIGH|ULTRA) echo "GPU_GREAT" ;;
        *) echo "UNKNOWN" ;;
    esac
}

# =============================================================================
# DISPLAY FUNCTIONS
# =============================================================================

# Print hardware summary
print_hardware_summary() {
    local ram_gb=$1
    local cpu_cores=$2
    local gpu_type=$3
    local vram_gb=$4
    local tier=$5
    local speed_class=$6
    
    echo ""
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║           HARDWARE DETECTION SUMMARY                   ║"
    echo "  ╠═══════════════════════════════════════════════════════════╣"
    printf "  ║  RAM:        %-40s ║\n" "${ram_gb}GB available"
    printf "  ║  CPU:        %-40s ║\n" "${cpu_cores} physical cores"
    printf "  ║  GPU:        %-40s ║\n" "${gpu_type:-none} (${vram_gb}GB VRAM)"
    echo "  ╠═══════════════════════════════════════════════════════════╣"
    printf "  ║  Tier:       %-40s ║\n" "$tier"
    printf "  ║  Speed:      %-40s ║\n" "$speed_class"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
}

# =============================================================================
# MAIN (for testing)
# =============================================================================

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    # Run as script - show hardware info
    echo "Hardware Detection Test"
    echo "======================"
    
    local ram_gb
    ram_gb=$(get_ram_gb)
    local cpu_cores
    cpu_cores=$(get_cpu_cores)
    local gpu_info
    gpu_info=$(detect_gpu)
    local gpu_type
    gpu_type=$(echo "$gpu_info" | awk '{print $1}')
    local vram_gb
    vram_gb=$(echo "$gpu_info" | awk '{print $2}')
    local tier
    tier=$(classify_tier "$ram_gb" "$vram_gb")
    local speed_class
    speed_class=$(get_speed_class "$ram_gb" "$cpu_cores" "$gpu_type" "$vram_gb")
    
    print_hardware_summary "$ram_gb" "$cpu_cores" "$gpu_type" "$vram_gb" "$tier" "$speed_class"
fi
