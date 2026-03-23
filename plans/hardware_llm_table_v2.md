# Hardware & Best Open-Source LLM Reference — v2

> Models recommended per use case: **Coding** · **Planning** · **Quick Tasks**
> All models run via [llama.cpp](https://github.com/ggerganov/llama.cpp) / [Ollama](https://ollama.com) unless noted.
>
> **Quant key:**
> `Q4_K_M` = good quality/speed balance · `Q5_K_M` = higher quality · `Q8_0` = near-lossless · `FP16` = full precision
>
> **Col key:**
> P = Performance cores · E = Efficiency cores · T = Threads · L3 = L3 Cache · TDP = Thermal Design Power
> `tok/s` = approximate CPU-only tokens/second at recommended quant (single user, llama.cpp)

---

## Section 1 — Intel N-Series (Alder Lake-N / Gracemont)

| # | CPU | Family | Cores (P+E) | Threads | L3 Cache | Base / Boost | TDP | Mem Support | Max RAM | iGPU (EU) | AVX2 | AVX-512 | Encoder | Est. VRAM | Approx tok/s | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|--------|-------------|---------|----------|-------------|-----|-------------|---------|-----------|------|---------|---------|-----------|-------------|-------------|---------------|------------------|
| 1 | Intel N100 | `INTEL_N_SERIES` | 4P+0E | 4T | 6 MB | 0.8 / 3.4 GHz | 6W | DDR4/DDR5 | 16 GB | UHD (24 EU) | ✅ | ❌ | `quicksync` | 1–2 GB | ~8–12 | `qwen2.5-coder:1.5b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| 2 | Intel N95 | `INTEL_N_SERIES` | 4P+0E | 4T | 6 MB | 1.7 / 3.4 GHz | 15W | DDR4/DDR5 | 16 GB | UHD (16 EU) | ✅ | ❌ | `quicksync` | 1–2 GB | ~10–14 | `qwen2.5-coder:1.5b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| 3 | Intel N97 | `INTEL_N_SERIES` | 4P+0E | 4T | 6 MB | 1.8 / 3.6 GHz | 12W | DDR4/DDR5 | 16 GB | UHD (24 EU) | ✅ | ❌ | `quicksync` | 1–2 GB | ~11–15 | `qwen2.5-coder:3b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| 4 | Intel N200 | `INTEL_N_SERIES` | 4P+0E | 4T | 6 MB | 1.0 / 3.7 GHz | 6W | DDR4/DDR5 | 16 GB | UHD (32 EU) | ✅ | ❌ | `quicksync` | 1–2 GB | ~12–16 | `qwen2.5-coder:3b-q4` | `gemma2:2b-q4` | `phi3.5:mini-q4` |
| 5 | Intel N305 | `INTEL_N_SERIES` | 8P+0E | 8T | 6 MB | 1.8 / 3.8 GHz | 15W | DDR5 | 32 GB | UHD (32 EU) | ✅ | ❌ | `quicksync` | 2 GB | ~16–22 | `qwen2.5-coder:7b-q4` | `llama3.2:3b-q5` | `phi3.5:mini-q4` |

---

## Section 2 — Intel Celeron / Pentium Silver (Low-End)

| # | CPU | Family | Cores | Threads | L3 Cache | Base / Boost | TDP | Mem Support | Max RAM | iGPU | AVX2 | AVX-512 | Encoder | Est. VRAM | Approx tok/s | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|--------|-------|---------|----------|-------------|-----|-------------|---------|------|------|---------|---------|-----------|-------------|-------------|---------------|------------------|
| 6 | Celeron J4125 | `INTEL_LOW_END` | 4C | 4T | 4 MB | 2.0 / 2.7 GHz | 10W | DDR4 | 8 GB | UHD 600 | ❌ | ❌ | `vaapi` | 1 GB | ~4–6 | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| 7 | Celeron N5105 | `INTEL_LOW_END` | 4C | 4T | 4 MB | 2.0 / 2.9 GHz | 10W | DDR4 | 16 GB | UHD (24 EU) | ❌ | ❌ | `vaapi` | 1 GB | ~5–7 | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| 8 | Celeron N5100 | `INTEL_LOW_END` | 4C | 4T | 4 MB | 1.1 / 2.8 GHz | 6W | DDR4 | 8 GB | UHD (24 EU) | ❌ | ❌ | `vaapi` | 1 GB | ~4–6 | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| 9 | Pentium Silver N6005 | `INTEL_LOW_END` | 4C | 4T | 4 MB | 2.0 / 3.3 GHz | 10W | DDR4 | 16 GB | UHD (32 EU) | ❌ | ❌ | `vaapi` | 1 GB | ~6–8 | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` | `phi3.5:mini-q4` |
| 10 | Pentium Gold G7400 | `INTEL_LOW_END` | 2P+0E | 4T | 6 MB | 3.7 GHz | 46W | DDR5 | 64 GB | UHD 710 | ✅ | ❌ | `quicksync` | 2 GB | ~10–14 | `qwen2.5-coder:3b-q4` | `gemma2:2b-q5` | `phi3.5:mini-q4` |

---

## Section 3 — Intel Core (Alder Lake / Raptor Lake — Desktop)

| # | CPU | Family | Cores (P+E) | Threads | L3 Cache | Base / Boost | TDP (PL1/PL2) | Mem Support | Max RAM | iGPU | AVX2 | AVX-512 | Encoder | Est. VRAM | Approx tok/s | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|--------|-------------|---------|----------|-------------|--------------|-------------|---------|------|------|---------|---------|-----------|-------------|-------------|---------------|------------------|
| 11 | Core i3-12100 | `INTEL_CORE_LOW` | 4P+0E | 8T | 12 MB | 3.3 / 4.3 GHz | 60W / 89W | DDR4/DDR5 | 128 GB | UHD 730 | ✅ | ❌ | `quicksync` | 2 GB | ~18–25 | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| 12 | Core i3-13100 | `INTEL_CORE_LOW` | 4P+0E | 8T | 12 MB | 3.4 / 4.5 GHz | 60W / 89W | DDR4/DDR5 | 128 GB | UHD 730 | ✅ | ❌ | `quicksync` | 2 GB | ~20–27 | `qwen2.5-coder:7b-q4` | `mistral:7b-q5` | `phi3.5:mini-q4` |
| 13 | Core i5-12400 | `INTEL_CORE_MID` | 6P+0E | 12T | 18 MB | 2.5 / 4.4 GHz | 65W / 117W | DDR4/DDR5 | 128 GB | UHD 730 | ✅ | ❌ | `quicksync` | 2 GB | ~25–35 | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| 14 | Core i5-12600K | `INTEL_CORE_MID` | 6P+4E | 16T | 20 MB | 3.7 / 4.9 GHz | 125W / 150W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~30–40 | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| 15 | Core i5-13400 | `INTEL_CORE_MID` | 6P+4E | 16T | 20 MB | 2.5 / 4.6 GHz | 65W / 154W | DDR4/DDR5 | 128 GB | UHD 730 | ✅ | ❌ | `quicksync` | 2 GB | ~28–38 | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| 16 | Core i5-13500 | `INTEL_CORE_MID` | 6P+8E | 20T | 24 MB | 2.5 / 4.8 GHz | 65W / 154W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~32–42 | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| 17 | Core i5-13600K | `INTEL_CORE_MID` | 6P+8E | 20T | 24 MB | 3.5 / 5.1 GHz | 125W / 181W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~36–48 | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| 18 | Core i7-12700 | `INTEL_CORE_HIGH` | 8P+4E | 20T | 25 MB | 2.1 / 4.9 GHz | 65W / 180W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~38–50 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| 19 | Core i7-12700K | `INTEL_CORE_HIGH` | 8P+4E | 20T | 25 MB | 3.6 / 5.0 GHz | 125W / 190W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~42–55 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| 20 | Core i7-13700 | `INTEL_CORE_HIGH` | 8P+8E | 24T | 30 MB | 2.1 / 5.2 GHz | 65W / 219W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~45–58 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q6` | `phi3.5:mini-q6` |
| 21 | Core i7-13700K | `INTEL_CORE_HIGH` | 8P+8E | 24T | 30 MB | 3.4 / 5.4 GHz | 125W / 253W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~48–62 | `deepseek-coder-v2:16b-q5` | `llama3.1:8b-q8` | `phi3.5:mini-q8` |
| 22 | Core i9-12900K | `INTEL_CORE_HIGH` | 8P+8E | 24T | 30 MB | 3.2 / 5.2 GHz | 125W / 241W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~50–65 | `deepseek-coder-v2:16b-q5` | `llama3.1:8b-q8` | `phi3.5:mini-q8` |
| 23 | Core i9-13900K | `INTEL_CORE_HIGH` | 8P+16E | 32T | 36 MB | 3.0 / 5.8 GHz | 125W / 253W | DDR4/DDR5 | 128 GB | UHD 770 | ✅ | ❌ | `quicksync` | 2 GB | ~55–70 | `deepseek-coder-v2:16b-q8` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |

---

## Section 4 — AMD Ryzen (Desktop)

| # | CPU | Family | Cores | Threads | L3 Cache | Base / Boost | TDP | Mem Support | Max RAM | iGPU | AVX2 | AVX-512 | Encoder | Approx tok/s | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|--------|-------|---------|----------|-------------|-----|-------------|---------|------|------|---------|---------|-------------|-------------|---------------|------------------|
| 24 | Ryzen 5 3600 | `AMD_MID` | 6C | 12T | 32 MB | 3.6 / 4.2 GHz | 65W | DDR4 | 128 GB | None | ✅ | ❌ | `none` | ~22–30 | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| 25 | Ryzen 5 5600 | `AMD_MID` | 6C | 12T | 32 MB | 3.5 / 4.4 GHz | 65W | DDR4 | 128 GB | None | ✅ | ❌ | `none` | ~28–36 | `qwen2.5-coder:7b-q4` | `mistral:7b-q5` | `phi3.5:mini-q5` |
| 26 | Ryzen 5 5600G | `AMD_MID` | 6C | 12T | 16 MB | 3.9 / 4.4 GHz | 65W | DDR4 | 64 GB | Vega 7 (7 CU) | ✅ | ❌ | `amf` | ~26–34 | `qwen2.5-coder:7b-q4` | `mistral:7b-q4` | `phi3.5:mini-q4` |
| 27 | Ryzen 5 7600 | `AMD_HIGH` | 6C | 12T | 32 MB | 3.8 / 5.1 GHz | 65W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~35–45 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| 28 | Ryzen 5 7600X | `AMD_HIGH` | 6C | 12T | 32 MB | 4.7 / 5.3 GHz | 105W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~38–48 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q5` | `phi3.5:mini-q5` |
| 29 | Ryzen 7 5700G | `AMD_HIGH` | 8C | 16T | 16 MB | 3.8 / 4.6 GHz | 65W | DDR4 | 64 GB | Vega 8 (8 CU) | ✅ | ❌ | `amf` | ~32–42 | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-q5` |
| 30 | Ryzen 7 5800X | `AMD_HIGH` | 8C | 16T | 32 MB | 3.8 / 4.7 GHz | 105W | DDR4 | 128 GB | None | ✅ | ❌ | `none` | ~38–50 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q6` | `phi3.5:mini-q6` |
| 31 | Ryzen 7 7700 | `AMD_HIGH` | 8C | 16T | 32 MB | 3.8 / 5.3 GHz | 65W | DDR5 | 128 GB | Radeon 760M (12 CU) | ✅ | ❌ | `amf` | ~40–52 | `deepseek-coder-v2:16b-q4` | `llama3.1:8b-q6` | `phi3.5:mini-q6` |
| 32 | Ryzen 7 7700X | `AMD_HIGH` | 8C | 16T | 32 MB | 4.5 / 5.4 GHz | 105W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~42–55 | `deepseek-coder-v2:16b-q5` | `llama3.1:8b-q8` | `phi3.5:mini-q8` |
| 33 | Ryzen 9 5900X | `AMD_HIGH` | 12C | 24T | 64 MB | 3.7 / 4.8 GHz | 105W | DDR4 | 128 GB | None | ✅ | ❌ | `none` | ~48–62 | `deepseek-coder-v2:16b-q5` | `llama3.1:8b-q8` | `phi3.5:mini-q8` |
| 34 | Ryzen 9 7900X | `AMD_HIGH` | 12C | 24T | 64 MB | 4.7 / 5.6 GHz | 170W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~55–70 | `deepseek-coder-v2:16b-q8` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| 35 | Ryzen 9 7950X | `AMD_HIGH` | 16C | 32T | 64 MB | 4.5 / 5.7 GHz | 170W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~65–82 | `deepseek-coder-v2:16b-q8` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 36 | Ryzen 9 7950X3D | `AMD_HIGH` | 16C | 32T | 128 MB | 4.2 / 5.7 GHz | 120W | DDR5 | 128 GB | None | ✅ | ❌ | `none` | ~70–90 | `deepseek-coder-v2:16b-q8` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |

> **Note on 7950X3D:** The 3D V-Cache (128 MB L3) dramatically boosts llama.cpp token throughput due to reduced cache misses. Best consumer CPU for CPU-only inference by a significant margin.

---

## Section 5 — ARM / Embedded

| # | CPU | Family | Cores | Threads | L3 Cache | Base / Boost | TDP | Max RAM | iGPU | AVX2 | Encoder | Approx tok/s | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|--------|-------|---------|----------|-------------|-----|---------|------|------|---------|-------------|-------------|---------------|------------------|
| 37 | Raspberry Pi 4B (BCM2711) | `ARM64` | 4C Cortex-A72 | 4T | — | 1.5 / 1.8 GHz | 5W | 8 GB | VideoCore VI | ❌ | `none` | ~1–2 | `qwen2.5-coder:0.5b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| 38 | Raspberry Pi 5 (BCM2712) | `ARM64` | 4C Cortex-A76 | 4T | — | 2.4 / 3.0 GHz | 5W | 8 GB | VideoCore VII | ❌ | `none` | ~3–5 | `qwen2.5-coder:0.5b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |
| 39 | Rockchip RK3588 (Orange Pi 5) | `ARM64` | 4×A76 + 4×A55 | 8T | — | 2.4 / 1.8 GHz | 10W | 32 GB | Mali-G610 (4 CU) | ❌ | `none` | ~4–7 | `qwen2.5-coder:1.5b-q4` | `tinyllama:1.1b-q4` | `tinyllama:1.1b-q4` |

> **Pi detection note:** `/proc/cpuinfo` on Pi 4/5 reports `Cortex-A72` / `Cortex-A76`, NOT "Raspberry Pi". Use `/proc/device-tree/model` for reliable Pi identification.

---

## Section 6 — NVIDIA GPUs (NVENC / CUDA)

| # | GPU | Arch | CUDA Cores | VRAM | Mem Bandwidth | TDP | Encoder | AV1 Enc | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|------|------------|------|--------------|-----|---------|---------|-------------|---------------|------------------|
| 40 | RTX 3060 12 GB | Ampere | 3584 | 12 GB GDDR6 | 360 GB/s | 170W | `nvenc` | ❌ | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 41 | RTX 3060 Ti 8 GB | Ampere | 4864 | 8 GB GDDR6 | 448 GB/s | 200W | `nvenc` | ❌ | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q5` | `phi3.5:mini-fp16` |
| 42 | RTX 3070 8 GB | Ampere | 5888 | 8 GB GDDR6 | 448 GB/s | 220W | `nvenc` | ❌ | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q5` | `phi3.5:mini-fp16` |
| 43 | RTX 3070 Ti 8 GB | Ampere | 6144 | 8 GB GDDR6X | 608 GB/s | 290W | `nvenc` | ❌ | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q6` | `phi3.5:mini-fp16` |
| 44 | RTX 3080 10 GB | Ampere | 8704 | 10 GB GDDR6X | 760 GB/s | 320W | `nvenc` | ❌ | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q8` | `phi3.5:mini-fp16` |
| 45 | RTX 3080 12 GB | Ampere | 8960 | 12 GB GDDR6X | 912 GB/s | 350W | `nvenc` | ❌ | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 46 | RTX 3090 24 GB | Ampere | 10496 | 24 GB GDDR6X | 936 GB/s | 350W | `nvenc` | ❌ | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 47 | RTX 3090 Ti 24 GB | Ampere | 10752 | 24 GB GDDR6X | 1008 GB/s | 450W | `nvenc` | ❌ | `deepseek-coder-v2:33b-q5` | `mixtral:8x7b-q6` | `phi3.5:mini-fp16` |
| 48 | RTX 4060 8 GB | Ada | 3072 | 8 GB GDDR6 | 272 GB/s | 115W | `nvenc` | ✅ | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q4` | `phi3.5:mini-fp16` |
| 49 | RTX 4060 Ti 16 GB | Ada | 4352 | 16 GB GDDR6 | 288 GB/s | 165W | `nvenc` | ✅ | `qwen2.5-coder:32b-q4` | `llama3.1:70b-q2` | `phi3.5:mini-fp16` |
| 50 | RTX 4070 12 GB | Ada | 5888 | 12 GB GDDR6X | 504 GB/s | 200W | `nvenc` | ✅ | `qwen2.5-coder:14b-fp16` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 51 | RTX 4070 Ti 12 GB | Ada | 7680 | 12 GB GDDR6X | 504 GB/s | 285W | `nvenc` | ✅ | `qwen2.5-coder:14b-fp16` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 52 | RTX 4070 Ti Super 16 GB | Ada | 8448 | 16 GB GDDR6X | 672 GB/s | 285W | `nvenc` | ✅ | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| 53 | RTX 4080 16 GB | Ada | 9728 | 16 GB GDDR6X | 736 GB/s | 320W | `nvenc` | ✅ | `qwen2.5-coder:32b-q5` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 54 | RTX 4090 24 GB | Ada | 16384 | 24 GB GDDR6X | 1008 GB/s | 450W | `nvenc` | ✅ | `deepseek-coder-v2:33b-q5` | `mixtral:8x7b-q8` | `phi3.5:mini-fp16` |

> **NVENC note:** Ada Lovelace (RTX 40xx) adds AV1 hardware encode. Ampere (RTX 30xx) supports AV1 decode only.
> **Bandwidth matters:** Memory bandwidth (`GB/s`) is the primary determinant of LLM token generation speed on GPU, more so than CUDA core count.

---

## Section 7 — AMD GPUs (AMF / ROCm)

| # | GPU | Arch | CUs | VRAM | Mem Bandwidth | TDP | Encoder | AV1 Enc | ROCm Support | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|-----|------|-----|------|--------------|-----|---------|---------|-------------|-------------|---------------|------------------|
| 55 | RX 6600 8 GB | RDNA 2 | 28 CU | 8 GB GDDR6 | 224 GB/s | 132W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q4` | `phi3.5:mini-fp16` |
| 56 | RX 6600 XT 8 GB | RDNA 2 | 32 CU | 8 GB GDDR6 | 256 GB/s | 160W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q5` | `phi3.5:mini-fp16` |
| 57 | RX 6700 XT 12 GB | RDNA 2 | 40 CU | 12 GB GDDR6 | 384 GB/s | 230W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 58 | RX 6800 16 GB | RDNA 2 | 60 CU | 16 GB GDDR6 | 512 GB/s | 250W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| 59 | RX 6800 XT 16 GB | RDNA 2 | 72 CU | 16 GB GDDR6 | 512 GB/s | 300W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| 60 | RX 6900 XT 16 GB | RDNA 2 | 80 CU | 16 GB GDDR6 | 512 GB/s | 300W | `amf` | ❌ | ROCm 5.x | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 61 | RX 7600 8 GB | RDNA 3 | 32 CU | 8 GB GDDR6 | 288 GB/s | 165W | `amf` | ✅ | ROCm 6.x | `qwen2.5-coder:7b-fp16` | `llama3.1:8b-q5` | `phi3.5:mini-fp16` |
| 62 | RX 7700 XT 12 GB | RDNA 3 | 54 CU | 12 GB GDDR6 | 432 GB/s | 245W | `amf` | ✅ | ROCm 6.x | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 63 | RX 7800 XT 16 GB | RDNA 3 | 60 CU | 16 GB GDDR6 | 624 GB/s | 263W | `amf` | ✅ | ROCm 6.x | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q4` | `phi3.5:mini-fp16` |
| 64 | RX 7900 GRE 16 GB | RDNA 3 | 80 CU | 16 GB GDDR6 | 576 GB/s | 260W | `amf` | ✅ | ROCm 6.x | `qwen2.5-coder:32b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 65 | RX 7900 XT 20 GB | RDNA 3 | 84 CU | 20 GB GDDR6 | 800 GB/s | 315W | `amf` | ✅ | ROCm 6.x | `qwen2.5-coder:32b-q5` | `mixtral:8x7b-q6` | `phi3.5:mini-fp16` |
| 66 | RX 7900 XTX 24 GB | RDNA 3 | 96 CU | 24 GB GDDR6 | 960 GB/s | 355W | `amf` | ✅ | ROCm 6.x | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |

> **ROCm note:** RDNA 2 (RX 6000) uses ROCm 5.x; RDNA 3 (RX 7000) requires ROCm 6.x for stable llama.cpp support. Always verify `HSA_OVERRIDE_GFX_VERSION` workarounds for your specific card on Linux.

---

## Section 8 — Apple Silicon (Unified Memory)

| # | Chip | Cores (CPU) | GPU Cores | Neural Engine | Unified RAM | Mem Bandwidth | Encoder | Best: Coding | Best: Planning | Best: Quick Tasks |
|---|------|-------------|-----------|--------------|-------------|--------------|---------|-------------|---------------|------------------|
| 67 | M1 (8 GB) | 4P + 4E | 7–8 CU | 16-core | 8 GB | 68.25 GB/s | `videotoolbox` | `qwen2.5-coder:7b-q4` | `llama3.1:8b-q4` | `phi3.5:mini-q6` |
| 68 | M1 (16 GB) | 4P + 4E | 7–8 CU | 16-core | 16 GB | 68.25 GB/s | `videotoolbox` | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q8` | `phi3.5:mini-fp16` |
| 69 | M1 Pro (16 GB) | 8P + 2E | 14–16 CU | 16-core | 16 GB | 200 GB/s | `videotoolbox` | `qwen2.5-coder:14b-q5` | `llama3.1:8b-fp16` | `phi3.5:mini-fp16` |
| 70 | M1 Max (32 GB) | 8P + 2E | 24–32 CU | 16-core | 32–64 GB | 400 GB/s | `videotoolbox` | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 71 | M2 (8 GB) | 4P + 4E | 8–10 CU | 16-core | 8 GB | 100 GB/s | `videotoolbox` | `qwen2.5-coder:7b-q5` | `llama3.1:8b-q4` | `phi3.5:mini-fp16` |
| 72 | M2 (16 GB) | 4P + 4E | 8–10 CU | 16-core | 16 GB | 100 GB/s | `videotoolbox` | `qwen2.5-coder:14b-q4` | `llama3.1:8b-q8` | `phi3.5:mini-fp16` |
| 73 | M2 Pro (16 GB) | 8P + 4E | 16–19 CU | 16-core | 16–32 GB | 200 GB/s | `videotoolbox` | `qwen2.5-coder:14b-q6` | `mixtral:8x7b-q3` | `phi3.5:mini-fp16` |
| 74 | M2 Pro (32 GB) | 8P + 4E | 16–19 CU | 16-core | 32 GB | 200 GB/s | `videotoolbox` | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 75 | M2 Max (64 GB) | 8P + 4E | 30–38 CU | 16-core | 64–96 GB | 400 GB/s | `videotoolbox` | `deepseek-coder-v2:33b-q8` | `llama3.1:70b-q4` | `phi3.5:mini-fp16` |
| 76 | M3 Pro (36 GB) | 6P + 6E | 18 CU | 18-core | 36 GB | 150 GB/s | `videotoolbox` | `deepseek-coder-v2:33b-q4` | `mixtral:8x7b-q5` | `phi3.5:mini-fp16` |
| 77 | M3 Max (128 GB) | 14P + 4E | 40 CU | 18-core | 64–128 GB | 400 GB/s | `videotoolbox` | `deepseek-coder-v2:33b-fp16` | `llama3.1:70b-q5` | `phi3.5:mini-fp16` |

> **Apple Silicon note:** Unified memory means 100% of RAM is available as GPU VRAM — a 96 GB M2 Max can run 70B models at Q4 comfortably. Detection via `system_profiler` on macOS; not applicable to Linux homelab scripts unless running Asahi Linux.

---

## Model Quick Reference

| Model | Use Case | Params | Min RAM/VRAM | Quantisation | Notes |
|-------|----------|--------|-------------|-------------|-------|
| `tinyllama:1.1b-q4` | All (fallback) | 1.1B | ~0.8 GB | Q4_K_M | Only viable for no-AVX2 / Pi hardware |
| `qwen2.5-coder:0.5b-q4` | Coding | 0.5B | ~0.6 GB | Q4_K_M | Smallest usable coder; Pi 4/5 only |
| `qwen2.5-coder:1.5b-q4` | Coding | 1.5B | ~1.2 GB | Q4_K_M | Best tiny coder for N-series |
| `qwen2.5-coder:3b-q4` | Coding | 3B | ~2.2 GB | Q4_K_M | Good step-up with AVX2 |
| `qwen2.5-coder:7b-q4` | Coding | 7B | ~4.8 GB | Q4_K_M | Go-to mid-range coder |
| `qwen2.5-coder:7b-fp16` | Coding | 7B | ~14 GB | FP16 | Best quality 7B; needs 16 GB VRAM |
| `qwen2.5-coder:14b-q4` | Coding | 14B | ~9 GB | Q4_K_M | Near-SOTA; needs dGPU |
| `qwen2.5-coder:14b-fp16` | Coding | 14B | ~28 GB | FP16 | Needs 3090 / 4090 / large Apple Silicon |
| `qwen2.5-coder:32b-q4` | Coding | 32B | ~20 GB | Q4_K_M | Best OSS coder; 4060 Ti 16 GB or better |
| `deepseek-coder-v2:16b-q4` | Coding | 16B (MoE) | ~10 GB | Q4_K_M | MoE — excellent code reasoning at low VRAM |
| `deepseek-coder-v2:33b-q4` | Coding | 33B | ~20 GB | Q4_K_M | Best OSS large coder; 24 GB GPU |
| `deepseek-coder-v2:33b-q8` | Coding | 33B | ~35 GB | Q8_0 | Near-perfect quality; M2 Max+ only |
| `gemma2:2b-q4` | Planning / Quick | 2B | ~1.6 GB | Q4_K_M | Google 2B; excellent quality for size |
| `gemma2:9b-q4` | Planning | 9B | ~6 GB | Q4_K_M | Strong planner; outperforms Mistral 7B |
| `phi3.5:mini-q4` | Quick Tasks | 3.8B | ~2.6 GB | Q4_K_M | Microsoft; best small instruction model |
| `phi3.5:mini-fp16` | Quick Tasks | 3.8B | ~7.6 GB | FP16 | Use on GPU for maximum responsiveness |
| `mistral:7b-q4` | Planning | 7B | ~4.8 GB | Q4_K_M | Fast, reliable general reasoning |
| `mistral:7b-q8` | Planning | 7B | ~7.7 GB | Q8_0 | Near-lossless; best quality 7B planner |
| `llama3.1:8b-q4` | Planning | 8B | ~5.5 GB | Q4_K_M | Meta; excellent instruction following |
| `llama3.1:8b-fp16` | Planning | 8B | ~16 GB | FP16 | Full quality; 3060 12 GB or better |
| `llama3.1:70b-q2` | Planning | 70B | ~19 GB | Q2_K | Degraded quality but fits 24 GB GPU |
| `llama3.1:70b-q4` | Planning | 70B | ~40 GB | Q4_K_M | Multi-GPU or Apple Silicon 48 GB+ |
| `mixtral:8x7b-q4` | Planning | 46B (MoE) | ~26 GB | Q4_K_M | MoE; runs like 12B. Best planner ≤30 GB VRAM |
| `mixtral:8x7b-q8` | Planning | 46B (MoE) | ~48 GB | Q8_0 | Near-perfect; M2 Max 64 GB or dual GPU |

---

## Detection Script Fixes (Summary)

| # | Issue | Current Behaviour | Fix |
|---|-------|-------------------|-----|
| 1 | Raspberry Pi ID | Reads `/proc/cpuinfo` model name (shows CPU codename, not Pi model) | Read `/proc/device-tree/model` |
| 2 | AMD Ryzen regex | Character-class `[235679]000X` misses many real SKUs | Use explicit alternation: `Ryzen (5\|7\|9) [0-9]{4}` |
| 3 | iGPU VRAM estimate | Guesses from total RAM (inaccurate) | Query `/sys/class/drm/*/device/mem_info_vram_total` |
| 4 | AVX-512 on consumer Intel | May report `1` if flag leaks through kernel | Alder Lake/Raptor Lake desktop always fuses AVX-512 off — force `0` for `INTEL_N_SERIES` and consumer `INTEL_CORE_*` |
| 5 | NVENC AV1 distinction | Reports `nvenc` without flagging AV1 capability | Detect Ada Lovelace vs Ampere via `nvidia-smi --query-gpu=name` and set `NVENC_AV1=1` for RTX 40xx |
| 6 | N305 missing | N305 has 8 cores (unlike N100/N95/N97/N200 at 4) — grouped incorrectly | Add explicit N305 detection with 8-core profile |
| 7 | Ryzen 7700 iGPU | Ryzen 7000 non-X desktop SKUs have an iGPU (Radeon 760M); script reports none | Detect `Ryzen [579] 7[0-9]{3}[^X]` → flag iGPU present |
| 8 | ARM unified vs split | ARM64 detection doesn't distinguish between Pi (VideoCore) and RK3588 (Mali) | Add Rockchip/RK3588 path in `get_hardware_profile` |
