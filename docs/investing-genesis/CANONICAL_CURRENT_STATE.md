# Syntrake Investing Genesis - Canonical Current State

Status: `CURRENT CANONICAL STATE MAP`

This document is a concise operational map. It is not a new Bible and it does
not create feature authority.

## Lineage

- Zero-Genesis retirement baseline:
  `87c19fd5ebadcc5b20ce587c185346379fd8d96b`.
- Hygiene slice predecessor:
  `9e341accb7658cbc9bff7cb749be4acc1437ad6c`.
- Pre-Genesis Investing documents and source are historical lineage only unless a
  current accepted Genesis contract explicitly incorporates them.
- Pre-Genesis Investing migrations before the Zero-Genesis retirement boundary
  are `HISTORICAL_LINEAGE_ONLY`. The prior source-purge candidate based on
  `main` `860b521578b77cb3d4ae4651ae7719fbad7e1f04` is historical fact, not the
  current source-tree state.
- Git history remains the historical record. The Zero-Genesis retirement bridge
  migrations, 53 restored pre-Genesis `HISTORICAL_LINEAGE_ONLY` migrations and
  current Genesis/I5 migrations remain in the active tree.
- Migration-history reconciliation has passed. Current architecture authority is
  not derived from those historical migrations.

## Source-Of-Truth Precedence

1. Current accepted code, migrations, tests and runtime contracts in this tree.
2. Current root repository guidance in `AGENTS.md`.
3. Current Investing Genesis contracts listed below.
4. Historical design documents only when explicitly incorporated by a current
   contract.

`SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md` is reference/blueprint only.
It is not source-of-truth, slice numbering authority, roadmap authority or
implementation sequence authority.

## Product Boundaries

`CORE != LAB`.

Research Lab is optional. Removing the Lab must leave future Investing Core and
Trading Core able to perform their own monitoring, risk and decision
responsibilities. Lab may consume Core; Core must not depend on Lab.

`LAB != PAPER`.

Lab may request future Paper validation, observe returned evidence and consume
that evidence. Lab does not own Paper positions, cash, broker orders, fills,
fees, reconciliation, execution authority or live financial state. Paper owns
its own financial and execution lifecycle.

## Rehearsal Model

Execution/runtime green is not sufficient by itself. Future slice rehearsal must
separate:

- A. `EXECUTION REHEARSAL`
- B. `CANONICAL INTEGRITY REHEARSAL`
- C. `REPOSITORY CONTROL PLANE`

Every slice must answer: `WHAT DID THIS SLICE SUPERSEDE?`

If something was superseded, the slice is incomplete while superseded authority
can still compete as current authority.

## Roadmap Clarification

The I0 internal `I0 -> I12` sequence is a historical Genesis decomposition, not
the current high-level Syntrake product roadmap.

Current high-level roadmap:

```text
R0 -> R1 -> R2 -> R3 -> R4 -> R5 -> R6 -> R7
```

## Current I0-I5 File Map

| Area | Current active contract files |
| --- | --- |
| I0 | `I0_CONSTITUTION.md` |
| I1 | `I1_AUTHORITY_DESIGN.md`, `I1_DB_BOUNDARY_CONTRACT.md` |
| I2 | `I2_LEDGER_DESIGN.md` plus accepted I2 migrations/tests |
| I3 | `I3_ACCOUNTING_DESIGN.md`, `I3_ACCOUNTING_DESIGN_FREEZE.md` |
| I4 | `I4_PLAN_DESIGN.md`, `I4B_CANONICAL_BYTES_CONTRACT.md`, `I4B_PLAN_PERSISTENCE_DESIGN.md`, `I4C_PLAN_WRITER_DESIGN.md`, `I4C_RECONCILIATION.md`, `I4_MASTER_CHECKPOINT.md` |
| I5 authority | `I5_MATERIAL_COMMAND_IDENTITY_V1.md` and accepted I5 authority/runtime migrations/tests |
| I5 A2 hash domains | `I5A_CANONICAL_HASH_DOMAINS_V1.md` |
| I5 A3 material revisions | `I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md` |
| I5 A5 Research IR | `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` |
| I5 Experiment baseline (unnumbered) | `I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md`, `I5_EXPERIMENT_BASELINE_PERSISTENCE_OWNER_CONTRACT_V1.md` |
| I5 Experiment VARIANT structural lineage admission (unnumbered) | `I5_EXPERIMENT_VARIANT_LINEAGE_ADMISSION_OWNER_CONTRACT_V1.md` |
| I5 Experiment VARIANT persistence (unnumbered) | `I5_EXPERIMENT_VARIANT_PERSISTENCE_OWNER_CONTRACT_V1.md` |
| I5 ExperimentParameters scientific identity (unnumbered) | `I5_EXPERIMENT_PARAMETERS_OWNER_CONTRACT_V1.md` |
| I5 Experiment Scientific Closure (unnumbered) | `I5_EXPERIMENT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` |
| I5 Dataset & Run Scientific Closure (unnumbered) | `I5_DATASET_RUN_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` |
| I5 Research Execution Engine design freeze (unnumbered) | `I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md`, `I5_RESEARCH_EXECUTABLE_FIELD_SEMANTICS_V1.md`, `I5_RESEARCH_METRIC_REGISTRY_V1.md` |
| I5 Research Execution Closure (unnumbered) | `I5_RESEARCH_EXECUTION_CLOSURE_OWNER_CONTRACT_V1.md` |
| I5 RL-1 Evidence Object Scientific Closure (unnumbered) | `I5_RL1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` |
| I5 RL-2 Evidence Ledger and Passport (unnumbered) | `I5_RL2_EVIDENCE_LEDGER_PASSPORT_OWNER_CONTRACT_V1.md` |
| I5 RL-3A Validation Protocol Foundation (unnumbered) | `I5_RL3_VALIDATION_PROTOCOL_OWNER_CONTRACT_V1.md` |
| I5 RL-3B Validation Child Execution (unnumbered) | `I5_RL3B_VALIDATION_CHILD_EXECUTION_OWNER_CONTRACT_V1.md` |
| I5 Research Lab completion program (unnumbered) | `I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md` |

`I4C_RECONCILIATION.md` remains required historical lineage because accepted I4
freeze/master evidence still relies on its narrow classifications.

## Current Implementation Map

- Authority context: `lib/investing/authority/context.ts`.
- I5 canonical primitives and scientific hash domain admission:
  `lib/investing/research/canonical.ts`.
- I5 material command request identity:
  `lib/investing/research/materialRequest.ts`; it now owns deterministic
  material request identity for Experiment BASELINE and VARIANT creation, but
  not a scientific Experiment hash.
- I5 semantic Draft/Hypothesis/Spec candidate runtime:
  `lib/investing/research/semantic.ts`.
- I5 Investigation persistence: `lib/investing/research/investigationWriter.ts`.
- I5 Draft persistence: `lib/investing/research/draftWriter.ts`.
- I5 material revision persistence:
  `lib/investing/research/materialRevisionWriter.ts`.
- I5 Spec revision persistence:
  `lib/investing/research/researchSpecRevisionWriter.ts`.
- I5 Research IR runtime: `lib/investing/research/researchIr.ts`.
- I5 Experiment BASELINE structural admission runtime:
  `lib/investing/research/experiment.ts`.
