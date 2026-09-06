# Syntrake Investing Genesis I5-A — Design Audit and Amendments V1

Status: `WORKING AUDIT / AMENDMENT — NOT FROZEN`

Canonical parent: `5de091fcfe1f595d781f6cbc4eaa49ed49341398` (`I4 = FROZEN`).

Audited working artifacts:

- `I5A_RESEARCH_LAB_DOMAIN_DESIGN.md`;
- `I5A_RESEARCH_LAB_DESIGN_DECISIONS_V1.md`;
- product source `SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md` (Research Lab / I5 only);
- controlling I0/I1/I4 canonical contracts.

This document is a working amendment. Where it explicitly changes a candidate decision below, this amendment supersedes that candidate decision until the design is consolidated and frozen.

---

## 1. Audit verdict

No contradiction was found that requires abandoning the I5 architecture.

The working design is structurally aligned with the Research Lab source specification and the Genesis authority/financial laws, but the audit found:

1. two terminology/semantic drifts that should be corrected before freeze;
2. three Research-Lab capabilities from the source specification that were under-specified in the first draft and belong in I5 now;
3. several exact-contract artifacts still required before I5-A can be frozen.

No runtime/schema implementation is authorized by this audit.

---

# AMENDMENT A — Preserve `SCIENTIFIC_FAILURE` as source terminology

## Finding

Decision 19 correctly separated a valid hypothesis-disproving result from a technical Run failure, but it renamed the source-spec concept too aggressively to `DOES_NOT_SUPPORT_HYPOTHESIS`.

The product source explicitly requires failure memory including `SCIENTIFIC_FAILURE`.

## Amended decision

`SCIENTIFIC_FAILURE` remains a canonical Research-Lab scientific-evaluation outcome, **not** a technical Run execution failure.

Candidate evaluation contract:

```text
SCIENTIFIC_EVALUATION_OUTCOME =
  SUPPORTS_HYPOTHESIS
  SCIENTIFIC_FAILURE
  INCONCLUSIVE
  NOT_EVALUATED
```

Semantics:

- `SUPPORTS_HYPOTHESIS`: valid Result satisfies explicit success/evidence criteria under the declared methodology;
- `SCIENTIFIC_FAILURE`: valid Result fails the explicit hypothesis/success criteria; this is a scientifically useful completed outcome and must remain stored;
- `INCONCLUSIVE`: valid Result exists but evidence/criteria do not justify either support or scientific failure;
- `NOT_EVALUATED`: Run/Result exists but no hypothesis evaluation was requested or validly performed.

Technical/data/spec/cancellation failures remain separate:

```text
TECHNICAL_FAILURE
DATA_FAILURE
INVALID_SPEC
USER_CANCELLED
VALIDATION_FAILURE
```

A `SCIENTIFIC_FAILURE` therefore does **not** set a successfully executed Run to technical `FAILED`.

---

# AMENDMENT B — Preserve the source `Result.qualityState`

## Finding

Decision 16 proposed replacing the source-spec result quality vocabulary with:

```text
VALID
VALID_WITH_WARNINGS
PARTIAL
INVALID
```

That replacement is unnecessary and weakens source traceability.

## Amended decision

Preserve the product source contract:

```text
RESULT_QUALITY_STATE =
  OK
  PARTIAL
  DEGRADED
  INVALID
```

Interpretation:

### `OK`

All outputs required for the claims represented by the Result are valid under the accepted ResearchSpec, DatasetSnapshot quality contract and engine methodology. Non-material informational warnings may exist only if policy explicitly allows them and they do not make the quality state misleading.

### `DEGRADED`

A technically completed Result exists, but one or more explicit degradation classes affect scientific confidence/coverage. It may support only claims explicitly allowed by the ResearchSpec/policy for that degradation class. The degradation and evidence are mandatory in explanations/comparisons.

### `PARTIAL`

The Run produced a valid subset of requested outputs, while other requested outputs are `UNAVAILABLE` or failed independently. Missing outputs cannot be treated as zero and claims requiring them are blocked.

### `INVALID`

The Result cannot support scientific claims.

Dataset quality remains a separate dimension:

```text
PASS
PASS_WITH_WARNINGS
DEGRADED
FAIL
```

Rules:

- Dataset `FAIL` cannot yield Result `OK`;
- Dataset `DEGRADED` can yield Result `DEGRADED` only when the exact degradation is policy-permitted and fully evidenced;
- Result `PARTIAL` never invents missing metrics/artifacts;
- Result `INVALID` is retained as failure evidence but is not scientific claim authority;
- warnings/degradation are never silently promoted to clean `OK`.

---

# AMENDMENT C — Template Engine belongs in I5 now

## Finding

The source specification defines versioned research templates as Research-Lab starting points. This belongs to I5 and was under-specified in the first draft.

## Accepted I5 capability

I5 includes a **versioned Template Engine**.

Templates are non-authoritative starting specifications that compile into the same canonical ResearchDraft/ResearchSpec pipeline as human-entered ideas.

