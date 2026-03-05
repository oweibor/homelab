#!/bin/bash
# =============================================================================
# HARDWARE DETECTION MODULE
# Dynamically detects CPU type and capabilities for the homelab
# Supports: Intel N-series (N95/N97/N100/N200), Celeron, Core, AMD
# =============================================================================

# =============================================================================

# =============================================================================
# CPU DETECTION
# =============================================================================

# Get CPU model name from /proc/cpuinfo
# Usage: detect_cpu_model
detect_cpu_model() {
    local cpu_model
    cpu_model=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ *//')
    
    if [ -z "$cpu_model" ]; then
        cpu_model=$(grep -m1 "Model" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ *//')
    fi
    
    echo "${cpu_model:-unknown}"
}

# Detect CPU family/architecture
# Returns: INTEL_N_SERIES, INTEL_LOW_END, INTEL_CORE, INTEL_CORE_HIGH, AMD, AMD_RYZEN, UNKNOWN
# Usage: detect_cpu_family
detect_cpu_family() {
    local cpu_model
    cpu_model=$(detect_cpu_model)
    
    # Intel Atom/Alder Lake-N (N-series)
    if echo "$cpu_model" | grep -qiE "(\\bN[0-9]{2,3}\\b|Alder Lake-N)"; then
        echo "INTEL_N_SERIES"
    # Intel Celeron
    elif echo "$cpu_model" | grep -qiE "Celeron"; then
        echo "INTEL_LOW_END"
    # Intel Pentium
    elif echo "$cpu_model" | grep -qiE "Pentium"; then
        echo "INTEL_LOW_END"
    # AMD processors
    elif echo "$cpu_model" | grep -qiE "AMD"; then
        # Distinguish AMD classes
        if echo "$cpu_model" | grep -qiE "(Athlon|Ryzen [123] [235678]000|3020e|3050e)"; then
            echo "AMD_LOW"
        elif echo "$cpu_model" | grep -qiE "Ryzen [45679]|Ryzen [567] [2356]000|Ryzen [789] [235679]000X"; then
            echo "AMD_HIGH"
        elif echo "$cpu_model" | grep -qiE "Ryzen"; then
            echo "AMD_MID"
        else
            echo "AMD"
        fi
    # Intel Core i3
    elif echo "$cpu_model" | grep -qiE "Core.*i[3]"; then
        echo "INTEL_CORE_LOW"
    # Intel Core i5
    elif echo "$cpu_model" | grep -qiE "Core.*i[5]"; then
        echo "INTEL_CORE_MID"
    # Intel Core i7
    elif echo "$cpu_model" | grep -qiE "Core.*i[7]"; then
        echo "INTEL_CORE_HIGH"
    # Intel Core i9
    elif echo "$cpu_model" | grep -qiE "Core.*i[9]"; then
        echo "INTEL_CORE_HIGH"
    # Intel Atom (non-N series)
    elif echo "$cpu_model" | grep -qiE "Atom"; then
        echo "INTEL_ATOM"
    # ARM processors
    elif echo "$cpu_model" | grep -qiE "(aarch64|ARM|Apple M|Raspberry Pi)"; then
        echo "ARM64"
    else
        echo "UNKNOWN"
    fi
}

# Map CPU family to hardware profile for AI pipeline
# Usage: get_hardware_profile
get_hardware_profile() {
    local cpu_family
    cpu_family=$(detect_cpu_family)
    
    case $cpu_family in
        INTEL_N_SERIES)
            echo "n100_like"
            ;;
        INTEL_LOW_END|INTEL_ATOM)
            echo "celeron"
            ;;
        INTEL_CORE_LOW)
            echo "core_i3"
            ;;
        INTEL_CORE_MID)
            echo "core_i5"
            ;;
        INTEL_CORE_HIGH)
            echo "core_i7"
            ;;
        AMD_LOW)
            echo "amd_low"
            ;;
        AMD_MID)
            echo "amd_mid"
            ;;
        AMD_HIGH)
            echo "amd_high"
            ;;
        AMD)
            echo "amd_low"
            ;;
        ARM64)
            # Check if Raspberry Pi
            local cpu_model
            cpu_model=$(detect_cpu_model)
            if echo "$cpu_model" | grep -qi "Raspberry Pi"; then
                echo "arm64_rpi5"
            else
                echo "arm64_server"
            fi
            ;;
        *)
            echo "n100_like"  # Default to conservative N100-like profile
            ;;
    esac
}

