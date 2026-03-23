# Agentic Autonomous Multi-Tenant App Factory — Complete Architecture v4
> Built on Openclaw + Kilo-CLI with persistent CI/CD pipeline
>
> **This document covers two distinct architectures that must never be conflated:**
> - **Part A — The App Factory Platform** — the generator system itself (Openclaw + Kilo-CLI)
> - **Part B — The Generated App Architecture** — the full-stack apps the factory produces

---

## Design Mandates

### Factory Platform Mandates

1. **No fake modularity.** Separation is enforced by package boundaries and build-time rules — not by folder convention or developer discipline.
2. **Enforced dependency inversion.** Core never depends on modules. Modules depend only on `core-contracts`. Physical package constraint, not a guideline.
3. **Event-driven inter-module communication.** Factory modules never call each other directly. All synchronization goes through a typed, versioned event bus. No exceptions.
4. **Designed for parallel, executed sequentially first.** The pipeline contract is written for parallel semantics from day one. The scheduler is a swappable component. Switching requires one configuration value change — not rewriting generators.
5. **Hardware-aware scheduling.** The scheduler reads available CPU cores and RAM at startup and selects the appropriate execution model automatically.
6. **Multi-tenant from the start.** Tenant isolation during generation is structural — not a feature added later.
7. **Violations break the build, not just documentation.** Every architectural rule has a corresponding automated enforcement mechanism.
8. **Knowledge is a first-class output.** Every generation run produces structured, queryable, living knowledge about what was built, why, and how it works. Documentation is never an afterthought.

### Generated App Mandates

1. **Module independence.** Every generated module can be independently installed, activated, deactivated, or deleted without breaking the core app or other modules.
2. **Declared inter-module contracts only.** Modules that depend on each other do so through declared event schemas or typed API contracts — never through direct DB joins across schema namespaces or direct code imports.
3. **Portable by design.** Every generated app is deployable on shared factory infra, a VPS, a homelab, or a major cloud provider from day one.
4. **CI/CD continuity on export.** When a generated app migrates away from the factory, its CI/CD pipeline migrates with it.
5. **Knowledge travels with the app.** When exported, the full knowledge artifact bundle — semantic index, ADRs, module contracts, generation provenance — exports with the app and remains live and queryable after detachment.

---

## The Two-Level Architecture

```
╔═════════════════════════════════════════════════════════════════════════╗
║                  PART A — APP FACTORY PLATFORM                         ║
║       (Openclaw + Kilo-CLI · Sequential now · Parallel-ready always)   ║
║                                                                         ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │ F0  · FACTORY META-LAYER         (governs the factory itself)    │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F1  · INTENT & IR                (blueprint — source of truth)   │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F2  · KNOWLEDGE & PATTERN REPOSITORY                             │   ║
║  ├────────────────────────────┬─────────────────────────────────────┤   ║
║  │ F3  · CORE CONTRACTS PKG   │ F5 · ARCHITECTURE DECISION ENGINE   │   ║
║  │      (enforcement boundary)│                                     │   ║
║  ├────────────────────────────┴─────────────────────────────────────┤   ║
║  │ F4  · PLUGIN / MODULE REGISTRY                                   │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F6  · PIPELINE ORCHESTRATOR + HARDWARE-AWARE SCHEDULER           │   ║
║  │       Sequential Scheduler (active now)                          │   ║
║  │       Parallel Scheduler   (plug-in when infra allows)           │   ║
║  ├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┤   ║
║  │ F7.1 │ F7.2 │ F7.3 │ F7.4 │ F7.5 │ F7.6 │ F7.7 │     F7.8      │   ║
║  │Scaff │Code  │Data  │Auth  │DevOps│Observ│Compl.│Export/Migrate  │   ║
║  ├──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────────────┤   ║
║  │ F8  · SEMANTIC VALIDATION & CONSISTENCY LAYER                    │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F9  · MERGE COORDINATOR                                          │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F10 · KNOWLEDGE & DOCUMENTATION LAYER   ◄── NEW                 │   ║
║  │       Module Knowledge Assembler                                 │   ║
║  │       Generation Provenance Record                               │   ║
║  │       Codebase Intelligence Pipeline                             │   ║
║  │       Semantic Index (agent-queryable)                           │   ║
║  │       Documentation Generator (dev + ops + user docs)           │   ║
║  │       Knowledge Portability on Export                            │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F11 · EXTENSION & CUSTOMIZATION BOUNDARY                        │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F12 · RUNTIME FEEDBACK & REPAIR LOOP                             │   ║
║  ├───────────────────────────┬──────────────────────────────────────┤   ║
║  │ F13 · DX LAYER            │ F14 · COST & RESOURCE MODEL          │   ║
║  └───────────────────────────┴──────────────────────────────────────┘   ║
╚═════════════════════════════════════════════════════════════════════════╝
                                │ generates
                                ▼
╔═════════════════════════════════════════════════════════════════════════╗
║                PART B — GENERATED APP ARCHITECTURE                     ║
║        (Full-stack apps with their own independent module system)      ║
║                                                                         ║
║  ┌──────────────────────────────────────────────────────────────────┐   ║
║  │ A · GENERATED APP CORE     (bootstrap, auth, config)             │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ B · GENERATED APP MODULE REGISTRY  (runtime, not factory-time)   │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ C · GENERATED APP EVENT BUS        (runtime domain events only)  │   ║
║  ├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┤   ║
║  │Acctg │Billg │Invent│Procur│WMS   │HR    │POS   │  Analytics     │   ║
║  │  modules communicate only via the generated event bus            │   ║
║  │  no module queries another module's DB schema namespace          │   ║
║  ├──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────────────┤   ║
║  │ E · MULTI-TENANCY LAYER    (workspace / org isolation)           │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ G · APP KNOWLEDGE & DOCUMENTATION LAYER  ◄── NEW                │   ║
║  │     Living Codebase Index · Module Knowledge Artifacts           │   ║
║  │     User & Admin Docs     · Knowledge Portability on Export      │   ║
║  ├──────────────────────────────────────────────────────────────────┤   ║
║  │ F · DEPLOYMENT & PORTABILITY LAYER                               │   ║
║  └──────────────────────────────────────────────────────────────────┘   ║
╚═════════════════════════════════════════════════════════════════════════╝
```

---

## Critical Distinction: Two Separate Event Buses

| | Factory Event Bus | Generated App Event Bus |
|---|---|---|
| **Concern** | Generation-time orchestration | Runtime domain logic |
| **Lives in** | `core-engine` (factory) | Scaffolded into the generated app |
| **Example events** | `generator:completed@v1` | `billing:invoice.created@v1` |
| **Schema ownership** | `core-contracts/events/factory.events.ts` | `generated-app/src/events/` |
| **Consumers** | Factory pipeline stages | Generated app modules |
| **Lifecycle** | Active during generation runs | Active during app runtime |

## Critical Distinction: Two Separate Knowledge Systems

| | Factory Knowledge System | Generated App Knowledge System |
|---|---|---|
| **Concern** | Knows what the factory built and why | Knows what the app does and how it evolves |
| **Primary consumers** | Openclaw agents, factory operators | App developers, end users, future agents |
| **Updates** | On every generation or repair run | Continuously as the codebase changes |
| **Exports with app** | Read-only snapshot at export time | Full live system exports with the app |

---

# PART A — APP FACTORY PLATFORM

---

## Physical Package Structure (Factory)

