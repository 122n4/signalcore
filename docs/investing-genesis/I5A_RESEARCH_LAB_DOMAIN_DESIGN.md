# Syntrake Investing Genesis I5-A — Research Lab Domain Design

Status: `WORKING DESIGN — NOT FROZEN`

Canonical parent SHA: `5de091fcfe1f595d781f6cbc4eaa49ed49341398` (`I4 = FROZEN`).

This document starts I5 design only. It does not authorize implementation, migration, merge, production deploy, production DDL/DML, broker execution, financial recommendation, or mutation of production financial truth.

---

## 1. Source-of-truth hierarchy

I5 must not confuse product input with constitutional authority.

The authority order for this design is:

1. **I0 Constitution and accepted I0-I4 canonical contracts** — architectural/security/financial law.
2. **I4 canonical freeze SHA `5de091fcfe1f595d781f6cbc4eaa49ed49341398`** — exact predecessor state.
3. **`SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md` supplied by the product owner** — source specification for the **Research Lab / I5 only**.
4. **This I5-A design** — derived working contract until independently audited and frozen.

The supplied Research Lab specification is **not** a source of truth for I6, I7, I8, I9, I10, I11, I12, or later product phases.

When an idea from that specification is not accepted into I5, this document classifies it only as `OUT_OF_I5 / PARKED`. Its eventual destination and contract are decided exclusively by the Constitution and the future canonical design of the relevant slice.

---

## 2. I5 purpose

I5 builds the canonical Investing Research Lab: a scientific system that converts a human financial research idea into structured, reproducible, executable and auditable research.

Canonical scientific flow:

```text
Authorized Research Scope
        |
        v
Investigation
        |
        v
Hypothesis Revision
        |
        v
Research Draft Revision
        |
        v
Research Spec Revision
        |
        v
Experiment
        |
        v
Dataset Snapshot
        |
        v
Canonical Run Input
        |
        v
Run
        |
        v
Result
        |
        v
Evidence
        |
        v
Explanation
        |
        v
Next Experiment
```

I5 is not:

- a recommendation engine;
- portfolio financial authority;
- market truth authority;
- a live execution engine;
- a paper execution engine;
- a broker dependency;
- a chatbot whose transcript is scientific truth;
- the final Research Lab dashboard.

The Research Lab must work with no broker and no real portfolio.

---

## 3. Non-negotiable I5 laws

I5 inherits every accepted I0-I4 rule. The following are specifically binding here.

### 3.1 LLM law

```text
LLMs INTERPRET.
DETERMINISTIC ENGINES CALCULATE.
```

LLMs may:

- interpret user intent;
- extract entities and financial concepts;
- classify ambiguity;
- propose definitions;
- generate a Research Draft candidate;
- compile a candidate semantic representation;
- translate a structured specification back into human language;
- explain structured engine results and evidence.

LLMs must never:

- invent prices or datasets;
- invent metrics or backtest outputs;
- invent validation state;
- manufacture evidence;
- declare a deterministic gate `PASS` without deterministic validation;
- mutate completed scientific results;
- bypass typed application/engine contracts.

### 3.2 Chat is not scientific authority

Conversation may help interpret references such as:

```text
"testa 15%"
"faz igual sem 2020"
"porquê?"
```

But reproduction of a completed result must never require conversation history.

Canonical scientific state lives only in typed, versioned, persisted domain objects and their evidence lineage.

### 3.3 Material change means new version/object

No completed/canonical scientific object is retrospectively rewritten.

Examples that require a new canonical revision or experiment:

- changed hypothesis;
- changed universe;
- changed benchmark;
- changed date range;
- changed rule/threshold;
- changed portfolio weight in a research experiment;
- changed costs/slippage;
- changed data/proxy methodology;
- changed material default.

### 3.4 Research never mutates other financial authorities

Research output must never automatically mutate:

- Plan/user intent;
- financial ledger;
- cash;
- lots;
- positions;
- accounting truth;
- broker/execution state.

Any future consumption of Research by later systems must occur through an explicit separately-authorized contract.

### 3.5 Failure is scientific memory

Negative outcomes are retained.

At minimum distinguish:

```text
TECHNICAL_FAILURE
DATA_FAILURE
INVALID_SPEC
USER_CANCELLED
SCIENTIFIC_FAILURE
VALIDATION_FAILURE
```