# =============================================================================
# CPU CAPABILITIES
# =============================================================================

# Check if CPU has QuickSync hardware acceleration
# Usage: has_quicksync
has_quicksync() {
    if command -v lspci &>/dev/null; then
        if lspci 2>/dev/null | grep -qi "vga.*intel"; then
            echo "1"
            return
        fi
    fi
    echo "0"
}

# Check if CPU supports AVX2
# Usage: has_avx2
has_avx2() {
    if grep -q "avx2" /proc/cpuinfo 2>/dev/null; then
        echo "1"
    else
        echo "0"
    fi
}

# Check if CPU supports AVX-512
# Usage: has_avx512
has_avx512() {
    if grep -q "avx512" /proc/cpuinfo 2>/dev/null; then
        echo "1"
    else
        echo "0"
    fi
}

# Get GPU VRAM in GB
# Usage: get_gpu_vram_gb
get_gpu_vram_gb() {
    local vram_gb=0
    
    # NVIDIA
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi &>/dev/null; then
            vram_gb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | awk '{print int($1/1024)}')
            echo "$vram_gb"
            return
        fi
    fi
    
    # AMD ROCm
    if command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null 2>&1; then
            local vram_mb
            vram_mb=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Total Memory" | awk '{print $NF}' | head -1)
            # Convert MB to GB, default to 0 if empty
            if [ -n "$vram_mb" ]; then
                vram_gb=$((vram_mb / 1024))
            fi
            echo "$vram_gb"
            return
        fi
    fi
    
    # Apple Silicon (unified memory)
    if command -v system_profiler &>/dev/null; then
        local chip
        chip=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip" | awk '{print $NF}')
        if [ -n "$chip" ]; then
            local total_mem
            total_mem=$(sysctl -n hw.memsize 2>/dev/null)
            if [ -n "$total_mem" ]; then
                vram_gb=$((total_mem / 1024 / 1024 / 1024))
            fi
            # Apple Silicon uses unified memory, count as available VRAM
            echo "$vram_gb"
            return
        fi
    fi
    
    # Intel integrated GPU (shared memory estimate)
    if lspci 2>/dev/null | grep -qi "vga.*intel"; then
        # Estimate based on total system RAM
        local total_mem
        total_mem=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
        local total_gb=$((total_mem / 1024 / 1024))
        
        # iGPU typically gets 1-2GB from system RAM
        if [ "$total_gb" -ge 16 ]; then
            echo "2"
        elif [ "$total_gb" -ge 8 ]; then
            echo "1"
        else
            echo "1"
        fi
        return
    fi
    
    echo "0"
}