- I5 Experiment VARIANT structural lineage admission runtime:
  `lib/investing/research/experiment.ts`; this owns the accepted structural
  admission boundary only, not VARIANT persistence.
- I5 Experiment BASELINE persistence:
  `lib/investing/research/experimentBaselineWriter.ts` and
  `lib/investing/research/experimentBaselineService.ts`.
- I5 Experiment VARIANT persistence:
  `lib/investing/research/experimentVariantWriter.ts` and
  `lib/investing/research/experimentVariantService.ts`.
- I5 ExperimentParameters scientific identity:
  `lib/investing/research/experimentParameters.ts`.
- I5 Experiment Scientific Closure:
  `lib/investing/research/experiment.ts`, Experiment BASELINE/VARIANT
  persistence migrations and PostgreSQL 17 rehearsal establish durable
  Experiment scientific hash-envelope persistence in canonical lineage.

- I5 Dataset & Run Scientific Closure:
  `lib/investing/research/executionMaterials.ts`,
  `lib/investing/research/runInputScientific.ts`,
  `lib/investing/research/runInputScientificWriter.ts` and
  `lib/investing/research/runInputScientificService.ts`; the accepted closure
  owns PURE_RESEARCH scientific execution-input identity and durable append-only
  persistence, not Run execution lifecycle.
- I5 Research Execution Engine accepted design freeze:
  `I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md`,
  `I5_RESEARCH_EXECUTABLE_FIELD_SEMANTICS_V1.md` and
  `I5_RESEARCH_METRIC_REGISTRY_V1.md`; this accepted design freeze owns the
  deterministic execution, field and metric semantics for the first I5
  PURE_RESEARCH/HISTORICAL_BACKTEST execution profile. It does not implement
  the engine loop, create persistence, activate Result hashing or mutate
  production Supabase.
- I5 Research Execution Closure:
  `CURRENT_ACCEPTED / UNNUMBERED`. This accepted closure establishes the first
  functional accepted RunInput -> verified scientific materials -> deterministic
  historical execution -> immutable artifacts -> metrics -> scientific Result ->
  append-only operational Run lifecycle for the narrow accepted
  PURE_RESEARCH/HISTORICAL_BACKTEST profile. It accepts
  `SYNTRAKE:RESULT:V1 = OWNER_PAYLOAD_EXACT` for its exact Result owner payload
  only. Its former limitation that Evidence remains outside acceptance is now
  superseded only by accepted RL-1 Evidence Object Scientific Closure; Paper,
  broker, Live, Capital Kernel, UI, an A-number and production migration
  application remain outside Research Execution Closure.
- I5 RL-1 Evidence Object Scientific Closure:
  `CURRENT_ACCEPTED / UNNUMBERED`. This accepted closure establishes
  `SYNTRAKE:EVIDENCE_OBJECT:V1 = CONTENT_PREIMAGE_EXACT` for the owner-specific
  `RESEARCH_EXECUTION_EVIDENCE_V1` descriptor/content boundary only. RL-1 binds
  exact Result, RunInput, DatasetSnapshot, DatasetSeries, metric, config,
  engine and artifact identities; creates deterministic exact Evidence content
  bytes; persists append-only durable scientific Evidence; enforces exact
  reuse/conflict behavior; finalizes atomically Evidence-before-SUCCEEDED;
  enforces content SHA-256 and byte-length integrity; applies RLS and FORCE RLS;
  fails closed across tenant/principal/membership/scope/source/account context;
  executes through real `investing_app`; and is rehearsed on PostgreSQL 17.11.
  Generic arbitrary Evidence hashing is not a public Research authority surface.
- I5 RL-2 Evidence Ledger and Passport:
  `CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT / UNNUMBERED`. This
  accepted closure establishes an internal deterministic Investigation-level
  Evidence Ledger / Passport projection over already accepted canonical
  Research authorities. `PASSPORT != SCIENTIFIC AUTHORITY`.
  `EVIDENCE LEDGER != FINANCIAL LEDGER`.
  `EVIDENCE LEDGER != NEW EVENT STORE`. `LAB != PAPER`. `CORE != LAB`.
  RL-2 creates no scientific hash domain, no Passport scientific identity, no
  Passport persistence table and no duplicate scientific persistence.
- I5 RL-3A Validation Protocol Foundation:
  `CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION / UNNUMBERED`. This
  accepted owner contract admits `SYNTRAKE:VALIDATION_PROTOCOL:V1 =
  OWNER_PAYLOAD_EXACT` for the deterministic Validation Protocol V1 owner
  payload only. RL-3A establishes exact protocol admission, no-lookahead fold
  planning, deterministic phase material slicing and phase Research IR
  derivation. It does not accept complete RL-3, RL-3B, RL-3C, Validation Result,
  child execution, persistence, migration, promotion, blind truth, API/UI,
  Paper, broker, Capital Kernel or Production mutation.
- I5 RL-3B Validation Child Execution:
  `CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION / UNNUMBERED`. This
  accepted slice adds
  `SYNTRAKE:VALIDATION_RUN_INPUT:V1` and
  `SYNTRAKE:VALIDATION_CHILD_RESULT:V1` owner payloads, reuses the deterministic
  V1 historical execution kernel, and introduces accepted persistence for
  protocol identities, fold/phase run inputs, child runs, artifacts and child
  results. It does not accept complete RL-3 or aggregate Validation Result.
- I5 Research Lab Completion Program:
  `CURRENT_ACCEPTED / UNNUMBERED`. This accepted design program defines the
  finite RL-1 through RL-11 backend completion sequence and the final target
  `I5 RESEARCH LAB = BACKEND_COMPLETE / PRODUCT_UI_DEFERRED`. It is planning
  authority only: it does not itself implement Evidence, validation, Engine V2,
  Passport, promotion, Blind Truth or orchestration, and it does not close I5.

Trading research modules under `lib/trading/research` are Trading-owned and do
not become Investing Genesis authority merely because they use similar words.

## Gate State

- Zero-Genesis retirement: canonical baseline preserved.
- Pre-Genesis Investing migration-history reconciliation: `PASSED`; exactly 53
  pre-Genesis Investing migrations are restored in the current tree as
  `HISTORICAL_LINEAGE_ONLY`. They are not current architecture, implementation
  templates, runtime authority or Zero-Genesis rule changes.
- I0-I4 Genesis: current accepted canonical contracts preserved.
- I5 authority/audit runtime and DB contract: current in canonical lineage.
  `I5_MATERIAL_COMMAND_IDENTITY_V1.md` is material command identity only and
  does not claim persistence authority.
- I5-A1 Investigation persistence/current runtime: current accepted.
- I5-A2 ResearchDraft persistence/current runtime: current accepted.
- I5 runtime lock contract repair: current accepted.
- I5-A3 material revisions: current accepted and consolidated by this hygiene
  slice.
- I5 canonical fresh-install lineage repair: current accepted.
- I5-A4 ResearchSpec persistence: current accepted.
- I5 Experiment BASELINE structural admission: current accepted, unnumbered,
  runtime-only. This structural acceptance does not by itself establish durable
  Experiment persistence, Experiment scientific hash, ExperimentParameters hash,
  DatasetSnapshot, Run, Result, Evidence or execution authority.