A scientifically poor result is not a technical failure and must not disappear.

---

## 4. Scope accepted into I5 now

The following capabilities from the Research Lab specification are accepted into I5 design.

### 4.1 Canonical Research Core

I5 includes:

- Investigation root/lifecycle;
- immutable Research Draft revisions;
- immutable Hypothesis revisions;
- immutable Research Spec revisions;
- Experiments and parent/variant lineage;
- Experiment Plans;
- Runs;
- Results;
- scientific event/audit history;
- versioning/CAS where active pointers exist;
- failure memory.

### 4.2 Human Interpretation

I5 includes:

- provider-independent interpretation abstraction;
- intent detection;
- entity extraction;
- financial-concept extraction;
- contextual reference resolution;
- ambiguity classification;
- correction loop;
- translate-back confirmation for materially complex specifications;
- permanent interpretation regression corpus.

### 4.3 Financial Ontology foundation

I5 includes a versioned ontology sufficient to support the Research Lab:

- canonical concept IDs;
- synonyms;
- asset/concept categories;
- metric definitions;
- operation compatibility;
- data requirements;
- proxy/instrument resolution semantics.

The ontology must not depend on a specific LLM provider.

### 4.4 Research Compiler and typed IR/DSL

I5 includes a deterministic compiler after semantic interpretation has been fixed.

The canonical machine representation is a **typed, versioned Research IR/AST**, not free-form text.

A human-readable textual DSL may exist as a deterministic serialization/view of that IR.

Initial primitive families may include:

```text
UNIVERSE
FILTER
RANK
TAKE
WEIGHT
ENTER
EXIT
REBALANCE
COMPARE
BENCHMARK
MEASURE
CONDITION_ON
GROUP
LAG
AGGREGATE
NORMALIZE
COST
SLIPPAGE
TEST
```

Any unsupported primitive fails closed.

### 4.5 Dataset Snapshot and Data Contract

I5 includes immutable Dataset Snapshots and series-level provenance.

No scientific Run may execute over unversioned/ad-hoc data.

I5 includes:

- dataset snapshot identity;
- series identity;
- source/vendor references;
- observation/retrieval/as-of times;
- native currency where applicable;
- frequency/timezone;
- adjustment methodology;
- dividend/corporate-action methodology;
- missing-data policy;
- FX methodology when used;
- quality report;
- snapshot/content hash;
- proxy lineage;
- point-in-time/survivorship warnings where applicable.

### 4.6 Minimal deterministic historical execution substrate

I5 must be able to execute enough historical research to prove its scientific pipeline end to end.

The initial deterministic adapter may support a constrained subset such as:

- buy-and-hold;
- deterministic weighted portfolios;
- deterministic rebalancing;
- cash leg;
- dividends where data/policy support them;
- explicit transaction costs;
- explicit simple slippage;
- benchmark series;
- deterministic periodic contributions where explicitly modelled;
- FX conversion where a versioned FX methodology and data snapshot exist;
- portfolio-value series;
- mechanical run diagnostics.

This is a **Research execution substrate**, not account execution and not a recommendation engine.

The capability must fail closed when the Research Spec requests an unsupported operation.

### 4.7 Minimal metric registry

I5 includes a centralized/versioned metric registry sufficient to prove and compare scientific Runs.

The initial floor may include mechanical metrics such as:

```text
TOTAL_RETURN
CAGR
MAX_DRAWDOWN
RECOVERY_TIME
TURNOVER
COSTS_PAID
BEST_PERIOD
WORST_PERIOD
```

Metric definitions must include methodology version and all material assumptions.

A metric name alone is never sufficient scientific authority.

Additional/advanced analytics are `OUT_OF_I5 / PARKED` unless independently accepted into this slice.

### 4.8 Job/worker reliability

I5 includes asynchronous compute workers for heavy Runs.

Canonical delivery assumption:

```text
AT_LEAST_ONCE EXECUTION
+
IDEMPOTENT SCIENTIFIC EFFECTS
```

I5 must not claim magical exactly-once infrastructure.

The job model must support:

- atomic claim;
- worker lease/heartbeat;
- retry generation;
- crash recovery;
- duplicate suppression;
- cancellation request;
- completion-vs-cancel race handling;
- observable progress;
- terminal-state integrity.