```
factory/
├── packages/
│   ├── core-contracts/            ← THE ONLY LEGAL IMPORT FOR GENERATOR MODULES
│   │   ├── package.json           ← zero dependencies on core-engine
│   │   └── src/
│   │       ├── interfaces/
│   │       │   ├── ModuleGenerator.ts
│   │       │   ├── GeneratorAPI.ts
│   │       │   ├── EventBus.ts
│   │       │   ├── FileSystemAPI.ts
│   │       │   ├── BlueprintReader.ts
│   │       │   ├── Scheduler.ts
│   │       │   └── KnowledgeWriter.ts   ← NEW
│   │       ├── types/
│   │       │   ├── Manifest.ts
│   │       │   ├── ArtifactBundle.ts
│   │       │   ├── LifecycleHooks.ts
│   │       │   ├── Blueprint.ts
│   │       │   └── ModuleKnowledge.ts   ← NEW
│   │       └── events/
│   │           ├── factory.events.ts
│   │           ├── generator.events.ts
│   │           ├── knowledge.events.ts  ← NEW
│   │           └── tenant.events.ts
│   │
│   ├── core-engine/               ← ZERO modules import from here (build-enforced)
│   │   └── src/
│   │       ├── pipeline/
│   │       │   ├── SequentialScheduler.ts
│   │       │   ├── ParallelScheduler.ts
│   │       │   └── HardwareProbe.ts
│   │       ├── merge/
│   │       ├── registry/
│   │       ├── blueprint/
│   │       ├── tenant/
│   │       ├── knowledge/           ← NEW
│   │       │   ├── SemanticIndex.ts
│   │       │   ├── ProvenanceStore.ts
│   │       │   ├── KnowledgeExporter.ts
│   │       │   └── DriftDetector.ts
│   │       └── api-factory/
│   │
│   ├── module-scaffolding/        ← depends ONLY on core-contracts
│   ├── module-codegen/
│   ├── module-datalayer/
│   ├── module-auth/
│   ├── module-devops/
│   ├── module-observability/
│   ├── module-compliance/
│   └── module-export/
│
├── .dependency-cruiser.js
├── .husky/pre-commit
└── kilo.pipeline.yml
```

---

## Enforcement Wiring — All Mechanisms Active

### Import Graph Rules (dependency-cruiser)

```javascript
// .dependency-cruiser.js — all violations are build errors, not warnings

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
    // Closes the leaky contracts hole: core-contracts must never reference core-engine
    {
      name: 'core-contracts-cannot-import-core-engine',
      severity: 'error',
      from: { path: '^packages/core-contracts' },
      to:   { path: '^packages/core-engine' },
    },
    // Event types must come from core-contracts, not from emitting modules
    {
      name: 'event-types-must-come-from-contracts',
      severity: 'error',
      from: { path: '^packages/module-' },
      to:   { path: '^packages/module-.*/events' },
    },
  ],
};
```

### Pre-Commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npx dependency-cruiser --validate .dependency-cruiser.js packages/
if [ $? -ne 0 ]; then
  echo "✗ Import boundary violation. Commit blocked."
  exit 1
fi
```

### CI Pipeline Gates (kilo.pipeline.yml)

```yaml
stages:
  - name: boundary-enforcement
    run: npx dependency-cruiser --validate .dependency-cruiser.js packages/
    fail-fast: true
    blocks: [build, test, generate]

  - name: contract-test-presence
    run: node scripts/verify-contract-tests.js
    fail-fast: true
    blocks: [build, test, generate]

  - name: knowledge-artifact-presence    # NEW
    run: node scripts/verify-knowledge-artifacts.js
    fail-fast: true
    blocks: [build, test, generate]
```

### Registry Hard Rejection

The plugin registry rejects any module that:
- Fails contract tests or lacks a contract test suite
- Has import boundary violations
- Declares an event without a schema in `core-contracts/events/`
- Declares a consumed event with no registered producer
- Has incompatible `coreContractsVersion`
- **Does not produce a `ModuleKnowledge` artifact** ← NEW

### Factory Test Harness Regression

Runs on every factory release. Verifies the enforcement config itself cannot be silently broken — including knowledge pipeline regression tests.

---

## FACTORY LAYER F0 — Factory Meta-Layer

### F0.1 Generator Version Manager
- Tracks generator version per app in `factory.lock`
- Targeted updates: patch one generator without touching others
- Generator compatibility matrix maintained

### F0.2 Factory Configuration Schema
- Cascading config: platform defaults → tenant defaults → project overrides
- Per-tenant compliance profiles
- Config schema versioned with migration support

### F0.3 Factory Test Harness
- Reference apps generated on every factory update, validated against golden snapshots
- Cross-module integration tests
- Enforcement and knowledge pipeline regression tests

### F0.4 Telemetry & Learning Pipeline
- Anonymized generation outcomes feed pattern library improvements
- Failure taxonomy maps errors to responsible generators

### F0.5 Capability Negotiation Module
- Structured gap report when requirements exceed factory capabilities
- Never silently generates a broken app

### F0.6 Factory-Level Multi-Tenancy
- Separate execution contexts per tenant during generation — structural isolation, not access control
- Factory state store partitioned by `tenantId` at the data model level

---

## FACTORY LAYER F1 — Intent & Intermediate Representation (IR)

### F1.1 Intent Processor
- Natural language parser, wireframe interpreter, spec file ingester
- Ambiguity resolver: targeted clarifying questions only
- Constraint extractor: performance, compliance, scale, tenancy model

### F1.2 Blueprint Schema

```typescript
interface Blueprint {
  meta: { id: string; tenantId: string; version: string; factory_version: string; generator_lock: Record<string, string>; };
  domain: { entities: Entity[]; relationships: Relation[]; bounded_contexts: Context[]; invariants: Rule[]; };
  capabilities: { features: Feature[]; user_roles: Role[]; workflows: Workflow[]; integrations: Integration[]; };
  tenancy: { model: 'row-level' | 'schema-per-tenant' | 'silo'; workspace_aware: boolean; };
  constraints: { performance: PerfTarget[]; compliance: ComplianceProfile[]; accessibility: A11yLevel; licensing: LicensePolicy; };
  decisions: DecisionLog[];
  stack: ResolvedStack;
  module_graph: DependencyGraph;
}

// What generator modules receive — read-only, domain-scoped, no write methods
interface BlueprintReader {
  getEntitiesByDomain(domain: string): Entity[];
  getCapabilities(): Capability[];
  getConstraints(): Constraint[];
  getDecision(key: string): Decision | null;
  getWorkflowsForDomain(domain: string): Workflow[];
  getTenancyModel(): TenancyConfig;
}
```

### F1.3 Entity Graph Builder
- Fully typed graph of all domain entities, fields, relationships, cardinality
- Detects implicit entities from requirements
- Canonical entity registry — single source of truth for data shapes

### F1.4 Resolution Log
- Every architectural decision recorded: the decision, the rationale, the requirement that triggered it, alternatives considered, and why each alternative was rejected
- This is a **reasoning chain**, not just an outcome record
- Stored permanently with the generated app
- Primary feed for the Knowledge & Documentation Layer

---

## FACTORY LAYER F2 — Knowledge & Pattern Repository

### F2.1 Architectural Pattern Library
- Curated implementations per stack with intent, when-to-apply, when-NOT-to-apply, generation templates
- Stack-specific variants; pattern dependency declarations machine-readable

### F2.2 Domain Model Library
- Pre-validated domain models for SaaS, e-commerce, logistics, HR, ERP, fintech
- Composable across verticals

### F2.3 Anti-Pattern Registry
- Patterns the factory refuses to generate, with explanations and preferred alternatives
- Enforced at generation time AND semantic validation

### F2.4 Stack Compatibility Matrix
- Known-good and known-bad combinations; license compatibility checks

### F2.5 Community Pattern Store
- Vetted, signed, isolated from core library

---

## FACTORY LAYER F3 — Core Contracts Package
> *The physical enforcement boundary. The only thing modules can legally import.*

### F3.1 ModuleGenerator Interface

```typescript
interface ModuleGenerator {
  readonly manifest: ModuleManifest;
  onRegister(core: RegistrationAPI): Promise<void>;
  onInstall(reader: BlueprintReader, api: GeneratorAPI): Promise<ArtifactBundle>;
  onActivate(app: AppContext): Promise<void>;
  onDeactivate(app: AppContext): Promise<void>;
  onDelete(app: AppContext): Promise<void>;
  onConflict(other: ModuleManifest): ConflictResolution;

