# Hardware & LLM Reference — v4 (Plan)

> **Status:** Draft Plan — Not Implemented
> **Based on:** [`hardware_llm_table_v2.md`](hardware_llm_table_v2.md) + [`hardware_llm_table_v3.md`](hardware_llm_table_v3.md)
> **Goal:** Unified hardware detection + LLM model selection for homelab

---

## Executive Summary

This plan combines the best of both v2 and v3:
- **v2's** detailed hardware specs, detection fixes, and GPU coverage
- **v3's** simplified minimum-spec logic and clear quant keys

The result is a hardware-aware LLM selection system that integrates with:
1. [`scripts/hardware-detect.sh`](../scripts/hardware-detect.sh)
2. [`openclaw/openclaw.json`](../openclaw/openclaw.json)
3. K3s overlays in [`k8s/overlays/`](../k8s/overlays/)

---

## Part 1: Detection Enhancements

### 1.1 New Detection Functions

Add these to [`scripts/hardware-detect.sh`](../scripts/hardware-detect.sh):

| Function | Purpose | Source |
|----------|---------|--------|
| `get_total_ram_gb()` | System RAM detection | NEW |
| `get_nvidia_gpu_model()` | Specific NVIDIA GPU model | NEW |
| `get_amd_gpu_model()` | Specific AMD GPU model | NEW |
| `get_igpu_vram_mb()` | Accurate iGPU VRAM from sysfs | v2 Fix #3 |
| `get_raspberry_pi_model()` | Read `/proc/device-tree/model` | v2 Fix #1 |
| `get_nvenc_av1_support()` | RTX 40xx AV1 encoding | v2 Fix #5 |
| `detect_amd_ryzen_full()` | Improved Ryzen regex | v2 Fix #2 |

### 1.2 Hardware Profile Updates

| Current Profile | New Profile | Rationale |
|----------------|-------------|-----------|
| `n100_like` | Split: `n100` (4-core) / `n305` (8-core) | v2 adds N305 detection |
| `nvidia_rtx` | Specific: `rtx_3060`, `rtx_4090`, etc. | v2 rows 40-54 |
| `amd_gpu` | Specific: `rx_6700_xt`, `rx_7900_xtx`, etc. | v2 rows 55-66 |
| `arm64_rpi5` | Add `arm64_rk3588` | v2 row 39 |

### 1.3 AVX-512 Fix

From v2 Fix #4:

```
# Force AVX-512 = 0 for consumer Intel (Alder Lake/Raptor Lake)
# These CPUs physically fuse AVX-512 off
if [ "$cpu_family" = "INTEL_N_SERIES" ] || [ "$cpu_family" = "INTEL_CORE_LOW" ]; then
    echo "0"  # Not actually available despite flag
fi
```

---

## Part 2: LLM Model Mapping

### 2.1 Three Model Roles

| Role | Use Case | Selection Criteria |
|------|----------|-------------------|
| **Coding** | Code generation, agents | `qwen2.5-coder:*`, `deepseek-coder-v2:*` |
| **Planning** | Architecture, reasoning | `gemma2:*`, `mistral:*`, `llama3.1:*`, `mixtral:*` |
| **Quick** | Fast responses, status checks | `phi3.5:*`, `tinyllama:*` |

### 2.2 CPU Selection Matrix

| Profile | RAM | Coding | Planning | Quick |
|---------|-----|--------|----------|-------|
| n100 | 8GB | `qwen2.5-coder:1.5b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| n100 | 16GB | `qwen2.5-coder:3b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| n305 | 16GB | `qwen2.5-coder:7b-q4` | `llama3.2:3b-q5` | `phi3.5:mini-q4` |
| n305 | 32GB | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| celeron | 8GB | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| core_i3 | 16GB | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| core_i5 | 16GB | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| core_i7 | 32GB | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| core_i9 | 64GB | `deepseek-coder-v2:16b-q8` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| amd_low | 8GB | `qwen2.5-coder:3b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| amd_mid | 16GB | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| amd_high | 32GB | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| arm64_rpi5 | 8GB | `qwen2.5-coder:0.5b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| arm64_rk3588 | 8GB | `qwen2.5-coder:1.5b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |

### 2.3 GPU Selection Matrix

| GPU | VRAM | Coding | Planning | Quick |
|-----|------|--------|----------|-------|
| RTX 3060 8GB | 8GB | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-fp16` |
| RTX 3060 12GB | 12GB | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| RTX 3070 8GB | 8GB | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q5` | `phi3.5:mini-fp16` |
| RTX 3080 10GB | 10GB | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q8` | `phi3.5:mini-fp16` |
| RTX 3090 24GB | 24GB | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| RTX 4060 Ti 16GB | 16GB | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| RTX 4090 24GB | 24GB | `deepseek-coder-v2:33b-q5` | `mixtral:8x7b-q8` | `phi3.5:mini-fp16` |
| RX 6700 XT | 12GB | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| RX 7900 XTX | 24GB | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |

