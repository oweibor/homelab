# Homelab Comprehensive Debug Audit
**Date:** 2026-03-02  
**Files audited:** 13 shell scripts, 30+ JS modules, 4 YAML configs, 1 JSON config  
**Bugs found:** 13  
**Bugs fixed:** 13  

---

## Summary Table

| # | File | Severity | Bug | Status |
|---|------|----------|-----|--------|
| 1 | `scripts/hardware-detect.sh` | 🔴 CRITICAL | `set -euo pipefail` at top level corrupts parent shell when sourced | ✅ Fixed |
| 2 | `scripts/hardware-detect.sh` | 🔴 CRITICAL | N-series CPU regex matches `Xeon E5-2670N` (false positive) | ✅ Fixed |
| 3 | `scripts/hardware-detect.sh` | 🔴 CRITICAL | Encoder detection: Intel iGPU checked before NVIDIA/AMD — dual-GPU systems get wrong encoder | ✅ Fixed |
| 4 | `scripts/hardware-detect.sh` | 🟡 MEDIUM | `print_hardware_profile()` outputs unquoted `CPU_MODEL` and `CSTATE_FLAGS` — breaks `eval "$(...)"` on CPUs with spaces in name | ✅ Fixed |
| 5 | `kilo/pipeline/src/config.js` | 🔴 CRITICAL | `const HARDWARE_PROFILE` then `HARDWARE_PROFILE = 'n100_like'` — TypeError crash at startup on unknown profiles | ✅ Fixed |
| 6 | `kilo/pipeline/src/config.js` | 🔴 CRITICAL | `TRUST_MODE` validator rejects `'autonomous'` — pipeline crashes when wizard sets autonomous mode | ✅ Fixed |
| 7 | `kilo/pipeline/src/services/ollama/client.js` | 🔴 CRITICAL | Double `http://` URL: `` `http://${config.OLLAMA_HOST}` `` where `config.OLLAMA_HOST` already contains `http://ollama:11434` → all Ollama requests fail | ✅ Fixed |
| 8 | `kilo/pipeline/src/services/scraper/langgraph/checkpoint.js` | 🔴 CRITICAL | `require('../logger')` resolves to non-existent `scraper/logger.js` — module crashes on load | ✅ Fixed |
| 9 | `setup.sh` | 🟡 MEDIUM | GRUB C-state block runs even when `FLAGS` is empty (non-N100 hardware) — unnecessary GRUB modification | ✅ Fixed |
| 10 | `prometheus/prometheus.yml` | 🟡 MEDIUM | Ollama scraped at `/api/tags` (returns JSON model list, not Prometheus metrics) — scrape fails silently | ✅ Fixed |
| 11 | `setup.sh` | 🟢 LOW | Fallback function typo: `has_quickysync()` (extra `y`) — never called correctly when hardware-detect.sh is missing | ✅ Fixed |
| 12 | `onboard.sh` | 🟢 LOW | `IGPU_OK` speed class documented in `config.env.template` but never produced by `classify_hardware()` | ✅ Fixed |
| 13 | `scripts/test-ai-stack.sh` | 🟢 LOW | Uses deprecated `MODEL_CODING` variable; `config.env.template` now uses `OLLAMA_DEFAULT_MODEL` | ✅ Fixed |

---

## Detailed Bug Analysis

### Bug 1 — `set -euo pipefail` in sourced file (CRITICAL)
**File:** `scripts/hardware-detect.sh`, line 8  
**Problem:** The script starts with `set -euo pipefail`. When `onboard.sh` and `setup.sh` source this file, the `set` command takes effect in the **parent shell's** environment. This can change error handling behavior mid-script in both callers, potentially causing `onboard.sh` to abort on innocuous non-zero exit codes (e.g., `grep` returning 1 for "not found").  
**Fix:** Removed `set -euo pipefail` from `hardware-detect.sh`. The callers manage their own error modes.

---

### Bug 2 — N-series CPU regex false positive (CRITICAL)
**File:** `scripts/hardware-detect.sh`, line 35  
**Problem:** Pattern `N[0-9]{2,3}` matches any CPU model containing a letter N followed by 2-3 digits, including `Intel Xeon E5-2670N`, `Intel Core i7-8750N`, etc. These would all be misclassified as N-series (low-power Alder Lake-N), selecting wrong model sizes and performance tuning.  
**Fix:** Changed to `\bN[0-9]{2,3}\b` (word boundaries) to only match standalone N-series tokens like `N100`, `N200`, `N95`.