  // Pure function — same inputs always produce same outputs.
  // No shared mutable state. This is the single requirement
  // that makes sequential → parallel switch safe.
  generate(reader: BlueprintReader, api: GeneratorAPI): Promise<ArtifactBundle>;
  validate(bundle: ArtifactBundle): ValidationResult;
}
```

### F3.2 ModuleManifest Schema

```typescript
interface ModuleManifest {
  name: string;
  version: string;
  coreContractsVersion: string;         // semver range e.g. "^3.0.0"
  requires: string[];
  incompatibleWith: string[];
  optionalPeers: string[];
  namespace: string;                    // "src/modules/accounting"
  schemaNamespace: string;              // "acct_"
  routeNamespace: string;               // "/api/accounting"
  emits: string[];                      // e.g. ["billing:invoice.created@v1"]
  consumes: string[];                   // e.g. ["accounting:period.closed@v1"]
  coreApiUsage: string[];
  provides: Capability[];
  contractTestPath: string;             // required — registry rejects if absent
  knowledgeArtifactPath: string;        // NEW — required — registry rejects if absent
}
```

### F3.3 GeneratorAPI — The Strict Facade

```typescript
interface GeneratorAPI {
  // Namespace-locked at construction. Writing outside namespace throws NamespaceViolationError.
  fs: {
    write(relativePath: string, content: string): Promise<void>;
    read(relativePath: string): Promise<string>;
    exists(relativePath: string): Promise<boolean>;
  };

  // Module declares, core manages. No cross-module schema access.
  schema: {
    registerTable(def: TableDefinition): void;
    registerEnum(def: EnumDefinition): void;
    registerIndex(def: IndexDefinition): void;
    registerForeignKey(def: FKDefinition): void;
  };

  // Scoped to declared events only.
  // Emitting OR subscribing to undeclared events throws UndeclaredEventError at API level.
  events: {
    emit<T extends DomainEvent>(event: T): Promise<void>;
    on<T extends DomainEvent>(eventType: T['type'], handler: (event: T) => Promise<void>): Unsubscribe;
  };

  // NEW — modules write structured knowledge as part of generation
  // Knowledge is part of the ArtifactBundle — not optional
  knowledge: KnowledgeWriter;

  templates: { render(name: string, data: Record<string, unknown>): Promise<string>; list(): string[]; };
  log: { info(msg: string, meta?: object): void; warn(msg: string, meta?: object): void; error(msg: string, meta?: object): void; };
}
```

### F3.4 KnowledgeWriter Interface — NEW

Every module writes structured knowledge about itself during `generate()`. This is part of the `ArtifactBundle` — not a separate optional step.

```typescript
// core-contracts/interfaces/KnowledgeWriter.ts

interface KnowledgeWriter {
  setDomainDescription(description: string): void;
  registerEntity(entity: ModuleEntityDoc): void;
  documentEmittedEvent(eventType: string, doc: EventDoc): void;
  documentConsumedEvent(eventType: string, doc: EventDoc): void;
  documentEndpoint(endpoint: EndpointDoc): void;
  registerInvariant(invariant: InvariantDoc): void;
  registerExtensionPoint(point: ExtensionPointDoc): void;
  declareDependents(impact: DeactivationImpact): void;
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
  deactivationImpact: DeactivationImpact;
  dependencyTrace: DependencyTrace; // populated by factory after merge
}
```

### F3.5 Versioned Event Schemas

```typescript
// core-contracts/events/billing.events.ts
// Owned by core-contracts — not by the billing module

export interface InvoiceCreatedEventV1 {
  type: 'billing:invoice.created@v1';
  schemaVersion: '1';
  payload: { invoiceId: string; customerId: string; amount: number; currency: string; lineItems: LineItem[]; };
}

// Schema evolution: v1 stays active until all consumers migrate to v2
export interface InvoiceCreatedEventV2 {
  type: 'billing:invoice.created@v2';
  schemaVersion: '2';
  payload: { invoiceId: string; customerId: string; amount: number; currency: string; taxRate: number; lineItems: LineItem[]; };
}
```

Breaking changes require a versioned transition. Registry validates consumer/producer version compatibility. No silent payload changes.

### F3.6 Scheduler Interface

```typescript
interface Scheduler {
  schedule(tasks: GeneratorTask[]): Promise<ArtifactBundle[]>;
  // Sequential: runs tasks one at a time (active now)
  // Parallel: runs tasks in isolated worker contexts (one config change)
  // Same interface. Same contract. Same inputs. Same outputs.
}

interface GeneratorTask {
  module: ModuleGenerator;
  reader: BlueprintReader;   // read-only — safe to share across parallel tasks
  api: GeneratorAPI;         // scoped per module — safe for parallel use
}
```

---

## FACTORY LAYER F4 — Plugin / Module Registry
> *Gatekeeper. Seven validations before any generation runs.*

### F4.1 Plugin Contract Enforcer

```typescript
async register(module: ModuleGenerator): Promise<void> {
  this.validateManifest(module.manifest);

  const testResult = await this.runContractTests(module);
  if (!testResult.passed) throw new RegistrationRejectedError('contract tests missing or failing');

  const violations = await this.scanImportGraph(module);
  if (violations.length > 0) throw new RegistrationRejectedError(`import violations: ${violations}`);

  for (const eventType of module.manifest.emits)
    if (!this.eventSchemaRegistry.has(eventType))
      throw new RegistrationRejectedError(`no schema for declared emit: ${eventType}`);

  for (const eventType of module.manifest.consumes)
    if (!this.hasRegisteredProducer(eventType))
      throw new RegistrationRejectedError(`no producer for declared consume: ${eventType}`);

  if (!semver.satisfies(CURRENT_CONTRACTS_VERSION, module.manifest.coreContractsVersion))
    throw new RegistrationRejectedError(`contracts version mismatch — no shims`);

  // NEW: knowledge artifact presence required
  if (!module.manifest.knowledgeArtifactPath)
    throw new RegistrationRejectedError(`module must declare knowledgeArtifactPath`);

  this.modules.set(module.manifest.name, module);
}
```

### F4.2 Dependency Resolver
- Topological sort from manifest `requires` — circular dependency detection at registration, never at generation time
- Version conflict: highest compatible version wins
- Locked dependency graph stored in `factory.lock`

### F4.3 Lifecycle Orchestrator

```
UNREGISTERED → REGISTERED → INSTALLED → ACTIVE ⇄ DEACTIVATED → DELETED
```

- Each transition atomic — partial state changes roll back
- Deactivation and deletion strictly separate
- Deactivation: routes and listeners unregistered, data and files untouched
- Deletion: destructive, requires explicit conflict resolution with dependents first

### F4.4 Scoped GeneratorAPI Factory

```typescript
class ScopedGeneratorAPI implements GeneratorAPI {
  constructor(
    private readonly namespace: string,
    private readonly declaredEmits: string[],
    private readonly declaredConsumes: string[],
    private readonly rawFS: InternalFileSystem,
    private readonly rawEventBus: InternalEventBus,
    private readonly knowledgeStore: ModuleKnowledgeStore,
  ) {}

  fs = {
    write: async (relativePath: string, content: string) => {
      const fullPath = path.join(this.namespace, relativePath);
      if (!fullPath.startsWith(this.namespace))
        throw new NamespaceViolationError(fullPath, this.namespace);
      return this.rawFS.write(fullPath, content);
    },
  };

  events = {
    emit: async (event: DomainEvent) => {
      if (!this.declaredEmits.includes(event.type))
        throw new UndeclaredEventError('emit', event.type);
      return this.rawEventBus.publish(event);
    },
    on: (eventType: string, handler: Function) => {
      // Closes subscription enforcement hole from v2/v3
      if (!this.declaredConsumes.includes(eventType))
        throw new UndeclaredEventError('subscribe', eventType);
      return this.rawEventBus.subscribe(eventType, handler);
    },
  };