### 4.9 Experiment comparison

I5 includes deterministic comparison of Experiments and Results.

Comparison must report both:

1. configuration/parameter difference;
2. result/metric difference.

Explanation may interpret those structured differences but may not manufacture causality unsupported by evidence.

### 4.10 Basic Research Challenge / sensitivity

I5 includes basic **scientific sensitivity operations** because challenging a result is part of the Research Lab itself.

Initial challenge forms may include:

- alternate time windows;
- excluded periods;
- higher explicit costs;
- higher explicit slippage;
- bounded parameter perturbation;
- missing-data sensitivity where methodology permits.

These are research challenges, not account-specific portfolio decision methodology.

### 4.11 Reproducibility and Evidence foundation

I5 includes:

- canonical run-input hash;
- result hash;
- evidence links;
- engine version;
- metric implementation version;
- dataset snapshot hash;
- Research Spec revision identity;
- Experiment identity;
- warnings/quality state;
- exact replay/reproducibility check where mathematically expected.

A completed scientific claim must be traceable to structured evidence.

### 4.12 Explanation layer

I5 includes explanations grounded exclusively in structured objects:

- Result;
- Comparison;
- warnings;
- quality state;
- evidence;
- explicit methodology.

Suggested presentation levels may include:

```text
SIMPLE
NORMAL
ADVANCED
AUDIT
```

Presentation level changes wording, never scientific truth.

### 4.13 Research Debt counters / future-verification hooks

I5 may persist low-level facts needed for later validation, including:

- experiment count;
- hypothesis revisions;
- parameter modifications;
- repeated tests;
- validation reuse markers;
- optimizer-run references if a future system supplies them.

I5 does **not** need to define a final Research Debt scoring methodology.

### 4.14 Model/prompt traceability

Interpretation evidence records, when applicable:

```text
model_provider
model_id
model_version
prompt_version
ontology_version
compiler_version
policy_version
```

Research Spec and scientific Result must remain provider-independent.

---

## 5. OUT_OF_I5 / PARKED

The following items from the Research Lab source specification are not part of the initial I5 canonical contract unless a later I5 design revision independently proves they belong here.

They are **not assigned by this document to any future slice**. Their eventual ownership comes only from the Constitution and the future canonical design of that slice.

```text
BROKER_DEMO execution
SYNTRAKE_PAPER execution
live broker execution
account order/fill lifecycle
recommendation generation
account-specific suitability decisions
allocation decision methodology
Monte Carlo engines
full scenario-analysis engines
full portfolio stress-testing engines
final advanced validation campaigns
final Blind Truth methodology
final walk-forward validation methodology
final OOS governance
final Research Debt score/methodology
final product dashboard / Mesa de Fabrico UI
Proof Certificate product UI
SYNTRAKE Passport product UI
AI Jury / Belief Graph / Strategy Autopsy product systems
```

I5 may define extension points/evidence fields that avoid blocking those future capabilities, but must not claim or partially implement them under misleading names.

---

## 6. Authority and ownership model

The original product specification's `userId`, `organizationId` and free-form `requestedBy` examples are **not canonical authority shapes**.

I5 preserves the I0 authority model.

### 6.1 Actor kinds

```text
USER_PRINCIPAL
SYSTEM_ACTOR
```

### 6.2 Operation scopes

```text
ACCOUNT_SCOPE
TENANT_SCOPE
DOMAIN_SCOPE
```

### 6.3 Source contexts

```text
PURE_RESEARCH
TEST_PORTFOLIO
USER_PORTFOLIO
```

Source context is not authorization.

Recommended semantics:

- `PURE_RESEARCH`: normally tenant-owned research; no fabricated account ID;
- `TEST_PORTFOLIO`: tenant-owned virtual research capital; no fabricated financial account;
- `USER_PORTFOLIO`: account-scoped; account ownership resolved server-side before the research context snapshot is created;
- genuine shared/system research: explicit domain scope only after a canonical system-actor policy exists.

### 6.4 Boundary rule

No client may submit or reconstruct `AuthorizedInvestingContext`.

No client-provided `userId`, `tenantId`, `accountId`, organization ID or `requestedBy` string proves ownership.

Application services resolve authority server-side and then pass the verified scope into the Research domain.