---

### Bug 3 — Encoder detection priority inverted (CRITICAL)
**File:** `scripts/hardware-detect.sh`, `get_encoder_type()`  
**Problem:** The function checked for Intel iGPU (`lspci | grep vga.*intel`) **before** checking for NVIDIA/AMD. On a system with both an Intel iGPU and an NVIDIA dGPU (a common laptop/workstation config), `get_encoder_type()` would return `quicksync` or `vaapi` instead of `nvenc`. This means Jellyfin/Plex would be configured for the slower integrated encoder.  
**Fix:** Reordered checks: NVIDIA NVENC → AMD AMF → Apple VideoToolbox → Intel QuickSync/VAAPI.

---

### Bug 4 — Unquoted vars in `print_hardware_profile()` (MEDIUM)
**File:** `scripts/hardware-detect.sh`, `print_hardware_profile()`  
**Problem:** `echo "CPU_MODEL=${cpu_model}"` — if `cpu_model` contains spaces (e.g., `"Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz"`), calling `eval "$(print_hardware_profile)"` in `onboard.sh` would break word-splitting and assign garbage or fail entirely.  
**Fix:** Changed to `printf 'CPU_MODEL=%q\n' "$cpu_model"` and `printf 'CSTATE_FLAGS=%q\n' "$(get_cstate_flags)"` using `%q` shell-quoting for values that can contain spaces.

---

### Bug 5 — `const` reassignment crash in `config.js` (CRITICAL)
**File:** `kilo/pipeline/src/config.js`, line 12 and 26  
**Problem:**
```js
const HARDWARE_PROFILE = process.env.HARDWARE_PROFILE || 'n100_like';
// ...
HARDWARE_PROFILE = 'n100_like';  // ← TypeError: Assignment to constant variable
```
If `HARDWARE_PROFILE` is set to an unrecognized value (e.g., a typo in `.env`), the fallback assignment on line 26 throws a `TypeError` and crashes the pipeline on startup.  
**Fix:** Changed `const` to `let` for `HARDWARE_PROFILE`.

---

### Bug 6 — `TRUST_MODE=autonomous` crashes pipeline (CRITICAL)
**File:** `kilo/pipeline/src/config.js`, line 75  
**Problem:** The validator only accepts `['supervised', 'graduated']`. But `onboard.sh` offers three trust modes (supervised / graduated / **autonomous**) and writes `TRUST_MODE=autonomous` to `config.env`. When the pipeline starts with this config, it calls `process.exit(1)`.  
**Fix:** Updated validator to `['supervised', 'graduated', 'autonomous']`. Also updated the error message to match.

---