  knowledge = new ScopedKnowledgeWriter(this.namespace, this.knowledgeStore);
}
```

### F4.5 Conflict Detector
- Runs before generation — catches incompatible module combinations early
- Hard block until all conflicts resolved

---

## FACTORY LAYER F5 — Architecture Decision Engine

### F5.1 Stack Selector
- Maps requirements to stack choices based on compatibility matrix
- Every decision recorded in Resolution Log with full reasoning chain: decision, rationale, alternatives considered, why each was rejected

### F5.2 Service Boundary Detector
- Default: modular monolith. Microservices requires explicit justification.
- Produces bounded context map fed to module registry namespace assignments

### F5.3 Database Topology Planner
- Selects primary DB engine with justification
- Tenancy model (row-level / schema-per-tenant / silo) as a first-class decision

### F5.4 Scalability Profiler
- Identifies bottlenecks at target scale
- Determines what to scaffold now vs. abstract for later

### F5.5 Dependency Graph Builder
- Resolves all third-party packages and transitive dependencies
- License compatibility check and CVE scan before generation begins

---

## FACTORY LAYER F6 — Pipeline Orchestrator + Hardware-Aware Scheduler
> *Sequential now. Parallel-ready always. One config value switches between them.*

### F6.1 Hardware Probe

```typescript
class HardwareProbe {
  selectScheduler(config: FactoryConfig): Scheduler {
    const cpuCores = os.cpus().length;
    const freeMemGB = os.freemem() / 1e9;

    if (config.scheduler === 'sequential') return new SequentialScheduler();
    if (config.scheduler === 'parallel') return new ParallelScheduler({ workers: cpuCores - 1 });
    if (cpuCores >= 4 && freeMemGB >= 4)
      return new ParallelScheduler({ workers: Math.min(cpuCores - 1, 8) });
    return new SequentialScheduler();
  }
}
```

### F6.2 Sequential Scheduler (Active Now)

```typescript
class SequentialScheduler implements Scheduler {
  async schedule(tasks: GeneratorTask[]): Promise<ArtifactBundle[]> {
    const results: ArtifactBundle[] = [];
    for (const task of tasks)
      results.push(await task.module.generate(task.reader, task.api));
    return results;
  }
}
```

### F6.3 Parallel Scheduler (One Config Change Away)

```typescript
class ParallelScheduler implements Scheduler {
  async schedule(tasks: GeneratorTask[]): Promise<ArtifactBundle[]> {
    // Safe because: scoped GeneratorAPI per task (no shared state),
    // read-only BlueprintReader (no write contention),
    // generate() is a pure function (contract-tested)
    return Promise.all(tasks.map(t => t.module.generate(t.reader, t.api)));
  }
}
```

### F6.4 Kilo-CLI Stage Mapping

```yaml
# kilo.pipeline.yml

pipeline:
  stages:
    # Sequential — must complete before generators run
    - { name: boundary-enforcement,   type: sequential }
    - { name: intent-processing,      type: sequential }
    - { name: ir-construction,        type: sequential }
    - { name: architecture-decisions, type: sequential }
    - { name: dependency-resolution,  type: sequential }
    - { name: scaffold-init,          type: sequential, note: "creates filesystem skeleton first" }

    # Parallel-ready — all generators after scaffold-init
    - name: generators
      type: scheduler-selected    # SequentialScheduler or ParallelScheduler per HardwareProbe
      runs: [module-codegen, module-datalayer, module-auth, module-devops,
             module-observability, module-compliance, module-export]

    # Sequential — after all generators complete
    - { name: semantic-validation, type: sequential }
    - { name: merge,               type: sequential }
    - { name: knowledge-assembly,  type: sequential }   # NEW
    - name: post-generation
      type: sequential
      runs: [extension-boundary, feedback-loop, knowledge-layer, dx-layer]
```

### F6.5 Artifact Collector
- Gathers `ArtifactBundle` outputs including `ModuleKnowledge` artifacts
- Records full artifact provenance

### F6.6 Rollback Manager
- Snapshots before each pipeline stage
- Granular rollback: single module without affecting others

---

## FACTORY LAYER F7 — Core Generator Modules
> *All run in isolation. Scoped API. Read-only blueprint. Each produces code AND knowledge artifacts.*

### F7.1 Scaffolding Module
**Runs first, sequentially.** Stack-aware, domain-agnostic — zero knowledge of specific business modules.

- Directory trees, package manifests, config files, workspace setup
- Namespace reservation for all generator modules
- App scaffold and module scaffolds versioned independently

### F7.2 Code Generation Module

Every sub-generator produces both **code artifacts** and **knowledge artifacts** via `api.knowledge`.

**Model / Entity Generator** — DB schema, ORM models, shared types, DTOs

**API Layer Generator** — REST/GraphQL endpoints, controllers, validators, versioning structure

**Service / Business Logic Generator** — service classes, use cases, domain events at correct boundaries, transactions

**UI Component Generator** — pages, forms, tables, layouts, loading/error/empty states

**State Management Generator** — stores, API client generated from OpenAPI spec

**Test Scaffold Generator** — unit stubs, integration harnesses, test factories, E2E skeletons, and the per-module contract test suite:

```typescript
// Every generator module ships this — module-*/src/__tests__/contract.test.ts