`service_role` remains capability, never authorization.

---

## 7. Truth taxonomy versus research environment

I5 must not collapse truth origin and research environment into one enum.

Financial values preserve the I0 dimensions:

```text
VALUE_ORIGIN = REAL | ESTIMATED | SIMULATED | UNAVAILABLE
FRESHNESS    = FRESH | STALE | UNKNOWN | NOT_APPLICABLE
CONTEXT      = PRODUCTION | DEMO
```

Research adds a separate execution dimension:

```text
RESEARCH_ENVIRONMENT = HISTORICAL_BACKTEST | SIMULATION
```

Example:

```text
historical vendor price:
  VALUE_ORIGIN = REAL
  FRESHNESS = NOT_APPLICABLE or explicit historical freshness policy
  CONTEXT = PRODUCTION or DEMO according to dataset context

strategy path generated from those prices:
  VALUE_ORIGIN = SIMULATED
  RESEARCH_ENVIRONMENT = HISTORICAL_BACKTEST
```

Research capital is never real account capital merely because the source data is REAL.

---

## 8. Canonical domain model — working proposal

### 8.1 InvestigationRoot

Long-lived research ownership/lifecycle root.

```ts
interface InvestigationRoot {
  investigationId: string;

  operationScope: "ACCOUNT_SCOPE" | "TENANT_SCOPE" | "DOMAIN_SCOPE";
  tenantId?: string;
  accountId?: string;

  createdByActorKind: "USER_PRINCIPAL" | "SYSTEM_ACTOR";
  createdByActorId: string;

  sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";

  status: "DRAFT" | "ACTIVE" | "BLOCKED" | "COMPLETED" | "ARCHIVED";
  currentStage: "IDEA" | "BUILD" | "TEST" | "CHALLENGE" | "VERIFY";

  activeResearchDraftRevisionId?: string;
  activeHypothesisRevisionId?: string;
  activeResearchSpecRevisionId?: string;
  activeExperimentId?: string;
  activePointerVersion: number;

  createdAt: string;
  archivedAt?: string;
}
```

Scope-dependent IDs are absent when not semantically required.

Persisted tenant/account identifiers are server-resolved canonical ownership, not authority supplied by the caller.

### 8.2 ResearchDraftRoot / ResearchDraftRevision

Conversational working state is represented through immutable revisions rather than an overwrite-only mutable row.

```ts
interface ResearchDraftRevision {
  researchDraftRevisionId: string;
  researchDraftRootId: string;
  investigationId: string;
  revision: number;
  predecessorRevisionId?: string;

  rawIntent: string;
  interpretedGoal?: string;
  entities: ExtractedEntity[];
  concepts: FinancialConceptRef[];
  constraints: ResearchConstraint[];
  ambiguities: ResearchAmbiguity[];
  proposedDefinitions: ProposedDefinition[];
  unresolvedQuestions: string[];

  interpretationEvidenceId?: string;
  createdAt: string;
}
```

A correction creates a new revision and preserves the rest of the prior semantic state unless explicitly changed.

### 8.3 HypothesisRoot / HypothesisRevision

```ts
interface HypothesisRevision {
  hypothesisRevisionId: string;
  hypothesisRootId: string;
  investigationId: string;
  revision: number;
  predecessorRevisionId?: string;

  statement: string;
  nullHypothesis?: string;
  rationale?: string;
  falsifiable: boolean;
  measurable: boolean;

  createdAt: string;
}
```

A materially non-testable hypothesis remains blocked until an observable definition/proxy is explicitly accepted.

### 8.4 ResearchSpecRoot / ResearchSpecRevision

This is the central executable scientific contract.