- I5 Experiment BASELINE persistence: current accepted, unnumbered. This
  acceptance establishes durable operational Experiment UUID identity,
  BASELINE-only Experiment persistence, exact ResearchSpecRevision binding,
  Research IR HashRef envelope persistence, material request identity,
  idempotency, exact active Experiment pointer, Tenant/Account authority,
  FORCE RLS, and A3/A4 Experiment-aware invalidation/preservation semantics.
  It does not establish scientific Experiment hashing, ExperimentParameters,
  VARIANT, DatasetSnapshot, Run, Result, Evidence, Paper, Trading, Core,
  Capital Kernel or Live.
- I5 Experiment VARIANT structural lineage admission: current accepted,
  unnumbered. This structural runtime-only acceptance admits an immutable parent
  operational Experiment UUID, canonical ResearchSpecRevision identity and
  Research IR HashRef family evidence. The structural admission itself does not
  own persistence authority. At the time of structural admission, persistence
  was deferred; that limitation is now superseded by the separately accepted
  Experiment VARIANT persistence owner contract. At the time of structural
  admission, scientific Experiment hashing was disabled; that limitation is now
  superseded by the separately accepted Experiment Scientific Closure owner
  contract. ExperimentParameters scientific identity is accepted separately.
- I5 Experiment VARIANT persistence: current accepted, unnumbered. This
  acceptance establishes durable operational VARIANT lineage, immutable
  parent_experiment_id, exact parent-family binding, material request identity,
  idempotency, active Experiment pointer transition, Tenant/Account authority,
  RLS/FORCE RLS, minimal ACL, VARIANT-to-VARIANT lineage, BASELINE uniqueness
  preservation, current structural VARIANT uniqueness and A3/A4 compatibility
  with an active VARIANT. Its former scientific-identity limitation is now
  superseded by the accepted Experiment Scientific Closure owner contract.
- I5 ExperimentParameters scientific identity: current accepted, unnumbered.
  This acceptance establishes deterministic scientific identity for
  `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` by binding exact BASE Research IR HashRef,
  exact RESOLVED Research IR HashRef and immutable
  `I5_EXPERIMENT_PARAMETERS_POLICY_V1`. Experiment Scientific Closure now uses
  that identity as a VARIANT HashRef binding and persists the VARIANT
  ExperimentParameters hash envelope. It does not establish standalone raw
  ExperimentParameters payload persistence, DatasetSnapshot,
  Run/Result/Evidence, Paper, Trading or Investing Core.
- I5 Experiment Scientific Closure: current accepted, unnumbered. This
  acceptance establishes BASELINE and VARIANT scientific Experiment identity,
  durable Experiment HashRef persistence and the accepted Experiment lineage
  guarantees. At the time this slice was accepted, ResearchSpec scientific
  hashing and Dataset/Run scientific inputs were still deferred; those specific
  limitations are now superseded by the separately accepted Dataset & Run
  Scientific Closure. Standalone raw ExperimentParameters persistence remains
  outside that later closure.
- I5 Dataset & Run Scientific Closure: current accepted, unnumbered. This
  acceptance establishes exact owner payloads for ResearchSpec, DatasetSeries,
  DatasetSnapshot, MetricRequestSet and ExecutionConfig; preserves
  `SYNTRAKE:RUN_INPUT:V1` as `PREIMAGE_ENVELOPE_EXACT`; admits a scientifically
  consistent PURE_RESEARCH/HISTORICAL_BACKTEST RunInput; and establishes
  durable append-only persistence for the six scientific identity surfaces.
  Authority is intentionally limited to `TENANT_SCOPE / PURE_RESEARCH /
  account_id = NULL`; AccountResearchContext and USER_PORTFOLIO remain
  fail-closed. At the time this slice was accepted, Run execution lifecycle,
  Result and Evidence were not established; Run execution lifecycle and Result
  are now narrowly superseded by the accepted I5 Research Execution Closure.
  The former Evidence limitation is now superseded by accepted RL-1 Evidence
  Object Scientific Closure. Production Supabase received the Dataset/Run
  closure migration in the A4 -> RL-3B production catch-up recorded below.
- I5 Research Execution Engine Design Freeze: current accepted, unnumbered.
  This acceptance freezes deterministic Research Lab execution, executable
  field and metric semantics for PURE_RESEARCH/HISTORICAL_BACKTEST only. This
  design freeze does not establish engine runtime implementation, Run execution
  lifecycle, Result authority, Result hashing, Evidence, production persistence,
  production Supabase mutation or an A-number by itself. Engine runtime
  implementation, Run execution lifecycle and Result authority/hashing are now
  narrowly realized by the accepted I5 Research Execution Closure; the frozen
  semantics themselves remain accepted authority. Evidence, production
  persistence/application and an A-number remain outside this design freeze.
- I5 Research Execution Closure: current accepted, unnumbered. This acceptance
  establishes dedicated `RESEARCH_EXECUTION_RUN_V1 / RESEARCH_EXECUTE`
  authority; tenant-only PURE_RESEARCH execution; active tenant/owner membership
  authority; verified DatasetSeries material bytes; deterministic historical
  execution kernel; XNYS calendar authority; exact rational arithmetic;
  execution trace; valuation series; accepted metrics; benchmark; immutable
  artifacts; scientific Result identity; append-only Run lifecycle; atomic
  success finalization; deterministic repeated-run Result reuse; and RLS/FORCE
  RLS application execution as `investing_app`. It accepts
  `SYNTRAKE:RESULT:V1 = OWNER_PAYLOAD_EXACT` for the exact owner payload only.
  It does not complete Evidence Object acceptance, Passport completion, Evidence
  Ledger product surface, OOS/walk-forward, Monte Carlo, optimizer, Strategy
  DNA, Strategy Autopsy, Blind Truth promotion, Paper, broker, Capital Kernel,
  Live, UI or USER_PORTFOLIO/account execution. Production Supabase received
  the Research Execution Closure migration in the A4 -> RL-3B production
  catch-up recorded below.

- I5 RL-1 Evidence Object Scientific Closure: current accepted, unnumbered.
  This acceptance establishes the first durable scientific Evidence Object for
  Research Execution using `SYNTRAKE:EVIDENCE_OBJECT:V1 =
  CONTENT_PREIMAGE_EXACT` and owner-specific `RESEARCH_EXECUTION_EVIDENCE_V1`.
  It binds exact Result, RunInput, DatasetSnapshot, DatasetSeries, metric,
  config, engine and artifact identities; deterministic exact Evidence content
  bytes; append-only durable Evidence persistence; exact reuse/conflict
  behavior; atomic Evidence-before-SUCCEEDED finalization; content SHA-256 and
  byte-length integrity; RLS and FORCE RLS; complete
  tenant/principal/membership/scope/source/account fail-closed authority; real
  `investing_app` execution; and PostgreSQL 17.11 rehearsal. Generic arbitrary
  Evidence hashing is not a public Research authority surface. It does not
  establish Passport completion, Evidence Ledger product surface, RL-2 or later
  Research Lab closure, Paper, broker, Capital Kernel, Live, UI or
  USER_PORTFOLIO/account execution. Production Supabase received the RL-1
  migration in the A4 -> RL-3B production catch-up recorded below.