describe('[module-name] contract compliance', () => {

  it('only calls declared GeneratorAPI methods', async () => {
    const spy = createCoreAPISpy(manifest.coreApiUsage);
    await module.generate(mockReader, spy.api);
    expect(spy.undeclaredCalls).toHaveLength(0);
  });

  it('only emits declared events', async () => {
    const spy = createEventSpy();
    await module.generate(mockReader, { ...mockAPI, events: spy });
    spy.emitted.forEach(e => expect(manifest.emits).toContain(e.type));
  });

  it('only subscribes to declared events', async () => {
    const spy = createEventSpy();
    await module.generate(mockReader, { ...mockAPI, events: spy });
    spy.subscriptions.forEach(s => expect(manifest.consumes).toContain(s));
  });

  it('only writes to declared namespace', async () => {
    const spy = createFSSpy();
    await module.generate(mockReader, { ...mockAPI, fs: spy });
    spy.writes.forEach(w => expect(w.startsWith(manifest.namespace)).toBe(true));
  });

  it('has no static imports from other module packages', () => {
    const imports = getStaticImports(__dirname + '/..');
    imports.forEach(i => expect(i).not.toMatch(/^packages\/module-(?!THIS_MODULE)/));
  });

  it('generate() is pure — same inputs produce same outputs', async () => {
    const r1 = await module.generate(mockReader, mockAPI);
    const r2 = await module.generate(mockReader, mockAPI);
    expect(r1).toEqual(r2);
  });

  // NEW — knowledge artifact is required
  it('produces a complete ModuleKnowledge artifact', async () => {
    const spy = createKnowledgeSpy();
    await module.generate(mockReader, { ...mockAPI, knowledge: spy });
    expect(spy.artifact.domainDescription).toBeTruthy();
    expect(spy.artifact.entities.length).toBeGreaterThan(0);
    expect(spy.artifact.extensionPoints.length).toBeGreaterThan(0);
  });
});
```

### F7.3 Data Layer Module
- Schema compiler → migration files; migration sequencer; seed data generator
- Multi-tenancy handler: tenant scoping in every generated query — not optional
- Connection configuration: pooling, read replica routing

### F7.4 Auth & Identity Module
- Auth strategy per blueprint; role/permission schema; auth guard on every route
- SSO as opt-in sub-generators; audit log scaffolding for regulated operations

### F7.5 DevOps & Deployment Module

**Cloud targets:** Vercel, Railway, Render, AWS CDK, GCP Cloud Run, Kubernetes

**Homelab targets (first-class, not afterthoughts):**
- Nginx / Traefik / Caddy reverse proxy configuration
- Let's Encrypt ACME SSL provisioning scripts
- Docker Compose production profile — runs on any Linux host, no cloud account required
- Self-contained `deploy.sh` for any Linux VPS

### F7.6 Observability Module
- Structured logging, metrics (Prometheus/Datadog/OTel), distributed tracing, error capture
- Alerting rules for declared critical business metrics

### F7.7 Compliance & Governance Module
- GDPR, HIPAA, SOC2, PCI-DSS compliance profiles — each injects requirements across all generators
- PII field tagging, data flow tracing, consent management, data retention, audit trail

### F7.8 Export & Migration Module

**Export Artifact Generator**
- Docker image manifests, Helm charts, DB dump scripts, `.env.template`
- `factory.lock` export: full record of what was generated and with which versions

**Infra Abstraction Layer**
Generated apps call adapter interfaces — never cloud provider APIs directly:
```typescript
interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
}
// Implementations: LocalStorageAdapter, S3StorageAdapter, GCSStorageAdapter, R2StorageAdapter
// Switching = one config value. Zero business logic changes.
```

**Factory Detachment Protocol**
```bash
# infra/deploy/factory-detach.sh
#!/bin/bash
./db/restore.sh
cp env/.env.template .env && read -p "Fill .env then press enter..."
docker-compose -f compose/docker-compose.prod.yml up -d
curl -f http://localhost/health || exit 1
cp ci/github-actions.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "chore: transfer CI/CD from factory to app repository"
echo "✓ Running independently. Factory regeneration still available on request."
```

**Supported Export Targets:** Homelab VPS (Docker + Nginx/Traefik), GitHub/GitLab runners, Vercel + Railway, AWS, GCP, any Linux host with Docker

---

## FACTORY LAYER F8 — Semantic Validation & Consistency Layer

### F8.1 Cross-Module Type Consistency
DB schema types match ORM models match API DTOs match frontend types. Reports with responsible generator identified.

### F8.2 Security Posture Auditor
Unguarded routes, hardcoded secrets, missing CORS/CSP, OWASP Top 10 static analysis.

### F8.3 Contract Verifier
Generated service boundaries honor declared interfaces. Cross-module DB access auditor: no module queries another module's schema namespace in generated code.

### F8.4 Dead Code & Orphan Detector
Reports — does not remove. Developer decisions.

### F8.5 Anti-Pattern Enforcer
Hard block on critical violations; warns on minor ones.

---

## FACTORY LAYER F9 — Merge Coordinator

### F9.1 Conflict Resolution Semantics

| Resource Type | Merge Semantic |
|---|---|
| Files in separate namespaces | Additive |
| Same JSON/YAML config | Deep merge with declared priority order |
| Same route path | Hard conflict — generation halts |
| DB schema contributions | Applied in manifest dependency order |
| Navigation entries | Additive, ordered by manifest weight |
| Middleware pipeline | Applied in declared dependency order |
| Environment variables | Last-writer-wins with conflict warning |
| Third-party dependencies | Highest compatible version wins |
| **Module knowledge artifacts** | **Assembled into unified App Knowledge Graph** |

### F9.2 Schema Merge Engine
Combines DB schema fragments; cross-module FK references through canonical entity registry — never raw table names.

### F9.3 Dependency Deduplicator
Merges dependency manifests; irreconcilable version conflicts are hard errors.

### F9.4 Merge Audit Log
Every merge decision recorded permanently. Feeds telemetry and knowledge generation.


---

## FACTORY LAYER F10 — Knowledge & Documentation Layer ← NEW
> *Knowledge is a first-class output. Not a post-process. Not an afterthought.*

This layer has two modes that run together:

- **Generation-time knowledge** — produced during the generation run, assembled from module knowledge artifacts, resolution log, and merge audit
- **Post-generation living knowledge** — a continuous pipeline that watches the codebase after generation and keeps knowledge artifacts current as it evolves

Both are required. Generation-time knowledge without the living update pipeline drifts into obsolescence within weeks of the first post-generation commit.

### F10.1 Module Knowledge Assembler

After the merge stage, assembles all `ModuleKnowledge` artifacts into a unified **App Knowledge Graph** — machine-readable, queryable, consumed by Openclaw agents and developers alike.

```typescript
interface AppKnowledgeGraph {
  generatedAt: string;
  factoryVersion: string;
  blueprintId: string;
  modules: Record<string, ModuleKnowledge>;

  // Cross-module relationships derived from event bus topology
  eventFlows: EventFlowEntry[];
  dependencyMap: DependencyMapEntry[];

  // Pre-computed queries for agent and developer use
  queries: {
    deactivationImpact(moduleName: string): DeactivationImpact;
    modulesAffecting(moduleName: string): string[];
    dataExposedTo(moduleName: string): EntityDoc[];
    extensionPoints(moduleName: string): ExtensionPointDoc[];
  };
}
```

### F10.2 Generation Provenance Record

For every generation run — richer than the Resolution Log. Captures the full reasoning chain, not just the outcome.

```typescript
interface GenerationProvenanceRecord {
  runId: string;
  tenantId: string;
  blueprintVersion: string;
  timestamp: string;

  decisions: ProvenanceDecision[];
  // Each decision includes:
  //   what was decided · why (the requirement that drove it)
  //   alternatives considered · why each was rejected
  //   what would change if a specific constraint changed (what-if map)

  moduleVersionsUsed: Record<string, string>;
  patternsApplied: PatternApplication[];
  antiPatternsAvoided: string[];

  // Pre-computed at generation time
  whatIf: WhatIfEntry[];
  // e.g. "If compliance changed from GDPR to HIPAA, these 4 modules would regenerate"
  // e.g. "If scale target doubled, queue infrastructure would be scaffolded"
}
```

### F10.3 Codebase Intelligence Pipeline

A **continuous process** — not a one-time generator — that runs inside the generated app's CI pipeline after every commit. Keeps the knowledge system current as the codebase evolves.

```
On every commit to the generated app:
  1. Change detector    → which files changed?
  2. Classification     → factory-managed vs. developer-owned vs. ejected?
  3. Impact analyzer    → which knowledge artifacts are affected?
  4. Knowledge updater  → updates affected semantic index entries
  5. Drift detector     → are any knowledge artifacts out of sync with code?
  6. Drift report       → surfaces to developer: "billing module knowledge is stale"
```

**What the pipeline maintains:**
- **Semantic index** — entities, services, event flows, API routes, extension points — always current
- **Customization map** — which parts are developer-owned vs. factory-managed
- **Drift registry** — knowledge artifacts that have fallen out of sync with code
- **Agent context store** — pre-computed structured context for Openclaw agents

**Why this matters for the agentic setup specifically:**
When an Openclaw agent is asked to regenerate the billing module, it needs to know: what developer customizations exist in the billing neighborhood; which extension points have been used and how; what other modules would be affected; what the current state of the billing knowledge is. Without this pipeline, the agent reads raw source files — slow, error-prone, and context-window-constrained. With it, the agent queries the semantic index — fast, structured, and complete.

### F10.4 Semantic Index (Agent-Queryable)

```typescript
interface SemanticIndex {
  // Entity queries
  findEntity(name: string): EntityEntry | null;
  getEntitiesOwnedBy(module: string): EntityEntry[];

  // Service queries
  getServicesIn(module: string): ServiceEntry[];

  // Event flow queries
  getEventProducers(eventType: string): string[];
  getEventConsumers(eventType: string): string[];
  getFullEventFlow(): EventFlowGraph;

  // Customization queries — critical for safe regeneration
  getCustomizedFiles(): CustomizedFile[];
  getEjectedModules(): string[];
  getExtensionPointUsage(module: string): ExtensionPointUsage[];

  // Impact queries
  getRegenerationImpact(module: string): RegenerationImpact;
  getDeactivationImpact(module: string): DeactivationImpact;

