# homelab-master · Autonomous App Factory Platform

### Agentic-Driven Multi-Tenant App Factory + Generated App Plugin Architecture

#### Event-Driven · Hardware-Aware · Parallel-Ready · Cloud-Portable

#### Node 20 · kilo-pipeline v9 · March 2026

---

## Executive Summary

This plan converts the homelab from a basic single-tenant CRUD app builder into a complete **autonomous multi-tenant app factory** using OpenCLAW + Kilo-CLI integration. The factory generates full-stack applications with a clean plugin architecture where modules can be independently installed, activated, deactivated, or removed.

### Two-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APP FACTORY PLATFORM                                  │
│  (OpenCLAW + Kilo-CLI + Kilo Pipeline)                                      │
│  - Agentic-driven scaffold generation                                        │
│  - Hardware-aware sequential→parallel scheduler                              │
│  - Clean plugin contracts for factory modules                               │
│  - Event-driven, modular, no hidden dependencies                           │
│                                                                             │
│  FACTORY MODULES (Scaffold Generators):                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐   │
│  │ SaaS         │ │ Financial    │ │ AI/RAG       │ │ Custom Module  │   │
│  │ Generator    │ │ Generator    │ │ Generator    │ │ Generator      │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ generates
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GENERATED APPS                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ APP CORE (always present): Auth, DB, API, Plugin Manager, EventBus │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│          ▲                                                                    │
│          │ RUNTIME PLUGINS (independently installable)                       │
│  ┌───────┴───────────────────────────────────────────────────────────────┐  │
│  │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │  │
│  │ │ Accounting  │ │ POS        │ │ Inventory  │ │ AI Chat   │          │  │
│  │ │ Module      │ │ Module      │ │ Module      │ │ Module    │          │  │
│  │ └────────────┘ └────────────┘ └────────────┘ └────────────┘          │  │
│  │                                                                        │  │
│  │ Module Dependencies (via events, not direct calls):                    │  │
│  │ - POS → Inventory (stock.decremented)                                  │  │
│  │ - Invoice → Accounting (journal.posted)                                │  │
│  │ - Payroll → Accounting (journal.posted)                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  EXPORT: Complete bundle (code + DB dump + Docker/K8s manifests)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Five Architectural Principles

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **1. Factory Core Independence** | Factory never depends on modules; modules depend on factory contracts | `IFactoryContract` interface; modules import core, never the reverse |
| **2. Event-Driven Communication** | All inter-module communication via typed events, never direct API calls | `DomainEventBus` with strict publish/subscribe |
| **3. Runtime Plugin Architecture** | Generated apps support runtime plugin installation without redeployment | `IPlugin` interface with lifecycle hooks |
| **4. Hardware-Aware Scheduling** | Factory adapts execution based on available resources | HAL integration for sequential→parallel scaling |
| **5. Export Continuity** | Generated apps bundle with DB + deployment specs for seamless migration | Docker image + SQL dump + K8s manifests in single export |

---

## Enforcement Mechanisms — Wired for Build Errors

> **NOTE:** Architectural rules are only guarantees if they are enforced at build time, pre-commit, and CI. This section specifies the actual enforcement mechanisms.

### 1. Import Graph Rules (dependency-cruiser)

All violations are **build errors**, not warnings:

```javascript
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    {
      name: 'module-cannot-import-core-engine',
      severity: 'error',
      from: { path: '^packages/module-' },
      to:   { path: '^packages/core-engine' },
    },
    {
      name: 'module-cannot-import-other-module',
      severity: 'error',
      from: { path: '^packages/module-' },
      to:   { path: '^packages/module-' },
    },
    {
      name: 'core-engine-cannot-import-modules',
      severity: 'error',
      from: { path: '^packages/core-engine' },
      to:   { path: '^packages/module-' },
    },
    // Closes the leaky contracts hole
    {
      name: 'core-contracts-cannot-import-core-engine',
      severity: 'error',
      from: { path: '^packages/core-contracts' },
      to:   { path: '^packages/core-engine' },
    },
    // Event types must come from core-contracts
    {
      name: 'event-types-must-come-from-contracts',
      severity: 'error',
      from: { path: '^packages/module-' },
      to:   { path: '^packages/module-.*/events' },
    },
  ],
};
```

### 2. Pre-Commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npx dependency-cruiser --validate .dependency-cruiser.js packages/
if [ $? -ne 0 ]; then
  echo "✗ Import boundary violation. Commit blocked."
  exit 1
fi
```

### 3. CI Pipeline Gates

```yaml
# kilo.pipeline.yml
stages:
  - name: boundary-enforcement
    run: npx dependency-cruiser --validate .dependency-cruiser.js packages/
    fail-fast: true
    blocks: [build, test, generate]

  - name: contract-test-presence
    run: node scripts/verify-contract-tests.js
    fail-fast: true
    blocks: [build, test, generate]
```

### 4. Registry Hard Rejection

The plugin registry **rejects** any module that:
- Fails contract tests or lacks a contract test suite
- Has import boundary violations
- Declares an event without a schema in `core-contracts/events/`
- Declares a consumed event with no registered producer
- Has incompatible `coreContractsVersion`

### 5. Runtime Event Enforcement

The scoped EventBus **throws** on undeclared subscriptions:

```typescript
class ScopedEventBus implements IScopedEventBus {
  on(eventType: string, handler: Function) {
    if (!this.declaredConsumes.includes(eventType)) {
      throw new UndeclaredSubscriptionError(
        `Module attempted to subscribe to undeclared event: ${eventType}. `
      );
    }
    return this.rawEventBus.subscribe(eventType, handler);
  }
}
```

### 6. Event Schema Versioning

Event types **must include schema version**:

```typescript
// core-contracts/events/billing.events.ts
interface InvoiceCreatedEventV1 {
  type: 'billing:invoice.created';
  schemaVersion: '1';
  payload: { invoiceId: string; amount: number; }
}

interface InvoiceCreatedEventV2 {
  type: 'billing:invoice.created';
  schemaVersion: '2';
  payload: { invoiceId: string; amount: number; currency: string; }
}

// Manifest declares version explicitly
consumes: ['billing:invoice.created@v1']
emits:    ['billing:invoice.created@v2']
```

### 7. Factory Test Harness Regression

Runs on every factory release. Verifies the enforcement config itself cannot be silently broken.

---

## Factory Internal Architecture: Typed Packages (Gap 3 Fix)

> **CRITICAL GAP FILLED** - Factory internals now follow v4's typed package structure.

### Current (Shell Scripts - TO BE REPLACED)

```
factory/
├── scaffold.sh          # case statement dispatcher
├── modules/
│   ├── saas-scaffold.sh
│   ├── financial-scaffold.sh
│   └── ...
```

### Target (Typed Packages)

```
factory/
├── packages/
│   ├── core-contracts/       # THE ONLY LEGAL IMPORT FOR GENERATOR MODULES
│   │   ├── package.json      # zero dependencies on core-engine
│   │   └── src/
│   │       ├── interfaces/
│   │       │   ├── ModuleGenerator.ts
│   │       │   ├── GeneratorAPI.ts
│   │       │   └── EventBus.ts
│   │       ├── types/
│   │       └── events/
│   │
│   ├── core-engine/           # ZERO modules import from here (build-enforced)
│   │   └── src/
│   │       ├── pipeline/
│   │       ├── scheduler/
│   │       └── registry/
│   │
│   ├── module-scaffolding/   # depends ONLY on core-contracts
│   ├── module-codegen/       # depends ONLY on core-contracts
│   ├── module-datalayer/     # depends ONLY on core-contracts
│   ├── module-auth/          # depends ONLY on core-contracts
│   ├── module-devops/        # depends ONLY on core-contracts
│   ├── module-observability/ # depends ONLY on core-contracts
│   ├── module-compliance/    # depends ONLY on core-contracts
│   └── module-export/        # depends ONLY on core-contracts
│
├── .dependency-cruiser.js
├── .husky/pre-commit
└── kilo.pipeline.yml
```

### Migration Path

1. **Phase 1**: Extract `GeneratorAPI` interface to `core-contracts`
2. **Phase 2**: Convert one scaffold (e.g., `saas-scaffold.sh`) to `ModuleGenerator` class
3. **Phase 3**: Add dependency-cruiser rules for package boundaries
4. **Phase 4**: Migrate remaining scaffolds incrementally

### GeneratorAPI Interface (Full Specification)

```typescript
// core-contracts/GeneratorAPI.ts

export interface ScaffoldInput {
  appName: string;
  workspaceId?: string;
  stack: 't3' | 'nextjs' | 'express' | 'mern' | 'extjs' | 'laravel' | 'rails' | 'django';
  database: 'postgresql' | 'mysql' | 'sqlite';
  features: string[];
  authProvider?: 'authjs' | 'clerk' | 'custom';
}

export interface ArtifactFile {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
}

export interface ModuleKnowledge {
  moduleName: string;
  version: string;
  generatedAt: string;
  domainDescription: string;
  entities: ModuleEntityDoc[];
  emittedEvents: EventDoc[];
  consumedEvents: EventDoc[];
  endpoints: EndpointDoc[];
  invariants: InvariantDoc[];
  extensionPoints: ExtensionPointDoc[];
}

export interface GeneratorAPI {
  // Copy template files from built-in templates or custom template dirs
  copyTemplate(templateId: string, appName: string): Promise<ArtifactFile[]>;
  copyTemplates(templateDir: string, appName: string): Promise<ArtifactFile[]>;
  
  // Add Prisma schema fragment
  addPrisma(input: ScaffoldInput): Promise<ArtifactFile[]>;
  
  // Add authentication (Auth.js, Clerk, or custom)
  addAuth(input: ScaffoldInput): Promise<ArtifactFile[]>;
  
  // Write module knowledge JSON for agentic regeneration
  writeModuleKnowledge(knowledge: ModuleKnowledge): Promise<void>;
}
```

---

## F10: Knowledge & Documentation Layer

> **CRITICAL GAP FILLED** - This layer provides the queryable model needed for agentic regeneration.

### F10.1 Module Knowledge Assembler

Every scaffold produces a `module-knowledge.json` artifact:

```typescript
interface ModuleKnowledge {
  moduleName: string;
  version: string;
  generatedAt: string;
  domainDescription: string;
  entities: ModuleEntityDoc[];
  emittedEvents: EventDoc[];
  consumedEvents: EventDoc[];
  endpoints: EndpointDoc[];
  invariants: InvariantDoc[];
  extensionPoints: ExtensionPointDoc[];
}
```

### F10.2 Generation Provenance Record

Tracks what was generated and why:

```typescript
interface ProvenanceRecord {
  generationId: string;
  timestamp: number;
  blueprint: Blueprint;
  modulesGenerated: string[];
  decisions: DecisionLog[];
  factoryVersion: string;
}
```

### F10.3 Semantic Index (Agent-Queryable)

Vector store for natural language queries about the codebase:

```typescript
interface SemanticIndex {
  // Index module knowledge for agent queries
  index(moduleKnowledge: ModuleKnowledge): Promise<void>;
  
  // Query: "What events does accounting emit?"
  query(question: string): Promise<QueryResult[]>;
}
```

### F10.4 Knowledge Drift Detection CI Job

```yaml
# .github/workflows/update-knowledge.yml
name: Knowledge Drift Detection
on: [push]
jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check module-knowledge.json sync
        run: node scripts/check-knowledge-drift.js
      - name: Post warning comment on PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Knowledge drift detected: source files changed without updating module-knowledge.json'
            })
```

#### check-knowledge-drift.js Specification

```javascript
// scripts/check-knowledge-drift.js
// Compares module-knowledge.json against live source files

const fs = require('fs');
const path = require('path');

const APP_DIR = process.argv[2] || '.';
const KNOWLEDGE_DIR = path.join(APP_DIR, '.kilo', 'module-knowledge');
const MODULES_DIR = path.join(APP_DIR, 'src', 'modules');

let driftDetected = false;

// Load all knowledge artifacts
const knowledgeFiles = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json'));

for (const file of knowledgeFiles) {
  const moduleName = file.replace('.json', '');
  const knowledge = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf8'));
  const moduleDir = path.join(MODULES_DIR, moduleName);

  // 1. Check entity names against Prisma schema
  if (knowledge.entities) {
    const schemaPath = path.join(moduleDir, 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      for (const entity of knowledge.entities) {
        const expectedModel = `${moduleName}${entity.name}`;
        if (!schema.includes(`model ${expectedModel}`)) {
          console.error(`❌ Drift: ${moduleName} entity ${entity.name} not in schema`);
          driftDetected = true;
        }
      }
    }
  }

  // 2. Check emitted events against module code
  if (knowledge.emittedEvents) {
    const eventsPath = path.join(moduleDir, 'events.ts');
    if (fs.existsSync(eventsPath)) {
      const eventsCode = fs.readFileSync(eventsPath, 'utf8');
      for (const event of knowledge.emittedEvents) {
        if (!eventsCode.includes(event.type)) {
          console.error(`❌ Drift: ${moduleName} emits ${event.type} but not in code`);
          driftDetected = true;
        }
      }
    }
  }

  // 3. Check consumed events (subscribes) against setup code
  if (knowledge.consumedEvents) {
    const setupPath = path.join(moduleDir, 'setup.ts');
    if (fs.existsSync(setupPath)) {
      const setupCode = fs.readFileSync(setupPath, 'utf8');
      for (const event of knowledge.consumedEvents) {
        if (!setupCode.includes(event.type)) {
          console.error(`❌ Drift: ${moduleName} subscribes to ${event.type} but not in setup`);
          driftDetected = true;
        }
      }
    }
  }
}

if (driftDetected) {
  console.error('⚠️ Knowledge drift detected - see errors above');
  process.exit(1);
} else {
  console.log('✓ No knowledge drift detected');
  process.exit(0);
}
```

### F10.5 write-module-knowledge.sh Script

Every scaffold must call this script to produce the knowledge artifact:

```bash
#!/bin/bash
# kilo/scaffold/scripts/common/write-module-knowledge.sh
# FIXED: Use jq -n to avoid shell injection vulnerabilities

MODULE_NAME="$1"
VERSION="$2"
DOMAIN_DESC="$3"
ENTITY_LIST="$4"      # JSON array: '["Customer","Order"]'
EVENT_LIST="$5"       # JSON array: '{"emits":[],"consumes":[]}'
ENDPOINT_LIST="$6"    # JSON array

OUTPUT_DIR="${APP_DIR}/.kilo/module-knowledge"
mkdir -p "$OUTPUT_DIR"

# Use jq -n to safely construct JSON (eliminates shell injection)
jq -n \
  --arg moduleName "$MODULE_NAME" \
  --arg version "$VERSION" \
  --arg domainDescription "$DOMAIN_DESC" \
  --argjson entities "$ENTITY_LIST" \
  --argjson eventData "$EVENT_LIST" \
  --argjson endpoints "$ENDPOINT_LIST" \
  '{
    moduleName: $moduleName,
    version: $version,
    generatedAt: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
    domainDescription: $domainDescription,
    entities: $entities,
    emittedEvents: $eventData.emits,
    consumedEvents: $eventData.consumes,
    endpoints: $endpoints,
    invariants: [],
    extensionPoints: []
  }' > "${OUTPUT_DIR}/${MODULE_NAME}.json"

echo "✓ Written ${MODULE_NAME}.json"
```

**Security Fix:** The heredoc with shell variable interpolation (`"${DOMAIN_DESC}"`) is vulnerable to injection if the description contains `"`, `\`, or `$(...)`. Using `jq -n --arg` safely escapes all input.

**Usage in scaffold scripts:**

```bash
# After generating accounting module code:
source "${SCRIPT_DIR}/common/write-module-knowledge.sh"
write-module-knowledge.sh "accounting" "1.0.0" "Financial accounting module" \
  '["JournalEntry","Account","TaxRate"]' \
  '{"emits":["accounting:journal.posted"],"consumes":[]}' \
  '["/api/journal","/api/accounts"]'
```

### F10.6 Openclaw Context Protocol (Multi-Module) — With Token Budget

For multi-module platforms, Openclaw loads knowledge strategically with a **token budget** to prevent context window overflow:

```typescript
// Context budget: leave headroom for generated output
const CONTEXT_BUDGET = (modelContextWindow: number) => Math.floor(modelContextWindow * 0.6);

// Tiered loading strategy
interface ContextBudget {
  total: number;
  used: number;
  remaining: number;
}

async function buildRegenerationContext(
  request: RegenerationRequest,
  modelContextWindow: number = 128000 // Default for Claude
): Promise<RegenerationContext> {
  const budget = CONTEXT_BUDGET(modelContextWindow);
  let context: RegenerationContext = {
    targetModule: request.targetModule,
    adjacentModules: [],
    knowledge: { target: null, adjacent: [] }
  };
  
  // TIER 1 (always): Full knowledge for target module
  const targetKnowledge = await readFile(`.kilo/module-knowledge/${request.targetModule}.json`);
  context.knowledge.target = targetKnowledge;
  context.budgetUsed = estimateTokens(targetKnowledge);
  
  // TIER 2 (if budget allows): Event declarations for directly connected modules
  for (const dep of request.adjacentModules) {
    if (context.budgetUsed + EVENT_DECLARATION_ESTIMATE > budget) break; // Stop if budget exceeded
    
    const adj = await readFile(`.kilo/module-knowledge/${dep}.json`);
    context.knowledge.adjacent.push({
      moduleName: adj.moduleName,
      emittedEvents: adj.emittedEvents,
      consumedEvents: adj.consumedEvents
    });
    context.adjacentModules.push(dep);
    context.budgetUsed += EVENT_DECLARATION_ESTIMATE;
  }
  
  // TIER 3 (selective via SemanticIndex): Full adjacent module knowledge
  // Only if specific relevance determined by semantic search
  if (request.specificRelevanceQuery) {
    const relevantModules = await semanticIndex.query(
      request.specificRelevanceQuery,
      request.targetModule,
      budget - context.budgetUsed
    );
    // Load full knowledge only for semantically relevant modules
  }
  
  return context;
}

const EVENT_DECLARATION_ESTIMATE = 500; // ~500 tokens per module's events

```typescript
// In Openclaw regeneration request handler
interface RegenerationContext {
  targetModule: string;           // Module being regenerated
  adjacentModules: string[];     // Dependencies
  knowledge: {
    target: ModuleKnowledge;      // Full knowledge for target
    adjacent: AdjacentKnowledge[]; // Events only for dependencies
  };
}

async function buildRegenerationContext(request: RegenerationRequest): Promise<RegenerationContext> {
  const targetKnowledge = await readFile(`.kilo/module-knowledge/${request.targetModule}.json`);
  
  // Load only event declarations for adjacent modules (not full detail)
  const adjacent = [];
  for (const dep of request.adjacentModules) {
    const adj = await readFile(`.kilo/module-knowledge/${dep}.json`);
    adjacent.push({
      moduleName: adj.moduleName,
      emittedEvents: adj.emittedEvents,
      consumedEvents: adj.consumedEvents
    });
  }
  
  return {
    targetModule: request.targetModule,
    adjacentModules: request.adjacentModules,
    knowledge: {
      target: targetKnowledge,
      adjacent
    }
  };
}
```

---

## Additional v4 Patterns (To Be Incorporated)

### 1. Pure Function Guarantee

The `generate()` method must be a **pure function** - same inputs always produce same outputs. This is critical for parallel execution safety.

```typescript
interface ModuleGenerator {
  // Pure function — same inputs always produce same outputs.
  // No shared mutable state. This is the single requirement
  // that makes sequential → parallel switch safe.
  generate(reader: BlueprintReader, api: GeneratorAPI): Promise<ArtifactBundle>;
  
  validate(bundle: ArtifactBundle): ValidationResult;
}
```

### 2. Resolution Log

Every architectural decision recorded with reasoning chain:

```typescript
interface DecisionLog {
  decision: string;
  rationale: string;
  requirement: string;
  alternatives: string[];
  rejectedReasons: string[];
  timestamp: number;
}
```

### 3. Knowledge Writer (ModuleKnowledge)

Every module produces a knowledge artifact during generation:

```typescript
interface KnowledgeWriter {
  setDomainDescription(description: string): void;
  registerEntity(entity: ModuleEntityDoc): void;
  documentEmittedEvent(eventType: string, doc: EventDoc): void;
  documentConsumedEvent(eventType: string, doc: EventDoc): void;
  documentEndpoint(endpoint: EndpointDoc): void;
  registerInvariant(invariant: InvariantDoc): void;
  registerExtensionPoint(point: ExtensionPointDoc): void;
}

interface ModuleKnowledge {
  moduleName: string;
  version: string;
  generatedAt: string;
  domainDescription: string;
  entities: ModuleEntityDoc[];
  emittedEvents: EventDoc[];
  consumedEvents: EventDoc[];
  endpoints: EndpointDoc[];
  invariants: InvariantDoc[];
  extensionPoints: ExtensionPointDoc[];
}
```

### 4. Capability Negotiation

Gap report when requirements exceed factory capabilities:

```typescript
interface CapabilityNegotiation {
  // Returns structured gap report
  assess(requirements: UserRequirements): GapReport;
  
  // Never silently generates broken app
  canGenerate(requirements: UserRequirements): boolean;
}

interface GapReport {
  gaps: Gap[];
  recommendations: string[];
  canProceed: boolean;
}
```

### 5. Seven Registry Validations

Module registration requires all 7 checks:

```typescript
async register(module: ModuleGenerator): Promise<void> {
  // 1. Manifest validation
  this.validateManifest(module.manifest);
  
  // 2. Contract tests present and passing
  const testResult = await this.runContractTests(module);
  if (!testResult.passed) throw new RegistrationRejectedError();
  
  // 3. Import boundary violations
  const violations = await this.scanImportGraph(module);
  if (violations.length > 0) throw new RegistrationRejectedError();
  
  // 4. Event schemas exist for declared emits
  for (const eventType of module.manifest.emits)
    if (!this.eventSchemaRegistry.has(eventType))
      throw new RegistrationRejectedError();
  
  // 5. Producer exists for declared consumes
  for (const eventType of module.manifest.consumes)
    if (!this.hasRegisteredProducer(eventType))
      throw new RegistrationRejectedError();
  
  // 6. Core contracts version compatibility
  if (!semver.satisfies(CURRENT_VERSION, module.manifest.coreContractsVersion))
    throw new RegistrationRejectedError();
  
  // 7. Knowledge artifact path declared
  if (!module.manifest.knowledgeArtifactPath)
    throw new RegistrationRejectedError();
  
  this.modules.set(module.manifest.name, module);
}
```

### 6. Infrastructure Adapter Pattern

Generated apps use adapters, not cloud SDKs directly:

```typescript
// infra/adapters/storage.ts
interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

// Implementations
class LocalStorageAdapter implements StorageAdapter { ... }
class S3StorageAdapter implements StorageAdapter { ... }
class GCSStorageAdapter implements StorageAdapter { ... }

// Switching = one config value, zero business logic changes
```

### 7. Factory Detachment Protocol

Script to run app independently after export:

```bash
#!/bin/bash
# infra/deploy/factory-detach.sh

# Restore database
./db/restore.sh

# Setup environment
cp env/.env.template .env
read -p "Fill .env then press enter..."

# Start services
docker-compose -f compose/docker-compose.prod.yml up -d

# Verify
curl -f http://localhost/health || exit 1

# Transfer CI/CD
cp ci/github-actions.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "chore: transfer CI/CD from factory"

echo "✓ Running independently."
```

### 8. Lifecycle States

Module lifecycle with atomic transitions:

```
UNREGISTERED → REGISTERED → INSTALLED → ACTIVE ⇄ DEACTIVATED → DELETED
```

- **Deactivation**: Routes/listeners removed, data untouched
- **Deletion**: Destructive, requires conflict resolution first

### 8.1 Module Deletion Conflict Resolution

Before a module can transition from DEACTIVATED to DELETED, the system must verify:

```typescript
interface ModuleDeletionCheck {
  moduleId: string;
  conflicts: DeletionConflict[];
}

interface DeletionConflict {
  type: 'CROSS_MODULE_REF' | 'OPEN_TRANSACTION' | 'AUDIT_REQUIREMENT';
  severity: 'BLOCKING' | 'WARNING';
  message: string;
  affectedModule?: string;
}

async function validateModuleDeletion(
  moduleId: string,
  context: IHostContext
): Promise<ModuleDeletionCheck> {
  const conflicts: DeletionConflict[] = [];
  
  // 1. Check cross-module references
  const refs = await context.db.moduleDependency.findMany({
    where: { OR: [{ dependsOn: moduleId }, { providedBy: moduleId }] }
  });
  
  for (const ref of refs) {
    const depModule = await context.services.get(ref.dependsOn === moduleId 
      ? ref.providedBy 
      : ref.dependsOn);
    
    if (depModule?.status === 'ACTIVE') {
      conflicts.push({
        type: 'CROSS_MODULE_REF',
        severity: 'BLOCKING',
        message: `Module '${ref.dependsOn}' depends on '${moduleId}'`,
        affectedModule: ref.dependsOn
      });
    }
  }
  
  // 2. Check for open transactions (financial modules)
  if (moduleId === 'accounting') {
    const openEntries = await context.db.journalEntry.count({
      where: { status: { not: 'POSTED' } }
    });
    if (openEntries > 0) {
      conflicts.push({
        type: 'OPEN_TRANSACTION',
        severity: 'BLOCKING',
        message: `${openEntries} unposted journal entries must be posted or deleted first`
      });
    }
  }
  
  // 3. Check audit requirements (financial data cannot be deleted)
  const auditRetention = await context.db.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    where: { moduleId }
  });
  
  if (auditRetention) {
    conflicts.push({
      type: 'AUDIT_REQUIREMENT',
      severity: 'BLOCKING',
      message: 'Module has audit logs — data cannot be deleted, only soft-deleted'
    });
  }
  
  return { moduleId, conflicts };
}
```

**Deletion Rules:**
- CROSS_MODULE_REF with ACTIVE dependency = BLOCKING
- OPEN_TRANSACTION = BLOCKING (financial modules)
- AUDIT_REQUIREMENT = BLOCKING (data must be soft-deleted, not destroyed)
- Export audit trail before deletion

### 9. Scheduler Interface (Sequential ↔ Parallel)

Same interface for both schedulers:

```typescript
interface Scheduler {
  schedule(tasks: GeneratorTask[]): Promise<ArtifactBundle[]>;
}

// Sequential: one at a time
class SequentialScheduler implements Scheduler { ... }

// Parallel: one config change away
class ParallelScheduler implements Scheduler {
  constructor(private workers: number) {}
}

// Hardware-aware selection with runtime rebalancing
class HardwareProbe {
  private monitor: HardwareMonitor;
  private currentScheduler: Scheduler;
  
  constructor(monitor: HardwareMonitor) {
    this.monitor = monitor;
    this.currentScheduler = this.selectScheduler(); // Initial selection
    
    // Subscribe to metrics for runtime rebalancing
    this.monitor.on('memoryPressure', (metrics) => {
      this.adjustScheduler(metrics);
    });
  }
  
  selectScheduler(): Scheduler {
    if (cpuCores >= 4 && freeMemGB >= 4)
      return new ParallelScheduler({ workers: cpuCores - 1 });
    return new SequentialScheduler();
  }
  
  // Runtime rebalancing: check memory before dispatching each task
  async canDispatchTask(estimatedMemoryMB: number): Promise<boolean> {
    const metrics = this.monitor.check();
    const freeMemMB = metrics.memory.free;
    
    // Back off to sequential if memory pressure is high
    if (freeMemMB < estimatedMemoryMB * 2) {
      logger.warn({ freeMemMB, estimatedMemoryMB }, 
        'Memory pressure high — forcing sequential scheduling');
      this.currentScheduler = new SequentialScheduler();
      return false;
    }
    
    return true;
  }
  
  private adjustScheduler(metrics: HardwareMetrics): void {
    const memUsagePercent = metrics.memory.used / metrics.memory.total;
    
    // If memory usage > 85%, reduce parallelism
    if (memUsagePercent > 0.85 && this.currentScheduler instanceof ParallelScheduler) {
      const currentWorkers = (this.currentScheduler as ParallelScheduler).workers;
      const newWorkers = Math.max(1, Math.floor(currentWorkers * 0.5));
      logger.warn({ memUsagePercent, newWorkers }, 
        'Memory pressure detected — reducing parallel workers');
      this.currentScheduler = new ParallelScheduler({ workers: newWorkers });
    }
  }
}
```

---

## App Factory Platform (What the Factory Does)

The factory platform orchestrates app generation through sequential pipeline stages, with architecture designed for future parallel execution:

| Component | Current | Future |
|-----------|---------|--------|
| **Scaffold Pipeline** | Sequential (OpenCLAW → Kilo) | Parallel (multiple scaffolds) |
| **Module Generation** | One at a time | Concurrent generation |
| **Hardware Scheduling** | Conservative single-task | Dynamic parallel based on resources |
| **Plugin Loading** | Compile-time only | Runtime plugin directory |

---

## Generated Apps (What the Factory Produces)

Each generated app is a **full-stack application** with built-in plugin architecture:

| App Type | Built-in Modules | Module Dependencies |
|----------|-----------------|---------------------|
| **SaaS/CRUD** | Auth, Users, API Core | None required |
| **Financial** | Accounting, AP/AR, Invoicing | None required |
| **ERP** | Accounting + Procurement + Inventory + HR | Invoice → Accounting |
| **POS** | POS + Inventory | POS → Inventory (stock) |
| **WMS** | Warehouse + Inventory | GoodsReceipt → Inventory |
| **HR** | Employees + Leave + Payroll | Payroll → Accounting |

---

## Export & Deployment Flexibility

Every generated app ships with **complete export bundle**:

| Component | Description |
|-----------|-------------|
| **App Code** | Full source with plugin system |
| **Database** | Schema + seed data dump |
| **Docker** | docker-compose.yml + Dockerfiles |
| **Kubernetes** | Helm charts + manifests |
| **CI/CD** | GitHub Actions / Woodpecker pipelines |

**Primary Deployment Targets** (3): Docker Compose (VPS/homelab), Kubernetes (cloud-agnostic), Serverless (Vercel/Netlify)

---

## Hardware Abstraction Layer (HAL)

The factory integrates hardware awareness throughout:

| Layer | HAL Integration |
|-------|-----------------|
| **Startup Detection** | Auto-detect CPU, RAM, GPU, Bandwidth Tier, Storage via `hardware-detect.sh` |
| **Profile Mapping** | Maps `get_hardware_profile_v2` output to HAL resource sets |
| **Resource Allocation** | Dynamic limits (`HAL_*`) based on selected hardware profile |
| **Scheduling** | Sequential→parallel switch based on `HAL_MAX_CONCURRENCY` |
| **Generated Apps** | Inherit hardware-appropriate limits for Postgres, Ollama, and Sandboxes |

---

## Generated App Plugin Architecture

Each generated app includes a **runtime plugin system** that allows modules to be independently installed, activated, deactivated, or removed without breaking the core application.

### Plugin Interface Contract

```typescript
interface IPlugin {
  /** Unique identifier for this plugin */
  pluginId: string;
  
  /** Semantic version for compatibility checking */
  apiVersion: string;
  
  /** Human-readable name */
  name: string;
  
  /** List of plugin IDs this plugin depends on */
  dependencies?: string[];
  
  /** Events this plugin emits */
  emits?: string[];
  
  /** Events this plugin subscribes to */
  subscribes?: string[];
  
  /** Lifecycle: Called when plugin is installed/activated */
  setup?(context: IPluginContext): Promise<void>;
  
  /** Lifecycle: Called when plugin is deactivated */
  teardown?(): Promise<void>;
  
  /** Lifecycle: Called during DB migration */
  onMigrate?(migration: IMigration): Promise<void>;
  
  /** Lifecycle: Called when new tenant is provisioned */
  onTenantProvision?(tenant: ITenant): Promise<void>;
}
```

### Plugin Context (What Plugins Receive)

> **CRITICAL:** No direct plugin-to-plugin coupling. All communication via events only.

```typescript
interface IPluginContext {
  /** Database connection for this tenant */
  db: Database;
  
  /** Event bus - ONLY way to communicate with other modules */
  events: IScopedEventBus;  // Throws if emit/subscribe to undeclared events
  
  /** Configuration store */
  config: IConfigStore;
  
  /** HTTP client for external calls */
  http: IHttpClient;
  
  /** Logger with plugin prefix */
  logger: ILogger;
  
  /** Tenant information */
  tenant: ITenantInfo;
  
  // ❌ REMOVED: getPlugin<T>() - direct coupling violates event-driven principle
  // ❌ REMOVED: services.resolve() - all communication via events only
}

/** Versioned Event - all events must include schema version */
interface IDomainEvent {
  type: 'billing:invoice.created@v1';  // Version in type
  payload: {
    invoiceId: string;
    amount: number;
  };
  metadata: {
    emittedBy: string;
    timestamp: number;
  };
}

/** Scoped EventBus - enforces declarations at runtime */
interface IScopedEventBus {
  /** Only allows emitting events declared in manifest.emits */
  publish(event: IDomainEvent): Promise<void>;
  
  /** Only allows subscribing to events declared in manifest.subscribes */
  on(eventType: string, handler: (event: IDomainEvent) => Promise<void>): void;
}
```

### Module Dependency Example (Event-Driven)

> **CRITICAL:** Modules communicate ONLY via events. No direct API calls.

```typescript
// Event schemas defined in core-contracts/events/
// inventory.events.ts
interface StockDecrementedEventV1 {
  type: 'inventory:stock.decremented@v1';
  schemaVersion: '1';
  payload: { productId: string; amount: number; warehouseId: string; };
  metadata: { emittedBy: string; timestamp: number; };
}

// Inventory Plugin - declares what it emits
const inventoryPlugin: IPlugin = {
  pluginId: 'inventory',
  apiVersion: '1.0.0',
  name: 'Inventory Management',
  emits: ['inventory:stock.decremented@v1', 'inventory:stock.incremented@v1'],
  subscribes: [],
  
  setup: async (ctx) => {
    // Initialize inventory tables
  },
  
  // Handle events - but inventory doesn't subscribe to anything
  onEvent: async (event) => {
    // Event handlers for this plugin's own logic
  }
};

// POS Plugin - declares what it consumes
const posPlugin: IPlugin = {
  pluginId: 'pos',
  apiVersion: '1.0.0',
  name: 'Point of Sale',
  dependencies: [],  // Dependency via events, not imports
  subscribes: ['inventory:stock.decremented@v1'],
  
  // When sale completes, emit event (NOT direct call to inventory)
  processSale: async (ctx, sale) => {
    // Process payment...
    await ctx.events.publish({
      type: 'inventory:stock.decremented@v1',
      schemaVersion: '1',
      payload: {
        productId: sale.productId,
        amount: sale.quantity,
        warehouseId: sale.warehouseId
      },
      metadata: {
        emittedBy: 'pos',
        timestamp: Date.now()
      }
    });
  }
};

// ❌ WRONG - This would violate event-driven principle:
// await ctx.getPlugin('inventory').decrementStock(...)  // NOT ALLOWED
```

### Plugin Manager (Built into Generated Apps)

| Method | Description |
|--------|-------------|
| `install(plugin)` | Add plugin to app, run setup, execute migrations |
| `activate(pluginId)` | Enable plugin, subscribe to events |
| `deactivate(pluginId)` | Disable plugin, unsubscribe from events |
| `uninstall(pluginId)` | Remove plugin, run teardown, optionally delete data |
| `getPlugin(pluginId)` | Get plugin instance by ID |
| `listPlugins()` | List all installed plugins with status |

---

## Factory Module System (Scaffold Generators)

The App Factory Platform uses its own module system for scaffold generators:

| Generator | Description | Output |
|-----------|-------------|--------|
| **SaaS Generator** | Full-stack T3/Next.js with Auth, DB, API | CRUD scaffolding |
| **Financial Generator** | Accounting, AP/AR, Invoicing modules | Double-entry ledger |
| **AI/RAG Generator** | Qdrant + LLM integration | RAG pipeline |
| **Custom Generator** | User-defined templates | Flexible |

### Phase 2.6 — Custom Generator Authoring (EXTENSIBILITY)

**The problem:** The plan lists "Custom Generator" as "User-defined templates | Flexible" but never specifies how users actually build custom generators.

**The solution:** A complete authoring workflow for third-party generators:

```typescript
// kilo/pipeline/src/generators/custom/CustomGenerator.ts

/**
 * Custom Generator — User-authored scaffold generator.
 * Implements the ModuleGenerator interface for factory integration.
 */
export class CustomGenerator implements ModuleGenerator {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly domain: string;  // e.g., "legal", "healthcare", "real-estate"
  
  constructor(
    public readonly config: CustomGeneratorConfig
  ) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.domain = config.domain;
  }
  
  async generate(input: ScaffoldInput, api: GeneratorAPI): Promise<ArtifactBundle> {
    // 1. Read user's blueprint/requirements
    const blueprint = await input.read();
    
    // 2. Copy base templates
    const files = await api.copyTemplates(this.config.templateDir, input.appName);
    
    // 3. Apply custom logic (API calls, business rules)
    files.push(...await this.applyBusinessLogic(blueprint, api));
    
    // 4. Generate module-knowledge.json artifact
    await api.writeModuleKnowledge({
      moduleName: this.id,
      domain: this.domain,
      entities: blueprint.entities,
      emittedEvents: blueprint.events,
    });
    
    return { files, metadata: { generator: 'custom', domain: this.domain } };
  }
  
  validate(bundle: ArtifactBundle): ValidationResult {
    // Custom validation rules
    return { valid: true };
  }
}
```

**CLI Command for Creating Custom Generators:**

```bash
# Create a new custom generator
kilo generator create legal-case-management \
  --domain legal \
  --description "Legal case management system" \
  --templates ./templates/legal-case

# This creates:
# generators/custom/legal-case-management/
# ├── index.ts          # Generator implementation
# ├── templates/       # Mustache/EJS templates
# ├── schema/          # Prisma schema fragments
# ├── invariants.yaml  # Custom validation rules
# └── package.json
```

**Generator Registry:**

```typescript
// kilo/pipeline/src/generators/registry.ts

interface GeneratorRegistry {
  register(generator: ModuleGenerator): void;
  get(id: string): ModuleGenerator;
  list(): ModuleGenerator[];
  listByDomain(domain: string): ModuleGenerator[];
}

// Built-in generators are pre-registered
const registry = new GeneratorRegistry()
  .register(new SaaSGenerator())
  .register(new FinancialGenerator())
  .register(new AIRAGGenerator());

// Custom generators loaded from generators/custom/
for (const custom of await loadCustomGenerators('./generators/custom')) {
  registry.register(custom);
}
```

**What users get with Custom Generator:**

| Feature | Description |
|---------|-------------|
| **Template Engine** | Mustache/EJS templates with blueprint variables |
| **GeneratorAPI** | Same API as built-in generators (copyTemplates, writeModuleKnowledge, etc.) |
| **Validation** | Custom invariants via `invariants.yaml` |
| **Domain Events** | Emit/consume events through factory event bus |
| **Schema Fragments** | Prisma schema fragments merged by SchemaMerger |
| **Distribution** | Publish to npm registry or local path |

**Example Custom Generator: Legal Case Management:**

```typescript
// generators/custom/legal-case-management/index.ts
export class LegalCaseManagementGenerator implements ModuleGenerator {
  readonly id = 'legal-case';
  readonly domain = 'legal';
  
  async generate(input, api) {
    const blueprint = await input.read();
    
    // Copy legal templates
    const files = await api.copyTemplates('./templates/legal', input.appName);
    
    // Add case-specific entities
    files.push(...api.addEntity('Case', {
      fields: ['caseNumber', 'clientId', 'attorneyId', 'status', 'filedDate'],
      relations: ['Client', 'Attorney', 'Document']
    }));
    
    return { files };
  }
}
```

### Factory vs Generated App Architecture

| Aspect | Factory Platform | Generated Apps |
|--------|-----------------|----------------|
| **Purpose** | Generates applications | Runs end-user apps |
| **Plugin System** | Scaffold generators | Runtime plugins |
| **Extensibility** | Add new generators | Install app modules |
| **Updates** | Modify factory code | Redeploy or plugin update |

---

## Tenant Isolation & Portability

Multi-tenant apps generated by the factory implement strict isolation:

| Layer | Isolation Mechanism |
|-------|---------------------|
| **Database** | Schema-per-tenant or row-level TenantID |
| **API** | Tenant context middleware |
| **Storage** | Tenant-prefixed object paths |
| **Events** | Tenant-scoped event namespaces |
| **Config** | Tenant-specific settings |

### Portability Features

| Feature | Implementation |
|---------|----------------|
| **DB Export** | pg_dump with tenant filtering |
| **App Bundle** | Docker image + SQL dump + manifests |
| **Config Migration** | Environment-specific overrides |
| **CI/CD Templates** | GitHub Actions / Woodpecker pipelines |

---

## Domain Map

| Domain                          | Representative Apps                                | Primary Stack                    | DB Pattern                      | Key Complexity                                          |
| ------------------------------- | -------------------------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------- |
| **SaaS / CRUD**           | Project mgmt, CMS, booking, e-commerce, dashboards | T3, Next.js, SvelteKit, TanStack | Postgres + Prisma/Drizzle       | Row-level multi-tenancy                                 |
| **Accounting**            | General ledger, AP/AR, invoicing, reconciliation   | T3 or SvelteKit                  | Postgres NUMERIC, double-entry  | Closed periods, balanced entries, audit trail           |
| **ERP**                   | Procurement, inventory, HR, manufacturing          | TanStack or Ext JS               | Postgres schema-per-module      | Cross-module transactions, RBAC, approval chains        |
| **WMS**                   | Pick/pack, receiving, bin management, transfers    | SvelteKit                        | Postgres + Redis bin locks      | FIFO/FEFO, barcode, concurrency                         |
| **POS**                   | Retail, restaurant, kiosk                          | Next.js (PWA)                    | Postgres + Redis sessions       | Offline-capable, receipt printing, fiscal compliance    |
| **HR**                    | Employees, payroll, leave management               | T3 or SvelteKit                  | Postgres NUMERIC                | Payroll precision, leave balance integrity              |
| **AI / RAG**              | Document Q&A, knowledge base, semantic search      | T3 + Vercel AI SDK               | Qdrant + Postgres               | Tenant-isolated vectors, cost tracking, PII guards      |
| **AI Agent**              | Autonomous task execution, tool calling            | T3 + Vercel AI SDK               | Qdrant + Postgres               | Human-in-loop, max-step enforcement, tool safety        |
| **Multi-Module Platform** | ERP platform, SaaS suite, multi-tenant business OS | Module manifest + any stack      | Merged schema + workspace layer | Module loading, feature billing, workspace provisioning |

---

## Full System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  DEVELOPER / OPENCLAW / n8n                                                          │
│  "scaffold a T3 booking app" | "scaffold accounting erp" | "scaffold platform"       │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │
                          ┌────────────▼──────────────┐
                          │  OpenClaw  (18789)         │
                          │  · domain detection        │
                          │  · context enrichment      │
                          │  · invariant class         │
                          └────────────┬──────────────┘
                                       │
                          ┌────────────▼──────────────┐
                          │  kilo-pipeline  (3100)     │
                          │  · scaffold routing        │
                          │  · sandbox orchestration   │
                          │  · dep vulnerability scan  │
                          │  · gate enforcement        │
                          │  · memory writers          │
                          └─────────┬─────────────────┘
              ┌────────────────────┬┴──────────────────────┐
              ▼                    ▼                        ▼
       ┌────────────┐   ┌─────────────────┐   ┌───────────────────────┐
       │  Qdrant    │   │  Data Layer      │   │  Observability        │
       │  (memory)  │   │  Postgres 16     │   │  Loki · Promtail      │
       └────────────┘   │  + PgBouncer     │   │  Tempo · OTel         │
                        │  + pgaudit       │   │  Prometheus · Grafana │
                        │  + pgvector      │   │  Alertmanager         │
                        │  MongoDB 7       │   └───────────────────────┘
                        │  Redis 7 + BullMQ│
                        │  Ollama (local)  │
                        └─────────────────┘
                                       │
                          ┌────────────▼──────────────┐
                          │  Traefik                   │
                          │  · Security headers        │
                          │  · Rate limiting           │
                          │  · CSP / HSTS              │
                          │  · Auto TLS                │
                          └────────────┬──────────────┘
                                       │
                          ┌────────────▼──────────────┐
                          │  CI/CD                     │
                          │  Gitea + Woodpecker CI     │
                          │  · test → build → migrate  │
                          │  · → deploy                │
                          └───────────────────────────┘

AI PROVIDER ABSTRACTION:

Application code calls:
  context.ai.complete(prompt, options)
  context.ai.stream(prompt, options)
  context.ai.embed(text, options)
  context.ai.runAgent(tools, messages, options)

AIProviderFactory resolves to:
  CLAUDE      → AnthropicProvider   (claude-sonnet-4-6, claude-opus-4-6)
  OPENAI      → OpenAIProvider      (gpt-4o, gpt-4o-mini)
  OLLAMA      → OllamaProvider      (llama3.2, mistral, qwen2.5)
  OPENROUTER  → OpenRouterProvider  (any model via unified API)

Every call is:
  · Cost-tracked       (token in/out + $ per request → Prometheus)
  · Prompt-audited     (prompt hash + response hash → AuditLog)
  · Rate-limited       (per-tenant token budget enforced in Redis)
  · PII-guarded        (AI-001 invariant: no raw PII in prompt without scrub)
  · Timeout-safe       (30s default, configurable per operation type)

MULTI-MODULE PLATFORM:

┌─────────────────────────────────────────────────────────────────────┐
│  PLATFORM LAYER                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  WORKSPACE ORCHESTRATOR                                       │  │
│  │  ModuleLoader · ServiceRegistry · EventBus · SchemaMerger    │  │
│  │  WorkspaceProvisioner · FeatureProvider · PermissionService   │  │
│  │  DependencyGraph · AIProviderFactory · VectorStoreRouter      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ ┌───────┐ ┌─────────┐  │
│  │accounting│ │procurement │ │ inventory │ │  wms  │ │   pos   │  │
│  │IModule ✓ │ │IModule ✓   │ │IModule ✓  │ │IModule│ │IModule ✓│  │
│  └──────────┘ └────────────┘ └───────────┘ └───────┘ └─────────┘  │
└─────────────────────────────────────────────────────────────────────┘
        │ Workspace A         │ Workspace B        │ Workspace C
        │ accounting+billing  │ accounting+proc    │ full ERP suite
        │                     │ +inventory+wms     │ + analytics + AI
```

---

# PART A — SaaS / CRUD Foundation

---

## Phase 0 — Infrastructure Services (Week 1)

Add to `docker-compose.yml`:

```yaml
postgres:
  image: pgvector/pgvector:pg16   # pgvector build — replaces postgres:16-alpine
  container_name: postgres
  restart: unless-stopped
  networks: [homelab]
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./postgres/init:/docker-entrypoint-initdb.d:ro
  environment:
    POSTGRES_USER:     ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB:       homelab
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
    interval: 10s
    timeout: 5s
    retries: 5
  shm_size: '${HAL_POSTGRES_SHM_SIZE:-256m}'
  logging:
    driver: "json-file"
    options: { max-size: "10m", max-file: "3" }

mongodb:
  # MongoDB is included for MERN-stack scaffold support (mern template).
  # It is NOT used by the core platform — only by generated apps that specifically
  # require MongoDB (e.g., mern-ecommerce, mern-cms templates).
  # On N100 homelab, this consumes ~100MB idle. Remove if MERN is not needed.
  image: mongo:7
  container_name: mongodb
  restart: unless-stopped
  networks: [homelab]
  volumes: [mongo_data:/data/db]
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5
  logging:
    driver: "json-file"
    options: { max-size: "10m", max-file: "3" }

project-registry:
  build: ./project-registry
  container_name: project-registry
  restart: unless-stopped
  networks: [homelab]
  environment:
    DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/project_registry
    PORT: 4200
  depends_on:
    postgres: { condition: service_healthy }
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.registry.rule=Host(`registry.homelab.local`)"
    - "traefik.http.routers.registry.tls=true"
  logging:
    driver: "json-file"
    options: { max-size: "10m", max-file: "3" }

volumes:
  postgres_data:
  mongo_data:
  webapp_workspaces:
```

**New `.env` variables:**

```bash
# Postgres
POSTGRES_USER=homelab
POSTGRES_PASSWORD=<secret>
# MongoDB
MONGO_USER=homelab
MONGO_PASSWORD=<secret>
# Project Registry
PORT=4200
# Webapp sandbox
WEBAPP_SANDBOX_IMAGE=homelab/webapp-sandbox:latest
WEBAPP_SANDBOX_MEM_LIMIT=${HAL_SANDBOX_MEMORY:-2G}
WEBAPP_WORKSPACES_DIR=/var/kilo/workspaces
```

---

## Phase 1 — Enhanced SaaS Sandbox Image (Week 1)

**`kilo/sandbox/Dockerfile`:**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 make g++ libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    create-next-app@14 create-t3-app@7 create-svelte@6 \
    @tanstack/start@latest typescript@5 prisma@5 drizzle-kit@0.21 \
    vite@5 tailwindcss@3 prettier@3 eslint@9 tsx@4 nodemon@3 \
    dotenv-cli@7 @kilocode/cli concurrently@8

RUN groupadd -r kilo && useradd -r -g kilo -m kilo
RUN mkdir -p /workspace /checkpoint && chown kilo:kilo /workspace /checkpoint
USER kilo
WORKDIR /workspace
CMD ["sleep", "infinity"]
```

---

## Phase 2 — SaaS Scaffold Templates (Week 2)

Seven scaffold shell scripts under `kilo/scaffold/scripts/stacks/`.

**Master dispatcher (`scaffold.sh`):**

```bash
#!/usr/bin/env bash
set -euo pipefail
APP_NAME="$1"; STACK="$2"; DB="${3:-postgres}"; AUTH="${4:-nextauth}"; PORT="${5:-3000}"

case "$STACK" in
  nextjs-app) exec /scripts/stacks/nextjs-app.sh  "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  t3)         exec /scripts/stacks/t3.sh          "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  mern)       exec /scripts/stacks/mern.sh        "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  sveltekit)  exec /scripts/stacks/sveltekit.sh   "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  tanstack)   exec /scripts/stacks/tanstack.sh    "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  extjs)      exec /scripts/stacks/extjs.sh       "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  expo-web)   exec /scripts/stacks/expo-web.sh    "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  accounting) exec /scripts/financial/accounting.sh "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  erp)        exec /scripts/financial/erp.sh        "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  wms)        exec /scripts/financial/wms.sh        "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  pos)        exec /scripts/financial/pos.sh        "$APP_NAME" "$DB" "$AUTH" "$PORT" ;;
  platform)   exec /scripts/platform/platform.sh    "$APP_NAME" "$@"                 ;;
  ai-rag)       exec /scripts/ai/ai-rag.sh       "$APP_NAME" "$AI_PROVIDER" "$@" ;;
  ai-enhanced)  exec /scripts/ai/ai-enhanced.sh  "$APP_NAME" "$BASE_STACK"  "$@" ;;
  ai-agent)     exec /scripts/ai/ai-agent.sh     "$APP_NAME" "$AI_PROVIDER" "$@" ;;
  ai-financial) exec /scripts/ai/ai-financial.sh "$APP_NAME" "$@"               ;;
  *) echo "Unknown stack: $STACK"; exit 1 ;;
esac
```

**Stack-specific patterns:**

| Stack          | Framework                  | ORM       | Auth           | Notes                                                             |
| -------------- | -------------------------- | --------- | -------------- | ----------------------------------------------------------------- |
| `t3`         | Next.js + tRPC v11         | Prisma    | Auth.js        | `protectedProcedure` for auth routes; singleton Prisma client   |
| `nextjs-app` | Next.js App Router         | Prisma    | Auth.js / Jose | `output: 'standalone'`; Server Components default               |
| `mern`       | Express API + React + Vite | Mongoose  | JWT            | Parameterised queries only; separate `api/` and `client/`     |
| `sveltekit`  | SvelteKit                  | Drizzle   | Auth.js        | `adapter-node`; DB only in `+page.server.ts` / `+server.ts` |
| `tanstack`   | TanStack Start (Vinxi)     | Drizzle   | TanStack Auth  | `createServerFn` for data layer                                 |
| `extjs`      | @sencha/ext + Express      | pg driver | JWT            | Webpack +`@sencha/ext-webpack-plugin`                           |
| `expo-web`   | Expo web target            | N/A       | Expo Auth      | Metro bundler; NativeWind; no native modules                      |

Each scaffold script emits: working app skeleton, `.env.local`, `Dockerfile`, `docker-compose.fragment.yml` with Traefik labels, `.kilo/stack-context.md`, and a `deploy/` directory with three primary export targets (Docker Compose, Kubernetes, Serverless).

### Phase 2.5 — Shell-to-TypeScript Migration Policy (CRITICAL)

**The problem:** The shell dispatcher works for 5 generators but becomes unmaintainable at 100+.

**The solution:** All NEW generators MUST be written as TypeScript `ModuleGenerator` classes from day one. Shell scripts are legacy only.

```typescript
// kilo/pipeline/src/generators/ModuleGenerator.ts
/**
 * ModuleGenerator — Typed scaffold generator interface.
 * All new generators implement this interface.
 */
export interface ModuleGenerator {
  readonly id: string;
  readonly name: string;
  readonly stack: string;
  
  generate(input: ScaffoldInput, api: GeneratorAPI): Promise<ArtifactBundle>;
  validate(bundle: ArtifactBundle): ValidationResult;
}

// Example: t3 generator as TypeScript (not shell)
export class T3ModuleGenerator implements ModuleGenerator {
  readonly id = 't3';
  readonly name = 'T3 Stack Generator';
  readonly stack = 'nextjs';
  
  async generate(input: ScaffoldInput, api: GeneratorAPI): Promise<ArtifactBundle> {
    const files = await api.copyTemplate('t3-base', input.appName);
    files.push(...await api.addPrisma(input));
    files.push(...await api.addAuth(input));
    return { files, metadata: { stack: 't3' } };
  }
  
  validate(bundle: ArtifactBundle): ValidationResult {
    return { valid: true };
  }
}
```

**Migration Rules:**
1. Phase 2 implements `t3` and `sveltekit` as `ModuleGenerator` classes
2. Shell scripts remain ONLY for stacks not yet migrated
3. **No new generators are written as shell scripts**
4. Each migration removes one shell script and adds one TypeScript class
5. Cutover complete when shell dispatcher is empty

---

## Phase 3 — Project Registry Service (Week 2)

Express + Postgres API at `registry.homelab.local`.

**Schema (`001_init.sql`):**

```sql
CREATE TABLE apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  stack         TEXT NOT NULL,
  domain        TEXT NOT NULL DEFAULT 'saas',
  port          INTEGER,
  url           TEXT,
  db_name       TEXT,
  workspace_dir TEXT,
  status        TEXT NOT NULL DEFAULT 'scaffolding',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     UUID REFERENCES apps(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_app_events_app_id ON app_events(app_id);
CREATE INDEX idx_apps_domain ON apps(domain);
CREATE INDEX idx_apps_status ON apps(status);

-- FIXED: Port allocation table
CREATE TABLE port_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     UUID REFERENCES apps(id) ON DELETE CASCADE,
  port       INTEGER NOT NULL UNIQUE,
  protocol   TEXT NOT NULL DEFAULT 'http',  -- http, https, ws, wss
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX idx_port_allocations_app_id ON port_allocations(app_id);
```

**API endpoints:**
- `GET /apps` — list all apps
- `POST /apps` — register new app
- `GET /apps/:name` — get app details
- `POST /apps/:name/events` — log event
- `GET /ports/next-available` — get next available port (FIXED)
- `GET /health` — health check

---

## Phase 4 — OpenClaw Stack Context Templates (Week 4)

Add to `openclaw/openclaw.json` under `stack_context_templates` for all seven SaaS stacks. Key per-stack invariants:

- **T3:** `protectedProcedure` for auth routes, Prisma singleton pattern, Zod on all inputs
- **Next.js App Router:** `output: 'standalone'`, Server Components default, DB only in Server Actions
- **SvelteKit:** `adapter-node`, DB only in `.server.ts` files, form actions for mutations
- **TanStack:** `createServerFn` for all data access, never fetch() in components
- **MERN:** Parameterised Mongoose queries only, separate `api/` and `client/` directories
- **Ext JS:** Server-side paging on all data stores, `@sencha/ext-webpack-plugin`
- **Expo Web:** No native modules, NativeWind for styling

---

## Phase 5 — SaaS Kilo Invariants (Week 4)

12 invariants in `kilo/.kilo/invariants.yaml`:

| ID      | Scope       | Severity | Description                                    |
| ------- | ----------- | -------- | ---------------------------------------------- |
| WEB-001 | All web     | T1       | No hardcoded secrets in source                 |
| WEB-002 | Next.js, T3 | T1       | `output: standalone` in next.config          |
| WEB-003 | T3          | T1       | Auth routes use `protectedProcedure`         |
| WEB-004 | All web     | T1       | No SQL string interpolation                    |
| WEB-005 | All web     | T1       | All user input validated with Zod              |
| WEB-006 | SvelteKit   | T1       | DB access only in `.server.ts` files         |
| WEB-007 | All web     | T2       | Health check endpoint exists                   |
| WEB-008 | All web     | T2       | SIGTERM graceful shutdown handler              |
| WEB-009 | MERN        | T1       | No template strings in Mongoose queries        |
| WEB-010 | Ext JS      | T2       | Server-side paging on all data stores          |
| WEB-011 | All web     | T2       | No `process.exit()` outside shutdown handler |
| WEB-012 | All web     | T2       | All env vars via Zod-validated config module   |

---

## Phase 6 — Database Provisioning (Week 5)

**`scripts/provision-webapp-db.sh`** — creates DB, enables `pg_stat_statements`, `pgcrypto`, and `vector` (pgvector).

---

## Phase 7 — Grafana Webapps Dashboard (Week 5)

`grafana/dashboards/webapps.json` — four rows: Registry overview, per-app health status, build activity (scaffold duration, gate pass/fail), database metrics (connections, query duration p95).

---

## Phase 8 — n8n Workflows (Week 6)

Three workflows: scaffold from webhook, daily health report, schema drift detection (runs `prisma migrate status` per app, alerts on pending migrations).

---

## Phase 9 — Prometheus Metrics (Week 7)

Four metrics in `kilo/pipeline/src/services/metrics.js`:

```js
kilo_scaffold_total              // Counter: by stack + status
kilo_scaffold_duration_seconds   // Histogram: by stack
kilo_webapp_invariant_violations_total  // Counter: by invariant_id + stack + severity
kilo_registered_apps_total       // Gauge: by stack + domain
```

---

# PART B — Financial Domain Layer

---

## Phase 10 — Financial Infrastructure Services (Week 1 addition)

Add to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  container_name: redis
  restart: unless-stopped
  networks: [homelab]
  volumes: [redis_data:/data]
  command: >
    redis-server --appendonly yes --appendfsync everysec
    --maxmemory 256mb --maxmemory-policy allkeys-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5

report-engine:
  build: ./report-engine
  container_name: report-engine
  restart: unless-stopped
  networks: [homelab]
  volumes: [report_output:/reports]
  environment:
    - REDIS_URL=${REDIS_URL}
    - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
  depends_on:
    postgres: { condition: service_healthy }
    redis:    { condition: service_healthy }
  shm_size: '${HAL_POSTGRES_SHM_SIZE:-256m}'

volumes:
  redis_data:
  financial_wal_archive:
  report_output:
```

**New `.env` variables:**

```bash
REDIS_URL=redis://redis:6379
FIN_SANDBOX_IMAGE=homelab/financial-sandbox:latest
FIN_SANDBOX_MEM_LIMIT=${HAL_SANDBOX_MEMORY:-2G}
FIN_WORKSPACES_DIR=/var/kilo/financial
REPORT_OUTPUT_DIR=/var/kilo/reports
DECIMAL_PRECISION=10
CURRENCY_DEFAULT=USD
FISCAL_YEAR_START_MONTH=1
```

---

## Phase 11 — Financial Sandbox Image (Week 2)

**`kilo/sandbox-financial/Dockerfile`:**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 make g++ libpq-dev \
    chromium fonts-liberation zbar-tools \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g \
    create-next-app@14 create-t3-app@7 create-svelte@6 \
    @tanstack/start@latest typescript@5 prisma@5 drizzle-kit@0.21 \
    vite@5 tailwindcss@3 prettier@3 eslint@9 tsx@4 nodemon@3 \
    dotenv-cli@7 @kilocode/cli concurrently@8

RUN groupadd -r kilo && useradd -r -g kilo -m kilo
RUN mkdir -p /workspace /checkpoint /reports && \
    chown kilo:kilo /workspace /checkpoint /reports
USER kilo
WORKDIR /workspace
CMD ["sleep", "infinity"]
```

Adds over the SaaS sandbox: **Chromium** (Puppeteer PDF), **zbar-tools** (WMS barcode scanning). Financial npm packages installed per-scaffold: `decimal.js`, `dinero.js`, `puppeteer`, `@react-pdf/renderer`, `xlsx`, `exceljs`, `bullmq`, `ioredis`, `date-fns`.

---

## Phase 12 — Financial Scaffold Templates (Week 3–4)

### Phase 12.1 — Shared Financial Base Layer (`financial/common/base.sh`)

Writes three foundational utilities into `src/lib/financial/` of every financial app:

**`money.ts`** — precision arithmetic:

```typescript
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type Money = { amount: Decimal; currency: string; };

// Throws if passed a JS number — forces raw string from DB NUMERIC column
export function parseMoney(value: string, currency: string): Money {
  return { amount: new Decimal(value), currency };
}

// Throws if debits ≠ credits — called before every JournalEntry POST
export function assertBalanced(debits: Money[], credits: Money[]): void {
  const d = debits.reduce((a, m) => a.plus(m.amount), new Decimal(0));
  const c = credits.reduce((a, m) => a.plus(m.amount), new Decimal(0));
  if (!d.equals(c))
    throw new Error(`Unbalanced entry: debits=${d.toFixed(4)} credits=${c.toFixed(4)}`);
}

export function formatMoney(m: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: m.currency,
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(m.amount.toNumber());
}
```

**`periodGuard.ts`** — closed fiscal period enforcement:

```typescript
export class PeriodLockedError extends Error {
  constructor(periodName: string) {
    super(`Fiscal period "${periodName}" is locked and cannot be modified.`);
  }
}

export async function checkPeriodOpen(
  tenantId: string, date: Date, db: PrismaClient
): Promise<void> {
  const locked = await db.fiscalPeriod.findFirst({
    where: { tenantId, startDate: { lte: date }, endDate: { gte: date }, isLocked: true }
  });
  if (locked) throw new PeriodLockedError(locked.name);
}
```

**`auditLog.ts`** — application-level audit:

```typescript
type AuditAction = 'CREATE'|'UPDATE'|'DELETE'|'LOCK'|'UNLOCK'|'POST'|'REVERSE';

export async function writeAuditLog(db: PrismaClient, params: {
  tenantId: string; userId: string; action: AuditAction;
  tableName: string; recordId: string;
  before?: Record<string,unknown>; after?: Record<string,unknown>;
}): Promise<void> {
  await db.auditLog.create({ data: params });
}
```

**Base Prisma schema** appended to every financial app:

```prisma
model Tenant {
  id                   String         @id @default(uuid())
  name                 String
  currency             String         @default("USD")
  timezone             String         @default("UTC")
  fiscalYearStartMonth Int            @default(1)
  isActive             Boolean        @default(true)
  createdAt            DateTime       @default(now())
  fiscalPeriods        FiscalPeriod[]
  auditLogs            AuditLog[]
}

model FiscalPeriod {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  name      String
  startDate DateTime
  endDate   DateTime
  isLocked  Boolean  @default(false)
  lockedAt  DateTime?
  lockedBy  String?
  createdAt DateTime @default(now())
  @@index([tenantId, startDate, endDate])
}

model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  userId    String
  action    String
  tableName String
  recordId  String
  before    Json?
  after     Json?
  ipAddress String?
  userAgent String?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  @@index([tenantId, tableName, recordId])
  @@index([tenantId, createdAt])
}
```

### Phase 12.2 — Accounting Scaffold (`financial/accounting.sh`)

Runs T3, Next.js, or SvelteKit framework scaffold first, then applies base layer, then appends:

```prisma
// All monetary fields: Decimal @db.Decimal(19,4) — NEVER Float

model Account {
  id            String        @id @default(uuid())
  tenantId      String
  code          String
  name          String
  type          AccountType
  parentId      String?
  parent        Account?      @relation("AccountHierarchy", fields: [parentId], references: [id])
  children      Account[]     @relation("AccountHierarchy")
  normalBalance NormalBalance
  isActive      Boolean       @default(true)
  journalLines  JournalLine[]
  @@unique([tenantId, code])
  @@index([tenantId, type])
}

enum AccountType { ASSET LIABILITY EQUITY REVENUE EXPENSE
                  CONTRA_ASSET CONTRA_LIABILITY CONTRA_EQUITY
                  CONTRA_REVENUE CONTRA_EXPENSE }
enum NormalBalance { DEBIT CREDIT }

model JournalEntry {
  id           String        @id @default(uuid())
  tenantId     String
  reference    String        // "JE-2026-0001"
  description  String
  postingDate  DateTime
  periodId     String
  status       JournalStatus @default(DRAFT)
  postedAt     DateTime?
  postedBy     String?
  reversedById String?
  createdBy    String
  createdAt    DateTime      @default(now())
  deletedAt    DateTime?
  lines        JournalLine[]
  @@index([tenantId, postingDate])
  @@index([tenantId, status])
}

enum JournalStatus { DRAFT POSTED REVERSED }

model JournalLine {
  id             String       @id @default(uuid())
  journalEntryId String
  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id])
  accountId      String
  account        Account      @relation(fields: [accountId], references: [id])
  debit          Decimal      @default(0) @db.Decimal(19, 4)
  credit         Decimal      @default(0) @db.Decimal(19, 4)
  description    String?
  costCenterId   String?
}

model TaxRate {
  id            String   @id @default(uuid())
  tenantId      String
  name          String
  code          String
  rate          Decimal  @db.Decimal(8, 6)   // 0.200000 = 20%
  taxType       TaxType
  isActive      Boolean  @default(true)
  effectiveFrom DateTime
  effectiveTo   DateTime?
  @@unique([tenantId, code])
}

enum TaxType { VAT GST SALES_TAX WITHHOLDING EXEMPT ZERO_RATED }

model Invoice {
  id             String        @id @default(uuid())
  tenantId       String
  type           InvoiceType
  number         String
  contactId      String
  issueDate      DateTime
  dueDate        DateTime
  currency       String        @default("USD")
  subtotal       Decimal       @db.Decimal(19, 4)
  taxAmount      Decimal       @db.Decimal(19, 4)
  total          Decimal       @db.Decimal(19, 4)
  amountDue      Decimal       @db.Decimal(19, 4)
  status         InvoiceStatus @default(DRAFT)
  journalEntryId String?
  createdBy      String
  createdAt      DateTime      @default(now())
  deletedAt      DateTime?
  lines          InvoiceLine[]
  @@unique([tenantId, type, number])
  @@index([tenantId, status, dueDate])
}

enum InvoiceType   { SALES PURCHASE CREDIT_NOTE DEBIT_NOTE }
enum InvoiceStatus { DRAFT SENT PARTIAL PAID OVERDUE VOID }

model InvoiceLine {
  id          String   @id @default(uuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id])
  description String
  quantity    Decimal  @db.Decimal(10, 4)
  unitPrice   Decimal  @db.Decimal(19, 4)
  discount    Decimal  @default(0) @db.Decimal(5, 4)
  taxRateId   String?
  lineTotal   Decimal  @db.Decimal(19, 4)
  accountId   String
}

model ExchangeRate {
  id           String   @id @default(uuid())
  fromCurrency String
  toCurrency   String
  rate         Decimal  @db.Decimal(16, 8)   // 8 dp for FX rates
  rateDate     DateTime
  source       String   @default("manual")
  createdAt    DateTime @default(now())
  @@unique([fromCurrency, toCurrency, rateDate])
  @@index([fromCurrency, toCurrency, rateDate])
}
```

### Phase 12.3 — ERP Scaffold (`financial/erp.sh`)

TanStack Start or Ext JS base. Appends: Contact (CUSTOMER/SUPPLIER/EMPLOYEE/BOTH), PurchaseOrder with approval chain, Product, StockLevel, StockMovement (links to JournalEntry), Employee + PayFrequency, and full RBAC (Role → Permission[module, action, scope] → UserRole). All monetary fields `@db.Decimal(19,4)`.

### Phase 12.4 — WMS Scaffold (`financial/wms.sh`)

SvelteKit base. Appends: Warehouse → Zone (RECEIVING/STORAGE/PICKING/SHIPPING/QUARANTINE/STAGING) → Bin (with unique barcode) → BinContent (quantity + lot number). PickingList + PickingLine with FIFO/FEFO bin suggestions. GoodsReceipt + GoodsReceiptLine reconciled against PO lines. `bwip-js` + `jsbarcode` installed. Redis bin-lock pattern wired.

### Phase 12.5 — POS Scaffold (`financial/pos.sh`)

Next.js App Router + `next-pwa`. Appends: POSTerminal, POSSession (opening/closing float), POSTransaction (receipt number sequential, no gaps), POSTransactionLine, POSPayment (split payment support). IndexedDB offline queue (`idb`). `node-thermal-printer` for ESC/POS receipt printing. `StaleWhileRevalidate` PWA cache for products and tax rates.

---

## Phase 13 — Financial-Grade Postgres Provisioning (Week 4)

`scripts/provision-financial-db.sh` — beyond standard provisioning:

```bash
# Enable pgaudit (immutable DB-level audit)
docker exec postgres psql -U "$PG_USER" -d "$APP_NAME" -c \
  "CREATE EXTENSION IF NOT EXISTS pgaudit;"

# Financial session defaults
docker exec postgres psql -U "$PG_USER" -d "$APP_NAME" -c \
  "ALTER DATABASE \"${APP_NAME}\" SET idle_in_transaction_session_timeout = '30s';
   ALTER DATABASE \"${APP_NAME}\" SET lock_timeout = '10s';
   ALTER DATABASE \"${APP_NAME}\" SET statement_timeout = '60s';"

# DDL event trigger — BLOCKS float column creation at the Postgres level
docker exec postgres psql -U "$PG_USER" -d "$APP_NAME" -c "
  CREATE OR REPLACE FUNCTION prevent_float_columns()
  RETURNS event_trigger LANGUAGE plpgsql AS \$\$
  DECLARE r RECORD;
  BEGIN
    FOR r IN SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
        AND data_type IN ('real','double precision','float4','float8')
    LOOP
      RAISE EXCEPTION 'Float column blocked in financial DB: %.% — use NUMERIC',
        r.table_name, r.column_name;
    END LOOP;
  END;\$\$;
  CREATE EVENT TRIGGER prevent_float_columns
    ON ddl_command_end WHEN TAG IN ('CREATE TABLE','ALTER TABLE')
    EXECUTE FUNCTION prevent_float_columns();"

# ERP: create module schemas
for module in accounting procurement inventory hr manufacturing; do
  docker exec postgres psql -U "$PG_USER" -d "$APP_NAME" -c \
    "CREATE SCHEMA IF NOT EXISTS ${module};"
done
```

---

## Phase 14 — Financial Kilo Invariants (Week 5)

18 invariants across 5 financial domains:

| ID      | Domain        | Severity | Description                                                                 |
| ------- | ------------- | -------- | --------------------------------------------------------------------------- |
| FIN-001 | All financial | T1       | No JS float for monetary values —`decimal.js` only                       |
| FIN-002 | All financial | T1       | No Prisma `Float` type in financial schemas                               |
| FIN-003 | All financial | T1       | Decimal serialised as string in API responses                               |
| FIN-004 | All financial | T1       | `writeAuditLog` in every financial mutation file                          |
| FIN-005 | All financial | T1       | `checkPeriodOpen` before every financial mutation                         |
| FIN-006 | All financial | T1       | No hard deletes — soft delete only (`deletedAt`)                         |
| ACC-001 | Accounting    | T1       | `assertBalanced()` before any POSTED status change                        |
| ACC-002 | Accounting    | T1       | POSTED journal entries immutable — reversal only                           |
| ACC-003 | Accounting    | T2       | Account codes never updated once used in JournalLine                        |
| ERP-001 | ERP           | T1       | `hasPermission(userId, module, action)` server-side before every mutation |
| ERP-002 | ERP           | T1       | Every `StockMovement` create links to a `journalEntryId`                |
| ERP-003 | ERP           | T1       | PO approval requires permission +`approvedBy !== createdBy`               |
| WMS-001 | WMS           | T1       | Bin content quantities never negative without flag                          |
| WMS-002 | WMS           | T2       | FIFO/FEFO picking order enforced (oldest lot/expiry first)                  |
| WMS-003 | WMS           | T1       | Redis `bin-lock:{binId}` acquired before every BinContent mutation        |
| POS-001 | POS           | T1       | Every `COMPLETED` POSTransaction creates a JournalEntry                   |
| POS-002 | POS           | T1       | Payment total equals transaction total before COMPLETED                     |
| POS-003 | POS           | T1       | Tax computed server-side only — never in React components                  |
| POS-004 | POS           | T2       | Offline sync detects and rejects duplicate receipt numbers                  |

---

## Phase 15 — OpenClaw Financial Context Templates (Week 5)

Four new `stack_context_templates` in `openclaw/openclaw.json`: `accounting`, `erp`, `wms`, `pos`. Each specifies: stack, precision rules, model names, mandatory utility calls, background job patterns, and cross-module event patterns. Nine new `always_delegate_to_kilo` rules.

---

## Phase 16 — Financial Reporting Layer (Week 6)

`report-engine` service processes BullMQ `report-queue` jobs via Puppeteer (PDF) and ExcelJS (Excel):

| Report                   | Format      | Trigger                  |
| ------------------------ | ----------- | ------------------------ |
| Trial Balance            | PDF + Excel | Period close / on demand |
| Profit & Loss Statement  | PDF + Excel | Period close / on demand |
| Balance Sheet            | PDF + Excel | Period close / on demand |
| Aged Receivables         | PDF + Excel | Daily scheduled          |
| Aged Payables            | PDF + Excel | Daily scheduled          |
| VAT / GST Return         | PDF         | Quarterly                |
| Stock Valuation          | Excel       | On demand                |
| POS Daily Reconciliation | PDF         | End of day (automated)   |
| Picking Performance      | Excel       | Weekly                   |

---

## Phase 17 — Financial Prometheus Metrics (Week 6)

```js
kilo_financial_scaffold_total              // Counter: by domain + status
kilo_financial_invariant_violations_total  // Counter: by invariant_id + domain + severity
kilo_journal_balance_checks_total          // Counter: by result (balanced|unbalanced|error)
kilo_float_type_violations_total           // Counter: by app_name + domain
```

---

# PART C — Production Hardening

---

## Phase 18 — Security Hardening Layer (Week 3 addition)

### Phase 18.1 — Traefik Security Headers + Rate Limiting

Add to `traefik/dynamic.yaml`:

```yaml
http:
  middlewares:
    security-headers:
      headers:
        # CSP nonces are implemented at the APPLICATION middleware level (Phase 18.3).
        # Traefik CANNOT generate dynamic per-request nonces.
        # This config delegates CSP to the app - remove any static CSP here.
        referrerPolicy: strict-origin-when-cross-origin
        xContentTypeOptions: nosniff
        xFrameOptions: DENY
        strictTransportSecurity: "max-age=31536000; includeSubDomains"
        permissionsPolicy: "camera=(), microphone=(), geolocation=()"
        customResponseHeaders:
          X-Powered-By: ""
          Server: ""

    rate-limit-api:
      rateLimit:
        average: 100
        burst: 50
        period: 1m
        sourceCriterion:
          ipStrategy: { depth: 1 }

    rate-limit-auth:
      rateLimit:
        average: 10
        burst: 5
        period: 1m

    rate-limit-financial:
      rateLimit:
        average: 200
        burst: 100
        period: 1m
```

### Phase 18.2 — Input Sanitisation Utility

Every scaffold writes `src/lib/sanitise.ts` using `isomorphic-dompurify`:

```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitiseHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b','i','em','strong','p','br','ul','ol','li'],
    ALLOWED_ATTR: [],
  });
}

export function sanitiseText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

export function sanitiseCurrencyCode(code: string): string {
  const upper = code.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(upper)) throw new Error(`Invalid currency code: ${code}`);
  return upper;
}
```

### Phase 18.3 — CSP Nonce Implementation (App-Level)

Traefik cannot generate dynamic per-request nonces. CSP nonces must be implemented at the application middleware level:

**Next.js App Router (Edge Runtime):**

```typescript
// src/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export function middleware(request: NextRequest) {
  const nonce = crypto.randomBytes(16).toString('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,   // nonce replaces 'unsafe-inline'
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' wss:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) }
  });
  
  response.headers.set('Content-Security-Policy', csp);
  // Pass nonce to layouts via request header (readable by Server Components)
  response.headers.set('x-nonce', nonce);

  return response;
}
```

```tsx
// src/app/layout.tsx — reads nonce injected by middleware
import { headers } from 'next/headers';

export default function RootLayout({ children }) {
  const nonce = headers().get('x-nonce') ?? '';

  return (
    <html>
      <head>
        {/* Nonce applied to inline scripts Nextjs injects */}
        <script nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**Express/MERN Stack:**

```typescript
// src/middleware/csp.ts
import crypto from 'crypto';

export function cspMiddleware(req: Request, res: Response, next: NextFunction) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce; // Available to all templates/responses

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "connect-src 'self' wss:",
    "frame-ancestors 'none'",
  ].join('; '));

  next();
}
// Register BEFORE any route handlers: app.use(cspMiddleware)
```

The Traefik static CSP can then be **removed entirely** since the app now sets it per-request with a real nonce. Traefik still handles the other static headers (`HSTS`, `X-Frame-Options`, etc.) as before.

### Phase 18.4 — Dependency Vulnerability Scanning

`runDependencyScan()` added to `executor.js` — runs `npm audit --audit-level=high` after every scaffold. High or critical vulnerabilities block the task and create a quarantine event. Results stored in project-registry event log.

### Phase 18.5 — Container Security

Both sandbox images gain in `docker-compose.yml`:

```yaml
security_opt: [no-new-privileges:true]
cap_drop: [ALL]
read_only: true
tmpfs:
  - /tmp:size=512m,mode=1777
  # Size should come from HAL_SANDBOX_TMP_SIZE (default: 4g) based on hardware profile
  - /workspace:size=${HAL_SANDBOX_TMP_SIZE:-4g}
```

### Phase 18.6 — Security Invariants

| ID      | Scope     | Severity | Description                                                                            |
| ------- | --------- | -------- | -------------------------------------------------------------------------------------- |
| SEC-001 | All       | T1       | `isomorphic-dompurify` installed and `sanitiseHtml/Text` used on user content      |
| SEC-002 | All       | T1       | No `eval()`, `new Function()`, or `dangerouslySetInnerHTML` without sanitisation |
| SEC-003 | All       | T1       | CORS config restricts allowed origins — no wildcard `*`                             |
| SEC-004 | All       | T1       | Auth tokens in `httpOnly` cookies — never `localStorage`                          |
| SEC-005 | Financial | T1       | API error responses never include stack traces                                         |

---

## Phase 19 — Testing Infrastructure (Week 4 addition)

### Phase 19.1 — Test scaffold base layer

Every scaffold installs: `vitest@1`, `@vitest/coverage-v8`, `@testing-library/react@14`, `supertest`, `@faker-js/faker`, `msw@2`.

**`vitest.config.ts`** with 80% coverage thresholds on branches, functions, lines, statements.

Two workspace modes: unit tests (against mocks, fast) and integration tests (against real test DB `{app}_test`, isolated process per file).

### Phase 19.2 — Financial Test Harness

Every financial scaffold writes four test files:

**`money.test.ts`** — the critical float trap test:

```typescript
it('avoids the classic float trap: 0.1 + 0.2 !== 0.3 in JS', () => {
  // JS: 0.1 + 0.2 = 0.30000000000000004 — WRONG for accounting
  const a = parseMoney('0.1', 'USD');
  const b = parseMoney('0.2', 'USD');
  const sum = addMoney(a, b);
  expect(sum.amount.toFixed(2)).toBe('0.30');  // Correct with decimal.js
});

it('assertBalanced throws for unbalanced entry', () => {
  const debits  = [parseMoney('100.00', 'USD')];
  const credits = [parseMoney('99.99', 'USD')];
  expect(() => assertBalanced(debits, credits)).toThrow('Unbalanced');
});
```

**`periodGuard.test.ts`** — locked period rejection. **`journalEntry.test.ts`** — double-entry validation + POSTED immutability. **`auditLog.test.ts`** — confirms every financial mutation writes an audit log entry.

### Phase 19.3 — Test Invariants

| ID       | Scope     | Severity | Description                                                       |
| -------- | --------- | -------- | ----------------------------------------------------------------- |
| TEST-001 | All       | T2       | Test suite passes with ≥80% line + function coverage             |
| TEST-002 | Financial | T1       | Financial precision tests pass (money, periodGuard, journalEntry) |
| TEST-003 | Financial | T1       | Audit log tests confirm every mutation is logged                  |

### Phase 19.4 — Factory Golden Output Tests

**Problem:** Module contract tests validate the module structure, but don't verify the scaffold scripts correctly inject all required code. If someone modifies `accounting.sh` and accidentally removes `assertBalanced()`, the module tests won't catch it.

**FIXED Solution:** Use structural tests instead of string diffing:

```typescript
// kilo/pipeline/tests/factory-golden.test.ts
import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('Factory Golden Output Tests', () => {
  const OUTPUT_DIR = '/tmp/factory-test';

  // Structural tests: verify invariants that matter
  it('accounting scaffold contains assertBalanced call', () => {
    const output = runScaffold('accounting', OUTPUT_DIR);
    const journalService = output.file('src/server/services/journalEntryService.ts');
    expect(journalService).toContain('assertBalanced(');
  });

  it('accounting scaffold has no Float columns in schema', () => {
    const schema = output.file('prisma/schema.prisma');
    // Financial modules must use Decimal, not Float
    expect(schema).not.toMatch(/\bFloat\b/);
  });

  it('accounting scaffold emits WORKSPACE_CREATED event', () => {
    const events = output.file('src/events/domainEvents.ts');
    expect(events).toContain('WORKSPACE_CREATED');
  });

  it('ai-rag scaffold includes tenantId filter', () => {
    const ragService = output.file('src/server/services/ragService.ts');
    expect(ragService).toMatch(/tenantId.*filter/i);
  });

  it('financial scaffold uses Decimal for money fields', () => {
    const schema = output.file('prisma/schema.prisma');
    expect(schema).toMatch(/Decimal/);
  });

  it('all scaffolds have valid package.json', () => {
    for (const scaffold of ['accounting', 'saas', 'ai-rag']) {
      const pkg = JSON.parse(output.file('package.json'));
      expect(pkg.name).toBeDefined();
      expect(pkg.dependencies).toBeDefined();
    }
  });
});
```

**Why Structural Tests Are Better:**
- Survive Prettier reformatting
- Test invariants that actually matter
- Readable failure messages
- No fragile file ordering dependencies

**CI Enforcement:**
- Every PR that modifies scaffold scripts runs golden output tests
- If output changes, the diff is shown and must be explicitly approved
- This ensures generated apps stay correct even as scaffold scripts evolve

---

### Phase 19.5 — Test Architecture: Unit / Integration / E2E Separation

Replace single vitest config with workspace separation:

```typescript
// vitest.config.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // ── UNIT: pure logic, no I/O, fastest ────────────────────────────────────
  {
    test: {
      name:       'unit',
      include:    ['src/**/*.unit.test.ts'],
      environment: 'node',
    }
  },

  // ── INTEGRATION: real DB, no external network ─────────────────────────────
  {
    test: {
      name:        'integration',
      include:     ['src/**/*.integration.test.ts'],
      environment: 'node',
      globalSetup:  ['./tests/setup/db-provision.ts'],
      teardown:     ['./tests/setup/db-teardown.ts'],
      pool:         'forks',
      poolOptions:  { forks: { singleFork: false } }
    }
  },

  // ── E2E: full stack including browser ────────────────────────────────────
  {
    test: {
      name:    'e2e',
      include: ['tests/e2e/**/*.test.ts'],
    }
  }
]);
```

**Test DB Provisioning** — worker-isolated databases:

```typescript
// tests/setup/db-provision.ts
import { execSync } from 'child_process';

export async function setup() {
  const workerId  = process.env.VITEST_WORKER_ID ?? '0';
  const dbName    = `${process.env.APP_NAME}_test_${workerId}`;
  const directUrl = process.env.TEST_POSTGRES_URL 
    ?? 'postgresql://postgres:postgres@localhost:5432';

  // Create isolated DB for this worker
  execSync(`psql ${directUrl}/postgres -c "CREATE DATABASE ${dbName}" 2>/dev/null || true`);

  // Run migrations against fresh DB
  process.env.DATABASE_URL = `${directUrl}/${dbName}`;
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });

  (global as any).__TEST_DB_NAME__ = dbName;
  (global as any).__TEST_DB_URL__  = `${directUrl}/${dbName}`;
}

export async function teardown() {
  const workerId  = process.env.VITEST_WORKER_ID ?? '0';
  const dbName    = `${process.env.APP_NAME}_test_${workerId}`;
  const directUrl = process.env.TEST_POSTGRES_URL 
    ?? 'postgresql://postgres:postgres@localhost:5432';
  execSync(`psql ${directUrl}/postgres -c "DROP DATABASE IF EXISTS ${dbName}"`);
}
```

**AI Mock Strategy** — MSW handlers for AI testing:

```typescript
// tests/mocks/ai.handlers.ts
import { http, HttpResponse } from 'msw';

export const mockAIResponse = (content: string) =>
  HttpResponse.json({
    id:      'mock-response-id',
    model:   'mock-model',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage:   { prompt_tokens: 100, completion_tokens: 50 }
  });

export const aiHandlers = [
  http.post('https://api.anthropic.com/v1/messages', () =>
    mockAIResponse('Mocked Anthropic response')),
  http.post('https://api.openai.com/v1/chat/completions', () =>
    mockAIResponse('Mocked OpenAI response')),
  http.post('http://ollama:11434/api/chat', () =>
    mockAIResponse('Mocked Ollama response')),
];

// For retry tests:
export const aiRateLimitHandler = http.post(
  'https://api.anthropic.com/v1/messages',
  () => HttpResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })
);

// For circuit breaker tests:
export const aiCircuitOpenHandler = http.post(
  'https://api.anthropic.com/v1/messages',
  () => HttpResponse.json({ error: 'service_unavailable' }, { status: 503 })
);

// Example test file showing MSW wiring:
// tests/integration/ai.retry.test.ts
```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { aiHandlers, aiRateLimitHandler, aiCircuitOpenHandler } from './mocks/aiHandlers';

// Test server instance - use unique port to avoid conflicts
const server = setupServer(...aiHandlers);

describe('AI Service Retry Logic', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should retry on rate limit and succeed', async () => {
    let callCount = 0;
    
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        callCount++;
        if (callCount < 3) {
          return HttpResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
        }
        return HttpResponse.json({
          id: 'msg_success',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Success after retry' }],
          model: 'claude-3-opus-20240229',
        });
      })
    );

    const result = await callAIServiceWithRetry('Test prompt');
    expect(callCount).toBe(3); // Initial + 2 retries
    expect(result).toContain('Success after retry');
  });

  it('should fail after max retries exceeded', async () => {
    server.use(aiRateLimitHandler);

    await expect(callAIServiceWithRetry('Test prompt')).rejects.toThrow(
      'AI service failed after 3 attempts: rate_limit_exceeded'
    );
  });

  it('should open circuit breaker after consecutive failures', async () => {
    server.use(aiCircuitOpenHandler);

    // First few calls fail, triggering circuit breaker
    for (let i = 0; i < 5; i++) {
      try {
        await callAIServiceWithRetry('Test prompt');
      } catch (e) {
        // Expected failures
      }
    }

    // Circuit should now be open - immediate failure without calling AI
    const startTime = Date.now();
    await expect(callAIServiceWithRetry('Test prompt')).rejects.toThrow(
      'Circuit breaker open'
    );
    const duration = Date.now() - startTime;
    
    // Should fail immediately (not wait for network timeout)
    expect(duration).toBeLessThan(100);
  });
});
```

**Key MSW patterns demonstrated:**
- `setupServer(...handlers)` for Node.js integration tests
- `server.listen({ onUnhandledRequest: 'error' })` to catch stray requests
- `server.resetHandlers()` in afterEach to isolate tests
- `server.use(...)` to override handlers per-test
- `server.close()` in afterAll to clean up

---

## Phase 20 — Full Observability Stack (Week 5 addition)

### Phase 20.1 — Loki + Promtail (log aggregation)

```yaml
loki:
  image: grafana/loki:2.9.3
  volumes: [loki_data:/loki, ./loki/loki-config.yaml:/etc/loki/local-config.yaml:ro]

promtail:
  image: grafana/promtail:2.9.3
  volumes:
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./loki/promtail-config.yaml:/etc/promtail/config.yml:ro
```

Promtail auto-discovers all Docker containers by label. Financial app logs tagged with `domain: financial` for 7-year retention override. All logs parsed as structured JSON.

### Phase 20.2 — Structured Logging

Every scaffold writes `src/lib/logger.ts` using `pino`:

```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Use array format for better performance and flexibility
  redact: [
    'password',
    'token',
    'secret',
    'creditCard',
    'cvv',
    'pin',
    'req.headers.authorization',
    'req.headers["x-api-key"]',
    'user.password',
    '*.password',
    '*.token',
    '*.secret',
  ],
});

// Financial context logger — pre-fills tenantId + userId on every line
export function financialLogger(tenantId: string, userId: string) {
  return logger.child({ tenantId, userId, domain: 'financial' });
}
```

**OBS-001 invariant:** No `console.log()` in production code — all logging via `logger.ts`.

### Phase 20.3 — OpenTelemetry Distributed Tracing

```yaml
otel-collector:
  image: otel/opentelemetry-collector-contrib:0.95.0
  ports: ["4317:4317", "4318:4318"]

tempo:
  image: grafana/tempo:2.4.0
  volumes: [tempo_data:/var/tempo, ./tempo/tempo-config.yaml:/etc/tempo.yaml:ro]
```

Every scaffold writes `src/lib/tracing.ts` using `@opentelemetry/sdk-node`. `PrismaInstrumentation` auto-instruments all DB queries — slow queries appear directly in Tempo traces.

### Phase 20.4 — Alertmanager

```yaml
alertmanager:
  image: prom/alertmanager:v0.26.0
  volumes: [./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro]
```

Alert routing: general → Ntfy, financial domain → Ntfy high-priority, critical → Ntfy urgent.

**Key alert rules (`prometheus/alerts.yaml`):**

```yaml
- alert: UnbalancedJournalEntries
  expr: increase(kilo_journal_balance_checks_total{result="unbalanced"}[1h]) > 0
  labels: { severity: critical, domain: financial }

- alert: FloatTypeViolation
  expr: increase(kilo_float_type_violations_total[24h]) > 0
  labels: { severity: critical, domain: financial }

- alert: BullMQDeadLetterGrowing
  expr: bullmq_dead_letter_queue_size > 10
  for: 15m
  labels: { severity: warning, domain: financial }

- alert: AuditLogGap
  expr: (time() - kilo_last_audit_log_timestamp) > 3600 and kilo_financial_mutations_total > 0
  labels: { severity: critical, domain: financial }
```

### Phase 20.5 — New Grafana Dashboards

Three new dashboards: `logs.json` (Loki queries, error stream, financial audit trail), `traces.json` (Tempo explorer, p50/p95/p99 per endpoint, slow query heatmap), `alerts.json` (alert history, MTTD/MTTR).

---

## Phase 21 — Data Resilience Layer (Week 6 addition)

### Phase 21.1 — PgBouncer Connection Pooler

```yaml
pgbouncer:
  image: bitnami/pgbouncer:1.22.1
  environment:
    POSTGRESQL_HOST:             postgres
    PGBOUNCER_POOL_MODE:         transaction   # Required for Prisma
    PGBOUNCER_MAX_CLIENT_CONN:   200
    PGBOUNCER_DEFAULT_POOL_SIZE: 10
    PGBOUNCER_RESERVE_POOL_SIZE: 5
```

All scaffold `DATABASE_URL` → `pgbouncer:5432`. Prisma schema gains `directUrl` for migrations (bypasses PgBouncer — required for DDL):

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // → pgbouncer:5432?pgbouncer=true (pooled)
  directUrl = env("DIRECT_DATABASE_URL") // → postgres:5432 (migrations only)
}
```

### Phase 21.1b — PgBouncer + Prisma: The Complete Guide

#### When to Use Which Connection String

```
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE_URL  →  pgbouncer:6432?pgbouncer=true                 │
│  Used for: ALL application runtime queries                       │
│  Why: PgBouncer recycles connections; your app gets a pool of   │
│       200 virtual connections mapped to ~10 real Postgres ones   │
│                                                                 │
│  DIRECT_DATABASE_URL  →  postgres:5432                          │
│  Used for: prisma migrate deploy/dev, prisma db push,           │
│            prisma db seed, any DDL                              │
│  Why: PgBouncer transaction mode drops session state between    │
│       statements. Migrations use advisory locks, SET commands,   │
│       and multi-statement transactions that REQUIRE a persistent │
│       session — they will silently corrupt or deadlock through    │
│       PgBouncer                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Operation | Connection to use | Variable |
|---|---|---|
| `prisma.$queryRaw`, `findMany`, `create`, etc. | PgBouncer | `DATABASE_URL` |
| `prisma migrate deploy` | Direct | `DIRECT_DATABASE_URL` |
| `prisma migrate dev` | Direct | `DIRECT_DATABASE_URL` |
| `prisma db seed` | Direct | `DIRECT_DATABASE_URL` |
| `prisma db push` | Direct | `DIRECT_DATABASE_URL` |
| Long-running `SELECT` / reports | Direct | `DIRECT_DATABASE_URL` |
| `LISTEN` / `NOTIFY` | Direct | `DIRECT_DATABASE_URL` |

#### PgBouncer `pool_mode` — The Full Decision

```yaml
# docker-compose.yml — annotated
pgbouncer:
  image: bitnami/pgbouncer:1.22.1
  environment:
    POSTGRESQL_HOST: postgres
    POSTGRESQL_PORT: 5432

    # ─── POOL MODE: transaction ──────────────────────────────────────────────
    # WHY transaction, not session:
    #   - Prisma holds connections only for the duration of each query/transaction
    #   - In session mode, each Prisma Client instance would monopolize a real
    #     Postgres connection even while idle — defeats the purpose of pooling
    #   - transaction mode recycles the real connection the moment the query commits
    #
    # WHAT BREAKS in transaction mode (you cannot use these):
    #   - SET / RESET commands (session-level settings like search_path)
    #   - LISTEN / NOTIFY
    #   - Prepared statements (Prisma disables these via ?pgbouncer=true)
    #   - Advisory locks (pg_advisory_lock) — use migrations direct URL instead
    #   - Temporary tables (session-scoped)
    #   - CURSOR outside a single transaction
    #
    # Prisma's ?pgbouncer=true query param disables prepared statements to make
    # Prisma safe in transaction mode. Without it, Prisma caches statement IDs
    # that become invalid when PgBouncer hands you a different backend connection.
    PGBOUNCER_POOL_MODE: transaction

    # Real Postgres connections kept open (tune to (max_connections - 10) / app_replicas)
    PGBOUNCER_DEFAULT_POOL_SIZE: 10

    # Virtual connections your app can request (can be large — they're cheap)
    PGBOUNCER_MAX_CLIENT_CONN: 200

    # Spare connections for traffic spikes — avoids queuing under burst load
    PGBOUNCER_RESERVE_POOL_SIZE: 5

    # How long a client waits before getting "connection pool full" error
    PGBOUNCER_POOL_TIMEOUT: 30
```

**The sizing math:**

```
max_connections in postgres.conf = DEFAULT_POOL_SIZE × app_replicas + overhead
                                  = 10 × 2 + 10 (for migrations/admin)
                                  = 30
```

If you scale to 4 app replicas without adjusting this, you silently exhaust Postgres connections. Add this to your `postgres` service:

```yaml
postgres:
  image: postgres:16-alpine
  command: postgres -c max_connections=50 -c shared_buffers=256MB
```

#### Making `?pgbouncer=true` a Enforced Contract

**Level 1 — Zod schema enforcement at startup:**

```typescript
// src/lib/env.ts — extend your existing schema

const envSchema = z.object({
  // ...
  DATABASE_URL: z.string().url().refine(
    (url) => {
      if (process.env.NODE_ENV === 'production') {
        return url.includes('pgbouncer=true');
      }
      return true;
    },
    {
      message: 'DATABASE_URL must include ?pgbouncer=true when pointing at PgBouncer.'
    }
  ),
  
  DIRECT_DATABASE_URL: z.string().url().refine(
    (url) => !url.includes('pgbouncer'),
    { message: 'DIRECT_DATABASE_URL must point directly at Postgres, not PgBouncer.' }
  ),
});
```

**Level 2 — Scaffold template (.env.example):**

```bash
# .env.example (generated by scaffold)

# ── DATABASE ─────────────────────────────────────────────────────────────
# APPLICATION queries → PgBouncer (transaction pool mode)
DATABASE_URL="postgresql://app:secret@pgbouncer:6432/appdb?pgbouncer=true"

# MIGRATIONS + DDL → Postgres directly (bypasses PgBouncer)
DIRECT_DATABASE_URL="postgresql://app:secret@postgres:5432/appdb"
```

**Level 3 — CI gate:**

```javascript
// scripts/check-db-config.js — runs in CI before build

const fs = require('fs');
const envExample = fs.readFileSync('.env.example', 'utf8');

const checks = [
  {
    test: envExample.includes('DATABASE_URL') && envExample.includes('pgbouncer=true'),
    error: 'DATABASE_URL in .env.example must include ?pgbouncer=true'
  },
  {
    test: envExample.includes('DIRECT_DATABASE_URL'),
    error: 'DIRECT_DATABASE_URL must be defined'
  }
];

const failures = checks.filter(c => !c.test);
if (failures.length > 0) {
  failures.forEach(f => console.error('❌', f.error));
  process.exit(1);
}
console.log('✓ DB connection config valid');
```

---

### Phase 21.2 — Automated Postgres Backup

```yaml
postgres-backup:
  image: prodrigestivill/postgres-backup-local:16
  environment:
    SCHEDULE:          "@daily"
    BACKUP_KEEP_DAYS:  7
    BACKUP_KEEP_WEEKS: 4
    BACKUP_KEEP_MONTHS: 3
```

Weekly n8n workflow: trigger backup → restore to temp container → run `prisma migrate status` → row count comparison → post result to Ntfy → tear down temp container.

### Phase 21.3 — Migration Safety Protocol

Every scaffold writes `scripts/migrate-deploy.sh`:

1. Run `prisma migrate status` — show pending count
2. Scan for `DROP TABLE` / `DROP COLUMN` / `ALTER...DROP` — require manual backup confirmation if found
3. Apply with `prisma migrate deploy` (no interactive prompts)

### Phase 21.4 — Soft Delete for Financial Records

Every financial scaffold writes `src/lib/financial/softDelete.ts` — Prisma middleware that:

- **Blocks** `delete()` on financial models (`JournalEntry`, `Invoice`, `PurchaseOrder`, `StockMovement`, `POSTransaction`, `AuditLog`) — throws with explanation
- **Converts** `deleteMany()` to soft delete (`data: { deletedAt: new Date() }`)
- **Filters** soft-deleted records from all `findFirst` / `findMany` / `findUnique` calls automatically

---

## Phase 22 — Developer Experience (Week 6 addition)

### Phase 22.1 — Seed Data Scripts

Every scaffold writes `prisma/seed.ts`. Financial apps seed: complete standard chart of accounts (assets 1000–1999, liabilities 2000–2999, equity 3000–3999, revenue 4000–4999, expenses 5000–5999), two fiscal periods (one open, one locked), five balanced sample journal entries, standard tax rates.

Guard: `if (process.env.NODE_ENV === 'production') throw new Error('Seed cannot run in production')`

### Phase 22.2 — API Documentation

- T3 apps: `trpc-panel` at `/api/panel` (development only)
- Express/MERN: Swagger UI via `swagger-ui-express` + `swagger-jsdoc`
- SvelteKit: browsable schema data dictionary in `dev-tools` route

### Phase 22.3 — VS Code Workspace Settings

Every scaffold writes `.vscode/settings.json` (format on save, ESLint fix on save, TypeScript relative imports) and `.vscode/extensions.json` (Prisma, ESLint, Prettier, Tailwind, REST Client).

### Phase 22.4 — Zod-Validated Environment Config

Every scaffold writes `src/lib/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:     z.enum(['development','test','production']).default('development'),
  DATABASE_URL: z.string().url(),
  APP_NAME:     z.string().min(1),
  PORT:         z.coerce.number().default(3000),
  LOG_LEVEL:    z.enum(['trace','debug','info','warn','error']).default('info'),
});

// Throws at startup with clear message if any required var is missing
export const env = envSchema.parse(process.env);
export const isDev  = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
```

---

## Phase 23 — Financial Correctness Hardening (Week 7)

### Phase 23.1 — Multi-Currency Exchange Rate Pattern

Every financial scaffold writes `src/lib/financial/exchangeRate.ts`:

```typescript
// RULE: historical calculations always use DB snapshot rate, never live API rate
// (prevents historical reports from changing when exchange rates move)
export async function convertCurrency(
  amount: Decimal, fromCurrency: string, toCurrency: string,
  rateDate: Date, db: PrismaClient
): Promise<Decimal> {
  if (fromCurrency === toCurrency) return amount;
  const rate = await db.exchangeRate.findFirst({
    where: { fromCurrency, toCurrency, rateDate: { lte: rateDate } },
    orderBy: { rateDate: 'desc' },
  });
  if (!rate) throw new Error(`No exchange rate: ${fromCurrency}→${toCurrency} as of ${rateDate}`);
  return amount.mul(new Decimal(rate.rate.toString()));
}
```

n8n workflow fetches daily rates at 18:00 → writes to `ExchangeRate` table.

### Phase 23.2 — Invoice/Receipt Sequence Gap Detection

BullMQ job runs daily: extracts numeric suffixes from all invoice numbers, sorts, checks for gaps, writes gap report to `AuditLog`, fires Prometheus metric + alert if gaps found. Gaps may indicate deleted records or fraud.

### Phase 23.3 — Currency Rounding Mode Documentation

Every financial app's `.kilo/stack-context.md` documents: `ROUND_HALF_UP` default, EU VAT `ROUND_HALF_EVEN`, CHF rounds to 0.05, JPY zero decimal places, crypto 8 decimal places. Never mix rounding modes within a single journal entry.

### Phase 23.4 — BullMQ Dead-Letter Queue Handling

> **NOTE:** For the canonical DLQ implementation with idempotency and dead letter handling, see **Phase 29.1** (Event Bus Delivery Guarantees). The pattern below is a simplified fallback for BullMQ workers that don't use the event bus.

Every financial BullMQ worker configured with:

```typescript
// HAL-aware concurrency helper
function getWorkerConcurrency(type: 'financial' | 'ai' | 'general'): number {
  const base = parseInt(process.env.HAL_MAX_CONCURRENCY ?? '1', 10);
  return type === 'financial' ? base          // correctness over speed
       : type === 'ai'        ? base * 2      // I/O-bound
       : base;
}

// Worker configuration
concurrency: getWorkerConcurrency('financial'),
removeOnComplete: { count: 1000, age: 86400 },
removeOnFail: { count: 5000 },            // Keep failed jobs for audit
```

> **DEPRECATED:** The `financial-dead-letter` queue approach below is superseded by Phase 29.1's `worker.on('failed')` handler with `domain_event_delivery` status tracking. For new implementations, use Phase 29.1's pattern.

### Phase 23.5 — Graceful Shutdown for Financial Workers

Every financial scaffold writes `src/lib/gracefulShutdown.ts`:

```typescript
process.on('SIGTERM', async () => {
  server.close();                                      // Stop accepting requests
  await Promise.all(bullWorkers.map(w => w.close())); // Drain in-flight jobs (max 30s)
  await prisma.$disconnect();                          // Close DB connections
  process.exit(0);
});
```

---

## Phase 24 — Production Operations (Week 7 addition)

### Phase 24.1 — Standardised Health Checks

Every scaffold writes `/health/live` (is the process alive?) and `/health/ready` (DB check + Redis check):

```typescript
app.get('/health/ready', async (req, res) => {
  const checks: Record<string, 'ok'|'down'> = {};
  try { await db.$queryRaw`SELECT 1`; checks.postgres = 'ok'; }
  catch { checks.postgres = 'down'; }
  if (redisClient) {
    try { await redisClient.ping(); checks.redis = 'ok'; }
    catch { checks.redis = 'down'; }
  }
  const allOk = Object.values(checks).every(s => s === 'ok');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'degraded', checks,
    version: process.env.APP_VERSION, timestamp: new Date().toISOString() });
});
```

Traefik uses `/health/ready` — degraded apps removed from routing immediately.

### Phase 24.2 — Memory Leak Detection

Every financial scaffold writes `src/lib/memoryWatch.ts` — v8 heap monitoring at 60s intervals. Uses HAL-aware thresholds proportional to sandbox memory allocation:

```typescript
const TOTAL_MB = parseInt(process.env.HAL_SANDBOX_MEMORY_MB ?? '2048', 10);
const WARN_THRESHOLD_MB = Math.floor(TOTAL_MB * 0.65);     // 65% of sandbox memory
const CRITICAL_THRESHOLD_MB = Math.floor(TOTAL_MB * 0.85); // 85% of sandbox memory

// Warns at 65% of HAL_SANDBOX_MEMORY, critical at 85%. Prometheus metric `heap_usage_mb` set on each interval.
```

### Phase 24.3 — App Versioning

Every scaffold emits `GET /api/version` with `appName`, `version`, `buildDate`, `gitSha`, `nodeVersion`. Dockerfile ARGs inject `APP_VERSION`, `BUILD_DATE`, `GIT_SHA` at build time.

---

## Phase 25 — Deployment Pipeline (Week 8)

### Phase 25.1 — Gitea + Woodpecker CI

```yaml
gitea:
  image: gitea/gitea:1.21
  labels:
    - "traefik.http.routers.gitea.rule=Host(`gitea.homelab.local`)"

woodpecker-server:
  image: woodpeckerci/woodpecker-server:v2.3.0
  environment:
    WOODPECKER_GITEA: "true"
    WOODPECKER_MAX_PROCS: ${HAL_MAX_CONCURRENCY:-1}   # Max concurrent pipeline steps

woodpecker-agent:
  image: woodpeckerci/woodpecker-agent:v2.3.0
  volumes: [/var/run/docker.sock:/var/run/docker.sock:ro]
```

### Phase 25.2 — Standard CI Pipeline

Every scaffold writes `.woodpecker.yaml`:

```yaml
steps:
  install:      { commands: [npm ci] }
  typecheck:    { commands: [npx tsc --noEmit],              depends_on: [install] }
  lint:         { commands: [npx eslint src/ --max-warnings 0], depends_on: [install] }
  test-unit:    { commands: [npm run test -- --workspace=unit --coverage], depends_on: [install] }
  test-integration:
    environment: { DATABASE_URL: "postgresql://ci:ci@test-postgres:5432/ci_test" }
    commands:
      - ./scripts/test-db-setup.sh ${CI_REPO_NAME}
      - npm run test -- --workspace=integration
    depends_on: [install]
  security-scan: { commands: [npm audit --audit-level=high], depends_on: [install] }
  build-image:
    image: plugins/docker
    settings:
      repo: homelab/${CI_REPO_NAME}
      tags: ["latest", "${CI_COMMIT_SHA:0:8}"]
      build_args: { APP_VERSION, BUILD_DATE, GIT_SHA: "${CI_COMMIT_SHA:0:8}" }
    depends_on: [test-unit, test-integration, typecheck, lint]
    when: { branch: main }
  migrate-preflight:
    commands:
      - npx prisma migrate status
      - ./scripts/migrate-deploy.sh ${CI_REPO_NAME} production
    depends_on: [build-image]
    when: { branch: main }
  deploy:
    commands: [docker compose -f docker-compose.prod.yml up -d ${CI_REPO_NAME}]
    depends_on: [migrate-preflight]
    when: { branch: main }
  health-check:
    commands:
      - sleep 10  # Wait for container startup
      - curl -sf http://localhost:3000/health/ready || (
          docker compose -f docker-compose.prod.yml logs app > /tmp/failed-deploy.log &&
          docker compose -f docker-compose.prod.yml up -d --scale app=0 &&
          echo "Deploy failed - rolled back to 0 replicas" && exit 1)
    depends_on: [deploy]
    when: { branch: main }
  notify-on-failure:
    commands:
      - curl -X POST -d "Deploy failed for ${CI_REPO_NAME}" ${NTFY_WEBHOOK_URL}
    when: { status: [failure] }
```

**FIXED: Migration Rollback Support:**

```bash
# scripts/migrate-deploy.sh
#!/bin/bash
APP_NAME="$1"
ENV="$2"

# CRITICAL: Migrations MUST bypass PgBouncer and connect directly to Postgres
# See Phase 21.1b decision table - PgBouncer transaction mode breaks DDL statements
if [ -z "$DIRECT_DATABASE_URL" ]; then
  echo "ERROR: DIRECT_DATABASE_URL is not set. Migrations must connect directly to Postgres."
  exit 1
fi

# Enforce direct connection - override DATABASE_URL to prevent accidental PgBouncer usage
export DATABASE_URL="$DIRECT_DATABASE_URL"

# Verify we're not hitting PgBouncer
if [[ "$DATABASE_URL" == *"pgbouncer"* ]]; then
  echo "ERROR: DATABASE_URL still contains 'pgbouncer' after override. Aborting to prevent corruption."
  exit 1
fi

# Capture migration name before applying
MIGRATION=$(npx prisma migrate status --schema=prisma/schema.prisma | grep -A1 "db push" | head -1)

# Apply migration
npx prisma migrate deploy

# Write rollback file
if [ -n "$MIGRATION" ]; then
  echo "$MIGRATION" > ".migrations/${APP_NAME}-${ENV}-last-applied.txt"
fi
```

### Phase 25.3 — External Server Deploy Pattern

Every scaffold writes `scripts/deploy-external.sh`:

1. `docker build` with version ARGs
2. `docker save | gzip | ssh | gunzip | docker load` (no registry needed)
3. `prisma migrate deploy` on production DB
4. `docker compose up -d --no-deps app`

---

# PART D — Module System + Multi-Workspace SaaS

---

## The Upgrade Path: Compile-Time → Runtime

This is the central architectural guarantee of the module system. Every design decision traces back to making this transition require the smallest possible change.

```

COMPILE-TIME (current)                  RUNTIME (future upgrade)
────────────────────────────────        ────────────────────────────────────────
Manifest resolver reads                 Manifest resolver reads
  platform-manifest.yaml         ───→    same platform-manifest.yaml ✓ unchanged

IModule loaded from source tree         IModule loaded from
  at build time                  ───→    /plugins/{pluginId}/index.js at runtime
  (same interface shape) ✓               (same interface shape) ✓ unchanged

ServiceRegistry.register()              ServiceRegistry.register()
  called at app startup          ───→    called when plugin is dynamically loaded
  (same API) ✓ unchanged                 (same API) ✓ unchanged

EventBus subscriptions                  EventBus subscriptions
  wired at app startup           ───→    wired when plugin activates
  (same API) ✓ unchanged                 (same API) ✓ unchanged

Schema merge at build time       ───→   Schema merge + isolated migration run
  SchemaMerger.merge()                    per module at runtime

```

**Files that change to enable runtime loading: 3**
**Files in each module that change: 0**

---

## Phase 26 — The Five Architectural Contracts

### Phase 26.1 — `IModule` — Module-to-Host Contract

```typescript
// packages/module-system/src/interfaces/IModule.ts

/**
 * IModule — The contract every module must implement.
 *
 * VERSIONING: apiVersion must match host's MODULE_API_VERSION.
 * Host applies compatibility adapters for version mismatches.
 *
 * LIFECYCLE ORDER:
 *   1. describe()              — host reads metadata, resolves dependencies
 *   2. setup(context)          — host injects context; module registers services + events
 *   3. onMigrate(runner)       — host runs module schema migrations (isolated per module)
 *   4. onTenantProvision()     — called for each new workspace that activates this module
 *   5. teardown()              — host is shutting down or unloading this module
 *   6. onTenantDeprovision()   — called when a workspace deactivates this module
 */
export interface IModule {
  describe(): ModuleDescriptor;
  setup(context: IHostContext): Promise<void>;
  onMigrate(runner: IMigrationRunner): Promise<void>;
  onTenantProvision(tenantId: string, context: IHostContext): Promise<void>;
  onTenantDeprovision(tenantId: string, context: IHostContext): Promise<void>;
  
  // Module lifecycle hooks for install/upgrade (Phase 32.6)
  onInstall(workspaceId: string): Promise<void>;
  onUpgrade(workspaceId: string, fromVersion: string, toVersion: string): Promise<void>;
  
  teardown(): Promise<void>;
}

export interface ModuleDescriptor {
  pluginId:     string;          // Stable unique identifier — never changes
  displayName:  string;
  version:      string;
  apiVersion:   '1.0';           // Must match host MODULE_API_VERSION
  description:  string;
  category:     'financial' | 'operations' | 'crm' | 'hr' | 'analytics' | 'utilities' | 'ai';

  provides:     CapabilityId[];  // What this module registers in ServiceRegistry
  requires:     CapabilityId[];  // What this module needs — missing = hard startup error
  optional?:    CapabilityId[];  // Nice-to-have — module checks .has() before using

  features:     FeatureId[];     // Billable feature flags this module contributes
  publishes:    EventId[];       // Domain events this module emits (declarative)
  subscribes:   EventId[];       // Domain events this module handles (declarative)

  schemaFragment?: string;       // Path to schema.prisma fragment, relative to module root
  navItems?:    NavItem[];        // Sidebar items (filtered by feature entitlement at runtime)
}

export interface NavItem {
  id:       string;
  label:    string;
  icon:     string;
  path:     string;
  order:    number;
  feature?: FeatureId;  // Only shown if workspace has this feature enabled
}

export type CapabilityId = string;  // e.g. "accounting.journal_entry_service"
export type FeatureId    = string;  // e.g. "accounting.advanced_reporting"
export type EventId      = string;  // e.g. "accounting.journal_entry.posted"
```

### Phase 26.2 — `IHostContext` — Host-to-Module Contract

```typescript
// packages/module-system/src/interfaces/IHostContext.ts

/**
 * IHostContext — The complete and bounded API surface a module is allowed to use.
 *
 * A module that only touches IHostContext is completely isolated.
 * It cannot reach any global state, any other module's internals,
 * or any infrastructure service that isn't exposed here.
 */
export interface IHostContext {
  services:     IServiceRegistry;    // Typed capability resolution (no direct class imports)
  events:       IEventBus;           // All cross-module communication
  db:           ITenantScopedDB;      // Tenant-scoped proxy — structurally impossible to cross-tenant query
  redis:        Redis;               // Use module-prefixed keys: "{pluginId}:{tenantId}:{key}"
  queues:       IQueueFactory;       // Auto-namespaced BullMQ queues per module
  router:       IModuleRouter;       // Mounts at /api/modules/{pluginId}/
  logger:       ILogger;             // Structured logging with module context pre-filled
  config:       IConfigProvider;     // Validated env vars — never access process.env directly
  features:     IFeatureProvider;    // Check workspace feature entitlements
  permissions:  IPermissionService;  // User-level permission checks
  audit:        IAuditLogger;        // Platform audit trail (pre-wired to pgaudit)
  metrics:      IMetricsProvider;    // Prometheus metrics namespaced to module
  ai:           IAIService;          // Multi-provider AI service, cost-tracked
  vectors:      IVectorStoreRouter;  // Routes to Qdrant (tenant-namespaced) or pgvector
}

/**
 * ITenantScopedDB — Makes cross-tenant queries structurally impossible.
 * Every method automatically scopes to tenantId. Modules cannot bypass this.
 */
export interface ITenantScopedDB {
  // Each method requires tenantId and automatically scopes all queries
  journalEntry: TenantScopedModel<'JournalEntry'>;
  invoice: TenantScopedModel<'Invoice'>;
  purchaseOrder: TenantScopedModel<'PurchaseOrder'>;
  // ... other models auto-generated per module schema
  
  // Raw query access for advanced cases — ONLY through tenant-scoped wrapper
  $queryRaw(tenantId: string, query: string, ...params: unknown[]): Promise<unknown>;
}

/**
 * TenantScopedModel — Proxy that auto-injects tenantId on every operation.
 * Makes it structurally impossible to query across tenant boundaries.
 */
export interface TenantScopedModel<T extends string> {
  findUnique(tenantId: string, where: Record<string, unknown>): Promise<unknown>;
  findMany(tenantId: string, where: Record<string, unknown>): Promise<unknown[]>;
  create(tenantId: string, data: Record<string, unknown>): Promise<unknown>;
  update(tenantId: string, where: Record<string, unknown>, data: Record<string, unknown>): Promise<unknown>;
  delete(tenantId: string, where: Record<string, unknown>): Promise<unknown>;
  updateMany(tenantId: string, where: Record<string, unknown>, data: Record<string, unknown>): Promise<{ count: number }>;
  deleteMany(tenantId: string, where: Record<string, unknown>): Promise<{ count: number }>;
}

export interface IServiceRegistry {
  register<T>(capabilityId: CapabilityId, implementation: T): void;
  resolve<T>(capabilityId: CapabilityId): T;  // Throws if not registered
  has(capabilityId: CapabilityId): boolean;
}

export interface IEventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  subscribe<T extends DomainEvent>(pattern: EventId, handler: EventHandler<T>): Unsubscribe;
}

export interface IFeatureProvider {
  /** Check if a single feature is enabled for a tenant */
  isEnabled(tenantId: string, featureId: FeatureId): Promise<boolean>;
  
  /**
   * Batch check multiple features in a single Redis MGET call.
   * Returns a Map of featureId -> enabled state for O(1) lookups.
   * Used by nav builder to avoid N+1 Redis calls.
   */
  batchIsEnabled(tenantId: string, featureIds: string[]): Promise<Map<string, boolean>>;
  
  /** Assert that a feature is enabled, throws if not */
  assertEnabled(tenantId: string, featureId: FeatureId): Promise<void>;
  assertEnabled(tenantId: string, featureId: FeatureId): Promise<void>; // Throws FeatureNotAvailableError
}

export interface IAuditLogger {
  write(params: {
    tenantId: string; userId: string; action: AuditAction;
    resource: string; resourceId: string; before?: unknown; after?: unknown;
  }): Promise<void>;
}

export interface IQueueFactory {
  create(queueName: string): Queue;                             // Auto-namespaced
  createWorker(queueName: string, processor: Processor): Worker;
}

export interface IMigrationRunner {
  runPending(): Promise<void>;
  status(): Promise<{ pending: number; applied: number }>;
}

export interface DomainEvent {
  readonly eventId:    string;
  readonly eventType:  EventId;
  readonly tenantId:   string;
  readonly userId:     string;
  readonly occurredAt: Date;
  readonly payload:    Record<string, unknown>;
}

export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;
export type Unsubscribe = () => void;
export type AuditAction = 'CREATE'|'UPDATE'|'DELETE'|'LOCK'|'UNLOCK'|'POST'|'REVERSE'|'APPROVE'|'REJECT';
```

### Phase 26.3 — `IModuleManifest` — Platform Bundle Declaration

```typescript
// packages/module-system/src/interfaces/IModuleManifest.ts

export interface IModuleManifest {
  manifestVersion: '1.0';
  platformId:      string;
  platformName:    string;

  /**
   * THE SINGLE SWITCH for compile-time → runtime upgrade.
   * "source"    → packages/modules/{pluginId}/src/index.ts  (compile-time, current)
   * "directory" → /plugins/{pluginId}/index.js               (runtime, future)
   * "registry"  → fetched from module registry URL           (marketplace, far future)
   */
  loaderStrategy:  'source' | 'directory' | 'registry';
  loaderBasePath?: string;

  modules:           ModuleRegistration[];
  subscriptionTiers: SubscriptionTier[];
  defaultModules:    string[];  // pluginIds active in every new workspace
}

export interface ModuleRegistration {
  pluginId:         string;
  displayName:      string;
  description:      string;
  category:         ModuleDescriptor['category'];
  minimumTier:      string;    // Workspace must be on this tier to activate module
  enabledByDefault: boolean;
}

export interface SubscriptionTier {
  tierId:      string;         // e.g. "starter", "professional", "enterprise"
  displayName: string;
  modules:     string[];       // pluginIds available at this tier
  features:    FeatureId[];    // Feature flags unlocked at this tier
}
```

### Phase 26.4 — Domain Event Catalogue

```typescript
// packages/module-system/src/events/catalogue.ts
// ALL events that flow through the platform event bus are declared here.
// Format: "{plugin_id}.{entity}.{past_tense_verb}"

export const DomainEvents = {
  // Accounting
  JOURNAL_ENTRY_POSTED:        'accounting.journal_entry.posted',
  JOURNAL_ENTRY_REVERSED:      'accounting.journal_entry.reversed',
  FISCAL_PERIOD_LOCKED:        'accounting.fiscal_period.locked',
  INVOICE_CREATED:             'accounting.invoice.created',
  INVOICE_PAID:                'accounting.invoice.paid',
  INVOICE_VOIDED:              'accounting.invoice.voided',

  // Procurement
  PURCHASE_ORDER_CREATED:      'procurement.purchase_order.created',
  PURCHASE_ORDER_APPROVED:     'procurement.purchase_order.approved',
  PURCHASE_ORDER_RECEIVED:     'procurement.purchase_order.received',
  GOODS_RECEIPT_COMPLETED:     'procurement.goods_receipt.completed',

  // Inventory
  STOCK_MOVEMENT_CREATED:      'inventory.stock_movement.created',
  STOCK_LEVEL_LOW:             'inventory.stock_level.low',
  PRODUCT_CREATED:             'inventory.product.created',

  // WMS
  PICKING_LIST_COMPLETED:      'wms.picking_list.completed',
  GOODS_RECEIVED_AT_BIN:       'wms.goods_receipt.binned',

  // Platform / Subscription
  SUBSCRIPTION_TIER_CHANGED:    'platform.subscription.tier_changed',
  WORKSPACE_CREATED:            'platform.workspace.created',

  // POS
  POS_TRANSACTION_COMPLETED:   'pos.transaction.completed',
  POS_TRANSACTION_VOIDED:      'pos.transaction.voided',
  POS_SESSION_CLOSED:          'pos.session.closed',

  // HR
  EMPLOYEE_CREATED:            'hr.employee.created',
  PAYROLL_COMPLETED:           'hr.payroll.completed',
  LEAVE_APPROVED:              'hr.leave.approved',

  // Billing
  SUBSCRIPTION_ACTIVATED:      'billing.subscription.activated',
  FEATURE_ENABLED:             'billing.feature.enabled',
  FEATURE_DISABLED:            'billing.feature.disabled',

  // Platform / Workspace
  WORKSPACE_MODULE_ACTIVATED:  'platform.workspace.module_activated',
  WORKSPACE_MODULE_DEACTIVATED:'platform.workspace.module_deactivated',
  USER_INVITED:                'platform.user.invited',
  USER_ROLE_CHANGED:           'platform.user.role_changed',
} as const;
```

### Phase 26.5 — The Event Rule: Wrong vs Right

```typescript
// ❌ WRONG — direct cross-module call
import { JournalEntryService } from '@platform/modules/accounting'; // FORBIDDEN
// Creates hard compile-time dependency. Cannot unload Accounting at runtime.

// ✅ CORRECT — event-driven decoupling
class ProcurementModule implements IModule {
  async approvePurchaseOrder(poId: string, userId: string) {
    const po = await this.context.db.purchaseOrder.update({ ... });

    // Procurement emits. It does not know who is listening.
    await this.context.events.publish({
      eventId:   crypto.randomUUID(),
      eventType: DomainEvents.PURCHASE_ORDER_APPROVED,
      tenantId:  po.tenantId,
      userId,
      occurredAt: new Date(),
      payload:   { poId, total: po.total.toString(), currency: po.currency },
    });
  }
}

// Accounting module subscribes — it can be removed without breaking Procurement
class AccountingModule implements IModule {
  async setup(context: IHostContext) {
    context.events.subscribe(
      DomainEvents.PURCHASE_ORDER_APPROVED,
      this.handlePurchaseOrderApproved.bind(this)
    );
  }

  private async handlePurchaseOrderApproved(event: DomainEvent) {
    const { poId, total, currency } = event.payload as Record<string,string>;
    await this.journalEntryService.postPurchaseOrderAccrual({
      tenantId: event.tenantId, userId: event.userId,
      poId, amount: total, currency,
    });
  }
}
```

---

## Phase 27 — The Module Loader

```typescript
// packages/module-system/src/loader/ModuleLoader.ts

export class ModuleLoader {
  private loaded      = new Map<string, IModule>();
  private descriptors = new Map<string, ModuleDescriptor>();
  private registry    = new ServiceRegistry();
  private eventBus    = new EventBus();

  constructor(
    private readonly manifest: IModuleManifest,
    private readonly context:  Omit<IHostContext, 'services' | 'events'>
  ) {}

  /** Load all modules declared in the manifest in dependency order. */
  async loadAll(): Promise<void> {
    const moduleIds   = this.manifest.modules.map(m => m.pluginId);
    const descriptors = await this.resolveDescriptors(moduleIds);
    const graph       = new DependencyGraph(descriptors);

    graph.validate();  // Throws on circular deps, missing requirements, duplicate capabilities

    const loadOrder = graph.topologicalSort();

    for (const pluginId of loadOrder) {
      await this.loadModule(pluginId);
    }
  }

  /** Load a single module. Called at startup OR at runtime for dynamic loading. */
  async loadModule(pluginId: string): Promise<void> {
    if (this.loaded.has(pluginId)) return;

    const module     = await this.resolveImplementation(pluginId);
    const descriptor = module.describe();

    // Validate all required capabilities are already registered
    for (const cap of descriptor.requires) {
      if (!this.registry.has(cap)) {
        throw new Error(`Module "${pluginId}" requires "${cap}" — ensure provider is loaded first`);
      }
    }

    // Build the host context for this module — scoped to this pluginId
    const moduleContext: IHostContext = {
      ...this.context,
      services: this.registry,
      events:   this.eventBus,
      queues:   this.context.queues.forModule(pluginId),
      logger:   this.context.logger.child({ module: pluginId }),
      metrics:  this.context.metrics.forModule(pluginId),
    };

    await module.setup(moduleContext);
    this.loaded.set(pluginId, module);
    this.descriptors.set(pluginId, descriptor);
  }

  /**
   * Resolve module implementation based on loaderStrategy.
   *
   * TO UPGRADE FROM COMPILE-TIME TO RUNTIME:
   *   Change loaderStrategy in platform-manifest.yaml from "source" to "directory"
   *   No module code changes. This method handles both cases already.
   */
  private async resolveImplementation(pluginId: string): Promise<IModule> {
    switch (this.manifest.loaderStrategy) {
      case 'source': {
        // Compile-time: module is in the monorepo source tree
        const basePath = this.manifest.loaderBasePath || '../../../modules';
        const mod = require(`${basePath}/${pluginId}/src/index`);
        return new mod.default() as IModule;
      }
      case 'directory': {
        // Runtime: module is a compiled JS file in the plugins directory
        const pluginPath = path.join(
          this.manifest.loaderBasePath || '/plugins',
          pluginId, 'index.js'
        );
        const mod = require(pluginPath);
        return new mod.default() as IModule;
      }
      case 'registry': {
        throw new Error('Registry loader not yet implemented');
      }
    }
  }

  async unloadModule(pluginId: string): Promise<void> {
    const module = this.loaded.get(pluginId);
    if (!module) throw new Error(`Module "${pluginId}" is not loaded`);
    await module.teardown();
    this.loaded.delete(pluginId);
    this.descriptors.delete(pluginId);
  }

  getModule(pluginId: string): IModule {
    const m = this.loaded.get(pluginId);
    if (!m) throw new Error(`Module "${pluginId}" not loaded`);
    return m;
  }

  getAllDescriptors(): Map<string, ModuleDescriptor> {
    return this.descriptors;
  }
}
```

---

## Phase 28 — The Service Registry

```typescript
// packages/module-system/src/loader/ServiceRegistry.ts

export class ServiceRegistry implements IServiceRegistry {
  private services = new Map<CapabilityId, unknown>();

  register<T>(capabilityId: CapabilityId, implementation: T): void {
    if (this.services.has(capabilityId)) {
      throw new Error(
        `Capability "${capabilityId}" already registered. ` +
        `Two modules cannot provide the same capability.`
      );
    }
    this.services.set(capabilityId, implementation);
  }

  resolve<T>(capabilityId: CapabilityId): T {
    const service = this.services.get(capabilityId);
    if (!service) {
      throw new Error(
        `Capability "${capabilityId}" not registered. ` +
        `Ensure providing module is loaded before the module that requires it.`
      );
    }
    return service as T;
  }

  has(capabilityId: CapabilityId): boolean {
    return this.services.has(capabilityId);
  }
}
```

---

## Phase 29 — The Event Bus

The EventBus persists events to a `domain_events` table and enqueues a BullMQ job before calling handlers, ensuring at-least-once delivery and enabling replay. The in-process fast path is retained for handlers that return within 100ms.

```typescript
// packages/module-system/src/loader/EventBus.ts

export class EventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler<DomainEvent>>>();
  private db: Database;  // For event persistence
  private queue: BullQueue;  // For retryable delivery
  private logger = console;

  constructor(db: Database, queue: BullQueue) {
    this.db = db;
    this.queue = queue;
    
    // Schedule recovery job to run every 5 minutes
    // This catches events that were persisted but jobs weren't enqueued (crash between persist and enqueue)
    this.queue.add(
      'event-recovery',
      {},
      {
        repeat: { every: 5 * 60 * 1000 },  // Every 5 minutes
        jobId: 'event-recovery-job'
      }
    );
    
    // Register worker to process recovery jobs
    this.queue.process('event-recovery', async () => {
      return this.recoverStuckEvents();
    });
  }

  // T1 financial events require at-least-once delivery
  private financialEvents = new Set([
    'accounting:journal.posted',
    'billing:invoice.created',
    'procurement:po.approved',
    'payroll:period.closed',
    'pos:transaction.completed',     // POS-001: Must create journal entry
    'pos:transaction.voided',         // Must reverse journal entry
    'inventory:adjustment.completed', // Must update accounting records
  ]);

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.getMatchingHandlers(event.eventType);

    // T1 financial events: persist to domain_events table + BullMQ for retry
    if (this.isFinancialEvent(event.eventType)) {
      await this.publishWithRetry(event, handlers);
      return;
    }

    // Non-financial events: fast in-process path with logging on failure
    const results = await Promise.allSettled(
      [...handlers].map(handler => handler(event))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error({ eventType: event.eventType, error: result.reason },
          'Event handler failed — other handlers continued');
      }
    }
  }

  private async publishWithRetry<T extends DomainEvent>(
    event: T,
    handlers: Set<EventHandler<DomainEvent>>
  ): Promise<void> {
    // 1. Persist event for replay capability
    const eventId = crypto.randomUUID();
    await this.db.domainEvent.create({
      data: {
        id: eventId,
        eventType: event.eventType,
        payload: event,
        status: 'PENDING',
        createdAt: new Date()
      }
    });

    // 2. Enqueue BullMQ job for each handler with retry
    // Use jobId for idempotency - BullMQ deduplicates on jobId
    for (const handler of handlers) {
      await this.queue.add('handle-domain-event', {
        eventId,
        eventType: event.eventType,
        handlerName: handler.name,
        payload: event
      }, {
        jobId: `${eventId}:${handler.name}`, // BullMQ deduplicates on jobId
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 }  // DLQ for audit
      });
    }
  }

  /**
   * Recovery job for events stuck in PENDING status.
   * Scans for events older than 5 minutes with no associated BullMQ jobs
   * and re-enqueues them. This prevents events from being lost if the
   * process crashes between writing the record and enqueuing jobs.
   * 
   * Run this as a BullMQ repeat job every 5 minutes or via n8n workflow.
   */
  async recoverStuckEvents(): Promise<number> {
    const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    
    // Find events that are PENDING and older than threshold
    // These are events where the DB record was written but jobs may not have been enqueued
    const stuckEvents = await this.db.domainEvent.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: stuckThreshold }
      },
      take: 50,
      orderBy: { createdAt: 'asc' }
    });

    if (stuckEvents.length === 0) return 0;

    // Re-enqueue each stuck event
    for (const event of stuckEvents) {
      // Mark as PROCESSING to indicate recovery in progress
      await this.db.domainEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSING', updatedAt: new Date() }
      });

      // Re-enqueue with special recovery flag
      await this.queue.add('handle-domain-event', {
        eventId: event.id,
        eventType: event.eventType,
        isRecovery: true,  // Flag to indicate this is a recovered event
        payload: event.payload
      }, {
        attempts: 3,  // Fewer attempts for recovered events
        backoff: { type: 'exponential', delay: 2000 }
      });

      this.logger.warn(
        { eventId: event.id, eventType: event.eventType, age: Date.now() - event.createdAt.getTime() },
        'Re-enqueued stuck domain event'
      );
    }

    return stuckEvents.length;
  }

  private isFinancialEvent(eventType: string): boolean {
    return this.financialEvents.has(eventType);
  }

  subscribe<T extends DomainEvent>(
    pattern: EventId,
    handler: EventHandler<T>
  ): Unsubscribe {
    if (!this.handlers.has(pattern)) this.handlers.set(pattern, new Set());
    this.handlers.get(pattern)!.add(handler as EventHandler<DomainEvent>);
    return () => this.handlers.get(pattern)?.delete(handler as EventHandler<DomainEvent>);
  }

  private getMatchingHandlers(eventType: string): Set<EventHandler<DomainEvent>> {
    const matched = new Set<EventHandler<DomainEvent>>();
    for (const [pattern, handlers] of this.handlers) {
      if (this.matchesPattern(pattern, eventType)) {
        for (const h of handlers) matched.add(h);
      }
    }
    return matched;
  }

  private matchesPattern(pattern: string, eventType: string): boolean {
    if (pattern === eventType) return true;
    // Wildcard: "accounting.*" matches "accounting.journal_entry.posted"
    const regex = new RegExp('^' + pattern.replace(/\./g,'\\.')
      .replace(/\*/g,'[^.]+') + '$');
    return regex.test(eventType);
  }
}
```

---

### Phase 29.1 — Event Bus Delivery Guarantees: Idempotency & Dead Letter Queue

**Handler-level idempotency guard** — prevents duplicate processing when a handler succeeds but the job ack fails and BullMQ retries:

```typescript
// packages/module-system/src/loader/EventWorker.ts
// The BullMQ worker that processes 'handle-domain-event' jobs

async function processEventJob(job: Job<EventJobData>): Promise<void> {
  const { eventId, handlerName, payload, isRecovery } = job.data;

  // Idempotency check — did this handler already succeed for this event?
  const alreadyProcessed = await db.domainEventDelivery.findUnique({
    where: { eventId_handlerName: { eventId, handlerName } }
  });
  if (alreadyProcessed?.status === 'DELIVERED') {
    logger.info({ eventId, handlerName }, 'Skipping duplicate event delivery');
    return; // Idempotent exit — not an error
  }

  // Upsert a PROCESSING record (handles concurrent retries)
  await db.domainEventDelivery.upsert({
    where: { eventId_handlerName: { eventId, handlerName } },
    create:  { eventId, handlerName, status: 'PROCESSING', attempts: 1 },
    update:  { status: 'PROCESSING', attempts: { increment: 1 }, updatedAt: new Date() }
  });

  try {
    const handler = handlerRegistry.resolve(handlerName);
    await handler(payload);

    await db.domainEventDelivery.update({
      where: { eventId_handlerName: { eventId, handlerName } },
      data:  { status: 'DELIVERED', deliveredAt: new Date() }
    });

  } catch (err) {
    await db.domainEventDelivery.update({
      where: { eventId_handlerName: { eventId, handlerName } },
      data:  { status: 'FAILED', lastError: String(err), updatedAt: new Date() }
    });
    throw err; // Let BullMQ retry with backoff
  }
}
```

**Database schema for delivery tracking:**

```sql
CREATE TABLE domain_event_delivery (
    event_id      UUID   NOT NULL REFERENCES domain_events(id),
    handler_name  TEXT   NOT NULL,
    status        TEXT   NOT NULL CHECK (status IN ('PROCESSING','DELIVERED','FAILED','DEAD')),
    attempts      INT    NOT NULL DEFAULT 1,
    delivered_at  TIMESTAMPTZ,
    last_error    TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, handler_name)  -- natural composite key = idempotency key
);
```

**Dead Letter Queue implementation** — what `removeOnFail: { count: 5000 }` actually does is retention, not DLQ:

```typescript
// When enqueuing in publishWithRetry:
await this.queue.add('handle-domain-event', jobData, {
  jobId:           `${eventId}:${handler.name}`,
  attempts:        5,
  backoff:         { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  // Real DLQ: after all attempts exhausted, move to dead-letter queue
});

// Worker-level failed handler — this is the actual DLQ mechanism:
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts!) {
    // All retries exhausted — move to dead letter
    await db.domainEventDelivery.update({
      where: { eventId_handlerName: {
        eventId: job.data.eventId,
        handlerName: job.data.handlerName
      }},
      data: { status: 'DEAD', lastError: err.message }
    });

    // Alert — this requires manual operator intervention
    logger.error({ job: job.data, error: err.message }, 
      'Event permanently failed — moved to dead letter. Manual review required.');
    metrics.increment('kilo_event_dead_letter_total', {
      eventType: job.data.eventType,
      handler:   job.data.handlerName
    });
  }
});
```

**Grafana alert for dead letter queue:**

```yaml
- alert: BullMQDeadLetterQueueSize
  expr: kilo_event_dead_letter_total > 10
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: 'Dead letter queue has {{ $value }} events requiring manual review'
```

---

## Phase 30 — The Dependency Graph Validator

```typescript
// packages/module-system/src/loader/DependencyGraph.ts

export class DependencyGraph {
  constructor(private readonly descriptors: ModuleDescriptor[]) {}

  validate(): void {
    this.validateNoDuplicateCapabilities();
    this.validateAllRequirementsProvided();
    this.topologicalSort();  // Detects cycles as a side effect
  }

  /** Returns pluginIds in load order — dependencies always come before dependents. */
  topologicalSort(): string[] {
    const visited  = new Set<string>();
    const visiting = new Set<string>();  // Cycle detection
    const result:    string[] = [];

    const visit = (pluginId: string): void => {
      if (visited.has(pluginId))  return;
      if (visiting.has(pluginId)) throw new Error(`Circular dependency involving "${pluginId}"`);

      visiting.add(pluginId);
      const descriptor = this.descriptors.find(d => d.pluginId === pluginId)!;

      for (const requiredCap of descriptor.requires) {
        const provider = this.descriptors.find(d => d.provides.includes(requiredCap));
        if (provider) visit(provider.pluginId);
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
      result.push(pluginId);
    };

    for (const d of this.descriptors) visit(d.pluginId);
    return result;
  }

  private validateNoDuplicateCapabilities(): void {
    const seen = new Map<string, string>();
    for (const d of this.descriptors) {
      for (const cap of d.provides) {
        if (seen.has(cap)) throw new Error(
          `Capability "${cap}" provided by both "${seen.get(cap)}" and "${d.pluginId}"`
        );
        seen.set(cap, d.pluginId);
      }
    }
  }

  private validateAllRequirementsProvided(): void {
    const allProvided = new Set(this.descriptors.flatMap(d => d.provides));
    for (const d of this.descriptors) {
      for (const req of d.requires) {
        if (!allProvided.has(req)) throw new Error(
          `Module "${d.pluginId}" requires "${req}" but no loaded module provides it`
        );
      }
    }
  }
}
```

---

## Phase 31 — The Schema Merger

```typescript
// packages/module-system/src/schema/SchemaMerger.ts

/**
 * SchemaMerger — Combines module schema fragments into one Prisma schema.
 *
 * Each module owns its schema.prisma fragment with ONLY its own models.
 * Model names MUST be globally unique — prefix with module name
 * (e.g. AccountingJournalEntry, not JournalEntry) enforced by MOD-009.
 *
 * Output: prisma/schema.prisma — auto-generated, never edit manually.
 */
export class SchemaMerger {
  private fragments = new Map<string, string>();

  async addModule(pluginId: string, descriptor: ModuleDescriptor, basePath: string): Promise<void> {
    const fragmentPath = path.join(basePath, pluginId,
      descriptor.schemaFragment || 'schema.prisma');
    const fragment = await fs.readFile(fragmentPath, 'utf-8');
    this.fragments.set(pluginId, fragment);
  }

  async merge(outputPath: string, hostSchemaHeader: string): Promise<void> {
    this.validateNoCollisions();

    const merged = [
      hostSchemaHeader, '',
      '// AUTO-GENERATED by SchemaMerger — DO NOT EDIT MANUALLY',
      '// Modules: ' + [...this.fragments.keys()].join(', '), '',
      ...[...this.fragments.entries()].flatMap(([pluginId, fragment]) => [
        `// ── Module: ${pluginId} ─────────────────────────────────────────`,
        fragment, '',
      ]),
    ].join('\n');

    await fs.writeFile(outputPath, merged, 'utf-8');
  }

  private validateNoCollisions(): void {
    const modelNames = new Map<string, string>();
    const enumNames  = new Map<string, string>();

    for (const [pluginId, fragment] of this.fragments) {
      // Derive expected prefix: "hr" → "HR", "accounting" → "Accounting"
      const expectedPrefix = pluginId
        .toUpperCase()
        .replace(/-./g, c => c[1].toUpperCase());
      const alternativePrefix = pluginId.charAt(0).toUpperCase() + pluginId.slice(1);

      for (const [, model] of fragment.matchAll(/^model\s+(\w+)\s*\{/gm)) {
        // Check if model starts with expected module prefix (e.g., HR, Accounting)
        // This correctly handles: HREmployee, AccountingJournalEntry, etc.
        if (!model.startsWith(expectedPrefix) && !model.startsWith(alternativePrefix)) {
          throw new Error(
            `Model "${model}" in module "${pluginId}" must start with ` +
            `"${expectedPrefix}" or "${alternativePrefix}" (MOD-009)`
          );
        }
        if (modelNames.has(model)) throw new Error(
          `Model collision: "${model}" in "${modelNames.get(model)}" and "${pluginId}". ` +
          `Use module-prefixed names e.g. "${expectedPrefix}${model}"`
        );
        modelNames.set(model, pluginId);
      }
      for (const [, enumName] of fragment.matchAll(/^enum\s+(\w+)\s*\{/gm)) {
        if (enumNames.has(enumName)) throw new Error(
          `Enum collision: "${enumName}" in "${enumNames.get(enumName)}" and "${pluginId}"`
        );
        enumNames.set(enumName, pluginId);
      }
    }
  }
}
```

### Phase 31.5 — SchemaMerger Enforcement & Build Integration

**The problem:** SchemaMerger is referenced but undefined in critical areas.

**The solution:**

```typescript
// SchemaMerger merge algorithm
async merge(outputPath: string): Promise<MergeResult> {
  const fragments = await this.loadAllFragments();
  this.validateNoCollisions(); // Fails build on collision
  
  // Cross-module relations: use ID reference, not @relation
  // Prisma can't express FKs across fragment boundaries
  const merged = this.concatenateFragments(fragments);
  await fs.writeFile(outputPath, merged);
  
  return { models: fragments.length, outputPath };
}
```

**Naming Convention Enforcement:**
- Every model MUST be prefixed with module name: `AccountingInvoice`, `ProcurementPO`, `HREmployee`
- ESLint rule in every scaffold: `"@typescript-eslint/no-shadow": "error"`
- MOD-009: Validates model name starts with module prefix (e.g., `AccountingInvoice` for module `accounting`)

**Build Integration:**

```yaml
# .github/workflows/schema.yml
build-schema:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npx prisma generate
    - run: npx ts-node scripts/validate-schema-merger.ts
    - run: git diff --exit-code prisma/schema.prisma || echo "Schema changed - commit required"
```

**Output Decision:**
- Merged schema IS committed to source control
- Enables git diff tracking of schema changes
- Required for `prisma migrate` to work correctly

---

## Phase 32 — The Multi-Workspace SaaS Layer

### Phase 32.1 — Platform Core Schema (Host Framework Models)

These models are owned by the host framework — never by any module. They exist in `packages/platform-core/schema.prisma` and are always present regardless of which modules are loaded.

```prisma
// packages/platform-core/schema.prisma

model Workspace {
  id           String             @id @default(uuid())
  slug         String             @unique   // used in URLs: {slug}.yourplatform.com
  name         String
  ownerUserId  String
  currency     String             @default("USD")
  timezone     String             @default("UTC")
  status       WorkspaceStatus    @default(ACTIVE)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  subscriptions WorkspaceSubscription[]
  members       WorkspaceMember[]
  featureOverrides WorkspaceFeatureOverride[]
  auditLogs     PlatformAuditLog[]
  @@index([status])
}

enum WorkspaceStatus { ACTIVE SUSPENDED CANCELLED }

model WorkspaceSubscription {
  id          String              @id @default(uuid())
  workspaceId String
  workspace   Workspace           @relation(fields: [workspaceId], references: [id])
  tierId      String              // matches IModuleManifest.subscriptionTiers[].tierId
  status      SubscriptionStatus  @default(ACTIVE)
  startsAt    DateTime
  expiresAt   DateTime?
  createdAt   DateTime            @default(now())
  moduleEntitlements WorkspaceModuleEntitlement[]
  @@index([workspaceId, status])
}

enum SubscriptionStatus { TRIAL ACTIVE PAST_DUE CANCELLED }

model WorkspaceModuleEntitlement {
  // FIXED: Model now matches code usage in activateModule/deactivateModule
  // - Uses workspaceId (not subscriptionId) for direct workspace lookup
  // - Uses status String (not isActive Boolean) for ACTIVE/PROVISION_FAILED/DEACTIVATED
  // - Uses @@unique([workspaceId, pluginId]) for workspaceId_pluginId composite key
  id             String    @id @default(uuid())
  workspaceId    String
  workspace      Workspace @relation(fields: [workspaceId], references: [id])
  pluginId       String
  status         String    @default("ACTIVE") // ACTIVE | PROVISION_FAILED | DEACTIVATED
  activatedAt    DateTime  @default(now())
  deactivatedAt  DateTime?
  
  @@unique([workspaceId, pluginId])
  @@index([pluginId, status])
}

model WorkspaceMember {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  userId      String
  roleId      String
  role        Role      @relation(fields: [roleId], references: [id])
  isOwner     Boolean   @default(false)  // Exactly one member per workspace holds this flag
  teamId      String?   // optional team/department grouping for "team" scope
  joinedAt    DateTime  @default(now())
  invitedBy   String?
  @@unique([workspaceId, userId])
  @@index([workspaceId, roleId])
}

// Admin can grant or revoke features outside the subscription tier
model WorkspaceFeatureOverride {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  featureId   String
  isEnabled   Boolean
  expiresAt   DateTime?
  grantedBy   String
  reason      String?
  createdAt   DateTime  @default(now())
  @@unique([workspaceId, featureId])
}

model PlatformAuditLog {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  userId      String
  action      String
  resource    String
  resourceId  String
  before      Json?
  after       Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime  @default(now())
  @@index([workspaceId, resource, resourceId])
  @@index([workspaceId, createdAt])
}

// Permission system — host framework owns these, not any module
model Role {
  id          String           @id @default(uuid())
  workspaceId String
  workspace   Workspace        @relation(fields: [workspaceId], references: [id])
  name        String           // "admin", "accountant", "viewer", "warehouse-manager"
  displayName String
  description String?
  isSystem    Boolean          @default(false)  // system roles cannot be deleted
  createdAt   DateTime         @default(now())
  permissions RolePermission[]
  members     WorkspaceMember[]
  @@unique([workspaceId, name])
}

model RolePermission {
  id       String          @id @default(uuid())
  roleId   String
  role     Role            @relation(fields: [roleId], references: [id], onDelete: Cascade)
  module   String          // "accounting" | "procurement" | "wms" | "*"
  action   String          // "read" | "create" | "update" | "delete" | "approve" | "post" | "export"
  scope    PermissionScope @default(all)
  resource String?         // "Invoice" | "PurchaseOrder" | null = all resources in module
  @@unique([roleId, module, action, resource])
  @@index([roleId, module])
}

enum PermissionScope { own team all }

model ResourceOwnership {
  id          String   @id @default(uuid())
  workspaceId String
  resource    String   // "Invoice", "PurchaseOrder", "PickingList"
  resourceId  String
  ownerId     String   // userId
  teamId      String?
  createdAt   DateTime @default(now())
  @@unique([workspaceId, resource, resourceId])
  @@index([workspaceId, resource, ownerId])
}

// AI cost tracking — platform-level, not module-level
model AIUsageRecord {
  id            String    @id @default(uuid())
  workspaceId   String
  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  userId        String
  moduleId      String
  provider      AIProvider
  model         String
  operation     AIOperation
  promptTokens  Int
  outputTokens  Int
  totalTokens   Int
  costUsd       Decimal   @db.Decimal(12, 8)
  durationMs    Int
  promptHash    String
  responseHash  String
  error         String?
  createdAt     DateTime  @default(now())
  @@index([workspaceId, createdAt])
  @@index([workspaceId, provider, createdAt])
  @@index([moduleId, createdAt])
}

enum AIProvider  { CLAUDE OPENAI OLLAMA OPENROUTER }
enum AIOperation { COMPLETE STREAM EMBED AGENT_STEP TOOL_CALL }

model AIBudget {
  id              String    @id @default(uuid())
  workspaceId     String    @unique
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  monthlyLimitUsd Decimal   @db.Decimal(10, 2)
  alertThreshold  Decimal   @db.Decimal(5, 4)   // 0.8000 = alert at 80%
  currentMonthUsd Decimal   @db.Decimal(10, 4)  @default(0)
  resetDay        Int       @default(1)
  updatedAt       DateTime  @updatedAt
}

model AIPromptTemplate {
  id          String   @id @default(uuid())
  workspaceId String
  moduleId    String
  name        String
  description String?
  template    String
  variables   Json
  version     Int      @default(1)
  isActive    Boolean  @default(true)
  createdBy   String
  createdAt   DateTime @default(now())
  @@unique([workspaceId, moduleId, name, version])
}
```

### Phase 32.2 — Feature Provider Implementation

```typescript
// packages/platform-core/src/FeatureProvider.ts

export class FeatureProvider implements IFeatureProvider {
  constructor(
    private readonly db:       PrismaClient,
    private readonly redis:    Redis,
    private readonly manifest: IModuleManifest
  ) {}

  async isEnabled(tenantId: string, featureId: FeatureId): Promise<boolean> {
    // 1. Check Redis cache — 5 minute TTL
    const cacheKey = `feature:${tenantId}:${featureId}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    // 2. Check workspace-level override first (admin can grant/revoke)
    const override = await this.db.workspaceFeatureOverride.findUnique({
      where: { workspaceId_featureId: { workspaceId: tenantId, featureId } },
    });
    if (override && (!override.expiresAt || override.expiresAt > new Date())) {
      await this.redis.setex(cacheKey, 300, override.isEnabled ? '1' : '0');
      return override.isEnabled;
    }

    // 3. Check active subscription tier
    const subscription = await this.db.workspaceSubscription.findFirst({
      where: { workspaceId: tenantId, status: 'ACTIVE' },
    });
    if (!subscription) {
      await this.redis.setex(cacheKey, 300, '0');
      return false;
    }

    const tier      = this.manifest.subscriptionTiers.find(t => t.tierId === subscription.tierId);
    const isEnabled = tier?.features.includes(featureId) ?? false;

    await this.redis.setex(cacheKey, 300, isEnabled ? '1' : '0');
    // Track key in tenant's set for O(1) invalidation
    await this.redis.sadd(`feature_keys:${tenantId}`, cacheKey);
    return isEnabled;
  }

  async batchIsEnabled(tenantId: string, featureIds: string[]): Promise<Map<string, boolean>> {
    if (featureIds.length === 0) return new Map();
    
    const result = new Map<string, boolean>();
    const cacheKeys = featureIds.map(f => `feature:${tenantId}:${f}`);
    
    // 1. Batch fetch all from Redis cache using MGET
    const cachedValues = await this.redis.mget(...cacheKeys);
    const missingIndices: number[] = [];
    
    for (let i = 0; i < featureIds.length; i++) {
      if (cachedValues[i] !== null) {
        result.set(featureIds[i], cachedValues[i] === '1');
      } else {
        missingIndices.push(i);
      }
    }
    
    if (missingIndices.length === 0) return result;
    
    // 2. Batch fetch missing from DB (single query)
    const missingFeatureIds = missingIndices.map(i => featureIds[i]);
    const subscription = await this.db.workspaceSubscription.findFirst({
      where: { workspaceId: tenantId, status: 'ACTIVE' },
    });
    
    const tier = subscription 
      ? this.manifest.subscriptionTiers.find(t => t.tierId === subscription.tierId)
      : null;
    
    // 3. Compute enabled states and cache them
    for (const featureId of missingFeatureIds) {
      // Check overrides first
      const override = await this.db.workspaceFeatureOverride.findUnique({
        where: { workspaceId_featureId: { workspaceId: tenantId, featureId } },
      });
      
      let isEnabled = false;
      if (override && (!override.expiresAt || override.expiresAt > new Date())) {
        isEnabled = override.isEnabled;
      } else if (tier) {
        isEnabled = tier.features.includes(featureId);
      }
      
      result.set(featureId, isEnabled);
      
      // Cache the result
      const cacheKey = `feature:${tenantId}:${featureId}`;
      await this.redis.setex(cacheKey, 300, isEnabled ? '1' : '0');
      await this.redis.sadd(`feature_keys:${tenantId}`, cacheKey);
    }
    
    return result;
  }

  async assertEnabled(tenantId: string, featureId: FeatureId): Promise<void> {
    if (!(await this.isEnabled(tenantId, featureId))) {
      throw new FeatureNotAvailableError(tenantId, featureId);
    }
  }

  async invalidateCache(tenantId: string): Promise<void> {
    // Use Redis Set to track keys per tenant — avoids O(N) KEYS scan
    const keysKey = `feature_keys:${tenantId}`;
    const keys = await this.redis.smembers(keysKey);
    if (keys.length > 0) {
      await this.redis.del(...keys, keysKey);
    }
  }

  // Subscribe to subscription tier changes — invalidate cache immediately on upgrade/downgrade
  setupEventListeners(eventBus: IEventBus): void {
    eventBus.subscribe(DomainEvents.SUBSCRIPTION_TIER_CHANGED, async (event) => {
      if (event.tenantId) {
        await this.invalidateCache(event.tenantId);
        logger.info({ tenantId: event.tenantId, newTier: event.payload?.newTierId },
          'Feature cache invalidated due to subscription tier change');
      }
    });
  }
}
```

### Phase 32.3 — Workspace Provisioner

The `WorkspaceProvisioner.provisionWorkspace()` wraps the module provisioning loop in try/catch and calls `rollbackWorkspaceProvision(tenantId)` on failure, which calls `onTenantDeprovision()` in reverse load order.

```typescript
// packages/platform-core/src/WorkspaceProvisioner.ts

export class WorkspaceProvisioner {
  /** Create a new workspace and activate its default modules. Called on customer sign-up. */
  async provisionWorkspace(params: {
    slug: string; name: string; ownerUserId: string; tierId: string;
  }): Promise<Workspace> {
    const workspace = await this.db.workspace.create({
      data: {
        slug: params.slug, name: params.name, ownerUserId: params.ownerUserId,
        subscriptions: {
          create: { tierId: params.tierId, status: 'ACTIVE', startsAt: new Date() }
        }
      },
      include: { subscriptions: true }
    });

    // Seed system roles for this workspace
    await this.seedSystemRoles(workspace.id, params.ownerUserId);

    await this.context.events.publish({
      eventId:   crypto.randomUUID(),
      eventType: DomainEvents.WORKSPACE_CREATED,
      tenantId:  workspace.id,
      userId:    params.ownerUserId,
      occurredAt: new Date(),
      payload:   { workspaceId: workspace.id, tierId: params.tierId },
    });

    // Activate default modules — with rollback on failure
    const tier           = this.manifest.subscriptionTiers.find(t => t.tierId === params.tierId);
    const defaultPlugins = (tier?.modules ?? []).filter(m =>
      this.manifest.modules.find(r => r.pluginId === m)?.enabledByDefault
    );

    const provisioned: string[] = [];
    try {
      for (const pluginId of defaultPlugins) {
        await this.activateModule(workspace.id, pluginId, params.ownerUserId);
        provisioned.push(pluginId);
      }
    } catch (err) {
      // Rollback in reverse order
      for (const pluginId of [...provisioned].reverse()) {
        await this.loader.getModule(pluginId).onTenantDeprovision(workspace.id, this.context);
      }
      throw err;
    }

    return workspace;
  }

  private async seedSystemRoles(workspaceId: string, ownerUserId: string): Promise<void> {
    const roleDefinitions = [
      { name: 'owner',  displayName: 'Owner',         permissions: [{ module: '*', action: '*', scope: 'all' }] },
      { name: 'admin',  displayName: 'Administrator',  permissions: [{ module: '*', action: '*', scope: 'all' }] },
      { name: 'member', displayName: 'Member',         permissions: [{ module: '*', action: 'read', scope: 'all' }] },
      { name: 'viewer', displayName: 'Viewer',         permissions: [{ module: '*', action: 'read', scope: 'own' }] },
    ];

    for (const roleDef of roleDefinitions) {
      const role = await this.db.role.create({
        data: {
          workspaceId,
          name: roleDef.name,
          displayName: roleDef.displayName,
          permissions: { create: roleDef.permissions }
        }
      });
      
      // Assign owner role to the workspace owner
      // FIXED: Use workspaceMember (matches Prisma schema) instead of userRole
      if (roleDef.name === 'owner') {
        await this.db.workspaceMember.create({
          data: { workspaceId, userId: ownerUserId, roleId: role.id, isOwner: true }
        });
      }
    }
  }

  async activateModule(workspaceId: string, pluginId: string, userId: string): Promise<void> {
    // 1. Use collision-resistant advisory lock to prevent race conditions
    await this.advisoryLockWithKey(this.db, `${workspaceId}:${pluginId}`);
    
    // 2. Check if already active (idempotent)
    const existing = await this.db.workspaceModuleEntitlement.findUnique({
      where: { workspaceId_pluginId: { workspaceId, pluginId } }
    });
    if (existing?.status === 'ACTIVE') {
      this.logger.debug({ workspaceId, pluginId }, 'Module already active');
      return;
    }
    
    // 3. Validate tier eligibility
    // FIXED: Get tier from active subscription, not non-existent workspace.tier
    const subscription = await this.db.workspaceSubscription.findFirst({
      where: { workspaceId, status: 'ACTIVE' }
    });
    const module = await this.moduleLoader.getModule(pluginId);
    // FIXED: Use minimumTier (not requiredTier) from module manifest
    const requiredTier = module.manifest.modules.find(m => m.pluginId === pluginId)?.minimumTier;
    await this.validateTier(subscription?.tierId, requiredTier);
    
    // 4. Run onMigrate if this is first install
    const isFirstInstall = !existing;
    if (isFirstInstall) {
      await module.onMigrate(this.getMigrationRunner(workspaceId));
    }
    
    // 5. Upsert entitlement and run provisioning steps atomically
    // If any step 6-9 fails, the entitlement is rolled back to PROVISION_FAILED
    // Use Serializable isolation to prevent phantom reads in module activation checks
    await this.db.$transaction(
      async (tx) => {
        // 5a. Upsert entitlement (create or reactivate)
      const entitlement = await tx.workspaceModuleEntitlement.upsert({
        where: { workspaceId_pluginId: { workspaceId, pluginId } },
        create: { workspaceId, pluginId, status: 'ACTIVE', activatedAt: new Date() },
        update: { status: 'ACTIVE', activatedAt: new Date(), deactivatedAt: null }
      });
      
      try {
        // 6. Call module's onTenantProvision hook
        const context = this.createHostContext(workspaceId, pluginId);
        await module.onTenantProvision(workspaceId, context);
        
        // 7. Register event subscriptions
        await this.registerModuleEvents(workspaceId, pluginId, module);
        
        // 8. Mount routes
        await this.mountModuleRoutes(workspaceId, pluginId);
        
        // 9. Emit activation event
        await this.eventBus.publish({
          eventType: DomainEvents.WORKSPACE_MODULE_ACTIVATED,
          tenantId: workspaceId,
          userId,
          payload: { pluginId }
        });
      } catch (err) {
        // Roll back the entitlement — module failed to provision
        await tx.workspaceModuleEntitlement.update({
          where: { workspaceId_pluginId: { workspaceId, pluginId } },
          data: { status: 'PROVISION_FAILED', deactivatedAt: new Date() }
        });
        this.logger.error({ workspaceId, pluginId, err }, 'Module activation failed - rolled back');
        throw err;
      }
    });
    
    // 10. Invalidate feature cache
    await this.featureProvider.invalidateCache(workspaceId);
    
    this.logger.info({ workspaceId, pluginId }, 'Module activated');
  }

  async deactivateModule(workspaceId: string, pluginId: string, userId: string): Promise<void> {
    // 1. Use collision-resistant advisory lock
    await this.advisoryLockWithKey(this.db, `${workspaceId}:${pluginId}`);
    
    // 2. Get module
    const module = await this.moduleLoader.getModule(pluginId);
    
    // 3. Call module's onTenantDeprovision hook (soft-delete data)
    const context = this.createHostContext(workspaceId, pluginId);
    await module.onTenantDeprovision(workspaceId, context);
    
    // 4. Soft-delete entitlement
    await this.db.workspaceModuleEntitlement.update({
      where: { workspaceId_pluginId: { workspaceId, pluginId } },
      data: { status: 'DEACTIVATED', deactivatedAt: new Date() }
    });
    
    // 5. Emit deactivation event
    await this.eventBus.publish({
      eventType: DomainEvents.WORKSPACE_MODULE_DEACTIVATED,
      tenantId: workspaceId,
      userId,
      payload: { pluginId }
    });
    
    // 6. Invalidate feature cache
    await this.featureProvider.invalidateCache(workspaceId);
    
    this.logger.info({ workspaceId, pluginId }, 'Module deactivated (soft-delete)');
  }
  
  /**
   * Collision-resistant advisory lock using Postgres MD5 hash.
   * Uses md5() to generate a 64-bit bigint from the key, avoiding 32-bit collisions.
   */
  private async advisoryLockWithKey(db: PrismaClient, key: string): Promise<void> {
    await db.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || substr(md5(${key}), 1, 16))::bit(64)::bigint
      )
    `;
  }

  /**
   * Validates that the workspace tier meets the module's required tier.
   * Throws if tier is insufficient.
   */
  private async validateTier(workspaceTier: string, requiredTier: string): Promise<void> {
    const tierHierarchy: Record<string, number> = { 
      free: 0, starter: 1, professional: 2, enterprise: 3 
    };
    const workspaceLevel = tierHierarchy[workspaceTier] ?? 0;
    const requiredLevel = tierHierarchy[requiredTier] ?? 999;
    
    if (workspaceLevel < requiredLevel) {
      throw new Error(
        `Module requires "${requiredTier}" tier but workspace is on "${workspaceTier}" tier`
      );
    }
  }

  /**
   * Returns a migration runner for the given workspace.
   */
  private getMigrationRunner(workspaceId: string): MigrationRunner {
    return {
      run: async (migration: Migration) => {
        await this.db.$transaction([
          this.db.$executeRaw`${migration.up}`,
        ]);
        await this.db.workspaceMigration.create({
          data: {
            workspaceId,
            version: migration.version,
            name: migration.name,
            appliedAt: new Date(),
          }
        });
      },
    };
  }

  /**
   * Creates a host context object for module lifecycle hooks.
   */
  private createHostContext(workspaceId: string, pluginId: string): HostContext {
    return {
      workspaceId,
      pluginId,
      db: this.db,
      logger: this.logger.child({ workspaceId, pluginId }),
    };
  }

  /**
   * Registers module event subscriptions.
   */
  private async registerModuleEvents(
    workspaceId: string, 
    pluginId: string, 
    module: IModule
  ): Promise<void> {
    if (!module.subscriptions) return;
    
    for (const subscription of module.subscriptions) {
      await this.db.workspaceEventSubscription.create({
        data: {
          workspaceId,
          pluginId,
          eventType: subscription.eventType,
          handler: subscription.handler.name,
          enabled: true,
        }
      });
    }
  }

  /**
   * Mounts module API routes.
   */
  private async mountModuleRoutes(workspaceId: string, pluginId: string): Promise<void> {
    const module = await this.moduleLoader.getModule(pluginId);
    if (!module.routes) return;
    
    for (const route of module.routes) {
      await this.db.workspaceRoute.create({
        data: {
          workspaceId,
          pluginId,
          path: route.path,
          method: route.method,
          handler: route.handler.name,
          enabled: true,
        }
      });
    }
  }
}
```

---

## Phase 32.4 — Module System Lifecycle: Database Schema

These tables capture the module's declared manifest at install time, enabling reconciliation on upgrade without re-scanning live code:

```sql
-- Canonical record of which module versions are installed in each workspace
-- Distinct from WorkspaceModuleEntitlement which tracks subscription entitlements
CREATE TABLE workspace_module (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    plugin_id        TEXT NOT NULL,                    -- e.g. "@platform/inventory"
    status           TEXT NOT NULL CHECK (status IN ('INSTALLING','INSTALLED','ACTIVE','UPGRADING','DEACTIVATED','FAILED')),
    version          TEXT NOT NULL,                    -- e.g. "1.2.0"
    manifest_snapshot JSONB NOT NULL,                   -- frozen copy of manifest at install/upgrade time
    activated_at     TIMESTAMPTZ,
    deactivated_at   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (workspace_id, plugin_id)
);

-- Stores routes a module mounts into a workspace's HTTP router
CREATE TABLE workspace_route (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    module_id        UUID NOT NULL REFERENCES workspace_module(id) ON DELETE CASCADE,
    method           TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','ALL')),
    path             TEXT NOT NULL,          -- e.g. /api/inventory/items
    handler_ref      TEXT NOT NULL,          -- e.g. "InventoryModule.handleGetItems"
    middleware       JSONB DEFAULT '[]',     -- ["authGuard", "rateLimiter"]
    is_active        BOOLEAN DEFAULT TRUE,
    mounted_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, method, path)      -- prevents route collisions at DB level
);

-- Stores which events a module subscribes to within a workspace
CREATE TABLE workspace_event_subscription (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    module_id        UUID NOT NULL REFERENCES workspace_module(id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL,          -- e.g. "billing:invoice.created@v2"
    handler_ref      TEXT NOT NULL,          -- e.g. "AccountingModule.onInvoiceCreated"
    schema_version   TEXT NOT NULL,          -- "v2" — validated against core-contracts
    is_active        BOOLEAN DEFAULT TRUE,
    registered_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, module_id, event_type)
);

-- Audit trail for lifecycle transitions (critical for upgrade vs install distinction)
CREATE TABLE workspace_module_lifecycle_event (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id),
    module_id        UUID NOT NULL REFERENCES workspace_module(id),
    event_type       TEXT NOT NULL CHECK (event_type IN (
                         'INSTALL', 'ACTIVATE', 'DEACTIVATE', 'UPGRADE', 'ROLLBACK', 'UNINSTALL'
                     )),
    from_version     TEXT,                   -- NULL on first INSTALL
    to_version       TEXT,
    manifest_snapshot JSONB NOT NULL,        -- full manifest at time of event
    triggered_by     UUID REFERENCES users(id),
    occurred_at      TIMESTAMPTZ DEFAULT NOW(),
    error            TEXT                    -- non-null if transition failed
);
```

**Why `manifest_snapshot` on the lifecycle table?** Because when you need to roll back or debug a broken upgrade, you need the *exact manifest* that was active — not whatever the module package currently declares.

---

## Phase 32.5 — How Routes Are Actually Mounted to the HTTP Server

The critical insight: **don't re-scan module code at runtime**. Read from `workspace_route` and mount via a dynamic router proxy at workspace boot:

```typescript
// WorkspaceProvisioner.ts

// Helper functions for resolving string references to callable functions
// These turn database strings like "InventoryModule.handleGetItems" into bound methods

function resolveHandlerRef(moduleInstance: IModule, ref: string): RequestHandler {
  const [, methodName] = ref.split('.');
  const method = (moduleInstance as any)[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Handler "${ref}" not found on module instance`);
  }
  return method.bind(moduleInstance);
}

function resolveMiddleware(middlewareRef: string): RequestHandler {
  // Middleware refs are either built-in names or module-relative paths
  // Built-in: 'authGuard', 'rateLimiter', 'auditLogger'
  // Module-relative: 'InventoryModule.requireInventoryPermission'
  const builtInMiddleware: Record<string, RequestHandler> = {
    authGuard: requireAuth,
    rateLimiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }),
    auditLogger: createAuditLogger(),
  };

  if (builtInMiddleware[middlewareRef]) {
    return builtInMiddleware[middlewareRef];
  }

  // Handle module-relative middleware references
  if (middlewareRef.includes('.')) {
    const [moduleName, methodName] = middlewareRef.split('.');
    const module = moduleRegistry.getInstance(moduleName);
    if (!module) {
      throw new Error(`Middleware module "${moduleName}" not found`);
    }
    const method = (module as any)[methodName];
    if (typeof method !== 'function') {
      throw new Error(`Middleware "${middlewareRef}" not found`);
    }
    return method.bind(module);
  }

  throw new Error(`Unknown middleware: "${middlewareRef}"`);
}

class WorkspaceProvisioner {
  constructor(
    private db: Database,
    private moduleRegistry: ModuleRegistry,  // in-memory map of loaded module classes
    private app: Express                      // the root Express app
  ) {}

  async mountModuleRoutes(workspaceId: string): Promise<void> {
    // 1. Create an isolated sub-router per workspace
    const workspaceRouter = express.Router();

    // 2. Load active route records from DB — source of truth
    const routes = await this.db.workspaceRoute.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { path: 'asc' }
    });

    // 3. Bind each route to its module's handler
    for (const route of routes) {
      const moduleInstance = this.moduleRegistry.getInstance(route.moduleId);
      if (!moduleInstance) {
        this.logger.warn({ moduleId: route.moduleId, path: route.path }, 
          'Module not loaded, skipping route');
        continue;  // Graceful degradation
      }

      const handler = resolveHandlerRef(moduleInstance, route.handlerRef);
      const middleware = (route.middleware || []).map(m => resolveMiddleware(m));

      workspaceRouter[route.method.toLowerCase()](route.path, ...middleware, handler);
    }

    // 4. Mount the workspace router under its tenant prefix
    this.app.use(`/workspace/${workspaceId}`, workspaceRouter);
    
    // 5. Store reference for hot-swap on upgrade
    this.activeRouters.set(workspaceId, workspaceRouter);
  }

  async registerModuleEvents(workspaceId: string): Promise<void> {
    const subscriptions = await this.db.workspaceEventSubscription.findMany({
      where: { workspaceId, isActive: true }
    });

    const scopedBus = this.eventBus.scopedFor(workspaceId);

    for (const sub of subscriptions) {
      const moduleInstance = this.moduleRegistry.getInstance(sub.moduleId);
      if (!moduleInstance) continue;

      const handler = resolveHandlerRef(moduleInstance, sub.handlerRef);
      scopedBus.on(sub.eventType, handler);
    }
  }
}
```

**Core principle:** The DB row is the mount record; the module instance is just the handler resolver. This enables route reload without server restart — just call `mountModuleRoutes` again.

---

## Phase 32.6 — Upgrade vs Fresh Install: The State Machine

The lifecycle must be a **state machine with explicit transitions**:

```typescript
type ModuleLifecycleState = 
  | 'NOT_INSTALLED'
  | 'INSTALLING'
  | 'INSTALLED'
  | 'ACTIVATING'
  | 'ACTIVE'
  | 'UPGRADING'
  | 'DEACTIVATED'
  | 'UNINSTALLING'
  | 'FAILED';

async function provisionModule(
  workspaceId: string,
  moduleId: string,
  newManifest: ModuleManifest
): Promise<void> {
  const current = await getModuleRecord(workspaceId, moduleId);

  if (!current) {
    // ── FRESH INSTALL ──────────────────────────────────────────
    await this.db.$transaction(async (tx) => {
      await tx.workspaceModule.create({
        data: { workspaceId, moduleId, status: 'INSTALLING', version: newManifest.version }
      });
      
      // Write routes and subscriptions from manifest
      await writeRoutesFromManifest(tx, workspaceId, moduleId, newManifest);
      await writeSubscriptionsFromManifest(tx, workspaceId, moduleId, newManifest);
      
      // Run module's onInstall migration
      await moduleInstance.onInstall(workspaceId);
      
      await tx.workspaceModule.update({
        where: { workspaceId_moduleId: { workspaceId, moduleId } },
        data: { status: 'INSTALLED' }
      });
      
      await logLifecycleEvent(tx, workspaceId, moduleId, 'INSTALL', null, 
        newManifest.version, newManifest);
    });

  } else if (current.version !== newManifest.version) {
    // ── UPGRADE ────────────────────────────────────────────────
    await this.db.$transaction(async (tx) => {
      await tx.workspaceModule.update({
        where: { workspaceId_moduleId: { workspaceId, moduleId } },
        data: { status: 'UPGRADING' }
      });

      // Compute diff between old manifest (from snapshot) and new
      const oldManifest = current.manifestSnapshot;
      const { addedRoutes, removedRoutes, addedEvents, removedEvents } =
        diffManifests(oldManifest, newManifest);

      // Add new routes/events
      await writeRoutesFromManifest(tx, workspaceId, moduleId, { routes: addedRoutes });
      await writeSubscriptionsFromManifest(tx, workspaceId, moduleId, { consumes: addedEvents });

      // Soft-delete removed routes/events (preserve audit trail)
      await tx.workspaceRoute.updateMany({
        where: { workspaceId, moduleId, path: { in: removedRoutes } },
        data: { isActive: false }
      });
      await tx.workspaceEventSubscription.updateMany({
        where: { workspaceId, moduleId, eventType: { in: removedEvents } },
        data: { isActive: false }
      });

      // Run module's migration for version bump
      await moduleInstance.onUpgrade(workspaceId, current.version, newManifest.version);

      await tx.workspaceModule.update({
        where: { workspaceId_moduleId: { workspaceId, moduleId } },
        data: { 
          status: 'ACTIVE', 
          version: newManifest.version,
          manifestSnapshot: newManifest
        }
      });

      await logLifecycleEvent(tx, workspaceId, moduleId, 'UPGRADE', 
        current.version, newManifest.version, newManifest);
    });

    // Hot-swap router outside transaction (I/O, not DB)
    await this.remountWorkspaceRoutes(workspaceId);

  } else {
    // Same version — idempotent re-activation
    await this.activateModule(workspaceId, moduleId);
  }
}
```

**Summary:**

| Gap | Solution |
|-----|----------|
| Schema | `workspace_route` owns method/path/handler_ref/middleware as data; `workspace_event_subscription` owns event_type/handler_ref/schema_version; both soft-delete on removal. `workspace_module_lifecycle_event` stores `manifest_snapshot` for auditability and rollback. |
| Route mounting | `WorkspaceProvisioner` reads from DB rows, resolves handlers from in-memory module instances, mounts to a per-workspace Express sub-router. Routes remount in-process on upgrade via router hot-swap — no server restart. |
| Upgrade vs install | Explicit state machine with `INSTALLING`/`UPGRADING`/`FAILED` transient states. Upgrade diffs old vs new manifest (from stored snapshot), soft-deletes removed routes/events, adds new ones, runs `onUpgrade(fromVersion, toVersion)` migration hook — all in one transaction before router swap. |

---

## Phase 33 — Accounting Module — Reference IModule Implementation

This is the reference implementation all other modules follow. It shows every lifecycle hook, service registration pattern, event subscription pattern, and feature guard in use.

```typescript
// packages/modules/accounting/src/index.ts

export default class AccountingModule implements IModule {
  describe(): ModuleDescriptor {
    return {
      pluginId:    'accounting',
      displayName: 'Accounting',
      version:     '1.0.0',
      apiVersion:  '1.0',
      description: 'General ledger, chart of accounts, AP/AR, invoicing, tax, fiscal periods',
      category:    'financial',
      provides: [
        'accounting.journal_entry_service',
        'accounting.chart_of_accounts_service',
        'accounting.fiscal_period_service',
        'accounting.tax_service',
        'accounting.invoice_service',
      ],
      requires: [],
      optional: ['billing.usage_service'],
      features: [
        'accounting.general_ledger',
        'accounting.accounts_payable',
        'accounting.accounts_receivable',
        'accounting.advanced_reporting',
        'accounting.multi_currency',
        'accounting.consolidation',
      ],
      publishes: [
        DomainEvents.JOURNAL_ENTRY_POSTED,
        DomainEvents.JOURNAL_ENTRY_REVERSED,
        DomainEvents.FISCAL_PERIOD_LOCKED,
        DomainEvents.INVOICE_CREATED,
        DomainEvents.INVOICE_PAID,
        DomainEvents.INVOICE_VOIDED,
      ],
      subscribes: [
        DomainEvents.PURCHASE_ORDER_APPROVED,
        DomainEvents.GOODS_RECEIPT_COMPLETED,
        DomainEvents.POS_TRANSACTION_COMPLETED,
        DomainEvents.POS_SESSION_CLOSED,
        DomainEvents.STOCK_MOVEMENT_CREATED,
      ],
      navItems: [
        { id: 'gl',       label: 'General Ledger', icon: 'book',    path: '/accounting/gl',       order: 1, feature: 'accounting.general_ledger' },
        { id: 'invoices', label: 'Invoices',        icon: 'receipt', path: '/accounting/invoices', order: 2, feature: 'accounting.accounts_receivable' },
        { id: 'bills',    label: 'Bills',            icon: 'file',    path: '/accounting/bills',    order: 3, feature: 'accounting.accounts_payable' },
        { id: 'reports',  label: 'Reports',          icon: 'chart',   path: '/accounting/reports',  order: 4, feature: 'accounting.advanced_reporting' },
      ],
      schemaFragment: 'schema.prisma',
    };
  }

  async setup(context: IHostContext): Promise<void> {
    this.context = context;
    this.journalEntryService = new JournalEntryService(context);
    this.chartService        = new ChartOfAccountsService(context);
    this.invoiceService      = new InvoiceService(context);
    this.fiscalService       = new FiscalPeriodService(context);
    this.taxService          = new TaxService(context);
    const reportService      = new ReportService(context);

    // Register capabilities in ServiceRegistry
    context.services.register('accounting.journal_entry_service',     this.journalEntryService);
    context.services.register('accounting.chart_of_accounts_service', this.chartService);
    context.services.register('accounting.fiscal_period_service',     this.fiscalService);
    context.services.register('accounting.tax_service',               this.taxService);
    context.services.register('accounting.invoice_service',           this.invoiceService);

    // Subscribe to cross-module events — never call other modules directly
    context.events.subscribe(DomainEvents.PURCHASE_ORDER_APPROVED,   this.handlePOApproved.bind(this));
    context.events.subscribe(DomainEvents.GOODS_RECEIPT_COMPLETED,   this.handleGoodsReceipt.bind(this));
    context.events.subscribe(DomainEvents.POS_TRANSACTION_COMPLETED, this.handlePosTransaction.bind(this));
    context.events.subscribe(DomainEvents.STOCK_MOVEMENT_CREATED,    this.handleStockMovement.bind(this));

    // Mount API routes at /api/modules/accounting/
    const { createAccountingRouter } = await import('./api/router');
    context.router.mount(createAccountingRouter(
      this.journalEntryService, this.invoiceService, reportService
    ));

    context.logger.info('Accounting module ready');
  }

  async onMigrate(runner: IMigrationRunner): Promise<void> {
    await runner.runPending();
  }

  async onTenantProvision(tenantId: string, context: IHostContext): Promise<void> {
    // Seed standard chart of accounts, opening fiscal period, default tax rates
    // Seed domain-specific roles: accountant, ap-clerk, auditor
    await this.chartService.seedDefaultChartOfAccounts(tenantId);
    await this.fiscalService.createInitialFiscalPeriod(tenantId);
    await this.taxService.seedDefaultTaxRates(tenantId);
  }

  async onTenantDeprovision(tenantId: string, context: IHostContext): Promise<void> {
    // Soft-delete only — financial records are legally required to be retained
    context.logger.warn({ tenantId }, 'Deprovisioning accounting — data soft-deleted, not destroyed');
    await context.db.journalEntry.updateMany({ where: { tenantId }, data: { deletedAt: new Date() } });
    await context.db.invoice.updateMany({      where: { tenantId }, data: { deletedAt: new Date() } });
  }

  async teardown(): Promise<void> {
    this.context.logger.info('Accounting module teardown complete');
  }
}
```

---

## Phase 34 — Platform Bundle Manifest (Complete Example)

```yaml
# platform-manifest.yaml

manifestVersion: "1.0"
platformId:   "acme-erp-platform"
platformName: "Acme ERP Platform"

# ── COMPILE-TIME (current) ─────────────────────────────────────────────
loaderStrategy: source
loaderBasePath: "../../packages/modules"

# ── RUNTIME UPGRADE: change only these two lines ──────────────────────
# loaderStrategy: directory
# loaderBasePath: /plugins
# ──────────────────────────────────────────────────────────────────────

modules:
  - pluginId: accounting
    displayName: "Accounting"
    description: "General ledger, AP/AR, invoicing, tax, fiscal periods"
    category: financial
    minimumTier: starter
    enabledByDefault: true

  - pluginId: procurement
    displayName: "Procurement"
    description: "Purchase orders, approval workflows, goods receipt, 3-way match"
    category: operations
    minimumTier: professional
    enabledByDefault: false

  - pluginId: inventory
    displayName: "Inventory"
    description: "Products, stock levels, movements, FIFO costing, lot tracking"
    category: operations
    minimumTier: professional
    enabledByDefault: false

  - pluginId: wms
    displayName: "Warehouse Management"
    description: "Bin locations, pick/pack workflows, receiving, barcode scanning"
    category: operations
    minimumTier: professional
    enabledByDefault: false

  - pluginId: pos
    displayName: "Point of Sale"
    description: "Retail POS, sessions, receipts, split payments, offline capability"
    category: operations
    minimumTier: starter
    enabledByDefault: false

  - pluginId: hr
    displayName: "Human Resources"
    description: "Employees, departments, payroll periods, leave management"
    category: hr
    minimumTier: professional
    enabledByDefault: false

  - pluginId: billing
    displayName: "Billing & Subscriptions"
    description: "Workspace billing, subscription management, usage tracking"
    category: financial
    minimumTier: starter
    enabledByDefault: true

  - pluginId: analytics
    displayName: "Business Analytics"
    description: "KPI dashboards, custom reports, scheduled exports"
    category: analytics
    minimumTier: enterprise
    enabledByDefault: false

subscriptionTiers:
  - tierId: starter
    displayName: "Starter"
    modules: [accounting, pos, billing]
    features:
      - accounting.general_ledger
      - accounting.accounts_payable
      - accounting.accounts_receivable
      - pos.basic_sales
      - billing.subscription_management

  - tierId: professional
    displayName: "Professional"
    modules: [accounting, procurement, inventory, wms, pos, hr, billing]
    features:
      - accounting.general_ledger
      - accounting.accounts_payable
      - accounting.accounts_receivable
      - accounting.advanced_reporting
      - accounting.multi_currency
      - procurement.purchase_orders
      - procurement.approval_workflows
      - inventory.stock_management
      - inventory.fifo_costing
      - wms.bin_management
      - wms.pick_and_pack
      - pos.basic_sales
      - pos.multi_terminal
      - hr.employee_management
      - billing.subscription_management
      - billing.usage_based_billing

  - tierId: enterprise
    displayName: "Enterprise"
    modules: [accounting, procurement, inventory, wms, pos, hr, billing, analytics]
    features:
      - accounting.general_ledger
      - accounting.accounts_payable
      - accounting.accounts_receivable
      - accounting.advanced_reporting
      - accounting.multi_currency
      - accounting.consolidation
      - procurement.purchase_orders
      - procurement.approval_workflows
      - procurement.three_way_match
      - inventory.stock_management
      - inventory.fifo_costing
      - inventory.lot_tracking
      - wms.bin_management
      - wms.pick_and_pack
      - wms.advanced_routing
      - pos.basic_sales
      - pos.multi_terminal
      - pos.kiosk_mode
      - hr.employee_management
      - hr.payroll_periods
      - billing.subscription_management
      - billing.usage_based_billing
      - billing.volume_discounts
      - analytics.kpi_dashboards
      - analytics.custom_reports
      - analytics.data_export

defaultModules: [accounting, billing]
```

---

## Phase 35 — Module-Aware UI Shell

```typescript
// packages/platform-core/src/ui/WorkspaceShell.ts

/**
 * Builds workspace navigation by batch-loading all entitlements and features.
 * Replaces N+1 query pattern with single queries for O(1) DB calls.
 */
export async function buildWorkspaceNav(
  workspaceId: string,
  loader:       ModuleLoader,
  features:     IFeatureProvider,
  db:           PrismaClient
): Promise<NavItem[]> {
  // 1. Batch load all active entitlements in a single query
  const activeEntitlements = new Set(
    (await db.workspaceModuleEntitlement.findMany({
      where: { 
        subscription: { workspaceId }, 
        isActive: true 
      },
      select: { pluginId: true }
    })).map(e => e.pluginId)
  );

  // 2. Collect all feature IDs from nav items across all modules
  const allFeatureIds = [...loader.getAllDescriptors().values()]
    .flatMap(d => (d.navItems ?? []).map(i => i.feature).filter(Boolean)) as string[];

  // 3. Batch check all features in a single call (uses Redis MGET)
  const featureStates = await features.batchIsEnabled(workspaceId, allFeatureIds);

  // 4. Build nav items using pre-loaded data — no additional queries
  const allItems: NavItem[] = [];
  for (const [pluginId, descriptor] of loader.getAllDescriptors()) {
    if (!activeEntitlements.has(pluginId)) continue;
    
    for (const item of descriptor.navItems ?? []) {
      // Skip items with features that are disabled
      if (item.feature && !featureStates.get(item.feature)) continue;
      allItems.push({ ...item, moduleId: pluginId });
    }
  }

  return allItems.sort((a, b) => a.order - b.order);
}
```

---

## Phase 36 — Module System Kilo Invariants

10 invariants in `kilo/.kilo/invariants.yaml` with `MOD-*` prefix:

| ID      | Scope       | Severity | Description                                                        |
| ------- | ----------- | -------- | ------------------------------------------------------------------ |
| MOD-001 | All modules | T1       | Module class implements `IModule` interface                      |
| MOD-002 | All modules | T1       | No concrete imports from other module packages                     |
| MOD-003 | All modules | T1       | Domain services via events only; `context.services.resolve()` for infrastructure only |
| MOD-004 | All modules | T1       | Cross-module side effects emitted via `context.events.publish()` |
| MOD-005 | All modules | T1       | No direct `process.env` — use `context.config`                |
| MOD-006 | All modules | T1       | Feature-gated code calls `context.features.assertEnabled()`      |
| MOD-007 | All modules | T1       | Infrastructure services declared in manifest; domain services via events |
| MOD-008 | All modules | T1       | `onTenantDeprovision` uses soft delete — no hard deletes        |
| MOD-009 | All modules | T1       | Schema fragment model names prefixed with module name              |
| MOD-010 | All modules | T2       | `teardown()` closes BullMQ workers before returning              |

---

## Phase 37 — Platform Scaffold Integration

The kilo-pipeline gains a new scaffold type: `platform`. Unlike single-app scaffolds, the platform scaffold generates a full Turborepo monorepo with the module system framework, platform core, and all requested modules pre-wired.

**`kilo/scaffold/scripts/platform/platform.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail
PLATFORM_NAME="$1"
MODULES="${2:-accounting,billing}"

echo ">>> Scaffolding platform: $PLATFORM_NAME"
echo "    Modules: $MODULES"

mkdir -p "$PLATFORM_NAME" && cd "$PLATFORM_NAME"

# Initialise Turborepo monorepo
npx create-turbo@latest . --skip-install

# Write module system framework
/scripts/platform/write-module-system.sh

# Write platform core (workspace, subscription, feature provider, permission service)
/scripts/platform/write-platform-core.sh

# Scaffold each module as an IModule implementation
IFS=',' read -ra MODULE_LIST <<< "$MODULES"
for module in "${MODULE_LIST[@]}"; do
  /scripts/modules/${module}.sh "$PLATFORM_NAME" --as-imodule
done

# Merge schemas once all modules are scaffolded
npx tsx scripts/merge-schema.ts

# Write platform manifest with declared modules and tiers
/scripts/platform/write-manifest.sh "$PLATFORM_NAME" "$MODULES"

# Register platform in project-registry with domain=platform
curl -s -X POST http://project-registry:4200/apps \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PLATFORM_NAME\",\"stack\":\"platform\",\"domain\":\"platform\"}"

echo ""
echo ">>> Platform scaffold complete"
echo ""
echo "    packages/module-system/     IModule · IHostContext · ModuleLoader"
echo "    packages/platform-core/     Workspace · Subscription · FeatureProvider · PermissionService"
echo "    packages/platform-host/     Next.js/T3 host application"
echo "    packages/modules/           One IModule implementation per module"
echo "    platform-manifest.yaml      Bundle declaration"
echo "    prisma/schema.prisma        Auto-merged from all module fragments"
echo ""
echo "    Next steps:"
echo "    1. cd $PLATFORM_NAME && npm install"
echo "    2. cp .env.example .env  (fill in DB credentials)"
echo "    3. npx prisma migrate dev"
echo "    4. npm run dev"
```

---

## Phase 38 — Unified Permission System

The permission system covers three orthogonal layers:

```
Layer 1 — SUBSCRIPTION (workspace level)
  "Does this workspace pay for this feature?"
  → context.features.assertEnabled(tenantId, 'accounting.advanced_reporting')

Layer 2 — ROLE/PERMISSION (user-in-workspace level)
  "Is this user allowed to perform this action in this workspace?"
  → context.permissions.assert({ userId, tenantId, module, action, resource })

Layer 3 — OWNERSHIP (record level)
  "Is this user allowed to access this specific record?"
  → context.permissions.assert({ ..., recordId })
```

All three must pass for an action to be allowed.

**`IPermissionService`** in `packages/platform-core/src/PermissionService.ts`:

```typescript
export interface IPermissionService {
  can(params: {
    userId: string; tenantId: string; module: string;
    action: string; resource?: string; recordId?: string;
  }): Promise<boolean>;

  assert(params: Parameters<IPermissionService['can']>[0]): Promise<void>;

  scopeFilter(params: {
    userId: string; tenantId: string; module: string;
    action: string; resource: string;
  }): Promise<Record<string, unknown>>;

  // Call after any UserRole mutation — invalidates permission cache
  invalidateUser(userId: string, tenantId: string): Promise<void>;
}
```

Permission decisions cached in Redis for 2 minutes. Scope-dependent checks (own/team) are not cached — they depend on the specific recordId. Every `UserRole` mutation must call `context.permissions.invalidateUser(userId, tenantId)` (enforced by PERM-003).

**Usage pattern in a module route:**

```typescript
// Layer 1: Does this workspace pay for AR?
await context.features.assertEnabled(tenantId, 'accounting.accounts_receivable');

// Layer 2: Is this user permitted to create invoices?
await context.permissions.assert({
  userId, tenantId, module: 'accounting', action: 'create', resource: 'Invoice',
});

// Layer 3: Record ownership tracked on create
const invoice = await invoiceService.create(tenantId, userId, data);
await context.db.resourceOwnership.create({
  data: { workspaceId: tenantId, resource: 'Invoice', resourceId: invoice.id, ownerId: userId }
});

// Reading invoices — automatic scope filter (own/team/all based on role)
const scopeFilter = await context.permissions.scopeFilter({
  userId, tenantId, module: 'accounting', action: 'read', resource: 'Invoice'
});
const invoices = await context.db.invoice.findMany({
  where: { tenantId, deletedAt: null, ...scopeFilter }
});
```

**Permission invariants:**

| ID       | Severity | Description                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| PERM-001 | T1       | `context.permissions.assert()` called before every data mutation in API routes                         |
| PERM-002 | T1       | List endpoints use `context.permissions.scopeFilter()` — never return all records without scope check |
| PERM-003 | T1       | `permissions.invalidateUser()` called on every `UserRole` mutation                                   |

---

# PART E — AI Application Layer

---

## The AI Architectural Guarantee

The same promise that governs the module system governs the AI layer: **every design decision is made so that switching AI providers requires zero application code changes.** An app built against `IAIService` can switch from Claude to Ollama by changing one environment variable. The AI provider is an infrastructure detail, not an application concern.

---

## Phase 39 — AI Infrastructure Services

### Phase 39.1 — Ollama Service (Local Model Hosting)

Add to `docker-compose.yml`:

```yaml
ollama:
  image: ollama/ollama:latest
  container_name: ollama
  restart: unless-stopped
  networks: [homelab]
  volumes:
    - ollama_models:/root/.ollama
  environment:
    OLLAMA_NUM_PARALLEL: ${HAL_OLLAMA_NUM_PARALLEL:-1}          # Set by HAL profile
    OLLAMA_MAX_LOADED_MODELS: ${HAL_OLLAMA_MAX_MODELS:-1}     # Set by HAL profile
    OLLAMA_KEEP_ALIVE: ${HAL_OLLAMA_KEEP_ALIVE:-5m}           # Set by HAL profile
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://localhost:11434/api/tags"]
    interval: 30s
    timeout: 10s
    retries: 3
  deploy:
    resources:
      limits:
        memory: 6g                  # Reserve 6GB for model — leave 8GB for apps
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.ollama.rule=Host(`ollama.homelab.local`)"
    - "traefik.http.routers.ollama.tls=true"
    - "traefik.http.services.ollama.loadbalancer.server.port=11434"
  logging:
    driver: "json-file"
    options: { max-size: "10m", max-file: "3" }

qdrant:
  image: qdrant/qdrant:latest
  container_name: qdrant
  restart: unless-stopped
  networks: [homelab]
  ports:
    - "6333:6333"
    - "6334:6334"
  volumes:
    - qdrant_data:/qdrant/storage
  environment:
    QDRANT__SERVICE__GRPC_PORT: 6334
  deploy:
    resources:
      limits:
        memory: ${HAL_QDRANT_MEMORY:-512M}   # Set by HAL profile
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://localhost:6333/healthz"]
    interval: 30s
    timeout: 10s
    retries: 3
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.qdrant.rule=Host(`qdrant.homelab.local`)"
    - "traefik.http.routers.qdrant.tls=true"
    - "traefik.http.services.qdrant.loadbalancer.server.port=6333"
  logging:
    driver: "json-file"
    options: { max-size: "10m", max-file: "3" }
```

**Recommended models for N100 (pull on first use):**

| Model                | Size  | Use Case                       | RAM   |
| -------------------- | ----- | ------------------------------ | ----- |
| `llama3.2:3b`      | 2GB   | Fast chat, summarisation       | 3GB   |
| `qwen2.5:7b`       | 4.7GB | Code generation, reasoning     | 5GB   |
| `nomic-embed-text` | 274MB | Embeddings (pgvector / Qdrant) | 500MB |
| `mistral:7b`       | 4.1GB | Instruction following          | 5GB   |

Only run one model at a time. `OLLAMA_MAX_LOADED_MODELS: 1` enforces this. Embedding and completion models cannot both be hot simultaneously on 16GB RAM with the rest of the stack running.

### Phase 39.2 — pgvector Extension

Add to the Postgres init script (`postgres/init/002_extensions.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgaudit;
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pgaudit');
```

**When to use pgvector vs Qdrant:**

- **pgvector** — AI-enhanced CRUD apps where vectors are a secondary feature alongside relational data. Simpler ops, same DB connection.
- **Qdrant** — AI-native apps (RAG, semantic search) where vector operations are the primary workload. Better performance at scale, richer filtering.

### Phase 39.3 — AI Cost Tracking Schema

See `AIUsageRecord`, `AIBudget`, and `AIPromptTemplate` in the Platform Core Schema (Phase 32.1).

### Phase 39.4 — AI Provider Service Implementation

```typescript
// packages/ai-core/src/interfaces/IAIService.ts

export interface IAIService {
  complete(request: AICompleteRequest): Promise<AICompleteResponse>;
  stream(request: AICompleteRequest): AsyncIterable<AIStreamChunk>;
  embed(text: string, options?: AIEmbedOptions): Promise<number[]>;
  runAgent(request: AIAgentRequest): Promise<AIAgentResponse>;
  readonly provider: AIProviderName;
}

export interface AICompleteRequest {
  messages:     AIMessage[];
  system?:      string;
  model?:       string;
  maxTokens?:   number;          // Default: 1024
  temperature?: number;          // Default: 0.7
  tenantId:     string;          // Required — for cost tracking + budget check
  userId:       string;          // Required — for audit log
  moduleId:     string;          // Required — for cost attribution
  metadata?:    Record<string, string>;
}

export interface AIMessage {
  role:    'system' | 'user' | 'assistant' | 'tool';
  content: string | AIContentBlock[];
}

export interface AIAgentRequest extends AICompleteRequest {
  tools:    AITool[];
  maxSteps: number;              // Prevent runaway loops — max 20
  onStep?:  (step: AIAgentStep) => Promise<void>;
}

export interface AITool {
  name:        string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
  execute:     (input: Record<string, unknown>) => Promise<unknown>;
}

export type AIProviderName = 'claude' | 'openai' | 'ollama' | 'openrouter';
```

```typescript
// packages/ai-core/src/AIProviderFactory.ts

export class AIProviderFactory {
  static create(
    providerName: AIProviderName,
    config:        AIProviderConfig,
    db:            PrismaClient,
    redis:         Redis,
  ): IAIService {
    let base: IAIService;

    switch (providerName) {
      case 'claude':
        base = new AnthropicProvider(
          new Anthropic({ apiKey: config.anthropicApiKey }),
          config.defaultModel ?? 'claude-sonnet-4-6'
        );
        break;
      case 'openai':
        base = new OpenAIProvider(
          new OpenAI({ apiKey: config.openaiApiKey }),
          config.defaultModel ?? 'gpt-4o'
        );
        break;
      case 'ollama':
        base = new OllamaProvider(
          config.ollamaBaseUrl ?? 'http://ollama:11434',
          config.defaultModel ?? 'llama3.2:3b'
        );
        break;
      case 'openrouter':
        base = new OpenRouterProvider(
          config.openRouterApiKey!,
          config.defaultModel ?? 'anthropic/claude-sonnet-4-6'
        );
        break;
    }

    // Wrap with cost tracking, budget enforcement, and audit logging
    return new CostTrackingProxy(base, db, redis, config);
  }
}
```

```typescript
// packages/ai-core/src/pii.ts

/**
 * PII scrubbing utility for AI prompts (AI-001 invariant).
 * 
 * scrubPII() coverage table — what it catches and what it deliberately doesn't:
 *
 * CATCHES:
 *   Email addresses        user@example.com           → [EMAIL_REDACTED]
 *   US phone numbers       (555) 867-5309             → [PHONE_REDACTED]
 *   US SSNs                123-45-6789                → [SSN_REDACTED]
 *   Credit card numbers    4111 1111 1111 1111       → [CREDIT_CARD_REDACTED]
 *   IPv4 addresses         192.168.1.1                → [IP_REDACTED]
 *
 * KNOWN GAPS (intentional — fix in v2 with presidio-analyzer):
 *   - Non-US phone formats (international numbers)
 *   - Passport / national ID numbers
 *   - Full names / person names
 *   - Physical addresses
 *   - Dates of birth
 *   - IBANs / non-US financial identifiers
 *   - Custom tenant-specific PII patterns
 *
 * PRODUCTION UPGRADE PATH:
 *   Replace with @presidio-js/presidio-analyzer which handles all of the above.
 *   Current regex approach is an MVP guard, not a compliance guarantee.
 *   Do NOT represent this as GDPR/HIPAA compliant PII redaction.
 */
export function scrubPII(text: string): string {
  // Email pattern
  let result = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  
  // Phone pattern (US formats)
  result = result.replace(/\b(\+1)?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');
  
  // SSN pattern
  result = result.replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, '[SSN_REDACTED]');
  
  // Credit card pattern
  result = result.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[CREDIT_CARD_REDACTED]');
  
  // IP address pattern
  result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]');
  
  return result;
}
```

```typescript
// packages/ai-core/src/CostTrackingProxy.ts

/**
 * Wraps any IAIService to add:
 *   · Budget check BEFORE every call (throws BudgetExceededError)
 *   · PII scrubbing BEFORE every call (AI-001 invariant)
 *   · Retry with exponential backoff on transient failures
 *   · Circuit breaker to prevent cascade failures
 *   · Token counting + cost calculation AFTER every call
 *   · Writes AIUsageRecord to DB
 *   · Increments AIBudget.currentMonthUsd
 *   · Publishes Prometheus metric kilo_ai_cost_usd_total
 */
export class CostTrackingProxy implements IAIService {
  private readonly RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
  private readonly MAX_ATTEMPTS = 4;
  private readonly BASE_DELAY_MS = 1000;

  async complete(request: AICompleteRequest): Promise<AICompleteResponse> {
    await this.checkBudget(request.tenantId, request.userId);
    
    // AI-001: Scrub PII from user messages before sending to AI
    const scrubbedMessages = request.messages.map(msg => {
      if (msg.role === 'user') {
        return { ...msg, content: scrubPII(msg.content) };
      }
      return msg;
    });
    const scrubbedRequest = { ...request, messages: scrubbedMessages };
    
    // Retry loop with exponential backoff
    let lastError: Error;
    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      try {
        this.circuitBreaker.assertClosed(request.provider);
        
        const start    = Date.now();
        const response = await this.inner.complete(scrubbedRequest);
        this.circuitBreaker.recordSuccess(request.provider);
        await this.recordUsage(request, response, Date.now() - start);
        return response;

      } catch (err) {
        lastError = err as Error;
        const statusCode = (err as any).statusCode;

        // Don't retry budget errors, auth errors, or non-5xx/429 errors
        if (
          err instanceof BudgetExceededError ||
          (statusCode && statusCode < 500 && statusCode !== 429)
        ) {
          throw err;
        }

        this.circuitBreaker.recordFailure(request.provider);

        if (attempt < this.MAX_ATTEMPTS) {
          // Exponential backoff with jitter: 1s, 2s, 4s + random 0-500ms
          const delay = 
            this.BASE_DELAY_MS * Math.pow(2, attempt - 1) + 
            Math.random() * 500;
          this.logger.warn({ attempt, delay, provider: request.provider }, 
            'AI call failed, retrying');
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async checkBudget(tenantId: string, userId: string): Promise<void> {
    const cacheKey = `ai-budget:${tenantId}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached === 'exceeded') throw new BudgetExceededError(tenantId);
    if (cached !== null) return;

    const budget = await this.db.aIBudget.findUnique({ where: { workspaceId: tenantId } });
    if (!budget) return;

    if (budget.currentMonthUsd.gte(budget.monthlyLimitUsd)) {
      await this.redis.setex(cacheKey, 60, 'exceeded');
      throw new BudgetExceededError(tenantId);
    }

    await this.redis.setex(cacheKey, 60, 'ok');
  }

  private pricingCacheTTL = 86400; // 24 hours

  private async calculateCost(provider: AIProviderName, model: string,
    promptTokens: number, outputTokens: number): Promise<Decimal> {
    // Query DB for current pricing (cached 24h in Redis)
    const cacheKey = `ai_pricing:${provider}:${model}`;
    const cached = await this.redis.get(cacheKey);
    
    let prices: { input: number; output: number };
    if (cached) {
      prices = JSON.parse(cached);
    } else {
      // Query pricing table - get current effective price
      const pricing = await this.db.aiProviderPricing.findFirst({
        where: {
          provider,
          model,
          effectiveFrom: { lte: new Date() },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: new Date() } }
          ]
        },
        orderBy: { effectiveFrom: 'desc' }
      });
      
      if (!pricing) {
        // Fallback for unknown models (e.g., local Ollama)
        prices = { input: 0, output: 0 };
      } else {
        prices = { 
          input: Number(pricing.inputCostPerMillion), 
          output: Number(pricing.outputCostPerMillion) 
        };
      }
      
      await this.redis.setex(cacheKey, this.pricingCacheTTL, JSON.stringify(prices));
    }

    return new Decimal(promptTokens).div(1_000_000).mul(prices.input)
      .plus(new Decimal(outputTokens).div(1_000_000).mul(prices.output));
  }
}

// Prisma schema for AI pricing (add to platform schema)
/*
model AIProviderPricing {
  id                   String   @id @default(uuid())
  provider             String   // 'anthropic', 'openai', 'ollama'
  model                String   // 'claude-sonnet-4-6', 'gpt-4o', etc.
  inputCostPerMillion  Decimal  @db.Decimal(12, 6)  // $ per 1M input tokens
  outputCostPerMillion Decimal  @db.Decimal(12, 6)  // $ per 1M output tokens
  effectiveFrom        DateTime
  effectiveTo          DateTime?
  createdAt            DateTime @default(now())
  @@index([provider, model, effectiveFrom])
}
*/

// n8n workflow: Monthly AI Price Update
// - Fetches latest pricing from provider APIs or manual input
// - Writes new rows to ai_provider_pricing table
// - No code change required when prices update


// ── Circuit Breaker for AI Providers ─────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number;
  successCount: number;
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker to prevent cascade failures when AI providers are down.
 * Thresholds can be tuned per hardware profile.
 */
export class AICircuitBreaker {
  private providers = new Map<string, ProviderState>();

  // Thresholds — tune per homelab hardware profile
  private readonly FAILURE_THRESHOLD  = 5;    // failures before opening
  private readonly RECOVERY_TIMEOUT   = 60_000; // 60s before trying HALF_OPEN
  private readonly SUCCESS_THRESHOLD  = 2;    // successes in HALF_OPEN before re-closing

  assertClosed(provider: string): void {
    const s = this.getState(provider);
    if (s.state === 'OPEN') {
      const elapsed = Date.now() - s.openedAt;
      if (elapsed >= this.RECOVERY_TIMEOUT) {
        s.state = 'HALF_OPEN'; // Allow one probe
      } else {
        throw new CircuitOpenError(
          `AI provider "${provider}" circuit is OPEN. ` +
          `Retry in ${Math.ceil((this.RECOVERY_TIMEOUT - elapsed) / 1000)}s.`
        );
      }
    }
  }

  recordSuccess(provider: string): void {
    const s = this.getState(provider);
    if (s.state === 'HALF_OPEN') {
      s.successCount = (s.successCount ?? 0) + 1;
      if (s.successCount >= this.SUCCESS_THRESHOLD) {
        s.state        = 'CLOSED';
        s.failureCount = 0;
        logger.info({ provider }, 'AI circuit breaker re-closed after recovery');
      }
    } else {
      s.failureCount = 0; // Reset on any success while CLOSED
    }
  }

  recordFailure(provider: string): void {
    const s = this.getState(provider);
    s.failureCount++;
    s.lastFailureAt = Date.now();

    if (s.state === 'HALF_OPEN' || s.failureCount >= this.FAILURE_THRESHOLD) {
      s.state    = 'OPEN';
      s.openedAt = Date.now();
      logger.error({ provider, failures: s.failureCount }, 'AI circuit breaker OPENED');
      // Emit metric for Grafana alert
      metrics.increment('kilo_ai_circuit_open_total', { provider });
    }
  }

  private getState(provider: string): ProviderState {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureAt: 0,
        openedAt: 0,
        successCount: 0
      });
    }
    return this.providers.get(provider)!;
  }
}


export class BudgetExceededError extends Error {
  constructor(tenantId: string) {
    super(`Workspace "${tenantId}" has exceeded its monthly AI budget.`);
    this.name = 'BudgetExceededError';
  }
}
```

### Phase 39.5 — Vector Store Router

```typescript
// packages/ai-core/src/interfaces/IVectorStoreRouter.ts

export interface IVectorStoreRouter {
  forTenant(tenantId: string, collectionHint?: 'qdrant' | 'pgvector'): IVectorStore;
}

export interface IVectorStore {
  upsert(vectors: VectorRecord[]): Promise<void>;
  search(query: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
  get(ids: string[]): Promise<VectorRecord[]>;
}

export interface VectorRecord {
  id:      string;
  vector:  number[];
  payload: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?:          number;    // Default: 10
  scoreThreshold?: number;    // Default: 0.7
  filter?:         Record<string, unknown>;
}
```

Qdrant collections are namespaced as `tenant_{tenantId}_{collectionName}`. Every Qdrant search always includes a `tenantId` filter in the payload (enforced by AI-013). pgvector queries always include a `tenantId` WHERE clause (enforced by AI-014).

### Phase 39.6 — AI Environment Variables

```bash
# AI Provider Selection
AI_DEFAULT_PROVIDER=ollama          # claude | openai | ollama | openrouter

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-6

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini

# Ollama (local)
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_DEFAULT_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text

# OpenRouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4-6

# AI safety
AI_DEFAULT_MAX_TOKENS=1024
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_RETRIES=2

# Per-workspace budget defaults (USD/month, 0 = unlimited)
AI_DEFAULT_MONTHLY_BUDGET_USD=10.00
AI_BUDGET_ALERT_THRESHOLD=0.80    # Alert at 80% of budget
```

---

## Phase 40 — HR Module Scaffold

The HR module was declared in the platform manifest but needed its own scaffold implementation. It follows the exact `IModule` pattern of the Accounting module.

**`kilo/scaffold/scripts/modules/hr.sh`** — T3 or SvelteKit base. Schema:

```prisma
// packages/modules/hr/schema.prisma

model HREmployee {
  id             String           @id @default(uuid())
  workspaceId    String
  employeeNumber String
  userId         String?
  firstName      String
  lastName       String
  email          String
  departmentId   String?
  department     HRDepartment?    @relation(fields: [departmentId], references: [id])
  managerId      String?
  manager        HREmployee?      @relation("reports", fields: [managerId], references: [id])
  reports        HREmployee[]     @relation("reports")
  position       String
  employmentType HREmploymentType @default(FULL_TIME)
  startDate      DateTime
  endDate        DateTime?
  status         HREmployeeStatus @default(ACTIVE)
  salaryBand     String?
  payrollRecords HRPayrollRecord[]
  leaveBalances  HRLeaveBalance[]
  createdAt      DateTime         @default(now())
  deletedAt      DateTime?
  @@unique([workspaceId, employeeNumber])
  @@index([workspaceId, status])
  @@index([workspaceId, departmentId])
}

enum HREmploymentType  { FULL_TIME PART_TIME CONTRACT INTERN }
enum HREmployeeStatus  { ACTIVE ON_LEAVE TERMINATED }

model HRDepartment {
  id          String         @id @default(uuid())
  workspaceId String
  name        String
  code        String
  parentId    String?
  parent      HRDepartment?  @relation("subdepts", fields: [parentId], references: [id])
  children    HRDepartment[] @relation("subdepts")
  employees   HREmployee[]
  @@unique([workspaceId, code])
}

model HRPayrollPeriod {
  id          String           @id @default(uuid())
  workspaceId String
  name        String           // "January 2026 Payroll"
  startDate   DateTime
  endDate     DateTime
  payDate     DateTime
  status      PayrollStatus    @default(OPEN)
  processedAt DateTime?
  processedBy String?
  records     HRPayrollRecord[]
  @@index([workspaceId, status])
}

enum PayrollStatus { OPEN PROCESSING COMPLETED REVERSED }

model HRPayrollRecord {
  id             String          @id @default(uuid())
  periodId       String
  period         HRPayrollPeriod @relation(fields: [periodId], references: [id])
  employeeId     String
  employee       HREmployee      @relation(fields: [employeeId], references: [id])
  grossPay       Decimal         @db.Decimal(19, 4)
  deductions     Decimal         @db.Decimal(19, 4)
  netPay         Decimal         @db.Decimal(19, 4)
  journalEntryId String?         // Links to Accounting module when posted
  @@unique([periodId, employeeId])
}

model HRLeaveType {
  id          String @id @default(uuid())
  workspaceId String
  name        String
  code        String
  daysPerYear Int
  @@unique([workspaceId, code])
}

model HRLeaveBalance {
  id          String     @id @default(uuid())
  employeeId  String
  employee    HREmployee @relation(fields: [employeeId], references: [id])
  leaveTypeId String
  year        Int
  entitlement Int
  used        Int        @default(0)
  pending     Int        @default(0)
  // FIXED: Postgres generated column — computed by DB, impossible to desync
  remaining   Int        @default(dbgenerated("entitlement - used - pending"))
}

model HRLeaveRequest {
  id           String             @id @default(uuid())
  workspaceId  String
  employeeId   String
  leaveTypeId  String
  startDate    DateTime
  endDate      DateTime
  days         Int
  reason       String?
  status       LeaveRequestStatus @default(PENDING)
  approvedBy   String?
  approvedAt   DateTime?
  @@index([workspaceId, status])
  @@index([employeeId, startDate])
}

enum LeaveRequestStatus { PENDING APPROVED REJECTED CANCELLED }
```

HR module publishes: `hr.employee.created`, `hr.payroll.completed`, `hr.leave.approved`. Subscribes to: `accounting.fiscal_period.locked` (blocks payroll if period is locked).

**HR Invariants:**

| ID     | Severity | Description                                                                |
| ------ | -------- | -------------------------------------------------------------------------- |
| HR-001 | T1       | Payroll records use `@db.Decimal(19,4)` — never Float                   |
| HR-002 | T1       | `processedAt` on payroll period is immutable once set                    |
| HR-003 | T1       | Payroll posting links to `journalEntryId` in Accounting module           |
| HR-004 | T2       | Leave balance `remaining` always equals `entitlement - used - pending` |

---

## Phase 40.1 — Auth.js Session Configuration

Complete Auth.js session config template for all scaffolds (t3/nextjs/sveltekit):

```typescript
// src/lib/auth.ts (generated by scaffold)

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(db),
  
  session: {
    strategy: 'database',  // NOT jwt — database sessions are revocable
    maxAge:   8 * 60 * 60, // 8 hours — balances UX with security
    updateAge: 60 * 60,    // Refresh session record every 1 hour of activity
  },

  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path:     '/',
        secure:   process.env.NODE_ENV === 'production',
        // maxAge mirrors session.maxAge — cookie and session expire together
        maxAge:   8 * 60 * 60,
      }
    }
  },

  callbacks: {
    async session({ session, user }) {
      // Attach tenantId + role to every session for tRPC context
      session.user.id       = user.id;
      session.user.tenantId = user.tenantId;
      session.user.role     = user.role;
      return session;
    }
  },

  events: {
    // TOKEN REVOCATION ON PASSWORD CHANGE — the missing piece
    // When a user changes their password, invalidate all existing sessions
    async updateUser({ user }) {
      if (user.passwordChangedAt) {
        await db.session.deleteMany({
          where: {
            userId: user.id,
            // Delete all sessions created before the password change
            createdAt: { lt: user.passwordChangedAt }
          }
        });
        logger.info({ userId: user.id }, 'Sessions revoked after password change');
      }
    }
  }
};
```

**Why `strategy: 'database'` not `'jwt'`:** JWT sessions cannot be revoked without a blocklist. For a multi-tenant financial platform, you need the ability to kill sessions on password change, suspicious activity, or admin action. The database strategy makes `db.session.deleteMany({ where: { userId } })` your revocation primitive.

---

## Phase 40.2 — Refresh Token Rotation for JWT Stacks (MERN/extjs)

**Applies to:** MERN, extjs stacks only. Database-session stacks (T3, Next.js + Auth.js, Laravel, Rails) use Phase 40.1's `strategy: 'database'` which handles revocation natively.

### Why JWT Stacks Need Token Rotation

MERN and extjs scaffolds use JWT for sessions. JWTs are stateless — once issued, the server cannot revoke them without a blocklist or short expiry. Refresh token rotation solves this by:

1. **Short-lived access tokens** (15 min) — limits exposure window
2. **Rotating refresh tokens** — each refresh yields a new access token + new refresh token
3. **Family-based replay detection** — detects if a stolen refresh token is replayed after legitimate rotation

### Database Schema

```prisma
// prisma/schema.prisma
model RefreshToken {
  id            String   @id @default(cuid())
  token         String   @unique // hashed refresh token
  familyId      String   @index // groups all tokens from same authentication session
  userId        String   @map("user_id")
  workspaceId   String?  @map("workspace_id")
  expiresAt     DateTime @map("expires_at")
  revokedAt     DateTime? @map("revoked_at")
  replacedById  String?  @map("replaced_by_id") // link to new token if rotated
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace     Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  replacedBy    RefreshToken? @relation("TokenRotation", fields: [replacedById], references: [id])
  replacedTokens RefreshToken[] @relation("TokenRotation")

  @@map("refresh_tokens")
}

// Compound index for efficient family lookup during replay detection
@@index([familyId, revokedAt])
```

### tokenRotation.ts Implementation

```typescript
// src/lib/tokenRotation.ts
import { db } from './db.server';
import { crypto } from 'crypto';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes
const FAMILY_REPLAY_THRESHOLD = 5 * 60 * 1000; // 5 minutes

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function hashToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export async function issueTokens(
  userId: string,
  workspaceId?: string
): Promise<TokenPair> {
  const familyId = crypto.randomUUID();
  const refreshToken = generateToken();
  const accessToken = generateToken(); // In production, sign with JWT secret

  await db.refreshToken.create({
    data: {
      token: await hashToken(refreshToken),
      familyId,
      userId,
      workspaceId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    },
  });

  return { accessToken, refreshToken };
}

export async function rotateTokens(
  refreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<TokenPair> {
  const tokenHash = await hashToken(refreshToken);

  // Find the current token
  const current = await db.refreshToken.findUnique({
    where: { token: tokenHash },
    include: { replacedBy: true },
  });

  if (!current) {
    throw new Error('Invalid refresh token');
  }

  if (current.revokedAt) {
    // Token already revoked — check for replay attack
    await detectReplayAttack(current.familyId, current.userId, ipAddress);
    throw new Error('Token already used');
  }

  if (new Date() > current.expiresAt) {
    throw new Error('Refresh token expired');
  }

  // Family-based replay detection: check recent tokens in family
  const recentInFamily = await db.refreshToken.findMany({
    where: {
      familyId: current.familyId,
      revokedAt: { not: null },
      createdAt: { gt: new Date(Date.now() - FAMILY_REPLAY_THRESHOLD) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentInFamily.length > 0) {
    // Legitimate rotation happened recently — revoke the stolen token
    await db.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    
    // Audit log for security team
    console.warn(`[SECURITY] Possible token replay detected for user ${current.userId}`, {
      familyId: current.familyId,
      ipAddress,
      userAgent,
      previousTokenUsedAt: recentInFamily[0].createdAt,
    });

    // Optionally: revoke entire family to force re-login
    // await revokeEntireFamily(current.familyId, current.userId);
  }

  // Revoke current token
  await db.refreshToken.update({
    where: { id: current.id },
    data: { revokedAt: new Date() },
  });

  // Issue new tokens
  const newAccessToken = generateToken();
  const newRefreshToken = generateToken();

  await db.refreshToken.create({
    data: {
      token: await hashToken(newRefreshToken),
      familyId: current.familyId, // Same family — links the rotation chain
      userId: current.userId,
      workspaceId: current.workspaceId || undefined,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
      replacedById: current.id, // Link to previous token
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

async function detectReplayAttack(
  familyId: string,
  userId: string,
  ipAddress?: string
): Promise<void> {
  // Log attempt for security monitoring
  await db.securityEvent.create({
    data: {
      type: 'TOKEN_REPLAY_DETECTED',
      userId,
      metadata: { familyId, ipAddress },
    },
  });

  // Optional: trigger account lockout after N attempts
  const recentAttempts = await db.securityEvent.count({
    where: {
      type: 'TOKEN_REPLAY_DETECTED',
      userId,
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  if (recentAttempts >= 5) {
    // Auto-lock account after 5 replay attempts in 1 hour
    await db.user.update({
      where: { id: userId },
      data: { lockedAt: new Date() },
    });
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeToken(refreshToken: string): Promise<void> {
  const tokenHash = await hashToken(refreshToken);
  await db.refreshToken.updateMany({
    where: { token: tokenHash },
    data: { revokedAt: new Date() },
  });
}
```

### API Endpoints

```typescript
// src/routes/auth/refresh.ts
import { rotateTokens } from '~/lib/tokenRotation';

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const refreshToken = formData.get('refresh_token') as string;

  if (!refreshToken) {
    return json({ error: 'Refresh token required' }, { status: 400 });
  }

  try {
    const tokens = await rotateTokens(
      refreshToken,
      request.headers.get('x-forwarded-for') || undefined,
      request.headers.get('user-agent') || undefined
    );

    return json({ 
      access_token: tokens.accessToken, 
      refresh_token: tokens.refreshToken,
      expires_in: 900 // 15 minutes in seconds
    });
  } catch (error) {
    return json({ error: error.message }, { status: 401 });
  }
};
```

### Security Considerations

| Concern | Mitigation |
|---------|------------|
| Token theft via XSS | HttpOnly cookies for refresh token, short access token TTL |
| Replay attack | Family-based detection + auto-lockout after threshold |
| Token leakage in logs | Refresh token hashed in DB, never logged |
| Brute force | Rate limit refresh endpoint (5 req/min per IP) |
| Long-lived tokens | 7-day TTL with rotation on each use |

### Cleanup Job

Add a cron job to purge expired/revoked tokens:

```typescript
// src/jobs/cleanupTokens.ts
export async function cleanupExpiredTokens() {
  const result = await db.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { 
          revokedAt: { not: null },
          createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days after revocation
        }
      ]
    }
  });
  console.log(`Cleaned up ${result.count} refresh tokens`);
}
```

**Schedule:** Run daily at 3 AM UTC.

---

## Phase 41 — AI Scaffold Templates

Four AI scaffold templates. All emit the same base artifacts as SaaS scaffolds plus AI-specific additions: `src/lib/ai.ts`, `src/lib/vectorStore.ts`, `src/lib/promptTemplates.ts`, and test files.

### Phase 41.1 — AI Chat / RAG Scaffold (`ai-rag`)

**Stack:** T3 (Next.js + tRPC + Auth.js + Prisma). **Vector store:** Qdrant (tenant-namespaced). **Use cases:** Document Q&A, internal knowledge base, semantic search, customer support bot.

```
src/
├── lib/
│   ├── ai.ts                 ← IAIService singleton
│   ├── vectorStore.ts        ← Qdrant client with tenant isolation
│   ├── chunker.ts            ← Text chunking (recursive, 512 tokens, 50 overlap)
│   ├── embedder.ts           ← Wraps ai.embed() + caches in Redis
│   ├── retriever.ts          ← RAG retrieval: embed query → search → rerank
│   ├── promptTemplates.ts    ← System prompt + RAG context injection template
│   └── streamResponse.ts     ← Vercel AI SDK useChat wiring
├── server/api/routers/
│   ├── chat.ts               ← tRPC: sendMessage, getHistory, clearHistory
│   ├── documents.ts          ← tRPC: uploadDocument, listDocuments, deleteDocument
│   └── ingest.ts             ← tRPC: triggerIngest, getIngestStatus
├── app/
│   ├── chat/page.tsx          ← Chat UI (shadcn/ui Message + useChat hook)
│   └── documents/page.tsx     ← Document manager (upload, status, delete)
└── workers/
    └── ingestWorker.ts        ← BullMQ: parse PDF/DOCX → chunk → embed → upsert Qdrant
```

**Schema additions:**

```prisma
model RagDocument {
  id         String       @id @default(uuid())
  tenantId   String
  name       String
  mimeType   String
  sizeBytes  Int
  status     IngestStatus @default(PENDING)
  chunkCount Int          @default(0)
  ingestedAt DateTime?
  createdBy  String
  createdAt  DateTime     @default(now())
  deletedAt  DateTime?
  chunks     RagChunk[]
  @@index([tenantId, status])
}

enum IngestStatus { PENDING PROCESSING READY FAILED }

model RagChunk {
  id         String      @id @default(uuid())
  documentId String
  document   RagDocument @relation(fields: [documentId], references: [id])
  tenantId   String
  content    String
  chunkIndex Int
  qdrantId   String
  tokenCount Int
  @@index([tenantId, documentId])
}

model ChatSession {
  id        String        @id @default(uuid())
  tenantId  String
  userId    String
  title     String        @default("New chat")
  createdAt DateTime      @default(now())
  messages  ChatMessage[]
  @@index([tenantId, userId])
}

model ChatMessage {
  id         String      @id @default(uuid())
  sessionId  String
  session    ChatSession @relation(fields: [sessionId], references: [id])
  role       MessageRole
  content    String
  sources    Json?       // Array of { documentId, chunkIndex, score }
  tokenCount Int         @default(0)
  createdAt  DateTime    @default(now())
}

enum MessageRole { USER ASSISTANT SYSTEM }
```

**Core RAG logic:**

```typescript
// src/server/api/routers/chat.ts

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(z.object({ sessionId: z.string(), content: z.string().max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.session.user;

      // 1. Save user message
      await ctx.db.chatMessage.create({
        data: { sessionId: input.sessionId, role: 'USER', content: input.content }
      });

      // 2. Retrieve relevant context from Qdrant (always includes tenantId filter)
      const queryEmbedding = await embedder.embed(input.content);
      const chunks = await vectorStore.search(queryEmbedding, {
        limit: 5, scoreThreshold: 0.72
      });

      // 3. Build augmented prompt
      const context = chunks.map(c => c.payload.content as string).join('\n\n---\n\n');
      const messages = await buildMessageHistory(ctx.db, input.sessionId);

      // 4. Return stream — client receives chunks immediately, not after full completion
      // The mutation returns a stream that the client can consume via Vercel AI SDK's useChat
      const stream = await ctx.ai.stream({
        messages,
        system: RAG_SYSTEM_PROMPT.replace('{{context}}', context),
        tenantId, userId, moduleId: 'ai-rag',
      });

      // Save completed message asynchronously after stream completes
      // Use onFinish callback to persist after client has received full response
      const { fullResponse } = await stream.observe(
        (await import('ai')).streamText(stream)
      );

      await ctx.db.chatMessage.create({
        data: {
          sessionId: input.sessionId, role: 'ASSISTANT', content: fullResponse,
          sources: chunks.map(c => ({ qdrantId: c.id, score: c.score })),
        }
      });

      return stream;
    }),
});
```

> **Note:** For true streaming that reaches the client immediately (not accumulated server-side), use a Next.js Route Handler instead of tRPC mutation:

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { sessionId, content } = await req.json();
  // ... auth, embedding, retrieval ...
  
  const result = streamText({
    model: ollamaModel('llama3.2:3b'),
    messages: augmentedMessages,
    onFinish: async ({ text }) => {
      // Save after stream ends
      await db.chatMessage.create({ data: { sessionId, role: 'ASSISTANT', content: text } });
    }
  });

  return result.toDataStreamResponse(); // True streaming to client
}
```

### Phase 41.2 — AI-Enhanced CRUD Scaffold (`ai-enhanced`)

**Stack:** Any SaaS stack (T3, SvelteKit, Next.js App Router) + AI overlay. **Vector store:** pgvector (lightweight). **AI patterns:** Copilot sidebar, auto-fill suggestions, background classification, conversational search.

Invoked as: `scaffold.sh myapp ai-enhanced --base=t3 --patterns=copilot,classify,search`

Added to any SaaS scaffold:

```
src/lib/
├── ai.ts                ← Provider factory singleton
├── aiCopilot.ts         ← Copilot: "explain this record", "suggest next action"
├── aiClassifier.ts      ← Background: classify/tag records via BullMQ worker
├── aiSearch.ts          ← Semantic search over app records using pgvector
└── aiAutoFill.ts        ← Smart form suggestions from context + examples
```

**pgvector schema addition:**

```prisma
model RecordEmbedding {
  id         String   @id @default(uuid())
  tenantId   String
  recordType String   // e.g. "Invoice", "Contact", "Ticket"
  recordId   String
  content    String
  embedding  Unsupported("vector(1536)")  // pgvector column
  model      String
  createdAt  DateTime @default(now())
  @@unique([tenantId, recordType, recordId])
  @@index([tenantId, recordType])
}
// Migration: CREATE INDEX ON "RecordEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Copilot implementation:**

```typescript
// src/lib/aiCopilot.ts

export async function explainRecord(
  ai: IAIService, record: Record<string, unknown>,
  schema: string, tenantId: string, userId: string,
): Promise<string> {
  return (await ai.complete({
    messages: [{
      role: 'user',
      content: `Given this ${schema} record: ${JSON.stringify(record, null, 2)}\n\n` +
               `Provide a brief, plain-language explanation of what this record represents ` +
               `and flag anything that looks unusual.`
    }],
    system: `You are a business data assistant. Be concise (2-3 sentences max). ` +
            `Never include raw IDs or timestamps in your explanation.`,
    tenantId, userId, moduleId: 'ai-enhanced',
    maxTokens: 200,
  })).content;
}
```

### Phase 41.3 — AI Agent Scaffold (`ai-agent`)

**Stack:** T3 + Vercel AI SDK. **AI patterns:** Autonomous task execution, tool-calling loops, agent builder platforms.

```
src/lib/
├── ai.ts
├── agentRunner.ts      ← Manages tool-calling loop (max 20 steps)
├── toolRegistry.ts     ← Registers available tools for agents
├── agentMemory.ts      ← Short-term (session) + long-term (Qdrant) memory
└── humanInLoop.ts      ← Pauses agent and sends approval request to user
```

**Schema additions:**

```prisma
model AIAgent {
  id           String       @id @default(uuid())
  tenantId     String
  name         String
  description  String?
  systemPrompt String
  tools        String[]
  maxSteps     Int          @default(10)
  isActive     Boolean      @default(true)
  createdBy    String
  createdAt    DateTime     @default(now())
  runs         AIAgentRun[]
}

model AIAgentRun {
  id          String         @id @default(uuid())
  agentId     String
  agent       AIAgent        @relation(fields: [agentId], references: [id])
  tenantId    String
  userId      String
  input       String
  output      String?
  status      AgentRunStatus @default(RUNNING)
  steps       AIAgentRunStep[]
  totalTokens Int            @default(0)
  startedAt   DateTime       @default(now())
  completedAt DateTime?
  @@index([tenantId, status])
}

enum AgentRunStatus { RUNNING WAITING_APPROVAL COMPLETED FAILED CANCELLED }

model AIAgentRunStep {
  id         String     @id @default(uuid())
  runId      String
  run        AIAgentRun @relation(fields: [runId], references: [id])
  stepNumber Int
  toolName   String
  toolInput  Json
  toolOutput Json?
  approved   Boolean?   // Null = not a human-in-loop step
  createdAt  DateTime   @default(now())
}
```

All tools that write data require `requiresApproval: true` — enforced by AI-011.

### Phase 41.4 — AI Financial Analysis Scaffold (`ai-financial`)

**Stack:** T3 (extends accounting scaffold). **AI patterns:** GL account classification, anomaly detection, cash flow forecasting.

Invoked as: `scaffold.sh myapp ai-financial --base=accounting --features=classify,anomaly,forecast`

```typescript
// src/lib/aiFinancial.ts
import { z } from 'zod';

/**
 * Zod schema for GL classification response validation.
 * Enforces strict types and formats to prevent prompt injection and parse errors.
 */
const glClassificationSchema = z.object({
  accountCode: z.string().regex(/^\d{4,6}$/, 'Account code must be 4-6 digits'),
  confidence:  z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  reasoning:  z.string().max(500, 'Reasoning must be under 500 characters')
});

/**
 * Classifies a transaction description to the most likely GL account.
 * Returns confidence score — below 0.8 requires human confirmation.
 * NEVER auto-posts without human review (AI-FIN-001 invariant).
 */
export async function classifyGLAccount(
  ai: IAIService, description: string, amount: Decimal,
  chartOfAccounts: ChartAccount[], tenantId: string, userId: string,
): Promise<{ accountId: string; confidence: number; reasoning: string }> {
  const accountList = chartOfAccounts
    .map(a => `${a.code}: ${a.name} (${a.type})`)
    .join('\n');

  const response = await ai.complete({
    messages: [{
      role: 'user',
      content: `Transaction: "${description}" Amount: ${amount.toFixed(2)}\n\n` +
               `Chart of accounts:\n${accountList}\n\n` +
               `Return JSON: { "accountCode": "string", "confidence": 0.0-1.0, "reasoning": "string" }`
    }],
    system: `You are an accounting expert. Classify transactions to GL accounts. ` +
            `Be conservative — return low confidence if unsure. ` +
            `Return ONLY valid JSON, no other text.`,
    tenantId, userId, moduleId: 'ai-financial',
    maxTokens: 200,
    temperature: 0.1,  // Low temperature — accounting needs consistency
  });

  // Parse with Zod — fails gracefully instead of throwing unhandled errors
  let parsed: z.infer<typeof glClassificationSchema>;
  try {
    parsed = glClassificationSchema.parse(JSON.parse(response.content));
  } catch (e) {
    // Log the unparseable response for debugging
    console.warn({ content: response.content }, 'GL classifier returned unparseable response');
    
    // Return low-confidence result to route to human review instead of 500 error
    return { 
      accountId: '', 
      confidence: 0, 
      reasoning: 'AI response could not be parsed. Human review required.' 
    };
  }

  const account = chartOfAccounts.find(a => a.code === parsed.accountCode);
  if (!account) {
    // Unknown account code — route to human review rather than crash
    return { 
      accountId: '', 
      confidence: 0, 
      reasoning: `AI returned unknown account code: ${parsed.accountCode}. Human review required.` 
    };
  }

  // AI-FIN-001: Confidence below 0.8 requires human review before auto-posting
  // The caller MUST check this and route to human review workflow
  if (parsed.confidence < 0.8) {
    return { 
      accountId: account.id, 
      confidence: parsed.confidence, 
      reasoning: `${parsed.reasoning} [REQUIRES_HUMAN_REVIEW: confidence ${parsed.confidence} < 0.8]` 
    };
  }

  return { accountId: account.id, confidence: parsed.confidence, reasoning: parsed.reasoning };
}

/**
 * Detects anomalous transactions using statistical + AI analysis.
 * NEVER modifies data — read-only analysis only (AI-FIN-002 invariant).
 * Uses Zod for safe JSON parsing with graceful fallback.
 */
export async function detectAnomalies(
  ai: IAIService, entries: JournalEntry[], history: JournalEntry[],
  tenantId: string, userId: string,
): Promise<AnomalyReport[]> {
  const outliers = statisticalOutliers(entries, history);
  if (outliers.length === 0) return [];

  const response = await ai.complete({
    messages: [{
      role: 'user',
      content: `Review these potentially anomalous journal entries:\n` +
               JSON.stringify(outliers, null, 2) +
               `\nFor each, provide: { id, severity: "low|medium|high", reason, recommendation}`
    }],
    system: `You are an auditor reviewing financial transactions for anomalies. ` +
            `Consider: unusual amounts, odd timing, unusual account combinations, round numbers. ` +
            `Return ONLY a JSON array.`,
    tenantId, userId, moduleId: 'ai-financial',
    maxTokens: 1000,
    temperature: 0.2,
  });

  // Parse with Zod — fails gracefully instead of throwing unhandled errors
  try {
    const parsed = anomalyArraySchema.parse(JSON.parse(response.content));
    return parsed.map(p => ({ 
      entryId: p.id, 
      severity: p.severity, 
      reason: p.reason, 
      recommendation: p.recommendation 
    }));
  } catch (e) {
    console.warn({ content: response.content }, 'Anomaly detector returned unparseable response');
    return [];  // Return empty to avoid breaking UI — anomalies can be reviewed manually
  }
}
```

**AI Financial Invariants:**

| ID         | Severity | Description                                                                                          |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| AI-FIN-001 | T1       | AI GL classification confidence < 0.8 requires human review — never auto-posts                      |
| AI-FIN-002 | T1       | AI financial analysis is read-only — never calls `writeAuditLog` with CREATE/UPDATE/DELETE        |
| AI-FIN-003 | T1       | All AI financial recommendations stored in `AIRecommendation` table with accepted/rejected outcome |

---

## Phase 42 — AI Kilo Invariants (18 new — AI-* prefix)

| ID         | Scope        | Severity | Description                                                                           |
| ---------- | ------------ | -------- | ------------------------------------------------------------------------------------- |
| AI-001     | All AI       | T1       | No raw PII in AI prompts without scrubbing — tenantId/userId only in metadata        |
| AI-002     | All AI       | T1       | All AI calls go through IAIService — never call provider SDK directly                |
| AI-003     | All AI       | T1       | `tenantId`, `userId`, and `moduleId` required on every IAIService call          |
| AI-004     | All AI       | T1       | AI response content never rendered as raw HTML — always sanitised or markdown-parsed |
| AI-005     | All AI       | T1       | User input never directly concatenated into system prompt (prompt injection guard)    |
| AI-006     | Agent        | T1       | `runAgent` always specifies `maxSteps <= 20`                                      |
| AI-007     | All AI       | T2       | Streaming responses include loading/error states — never render partial JSON         |
| AI-008     | All AI       | T2       | `AIUsageRecord` written after every completion                                      |
| AI-009     | RAG          | T1       | RAG responses cite source chunks — never assert facts without retrieved context      |
| AI-010     | RAG          | T2       | RAG retrieval score threshold >= 0.7 — no low-confidence chunks injected             |
| AI-011     | Agent        | T1       | Agent tools that write data require `requiresApproval: true`                        |
| AI-012     | Agent        | T1       | Agent run wall-clock timeout <= 120 seconds                                           |
| AI-013     | All AI       | T1       | Qdrant searches always include `tenantId` filter — no cross-tenant data leakage    |
| AI-014     | All AI       | T1       | pgvector queries always include `tenantId` WHERE clause                             |
| AI-015     | All AI       | T1       | AI provider API keys never logged, traced, or included in error messages              |
| AI-FIN-001 | AI Financial | T1       | GL classification confidence < 0.8 requires human review before posting               |
| AI-FIN-002 | AI Financial | T1       | AI financial analysis functions are read-only — no data mutations                    |
| AI-FIN-003 | AI Financial | T2       | AI recommendations stored with outcome tracking                                       |

---

## Phase 43 — AI OpenClaw Context Templates

Add to `openclaw/openclaw.json` under `stack_context_templates`:

**`ai-rag` template** — enforces: tenantId filter on every Qdrant search, scoreThreshold >= 0.7, stream via Vercel AI SDK useChat, user input never in system prompt, citations included in every factual assertion, ingest pipeline via BullMQ (never blocks HTTP request).

**`ai-agent` template** — enforces: maxSteps <= 20, write-capable tools require `requiresApproval: true`, agent runs > 30 seconds as BullMQ jobs, all tool outputs validated with Zod, agent memory namespaced to tenantId + sessionId in Qdrant.

---

## Phase 44 — AI Prometheus Metrics

```js
kilo_ai_cost_usd_total          // Counter: by workspace + provider + module
kilo_ai_tokens_total            // Counter: by workspace + provider + operation (prompt/output)
kilo_ai_request_duration_ms     // Histogram: by provider + operation
kilo_ai_budget_exceeded_total   // Counter: by workspace
kilo_ai_invariant_violations    // Counter: by invariant_id + app + severity
kilo_vector_search_duration_ms  // Histogram: by store (qdrant|pgvector) + tenant
kilo_rag_retrieval_score        // Histogram: distribution of retrieval confidence scores
kilo_agent_steps_total          // Histogram: steps per agent run
```

**New Grafana dashboard: `grafana/dashboards/ai-applications.json`** — panels: AI cost this month (stat), cost by provider (pie), cost by workspace (bar), token usage over time (line), retrieval score distribution (histogram), agent step count (histogram), budget exceeded events (stat), AI request latency p95 (line by provider).

---

## Phase 45 — AI Sandbox Image

**`kilo/sandbox-ai/Dockerfile`:**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 make g++ libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# All SaaS tools
RUN npm install -g \
    create-next-app@14 create-t3-app@7 create-svelte@6 \
    typescript@5 prisma@5 drizzle-kit@0.21 \
    vite@5 tailwindcss@3 prettier@3 eslint@9 tsx@4 \
    dotenv-cli@7 @kilocode/cli concurrently@8

# AI-specific tools
RUN npm install -g \
    ai@4 \
    @anthropic-ai/sdk@0.36 \
    openai@4 \
    @langchain/core@0.3 \
    @langchain/langgraph@0.2 \
    @qdrant/js-client-rest@1 \
    bullmq@5 \
    langfuse@3

RUN groupadd -r kilo && useradd -r -g kilo -m kilo
RUN mkdir -p /workspace /checkpoint && chown kilo:kilo /workspace /checkpoint
USER kilo
WORKDIR /workspace
CMD ["sleep", "infinity"]
```

**Sandbox routing in `executor.js`:**

```js
const AI_STACKS        = ['ai-rag', 'ai-enhanced', 'ai-agent', 'ai-financial'];
const FINANCIAL_STACKS = ['accounting', 'erp', 'wms', 'pos'];
const sandboxImage = AI_STACKS.includes(stack)
  ? process.env.AI_SANDBOX_IMAGE
  : FINANCIAL_STACKS.includes(stack)
    ? process.env.FINANCIAL_SANDBOX_IMAGE
    : process.env.WEBAPP_SANDBOX_IMAGE;
```

**Openclaw context flush after task completion:**

```js
// After successful task completion in executor.js
async function onTaskComplete(taskResult) {
  // Flush accumulated context to Openclaw for agentic regeneration
  const contextPayload = {
    task_id: taskResult.id,
    stack: taskResult.stack,
    modules: taskResult.modules,
    invariants_satisfied: taskResult.invariants,
    generated_files: taskResult.fileList,
    execution_time_ms: taskResult.duration,
    timestamp: new Date().toISOString()
  };
  
  // Write to openclaw context buffer
  await fs.appendFileSync(
    path.join(process.env.OPENCLAW_CONTEXT_DIR, 'task-context.jsonl'),
    JSON.stringify(contextPayload) + '\n'
  );
  
  // Trigger drift detection if significant deviation detected
  if (taskResult.deviationScore > 0.3) {
    await triggerKnowledgeDriftCheck(taskResult);
  }
}
```

---

# PART F — Universal Export Layer

---

## The Export Philosophy

Every app generated by this factory must be deployable to any target without modifying application code. The export adapter system achieves this by generating **target-specific configuration and wrapper files** at scaffold time, while keeping the application itself environment-agnostic.

```
EXPORT ADAPTER SYSTEM

Scaffold generates:
  src/                    ← Application code — NEVER changes per target
  Dockerfile              ← For container targets (VPS, GCP, homelab)
  deploy/
    homelab/              ← docker-compose.fragment.yml + Traefik labels
    vps/                  ← deploy-vps.sh + docker-compose.prod.yml
    vercel/               ← vercel.json + .vercelignore + next.config adapter
    netlify/              ← netlify.toml + adapter install
    github-actions/       ← .github/workflows/ci.yml + deploy.yml
    aws/                  ← amplify.yml + s3-deploy.sh + cf-invalidate.sh
    gcp/                  ← cloudbuild.yaml + cloudrun-service.yaml
    azure/                ← staticwebapp.config.json + azure-pipelines.yml
    supabase/             ← supabase/config.toml + edge-db-setup.sh
    devcontainer/         ← .devcontainer/devcontainer.json
```

**The rule:** The `src/` directory is identical across all targets. Only the `deploy/` directory contains target-specific files.

---

## Phase 46 — Export Target: VPS (Docker Compose)

**`deploy/vps/docker-compose.prod.yml`** (emitted by every scaffold):

```yaml
version: "3.9"
services:
  app:
    image: ${REGISTRY:-ghcr.io}/${REPO_OWNER}/${APP_NAME}:${IMAGE_TAG:-latest}
    restart: unless-stopped
    networks: [app-network]
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      NEXTAUTH_URL: https://${APP_DOMAIN}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    depends_on:
      db: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3000/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits: { cpus: '2.0', memory: '1g' }
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${APP_NAME}.rule=Host(`${APP_DOMAIN}`)"
      - "traefik.http.routers.${APP_NAME}.tls.certresolver=letsencrypt"

  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    networks: [app-network]
    volumes: [db_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  traefik:
    image: traefik:v3.0
    restart: unless-stopped
    networks: [app-network]
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_certs:/certs
    command:
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/certs/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"

networks:
  app-network:
volumes:
  db_data:
  traefik_certs:
```

**`deploy/vps/deploy-vps.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Usage: ./deploy-vps.sh user@your-server.com
SERVER="$1"
APP_NAME="${APP_NAME:-$(basename "$(pwd)")}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

docker build \
  --build-arg APP_VERSION="${IMAGE_TAG}" \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --build-arg GIT_SHA="${IMAGE_TAG}" \
  -t "${APP_NAME}:${IMAGE_TAG}" .

# 1. Pull/load new image without starting it
docker save "${APP_NAME}:${IMAGE_TAG}" | gzip | ssh "${SERVER}" "gunzip | docker load"

# 2. Run migrations in ephemeral container BEFORE traffic switches over
# This ensures the new app never runs against old schema
ssh "${SERVER}" "
  cd /opt/${APP_NAME}
  export IMAGE_TAG=\${IMAGE_TAG}
  
  # Run migrations in ephemeral container (exits after completion)
  docker run --rm \
    --network \${APP_NAME}-network \
    --env-file .env \
    "\${APP_NAME}:\${IMAGE_TAG}" \
    npx prisma migrate deploy
"

# 3. Only if migrations succeed, swap the running container
ssh "${SERVER}" "
  cd /opt/${APP_NAME}
  export IMAGE_TAG=\${IMAGE_TAG}
  docker compose -f docker-compose.prod.yml up -d --no-deps app
"

echo "✓ Deployed ${APP_NAME}:${IMAGE_TAG} to ${SERVER}"
```

---

## Phase 47 — Export Target: Vercel

**Applicable stacks:** `nextjs-app`, `t3`, `ai-rag`, `ai-enhanced`, `ai-agent`

Vercel requires removing `output: 'standalone'` from `next.config`, using Neon/Supabase/PlanetScale for DB (no local Postgres on serverless), switching to JWT-only auth, and moving BullMQ workers to Vercel Cron or dedicated worker dyno.

**`deploy/vercel/vercel.json`:**

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_APP_URL": "@next_public_app_url"
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

**`deploy/vercel/env.vercel.template`:**

```bash
# Database — use Neon or Supabase (NOT a local Postgres URL)
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require

# Auth
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=<generated-secret>

# AI providers (if applicable)
ANTHROPIC_API_KEY=sk-ant-...
AI_DEFAULT_PROVIDER=claude

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Deployment steps: (1) Copy `deploy/vercel/next.config.vercel.js` → `next.config.js`. (2) Set env vars in Vercel dashboard. (3) Run `vercel --prod`. (4) Deploy BullMQ workers separately to Railway, Render, or Fly.io using `Dockerfile.worker`.

---

## Phase 48 — Export Target: GitHub Actions CI

**`deploy/github-actions/.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_USER: ci, POSTGRES_PASSWORD: ci, POSTGRES_DB: ci_test }
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping" --health-interval 10s

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint src/ --max-warnings 0
      - run: npm audit --audit-level=high
      - name: Run tests
        env:
          DATABASE_URL: postgresql://ci:ci@localhost:5432/ci_test
          REDIS_URL: redis://localhost:6379
        run: |
          npx prisma migrate deploy
          npm test -- --coverage

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          build-args: |
            APP_VERSION=${{ github.sha }}
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            GIT_SHA=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## Phase 49 — Export Target: AWS / GCP / Azure

**Mode A: AWS Amplify (`deploy/aws/amplify.yml`)** — managed Next.js hosting. preBuild: `npm ci && npx prisma generate`. build: `npm run build`. postBuild: `npx prisma migrate deploy`.

**Mode B: GCP Cloud Run (`deploy/gcp/cloudbuild.yaml`)** — builds Docker image, pushes to GCR, deploys to Cloud Run with Cloud SQL proxy, min 1 instance to avoid cold start.

**`deploy/gcp/cloudrun-service.yaml`:**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${APP_NAME}
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/cloudsql-instances: ${PROJECT_ID}:${REGION}:${INSTANCE_NAME}
        autoscaling.knative.dev/maxScale: '10'
        autoscaling.knative.dev/minScale: '1'
    spec:
      containers:
        - image: gcr.io/${PROJECT_ID}/${APP_NAME}:latest
          resources:
            limits: { cpu: '2', memory: '1Gi' }
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: app-db-url, key: latest }
```

**Mode C: Azure Static Web Apps (`deploy/azure/staticwebapp.config.json`)** — route config with auth, CSP headers, and SPA fallback.

---

## Phase 50 — Export Target: Supabase / Neon Backend

**`deploy/supabase/edge-db-setup.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT_REF="$1"

DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres" \
  npx prisma migrate deploy

npx supabase db push --project-ref "${PROJECT_REF}"

npx supabase gen types typescript \
  --project-id "${PROJECT_REF}" \
  > src/lib/database.types.ts

echo "✓ Supabase backend ready"
```

**`deploy/supabase/auth-adapter.ts`** — swaps Auth.js database adapter to Supabase, using `@auth/supabase-adapter`.

---

## Phase 51 — Export Target: DevContainer

**`.devcontainer/devcontainer.json`:**

```json
{
  "name": "${APP_NAME} Dev",
  "dockerComposeFile": ["../docker-compose.yml", "docker-compose.devcontainer.yml"],
  "service": "app",
  "workspaceFolder": "/workspace",
  "customizations": {
    "vscode": {
      "extensions": [
        "prisma.prisma", "bradlc.vscode-tailwindcss",
        "dbaeumer.vscode-eslint", "esbenp.prettier-vscode",
        "ms-azuretools.vscode-docker", "github.copilot"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "typescript.tsdk": "node_modules/typescript/lib"
      }
    }
  },
  "postCreateCommand": "npm ci && npx prisma generate && npx prisma migrate dev",
  "forwardPorts": [3000, 5432, 6379],
  "portsAttributes": {
    "3000": { "label": "App", "onAutoForward": "openBrowser" },
    "5432": { "label": "Postgres" },
    "6379": { "label": "Redis" }
  }
}
```

---

## Phase 52 — Export Adapter Script

**`scripts/add-export-target.sh`:**

```bash
#!/usr/bin/env bash
# Usage: ./scripts/add-export-target.sh <app-dir> <target>
# Targets: vps | vercel | netlify | github-actions | aws | gcp | azure | supabase | devcontainer

APP_DIR="$1"
TARGET="$2"
SCRIPT_DIR="$(dirname "$0")"

case "$TARGET" in
  vps)        bash "${SCRIPT_DIR}/exports/vps.sh"     "$APP_DIR" ;;  # Docker Compose
  k8s)        bash "${SCRIPT_DIR}/exports/k8s.sh"     "$APP_DIR" ;;  # Kubernetes
  vercel)     bash "${SCRIPT_DIR}/exports/vercel.sh"   "$APP_DIR" ;;  # Serverless
  all)
    for t in vps k8s vercel; do
      bash "${SCRIPT_DIR}/exports/${t}.sh" "$APP_DIR"
    done ;;
  *) echo "Unknown target: $TARGET"; exit 1 ;;
esac

echo "✓ Export target '${TARGET}' added to ${APP_DIR}/deploy/${TARGET}/"
```

By default, every scaffold runs `add-export-target.sh . all` — generating three primary targets at scaffold time (Docker Compose, Kubernetes, Serverless).

---

## Phase 53 — Export Invariants

| ID      | Scope       | Severity | Description                                                                               |
| ------- | ----------- | -------- | ----------------------------------------------------------------------------------------- |
| EXP-001 | All         | T1       | `deploy/` directory never contains application logic — only config files               |
| EXP-002 | Next.js, T3 | T1       | `output: 'standalone'` is in homelab `next.config.js` only — Vercel config omits it  |
| EXP-003 | All         | T2       | `deploy/vercel/env.vercel.template` always lists all required env vars                  |
| EXP-004 | All         | T1       | All DB connection strings use environment variables — no hardcoded hosts                 |
| EXP-005 | All         | T1       | Apps with BullMQ workers have a separate `Dockerfile.worker` for non-serverless targets |

### Post-Export Upgrade Story

Once an app is exported and runs independently, there's no automatic link back to the factory. Three upgrade strategies are supported:

**Strategy A: Re-factory merge (recommended)**
- Keep the original blueprint in the exported app
- Re-run factory against updated templates and merge into existing app
- `./scripts/factory-update.sh --merge ./myapp`

**Strategy B: Independent module updates**
- Each module package records its own version in `package.json`
- Pull security patches via normal `npm update @factory-modules/accounting`
- Requires modules to be published to a registry

**Strategy C: Frozen fork (simplest)**
- Accept that post-export apps are frozen at export time
- No further factory updates — treat as standalone fork
- Document this limitation in export documentation

**.factory-lock.json** — Analogous to package-lock.json:

```json
{
  "factoryVersion": "2.4.0",
  "exportedAt": "2026-03-05T22:00:00Z",
  "modules": {
    "@factory-modules/accounting": "1.2.3",
    "@factory-modules/hr": "1.0.5",
    "@factory-modules/ai-rag": "2.1.0"
  },
  "target": "docker-compose",
  "updateStrategy": "merge"
}
```

This file is written by `factory-detach.sh` and enables upgrade tooling to know which factory version generated the app.

---

# PART G — Infrastructure, Operations & Reference

---

## Stack Decision Guide

```
What are you building?
│
├── Single focused SaaS product?
│   ├── Type-safe API + Auth + max code quality    → t3 scaffold
│   ├── Great DX + progressive enhancement         → sveltekit scaffold
│   ├── Large data grids + dashboards              → tanstack scaffold
│   ├── Content-heavy + SSR/SSG                    → nextjs-app scaffold
│   ├── Document DB + flexible schema              → mern scaffold
│   └── Enterprise component grids                 → extjs scaffold
│
├── Single focused financial product?
│   ├── General ledger + AP/AR + invoicing         → accounting scaffold
│   ├── Multi-module operations + HR               → erp scaffold
│   ├── Bin locations + pick/pack + barcode         → wms scaffold
│   └── Till sessions + receipts + offline          → pos scaffold
│
├── AI application?
│   ├── Document Q&A / internal search / RAG       → ai-rag scaffold
│   ├── Add AI copilot to an existing SaaS app     → ai-enhanced + --base=<stack>
│   ├── Autonomous agent / tool calling / builder   → ai-agent scaffold
│   └── AI-powered accounting / ERP intelligence   → ai-financial scaffold
│
├── Multi-module SaaS platform (subscription-gated features)?
│   └── platform scaffold
│       ├── Declare modules in platform-manifest.yaml
│       ├── Each module implements IModule
│       ├── Modules communicate via DomainEventBus only
│       └── Users see only features their tier includes
│
└── Where will it run? (3 Primary Targets)
    ├── Docker Compose (VPS/homelab)     → deploy/vps/
    ├── Kubernetes (cloud-agnostic)      → deploy/k8s/
    └── Serverless (Vercel/Netlify)       → deploy/vercel/
```

---

## The Compile-Time → Runtime Upgrade: Exact Steps

When ready to move from compile-time modules to runtime-loadable plugins, here are every file that changes and every file that does not.

### Files that change (3 total)

**1. `platform-manifest.yaml`** — 2 lines:

```yaml
# Before
loaderStrategy: source
loaderBasePath: "../../packages/modules"

# After
loaderStrategy: directory
loaderBasePath: /plugins
```

**2. CI pipeline (`.woodpecker.yaml`)** — add one build step:

```yaml
build-plugins:
  image: node:20-slim
  commands:
    - turbo run build --filter='./packages/modules/*'
    - mkdir -p /plugins
    - for dir in packages/modules/*/; do
        pluginId=$(basename "$dir");
        mkdir -p /plugins/$pluginId;
        cp -r $dir/dist/* /plugins/$pluginId/;
      done
  depends_on: [test-unit, test-integration]
  when: { branch: main }
```

**3. `ModuleLoader.ts`** — the `directory` case already exists (written in Phase 27). No change needed.

### Files that do not change

Every `packages/modules/*/src/index.ts` — untouched. Every `IModule`, `IHostContext`, `IModuleManifest` — untouched. `ServiceRegistry`, `EventBus`, `DependencyGraph`, `SchemaMerger` — untouched. `WorkspaceProvisioner`, `FeatureProvider`, `PermissionService`, `WorkspaceShell` — untouched. Every domain event handler in every module — untouched. Every schema fragment — untouched. All 75 kilo invariants — untouched.

The module code is completely oblivious to how it is loaded.

---

## Updated RAM Budget (N100)

| Service                                     | Idle RAM          | Peak RAM       | Notes                                                                        |
| ------------------------------------------- | ----------------- | -------------- | ---------------------------------------------------------------------------- |
| Postgres 16 (pgvector)                      | 250 MB            | 400 MB         | `shared_buffers=256MB`; pgvector adds minimal overhead                     |
| PgBouncer                                   | 20 MB             | 20 MB          | Transaction mode                                                             |
| MongoDB 7                                   | 100 MB            | 300 MB         | MERN apps only                                                               |
| Redis 7                                     | 80 MB             | 150 MB         | AOF + BullMQ + AI budget cache                                               |
| kilo-pipeline                               | 200 MB            | 300 MB         | One task at a time                                                           |
| Qdrant                                      | 150 MB            | 500 MB         | Grows with vector collections                                                |
| Traefik                                     | 30 MB             | 30 MB          |                                                                              |
| Loki + Promtail                             | 150 MB            | 200 MB         |                                                                              |
| Tempo                                       | 100 MB            | 150 MB         |                                                                              |
| OTel Collector                              | 50 MB             | 80 MB          |                                                                              |
| Alertmanager                                | 20 MB             | 20 MB          |                                                                              |
| Prometheus                                  | 100 MB            | 150 MB         |                                                                              |
| Grafana                                     | 100 MB            | 200 MB         |                                                                              |
| report-engine                               | 300 MB            | 800 MB         | Chromium spike — async BullMQ                                               |
| Gitea                                       | 200 MB            | 300 MB         |                                                                              |
| Woodpecker (server+agent)                   | 150 MB            | 300 MB         |                                                                              |
| **Ollama**                            | **300 MB**  | **6 GB** | Model loaded = 5-6 GB; unloaded = 300 MB                                     |
| App sandboxes                               | 1.5 GB            | 3 GB           | Sequential queue                                                             |
| **Baseline (no Ollama model loaded)** | **~3.5 GB** | —             | **12.5 GB headroom**                                                   |
| **With one Ollama model loaded**      | **~8 GB**   | —             | **8 GB headroom — do not run scaffold + Ollama build simultaneously** |

**N100 AI Operating Rules (add to `KILO_CONFIG`):**

```bash
KILO_MAX_CONCURRENT_SCAFFOLDS=1       # Always was 1 — remains 1
KILO_AI_SANDBOX_PRIORITY=low          # AI scaffolds yield to financial scaffolds
OLLAMA_UNLOAD_BEFORE_SCAFFOLD=true    # n8n pre-scaffold hook unloads Ollama model
OLLAMA_MAX_LOADED_MODELS=1            # Enforced in docker-compose
AI_DEFAULT_PROVIDER=ollama            # Use local by default — saves API costs
AI_CLOUD_FALLBACK_PROVIDER=claude     # Fallback when Ollama model unavailable
```

---

## Updated n8n Workflows

**Workflow 1 — Scaffold from Webhook** — receives scaffold request, detects domain, routes to appropriate sandbox, posts result to project-registry.

**Workflow 2 — Daily Health Report** — checks all registered apps, aggregates health status, posts summary.

**Workflow 3 — Schema Drift Detection** — runs `prisma migrate status` per app, alerts on pending migrations.

**Workflow 4 — AI Cost Report** (weekly, Monday 9am):

```
Node: SELECT SUM(cost_usd), provider, module_id FROM ai_usage_records
      WHERE created_at >= date_trunc('month', NOW()) GROUP BY provider, module_id
  ↓
Node: Check AIBudget table for workspaces approaching limit
  ↓
Node: Format report with cost breakdown + provider efficiency comparison
  ↓
Node: POST to OpenClaw (send weekly AI cost report)
```

**Workflow 5 — Ollama Model Management** — webhook-triggered. Checks available RAM before pulling models. Enforces 8GB headroom requirement before any model pull.

**Workflow 6 — Scaffold Version Drift Check** (1st of month, 10am) — reads Dockerfiles, extracts pinned package versions, compares against npm latest. T1 alert if > 2 major versions behind, T2 warning if > 1 minor version behind.

---

## Complete File Structure

```
homelab/
│
├── docker-compose.yml               ← All services (including ollama)
├── .env / config.env.template       ← Adds AI provider keys + Ollama config
├── traefik/
├── prometheus/
│   └── alerts.yaml                  ← Adds AI budget alert rules
├── alertmanager/
├── loki/
├── otel/
├── tempo/
├── grafana/
│   └── dashboards/
│       ├── kilo-pipeline.json
│       ├── homelab-overview.json
│       ├── webapps.json
│       ├── logs.json
│       ├── traces.json
│       ├── alerts.json
│       └── ai-applications.json     ← AI cost + token + agent dashboards
├── postgres/
│   └── init/
│       ├── 001_init.sql
│       └── 002_extensions.sql       ← pgvector + pgaudit
├── scripts/
│   ├── provision-webapp-db.sh
│   ├── provision-financial-db.sh
│   ├── add-export-target.sh         ← Generates deploy/ configs
│   ├── update-scaffold-pins.sh      ← Version drift checker
│   ├── exports/                     ← One script per export target
│   │   ├── vps.sh
│   │   ├── vercel.sh
│   │   ├── netlify.sh
│   │   ├── github-actions.sh
│   │   ├── aws.sh
│   │   ├── gcp.sh
│   │   ├── azure.sh
│   │   ├── supabase.sh
│   │   └── devcontainer.sh
│   └── rotate/
├── report-engine/
├── project-registry/
│
├── kilo/
│   ├── sandbox/
│   │   └── Dockerfile               ← SaaS sandbox image
│   ├── sandbox-financial/
│   │   └── Dockerfile               ← Financial sandbox
│   ├── sandbox-ai/
│   │   └── Dockerfile               ← AI sandbox (adds AI SDKs + LangChain)
│   ├── pipeline/src/
│   │   ├── index.js
│   │   └── services/
│   │       ├── executor.js          ← AI stack routing + Ollama unload hook
│   │       ├── metrics.js           ← AI cost + token metrics
│   │       ├── sandbox.js
│   │       └── ...
│   ├── scaffold/scripts/
│   │   ├── scaffold.sh              ← Master dispatcher (16 scaffold types)
│   │   ├── stacks/                  ← 7 SaaS scaffold scripts
│   │   │   ├── nextjs-app.sh
│   │   │   ├── t3.sh
│   │   │   ├── mern.sh
│   │   │   ├── sveltekit.sh
│   │   │   ├── tanstack.sh
│   │   │   ├── extjs.sh
│   │   │   └── expo-web.sh
│   │   ├── financial/               ← 4 financial scaffold scripts
│   │   │   ├── common/base.sh
│   │   │   ├── accounting.sh
│   │   │   ├── erp.sh
│   │   │   ├── wms.sh
│   │   │   └── pos.sh
│   │   ├── platform/                ← Platform scaffold scripts
│   │   │   ├── platform.sh
│   │   │   ├── write-module-system.sh
│   │   │   ├── write-platform-core.sh
│   │   │   └── write-manifest.sh
│   │   ├── modules/                 ← IModule scaffold scripts
│   │   │   ├── accounting.sh
│   │   │   ├── procurement.sh
│   │   │   ├── inventory.sh
│   │   │   ├── wms.sh
│   │   │   ├── pos.sh
│   │   │   ├── hr.sh
│   │   │   ├── billing.sh
│   │   │   └── analytics.sh
│   │   ├── ai/                      ← AI scaffold scripts
│   │   │   ├── ai-rag.sh
│   │   │   ├── ai-enhanced.sh
│   │   │   ├── ai-agent.sh
│   │   │   ├── ai-financial.sh
│   │   │   └── common/
│   │   │       ├── ai-base.sh
│   │   │       ├── vector-store.sh
│   │   │       ├── test-ai.sh
│   │   │       └── prompt-audit.sh
│   │   └── common/                  ← Cross-domain scripts
│   │       ├── test-base.sh
│   │       ├── sanitise.sh
│   │       ├── logger.sh
│   │       ├── tracing.sh
│   │       ├── env-config.sh
│   │       ├── graceful-shutdown.sh
│   │       ├── health-check.sh
│   │       └── export-targets.sh
│   └── .kilo/
│       └── invariants.yaml          ← All 75 invariants

Generated app structure:
{app-name}/
├── src/                             ← Application code — identical across all targets
│   ├── lib/
│   │   ├── env.ts                   ← Zod-validated config
│   │   ├── logger.ts                ← Pino structured logger
│   │   ├── tracing.ts               ← OTel instrumentation
│   │   ├── sanitise.ts              ← DOMPurify utilities
│   │   ├── gracefulShutdown.ts      ← SIGTERM handler
│   │   ├── ai.ts                    ← IAIService factory (AI scaffolds)
│   │   ├── vectorStore.ts           ← IVectorStore (AI scaffolds)
│   │   └── financial/               ← money.ts, periodGuard.ts, auditLog.ts (financial scaffolds)
│   ├── server/api/routers/          ← tRPC routes
│   ├── app/                         ← Next.js App Router pages
│   └── workers/                     ← BullMQ workers
├── deploy/                          ← 3 Primary Export Targets
│   ├── vps/                        ← Docker Compose
│   ├── k8s/                        ← Kubernetes
│   └── vercel/                     ← Serverless
├── prisma/
│   ├── schema.prisma                ← Auto-merged (platform) or hand-written (single app)
│   └── seed.ts
├── Dockerfile
├── Dockerfile.worker                ← Separate image for BullMQ workers
├── .woodpecker.yaml                 ← Homelab CI
├── .kilo/stack-context.md
└── .vscode/
    ├── settings.json
    └── extensions.json
```

---

## Complete Invariant Catalogue (75 invariants)

**Severity key:** T1 = blocks deploy / quarantine event. T2 = warning + logged.
**Type key:** det = deterministic shell check. sem = semantic / AI-reviewed.

### SaaS / Web Invariants (WEB-001 to WEB-012)

| ID      | Domain      | Type | Sev | Description                                    |
| ------- | ----------- | ---- | --- | ---------------------------------------------- |
| WEB-001 | All web     | det  | T1  | No hardcoded secrets in source files           |
| WEB-002 | Next.js, T3 | det  | T1  | `output: standalone` in next.config          |
| WEB-003 | T3          | det  | T1  | Auth routes use `protectedProcedure`         |
| WEB-004 | All web     | det  | T1  | No SQL string interpolation                    |
| WEB-005 | All web     | sem  | T1  | All user input validated with Zod              |
| WEB-006 | SvelteKit   | det  | T1  | DB access only in `.server.ts` files         |
| WEB-007 | All web     | det  | T2  | Health check endpoint exists                   |
| WEB-008 | All web     | det  | T2  | SIGTERM graceful shutdown handler registered   |
| WEB-009 | MERN        | det  | T1  | No template strings in Mongoose queries        |
| WEB-010 | Ext JS      | det  | T2  | Server-side paging on all data stores          |
| WEB-011 | All web     | det  | T2  | No `process.exit()` outside shutdown handler |
| WEB-012 | All web     | sem  | T2  | Env vars via Zod-validated config module only  |

### Financial Invariants (FIN, ACC, ERP, WMS, POS)

| ID      | Domain        | Type | Sev | Description                                                          |
| ------- | ------------- | ---- | --- | -------------------------------------------------------------------- |
| FIN-001 | All financial | det  | T1  | No JS float for monetary values —`decimal.js` only                |
| FIN-002 | All financial | det  | T1  | No Prisma `Float` type in financial schemas                        |
| FIN-003 | All financial | sem  | T1  | Decimal serialised as string in all API responses                    |
| FIN-004 | All financial | det  | T1  | `writeAuditLog` called in every financial mutation                 |
| FIN-005 | All financial | det  | T1  | `checkPeriodOpen` called before every financial mutation           |
| FIN-006 | All financial | det  | T1  | No hard deletes — soft delete (`deletedAt`) only                  |
| ACC-001 | Accounting    | det  | T1  | `assertBalanced()` before any `POSTED` status change             |
| ACC-002 | Accounting    | sem  | T1  | POSTED journal entries immutable — reversal only                    |
| ACC-003 | Accounting    | sem  | T2  | Account codes never updated once used in a JournalLine               |
| ERP-001 | ERP           | sem  | T1  | `hasPermission(userId, module, action)` before every mutation      |
| ERP-002 | ERP           | det  | T1  | Every StockMovement create links to a `journalEntryId`             |
| ERP-003 | ERP           | sem  | T1  | PO approval requires permission +`approvedBy !== createdBy`        |
| WMS-001 | WMS           | det  | T1  | Bin quantities never negative without explicit flag                  |
| WMS-002 | WMS           | sem  | T2  | FIFO/FEFO picking order enforced (oldest lot/expiry first)           |
| WMS-003 | WMS           | det  | T1  | Redis `bin-lock:{binId}` acquired before every BinContent mutation |
| POS-001 | POS           | det  | T1  | Every COMPLETED transaction creates a JournalEntry                   |
| POS-002 | POS           | det  | T1  | Payment total equals transaction total before COMPLETED              |
| POS-003 | POS           | sem  | T1  | Tax computed server-side only                                        |
| POS-004 | POS           | sem  | T2  | Offline sync detects and rejects duplicate receipt numbers           |

### Security Invariants (SEC-001 to SEC-005)

| ID      | Domain    | Type | Sev | Description                                                                   |
| ------- | --------- | ---- | --- | ----------------------------------------------------------------------------- |
| SEC-001 | All       | det  | T1  | `isomorphic-dompurify` installed and used on user content                   |
| SEC-002 | All       | det  | T1  | No `eval()`, `new Function()`, or unsanitised `dangerouslySetInnerHTML` |
| SEC-003 | All       | det  | T1  | CORS restricts allowed origins — no wildcard `*`                           |
| SEC-004 | All       | sem  | T1  | Auth tokens in `httpOnly` cookies — never `localStorage`                 |
| SEC-005 | Financial | det  | T1  | Error responses never include stack traces                                    |

### Testing Invariants (TEST-001 to TEST-003)

| ID       | Domain    | Type | Sev | Description                                                       |
| -------- | --------- | ---- | --- | ----------------------------------------------------------------- |
| TEST-001 | All       | det  | T2  | Test suite passes with ≥80% line + function coverage             |
| TEST-002 | Financial | det  | T1  | Financial precision tests pass (money, periodGuard, journalEntry) |
| TEST-003 | Financial | det  | T1  | Audit log tests confirm every mutation is logged                  |

### Observability Invariants (OBS-001)

| ID      | Domain | Type | Sev | Description                                                  |
| ------- | ------ | ---- | --- | ------------------------------------------------------------ |
| OBS-001 | All    | det  | T2  | No `console.log()` in production code — use `logger.ts` |

### Module System Invariants (MOD-001 to MOD-010)

| ID      | Domain      | Type | Sev | Description                                                        |
| ------- | ----------- | ---- | --- | ------------------------------------------------------------------ |
| MOD-001 | All modules | det  | T1  | Module class implements `IModule` interface                      |
| MOD-002 | All modules | det  | T1  | No concrete imports from other module packages                     |
| MOD-003 | All modules | det  | T1  | Domain services via events only; infrastructure via `context.services` |
| MOD-004 | All modules | det  | T1  | Cross-module side effects emitted via `context.events.publish()` |
| MOD-005 | All modules | det  | T1  | No direct `process.env` — use `context.config`                |
| MOD-006 | All modules | det  | T1  | Feature-gated code calls `context.features.assertEnabled()`      |
| MOD-007 | All modules | sem  | T1  | Infrastructure services declared; domain services via events only |
| MOD-008 | All modules | det  | T1  | `onTenantDeprovision` uses soft delete — no hard deletes        |
| MOD-009 | All modules | det  | T1  | Schema fragment model names prefixed with module name              |
| MOD-010 | All modules | det  | T2  | `teardown()` closes BullMQ workers before returning              |

### RBAC Invariants (PERM-001 to PERM-003)

| ID       | Domain      | Type | Sev | Description                                                                                              |
| -------- | ----------- | ---- | --- | -------------------------------------------------------------------------------------------------------- |
| PERM-001 | All modules | det  | T1  | `context.permissions.assert()` called before every data mutation in API routes                         |
| PERM-002 | All modules | sem  | T1  | List endpoints use `context.permissions.scopeFilter()` — never return all records without scope check |
| PERM-003 | All modules | det  | T1  | `permissions.invalidateUser()` called on every `UserRole` mutation                                   |

### HR Invariants (HR-001 to HR-004)

| ID     | Domain | Type | Sev | Description                                                                |
| ------ | ------ | ---- | --- | -------------------------------------------------------------------------- |
| HR-001 | HR     | det  | T1  | Payroll records use `@db.Decimal(19,4)` — never Float                   |
| HR-002 | HR     | sem  | T1  | `processedAt` on payroll period immutable once set                       |
| HR-003 | HR     | det  | T1  | Payroll posting links to `journalEntryId`                                |
| HR-004 | HR     | det  | T2  | Leave balance `remaining` always equals `entitlement - used - pending` |

### AI Invariants (AI-001 to AI-015 + AI-FIN-001 to AI-FIN-003)

| ID         | Domain       | Type | Sev | Description                                                               |
| ---------- | ------------ | ---- | --- | ------------------------------------------------------------------------- |
| AI-001     | All AI       | sem  | T1  | No raw PII in AI prompts without scrubbing                                |
| AI-002     | All AI       | det  | T1  | All AI calls through IAIService — no direct SDK calls                    |
| AI-003     | All AI       | det  | T1  | `tenantId`, `userId`, `moduleId` required on every AI call          |
| AI-004     | All AI       | det  | T1  | AI response content never rendered as raw HTML                            |
| AI-005     | All AI       | sem  | T1  | User input never concatenated into system prompt (prompt injection guard) |
| AI-006     | Agent        | det  | T1  | `runAgent` always specifies `maxSteps <= 20`                          |
| AI-007     | All AI       | sem  | T2  | Streaming responses handle loading and error states                       |
| AI-008     | All AI       | det  | T2  | `AIUsageRecord` written after every completion                          |
| AI-009     | RAG          | sem  | T1  | RAG responses cite source chunks — no unsupported factual claims         |
| AI-010     | RAG          | det  | T2  | Retrieval score threshold >= 0.7                                          |
| AI-011     | Agent        | det  | T1  | Write-capable tools require `requiresApproval: true`                    |
| AI-012     | Agent        | sem  | T1  | Agent run wall-clock timeout <= 120 seconds                               |
| AI-013     | All AI       | det  | T1  | Qdrant searches always include `tenantId` filter                        |
| AI-014     | All AI       | det  | T1  | pgvector queries always include `tenantId` WHERE clause                 |
| AI-015     | All AI       | det  | T1  | AI provider API keys never logged or included in error messages           |
| AI-FIN-001 | AI Financial | sem  | T1  | GL classification confidence < 0.8 requires human review                  |
| AI-FIN-002 | AI Financial | det  | T1  | AI financial analysis functions are read-only                             |
| AI-FIN-003 | AI Financial | det  | T2  | AI recommendations stored with outcome tracking                           |

### Export Invariants (EXP-001 to EXP-005)

| ID      | Domain      | Type | Sev | Description                                                               |
| ------- | ----------- | ---- | --- | ------------------------------------------------------------------------- |
| EXP-001 | All         | sem  | T1  | `deploy/` directory never contains application logic                    |
| EXP-002 | Next.js, T3 | det  | T1  | `output: 'standalone'` in homelab config only — Vercel config omits it |
| EXP-003 | All         | det  | T2  | `deploy/vercel/env.vercel.template` lists all required env vars         |
| EXP-004 | All         | det  | T1  | All DB connection strings use environment variables                       |
| EXP-005 | All         | det  | T1  | Apps with BullMQ workers have a separate `Dockerfile.worker`            |

**Total: 75 invariants**

---

## Phase Timeline Summary

| Phase  | Description                                                         | Part |
| ------ | ------------------------------------------------------------------- | ---- |
| 0–9   | SaaS / CRUD foundation                                              | A    |
| 2.5   | TypeScript Migration for ModuleGenerator (typed interface)         | A    |
| 2.6   | Custom Generator Authoring SDK (user-defined templates)            | A    |
| 10–17 | Financial domain layer                                              | B    |
| 18–25 | Production hardening                                                | C    |
| 26–38 | Module system + multi-workspace + RBAC                              | D    |
| 31.5  | SchemaMerger Implementation (conflict resolution algorithm)       | D    |
| 39     | AI infrastructure (Ollama, pgvector, cost tracking, IAIService)     | E    |
| 40     | HR module scaffold                                                  | E    |
| 41     | AI scaffold templates (ai-rag, ai-enhanced, ai-agent, ai-financial) | E    |
| 42     | AI kilo invariants (18 new)                                         | E    |
| 43     | AI OpenClaw context templates                                       | E    |
| 44     | AI Prometheus metrics + Grafana dashboard                           | E    |
| 45     | AI sandbox image                                                    | E    |
| 46     | Export: VPS (Docker Compose)                                        | F    |
| 47     | Export: Vercel                                                      | F    |
| 48     | Export: GitHub Actions CI                                           | F    |
| 49     | Export: AWS / GCP / Azure                                           | F    |
| 50     | Export: Supabase / Neon backend                                     | F    |
| 51     | Export: DevContainer                                                | F    |
| 52     | Export adapter script (`add-export-target.sh`)                    | F    |
| 53     | Export invariants                                                   | F    |
| 54     | Stack decision guide                                                | F    |
| 55     | Updated RAM budget + N100 AI rules                                  | G    |
| 56     | Updated n8n workflows                                               | G    |
| 57     | Unified Hardware Detection Core                                     | H    |
| 58     | Hardware-Aware Service Configuration                                | H    |
| 59     | Runtime Hardware Monitoring                                        | H    |
| 60     | Hardware-Aware Scaffold Generation                                  | H    |
| 61     | Performance Benchmarking System                                     | H    |
| 62     | Conditional Feature Activation                                      | H    |
| 63     | Hardware Profile API                                               | H    |
| 64     | Integration with Webapp Factory                                     | H    |
| 65     | Monitoring Dashboard                                                | H    |

---

## What This Plan Deliberately Excludes

| Item                                                      | Reason                                                         | Revisit when                             |
| --------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| Payroll tax filing APIs (HMRC, IRS, FIRS)                 | Requires jurisdiction credentials + compliance review          | Per-jurisdiction legal review complete   |
| EMV chip card payment SDK                                 | Requires PCI-DSS certification + payment provider licence      | PCI compliance achieved                  |
| E-invoicing standards (UBL, PEPPOL, ZUGFeRD)              | Requires standard body registration                            | Standard body registration complete      |
| Native React Native / Flutter builds                      | Requires Xcode / Android SDK — cannot containerise            | Dedicated ARM build machine available    |
| Kubernetes / Helm                                         | Overkill at this scale; Docker Compose is correct              | Managing 20+ concurrent apps             |
| Runtime plugin marketplace (`loaderStrategy: registry`) | Phase 3 of upgrade path — build runtime system first          | Runtime loader shipped and stable        |
| Fine-tuned / self-hosted LLMs beyond Ollama               | Requires GPU — N100 is CPU-only                               | GPU node added to homelab                |
| LLM evaluation / evals framework                          | Valuable but out of scope for factory                          | When AI app quality monitoring is needed |
| Langfuse / LangSmith LLM tracing                          | Optional add-on — sandbox image includes `langfuse` package | When prompt debugging becomes a workflow |
| Multi-currency live FX rates                              | External API dependency — add as n8n workflow when needed     | n8n FX workflow stable                   |

---

## Quick-Start Commands

```bash
# Scaffold a RAG knowledge base app
kilo scaffold myknowledgebase ai-rag --provider=ollama

# Scaffold a T3 app with AI copilot layer
kilo scaffold mycrm ai-enhanced --base=t3 --patterns=copilot,classify

# Scaffold an AI agent builder platform
kilo scaffold myagentapp ai-agent --provider=claude

# Scaffold accounting with AI GL classification
kilo scaffold mybookkeeping ai-financial --base=accounting --features=classify,anomaly

# Scaffold full ERP platform (all modules including HR + AI analyst)
kilo scaffold myerp platform --modules=accounting,procurement,inventory,hr,wms,pos,analytics

# Add Vercel export to an existing app
./scripts/add-export-target.sh ./myapp vercel

# Add all export targets at once
./scripts/add-export-target.sh ./myapp all

# Check scaffold version drift
./scripts/update-scaffold-pins.sh

# Deploy to VPS
cd myapp && ./deploy/vps/deploy-vps.sh user@your-server.com

# Deploy to GCP Cloud Run
cd myapp && gcloud builds submit --config deploy/gcp/cloudbuild.yaml
```

---

*homelab-master Web App Platform Implementation Plan*
*SaaS CRUD Factory + Financial Domain + Module System + AI Application Layer + Universal Export*
*Future-Proof Edition — Compiled March 2026*

---

# PART H — Hardware Abstraction Layer

---

## Overview

This section integrates the existing hardware detection capabilities from the homelab codebase into a comprehensive Hardware Abstraction Layer (HAL). The HAL detects hardware specifications at startup, dynamically adjusts system behavior, and provides graceful degradation for resource-constrained environments.

### Existing Hardware Detection Capabilities

The homelab already contains sophisticated hardware detection in:

| Source File                                                                                                       | Capabilities                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`scripts/hardware-detect.sh`](scripts/hardware-detect.sh)                                                         | CPU family detection, GPU detection, memory detection, encoder capabilities, TDP estimation |
| [`scripts/hardware-llm-map.sh`](scripts/hardware-llm-map.sh)                                                       | Hardware-to-LLM model mapping                                                               |
| [`kilo/pipeline/src/services/scraper/hardwareProfiles.js`](kilo/pipeline/src/services/scraper/hardwareProfiles.js) | Hardware profile constants and anti-detection settings                                      |
| [`kilo/pipeline/src/config.js`](kilo/pipeline/src/config.js:12)                                                    | Hardware profile validation, circuit breaker thresholds, concurrency limits                 |
| [`plans/k3s-detection-plan.md`](plans/k3s-detection-plan.md)                                                       | K3s readiness detection, storage detection, deployment type selection                       |

---

## Phase 57 — Unified Hardware Detection Core

### Phase 57.1 — Hardware Detection Library Consolidation

Create `scripts/hardware-detection-core.sh` that unifies all detection capabilities:

```bash
#!/bin/bash
# =============================================================================
# UNIFIED HARDWARE DETECTION CORE
# Consolidates all hardware detection from existing modules
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source existing detection modules (do not redefine)
source "$SCRIPT_DIR/hardware-detect.sh" 2>/dev/null || true
source "$SCRIPT_DIR/hardware-llm-map.sh" 2>/dev/null || true

# Extended detection functions for webapp factory

# Get hardware profile with fallback detection
get_hardware_profile_v2() {
    # Check environment override first
    if [ -n "$HARDWARE_PROFILE" ]; then
        echo "$HARDWARE_PROFILE"
        return
    fi
  
    # Run detection
    get_hardware_profile
}

# Detect available CPU CORES (physical, not logical/threads)
detect_cpu_cores() {
    # Linux: get physical cores = sockets * cores_per_socket
    if [ -f /proc/cpuinfo ]; then
        local sockets cores
        sockets=$(grep -c '^physical id' /proc/cpuinfo 2>/dev/null || echo "1")
        cores=$(grep '^cpu cores' /proc/cpuinfo 2>/dev/null | head -1 | awk '{print $4}')
        if [ -n "$cores" ] && [ "$cores" -gt 0 ] 2>/dev/null; then
            echo $((sockets * cores))
            return
        fi
        # Fallback: siblings per physical CPU
        cores=$(grep '^siblings' /proc/cpuinfo 2>/dev/null | head -1 | awk '{print $3}')
        if [ -n "$cores" ] && [ "$cores" -gt 0 ] 2>/dev/null; then
            echo "$cores"
            return
        fi
    fi
    
    # macOS: physical cores
    if command -v sysctl &> /dev/null; then
        sysctl -n hw.physicalcpu 2>/dev/null && return
        sysctl -n hw.ncpu 2>/dev/null && return
    fi
    
    # Windows (Git Bash / MSYS): use wmic
    if command -v wmic &> /dev/null; then
        wmic cpu get NumberOfCores 2>/dev/null | tail -1 | tr -d ' ' && return
    fi
    
    # Fallback to logical processors
    nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1"
}

# Detect available memory in GB
detect_available_memory_gb() {
    local available_kb
    available_kb=$(free -k 2>/dev/null | awk '/^Mem:/{print $7}')
    if [ -z "$available_kb" ]; then
        available_kb=$(vm_stat 2>/dev/null | grep "Pages free" | awk '{print $3}' | tr -d '.')
        available_kb=$((available_kb * 4096 / 1024))
    fi
    echo $((available_kb / 1024 / 1024))
}

# Detect disk I/O performance class
detect_storage_type() {
    local rot rv
    rot=$(cat /sys/block/*/queue/rotational 2>/dev/null | head -1)
  
    if ls /dev/nvme* &>/dev/null; then
        echo "NVME"
    elif [ "$rot" = "0" ]; then
        echo "SSD"
    elif [ -f /sys/block/sda/queue/rotational ]; then
        echo "HDD"
    else
        echo "UNKNOWN"
    fi
}

# Detect network interface speed
detect_network_speed() {
    local speed iface
    for iface in eth0 en0 ens0; do
        if ip link show "$iface" &>/dev/null; then
            speed=$(cat "/sys/class/net/$iface/speed" 2>/dev/null)
            case "$speed" in
                10000) echo "10Gbps" && return ;;
                2500)  echo "2.5Gbps" && return ;;
                1000)  echo "1Gbps" && return ;;
                100)   echo "100Mbps" && return ;;
            esac
        fi
    done
    echo "UNKNOWN"
}

# Check for thermal throttling
detect_thermal_throttling() {
    if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
        local temp
        temp=$(cat /sys/class/thermal/thermal_zone0/temp)
        if [ "$temp" -gt 85000 ]; then  # 85°C
            echo "critical"
        elif [ "$temp" -gt 75000 ]; then  # 75°C
            echo "warning"
        else
            echo "normal"
        fi
    else
        echo "unknown"
    fi
}

# Get recommended Ollama models for CPU (based on RAM)
get_llm_models_cpu() {
    local profile="$1"
    local ram_gb="$2"
    
    case "$profile" in
        n100_like|n305)
            echo "llama3.2:1b,phi3:mini" ;;
        core_i3|amd_low)
            echo "llama3.2:3b,phi3:14b" ;;
        core_i5|amd_mid)
            echo "llama3.2:7b,phi3:14b,qwen2:7b" ;;
        core_i7|amd_high|apple_silicon|arm_high)
            echo "llama3.2:7b,llama3.1:8b,qwen2:14b,phi3.5:14b" ;;
        nvidia_*)
            echo "llama3.1:8b,qwen2:14b,llama3.2:7b" ;;
        arm_low)
            echo "llama3.2:1b,phi3:mini" ;;
        *)
            echo "llama3.2:1b" ;;
    esac
}

# Get recommended Ollama models for GPU (based on VRAM)
get_llm_models_gpu() {
    local vram_gb="$1"
    local gpu_model="$2"
    
    # If no GPU detected, return empty
    if [ -z "$vram_gb" ] || [ "$vram_gb" = "0" ]; then
        echo ""
        return
    fi
    
    local vram=$((vram_gb))
    
    if [ "$vram" -ge 24 ]; then
        echo "llama3.1:70b,qwen2.5:72b,mistral-large"
    elif [ "$vram" -ge 16 ]; then
        echo "llama3.1:8b,qwen2:14b,llama3.2:7b"
    elif [ "$vram" -ge 12 ]; then
        echo "llama3.2:7b,qwen2:7b,phi3.5:14b"
    elif [ "$vram" -ge 8 ]; then
        echo "llama3.2:3b,phi3:14b,qwen2:7b"
    elif [ "$vram" -ge 6 ]; then
        echo "llama3.2:1b,phi3:mini,qwen2:3b"
    else
        echo "llama3.2:1b,phi3:mini"
    fi
}

# Detect container environment
detect_container_type() {
    if [ -f /.dockerenv ]; then
        echo "docker"
    elif [ -f /run/.containerenv ]; then
        echo "podman"
    elif [ -n "$KUBERNETES_SERVICE_HOST" ]; then
        echo "kubernetes"
    else
        echo "baremetal"
    fi
}

# Generate comprehensive hardware profile JSON
generate_hardware_profile_json() {
    cat << EOF
{
  "hardware_profile": "$(get_hardware_profile_v2)",
  "cpu": {
    "model": "$(detect_cpu_model)",
    "family": "$(detect_cpu_family)",
    "cores": $(detect_cpu_cores),
    "has_quicksync": $(has_quicksync),
    "has_avx2": $(has_avx2),
    "has_avx512": $(has_avx512),
    "tdp_watts": $(get_tdp_watts)
  },
  "memory": {
    "total_gb": $(get_total_ram_gb),
    "available_gb": $(detect_available_memory_gb)
  },
  "gpu": {
    "vendor": "$(detect_gpu_vendor)",
    "vram_gb": $(get_gpu_vram_gb),
    "model_nvidia": "$(get_nvidia_gpu_model)",
    "bandwidth_tier": "$(get_memory_bandwidth_tier)",
    "encoder": "$(get_encoder_type)"
  },
  "storage": {
    "type": "$(detect_storage_type)",
    "available_gb": $(detect_storage_gb "/")
  },
  "network": {
    "speed": "$(detect_network_speed)"
  },
  "deployment": {
    "type": "$(get_deployment_type)",
    "container": "$(detect_container_type)",
    "thermal": "$(detect_thermal_throttling)"
  },
  "llm": {
    "cpu_models": "$(get_llm_models_cpu \"$(get_hardware_profile)\" \"$(get_total_ram_gb)\")",
    "gpu_models": "$(get_llm_models_gpu \"$(get_gpu_vram_gb)\" \"$(get_nvidia_gpu_model)\")"
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
}
```

---

## Phase 58 — Hardware-Aware Service Configuration

### Phase 58.1 — Dynamic Resource Allocation

Modify `docker-compose.yml` to use hardware-aware resource limits:

```yaml
# docker-compose.yml with HAL integration
services:
  postgres:
    deploy:
      resources:
        limits:
          memory: ${HAL_POSTGRES_MEMORY:-512M}
        reservations:
          memory: ${HAL_POSTGRES_RESERVE:-256M}
    environment:
      - POSTGRES_MAX_CONNECTIONS=${HAL_PG_MAX_CONNECTIONS:-100}

  ollama:
    environment:
      - OLLAMA_MAX_LOADED_MODELS=${HAL_OLLAMA_MAX_MODELS:-1}
      - OLLAMA_GPU_LAYERS=${HAL_OLLAMA_GPU_LAYERS:-99}
    deploy:
      resources:
        limits:
          memory: ${HAL_OLLAMA_MEMORY:-4G}
        reservations:
          devices:
            - capabilities: [gpu]
              count: ${HAL_GPU_COUNT:-0}

  kilo-pipeline:
    environment:
      - HARDWARE_PROFILE=${HARDWARE_PROFILE:-n100_like}
      - MAX_CONCURRENCY=${HAL_MAX_CONCURRENCY:-1}
      - CIRCUIT_BREAKER_THRESHOLD=${HAL_CIRCUIT_THRESHOLD:-0.15}
      - WORKER_THREADS=${HAL_WORKER_THREADS:-1}
```

### Phase 58.2 — Hardware Profile Environment Generator

Create `scripts/generate-hal-env.sh`:

```bash
#!/bin/bash
# Generate hardware-aware environment variables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/hardware-detection-core.sh"

HW_PROFILE=$(get_hardware_profile_v2)
RAM_GB=$(get_total_ram_gb)
GPU_VRAM=$(get_gpu_vram_gb)
DEPLOYMENT=$(get_deployment_type)

# Generate profile-specific values
case "$HW_PROFILE" in
    n100_like|n100)
        # Intel Alder Lake-N (N95/N97/N100/N200)
        cat << EOF
HAL_MAX_CONCURRENCY=1
HAL_POSTGRES_MEMORY=512M
HAL_POSTGRES_SHM_SIZE=256m
HAL_OLLAMA_NUM_PARALLEL=1
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=2G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=256M
HAL_CIRCUIT_THRESHOLD=0.15
HAL_SANDBOX_MEMORY=2G
HAL_SANDBOX_CPUS=1
HAL_SANDBOX_TMP_SIZE=2g
HAL_PG_MAX_CONNECTIONS=50
EOF
        ;;
    n305)
        # Intel Alder Lake-N (N305 - 8 Core)
        cat << EOF
HAL_MAX_CONCURRENCY=2
HAL_POSTGRES_MEMORY=1G
HAL_POSTGRES_SHM_SIZE=512m
HAL_OLLAMA_NUM_PARALLEL=2
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=4G
HAL_OLLAMA_MAX_MODELS=2
HAL_QDRANT_MEMORY=512M
HAL_CIRCUIT_THRESHOLD=0.25
HAL_SANDBOX_MEMORY=3G
HAL_SANDBOX_CPUS=2
HAL_SANDBOX_TMP_SIZE=4g
HAL_PG_MAX_CONNECTIONS=100
EOF
        ;;
    celeron)
        # Ultra-low-power Celeron/Pentium/Atom
        cat << EOF
HAL_MAX_CONCURRENCY=1
HAL_POSTGRES_MEMORY=256M
HAL_POSTGRES_SHM_SIZE=128m
HAL_OLLAMA_NUM_PARALLEL=1
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=1G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=128M
HAL_CIRCUIT_THRESHOLD=0.10
HAL_SANDBOX_MEMORY=1G
HAL_SANDBOX_CPUS=1
HAL_SANDBOX_TMP_SIZE=1g
HAL_PG_MAX_CONNECTIONS=30
EOF
        ;;
    core_i3|amd_low)
        cat << EOF
HAL_MAX_CONCURRENCY=1
HAL_POSTGRES_MEMORY=1G
HAL_POSTGRES_SHM_SIZE=512m
HAL_OLLAMA_NUM_PARALLEL=1
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=4G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=512M
HAL_CIRCUIT_THRESHOLD=0.25
HAL_SANDBOX_MEMORY=3G
HAL_SANDBOX_CPUS=2
HAL_SANDBOX_TMP_SIZE=4g
HAL_PG_MAX_CONNECTIONS=80
EOF
        ;;
    core_i5|amd_mid)
        cat << EOF
HAL_MAX_CONCURRENCY=2
HAL_POSTGRES_MEMORY=1G
HAL_POSTGRES_SHM_SIZE=512m
HAL_OLLAMA_NUM_PARALLEL=2
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=6G
HAL_OLLAMA_MAX_MODELS=2
HAL_QDRANT_MEMORY=1G
HAL_CIRCUIT_THRESHOLD=0.30
HAL_SANDBOX_MEMORY=4G
HAL_SANDBOX_CPUS=2
HAL_SANDBOX_TMP_SIZE=4g
HAL_PG_MAX_CONNECTIONS=100
EOF
        ;;
    core_i7|amd_high|core_i9)
        cat << EOF
HAL_MAX_CONCURRENCY=4
HAL_POSTGRES_MEMORY=2G
HAL_POSTGRES_SHM_SIZE=1g
HAL_OLLAMA_NUM_PARALLEL=4
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=8G
HAL_OLLAMA_MAX_MODELS=3
HAL_QDRANT_MEMORY=1G
HAL_CIRCUIT_THRESHOLD=0.35
HAL_SANDBOX_MEMORY=6G
HAL_SANDBOX_CPUS=4
HAL_SANDBOX_TMP_SIZE=8g
HAL_PG_MAX_CONNECTIONS=150
EOF
        ;;
    arm64_rpi5)
        # Raspberry Pi 5
        cat << EOF
HAL_MAX_CONCURRENCY=1
HAL_POSTGRES_MEMORY=256M
HAL_POSTGRES_SHM_SIZE=128m
HAL_OLLAMA_NUM_PARALLEL=1
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=1G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=128M
HAL_CIRCUIT_THRESHOLD=0.10
HAL_SANDBOX_MEMORY=1G
HAL_SANDBOX_CPUS=1
HAL_SANDBOX_TMP_SIZE=1g
HAL_PG_MAX_CONNECTIONS=30
EOF
        ;;
    arm64_rk3588)
        # Rockchip RK3588
        cat << EOF
HAL_MAX_CONCURRENCY=2
HAL_POSTGRES_MEMORY=512M
HAL_POSTGRES_SHM_SIZE=256m
HAL_OLLAMA_NUM_PARALLEL=2
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=2G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=256M
HAL_CIRCUIT_THRESHOLD=0.15
HAL_SANDBOX_MEMORY=2G
HAL_SANDBOX_CPUS=2
HAL_SANDBOX_TMP_SIZE=2g
HAL_PG_MAX_CONNECTIONS=50
EOF
        ;;
    arm64_server|apple_silicon)
        # High-end ARM servers or Apple Silicon
        cat << EOF
HAL_MAX_CONCURRENCY=8
HAL_POSTGRES_MEMORY=2G
HAL_POSTGRES_SHM_SIZE=1g
HAL_OLLAMA_NUM_PARALLEL=8
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=12G
HAL_OLLAMA_MAX_MODELS=2
HAL_QDRANT_MEMORY=2G
HAL_CIRCUIT_THRESHOLD=0.40
HAL_SANDBOX_MEMORY=8G
HAL_SANDBOX_CPUS=6
HAL_SANDBOX_TMP_SIZE=8g
HAL_PG_MAX_CONNECTIONS=200
EOF
        ;;
    *)
        # Conservative Default (N100-like)
        cat << EOF
HAL_MAX_CONCURRENCY=1
HAL_POSTGRES_MEMORY=512M
HAL_POSTGRES_SHM_SIZE=256m
HAL_OLLAMA_NUM_PARALLEL=1
HAL_OLLAMA_KEEP_ALIVE=5m
HAL_OLLAMA_MEMORY=2G
HAL_OLLAMA_MAX_MODELS=1
HAL_QDRANT_MEMORY=256M
HAL_CIRCUIT_THRESHOLD=0.15
HAL_SANDBOX_MEMORY=2G
HAL_SANDBOX_CPUS=1
HAL_SANDBOX_TMP_SIZE=2g
HAL_PG_MAX_CONNECTIONS=50
EOF
        ;;
esac

echo "HARDWARE_PROFILE=$HW_PROFILE"
echo "HAL_DEPLOYMENT_TYPE=$DEPLOYMENT"
echo "HAL_STORAGE_TYPE=$(detect_storage_type)"
```

---

## Phase 59 — Runtime Hardware Monitoring

### Phase 59.1 — Resource Monitor Service

Create `kilo/pipeline/src/services/hardwareMonitor.js`:

```javascript
'use strict';

/**
 * Hardware Abstraction Layer - Runtime Monitor
 * Continuously monitors system resources and adjusts behavior
 */

const os = require('os');
const EventEmitter = require('events');

class HardwareMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        this.interval = config.interval || 30000;
        this.memoryThreshold = config.memoryThreshold || 0.85;
        this.cpuThreshold = config.cpuThreshold || 0.90;
        this.timer = null;
        this.baseline = null;
    }

    start() {
        this.baseline = this.collectMetrics();
        this.timer = setInterval(() => this.check(), this.interval);
        this.check();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    check() {
        const metrics = this.collectMetrics();
        this.evaluateThresholds(metrics);
        this.detectTrends(metrics);
        this.emit('metrics', metrics);
        return metrics;
    }

    collectMetrics() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
      
        for (let i = 0; i < cpus.length; i++) {
            for (const type in cpus[i].times) {
                totalTick += cpus[i].times[type];
            }
            totalIdle += cpus[i].times.idle;
        }

        const freeMem = os.freemem();
        const totalMem = os.totalmem();
      
        return {
            timestamp: new Date().toISOString(),
            cpu: {
                usage: 1 - (totalIdle / totalTick),
                cores: cpus.length,
                model: cpus[0].model,
                loadAverage: os.loadavg()
            },
            memory: {
                total: totalMem,
                free: freeMem,
                used: totalMem - freeMem,
                usagePercent: (totalMem - freeMem) / totalMem
            },
            uptime: os.uptime()
        };
    }

    evaluateThresholds(metrics) {
        // Memory pressure detection
        if (metrics.memory.usagePercent > this.memoryThreshold) {
            this.emit('memoryPressure', {
                level: metrics.memory.usagePercent > 0.95 ? 'critical' : 'warning',
                usage: metrics.memory.usagePercent,
                threshold: this.memoryThreshold,
                freeMB: Math.floor(metrics.memory.free / 1024 / 1024)
            });
        }

        // CPU pressure detection
        if (metrics.cpu.usage > this.cpuThreshold) {
            this.emit('cpuPressure', {
                level: metrics.cpu.usage > 0.95 ? 'critical' : 'warning',
                usage: metrics.cpu.usage,
                threshold: this.cpuThreshold
            });
        }

        // Load average check
        if (metrics.cpu.loadAverage[0] > metrics.cpu.cores) {
            this.emit('loadPressure', {
                level: 'critical',
                load1m: metrics.cpu.loadAverage[0],
                cores: metrics.cpu.cores
            });
        }
    }

    detectTrends(metrics) {
        if (!this.baseline) return;
      
        const memDelta = metrics.memory.usagePercent - this.baseline.memory.usagePercent;
        const cpuDelta = metrics.cpu.usage - this.baseline.cpu.usage;
      
        if (memDelta > 0.2) {
            this.emit('memoryLeak', {
                delta: memDelta,
                period: '1h'
            });
        }
    }

    getRecommendedConcurrency() {
        const metrics = this.collectMetrics();
        const freeMemGB = metrics.memory.free / (1024 * 1024 * 1024);
        const recommendedMem = Math.max(1, Math.floor(freeMemGB - 1));
        const cpuFactor = metrics.cpu.usage < 0.7 ? 1 : 0.5;
      
        return Math.max(1, Math.min(recommendedMem, Math.floor(metrics.cpu.cores * cpuFactor)));
    }
}

module.exports = HardwareMonitor;
```

### Phase 59.2 — Adaptive Concurrency Controller

Create `kilo/pipeline/src/services/adaptiveConcurrency.js`:

```javascript
'use strict';

const HardwareMonitor = require('./hardwareMonitor');
const config = require('../config');

/**
 * Adaptive Concurrency Controller
 * Dynamically adjusts task concurrency based on hardware resources
 */

class AdaptiveConcurrency extends EventEmitter {
    constructor(options = {}) {
        super();
        this.minConcurrency = options.minConcurrency || 1;
        this.maxConcurrency = options.maxConcurrency || config.MAX_CONCURRENCY || 4;
        this.checkInterval = options.checkInterval || 60000;
        this.memoryHeadroomGB = options.memoryHeadroomGB || 1;
      
        this.currentConcurrency = this.maxConcurrency;
        this.monitor = new HardwareMonitor({
            interval: this.checkInterval,
            memoryThreshold: 0.80,
            cpuThreshold: 0.85
        });
      
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.monitor.on('memoryPressure', ({ level, usage, freeMB }) => {
            if (level === 'critical') {
                this.currentConcurrency = this.minConcurrency;
                console.log(`[HAL] Critical memory pressure (${(usage*100).toFixed(1)}%, ${freeMB}MB free). Min concurrency enforced.`);
                this.emit('concurrencyReduced', this.currentConcurrency);
            } else if (level === 'warning') {
                this.currentConcurrency = Math.max(
                    this.minConcurrency,
                    Math.floor(this.currentConcurrency * 0.5)
                );
                console.log(`[HAL] Memory pressure (${(usage*100).toFixed(1)}%). Concurrency: ${this.currentConcurrency}`);
                this.emit('concurrencyReduced', this.currentConcurrency);
            }
        });

        this.monitor.on('cpuPressure', ({ level, usage }) => {
            if (level === 'critical') {
                this.currentConcurrency = Math.max(this.minConcurrency, this.currentConcurrency - 2);
                console.log(`[HAL] Critical CPU (${(usage*100).toFixed(1)}%). Reduced concurrency to ${this.currentConcurrency}`);
                this.emit('concurrencyReduced', this.currentConcurrency);
            }
        });

        this.monitor.on('loadPressure', ({ load1m, cores }) => {
            this.currentConcurrency = this.minConcurrency;
            console.log(`[HAL] High load (${load1m} vs ${cores} cores). Min concurrency: ${this.currentConcurrency}`);
            this.emit('concurrencyReduced', this.currentConcurrency);
        });
    }

    start() {
        this.monitor.start();
        this.currentConcurrency = this.maxConcurrency;
    }

    stop() {
        this.monitor.stop();
    }

    getConcurrency() {
        return this.currentConcurrency;
    }

    async canExecute(taskWeight = 1) {
        const metrics = this.monitor.collectMetrics();
        const requiredMem = taskWeight * 512 * 1024 * 1024;
      
        return {
            canExecute: metrics.memory.free > (requiredMem + this.memoryHeadroomGB * 1024 * 1024 * 1024),
            metrics,
            recommendedConcurrency: this.currentConcurrency
        };
    }
}

module.exports = AdaptiveConcurrency;
```

---

## Phase 60 — Hardware-Aware Scaffold Generation

### Phase 60.1 — Profile-Based Scaffold Configuration

Modify scaffold templates for hardware-appropriate configurations:

```bash
# kilo/scaffold/scripts/common/hardware-profile.sh
#!/bin/bash
PROFILE="${HARDWARE_PROFILE:-n100_like}"
APP_DIR="$1"

case "$PROFILE" in
    n100_like|celeron|arm64_rpi5)
        cat >> "$APP_DIR/.env" << 'EOF'
# Hardware-aware defaults (HAL)
NODE_ENV=production
WORKER_CONCURRENCY=1
DB_POOL_SIZE=5
REDIS_MAX_CONNECTIONS=10
# Disable heavy features for low-end hardware
ENABLE_VIDEO_PROCESSING=false
ENABLE_REAL_TIME_COLLAB=false
EOF
        ;;
    core_i3|amd_low)
        cat >> "$APP_DIR/.env" << 'EOF'
NODE_ENV=production
WORKER_CONCURRENCY=2
DB_POOL_SIZE=10
REDIS_MAX_CONNECTIONS=20
ENABLE_VIDEO_PROCESSING=true
ENABLE_REAL_TIME_COLLAB=false
EOF
        ;;
    core_i5|amd_mid)
        cat >> "$APP_DIR/.env" << 'EOF'
NODE_ENV=production
WORKER_CONCURRENCY=4
DB_POOL_SIZE=20
REDIS_MAX_CONNECTIONS=50
ENABLE_VIDEO_PROCESSING=true
ENABLE_REAL_TIME_COLLAB=true
EOF
        ;;
    core_i7|amd_high|nvidia_*|apple_silicon)
        cat >> "$APP_DIR/.env" << 'EOF'
NODE_ENV=production
WORKER_CONCURRENCY=8
DB_POOL_SIZE=30
REDIS_MAX_CONNECTIONS=100
ENABLE_VIDEO_PROCESSING=true
ENABLE_REAL_TIME_COLLAB=true
ENABLE_ADVANCED_AI=true
EOF
        ;;
esac
```

### Phase 60.2 — GPU-Aware AI Configuration

```bash
# kilo/scaffold/scripts/ai/common/gpu-config.sh
GPU_VENDOR=$(detect_gpu_vendor 2>/dev/null || echo "NONE")
GPU_VRAM=$(get_gpu_vram_gb)

if [ "$GPU_VENDOR" = "NVIDIA" ]; then
    cat >> "$APP_DIR/.env" << EOF
AI_PROVIDER=ollama
OLLAMA_GPU_LAYERS=99
OLLAMA_NUM_THREADS=4
EOF
    [ "$GPU_VRAM" -ge 16 ] && echo "OLLAMA_BATCH_SIZE=2048" >> "$APP_DIR/.env"
    [ "$GPU_VRAM" -ge 8 ] && [ "$GPU_VRAM" -lt 16 ] && echo "OLLAMA_BATCH_SIZE=1024" >> "$APP_DIR/.env"
elif [ "$GPU_VENDOR" = "APPLE_SILICON" ]; then
    cat >> "$APP_DIR/.env" << 'EOF'
AI_PROVIDER=ollama
OLLAMA_METAL_ENABLED=true
OLLAMA_NUM_THREADS=$(sysctl -n hw.ncpu)
EOF
else
    cat >> "$APP_DIR/.env" << 'EOF'
AI_PROVIDER=ollama
OLLAMA_NUM_THREADS=2
OLLAMA_BATCH_SIZE=128
EOF
fi
```

---

## Phase 61 — Performance Benchmarking System

### Phase 61.1 — Hardware Benchmark Suite

Create `scripts/benchmark-hardware.sh`:

```bash
#!/bin/bash
echo "=== Hardware Benchmark ==="

# CPU Benchmark
echo "CPU Benchmark..."
CPU_START=$(date +%s%N)
dd if=/dev/zero bs=1M count=512 2>/dev/null | md5sum > /dev/null
CPU_END=$(date +%s%N)
CPU_MS=$(( ($CPU_END - $CPU_START) / 1000000 ))
echo "  CPU Score: $CPU_MS ms (lower is better)"

# Memory Benchmark  
echo "Memory Benchmark..."
MEM_START=$(date +%s%N)
dd if=/dev/zero bs=1M count=1024 2>/dev/null | wc -c > /dev/null
MEM_END=$(date +%s%N)
MEM_MS=$(( ($MEM_END - $MEM_START) / 1000000 ))
echo "  Memory: $(( 1024 * 1000 / MEM_MS )) MB/s"

# Storage Benchmark
echo "Disk Benchmark..."
DISK_START=$(date +%s%N)
dd if=/dev/urandom bs=4K count=1000 2>/dev/null | wc -c > /dev/null
DISK_END=$(date +%s%N)
DISK_MS=$(( ($DISK_END - $DISK_START) / 1000000 ))
echo "  Disk: $(( 4096 * 1000 / DISK_MS )) KB/s"

# Generate tier
echo ""
echo "Hardware Profile: $(get_hardware_profile)"
echo "Deployment Type: $(get_deployment_type)"
echo "LLM Models: $(get_llm_models)"
```

### Phase 61.2 — Application Performance Profiler

Create `kilo/pipeline/src/services/performanceProfiler.js`:

```javascript
'use strict';

class PerformanceProfiler {
    constructor() {
        this.profiles = new Map();
    }

    async profileOperation(name, fn) {
        const startMem = process.memoryUsage().heapUsed;
        const startTime = Date.now();
      
        try {
            const result = await fn();
            const duration = Date.now() - startTime;
            const endMem = process.memoryUsage().heapUsed;
          
            this.record(name, { duration, memoryDelta: endMem - startMem, success: true });
            return result;
        } catch (error) {
            this.record(name, { duration: Date.now() - startTime, success: false, error: error.message });
            throw error;
        }
    }

    record(name, metrics) {
        if (!this.profiles.has(name)) {
            this.profiles.set(name, []);
        }
        this.profiles.get(name).push({
            ...metrics,
            timestamp: new Date().toISOString(),
            hardware: {
                profile: process.env.HARDWARE_PROFILE,
                cores: require('os').cpus().length,
                totalMem: require('os').totalmem()
            }
        });
    }

    getStats(name) {
        const runs = this.profiles.get(name) || [];
        if (runs.length === 0) return null;

        const durations = runs.map(r => r.duration);
        return {
            count: runs.length,
            avgDuration: durations.reduce((a,b) => a+b, 0) / runs.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successRate: runs.filter(r => r.success).length / runs.length
        };
    }
}

module.exports = PerformanceProfiler;
```

---

## Phase 62 — Conditional Feature Activation

### Phase 62.1 — Hardware Feature Gates

Create `kilo/pipeline/src/services/featureGates.js`:

```javascript
'use strict';

const os = require('os');

class FeatureGates {
    constructor(hardwareProfile) {
        this.profile = hardwareProfile || 'n100_like';
        this.capabilities = this.detectCapabilities();
        this.features = this.initializeFeatures();
    }

    detectCapabilities() {
        const profile = this.profile;
      
        return {
            cores: os.cpus().length,
            totalMemoryGB: os.totalmem() / (1024**3),
            freeMemoryGB: os.freemem() / (1024**3),
            hasQuickSync: ['n100_like', 'core_i5', 'core_i7', 'n305'].includes(profile),
            hasGPU: profile.startsWith('nvidia_') || profile === 'apple_silicon',
            hasAVX2: process.arch === 'x64',
            gpuVRAM: this.getGPUVRAM(),
            isLowEnd: ['n100_like', 'celeron', 'arm64_rpi5', 'amd_low'].includes(profile)
        };
    }

    getGPUVRAM() {
        const vramMap = {
            'nvidia_small': 4, 'nvidia_medium': 8, 'nvidia_large': 12,
            'nvidia_rtx': 8, 'apple_silicon': 24, 'n100_like': 1, 'core_i5': 2
        };
        return vramMap[this.profile] || 0;
    }

    initializeFeatures() {
        const c = this.capabilities;
        return {
            PARALLEL_SCAFFOLD: { enabled: c.cores >= 4 && c.totalMemoryGB >= 8 },
            ADVANCED_AI: { enabled: c.hasGPU || c.totalMemoryGB >= 16 },
            MULTI_MODEL_OLLAMA: { enabled: c.gpuVRAM >= 8 || c.totalMemoryGB >= 16 },
            HEAVY_ANTIDETECTION: { enabled: c.cores >= 4 },
            VIDEO_PROCESSING: { enabled: c.hasQuickSync || c.hasGPU },
            LARGE_FILE_HANDLING: { enabled: c.totalMemoryGB >= 8 },
            REAL_TIME_COLLAB: { enabled: c.totalMemoryGB >= 8 && !c.isLowEnd }
        };
    }

    isEnabled(featureName) {
        const feature = this.features[featureName];
        return feature ? feature.enabled : true;
    }

    getConfig(key, defaultValue) {
        const overrides = {
            maxConcurrency: { 'n100_like': 1, 'core_i5': 2, 'core_i7': 4, 'nvidia_medium': 4 },
            sandboxMemory: { 'n100_like': '2g', 'core_i5': '4g', 'core_i7': '6g' },
            ollamaBatch: { 'n100_like': 128, 'core_i5': 512, 'core_i7': 1024 }
        };
        return overrides[key]?.[this.profile] || defaultValue;
    }
}

module.exports = FeatureGates;
```

### Phase 62.2 — Graceful Degradation Handler

```javascript
// kilo/pipeline/src/services/gracefulDegradation.js

class GracefulDegradation {
    constructor(featureGates) {
        this.gates = featureGates;
        this.degraded = new Set();
    }

    getMiddleware() {
        return (req, res, next) => {
            res.setHeader('X-Hardware-Profile', this.gates.profile);
            res.setHeader('X-Features-Available', this.getAvailableFeatures());
            next();
        };
    }

    getAvailableFeatures() {
        return Object.entries(this.gates.features)
            .filter(([_, f]) => f.enabled)
            .map(([name]) => name)
            .join(',');
    }

    checkFeature(feature, res) {
        if (!this.gates.isEnabled(feature)) {
            this.degraded.add(feature);
            if (res) {
                res.setHeader('X-Degraded-Features', [...this.degraded].join(','));
            }
            return false;
        }
        return true;
    }
}

module.exports = GracefulDegradation;
```

---

## Phase 63 — Hardware Profile API

### Phase 63.1 — Hardware Status Endpoints

Add to kilo-pipeline routes:

```javascript
// kilo/pipeline/src/routes/hardware.js
const express = require('express');
const os = require('os');
const FeatureGates = require('../services/featureGates');
const HardwareMonitor = require('../services/hardwareMonitor');
const config = require('../config');

const router = express.Router();

router.get('/status', (req, res) => {
    const gates = new FeatureGates(config.HARDWARE_PROFILE);
    const monitor = new HardwareMonitor();
  
    res.json({
        profile: config.HARDWARE_PROFILE,
        capabilities: gates.capabilities,
        current: monitor.collectMetrics(),
        features: {
            enabled: Object.keys(gates.features).filter(f => gates.isEnabled(f)),
            disabled: Object.keys(gates.features).filter(f => !gates.isEnabled(f))
        },
        recommendations: {
            concurrency: monitor.getRecommendedConcurrency(),
            maxConcurrency: config.MAX_CONCURRENCY
        }
    });
});

router.get('/benchmark', async (req, res) => {
    const start = Date.now();
    let sum = 0;
    for (let i = 0; i < 1000000; i++) sum += Math.sqrt(i);
  
    res.json({
        cpu: { duration_ms: Date.now() - start, cores: os.cpus().length },
        profile: config.HARDWARE_PROFILE,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
```

---

## Phase 64 — Integration with Webapp Factory

### Phase 64.1 — Hardware-Aware Project Registry

Update schema:

```sql
ALTER TABLE apps ADD COLUMN hardware_profile TEXT;
ALTER TABLE apps ADD COLUMN min_memory_gb INTEGER;
ALTER TABLE apps ADD COLUMN requires_gpu BOOLEAN DEFAULT FALSE;

CREATE TABLE workspace_hardware_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES apps(id),
    preferred_profile TEXT,
    min_cores INTEGER,
    min_memory_gb INTEGER,
    gpu_required BOOLEAN DEFAULT FALSE,
    auto_scale BOOLEAN DEFAULT TRUE
);
```

### Phase 64.2 — Scaffold Integration

```bash
# Add to scaffold.sh header
source "$(dirname "$0")/../hardware-detection-core.sh"
HARDWARE_PROFILE=$(get_hardware_profile_v2)
echo "Detected hardware: $HARDWARE_PROFILE"
```

---

## Phase 65 — Monitoring Dashboard

### Phase 65.1 — Grafana Hardware Panels

Add to `grafana/dashboards/homelab-overview.json`:

```json
{
  "panels": [
    {
      "title": "Hardware Profile",
      "type": "stat",
      "targets": [
        {"expr": "1", "legendFormat": "{{hardware_profile}}"}
      ]
    },
    {
      "title": "Memory Pressure",
      "type": "gauge",
      "targets": [
        {"expr": "mem_available_bytes / mem_total_bytes * 100",
         "thresholds": {"steps": [{"value": 0, "color": "red"}, {"value": 15, "color": "yellow"}, {"value": 30, "color": "green"}]}}
      ]
    },
    {
      "title": "Active vs Recommended Concurrency",
      "type": "graph",
      "targets": [
        {"expr": "kilo_active_tasks", "legendFormat": "Active"},
        {"expr": "kilo_recommended_concurrency", "legendFormat": "Recommended"}
      ]
    }
  ]
}
```

---

## Hardware Profile Quick Reference

| Profile       | CPU       | RAM   | GPU        | Concurrency | Use Case   |
| ------------- | --------- | ----- | ---------- | ----------- | ---------- |
| n100_like     | N100 (4c) | 8GB   | Intel UHD  | 1           | Basic CRUD |
| n305          | N305 (8c) | 16GB  | Intel UHD  | 2           | SaaS apps  |
| celeron       | Celeron   | 4GB   | None       | 1           | Minimal    |
| core_i3       | i3        | 8GB   | Intel      | 1           | Standard   |
| core_i5       | i5        | 16GB  | Intel      | 2           | Full SaaS  |
| core_i7       | i7        | 32GB  | Intel/Iris | 4           | Production |
| amd_low       | Athlon    | 8GB   | Vega       | 1           | Budget     |
| amd_mid       | Ryzen 5   | 16GB  | RX         | 2           | Mid-tier   |
| amd_high      | Ryzen 7/9 | 32GB+ | RX 7xxx    | 4           | Premium    |
| nvidia_small  | Any       | 16GB  | 4GB        | 2           | Light AI   |
| nvidia_medium | Any       | 16GB  | 8GB        | 4           | AI apps    |
| nvidia_large  | Any       | 32GB+ | 12GB+      | 6           | Heavy AI   |
| arm64_rpi5    | Pi 5      | 8GB   | VideoCore  | 1           | Edge       |
| arm64_server  | Neoverse  | 8GB+  | Mali       | 2           | Cloud      |
| apple_silicon | M1/M2/M3  | 16GB+ | Unified    | 4           | Mac dev    |

---

## Edge Cases and Error Handling

| Edge Case                      | Handling                                 |
| ------------------------------ | ---------------------------------------- |
| Unknown hardware profile       | Fallback to n100_like (conservative)     |
| Detection failure              | Use environment variable or default      |
| GPU detection fails            | Enable CPU-only mode gracefully          |
| Container memory limits        | Respect container limits, not bare metal |
| Thermal throttling             | Reduce concurrency proactively           |
| Concurrent resource exhaustion | Circuit breaker pattern from config.js   |

---

## Integration Points Summary

| Layer       | File                                   | Integration              |
| ----------- | -------------------------------------- | ------------------------ |
| Detection   | `scripts/hardware-detection-core.sh` | Unified HAL entry point  |
| Config      | `docker-compose.yml`                 | Dynamic resource limits  |
| Runtime     | `hardwareMonitor.js`                 | Continuous monitoring    |
| Concurrency | `adaptiveConcurrency.js`             | Dynamic task limits      |
| Scaffolding | `scaffold.sh`                        | Profile-based generation |
| Features    | `featureGates.js`                    | Conditional activation   |
| API         | `routes/hardware.js`                 | Status endpoints         |
| Monitoring  | `grafana/dashboards/`                | Hardware metrics         |

---

*homelab-master Web App Platform Implementation Plan*
*SaaS CRUD Factory + Financial Domain + Module System + AI Application Layer + Universal Export*
*Future-Proof Edition — Compiled March 2026*