- I5 RL-2 Evidence Ledger and Passport: current accepted, unnumbered. This
  acceptance establishes a deterministic Investigation-level Evidence Ledger /
  Passport projection over already accepted canonical Research authorities.
  Passport is a read model only, not scientific authority, not a new event
  store, not a financial ledger, not Paper and not Core. RL-2 creates no
  scientific hash domain and no duplicate scientific persistence. It preserves
  historical material revisions, ResearchSpec revisions, BASELINE/VARIANT
  Experiments, RunInputs, operational Runs, lifecycle events, Results and
  Evidence Objects; supports tenant and account Investigation authority; runs
  under repeatable-read read-only `investing_app`; and exposes RL-3/RL-8/RL-9
  as explicit deferred authority. Production Supabase received the RL-2
  migration in the A4 -> RL-3B production catch-up recorded below.

- I5 RL-3A Validation Protocol Foundation: current accepted, unnumbered. This
  acceptance establishes the deterministic Validation Protocol V1 owner payload
  and exact `SYNTRAKE:VALIDATION_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT` admission
  boundary for RL-3A only. It binds accepted Research IR, Experiment,
  DatasetSnapshot, MetricRequestSet and ExecutionConfig HashRefs; immutable
  engine and metric registry versions; closed validation modes; ordered
  XNYS-session fold windows; no-lookahead prefix material slicing; and phase
  Research IR derivation. It creates no Validation Result, child-result,
  promotion, blind-truth, persistence, migration, RLS, SQL, API/UI, Paper,
  broker, Live, Capital Kernel or Production authority.

- I5 Research Lab Completion Program: current accepted, unnumbered. This
  acceptance defines RL-2 through RL-11 as the remaining finite backend
  completion bar after accepted RL-1,
  preserves the immutable `ENGINE_V20260918` historical semantics, keeps
  Monte Carlo/scenario/stress/allocation/suitability in I6, Paper in I7,
  product API in I9 and product UI deferred. No RL implementation is accepted
  by the program itself and the Research Lab is not yet backend-complete.

I5 Research Lab Completion Program acceptance evidence:

- Canonical predecessor:
  `d2d744c8b463b968169a8954bfee42cf93ec1184`.
- Independently audited design candidate:
  `5c86dbf7094b33dc2612b613c791b899fa29f6c4`.
- Accepted merge/main anchor:
  `8400d7675788a60ee3399ee5908452b1e6f5e91e`.
- PR:
  `#78`.
- CI:
  `35508567814 - SUCCESS`.
- Vercel:
  `SUCCESS`.
- Runtime changes:
  `NONE`.
- Migration changes:
  `NONE`.
- Production mutation:
  `NONE`.
- Permanent A-number:
  `NOT ASSIGNED`.

`I5 RESEARCH LAB COMPLETION PROGRAM = CURRENT_ACCEPTED / UNNUMBERED`.

`I5 RESEARCH LAB = IN_PROGRESS / RL-3_TO_RL-11 / PRODUCT_UI_DEFERRED`.

I5 Research Execution Engine Design Freeze acceptance evidence:

- Canonical predecessor:
  `557c5c95f3798eb5a2cce0cd28f3d47ed81997b4`.
- Initial design candidate:
  `d2c2d9d4c278ad93103de0dcae5e8de49bd544b3`.
- Final independently audited technical candidate:
  `e3c302aff00a73fa121051abaf839ae1cb9a2383`.
- CI:
  `35464456177` — `SUCCESS`.
- Vercel:
  `SUCCESS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production Supabase mutation:
  `NOT PERFORMED`.
- Production migration:
  `NONE`.

`I5 RESEARCH EXECUTION ENGINE DESIGN FREEZE = CURRENT_ACCEPTED / DESIGN_FREEZE / UNNUMBERED`.

I5 Research Execution Closure acceptance evidence:

- Canonical predecessor:
  `79f4cecbf20d756087defccec3fcbdea8291e7de`.
- Final independently audited technical candidate:
  `2d0631bd22a21cb24d0cc299e3308db1fdfff14f`.
- PR:
  `#76`.
- CI:
  `35504890518 - SUCCESS`.
- PG17:
  `35504890428 - SUCCESS`.
- PostgreSQL:
  `17.11`.
- Full CI test suite:
  `1158 passed / 36 skipped`.
- Dedicated Research Execution Closure PG17:
  `PASS`.
- Application database role proof:
  `current_user = investing_app`; `current_role = investing_app`.
- RunInput scientific writer under FORCE RLS:
  `PASS`.
- Research execution service/writer under FORCE RLS:
  `PASS`.
- Two operational Runs / one scientific Result identity:
  `PASS`.
- Late application-level finalization rollback:
  `PASS`.
- Vercel:
  `SUCCESS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production Supabase mutation:
  `NONE`.
- Production migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.

`I5 RESEARCH EXECUTION CLOSURE = CURRENT_ACCEPTED / UNNUMBERED`.

I5 RL-1 Evidence Object Scientific Closure acceptance evidence:

- Canonical predecessor:
  `f723a1dfa75007799c296eeb4ead74f994557458`.
- Final independently audited technical candidate:
  `1f7ab6ec80b7de1c47e68958ddd309dbb53f1f8c`.
- PR:
  `#81`.
- CI PR run:
  `35518056377 - SUCCESS`.
- CI run number:
  `1012`.
- Full suite:
  `213 passed / 17 skipped files`.
- Full suite tests:
  `1165 passed / 36 skipped tests`.
- Lint:
  `PASS`.
- TypeScript:
  `PASS`.
- Production build:
  `PASS`.
- Dependency audit:
  `0 vulnerabilities`.
- PG17 run:
  `35518056379 - SUCCESS`.
- PG17 job:
  `106097238317 - SUCCESS`.
- PostgreSQL exact version:
  `17.11 (Debian 17.11-1.pgdg13+2)`.
- Dedicated Research Execution + RL-1 PG17:
  `2/2 PASS`.
- Vercel:
  `SUCCESS`.
- Production Supabase mutation:
  `NONE`.
- Production migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Independent auditor verdict:
  `PASS`.

`I5 RL-1 EVIDENCE OBJECT SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / UNNUMBERED`.

I5 RL-2 Evidence Ledger and Passport acceptance evidence:

- Canonical predecessor:
  `15444892a8b12bd53ec8e48d4162093482c4fa40`.
- Technical candidate:
  `326feaf0c047c36a88a3be1c0cc71a573d75ffa5`.
- PR:
  `#82`.
- CI:
  `35774520717 - SUCCESS`.
- Full suite:
  `216 passed / 18 skipped files`.
- Full suite tests:
  `1192 passed / 43 skipped tests`.
- Lint:
  `PASS`.
- TypeScript:
  `PASS`.
- Production build:
  `PASS`.
- Dependency audit:
  `0 vulnerabilities`.
- PG17:
  `35774520535 - SUCCESS`.
- Historical PG17 job:
  `106904206482 - SUCCESS`.
- Cumulative compatibility PG17 job:
  `106904206842 - SUCCESS`.
- RL-2 dedicated PostgreSQL rehearsal:
  `7 / 7 PASS`.
- PostgreSQL:
  `17.11 (Debian 17.11-1.pgdg13+2)`.
- Vercel candidate:
  `READY / PREVIEW`.
- Independent auditor verdict:
  `PASS`.
- Production Supabase mutation:
  `NONE`.
- Production migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.
- Cumulative compatibility repair production application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.
- Production RL-2 migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.
- Accepted RL-2 migration:
  `20260922192229_investing_i5_rl2_evidence_ledger_passport_read.sql`.