  // Drift queries
  getStalenessReport(): StalenessReport;
  getLastUpdated(module: string): string;
}
```

### F10.5 Documentation Generator

Produces human-readable documentation from knowledge artifacts. Runs after knowledge assembly and updates via the CI pipeline on every commit.

**Developer Documentation (auto-generated and auto-updated):**
- Architecture Decision Records (ADRs) from the Generation Provenance Record
- Entity Relationship Diagrams from the entity graph
- API reference from the OpenAPI spec
- Module dependency graph showing event bus topology (not import graph)
- Extension points catalog per module
- `CONTRIBUTING.md` with actual stack and convention specifics

**Operational Documentation:**
- Runbook: common operational tasks specific to the generated stack
- Module dependency impact matrix: "if I deactivate X, Y and Z are affected"
- Data dictionary: every entity, every field, its owner module, compliance classification

**End-User Documentation (for generated business apps):**
- Feature guides per activated module: how to use accounting, billing, HR — not how to develop them
- Admin configuration guides: module setup, tenant management, integration configuration
- Onboarding walkthroughs: guided first-use flows generated from declared user workflows in the blueprint

**What-If Documentation:**
- Pre-computed from the Generation Provenance Record
- "If you change the compliance profile to HIPAA, here is exactly what would regenerate and why"
- Surfaced in the factory UI and queryable by Openclaw agents

### F10.6 Knowledge Portability on Export

When an app is exported, the full knowledge system exports with it.

**What exports:**
- Complete `AppKnowledgeGraph` snapshot at time of export
- All Generation Provenance Records
- Semantic index in a portable, self-hostable format
- Codebase Intelligence Pipeline scripts configured for the app's own CI
- Lightweight self-hosted knowledge server

```
export-package/
└── knowledge/
    ├── app-knowledge-graph.json
    ├── provenance-records/
    ├── semantic-index/
    ├── knowledge-server/
    │   ├── Dockerfile
    │   └── server.ts         ← exposes SemanticIndex query API post-detachment
    └── ci-pipeline/
        └── update-knowledge.yml  ← keeps index current after factory detachment