### 2.4 Apple Silicon Matrix

| Chip | RAM | Coding | Planning | Quick |
|------|-----|--------|----------|-------|
| M1 | 8GB | `qwen2.5-coder:7b-q4` | `llama3.1:8b-q4` | `phi3.5:mini-q6` |
| M1 | 16GB | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q8` | `phi3.5:mini-fp16` |
| M2 Pro | 16GB | `qwen2.5-coder:14b-q6` | `mixtral:8x7b-q3` | `phi3.5:mini-fp16` |
| M2 Pro | 32GB | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| M3 Max | 64GB | `deepseek-coder-v2:33b-fp16` | `llama3.1:70b-q5` | `phi3.5:mini-fp16` |

---

## Part 3: Implementation Plan

### Phase 1: Detection Script Updates

1. **Add new functions** to [`scripts/hardware-detect.sh`](../scripts/hardware-detect.sh):
   - `get_total_ram_gb()`
   - `get_nvidia_gpu_model()`
   - `get_amd_gpu_model()`
   - `get_igpu_vram_mb()`
   - `get_raspberry_pi_model()`
   - `get_nvenc_av1_support()`

2. **Fix existing detection bugs**:
   - AVX-512 force to 0 for consumer Intel
   - Raspberry Pi detection via `/proc/device-tree/model`
   - AMD Ryzen regex improvements

3. **Update `get_hardware_profile()`**:
   - Split N-series into N100 vs N305
   - Add NVIDIA/AMD specific GPU profiles

### Phase 2: LLM Mapping Module

Create new file: [`scripts/hardware-llm-map.sh`](../scripts/hardware-llm-map.sh)

```bash
# Core functions:
- get_llm_models_for_cpu()   # Returns model triplet for CPU
- get_llm_models_for_gpu()   # Returns model triplet for GPU  
- get_llm_models_unified()   # Chooses best option (GPU vs CPU)
- generate_openclaw_json()    # Outputs JSON for openclaw.json
```

### Phase 3: Integration

1. **Update [`onboard.sh`](../onboard.sh)**:
   - Call `hardware-llm-map.sh` after hardware detection
   - Generate model list based on detected hardware

2. **Update [`openclaw/openclaw.json`](../openclaw/openclaw.json)**:
   - Make models configurable via environment
   - Add `OLLAMA_MODEL_*` env vars for coding/planning/quick

3. **Update K3s overlays**:
   - Add hardware-aware resource limits
   - Connect overlays to LLM mapping

---

## Part 4: Quantization Reference

From v3, for documentation:

| Quant | Bits/Param | Memory | Quality | Use Case |
|-------|-----------|--------|---------|----------|
| Q4_K_M | ~4.5 | Lowest viable | Good | Budget/CPU |
| Q5_K_M | ~5.5 | Moderate | Better | Standard |
| Q8_0 | ~8 | High | Near-lossless | Quality |
| FP16 | 16 | Maximum | Full | GPU only |

---

## Part 5: Testing Matrix

| Hardware | Expected Coding | Expected Planning | Test Command |
|----------|-----------------|-------------------|--------------|
| N100 8GB | qwen2.5-coder:1.5b-q4 | gemma2:2b-q4 | `./onboard.sh` |
| N305 16GB | qwen2.5-coder:7b-q4 | llama3.2:3b-q5 | `./onboard.sh` |
| RTX 3060 12GB | qwen2.5-coder:14b-q5 | llama3.1:8b-fp16 | `./onboard.sh` |
| RTX 4090 24GB | deepseek-coder-v2:33b-q4 | mixtral:8x7b-q5 | `./onboard.sh` |
| Ryzen 7 5800X | deepseek-coder-v2:16b-q4 | llama3.1:8b-q6 | `./onboard.sh` |

---

## Files to Modify

| File | Action |
|------|--------|
| [`scripts/hardware-detect.sh`](../scripts/hardware-detect.sh) | Add detection functions |
| [`scripts/hardware-llm-map.sh`](../scripts/hardware-llm-map.sh) | **CREATE** - LLM mapping module |
| [`onboard.sh`](../onboard.sh) | Call LLM mapping |
| [`openclaw/openclaw.json`](../openclaw/openclaw.json) | Make models env-driven |
| [`k8s/overlays/*/kustomization.yaml`](../k8s/overlays/) | Add hardware awareness |

---

## Success Criteria

- [ ] All detection functions work on N100, N305, RTX 3060, RTX 4090, Ryzen 5800X
- [ ] Model selection matches CPU/GPU matrix tables
- [ ] openclaw.json receives correct model names
- [ ] K3s overlays respect hardware profile
- [ ] Documentation updated in README.md