# Get streaming/encoding capability based on hardware
# Returns: quicksync, vaapi, nvenc, amf, videotoolbox, none
# Usage: get_encoder_type
get_encoder_type() {
    # NVIDIA NVENC - check FIRST (highest priority)
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi &>/dev/null; then
            echo "nvenc"
            return
        fi
    fi
    
    # AMD AMF/VCE
    if command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null 2>&1; then
            echo "amf"
            return
        fi
    fi
    
    # Apple Silicon
    if command -v system_profiler &>/dev/null; then
        if system_profiler SPHardwareDataType 2>/dev/null | grep -qi "Apple"; then
            echo "videotoolbox"
            return
        fi
    fi
    
    # Intel QuickSync
    if lspci 2>/dev/null | grep -qi "vga.*intel"; then
        # Check for QuickSync support via VAAPI
        if command -v vainfo &>/dev/null; then
            if vainfo 2>/dev/null | grep -qiE "(h264|hevc|av1|mpeg2)"; then
                # VAAPI is available - check if it's Intel QuickSync
                if vainfo 2>/dev/null | grep -qi "intel"; then
                    echo "quicksync"
                    return
                fi
                # VAAPI available but not Intel - use vaapi
                echo "vaapi"
                return
            fi
        fi
        # No vainfo or no VAAPI - try direct Intel GPU check
        # Intel iGPU from Skylake+ supports QuickSync
        local cpu_model
        cpu_model=$(detect_cpu_model)
        if echo "$cpu_model" | grep -qiE "(Skylake|Kaby Lake|Coffee Lake|Comet Lake|Ice Lake|Alder Lake|Raptor Lake)"; then
            echo "quicksync"
            return
        fi
        # Older or unknown Intel GPU - use generic vaapi
        echo "vaapi"
        return
    fi
    
    echo "none"
}

# Get estimated TDP based on CPU family
# Usage: get_tdp_watts
get_tdp_watts() {
    local cpu_family
    cpu_family=$(detect_cpu_family)
    
    case $cpu_family in
        INTEL_N_SERIES)
            echo "6"  # N100 = 6W TDP
            ;;
        INTEL_LOW_END|INTEL_ATOM)
            echo "15"
            ;;
        INTEL_CORE_LOW)
            echo "28"  # i3 typically 15-28W
            ;;
        INTEL_CORE_MID)
            echo "35"  # i5 typically 28-35W
            ;;
        INTEL_CORE_HIGH)
            echo "65"  # i7/i9 typically 45-65W
            ;;
        AMD_LOW)
            echo "15"
            ;;
        AMD_MID)
            echo "35"  # Ryzen 5 typically 35W
            ;;
        AMD_HIGH)
            echo "65"  # Ryzen 7/9 typically 45-65W
            ;;
        AMD)
            echo "25"
            ;;
        ARM64)
            # ARM devices typically 5-15W
            local cpu_model
            cpu_model=$(detect_cpu_model)
            if echo "$cpu_model" | grep -qi "Raspberry Pi"; then
                echo "5"  # Pi 5 TDP ~5W under load
            else
                echo "15"  # ARM servers ~10-15W
            fi
            ;;
        *)
            echo "15"  # Conservative default
            ;;
    esac
}

# =============================================================================
# POWER MANAGEMENT
# =============================================================================

# Determine if CPU needs C-state fix for stability
# Returns: 0 if needs fix, 1 if not needed
# Usage: needs_cstate_fix
needs_cstate_fix() {
    local cpu_family
    cpu_family=$(detect_cpu_family)
    
    # N-series and older Celeron often need this fix
    case $cpu_family in
        INTEL_N_SERIES)
            return 0
            ;;
        INTEL_LOW_END)
            # Check if it's an older Celeron (might need the fix)
            local cpu_model
            cpu_model=$(detect_cpu_model)
            if echo "$cpu_model" | grep -qiE "(J[34]000|N[3456]000)"; then
                return 0
            fi
            return 1
            ;;
        *)
            return 1
            ;;
    esac
}

# Get recommended C-state configuration
# Usage: get_cstate_flags
get_cstate_flags() {
    if needs_cstate_fix; then
        echo "intel_idle.max_cstate=2 processor.max_cstate=2"
    else
        echo ""
    fi
}

# =============================================================================
# COMPREHENSIVE HARDWARE PROFILE
# =============================================================================