```

**Post-detachment continuity:** The app's CI runs the Codebase Intelligence Pipeline on every commit. The factory retains a read-only snapshot sufficient to support future regeneration requests — even for fully detached apps.

---

## FACTORY LAYER F11 — Extension & Customization Boundary

### F11.1 Ejection System
- Granular: eject a component, service, or entire module
- Ejected files tracked in `factory.lock` — factory skips on regeneration
- Partial ejection: "use my auth controller, regenerate the auth model"

### F11.2 Extension Points Catalog
- First-class generated artifacts — not ad-hoc comments
- Every generated file expected to be extended has explicit, documented hooks
- Catalog surfaced via semantic index and DX layer

### F11.3 Override Registry
- Overrides recorded in blueprint, respected on regeneration
- Overridden components must conform to typed interfaces

### F11.4 Three-Way Merge Engine
1. **Base** — original generated version (in `factory.lock`)
2. **Theirs** — new generated version
3. **Yours** — developer modifications

Conflicts surfaced with factory context from the Knowledge Layer: "this section changed because the `Invoice` entity gained a `taxRate` field — here is the ADR that explains why."

### F11.5 Factory Health Report
- Per regeneration: % factory-managed vs. % developer-customized per module
- High customization on a specific module = generator quality or extension point coverage signal

---

## FACTORY LAYER F12 — Runtime Feedback & Repair Loop

### F12.1 Build Error Ingestion
Captures build, lint, type-check output. Classifies by type and origin module. Enriches with blueprint context and semantic index entries.

### F12.2 Error-to-Generator Router
Routes to the specific responsible generator — not a generic re-prompt. Provides the agent with: the error, the responsible generator, the relevant blueprint fragment, and the current semantic index entry for the affected area.

### F12.3 Patch vs. Regenerate Decision Engine
Factors: error severity, affected file count, factory-managed vs. developer-owned, time budget. Every decision recorded and outcome tracked.

### F12.4 Regression Guard
Re-runs semantic validation on repaired artifacts. Verifies fixing A did not break B's contracts.

### F12.5 Repair History Store
Recurring repairs on one generator = permanent generator fix needed. Feeds factory telemetry and pattern library.

---

## FACTORY LAYER F13 — Developer Experience (DX) Layer

### F13.1 Documentation Surface
Human-facing rendering of knowledge artifacts from F10. ADRs, ERDs, API reference, module dependency graph, CONTRIBUTING.md. Kept current by the Codebase Intelligence Pipeline — not static snapshots.

### F13.2 Code Explanation Layer
Generated code annotated with why decisions were made. Powered by Generation Provenance Record and Resolution Log. Surfaced in IDE via comments and factory UI on hover.

### F13.3 Local Development Bootstrapper
`make dev` starts all services in correct dependency order. `.vscode/` config specific to generated stack. `README.md` reflects actual generated stack — never generic.

### F13.4 Component Explorer
Storybook scaffolded and pre-populated. Visual regression and accessibility testing configured.

---

## FACTORY LAYER F14 — Cost & Resource Model

### F14.1 Infrastructure Cost Estimator
Projected costs at 1k / 10k / 100k / 1M users per provider including self-hosted homelab estimate. Surfaced at architecture decision time — before lock-in.

### F14.2 Bundle Size Analyzer
Dependency tree weight analysis. Code-splitting and lazy loading configured for heavy modules.

### F14.3 Query Performance Predictor
N+1 pattern static analysis, proactive index generation, missing pagination flags.

### F14.4 Dependency Weight Auditor
Heavy library → lighter alternative flags. Duplicate functionality across generators surfaced.


---

---

# PART B — GENERATED APP ARCHITECTURE
> *Full-stack apps produced by the factory. Separate module system. Separate event bus. Separate registry. Separate knowledge system.*

---

## Generated App Physical Structure

```
generated-app/
├── factory.lock                   ← generator versions, ejected files, overrides
├── src/
│   ├── core/                      ← app bootstrap — not a business module
│   ├── module-registry/           ← runtime registry (separate from factory's)
│   ├── event-bus/                 ← runtime domain event bus (separate from factory's)
│   │   ├── bus.ts
│   │   └── schemas/               ← generated from blueprint module dependency graph
│   ├── tenancy/                   ← generated from blueprint tenancy model
│   └── modules/
│       ├── accounting/            ← acct_* schema namespace
│       ├── billing/               ← bill_* schema namespace
│       ├── inventory/             ← inv_*  schema namespace
│       ├── procurement/           ← proc_* schema namespace
│       ├── wms/                   ← wms_*  schema namespace
│       ├── hr/                    ← hr_*   schema namespace
│       ├── pos/                   ← pos_*  schema namespace
│       └── analytics/             ← anal_* schema namespace
├── knowledge/                     ← generated app knowledge system (NEW)
│   ├── app-knowledge-graph.json
│   ├── provenance-records/
│   ├── semantic-index/
│   ├── knowledge-server/
│   └── docs/
│       ├── developer/
│       │   ├── architecture/      ← ADRs, ERDs, module dependency graphs
│       │   ├── api/               ← API reference from OpenAPI spec
│       │   ├── modules/           ← per-module knowledge artifacts
│       │   └── CONTRIBUTING.md
│       ├── operational/
│       │   ├── runbook.md
│       │   └── dependency-impact-matrix.md
│       └── user/
│           ├── features/          ← per-module end-user guides
│           ├── admin/             ← configuration and tenant management
│           └── onboarding/        ← guided first-use flows
├── infra/
│   ├── adapters/                  ← swappable infra abstraction layer
│   └── deploy/
│       ├── docker-compose.yml
│       ├── docker-compose.prod.yml
│       ├── helm/
│       ├── nginx.conf
│       ├── traefik.yml
│       └── factory-detach.sh
└── .github/workflows/
    ├── ci.yml
    └── update-knowledge.yml       ← keeps knowledge index current on every commit (NEW)
```

---

## GENERATED APP LAYER A — Generated App Core
*Framework bootstrap. Not a business module. Never installs or deactivates.*

- App bootstrap: server init, middleware stack, graceful shutdown
- Config loader: typed env var schema with validation on startup
- Database connection: pooling, health check, migration runner
- Request lifecycle: request ID injection, structured logging, error boundary
- Zero knowledge of specific business modules — only knows the module registry interface

---

## GENERATED APP LAYER B — Generated App Module Registry
*Runtime equivalent of the factory registry. Governs the app's own modules.*

### B.1 Runtime Module Manifest

```typescript
// src/modules/billing/manifest.ts — generated by factory, owned by the app

export const billingManifest: AppModuleManifest = {
  name: 'billing',
  version: '1.0.0',
  requires: ['accounting'],          // billing posts to accounting ledgers
  emits: [
    'billing:invoice.created@v1',
    'billing:payment.received@v1',
    'billing:invoice.voided@v1',
  ],
  consumes: [
    'accounting:period.closed@v1',   // billing locks invoices on period close
  ],
  schemaNamespace: 'bill_',
  routeNamespace: '/api/billing',
  nav: { label: 'Billing', icon: 'receipt', weight: 30 },
};
```

### B.2 App Module Lifecycle

```
UNINSTALLED → INSTALLED → ACTIVE ⇄ DEACTIVATED → DELETED
```

- Each transition atomic
- Deactivation: routes and listeners unregistered, data and files untouched
- Deletion: destructive, requires explicit conflict resolution with dependents first
- Dependent modules receive `onDependencyDeactivated` — can degrade gracefully or deactivate themselves

### B.3 Dependency Resolution
- Install order resolved from `requires` at app startup
- Circular dependency detection: startup fails with a clear error
- Clear failure messages: "billing requires accounting — install accounting first"

---

## GENERATED APP LAYER C — Generated App Event Bus
*Runtime domain communication. Completely separate from the factory event bus.*

All inter-module communication follows the same pattern: the triggering module emits an event; the responding module subscribes. No direct calls. No cross-schema queries. The event bus is the only bridge.

**Invoice → Accounting (billing requires accounting):**
```
billing emits   → billing:invoice.created@v1
accounting subs → on invoice.created → create journal entry in acct_journal_entries
never           → billing queries acct_* tables directly
never           → accounting imports InvoiceService from billing module
```

**Sale → Inventory (pos requires inventory):**
```
pos emits       → pos:sale.completed@v1 { lineItems: [{productId, qty}] }
inventory subs  → on sale.completed → decrement inv_stock levels
never           → pos queries inv_stock directly
```

**Payroll → Accounting (hr requires accounting):**
```
hr emits        → hr:payroll.run.approved@v1 { entries: [{employeeId, amount}] }
accounting subs → on payroll.approved → create salary disbursement journal entries
never           → hr writes to acct_journal_entries directly
```

**Analytics → All Modules (read-only, no emits to other modules):**
```
analytics subs  → all domain events from all modules (declared in manifest)
analytics reads → declared read-only views on other modules' schemas
never           → analytics writes to any other module's schema namespace
never           → analytics imports directly from any other module
```

---

## GENERATED APP LAYER D — Business Module Catalog
*Each module independently installable, activatable, deactivatable, deletable.*

### Module Independence Guarantee

Each generated business module:
- Owns its DB schema namespace exclusively (`acct_*`, `bill_*`, `inv_*`, etc.)
- Registers routes under its declared route namespace
- Subscribes only to declared events
- Never imports from another module's source directory
- Never queries another module's schema namespace directly
- Can be removed without touching any other module's code

### Built-In Module Catalog

| Module | Schema NS | Requires | Key Events Emitted | Key Events Consumed |
|---|---|---|---|---|
| **Accounting** | `acct_*` | — | `accounting:journal.entry.created@v1`, `accounting:period.closed@v1` | billing, procurement, hr events |
| **Billing** | `bill_*` | accounting | `billing:invoice.created@v1`, `billing:payment.received@v1` | `accounting:period.closed@v1` |
| **Inventory** | `inv_*` | — | `inventory:stock.adjusted@v1`, `inventory:reorder.triggered@v1` | `pos:sale.completed`, `procurement:goods.received` |
| **Procurement** | `proc_*` | accounting | `procurement:po.approved@v1`, `procurement:goods.received@v1` | — |
| **WMS** | `wms_*` | inventory | `wms:pick.completed@v1`, `wms:put-away.completed@v1` | `procurement:goods.received` |
| **POS** | `pos_*` | inventory | `pos:sale.completed@v1`, `pos:shift.closed@v1` | — |
| **HR** | `hr_*` | accounting | `hr:payroll.run.approved@v1`, `hr:employee.onboarded@v1` | — |
| **Analytics** | `anal_*` | — | — (read-only) | All modules' events |

---

## GENERATED APP LAYER E — Multi-Tenancy Layer
*Generated from the blueprint tenancy model. Baked into every layer.*

### E.1 Tenancy Models

**Row-Level Security (default for SaaS):** All tables have `tenant_id`; middleware injects it into every request; generated DB queries automatically filtered; RLS policies generated at DB level as a second enforcement point.

**Schema-Per-Tenant (compliance-heavy):** Each tenant gets their own DB schema; connection pool routes to correct schema per request.

**Silo (enterprise / maximum isolation):** Each tenant gets their own DB instance; per-tenant provisioning scripts generated.

### E.2 Workspace / Organization Model (if `workspace_aware: true`)
Generated `Organization` and `Workspace` entities with membership, roles, invitation flows. All business module data scoped to workspace.

### E.3 Tenant Context Propagation
```typescript
// src/tenancy/tenant-middleware.ts — generated
export const tenantMiddleware = async (req, res, next) => {
  const tenantId = resolveTenantId(req); // subdomain, header, or JWT
  if (!tenantId) return res.status(401).json({ error: 'Tenant not identified' });
  req.tenantContext = { tenantId };
  next();
};
```

---

## GENERATED APP LAYER G — App Knowledge & Documentation Layer ← NEW
*The living knowledge system for the generated app. Continuous, queryable, portable.*

This layer is scaffolded by the factory, runs inside the generated app, and stays fully active after factory detachment.

### G.1 Living Codebase Index

A continuous CI job that runs on every commit and keeps the semantic index current:

```yaml
# .github/workflows/update-knowledge.yml — generated and self-maintaining

name: Update Knowledge Index
on: [push]
jobs:
  update-knowledge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Detect changed files
        id: changes
        run: node knowledge/ci-pipeline/detect-changes.js
      - name: Update semantic index
        run: node knowledge/ci-pipeline/update-index.js --changed "${{ steps.changes.outputs.files }}"
      - name: Check for documentation drift
        run: node knowledge/ci-pipeline/check-drift.js
        # Warns (does not fail build) when code changes but related docs have not
      - name: Commit updated index
        run: |
          git config user.name "knowledge-bot"
          git add knowledge/semantic-index/
          git diff --staged --quiet || git commit -m "chore: update knowledge index"
```

### G.2 Module Knowledge Artifacts

Each generated module ships a machine-readable knowledge document in `knowledge/docs/developer/modules/`, updated by the CI pipeline when the module changes:

```json
// knowledge/docs/developer/modules/billing.knowledge.json

{
  "moduleName": "billing",
  "version": "1.0.0",
  "lastUpdated": "2025-03-07T10:00:00Z",
  "domainDescription": "Manages invoices, payment records, credit notes, and payment terms. Posts all financial transactions to the accounting ledger via domain events.",
  "entities": [
    {
      "name": "Invoice",
      "table": "bill_invoices",
      "fields": ["id", "customer_id", "amount", "currency", "status", "due_date"],
      "piiFields": ["customer_id"],
      "ownedBy": "billing"
    }
  ],
  "emittedEvents": [
    {
      "type": "billing:invoice.created@v1",
      "description": "Emitted when a new invoice is created. Consumed by accounting to create a journal entry.",
      "payloadShape": { "invoiceId": "string", "amount": "number", "currency": "string" }
    }
  ],
  "consumedEvents": [
    {
      "type": "accounting:period.closed@v1",
      "description": "When accounting closes a period, billing locks all invoices in that period.",
      "handlerDescription": "Sets all open invoices in the closed period to LOCKED status"
    }
  ],
  "invariants": [
    "An invoice cannot be voided after payment is received",
    "Invoice amounts must be positive",
    "Currency must be an ISO 4217 code"
  ],
  "extensionPoints": [
    {
      "location": "src/modules/billing/services/invoice.service.ts",
      "hook": "beforeInvoiceCreate",
      "description": "Called before an invoice is saved. Return modified DTO or throw to cancel."
    }
  ],
  "deactivationImpact": {
    "affectedModules": ["accounting"],
    "description": "Accounting will no longer receive invoice.created events. Journal entries for invoices will stop being created."
  }
}
```

### G.3 User & Admin Documentation

Generated from module knowledge artifacts and user workflow declarations in the blueprint. Auto-updated when modules change.

**End-User Feature Guides** (`knowledge/docs/user/features/`)
One guide per activated module: how to use it, not how to develop it. Step-by-step workflows generated from declared user workflows in the blueprint.

**Admin Configuration Guides** (`knowledge/docs/user/admin/`)
Module installation, activation, deactivation procedures. Tenant management and workspace setup. Integration configuration.

**Onboarding Flows** (`knowledge/docs/user/onboarding/`)
Guided first-use flows generated from declared user roles and workflows. Role-specific: "As an accountant, here is how to set up your chart of accounts." "As a warehouse manager, here is how to configure your bin locations."

### G.4 Drift Detection

```typescript
interface DriftReport {
  generatedAt: string;
  staleArtifacts: StalenessEntry[];
  // e.g. "billing.knowledge.json last updated 2 weeks ago
  //       but billing/services/invoice.service.ts changed yesterday"
}
```

When drift is detected: CI job emits a warning (does not fail the build), a PR comment is posted, and the factory operator dashboard surfaces the staleness metric.

### G.5 Knowledge Portability on Export

When `factory-detach.sh` runs, the knowledge system is already in the repo and continues operating independently. No factory connection required. The factory retains a read-only snapshot sufficient to answer "what did this generation run produce and why?" for future regeneration requests, even for fully detached apps.

---

## GENERATED APP LAYER F — Deployment & Portability Layer

### F.1 Export Package Contents

```
export-package/
├── docker/
├── helm/
├── compose/
│   ├── docker-compose.yml         ← local / homelab
│   └── docker-compose.prod.yml    ← production self-hosted
├── nginx/ and traefik/            ← reverse proxy configs
├── db/
│   ├── dump.sql
│   └── restore.sh
├── env/.env.template
├── ci/
│   ├── github-actions.yml
│   └── gitlab-ci.yml
├── knowledge/                     ← full knowledge system exports with app
│   ├── app-knowledge-graph.json
│   ├── semantic-index/
│   ├── knowledge-server/
│   └── ci-pipeline/
└── factory-detach.sh
```


---

## The Complete Enforcement Matrix

| Guarantee | Mechanism | Enforcement Point | Failure Mode |
|---|---|---|---|
| Core never imports modules | `dependency-cruiser` rule | Pre-commit + CI + factory test harness | Build blocked at all three |
| Modules never import each other | `dependency-cruiser` rule | Pre-commit + CI + factory test harness | Build blocked at all three |
| Modules only import `core-contracts` | Package boundary (`package.json`) | Physical package resolution | Import fails at resolution |
| `core-contracts` never imports `core-engine` | `dependency-cruiser` rule | Pre-commit + CI | Build blocked |
| Event schemas not owned by emitting module | All schemas in `core-contracts/events/` | Package structure | Module cannot find type |
| Modules only emit declared events | Scoped `EventBus.emit()` | API-level at runtime | Throws `UndeclaredEventError` |
| Modules only subscribe to declared events | Scoped `EventBus.on()` | API-level at runtime | Throws `UndeclaredEventError` |
| Event schema evolution is safe | Versioned event type strings + registry compat check | Registration time | Module rejected |
| Contract tests are required | Registry rejects modules without them | Registration time | Module rejected |
| Enforcement config cannot be silently broken | Factory test harness regression tests | CI on every factory update | Release blocked |
| Modules only write to declared namespace | Scoped `GeneratorAPI.fs` | API-level at runtime | Throws `NamespaceViolationError` |
| No cross-module DB access in generated code | Semantic validation layer | Post-generation gate | Merge blocked |
| Generated app modules don't cross schema namespaces | App-level semantic validation | Generated app CI | Warning + dev alert |
| Sequential → parallel switch is safe | `generate()` purity requirement + contract test | Contract test (CI) | Test fails if impure |
| Factory tenant isolation | Separate execution contexts per tenant | Factory meta-layer | Structural — not access control |
| **Modules produce knowledge artifacts** | **Registry rejects modules without `ModuleKnowledge`** | **Registration + contract test** | **Module rejected** |
| **Knowledge stays current post-generation** | **Codebase Intelligence Pipeline on every commit** | **Generated app CI** | **Staleness report surfaced** |
| **Knowledge exports with the app** | **Knowledge system physically in repo + export package** | **Structural — in the repo** | **Self-contained on export** |

Items in **bold** are the knowledge-specific guarantees added in v4.

---

## Summary: All Layers at a Glance

### Part A — App Factory Platform

| # | Layer | Core Responsibility | Failure Mode if Missing |
|---|---|---|---|
| F0 | Factory Meta-Layer | Governs factory, multi-tenant isolation | Factory cannot evolve or isolate tenants |
| F1 | Intent & IR | Shared read-only blueprint | Generators produce inconsistent outputs |
| F2 | Knowledge & Pattern Repository | Curated generation patterns | Low-quality or insecure generated code |
| F3 | Core Contracts Package | Physical enforcement boundary + versioned events + KnowledgeWriter | Fake modularity; no knowledge production |
| F4 | Plugin / Module Registry | Runtime contract enforcement + scoped API instantiation | Modules reach each other; no knowledge artifacts |
| F5 | Architecture Decision Engine | Structural decisions before code | Wrong stack, wrong DB, wrong boundaries |
| F6 | Pipeline Orchestrator + Scheduler | Sequential now, parallel-ready, hardware-aware | Cannot scale; manual infra changes to switch modes |
| F7 | Core Generator Modules | Produce code + knowledge artifacts in isolation | No app; or undocumented app |
| F8 | Semantic Validation | Cross-module consistency checking | Correct modules combine into broken app |
| F9 | Merge Coordinator | Assemble artifacts + knowledge graph | Namespace collisions; no unified knowledge |
| **F10** | **Knowledge & Documentation Layer** | **Living knowledge: generation-time + continuous post-generation** | **Docs drift; agents have no structured context; knowledge lost on export** |
| F11 | Extension & Customization Boundary | Post-generation developer contract | Developers fight the factory on every change |
| F12 | Runtime Feedback & Repair Loop | Learn from generated app failures | Recurring errors; no factory improvement |
| F13 | DX Layer | Developer workflow integration | Generated app is hard to work with |
| F14 | Cost & Resource Model | Cost visibility before commitment | Surprise bills at scale |

### Part B — Generated App Architecture

| # | Layer | Core Responsibility | Failure Mode if Missing |
|---|---|---|---|
| A | Generated App Core | Framework bootstrap | App does not boot |
| B | Generated App Module Registry | Runtime install / activate / deactivate / delete | Modules cannot be independently managed |
| C | Generated App Event Bus | Runtime inter-module communication | Modules import each other directly |
| D | Business Module Catalog | Domain features — independent by design | Core breaks when a module is removed |
| E | Multi-Tenancy Layer | Workspace / org isolation | Tenant data bleeds across organizations |
| **G** | **App Knowledge & Documentation Layer** | **Living codebase index, user docs, knowledge portability** | **Docs drift; no user guides; knowledge lost on export** |
| F | Deployment & Portability Layer | Export, migrate, run anywhere | Lock-in to factory infra; no homelab support |

---

*This architecture enforces its modularity guarantees structurally and treats knowledge as a first-class output alongside code. Documentation is never a post-process — it is generated by the same pipeline that produces the app, kept current by a continuous CI process, and portable enough to travel with the app when it leaves the factory. Violating the architectural rules requires a deliberate act that breaks the build.*