### Bug 7 — Double `http://` in Ollama URL (CRITICAL)
**File:** `kilo/pipeline/src/services/ollama/client.js`, line 16  
**Problem:**
```js
// config.OLLAMA_HOST = "http://ollama:11434"  (from config.js default)
const OLLAMA_URL = `http://${config.OLLAMA_HOST || 'ollama:11434'}/api/generate`;
// Result: "http://http://ollama:11434/api/generate"  ← every request fails
```
All LLM inference calls fail with a URL parse error or network error. This would cause the circuit breaker to immediately trip after a few requests.  
**Fix:**
```js
const OLLAMA_BASE = config.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_URL = `${OLLAMA_BASE}/api/generate`;
```

---

### Bug 8 — Wrong `require` path in `checkpoint.js` (CRITICAL)
**File:** `kilo/pipeline/src/services/scraper/langgraph/checkpoint.js`, line 13  
**Problem:** `require('../logger')` from inside `scraper/langgraph/` resolves to `scraper/logger.js` — which **does not exist**. The correct path to the shared logger is `../../logger` (→ `services/logger.js`). The `LangGraphRunner` would throw `MODULE_NOT_FOUND` on startup, disabling the entire scraper subsystem.  
**Fix:** Changed to `require('../../logger')`.  
**Note:** `runner.js` in the same directory already correctly uses `require('../../logger')` — `checkpoint.js` was the only file with the wrong depth.

---

### Bug 9 — GRUB modified on non-N100 hardware (MEDIUM)
**File:** `setup.sh`, GRUB section  
**Problem:** The C-state fix block runs as long as `intel_idle.max_cstate` isn't already in GRUB — regardless of whether `needs_cstate_fix` returned false and `FLAGS` is empty. On non-N-series hardware, it runs `sed` with an empty substitution, writing a trailing space to the GRUB config and unnecessarily triggering `update-grub`.  
**Fix:** Added `[ -z "$FLAGS" ]` guard — skips the entire block when no C-state fix is needed.

---

### Bug 10 — Prometheus scrapes wrong Ollama endpoint (MEDIUM)
**File:** `prometheus/prometheus.yml`  
**Problem:** `metrics_path: /api/tags` — this endpoint returns a JSON list of installed models, not Prometheus-format metrics. Prometheus would log parse errors for every scrape interval (every 15s). Ollama's actual metrics endpoint (when enabled) is `/metrics`.  
**Fix:** Changed to `metrics_path: /metrics`. Added a comment explaining that Ollama requires `OLLAMA_EXPERIMENTAL_PROMETHEUS_METRICS=1` to expose metrics.

---

### Bug 11 — Typo `has_quickysync` in `setup.sh` fallback (LOW)
**File:** `setup.sh`, line 55  
**Problem:** The fallback function definition (used when `hardware-detect.sh` is missing) is named `has_quickysync()` (extra `y`). If any code path called `has_quicksync` and the hardware detection module was absent, it would get `command not found` instead of the safe `echo "0"` fallback.  
**Fix:** Renamed to `has_quicksync()`.

---

### Bug 12 — Missing `IGPU_OK` speed class (LOW)
**File:** `onboard.sh`, `classify_hardware()`  
**Problem:** `config.env.template` documents `SPEED_CLASS` as one of `INSUFFICIENT | CPU_MARGINAL | IGPU_OK | GPU_GOOD | GPU_GREAT`. However `classify_hardware()` never emitted `IGPU_OK` — systems with Intel iGPU in the MID tier would fall into `GPU_GOOD` (same as discrete GPU systems), skipping any IGPU-specific tuning paths.  
**Fix:** Added `IGPU_OK` branch: when `GPU_TYPE` is `igpu` or `HAS_QUICKSYNC=1`, the MID tier now correctly sets `SPEED_CLASS="IGPU_OK"`.

---

### Bug 13 — Deprecated `MODEL_CODING` in `test-ai-stack.sh` (LOW)
**File:** `scripts/test-ai-stack.sh`  
**Problem:** The script reads `${MODEL_CODING:-qwen2.5-coder:3b}`. Per `config.env.template` (lines 204-209), `MODEL_CODING` is deprecated — the current variable is `OLLAMA_DEFAULT_MODEL`. On a fresh install using the updated onboard wizard, `MODEL_CODING` would be empty and the test would check for the hardcoded default instead of the actually configured model.  
**Fix:** Changed to `${OLLAMA_DEFAULT_MODEL:-${MODEL_CODING:-qwen2.5-coder:3b}}` with legacy fallback chain.

---

## No Issues Found In

- All YAML files (`docker-compose.yml`, `traefik/dynamic.yaml`, `traefik/traefik.yaml`, `grafana/provisioning/**`) — valid and structurally correct
- `openclaw/openclaw.json` — valid JSON
- `onboard-lib.sh` — syntax clean (duplicate function definitions are intentional overrides by `onboard.sh`)
- `backup-homelab.sh`, `update.sh`, `check-ssl-expiry.sh`, `configure-*.sh` — no issues
- `kilo/pipeline/src/services/ollama/circuitBreaker.js` — correct and complete
- `kilo/pipeline/package.json` — correct engine requirements and dependencies
- Traefik static/dynamic config split — correctly structured (`traefik.yaml` = static, `dynamic.yaml` = dynamic provider)
- `RENDER_GID` — correctly detected at install time in `setup.sh` and written to `.env`

---

## Patched Files

```
scripts/hardware-detect.sh          — Bugs 1, 2, 3, 4
kilo/pipeline/src/config.js         — Bugs 5, 6
kilo/pipeline/src/services/ollama/client.js  — Bug 7
kilo/pipeline/src/services/scraper/langgraph/checkpoint.js  — Bug 8
setup.sh                            — Bugs 9, 11
prometheus/prometheus.yml           — Bug 10
onboard.sh                          — Bug 12
scripts/test-ai-stack.sh            — Bug 13
```