- Permanent A-number:
  `NOT ASSIGNED`.

Accepted RL-2 invariants:

- Passport is deterministic projection/read model only.
- No Passport persistence table.
- No Passport scientific hash domain.
- Dedicated `RESEARCH_PASSPORT_READ_V1 / RESEARCH_READ`.
- Tenant and account Investigation authority.
- Repeatable-read read-only snapshot.
- `current_user/current_role = investing_app`.
- Full historical material, Experiment, Run, Result and Evidence reconstruction.
- `DRAFT -> SYNTRAKE:RESEARCH_DRAFT:V1`.
- `HYPOTHESIS -> SYNTRAKE:HYPOTHESIS:V1`.
- ResearchSpec scientific identity only when materialized as `SYNTRAKE:RESEARCH_SPEC:V1`.
- Valid `NO_HYPOTHESIS` support.
- RunInput to ResearchSpec scientific hash binding.
- RunInput to Research IR binding.
- RunInput to Experiment binding.
- Duplicate ResearchSpec scientific identity rejection.
- Strict lifecycle validation.
- Result artifact fail-closed validation.
- Evidence binding.
- Result/Evidence reuse visibility across distinct operational Runs.
- Cross-tenant/principal/membership denial.
- RLS matrix across all accepted scientific/execution surfaces.
- Read authority grants no mutation authority.
- Future RL-3/RL-8/RL-9 represented as explicit deferred authority.

`I5 RL-2 EVIDENCE LEDGER AND PASSPORT V1 = CURRENT_ACCEPTED / UNNUMBERED`.

I5 RL-3A Validation Protocol Foundation acceptance evidence:

- Canonical predecessor:
  `fdc8351457c6e421163ec7144fb00dda6b7135f0`.
- Final independently audited technical candidate:
  `3e7e61458b6b9ca16928e0ad1908e010d7134db3`.
- PR:
  `#84`.
- CI:
  `35784005405 - SUCCESS`.
- verify:
  `106936222294 - SUCCESS`.
- dependency-audit:
  `106936222042 - SUCCESS`.
- Vercel:
  `SUCCESS`.
- RL-3A dedicated tests:
  `26 PASS`.
- Architecture boundaries:
  `27 PASS`.
- Full suite:
  `1218 PASS / 43 SKIPPED`.
- PostgreSQL rehearsal:
  `NOT REQUIRED - NO PERSISTENCE / MIGRATION / RLS / SQL IN RL-3A`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Independent auditor verdict:
  `PASS`.

`I5 RL-3A VALIDATION PROTOCOL FOUNDATION V1 = CURRENT_ACCEPTED / UNNUMBERED`.

I5 RL-3B Validation Child Execution acceptance evidence:

- Canonical predecessor:
  `d73a2c1452c15b48c20524cdc56c5db144874cb7`.
- Final independently audited technical candidate:
  `aa45ac0fe8be88c81ef78604cbd110e943c8eed2`.
- PR:
  `#85`.
- Accepted squash merge / canonical main:
  `2f446bfcda401c8d2f7b5fcbc31be375dc3fd554`.
- Candidate/merge tree:
  `beb7ed44697e1ac01c02a1cd97fbbab7ac6d2696`.
- Independent verify rerun:
  `107311713178 - SUCCESS`.
- Independent dependency-audit rerun:
  `107311717417 - SUCCESS`.
- Independent PostgreSQL 17 RL-3B reconciliation rerun:
  `107311749084 - SUCCESS`.
- Independent cumulative PostgreSQL 17 rerun:
  `107311750435 - SUCCESS`.
- RL-3B authority tests:
  `24 PASS`.
- RL-3B writer/service tests:
  `2 PASS`.
- RL-3B runtime tests:
  `5 PASS`.
- Full suite:
  `1252 PASS / 44 SKIPPED`.
- Vercel merged-main deployment:
  `SUCCESS`.
- Production Supabase:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.
- Production migration:
  `20260923090000_investing_i5_rl3b_validation_child_execution.sql`.