# Get total system RAM in GB
# Usage: get_total_ram_gb
get_total_ram_gb() {
    local total_mem
    
    case "$(uname)" in
        Linux)
            # Linux: read from /proc/meminfo
            total_mem=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
            if [ -n "$total_mem" ]; then
                echo $((total_mem / 1024 / 1024))
            else
                echo "8"
            fi
            ;;
        Darwin)
            # macOS: use sysctl
            local mem_bytes
            mem_bytes=$(sysctl -n hw.memsize 2>/dev/null)
            if [ -n "$mem_bytes" ]; then
                echo $((mem_bytes / 1024 / 1024 / 1024))
            else
                echo "8"
            fi
            ;;
        *)
            # Try wsl.exe for Windows WSL, or default
            if command -v wsl.exe &>/dev/null; then
                total_mem=$(wsl.exe grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
                if [ -n "$total_mem" ]; then
                    echo $((total_mem / 1024 / 1024))
                else
                    echo "8"
                fi
            else
                echo "8"
            fi
            ;;
    esac
}

# Get specific NVIDIA GPU model name
# Usage: get_nvidia_gpu_model
get_nvidia_gpu_model() {
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi &>/dev/null; then
            nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1
            return
        fi
    fi
    echo "none"
}

# Get specific AMD GPU model name (Linux)
# Usage: get_amd_gpu_model
get_amd_gpu_model() {
    if command -v lspci &>/dev/null; then
        local gpu
        gpu=$(lspci 2>/dev/null | grep -i "VGA.*AMD" | head -1)
        if [ -n "$gpu" ]; then
            # Extract useful part of GPU name
            echo "$gpu" | sed 's/.*Radeon //' | sed 's/(Rev.*//' | xargs
            return
        fi
    fi
    echo "none"
}

# Get iGPU VRAM from sysfs (more accurate than estimation)
# Usage: get_igpu_vram_mb
get_igpu_vram_mb() {
    local vram_path
    for card in /sys/class/drm/card*; do
        vram_path="$card/device/mem_info_vram_total"
        if [ -f "$vram_path" ]; then
            local vram
            vram=$(cat "$vram_path" 2>/dev/null)
            if [ -n "$vram" ]; then
                echo $((vram / 1024 / 1024))
                return
            fi
        fi
    done
    # Fallback to estimation
    echo "0"
}

# Get Raspberry Pi model from device tree (more reliable)
# Usage: get_raspberry_pi_model
get_raspberry_pi_model() {
    if [ -f /proc/device-tree/model ]; then
        local model
        model=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
        if echo "$model" | grep -qi "raspberry pi"; then
            echo "$model"
            return
        fi
    fi
    echo "none"
}

# Check if NVIDIA GPU supports AV1 encoding (RTX 40xx+)
# Usage: get_nvenc_av1_support
get_nvenc_av1_support() {
    local gpu_name
    gpu_name=$(get_nvidia_gpu_model)
    if [ "$gpu_name" = "none" ]; then
        echo "0"
        return
    fi
    # RTX 40xx (Ada Lovelace) supports AV1
    if echo "$gpu_name" | grep -qiE "RTX (4060|4070|4080|4090|50)"; then
        echo "1"
    else
        echo "0"
    fi
}

# Improved AMD Ryzen detection with better regex
# Usage: detect_amd_ryzen_full
detect_amd_ryzen_full() {
    local cpu_model
    cpu_model=$(detect_cpu_model)
    
    if echo "$cpu_model" | grep -qiE "Ryzen [0-9]"; then
        # Ryzen 3/5/7/9 with 4-digit model numbers
        if echo "$cpu_model" | grep -qiE "Ryzen (3|5|7|9) [0-9]{4}"; then
            # Check for specific tiers
            if echo "$cpu_model" | grep -qiE "Ryzen [35] [0-9]{4}"; then
                echo "AMD_RYZEN_MID"
                return
            elif echo "$cpu_model" | grep -qiE "Ryzen [79] [0-9]{4}"; then
                echo "AMD_RYZEN_HIGH"
                return
            fi
        fi
        echo "AMD_RYZEN"
        return
    fi
    echo ""
}

