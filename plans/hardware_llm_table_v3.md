# Hardware & Best Open-Source LLM Reference (v3)

> Recommendations are **anchored to minimum viable specs** — each model fits entirely in available RAM/VRAM with no swapping, and produces an acceptable token rate (≥3 t/s for CPU, ≥10 t/s for GPU) on that hardware.
> All models run via [Ollama](https://ollama.com) / [llama.cpp](https://github.com/ggerganov/llama.cpp).

**Quant key:**
- `Q4_K_M` ~4.5 bits/param — good quality, lowest viable memory
- `Q5_K_M` ~5.5 bits/param — better quality, moderate memory
- `Q8_0` ~8 bits/param — near-lossless, highest memory of quantised
- `FP16` — full precision, GPU only

**Minimum RAM rule used here:**
- Model file size + ~1.5 GB OS overhead + ~512 MB context buffer must fit within available RAM/VRAM
- For CPU-only: system RAM minus ~2 GB OS reservation is usable
- For GPU: VRAM only (no unified memory counted unless Apple Silicon)

---

## CPUs — Integrated / No Discrete GPU

> Assumes 8 GB system RAM unless noted. Adjust model size up if you have 16 GB+.

| # | Hardware | Sys RAM Assumed | AVX2 | Avail. RAM for Model | Coding (min spec) | Planning (min spec) | Quick Tasks (min spec) | Min RAM to run all three |
|---|----------|----------------|------|----------------------|-------------------|--------------------|-----------------------|--------------------------|
| 1 | Intel N100 | 8 GB | ✅ | ~5.5 GB | `qwen2.5-coder:1.5b-q4` (~1.1 GB) | `gemma2:2b-q4` (~1.6 GB) | `phi3.5:mini-q4` (~2.2 GB) | 4 GB |
| 2 | Intel N95 | 8 GB | ✅ | ~5.5 GB | `qwen2.5-coder:1.5b-q4` (~1.1 GB) | `gemma2:2b-q4` (~1.6 GB) | `phi3.5:mini-q4` (~2.2 GB) | 4 GB |
| 3 | Intel N97 | 8 GB | ✅ | ~5.5 GB | `qwen2.5-coder:3b-q4` (~2.0 GB) | `gemma2:2b-q4` (~1.6 GB) | `phi3.5:mini-q4` (~2.2 GB) | 4 GB |
| 4 | Intel N200 | 8 GB | ✅ | ~5.5 GB | `qwen2.5-coder:3b-q4` (~2.0 GB) | `gemma2:2b-q4` (~1.6 GB) | `phi3.5:mini-q4` (~2.2 GB) | 4 GB |
| 5 | Celeron J4125 | 8 GB | ❌ | ~5.5 GB | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) | 4 GB |
| 6 | Celeron N5105 | 8 GB | ❌ | ~5.5 GB | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) | 4 GB |
| 7 | Pentium Silver N6005 | 8 GB | ❌ | ~5.5 GB | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) | 4 GB |
| 8 | Core i3-12100 | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q4` (~4.8 GB) | `mistral:7b-q4` (~4.4 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 9 | Core i5-12400 | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q4` (~4.8 GB) | `mistral:7b-q4` (~4.4 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 10 | Core i5-13500 | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q5` (~5.6 GB) | `llama3.1:8b-q4` (~5.0 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 11 | Core i7-12700 | 32 GB | ✅ | ~29 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) | `llama3.1:8b-q5` (~6.2 GB) | `phi3.5:mini-q5` (~2.8 GB) | 16 GB |
| 12 | Core i7-13700K | 32 GB | ✅ | ~29 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) | `llama3.1:8b-q5` (~6.2 GB) | `phi3.5:mini-q5` (~2.8 GB) | 16 GB |
| 13 | Core i9-13900K | 64 GB | ✅ | ~61 GB | `qwen2.5-coder:32b-q4` (~20 GB) | `mixtral:8x7b-q4` (~26 GB) | `phi3.5:mini-q8` (~4.1 GB) | 32 GB |
| 14 | Ryzen 5 3600 | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q4` (~4.8 GB) | `mistral:7b-q4` (~4.4 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 15 | Ryzen 5 5600G | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q4` (~4.8 GB) | `mistral:7b-q4` (~4.4 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 16 | Ryzen 5 7600X | 32 GB | ✅ | ~29 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) | `llama3.1:8b-q5` (~6.2 GB) | `phi3.5:mini-q5` (~2.8 GB) | 16 GB |
| 17 | Ryzen 7 5700G | 16 GB | ✅ | ~13 GB | `qwen2.5-coder:7b-q5` (~5.6 GB) | `llama3.1:8b-q4` (~5.0 GB) | `phi3.5:mini-q4` (~2.2 GB) | 8 GB |
| 18 | Ryzen 7 7700X | 32 GB | ✅ | ~29 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) | `llama3.1:8b-q5` (~6.2 GB) | `phi3.5:mini-q5` (~2.8 GB) | 16 GB |
| 19 | Ryzen 9 5900X | 32 GB | ✅ | ~29 GB | `qwen2.5-coder:14b-q5` (~11 GB) | `llama3.1:8b-q8` (~9.1 GB) | `phi3.5:mini-q8` (~4.1 GB) | 16 GB |
| 20 | Ryzen 9 7950X | 64 GB | ✅ | ~61 GB | `qwen2.5-coder:32b-q4` (~20 GB) | `mixtral:8x7b-q4` (~26 GB) | `phi3.5:mini-q8` (~4.1 GB) | 32 GB |
| 21 | Raspberry Pi 5 | 8 GB | ❌ | ~5.5 GB | `qwen2.5-coder:0.5b-q4` (~0.4 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) ⚠️ | `tinyllama:1.1b-q4` (~0.7 GB) | 4 GB |

> ⚠️ No AVX2 — must use llama.cpp built without AVX2 requirement, or Ollama's ARM/NOAVX build. Quality is severely limited at this tier.

---

## GPUs — NVIDIA (NVENC / CUDA)

> VRAM is the hard constraint. System RAM is ignored for GPU inference — model must fit in VRAM entirely for listed performance.

| # | Hardware | VRAM | Coding (fits in VRAM) | Planning (fits in VRAM) | Quick Tasks (fits in VRAM) | Min VRAM to run all three |
|---|----------|------|-----------------------|------------------------|---------------------------|--------------------------|
| 22 | RTX 3060 12 GB | 12 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) | `llama3.1:8b-fp16` (~16 GB) ❌ → `llama3.1:8b-q5` (~6.2 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 23 | RTX 3070 8 GB | 8 GB | `qwen2.5-coder:7b-fp16` (~14 GB) ❌ → `qwen2.5-coder:7b-q5` (~5.6 GB) ✅ | `llama3.1:8b-q4` (~5.0 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 24 | RTX 3080 10 GB | 10 GB | `qwen2.5-coder:7b-q8` (~7.7 GB) ✅ | `llama3.1:8b-q5` (~6.2 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 25 | RTX 3090 24 GB | 24 GB | `qwen2.5-coder:14b-fp16` (~28 GB) ❌ → `qwen2.5-coder:14b-q8` (~15 GB) ✅ | `mixtral:8x7b-q4` (~26 GB) ❌ → `mixtral:8x7b-q3` (~20 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 26 | RTX 4060 Ti 16 GB | 16 GB | `qwen2.5-coder:14b-q5` (~11 GB) ✅ | `llama3.1:8b-fp16` (~16 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 27 | RTX 4090 24 GB | 24 GB | `qwen2.5-coder:32b-q4` (~20 GB) ✅ | `mixtral:8x7b-q4` (~26 GB) ❌ → `mixtral:8x7b-q3` (~20 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |

> ❌ = model does not fit at that quant — corrected to next viable quant shown inline.
> Mixtral 8x7b requires ~26 GB at Q4 — only fully fits at Q3 on 24 GB cards. Use `llama3.1:70b-q2` (~38 GB) only with CPU offloading.

---

## GPUs — AMD (AMF / ROCm)

| # | Hardware | VRAM | Coding (fits in VRAM) | Planning (fits in VRAM) | Quick Tasks (fits in VRAM) | Min VRAM to run all three |
|---|----------|------|-----------------------|------------------------|---------------------------|--------------------------|
| 28 | RX 6700 XT 12 GB | 12 GB | `qwen2.5-coder:14b-q4` (~9.0 GB) ✅ | `llama3.1:8b-q5` (~6.2 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |
| 29 | RX 7900 XTX 24 GB | 24 GB | `qwen2.5-coder:32b-q4` (~20 GB) ✅ | `mixtral:8x7b-q3` (~20 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 8 GB |

> ROCm support varies by kernel version. Verify `rocm-smi` is functional before relying on GPU inference. RX 6700 XT requires ROCm 5.4+.

---

## Apple Silicon — Unified Memory

> Unified memory means all system RAM is available as VRAM. No separation between GPU and CPU pools.

| # | Hardware | Unified RAM | Coding (fits in RAM) | Planning (fits in RAM) | Quick Tasks (fits in RAM) | Min RAM to run all three |
|---|----------|-------------|----------------------|-----------------------|--------------------------|--------------------------|
| 30 | Apple M2 Pro (32 GB) | 32 GB | `qwen2.5-coder:32b-q4` (~20 GB) ✅ | `mixtral:8x7b-q4` (~26 GB) ✅ | `phi3.5:mini-fp16` (~7.6 GB) ✅ | 16 GB |

> M2 Pro (16 GB) can run planning and quick tasks fine but is too tight for `qwen2.5-coder:32b-q4` — drop to `qwen2.5-coder:14b-q5` (~11 GB) instead.

---

## Model Minimum Specs Reference

| Model | Use Case | Min RAM/VRAM | Requires AVX2 | Approx Size on Disk | Notes |
|-------|---------|-------------|--------------|---------------------|-------|
| `tinyllama:1.1b-q4` | All (fallback) | 2 GB | ❌ | ~0.7 GB | Only model for no-AVX2 hardware. Weak quality. |
| `qwen2.5-coder:0.5b-q4` | Coding | 2 GB | ❌ | ~0.4 GB | ARM/Pi only. Barely viable. |
| `qwen2.5-coder:1.5b-q4` | Coding | 3 GB | ✅ | ~1.1 GB | Minimum viable coder with AVX2. |
| `gemma2:2b-q4` | Planning | 3 GB | ✅ | ~1.6 GB | Best 2B planner. Needs AVX2. |
| `phi3.5:mini-q4` | Quick Tasks | 4 GB | ✅ | ~2.2 GB | Best small all-rounder. Min 4 GB RAM. |
| `phi3.5:mini-q5` | Quick Tasks | 5 GB | ✅ | ~2.8 GB | Slightly higher quality. |
| `phi3.5:mini-q8` | Quick Tasks | 6 GB | ✅ | ~4.1 GB | Near-lossless phi. |
| `phi3.5:mini-fp16` | Quick Tasks | 10 GB | ✅ | ~7.6 GB | GPU only. Full precision. |
| `qwen2.5-coder:3b-q4` | Coding | 4 GB | ✅ | ~2.0 GB | Good N97/N200 coder. |
| `mistral:7b-q4` | Planning | 6 GB | ✅ | ~4.4 GB | Reliable mid-range planner. |
| `qwen2.5-coder:7b-q4` | Coding | 6 GB | ✅ | ~4.8 GB | Go-to 7B coder floor. |
| `qwen2.5-coder:7b-q5` | Coding | 8 GB | ✅ | ~5.6 GB | Better quality 7B coder. |
| `llama3.1:8b-q4` | Planning | 7 GB | ✅ | ~5.0 GB | Strong planner from 8 GB RAM. |
| `llama3.1:8b-q5` | Planning | 8 GB | ✅ | ~6.2 GB | Better planning quality. |
| `llama3.1:8b-q8` | Planning | 11 GB | ✅ | ~9.1 GB | Near-lossless 8B; GPU preferred. |
| `qwen2.5-coder:14b-q4` | Coding | 11 GB | ✅ | ~9.0 GB | Needs 16 GB RAM or 10 GB+ VRAM. |
| `qwen2.5-coder:14b-q5` | Coding | 13 GB | ✅ | ~11 GB | Needs 16 GB RAM or 12 GB+ VRAM. |
| `qwen2.5-coder:14b-q8` | Coding | 17 GB | ✅ | ~15 GB | GPU only; needs 16 GB+ VRAM. |
| `qwen2.5-coder:32b-q4` | Coding | 22 GB | ✅ | ~20 GB | Best OSS coder; 24 GB VRAM or 32 GB RAM. |
| `mixtral:8x7b-q3` | Planning | 22 GB | ✅ | ~20 GB | Minimum quant for 24 GB VRAM. |
| `mixtral:8x7b-q4` | Planning | 28 GB | ✅ | ~26 GB | Needs 32 GB RAM or multi-GPU. |
| `deepseek-coder-v2:16b-q4` | Coding | 11 GB | ✅ | ~9.5 GB | MoE; strong code reasoning from 16 GB RAM. |

---

## Notes on Minimum Spec Logic

- **CPU inference:** Token speed drops sharply below 3 t/s — avoid loading models larger than ~60% of available system RAM to leave room for KV cache growth during long context.
- **GPU inference:** VRAM is a hard wall. Even 100 MB over causes full swap to system RAM and near-zero token speed. Always leave ~500 MB headroom above model file size.
- **No-AVX2 hardware (rows 5, 6, 7, 21):** Must use a llama.cpp binary built with `-DLLAMA_AVX=OFF` or Ollama's `noavx` variant. Most prebuilt Ollama binaries since v0.2 require AVX2 by default.
- **Mixtral 8x7b** is a 46B MoE model — it loads all experts but only activates ~12B per token, giving 12B-class speed at near-40B quality. The full Q4 load (~26 GB) does not fit on a single 24 GB card — use Q3 on single-GPU setups.
- **Context length impact:** All size estimates above assume 2048 token context. Each doubling of context roughly adds ~0.5–1 GB KV cache overhead depending on model architecture.