```ts
interface ResearchSpecRevision {
  researchSpecRevisionId: string;
  researchSpecRootId: string;
  investigationId: string;
  revision: number;
  predecessorRevisionId?: string;

  objective: ResearchObjective;
  universe: UniverseSpec;
  selectionRules: RuleSpec[];
  entryRules: RuleSpec[];
  exitRules: RuleSpec[];
  weightingRule?: WeightingSpec;
  rebalanceRule?: RebalanceSpec;
  benchmark?: BenchmarkSpec;
  horizon: HorizonSpec;
  startDate?: string;
  endDate?: string;
  frequency: DataFrequency;
  metricRequests: MetricSpec[];
  costs: CostModelSpec;
  slippage?: SlippageModelSpec;
  valuationCurrency: string;
  dataRequirements: DataRequirement[];
  validationRequirements: ValidationRequirement[];
  assumptions: AssumptionSpec[];
  explicitDefaults: ExplicitDefault[];
  successCriteria: CriterionSpec[];
  failureCriteria: CriterionSpec[];

  sourceDraftRevisionId: string;
  compilerVersion: string;
  ontologyVersion: string;
  policyVersion: string;
  irVersion: string;
  canonicalContentHash: string;

  createdAt: string;
}
```

Invariants:

- immutable after canonicalization;
- material changes create a new revision;
- no material hidden defaults;
- exact canonical serialization rules must exist before hashing;
- an executable Run points to exactly one Research Spec Revision.

### 8.5 Experiment

```ts
interface Experiment {
  experimentId: string;
  investigationId: string;
  parentExperimentId?: string;
  researchSpecRevisionId: string;

  label: string;
  relation: "BASELINE" | "VARIANT" | "SENSITIVITY" | "VALIDATION";
  reasonForChange?: string;

  parameterSet: CanonicalExperimentParameterSet;
  parameterSetSchemaVersion: string;
  parameterSetHash: string;

  createdAt: string;
}
```

Canonical parameters must never remain an unconstrained `Record<string, unknown>`.

### 8.6 ExperimentPlan

```ts
interface ExperimentPlan {
  experimentPlanId: string;
  investigationId: string;
  researchSpecRevisionId: string;
  version: number;

  experimentIds: string[];
  comparisonGroups: string[][];
  requiredDataRequirements: DataRequirement[];
  computeBudget?: ComputeBudget;

  canonicalContentHash: string;
  createdAt: string;
}
```

### 8.7 DatasetSnapshot

A Dataset Snapshot is immutable scientific input, not market-data authority by mere existence.

```ts
interface DatasetSnapshot {
  datasetSnapshotId: string;
  series: DatasetSeriesRef[];
  startDate: string;
  endDate: string;
  frequency: DataFrequency;

  adjustmentPolicyVersion: string;
  dividendPolicyVersion: string;
  corporateActionPolicyVersion: string;
  missingDataPolicyVersion: string;
  fxMethodVersion?: string;

  qualityReportId: string;
  qualityState: "PASS" | "PASS_WITH_WARNINGS" | "DEGRADED" | "FAIL";

  snapshotHash: string;
  createdAt: string;
}
```

Each `DatasetSeriesRef` must be able to preserve, when applicable:

```text
canonical series identity
instrument/concept identity
source
source reference
vendor
vendor/source version
native currency
frequency
timezone
observed_at
retrieved_at
as_of
adjustment methodology
point-in-time methodology
coverage
content hash
lineage id
proxy chain
truth dimensions
```

A `FAIL` dataset cannot produce a scientifically valid completed Result.

### 8.8 Run

```ts
interface Run {
  runId: string;
  experimentId: string;
  researchSpecRevisionId: string;
  datasetSnapshotId: string;

  runType: "HISTORICAL_BACKTEST" | "SIMULATION" | "SENSITIVITY" | "REPRODUCIBILITY_CHECK";
  status:
    | "QUEUED"
    | "RUNNING"
    | "VALIDATING"
    | "COMPLETED"
    | "FAILED"
    | "CANCEL_REQUESTED"
    | "CANCELLED";

  engineVersion: string;
  metricRegistryVersion: string;
  policyVersion: string;
  executionConfigVersion: string;

  deterministicSeed?: string;
  canonicalRunInputHash: string;

  startedAt?: string;
  completedAt?: string;
  terminalErrorCode?: string;
  terminalErrorMetadata?: Record<string, unknown>;

  createdAt: string;
}
```

If an algorithm uses randomness, a deterministic seed is mandatory scientific input.

A completed/terminal Run cannot be rewritten into a different historical outcome.

### 8.9 Result

```ts
interface Result {
  resultId: string;
  runId: string;

  metrics: MetricValue[];
  timeseriesRef?: EvidenceObjectRef;
  tradesRef?: EvidenceObjectRef;
  cashflowsRef?: EvidenceObjectRef;
  distributionsRef?: EvidenceObjectRef;

  warnings: ResultWarning[];
  qualityState: "OK" | "PARTIAL" | "DEGRADED" | "INVALID";

  resultHash: string;
  createdAt: string;
}
```