# Get improved hardware profile with N305 support
# Usage: get_hardware_profile_v2
get_hardware_profile_v2() {
    local cpu_family cpu_model profile
    cpu_family=$(detect_cpu_family)
    cpu_model=$(detect_cpu_model)
    
    case $cpu_family in
        INTEL_N_SERIES)
            # Distinguish N305 (8-core) from N100/N95/N97/N200 (4-core)
            if echo "$cpu_model" | grep -qiE "N305"; then
                echo "n305"
            else
                echo "n100_like"
            fi
            ;;
        INTEL_LOW_END|INTEL_ATOM)
            echo "celeron"
            ;;
        INTEL_CORE_LOW)
            echo "core_i3"
            ;;
        INTEL_CORE_MID)
            echo "core_i5"
            ;;
        INTEL_CORE_HIGH)
            echo "core_i7"
            ;;
        AMD_LOW)
            echo "amd_low"
            ;;
        AMD_MID)
            echo "amd_mid"
            ;;
        AMD_HIGH)
            echo "amd_high"
            ;;
        AMD)
            echo "amd_low"
            ;;
        ARM64)
            # Check if Raspberry Pi
            local pi_model
            pi_model=$(get_raspberry_pi_model)
            if [ "$pi_model" != "none" ]; then
                echo "arm64_rpi5"
            elif echo "$cpu_model" | grep -qi "RK3588"; then
                echo "arm64_rk3588"
            else
                echo "arm64_server"
            fi
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Print all hardware detection results as key=value pairs
# Usage: print_hardware_profile
print_hardware_profile() {
    local cpu_model cpu_family profile quicksync avx2 avx512 tdp gpu_vram encoder nvidia_model
    
    cpu_model=$(detect_cpu_model)
    cpu_family=$(detect_cpu_family)
    profile=$(get_hardware_profile_v2)
    quicksync=$(has_quicksync)
    avx2=$(has_avx2)
    avx512=$(has_avx512)
    tdp=$(get_tdp_watts)
    gpu_vram=$(get_gpu_vram_gb)
    encoder=$(get_encoder_type)
    nvidia_model=$(get_nvidia_gpu_model)

    printf 'CPU_MODEL=%q\n' "$cpu_model"
    echo "CPU_FAMILY=${cpu_family}"
    echo "HARDWARE_PROFILE=${profile}"
    echo "TOTAL_RAM_GB=$(get_total_ram_gb)"
    echo "HAS_QUICKSYNC=${quicksync}"
    echo "HAS_AVX2=${avx2}"
    echo "HAS_AVX512=${avx512}"
    echo "TDP_WATTS=${tdp}"
    echo "GPU_VRAM_GB=${gpu_vram}"
    echo "NVIDIA_GPU_MODEL=${nvidia_model}"
    echo "ENCODER_TYPE=${encoder}"
    printf 'CSTATE_FLAGS=%q\n' "$(get_cstate_flags)"
}

# Print hardware summary for logging
# Usage: print_hardware_summary
print_hardware_summary() {
    local cpu_model cpu_family profile quicksync avx2 tdp cstate gpu_vram encoder
    
    cpu_model=$(detect_cpu_model)
    cpu_family=$(detect_cpu_family)
    profile=$(get_hardware_profile)
    quicksync=$(has_quicksync)
    avx2=$(has_avx2)
    tdp=$(get_tdp_watts)
    cstate=$(get_cstate_flags)
    gpu_vram=$(get_gpu_vram_gb)
    encoder=$(get_encoder_type)
    
    echo "Hardware Detection Results:"
    echo "  CPU Model: $cpu_model"
    echo "  CPU Family: $cpu_family"
    echo "  Hardware Profile: $profile"
    echo "  QuickSync: $quicksync"
    echo "  AVX2: $avx2"
    echo "  TDP: ${tdp}W"
    echo "  GPU VRAM: ${gpu_vram}GB"
    echo "  Encoder: $encoder"
    if [ -n "$cstate" ]; then
        echo "  C-State Flags: $cstate"
    fi
}

# If script is run directly, print summary
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    print_hardware_summary
fi
