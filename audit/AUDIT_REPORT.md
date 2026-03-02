# Homelab Comprehensive Debug Audit — Round 3
**Date:** 2026-03-02 (Round 3 — incremental audit building on Rounds 1 & 2)
**Files audited:** 13 shell scripts, 52 JS modules, 7 YAML configs, 6 JSON files
**Cumulative bugs fixed across all rounds:** 29

---

## Round 3 Summary Table

| # | File | Severity | Bug | Status |
|---|------|----------|-----|--------|
| G | `setup.sh` | 🔴 CRITICAL | `/var/kilo` provisioned with `chmod 750` — both new-dir AND existing-dir branches. `setfacl` fallback only grants `r-x` to docker group, not write access. Container `kilo` user cannot write checkpoints, ledger, or quarantine files. | ✅ Fixed |
| 1 | `kilo/pipeline/src/services/qdrant.js` | 🔴 CRITICAL | 6 methods called by `scraper/storage.js` are not exported: `getCollections()`, `createCollection()`, `createIndex()`, `scroll()`, `delete()`, `getCollection()`. Every scrape-related storage operation throws `TypeError: qdrantClient.X is not a function` at runtime. | ✅ Fixed |
| 2 | `kilo/pipeline/src/services/scraper/storage.js` | 🔴 CRITICAL | `upsert()` called as `qdrantClient.upsert(collection, { points: [...] })` — passes an object wrapper. `qdrant.js` `upsert()` expects a plain array and calls `points.map()` directly. Results in `TypeError: points.map is not a function`, silently killing every single scrape-store operation. | ✅ Fixed |
| 3 | `kilo/pipeline/src/services/scraper/storage.js` | 🔴 CRITICAL | `search()` called as `qdrantClient.search(collection, { vector, limit, score_threshold, filter })` — passes an options object as the second positional argument. `qdrant.js` `search()` expects `(collection, vector, limit, scoreThreshold)` positionally. The options object would be passed as `vector`, causing `Array.from({vector:...})` to produce a zero-filled garbage array on every scrape search. | ✅ Fixed |
| 4 | `kilo/pipeline/src/services/scraper/index.js` | 🟡 MEDIUM | `scraperConfig.config?.CHECKPOINT_DIR` always evaluates to `undefined` — `scraper/config.js` exports no `config` property. Checkpoint path would fall through to `/app/data/checkpoints` (a path that doesn't exist in the container), causing LangGraph checkpoint saves to fail silently. | ✅ Fixed |

---

## Detailed Bug Analysis

### Bug G — `/var/kilo` permission blocks container writes (CRITICAL, carried from Round 2)
**File:** `setup.sh`, `/var/kilo` provisioning (both new-dir and existing-dir branches)
**Problem:**
```bash
# New-dir branch:
chmod 750 /var/kilo
command -v setfacl >/dev/null 2>&1 && setfacl -R -m g:docker:rx /var/kilo 2>/dev/null || true

# Existing-dir branch:
chmod -R 750 /var/kilo/*
chmod -R 750 /var/kilo/quarantine/*
```
`chmod 750` grants owner read/write/execute, group read/execute only. The `kilo-pipeline` container runs as a non-root `kilo` system user (created in the Dockerfile). `/var/kilo` is a bind-mount — host filesystem permissions are surfaced directly inside the container. The `kilo` container UID doesn't match the host `ACTUAL_USER` UID, so the container user gets **no write access**. The `setfacl` workaround only adds `r-x` to the docker group (still no write). Every `fs.writeFileSync()` call in the pipeline — checkpoints (`/var/kilo/checkpoints/`), failure ledger (`/var/kilo/failure_ledger/`), quarantine (`/var/kilo/quarantine/`) — throws `EACCES`. The pipeline appears to start but silently fails on every task.

**Fix:** Changed both branches to `chmod -R 777 /var/kilo`. This ensures the non-root container user can write to all subdirectories. The directory is on a trusted local server inside a home network; the security trade-off is acceptable.

---

### Bug 1 — `qdrant.js` missing 6 required methods (CRITICAL)
**File:** `kilo/pipeline/src/services/qdrant.js`
**Problem:** `scraper/storage.js` calls six methods on the shared `qdrantClient` singleton that are not exported:

| Called by storage.js | Present in qdrant.js |
|---|---|
| `getCollections()` | ❌ |
| `createCollection()` | ❌ |
| `createIndex()` | ❌ |
| `scroll()` | ❌ |
| `delete()` | ❌ |
| `getCollection()` | ❌ |

The underlying `@qdrant/js-client-rest` SDK supports all six operations. They are simply absent from `qdrant.js`'s exports. This breaks:
- `storage.initialize()` — cannot check/create the `scraped_content` collection → called at startup
- `storage.storePage()` / `storePages()` → every write call fails
- `storage.search()` → all semantic search fails
- `storage.getPagesByJob()` → export pipeline broken
- `storage.deleteByJob()` → cleanup broken
- `storage.getStats()` → health endpoint returns stale zeros

**Fix:** Added all 6 missing functions with proper retry wrappers:
- `getCollections()` — wraps `client.getCollections()`
- `getCollection(collection)` — wraps `client.getCollection()`
- `createCollection(collection, params)` — wraps `client.createCollection()`
- `createIndex(collection, field, fieldType)` — wraps `client.createPayloadIndex()`
- `scroll(collection, options)` — wraps `client.scroll()` with payload hydration
- `delete(collection, options)` — wraps `client.delete()` with `wait: true`

Also added optional `filter` parameter to `search()` to support `storage.js`'s job-filtered searches.

---

### Bug 2 — `storage.js` upsert called with object wrapper (CRITICAL)
**File:** `kilo/pipeline/src/services/scraper/storage.js`
**Problem:** Both `storePage()` and `storePages()` call:
```js
await qdrantClient.upsert(this.collectionName, { points: [point] });
await qdrantClient.upsert(this.collectionName, { points });
```
But `qdrant.js`'s `upsert(collection, points)` signature expects `points` to be a plain array and internally calls `points.map(p => ...)`. Passing `{ points: [...] }` as the second argument makes `points.map` throw `TypeError: points.map is not a function`, causing every scraped page write to fail with an unhandled exception.

The `watcher.js` service correctly calls `qdrant.upsert(collection, [{ id, vector, payload }])` (plain array) — confirming the correct API shape.

**Fix:** Changed both call sites to pass plain arrays:
```js
await qdrantClient.upsert(this.collectionName, [point]);         // storePage
await qdrantClient.upsert(this.collectionName, points);          // storePages
```

---

### Bug 3 — `storage.js` search called with options object instead of positional params (CRITICAL)
**File:** `kilo/pipeline/src/services/scraper/storage.js`
**Problem:** `search()` calls:
```js
const results = await qdrantClient.search(this.collectionName, {
    vector,
    limit,
    score_threshold: minScore,
    filter,
});
```
But `qdrant.js`'s `search(collection, vector, limit, scoreThreshold)` is a positional-argument function. The options object `{vector, limit, score_threshold, filter}` is passed as the `vector` argument. Internally, `Array.from({vector:..., limit:..., ...})` produces an empty array, which is sent to Qdrant as the query vector. Every semantic search returns garbage results or errors.

The `memory.js` service correctly calls `qdrant.search(collection, queryVector, limit, threshold)` positionally — confirming the correct API shape.

**Fix:** Updated `qdrant.js`'s `search()` to accept an optional fifth `filter` parameter, and changed `storage.js` to use positional args:
```js
const results = await qdrantClient.search(
    this.collectionName, vector, limit, minScore, filter
);
```

---

### Bug 4 — Scraper checkpoint path resolves to wrong directory (MEDIUM)
**File:** `kilo/pipeline/src/services/scraper/index.js`
**Problem:**
```js
const checkpointBasePath = scraperConfig.config?.CHECKPOINT_DIR  // ← always undefined
    || process.env.CHECKPOINT_DIR                                 // ← not set in docker-compose
    || (kiloDataDir ? kiloDataDir + '/checkpoints' : null)        // ← KILO_DATA_DIR not set
    || '/app/data/checkpoints';                                    // ← path doesn't exist in container
```
`scraper/config.js` exports `{ SCRAPE_PROFILES, getScrapeProfile, crawl4ai, antiBot, extraction, langgraph, qdrant }` — no `config` property. So `scraperConfig.config` is `undefined`. The chain then falls through all the way to `/app/data/checkpoints`, which is not created anywhere in the Dockerfile or `setup.sh`. LangGraph checkpoint saves would silently fail with `ENOENT`.

The correct path is `/var/kilo/checkpoints`, already defined in the main `config.js` as `CHECKPOINT_DIR` and bind-mounted from the host.

**Fix:** Import and use the main `config` module instead of the nonexistent `scraperConfig.config`:
```js
const mainConfig = require('../config');
const checkpointBasePath = mainConfig.CHECKPOINT_DIR
    || process.env.CHECKPOINT_DIR
    || '/var/kilo/checkpoints';
```

---

## Files Modified in Round 3

```
setup.sh                                                 — Bug G (chmod fix, both branches)
kilo/pipeline/src/services/qdrant.js                     — Bug 1 (6 missing methods + filter param on search)
kilo/pipeline/src/services/scraper/storage.js            — Bugs 2, 3 (upsert and search call signatures)
kilo/pipeline/src/services/scraper/index.js              — Bug 4 (checkpoint path resolution)
```

---

## Status of All Previous Fixes (Rounds 1 & 2)

| Fix | Description | Status |
|-----|-------------|--------|
| R1-1 | `set -euo pipefail` removed from sourced `hardware-detect.sh` | ✅ Present |
| R1-2 | N-series CPU regex word-boundary `\bN[0-9]{2,3}\b` | ✅ Present |
| R1-3 | Encoder detection: NVENC checked before Intel iGPU | ✅ Present |
| R1-4 | `print_hardware_profile()` uses `printf %q` for shell quoting | ✅ Present |
| R1-5 | `let HARDWARE_PROFILE` (was `const`, caused TypeError on fallback) | ✅ Present |
| R1-6 | TRUST_MODE validator accepts `autonomous` | ✅ Present |
| R1-7 | Ollama URL no double `http://` | ✅ Present |
| R1-8 | `checkpoint.js` logger path `../../logger` | ✅ Present |
| R1-9 | `setup.sh` GRUB block guarded by `[ -z "$FLAGS" ]` | ✅ Present |
| R1-10 | Prometheus Ollama endpoint `/metrics` not `/api/tags` | ✅ Present |
| R1-11 | `has_quicksync` typo fixed | ✅ Present |
| R1-12 | `IGPU_OK` speed class in `classify_hardware()` | ✅ Present |
| R1-13 | `test-ai-stack.sh` uses `OLLAMA_DEFAULT_MODEL` | ✅ Present |
| R2-A | `config.js` error message includes `autonomous` | ✅ Present |
| R2-B | `classify_hardware()` MID-tier `quicksync`/`igpu` → `IGPU_OK` | ✅ Present |
| R2-C | `task.js` trust_mode_override accepts `autonomous` | ✅ Present |
| R2-D | `health.js` `circuit_state` wired to live `circuitBreaker.getState()` | ✅ Present |
| R2-E | `crawl4ai/client.js` logger `../../logger` | ✅ Present |
| R2-F | `index.js` convergence case wrapped in `{ }` block scope | ✅ Present |
| R2-H | Duplicate `TZ` in `.env` generation removed | ✅ Present |
| R2-I | `PLEX_TOKEN` checks env var, not freshly-truncated file | ✅ Present |
| R2-J | `update.sh` health check grep matches `status:ok` | ✅ Present |
| R2-K | `update.sh` dead `POST /task/retry-all` endpoint removed | ✅ Present |

---

## Confirmed Clean (Round 3 Full Scan)

- All 13 shell scripts — `bash -n` syntax clean ✅
- All 52 JS modules — `node -c` parse clean ✅
- All 7 YAML configs — `yaml.safe_load` valid ✅
- All 6 JSON files — `json.load` valid ✅
- `docker-compose.yml` — network topology, service dependencies, volume mounts all correct ✅
- `kilo-pipeline` service — env vars, depends_on conditions, network membership all correct ✅
- `watcher.js` — uses correct `qdrant.upsert(collection, [points])` API ✅
- `memory.js` — uses correct `qdrant.search(collection, vector, limit, threshold)` API ✅
- `langgraph/` exports — `LangGraphRunner` and `FileCheckpointStore` correctly exported ✅
- `nextcloudWriter.js` — `isAvailable`, `exportToNextcloud`, `listExports` all exported ✅
- `embeddings.js` — `embedBatch()` exported as required by `storage.js` ✅