Every metric value binds its metric implementation/methodology version.

### 8.10 Scientific Evidence

Evidence must allow a material statement such as:

```text
"Maximum drawdown = X"
```

to resolve mechanically to:

```text
Result
 -> Metric Value
 -> metric methodology/version
 -> Run
 -> canonical Run input hash
 -> Experiment
 -> Research Spec Revision
 -> Dataset Snapshot
 -> source/proxy lineage
```

No explanation string itself is scientific authority.

---

## 9. Active-pointer concurrency law

I5 reuses the concurrency principle proven in I4 wherever an active scientific pointer exists.

A material active-pointer update must carry:

```text
expected predecessor ID
expected active pointer version
idempotency key
material request hash
```

Required behavior:

- compare-and-swap;
- stale writer loses with `CONFLICT`;
- same idempotency key + same material request gives exact historical replay;
- same key + changed material request gives `CONFLICT`;
- different idempotency key never becomes replay of another writer merely because content is equal;
- no partial revision/pointer mutation;
- conflict evidence is durable.

This applies independently to each root whose active revision can be changed.

---

## 10. Human Interpretation contract

### 10.1 Provider abstraction

```ts
interface InterpretationProvider {
  interpret(input: InterpretationInput): Promise<InterpretationResult>;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
  explain(input: ExplanationInput): Promise<ExplanationResult>;
}
```

No provider-specific object becomes canonical Research Spec state.

### 10.2 Ambiguity

```text
NON_MATERIAL
MATERIAL
BLOCKING
```

Material ambiguity may not be silently resolved into an executable Research Spec.

The system may propose an interpretation, but the resolution must become structured evidence.

### 10.3 Context resolution

Multi-turn references may resolve against canonical active objects plus conversation context.

Example:

```text
active experiment: gold_weight = 10%
user: "agora testa 15%"
```

may become a typed `MODIFY_EXPERIMENT` action targeting `gold_weight = 0.15` without unnecessary re-questioning.

Conversation helps resolve the command; the resulting structured action and new Experiment become canonical.

### 10.4 Unsupported ideas

Non-measurable ideas such as:

```text
"testa CEOs carismáticos"
```

must produce a blocked ambiguity/non-testable state until an observable definition or proxy is explicitly accepted.

No hidden charisma score may be invented.

---

## 11. Typed application actions

Free-form text is never executed directly.

Example internal action shape:

```ts
interface RunExperimentCommand {
  type: "RUN_EXPERIMENT";
  investigationId: string;
  experimentId: string;
  researchSpecRevisionId: string;
  researchEnvironment: "HISTORICAL_BACKTEST" | "SIMULATION";
  idempotencyKey: string;
  correlationId: string;
}
```

This command deliberately contains no `requestedBy` authority string.

Authority is resolved by the server application boundary before execution.

Other typed commands may include:

```text
CREATE_INVESTIGATION
CREATE_DRAFT_REVISION
CREATE_HYPOTHESIS_REVISION
CANONICALIZE_RESEARCH_SPEC
CREATE_EXPERIMENT
MODIFY_EXPERIMENT
COMPARE_EXPERIMENTS
CREATE_SENSITIVITY_CHALLENGE
CANCEL_RUN
REQUEST_EXPLANATION
REQUEST_EVIDENCE
ARCHIVE_INVESTIGATION
```

---

## 12. Job/worker state and concurrency

Recommended canonical separation:

```text
Run = scientific execution identity/state
ResearchJob = scheduling/claim state
WorkerAttempt = physical execution attempt
```

A worker crash must not create a second scientific result.

Possible state flow:

```text
QUEUED
  |
  +-- atomic claim --> RUNNING + lease
                         |
                         +-- heartbeat
                         |
                         +-- VALIDATING --> COMPLETED
                         |
                         +-- failure --> retryable job/attempt or terminal FAILED

lease expiry --> reclaim according to retry policy

cancel request --> CANCEL_REQUESTED
                   |
                   +-- CAS against completion --> CANCELLED or COMPLETED
```

The exact persistence design is deferred to I5-B.