Candidate contract:

```ts
interface ResearchTemplateVersion {
  templateId: string;
  templateVersion: number;
  title: string;
  methodologyId: string;
  methodologyVersion: string;
  allowedUniverseConstraints: string[];
  canonicalDefaultParameters: CanonicalExperimentParameterSetV1;
  assumptions: AssumptionSpec[];
  explanation: string;
  provenance: EvidenceRef[];
  compilerCompatibility: string[];
  ontologyCompatibility: string[];
  status: "ACTIVE" | "RETIRED";
  canonicalContentHash: string;
  createdAt: string;
}
```

Rules:

- templates never become hidden LLM inventions;
- template defaults are explicit/versioned;
- using a template records exact template ID/version in interpretation/spec lineage;
- material user changes become explicit ResearchSpec/Experiment changes;
- retiring a template does not invalidate historical Runs that used its old version;
- a template is not a recommendation and cannot claim suitability/profitability.

---

# AMENDMENT D — Conversation State belongs in I5, but is non-canonical

## Finding

The source specification explicitly requires context-aware conversational commands and a minimum conversation-state model. The first draft described the principle but not the state contract.

## Accepted I5 capability

I5 includes a mutable **ResearchConversationState** used only for interpretation ergonomics.

Candidate state:

```ts
interface ResearchConversationState {
  conversationId: string;
  actorSessionRef?: string;
  activeInvestigationId?: string;
  activeResearchDraftRevisionId?: string;
  activeResearchSpecRevisionId?: string;
  activeExperimentId?: string;
  activeStage?: "IDEA" | "BUILD" | "TEST" | "CHALLENGE" | "VERIFY";
  selectedObjectIds: string[];
  pendingAmbiguityId?: string;
  pendingConfirmationId?: string;
  lastStructuredActionType?: string;
  updatedAt: string;
}
```

Authority rules:

- no `userId`, tenant/account or ownership value in conversation state proves access;
- active IDs are selectors only and must be re-authorized/resolved against canonical Research ownership before use;
- conversation state can be lost without destroying scientific reproducibility;
- completed Result reproduction never depends on this state;
- conversation state is not included in canonical Run input hash unless a material interpretation choice is first promoted into a canonical Research object;
- raw chat transcript is not scientific authority.

This enables commands such as:

```text
"testa 15%"
"faz igual sem 2020"
"compara com o anterior"
"porquê?"
```

while keeping the resulting typed action and versioned scientific object as the durable truth.

---

# AMENDMENT E — Research-Lab Observability belongs in I5

## Finding

The source specification defines observability that measures Research-Lab quality and operational reliability. This belongs in I5 and is not product dashboard scope.

## Accepted I5 capability

I5 includes operational/scientific observability for the Research Lab itself.

Initial metrics/events may include:

```text
research_draft_created_count
research_spec_candidate_count
research_spec_canonicalized_count
research_spec_acceptance_rate
interpretation_correction_rate
ambiguity_rate
blocking_ambiguity_rate
time_to_first_canonical_spec
time_to_first_run
run_failure_rate
dataset_failure_rate
job_queue_latency
job_execution_latency
job_retry_rate
worker_lease_expiry_rate
cancellation_success_rate
comparison_usage_rate
challenge_usage_rate
reproducibility_failure_rate
```

Critical product-quality metric retained from the source specification:

```text
How often does the user have to correct Syntrake's interpretation?
```

Canonical machine metric candidate:

```text
interpretation_correction_rate
```

Observability rules:

- operational metrics are not financial results;
- they must not include secrets/tokens;
- tenant/account identifiers are minimized and scoped;
- missing telemetry is `UNAVAILABLE`, not zero;
- observability must not become an alternative scientific event ledger;
- scientific reproducibility cannot depend on ephemeral metrics telemetry.

---

# 2. Source-spec coverage audit after amendments

The following source-spec areas are now explicitly represented in the working I5 design:

```text
Purpose / Mesa de Fabrico scientific core
LLM interprets; engine calculates
chat != source of truth
versioning / immutability
broker-free research
simulation/backtest separation
failure memory
Investigation
ResearchDraft
Hypothesis
ResearchSpec
Experiment
ExperimentPlan
Run
Result
human interpretation
intent/entities/concepts/context
ambiguity/correction loop
ontology
compiler
Research IR / DSL
translate-back
beginner/advanced same core
PURE_RESEARCH / TEST_PORTFOLIO / USER_PORTFOLIO
templates
instrument/proxy resolution
DatasetSnapshot
data quality
minimal simulation/backtest substrate
metric registry
jobs/workers
experiment comparison
basic challenge/sensitivity
verification hooks foundation
Research Debt low-level facts
failure memory
evidence foundation
explanation layer
conversational commands
structured actions
conversation state
scientific memory vs conversation memory
model/prompt versioning
model independence
unsupported/non-testable ideas
data unavailable fail-closed behavior
typed error model
event ledger / audit separation
security
observability
interpretation regression corpus
test/replay/security/concurrency intent
```

