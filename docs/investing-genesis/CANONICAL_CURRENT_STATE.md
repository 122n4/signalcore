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
  are historical lineage and are removed from the current source tree by the
  source-purge candidate based on `main` `860b521578b77cb3d4ae4651ae7719fbad7e1f04`.
- Git history remains the historical record. The Zero-Genesis retirement bridge
  migrations and current Genesis/I5 migrations remain in the active tree.
- This source-tree purge does not mutate, rewrite, repair or reconcile production
  Supabase migration history. Production migration-history reconciliation is a
  separate controlled operation and remains unauthorized by this candidate.

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
  Experiment scientific hash-envelope persistence without changing production
  Supabase.

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
  only; it does not claim Evidence, Paper, broker, Live, Capital Kernel, UI, an
  A-number or production migration application.

Trading research modules under `lib/trading/research` are Trading-owned and do
not become Investing Genesis authority merely because they use similar words.

## Gate State

- Zero-Genesis retirement: canonical baseline preserved.
- Pre-Genesis Investing migration source purge: `IMPLEMENTED_CANDIDATE`; exactly
  53 pre-Genesis Investing migrations removed from the current tree while the
  Zero-Genesis retirement bridge, Genesis/I5 migrations and Trading migrations
  remain present. Production Supabase state is unchanged by this source commit.
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
  Evidence remains outside acceptance. Production Supabase has not received the
  Dataset/Run closure migration.
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
  Live, UI or USER_PORTFOLIO/account execution. Production Supabase migration
  application remains `NOT PERFORMED`.

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
  `NOT PERFORMED`.

`I5 RESEARCH EXECUTION CLOSURE = CURRENT_ACCEPTED / UNNUMBERED`.

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
  `NOT PERFORMED`.

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
  `NOT PERFORMED`.

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
- Production mutation:
  `NONE`.
- Production Supabase migration application:
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