---

## 13. Data-quality minimum

The initial I5 data-quality contract must at least be able to detect/classify:

- missing rows;
- duplicate timestamps;
- non-monotonic timestamps;
- impossible/non-finite prices;
- inconsistent frequency;
- timezone inconsistency;
- stale/missing FX when FX is required;
- missing corporate-action evidence where the methodology requires it;
- survivorship risk where applicable;
- point-in-time integrity risk where applicable.

A warning is not silently converted to `PASS`.

`FAIL` blocks a scientifically valid completed Result.

---

## 14. Instrument and proxy resolution

Resolution state:

```text
EXACT
PROXY_ACCEPTED
PROXY_REQUIRES_CONFIRMATION
UNAVAILABLE
```

Rules:

- an ETF must not be backfilled before inception as if it existed;
- an index is not automatically a tradable instrument;
- a historical proxy requires explicit versioned methodology;
- the full proxy chain is evidence;
- material proxy choice requires explicit acceptance when policy says it changes the hypothesis materially.

---

## 15. Research reproducibility contract

Every completed valid Result must identify or bind into the canonical Run input hash:

- Research Spec Revision;
- Experiment canonical parameter set/hash;
- Dataset Snapshot/hash;
- engine version;
- metric registry/implementations;
- cost model/version;
- slippage model/version;
- execution configuration/version;
- valuation/FX methodology;
- deterministic seed if applicable;
- policy versions;
- relevant environment/configuration that can change deterministic output.

Canonical hashing requires an explicitly specified serialization algorithm. Object insertion order or provider-specific JSON formatting must never define scientific identity accidentally.

The exact hash algorithm/canonical serialization format is an I5-A freeze requirement.

---

## 16. Scientific event/audit families

Initial append-only event families may include:

```text
InvestigationCreated
InvestigationArchived
ResearchDraftRevisionCreated
IntentInterpreted
AmbiguityDetected
AmbiguityResolved
UserCorrectionReceived
HypothesisRevisionCreated
ResearchSpecCandidateGenerated
ResearchSpecCanonicalized
ResearchSpecRevisionActivated
ExperimentCreated
RunQueued
RunClaimed
RunStarted
RunValidationStarted
RunCompleted
RunFailed
RunCancellationRequested
RunCancelled
ComparisonCreated
SensitivityChallengeCreated
ReproducibilityCheckStarted
ReproducibilityCheckCompleted
```

This event/audit history is **not** the financial ledger.

Events must preserve actor/scope/correlation lineage according to I0 rules and must not contain secrets or tokens.

---

## 17. Error model

Initial typed machine errors:

```text
UNAUTHENTICATED
FORBIDDEN_OR_NOT_FOUND
ENTITLEMENT_REQUIRED
INVALID_RESEARCH_SPEC
AMBIGUITY_BLOCKING
UNSUPPORTED_RULE
UNSUPPORTED_METRIC
DATA_UNAVAILABLE
DATA_QUALITY_FAILED
PROXY_CONFIRMATION_REQUIRED
RUN_CONFLICT
RUN_CANCELLED
SIMULATION_FAILED
REPRODUCIBILITY_FAILED
CONFLICT
VALIDATION_ERROR
INTERNAL_ERROR
```

Errors should carry:

- machine code;
- safe human explanation;
- structured remediation options where applicable;
- correlation/audit metadata.

A failure must never be converted into an empty successful scientific result.

---

## 18. Security minimum

I5 security tests/design must cover:

- cross-tenant Investigation ID substitution;
- cross-account snapshot attempts;
- cross-user/principal context confusion;
- client-supplied authority objects;
- `service_role` used as supposed authorization;
- unauthorized Run request;
- unauthorized Result/Evidence read;
- prompt injection through external text/data treated as instructions;
- malformed structured actions;
- environment confusion;
- duplicate/idempotency abuse;
- stale-writer races.

External content is data, never authority or policy instruction.

---

## 19. Interpretation regression corpus

I5 includes a permanent regression corpus with at least:

### Beginner

```text
"não percebo nada disto"
"quero ganhar algum todos os meses"
"não sei ajuda me"
```

### Informal/contextual

```text
"mete aquilo nos 15"
"faz como antes mas sem 2020"
"agora compara com bonds"
"porquê?"
"o que mudou?"
```