- Post-apply independent audit:
  `PASS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.

`I5 RL-3B VALIDATION CHILD EXECUTION V1 = CURRENT_ACCEPTED / UNNUMBERED`.

## Production Supabase Migration State

Production Supabase migration state:
`CURRENT THROUGH RL-3B`.

- Latest:
  `20260923090000 investing_i5_rl3b_validation_child_execution`.
- Migration ledger:
  `95 versions`.
- A4 -> RL-3B production application:
  `PASSED`.
- Post-apply independent audit:
  `PASSED`.
- Unexpected migrations:
  `NONE`.
- Physical audit:
  `30/30 expected material relations present`.
- Owner:
  `investing_owner`.
- RLS:
  `PASS`.
- FORCE RLS:
  `PASS`.
- Blocked-role relation grants:
  `NONE`.
- Schema authority boundary:
  `PASS`.
- Security advisor blocker in `investing`:
  `NONE`.
- Observed `SECURITY DEFINER` trigger guards:
  `investing.enforce_research_execution_run_event_transition()`;
  `investing.reject_research_evidence_update_delete()`.

Applied production migration batch:

```text
20260915150000_investing_i5_experiment_baseline_persistence.sql
20260916194400_investing_i5_experiment_variant_persistence.sql
20260917183000_investing_i5_experiment_scientific_closure.sql
20260918170000_investing_i5_dataset_run_scientific_closure.sql
20260919090000_investing_i5_research_execution_closure.sql
20260920090000_investing_i5_rl1_evidence_object_scientific_closure.sql
20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql
20260922192229_investing_i5_rl2_evidence_ledger_passport_read.sql
20260923090000_investing_i5_rl3b_validation_child_execution.sql
```

`RL-3B = CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION / UNNUMBERED`.
`RL-3B Production migration = APPLIED`.
`RL-3B post-apply audit = PASSED`.

This production state does not accept complete RL-3, RL-3C, aggregate Validation
Result, promotion, Blind Truth, Paper, Live or any permanent A-number.

## I5 Runtime Presence And Trust State

Implementation presence is not the same as formal trust recovery acceptance.
Physical canonical lineage is not the same fact as a dedicated owner contract.

| Slice | Runtime/persistence present | Dedicated current owner contract present | Current authority/evidence surface | Document/header status | Gate/trust classification | Known blocker |
| --- | --- | --- | --- | --- | --- | --- |
| I5-A1 Investigation persistence/current runtime | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A1 persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A2 ResearchDraft persistence/current runtime | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A2 persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A3 material revisions | YES | YES | `I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md` + runtime/persistence migration/tests + canonical lineage | CURRENT CONSOLIDATED OWNER CONTRACT | current in canonical lineage / consolidated | none recorded here |
| I5-A4 ResearchSpec persistence | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A4 ResearchSpec persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A5 Research IR runtime/owner contract | YES | YES | `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` + runtime/tests + canonical lineage | CURRENT ACCEPTED OWNER CONTRACT | CURRENT_ACCEPTED / TRUST_RECOVERY_CLOSED | NONE |
| Experiment BASELINE structural admission / unnumbered | YES | YES | `I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md` + runtime + tests + canonical lineage | CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT BASELINE (UNNUMBERED) | CURRENT_ACCEPTED / STRUCTURAL_RUNTIME_ONLY | NONE |
| Experiment BASELINE persistence / unnumbered | YES | YES | `I5_EXPERIMENT_BASELINE_PERSISTENCE_OWNER_CONTRACT_V1.md` + writer/service + migration/tests + PG17 | CURRENT ACCEPTED OWNER CONTRACT - BASELINE PERSISTENCE - UNNUMBERED | CURRENT_ACCEPTED / DURABLE_OPERATIONAL_IDENTITY | NONE |
| Experiment VARIANT structural lineage admission / unnumbered | YES | YES | `I5_EXPERIMENT_VARIANT_LINEAGE_ADMISSION_OWNER_CONTRACT_V1.md` + `experiment.ts` + runtime test + CI | CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT LINEAGE ADMISSION - UNNUMBERED | CURRENT_ACCEPTED / STRUCTURAL_LINEAGE_ONLY | NONE |
| Experiment VARIANT persistence / unnumbered | YES | YES | `I5_EXPERIMENT_VARIANT_PERSISTENCE_OWNER_CONTRACT_V1.md` + writer/service + migration + static tests + PostgreSQL 17 functional matrix | CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT VARIANT PERSISTENCE - UNNUMBERED | CURRENT_ACCEPTED / DURABLE_VARIANT_LINEAGE | NONE |
| ExperimentParameters scientific identity / unnumbered | YES | YES | `I5_EXPERIMENT_PARAMETERS_OWNER_CONTRACT_V1.md` + `experimentParameters.ts` + runtime tests + architecture boundary + CI | CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT PARAMETERS - UNNUMBERED | CURRENT_ACCEPTED / SCIENTIFIC_IDENTITY | NONE |
| Experiment Scientific Closure / unnumbered | YES | YES | `I5_EXPERIMENT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` + runtime + migration + static tests + PostgreSQL 17 scientific closure rehearsal | CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT SCIENTIFIC CLOSURE - UNNUMBERED | CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE | NONE |
| Dataset & Run Scientific Closure / unnumbered | YES | YES | `I5_DATASET_RUN_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` + runtime + writer/service + migration + PostgreSQL 17 functional rehearsal | CURRENT ACCEPTED OWNER CONTRACT - DATASET & RUN SCIENTIFIC CLOSURE - UNNUMBERED | CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE | NONE |
| Research Execution Engine design freeze / unnumbered | NO | YES | `I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md` + `I5_RESEARCH_EXECUTABLE_FIELD_SEMANTICS_V1.md` + `I5_RESEARCH_METRIC_REGISTRY_V1.md` + contract tests + CI | CURRENT ACCEPTED DESIGN CONTRACT - RESEARCH EXECUTION ENGINE FREEZE - UNNUMBERED | CURRENT_ACCEPTED / DESIGN_FREEZE | NONE |
| Research Execution Closure / unnumbered | YES | YES | `I5_RESEARCH_EXECUTION_CLOSURE_OWNER_CONTRACT_V1.md` + runtime + writer/service + migration + runtime tests + real PostgreSQL 17 rehearsal | CURRENT ACCEPTED OWNER CONTRACT - RESEARCH EXECUTION CLOSURE - UNNUMBERED | CURRENT_ACCEPTED / RESEARCH_EXECUTION_CLOSURE | NONE |
| RL-1 Evidence Object Scientific Closure / unnumbered | YES | YES | `I5_RL1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md` + Evidence runtime + writer finalization + migration + runtime tests + real PostgreSQL 17 rehearsal | CURRENT ACCEPTED OWNER CONTRACT - RL-1 EVIDENCE OBJECT SCIENTIFIC CLOSURE - UNNUMBERED | CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE | NONE |
| RL-2 Evidence Ledger and Passport / unnumbered | YES | YES | `I5_RL2_EVIDENCE_LEDGER_PASSPORT_OWNER_CONTRACT_V1.md` + Passport reader/service + read-authority migration + runtime tests + real PostgreSQL 17 rehearsal | CURRENT ACCEPTED OWNER CONTRACT - RL-2 EVIDENCE LEDGER AND PASSPORT V1 - UNNUMBERED | CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT | NONE |
| RL-3A Validation Protocol Foundation / unnumbered | YES | YES | `I5_RL3_VALIDATION_PROTOCOL_OWNER_CONTRACT_V1.md` + Validation Protocol runtime/tests + architecture boundaries + CI; no persistence, migration, RLS or SQL | CURRENT ACCEPTED OWNER CONTRACT - RL-3A VALIDATION PROTOCOL FOUNDATION - UNNUMBERED | CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION | NONE |
| RL-3B Validation Child Execution / unnumbered | YES | YES | owner contract + runtime + writer/service + migration + authority/runtime tests + real PostgreSQL 17 rehearsal | CURRENT ACCEPTED OWNER CONTRACT - RL-3B VALIDATION CHILD EXECUTION V1 - UNNUMBERED | CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION | NONE |

RL-1 runtime/progression state:

- design: `YES`.
- implementation: `YES`.
- state: `CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE`.
- permanent A-number: `NONE`.

RL-2 runtime/progression state:

- design: `YES`.
- implementation: `YES`.
- state: `CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT`.
- permanent A-number: `NONE`.

RL-3A runtime/progression state:

- design: `YES`.
- implementation: `YES`.
- state: `CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION`.
- permanent A-number: `NONE`.

`I5_MATERIAL_COMMAND_IDENTITY_V1.md` is not evidence of A1/A2/A4 persistence
owner-contract presence. Its header says candidate owner contract with
deterministic runtime and no persistence authority; it owns only material
command identity for its stated operations and does not own ResearchSpec
implementation.

A5 acceptance evidence:

- Accepted correction SHA:
  `4fa0aa28344949f7f3d4e2d97c1528175a17e0c6`.
- Trust Recovery predecessor:
  `2096c2a9ff4f3e15fa4031693ea5e17de4829ea8`.
- The benchmark discriminator is fixed fail-closed before benchmark-specific
  canonicalization.
- Valid A5 golden hash remains unchanged:
  `265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F`.
- Functional CI passed: tests, lint, TypeScript, build and Vercel verification.
- Dependency/security Trust Recovery blocker is closed by the accepted
  dependency correction recorded below.

Old correction candidate `2e88cde07e2f38dfc455e0a928adb709474f8af7` is
`SUPERSEDED_UNACCEPTED_CANDIDATE` and is not current authority.

Experiment BASELINE acceptance evidence:

- Predecessor:
  `81859bcbd34b79da649e6fd2c00bdab06337712a`.
- Accepted audited candidate:
  `81dc43cc0bc802565801e89e0f3a750029583b1d`.
- Experiment targeted: `7/7`.
- Relevant I5 targeted: `83/83`.
- TypeScript: `PASS`.
- Lint: `PASS`.
- Build: `PASS`.
- npm audit: `0 vulnerabilities`.
- Controlled full suite reproduced exactly the same 12 canonical failures already
  present in the predecessor.
- Candidate-specific regression: `ZERO`.
- Independent audit: `PASS`.
- Permanent A-number: `NOT ASSIGNED`.

Experiment BASELINE persistence acceptance evidence:

- Technical audited candidate:
  `cce1587664c4a1210c829fe1fbf8c1ce2ef68abe`.
- Canonical predecessor/base:
  `d59ff24de9c91d41702dd9c0de20b0a31eb9ff6e`.
- PR: `#67`.
- PG17 workflow: `35135567882`.
- PG17 job: `104926948515`.
- CI workflow: `35135567823`.
- PostgreSQL: `17.11`.
- Static reconciliation: `6/6 PASS`.
- PG17 rehearsal: `4/4 PASS`, no skip.
- Functional RLS transition matrix: `PASS`.
- CI: `SUCCESS`.
- Vercel: `SUCCESS`.
- Independent audit: `PASS`.
- Permanent A-number: `NOT ASSIGNED`.