The following remain deliberately `OUT_OF_I5 / PARKED` or only extension hooks, with no assignment to future slices by this document:

```text
BROKER_DEMO execution
SYNTRAKE_PAPER execution
live broker execution
account order/fill lifecycle
recommendation generation
account suitability/decision output
full allocation decision methodology
Monte Carlo engine
full scenario-analysis engine
full portfolio stress-testing engine
final Blind Truth methodology
final OOS governance
final walk-forward governance
final advanced validation campaign
final Research Debt scoring methodology
final product dashboard/UI systems
```

---

# 3. Additional design requirements surfaced by audit

## 3.1 Data unavailable remediation is typed

The source specification's remediation options belong in I5 interpretation/application behavior and should be retained as typed proposals, not free-form engine behavior:

```text
SHORTEN_PERIOD
USE_PROXY
CHANGE_FREQUENCY
REMOVE_CONDITION
SAVE_INCOMPLETE
```

Applying any material remediation creates/updates canonical ResearchDraft/ResearchSpec lineage and may require explicit user confirmation.

## 3.2 Beginner and advanced users share one scientific core

The design must not fork beginner and advanced scientific engines.

Differences may exist only in:

- interpretation guidance;
- terminology/explanation level;
- template suggestions;
- amount of translate-back detail;
- confirmation UX.

Canonical ResearchSpec/IR/Dataset/Run/Result/Evidence contracts remain the same.

## 3.3 Explanation cannot overclaim causality

For an Experiment comparison, structured evidence may prove:

```text
parameter X changed
metric Y changed
```

It does not automatically prove:

```text
X caused Y
```

unless the experiment/methodology contract justifies that causal interpretation. Explanations must distinguish observation/comparison from causal inference.

## 3.4 ResearchVersion from the product source is a projection, not a fourth revision authority

The source `ResearchVersion` concept is retained as a useful composite lineage view, but it must not become an independent mutable/version authority competing with HypothesisRoot, ResearchSpecRoot and Experiment lineage.

Candidate projection:

```text
ResearchVersionView
  investigation_id
  composite_version_label
  hypothesis_revision_id
  research_spec_revision_id
  experiment_id?
  change_reason
  created_at
```

It is derived from canonical object lineage or recorded as an immutable linking record; it does not control active pointers independently.

---

# 4. Contradiction audit against canonical predecessor

## Authority

`PASS — DESIGN LEVEL`

The working design uses the I1 actor/scope model, rejects client IDs as ownership proof, keeps `service_role != authorization`, derives account tenant canonically for ACCOUNT_SCOPE, and requires SYSTEM_ACTOR policy for workers.

## Trading / Investing isolation

`PASS — DESIGN LEVEL`

The design introduces no Trading dependency and no shared portfolio/plan/execution authority.

## Financial truth

`PASS — DESIGN LEVEL`

The design preserves I0 truth dimensions separately from research environment and explicitly forbids missing -> zero.

## Plan / accounting mutation

`PASS — DESIGN LEVEL`

Research is read-only with respect to Plan, ledger, lots, positions, cash and execution truth. USER_PORTFOLIO input uses an immutable research projection with source lineage rather than a writable duplicate authority.

## Concurrency/idempotency

`PASS — DESIGN LEVEL`

Active research pointers use aggregate CAS; worker execution is at-least-once with idempotent scientific effects; a fresh idempotency key never replays another writer merely because content matches.

## Reproducibility

`PASS — DESIGN LEVEL / EXACT VECTORS PENDING`

The design binds ResearchSpec, Experiment, DatasetSnapshot, engine, metric, cost/slippage, execution and policy versions. Exact canonical serialization/hash golden vectors remain pending before freeze.

## Product-source fidelity

`PASS WITH AMENDMENTS`

The architecture retains the source Research Lab purpose and domain model while replacing non-canonical authority shapes and preserving source terminology through Amendments A/B. Template, conversation-state and observability coverage were added through Amendments C-E.

---

# 5. I5-A status after audit

```text
I4 PARENT
  5de091fcfe1f595d781f6cbc4eaa49ed49341398

I5 PRODUCT SOURCE
  RESEARCH LAB / I5 ONLY

I5-A CORE DESIGN
  WORKING

MATERIAL DESIGN QUESTIONS
  20/20 CANDIDATE RESOLUTIONS

AUDIT AMENDMENTS
  SCIENTIFIC_FAILURE terminology preserved
  Result qualityState vocabulary preserved
  Template Engine added
  non-canonical Conversation State added
  Research-Lab Observability added

CONTRADICTION AUDIT
  NO MATERIAL BLOCKER FOUND AT DESIGN LEVEL

FREEZE
  NOT YET — exact schemas/vectors/state tables still required

IMPLEMENTATION
  NOT AUTHORIZED

PRODUCTION
  UNCHANGED
```