### Advanced

```text
"long-only dividend growers 10y, equal weight, annual rebalance, 50bps costs"
```

### Ambiguous

```text
"quero ações baratas"
"quero rendimento"
"quero menos risco"
```

A provider/model version change must run this corpus. Pass criteria must be structural/semantic, not string-exact prose matching unless the tested surface is deliberately canonical text.

---

## 20. I5-A decisions still open before freeze

This working design is intentionally not frozen. At least the following must be resolved and independently audited before I5-A acceptance:

1. exact canonical root/revision table/object boundaries;
2. whether Investigation's active pointers are one CAS aggregate or separate pointer authorities;
3. exact Research Spec canonical serialization format;
4. exact hash algorithms and versioning;
5. exact typed Research IR/AST v1;
6. exact canonical parameter representation for Experiments;
7. exact minimal metric set and methodology definitions;
8. exact DatasetSeriesRef evidence envelope;
9. exact USER_PORTFOLIO research-context snapshot contract without duplicating financial authority;
10. exact tenant/account/domain operation matrix;
11. exact system-actor policy boundary for research workers;
12. exact idempotency scope/key uniqueness rules;
13. exact event/audit schema versus scientific event state;
14. exact worker lease/retry/cancellation state machine;
15. exact Result artifact storage/reference contract for timeseries/trades/cashflows;
16. exact boundary between `DEGRADED` data/result states and a valid scientific claim;
17. exact policy for material vs non-material ambiguity;
18. exact minimum deterministic backtest feature set required for I5 completion;
19. exact definition of `scientific failure` versus a completed valid Result that disproves a hypothesis;
20. exact retention/archive/delete policy.

No schema or runtime implementation should begin until these material design questions are resolved or explicitly split into a later I5 design sub-slice.

---

## 21. Proposed internal I5 build slices — working only

These labels are I5-internal working decomposition and are **not frozen roadmap authority**.

```text
I5-A  Research domain / authority / reproducibility design
I5-B  Persistence + RLS + immutable revision/event model
I5-C  Dataset Snapshot + provenance + quality contract
I5-D  Run/job/worker + reproducibility runtime
I5-E  Minimal deterministic historical execution adapter
I5-F  Interpretation + ontology + compiler + typed IR
I5-G  Comparison + scientific sensitivity + evidence
I5-H  Full I5 PostgreSQL/runtime/security/replay rehearsal + master freeze
```

This decomposition may change during I5-A design without changing the product owner's Research Lab source specification.

---

## 22. I5 Definition of Done — design target

The I5 Research Lab core is ready for its later product/UI phase only when, without relying on chat as scientific state:

1. an authorized user can express a research idea;
2. the system produces a versioned Research Draft;
3. material ambiguity is identified and resolved explicitly;
4. corrections create preserved semantic lineage;
5. a canonical immutable Research Spec Revision is created;
6. the Research Spec compiles to typed executable IR;
7. required data resolves to an immutable Dataset Snapshot with provenance/quality;
8. a worker executes an authorized deterministic historical Run;
9. a Result and its evidence are persisted immutably;
10. changing a material research parameter creates a new revision/Experiment;
11. Experiments/Results can be compared mechanically;
12. the user can request an explanation grounded only in structured Result/Evidence;
13. failed and negative scientific history remains reconstructable;
14. the system requires no broker;
15. test/simulation capital is never confused with real capital;
16. duplicate requests cannot create duplicate scientific effects;
17. exact deterministic replay can be verified where mathematically expected;
18. cross-tenant/cross-account access fails closed;
19. interpretation regression tests exist;
20. deterministic/concurrency/security tests pass;
21. every material scientific claim can be traced to its canonical inputs and methodology.

Final Research Lab dashboard design remains downstream of this core.

---

## 23. Current design verdict

```text
I4 CANONICAL PARENT
  5de091fcfe1f595d781f6cbc4eaa49ed49341398

I5 PRODUCT SOURCE SPEC
  RESEARCH LAB ONLY
  NOT AUTHORITY FOR OTHER I-S

I5-A
  WORKING DESIGN
  NOT FROZEN
  NO IMPLEMENTATION AUTHORIZED BY THIS DOCUMENT

PRODUCTION
  UNCHANGED
```