`EXPERIMENT BASELINE PERSISTENCE = CURRENT_ACCEPTED / UNNUMBERED`.

Experiment BASELINE persistence supersession:

- This persistence acceptance supersedes the assumption that admitted Experiment
  BASELINE has no durable operational identity or persistence authority.
- It does not supersede Experiment structural admission, A1-A5, future VARIANT,
  DatasetSnapshot, Run/Result/Evidence, Paper, Trading, or Investing Core.

At Experiment BASELINE acceptance time, DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`; that historical limitation is now superseded by accepted Dataset & Run Scientific Closure.

Experiment VARIANT structural lineage admission acceptance evidence:

- Canonical predecessor:
  `34f6ab4f5c8a4c5049b14e6466d86a773701c0ba`.
- Audited candidate:
  `a46018b733d82dbaa22ff0971c82abf4d446d52a`.
- CI:
  `35140170597`.
- Vercel:
  `SUCCESS`.
- Independent audit:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.

`EXPERIMENT VARIANT STRUCTURAL LINEAGE ADMISSION = CURRENT_ACCEPTED / UNNUMBERED`.

Experiment VARIANT persistence acceptance evidence:

- Canonical predecessor:
  `580a05429959f324e496dc465af642dc31baabdc`.
- Final audited candidate:
  `27c70c3cd786ad4d1dc5c98d9d0e72a728cbf512`.
- PR:
  `#69`.
- CI:
  `35148779780`.
- PG17:
  `35148779758`.
- PG17 job:
  `104971476287`.
- PostgreSQL:
  `17.11`.
- Static:
  `6/6 PASS`.
- PG17:
  `6/6 PASS`.
- VARIANT matrix:
  `PASS`.
- Vercel:
  `SUCCESS`.
- Independent audit:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.

`EXPERIMENT VARIANT PERSISTENCE = CURRENT_ACCEPTED / UNNUMBERED`.

Experiment VARIANT persistence supersession:

- This persistence acceptance supersedes only the previous assumption that
  accepted VARIANT structural admission has no durable persistence authority.
- Superseded prior-state sentence:
  Experiment VARIANT persistence remains `DEFERRED / NOT ACCEPTED`.
- It does not supersede BASELINE structural admission, BASELINE persistence,
  VARIANT structural admission, A1-A5, ExperimentParameters scientific
  identity, future ExperimentParameters persistence, DatasetSnapshot,
  Run/Result/Evidence, Paper, Trading, or Investing Core.

ExperimentParameters scientific identity acceptance evidence:

- Canonical predecessor:
  `399b731ce36db339b9720b091940d00da620261d`.
- Accepted technical candidate:
  `c4999b53146d4d873bf916fbd8e975acb2071328`.
- CI:
  `35247704728`.
- Vercel:
  `SUCCESS`.
- Architecture boundary:
  `27/27 PASS`.
- ExperimentParameters runtime:
  `8/8 PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.

`EXPERIMENT PARAMETERS SCIENTIFIC IDENTITY = CURRENT_ACCEPTED / SCIENTIFIC_IDENTITY / UNNUMBERED`.

ExperimentParameters scientific identity boundaries:

- ExperimentParameters scientific identity is accepted.
- Experiment Scientific Closure is accepted separately and establishes
  scientific Experiment identity plus durable VARIANT ExperimentParameters
  hash-envelope persistence.
- Standalone raw ExperimentParameters payload persistence is NOT yet
  implemented.
- Current scientific closure can distinguish same-parent VARIANTs when their
  accepted scientific identity differs, including ExperimentParameters HashRef
  differences.
- At ExperimentParameters acceptance time, DatasetSnapshot remains deferred; that historical limitation is now superseded by accepted Dataset & Run Scientific Closure.

ExperimentParameters scientific identity supersession:

- This acceptance supersedes only the prior assumption that
  `SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = DECLARED_BUT_HASHING_DISABLED`.
- It does not supersede A5 Research IR authority, BASELINE structural
  admission, BASELINE persistence, VARIANT structural admission, VARIANT
  persistence, ResearchSpec, Experiment Scientific Closure, DatasetSnapshot,
  Run/Result/Evidence, Paper, Trading or Investing Core.

Experiment Scientific Closure acceptance evidence:

- Technical candidate:
  `59575f91bd276d607ca286a6dd1d485d3f68c497`.
- Original implementation base:
  `b10fed247ebeb04a43ff5dcda3a1e6040bf14148`.
- Current canonical `main` predecessor at acceptance time:
  `87e3083a5e3b8a95c65adf115f76a2aa7e2218d3`.
- PR:
  `#71`.
- CI:
  `35361968564`.
- PG17:
  `35361968472`.
- PostgreSQL:
  `17.11`.
- Static reconciliation:
  `6/6 PASS`.
- Existing Genesis/I5 PG17 rehearsal:
  `6/6 PASS`.
- Dedicated Experiment Scientific Closure PG17 rehearsal:
  `3/3 PASS`.
- Integrated RLS + sibling/chained scientific identity matrix:
  `PASS`.
- Vercel:
  `SUCCESS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production Supabase migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.

`EXPERIMENT SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE / UNNUMBERED`.

Experiment Scientific Closure supersession:

- Supersedes the prior limitation that scientific Experiment identity was not
  yet accepted.
- Supersedes the prior limitation that current VARIANT persistence could not
  distinguish same-parent variants solely by ExperimentParameters.
- Does not by itself supersede standalone raw ExperimentParameters payload
  persistence deferral, Run execution lifecycle, Result/Evidence, Paper,
  Trading or Investing Core.
- The later Dataset & Run Scientific Closure is now separately accepted and
  supersedes only those Dataset/Run scientific-input deferrals; it does not
  reopen or alter the accepted Experiment scientific payloads.

Dataset & Run Scientific Closure acceptance evidence:

- Canonical predecessor:
  `acd6cf5140bf044281b04381456f8c4fc7e98e88`.
- Final independently audited technical candidate:
  `9cdc89a052dd76b8ed58eb52c434672c4f05ec65`.
- PR:
  `#74`.
- CI:
  `35453698054` — `SUCCESS`.
- PG17:
  `35453698064` — `SUCCESS`.
- PostgreSQL:
  `17.11`.
- Existing Experiment Scientific Closure PG17 rehearsal:
  `3/3 PASS`.
- Dedicated Dataset/Run Scientific Closure PG17 rehearsal:
  `5/5 PASS`.
- Vercel:
  `SUCCESS`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production Supabase migration application:
  `APPLIED IN A4_TO_RL-3B PRODUCTION CATCH-UP`.

`DATASET & RUN SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE / UNNUMBERED`.

Accepted golden scientific hashes:

- DatasetSeries: `87C9363E3E5EF9B055F9DF76FDB51C60EBA2A64D50B78FEB66339EFC06BCF382`.
- DatasetSnapshot: `61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E`.
- MetricRequestSet: `547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2`.
- ExecutionConfig: `B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210`.
- ResearchSpec: `7F6BD62D54BC1AD6305F0B39974FC2D7D1DA5D93F03C8082D0E909DD68CC8A3D`.
- RunInput: `D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749`.

Hash states now:

`SYNTRAKE:RESEARCH_IR:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:RESEARCH_SPEC:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:EXPERIMENT:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:EXPERIMENT_PARAMETERS:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:DATASET_SERIES:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:DATASET_SNAPSHOT:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:METRIC_REQUEST_SET:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:EXECUTION_CONFIG:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:RUN_INPUT:V1`
= `PREIMAGE_ENVELOPE_EXACT`

`SYNTRAKE:RESULT:V1`
= `OWNER_PAYLOAD_EXACT`

`SYNTRAKE:EVIDENCE_OBJECT:V1`
= `CONTENT_PREIMAGE_EXACT`

`SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1`
= `DECLARED_BUT_HASHING_DISABLED`

## What This Gate Record Supersedes

This gate record supersedes:

- the prior A5 `OPEN_CORRECTION` trust state;
- the prior A5 `CANDIDATE` owner-contract header;
- the old unaccepted correction path
  `2e88cde07e2f38dfc455e0a928adb709474f8af7`.

This A5 gate record did not by itself supersede or close:

- repository control-plane RED state;
- the `main` default-branch issue;
- missing rulesets/protection;
- any future Research Lab slice.

This gate record does not establish a global Trusted Genesis Baseline.

## Repository Control Plane

Independently verified external-state evidence for this control-plane Trust
Recovery acceptance record:

- GitHub default branch: `main`.
- Control-plane convergence baseline:
  `216bec5e09bfa81a771048f1d693210942f02368`.
- Genesis lineage now occupies `main` and the existing Genesis canonical alias at
  that baseline.
- Prior disconnected `main` was preserved at:
  `archive/disconnected-main-pre-control-plane-20260913`.
- Archived SHA:
  `67393626c3bd3dbb7c18a4ff7235f9ea06f93e13`.
- Existing Genesis canonical alias:
  `design/i5-research-lab-canonical-20260906`.
- A5 Trust Recovery predecessor canonical:
  `2096c2a9ff4f3e15fa4031693ea5e17de4829ea8`.
- Canonical ruleset: `Syntrake Canonical Branch Guard`.
- Canonical ruleset ID: `23141231`.
- Historical archive ruleset: `Syntrake Historical Archive Guard`.
- Historical archive ruleset ID: `23141335`.
- Both rulesets: `ACTIVE`.
- Bypass actors: none.
- Canonical refs prohibit deletion and non-fast-forward updates.
- Canonical refs require linear history.
- Canonical refs require status checks: `verify`, `dependency-audit`, `Vercel`.
- Historical archive ref prohibits deletion and non-fast-forward updates.

`REPOSITORY CONTROL PLANE = GREEN / TRUST_RECOVERY_CLOSED`.

Historical/candidate branches do not become authority merely by existing.
Current authority is derived from accepted Genesis lineage, the current-state
map and protected canonical refs.

This control-plane acceptance record superseded active `REPOSITORY CONTROL PLANE = RED`,
disconnected active `main`, empty rulesets and unprotected canonical refs. At
the time of that control-plane acceptance it did not by itself establish the
final A+B+C rehearsal, Trusted Genesis Baseline, future Research Lab work,
Run execution/Result/Evidence or any Investing/Trading/Paper feature authority.

The post-merge full rehearsal is now recorded in
`TRUSTED_GENESIS_BASELINE_REHEARSAL_20260920.md` against merged `main`
`a93dbb9e3c7c548efa8066cc680f64e0d2b05403`, with exact tree
`e1bfdd8a67429ff33b4d5d425fba4b68ce688446`.

Rehearsal evidence currently records:

- A. `EXECUTION REHEARSAL = PASS`
- B. `CANONICAL INTEGRITY REHEARSAL = PASS`
- C. `REPOSITORY CONTROL PLANE REHEARSAL = PASS`

This rehearsal evidence passed its own CI and independent audit and is now the
current accepted global Genesis trust baseline. This declaration is a trust and
lineage statement only; it does not broaden the accepted product boundaries
listed above.

Trusted Genesis Baseline acceptance evidence:

- Final independently audited rehearsal candidate:
  `e93aa20187d99ec00de9d31a822f1bf86b2f297a`.
- PR:
  `#77`.
- Candidate push CI:
  `35507509732 - SUCCESS`.
- Candidate pull-request CI:
  `35507511846 - SUCCESS`.
- Candidate full suite:
  `1159 passed / 36 skipped`.
- Vercel preview deployment:
  `dpl_4a3wJYV8h2GMkp2Gzk12g7x9vG34 - READY`.
- Independent auditor verdict:
  `PASS`.
- Permanent A-number:
  `NOT ASSIGNED`.
- Production mutation at Trusted Genesis Baseline acceptance time:
  `NONE`.
- Production Supabase migration application at Trusted Genesis Baseline
  acceptance time:
  `NOT PERFORMED`.

`TRUSTED GENESIS BASELINE = CURRENT_ACCEPTED`.

## CI And Dependency Security

Dependency/security Trust Recovery predecessor:
`342659c2d92ccb6d5e0143b10fe13643864d771c`.

Accepted dependency correction:
`774b3503f768ad3805684b4834ddbb7ffd899679`.

Closed findings:

- Next.js `16.3.0 -> 16.3.5`.
- `@next/third-parties` `16.3.0 -> 16.3.5`.
- Transitive sharp `0.35.3 -> 0.35.4`.
- Full dependency audit: `0 vulnerabilities`.
- Production dependency audit: `0 vulnerabilities`.
- GitHub Actions CI: `SUCCESS`.
- Vercel: `SUCCESS`.

Classification:

`DEPENDENCY SECURITY TRUST RECOVERY = CLOSED`.

This dependency/security gate superseded only
`PRE-EXISTING SECURITY BASELINE - TRUST RECOVERY BLOCKER` for the known
Next.js/sharp findings. At the time of that dependency/security acceptance it
did not by itself supersede repository control-plane RED, the disconnected
Genesis/main histories, missing rulesets/protection, the final A+B+C rehearsal or
Trusted Genesis Baseline declaration. The control-plane limitations were closed
separately, and the current full-rehearsal candidate is recorded above.

## Superseded Historical Design

The following old active-tree documents were superseded by current accepted
contracts and are removed by this hygiene slice after invariant transfer:

```text
I3A_IMPLEMENTATION_CHECKPOINT.md
I3B_IMPLEMENTATION_CHECKPOINT.md
I5A_RESEARCH_LAB_DOMAIN_DESIGN.md
I5A_RESEARCH_LAB_DESIGN_DECISIONS_V1.md
I5A_RESEARCH_LAB_DESIGN_AUDIT_AND_AMENDMENTS_V1.md
I5A_RESEARCH_CANONICAL_TYPES_V1.md
I5A_RESEARCH_IR_HASH_CONTRACT_V1.md
I5A_AUTHORITY_SCOPE_CONTRACT_V1.md
I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V1.md
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V2.md
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V3.md
I5A_CANONICAL_BYTES_HASH_PREIMAGES_V1.md
I5A_CANONICAL_BYTES_HASH_PREIMAGES_AMENDMENT_V1.md
```

They remain available through Git history only.
