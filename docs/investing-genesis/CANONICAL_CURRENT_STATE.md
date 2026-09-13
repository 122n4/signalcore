# Syntrake Investing Genesis - Canonical Current State

Status: `CURRENT STATE MAP - HYGIENE CANDIDATE`

This document is a concise operational map. It is not a new Bible and it does
not create feature authority.

## Lineage

- Zero-Genesis retirement baseline:
  `87c19fd5ebadcc5b20ce587c185346379fd8d96b`.
- Hygiene slice predecessor:
  `9e341accb7658cbc9bff7cb749be4acc1437ad6c`.
- Pre-Genesis Investing documents, source and migrations are historical lineage
  only unless a current accepted Genesis contract explicitly incorporates them.
- Supabase migrations remain historical replay assets. Do not delete, rename,
  reorder, squash or rewrite them in a hygiene slice.

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

`I4C_RECONCILIATION.md` remains required historical lineage because accepted I4
freeze/master evidence still relies on its narrow classifications.

## Current Implementation Map

- Authority context: `lib/investing/authority/context.ts`.
- I5 canonical primitives and scientific hash domain admission:
  `lib/investing/research/canonical.ts`.
- I5 material command request identity:
  `lib/investing/research/materialRequest.ts`.
- I5 semantic Draft/Hypothesis/Spec candidate runtime:
  `lib/investing/research/semantic.ts`.
- I5 Investigation persistence: `lib/investing/research/investigationWriter.ts`.
- I5 Draft persistence: `lib/investing/research/draftWriter.ts`.
- I5 material revision persistence:
  `lib/investing/research/materialRevisionWriter.ts`.
- I5 Spec revision persistence:
  `lib/investing/research/researchSpecRevisionWriter.ts`.
- I5 Research IR runtime: `lib/investing/research/researchIr.ts`.

Trading research modules under `lib/trading/research` are Trading-owned and do
not become Investing Genesis authority merely because they use similar words.

## Gate State

- Zero-Genesis retirement: canonical baseline preserved.
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
- DatasetSnapshot: deferred. It has no current A-number and no current Investing
  Genesis owner contract.

## I5 Runtime Presence And Trust State

Implementation presence is not the same as formal trust recovery acceptance.
Physical canonical lineage is not the same fact as a dedicated owner contract.

| Slice | Runtime/persistence present | Dedicated current owner contract present | Current authority/evidence surface | Document/header status | Gate/trust classification | Known blocker |
| --- | --- | --- | --- | --- | --- | --- |
| I5-A1 Investigation persistence/current runtime | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A1 persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A2 ResearchDraft persistence/current runtime | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A2 persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A3 material revisions | YES | YES | `I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md` + runtime/persistence migration/tests + canonical lineage | CURRENT CONSOLIDATED OWNER CONTRACT | current in canonical lineage / consolidated | none recorded here |
| I5-A4 ResearchSpec persistence | YES | NO | canonical runtime + persistence migration/tests + canonical lineage | no dedicated A4 ResearchSpec persistence owner contract in tree | current in canonical lineage | none recorded here |
| I5-A5 Research IR runtime/owner contract | YES | YES | `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` + runtime/tests + canonical lineage | CANDIDATE | PRESENT_IN_CANONICAL_LINEAGE / OPEN_CORRECTION / NOT_TRUST_RECOVERY_ACCEPTED | benchmark type discriminator |

`I5_MATERIAL_COMMAND_IDENTITY_V1.md` is not evidence of A1/A2/A4 persistence
owner-contract presence. Its header says candidate owner contract with
deterministic runtime and no persistence authority; it owns only material
command identity for its stated operations and does not own ResearchSpec
implementation.

A5 repository evidence at predecessor `9e341accb7658cbc9bff7cb749be4acc1437ad6c`:

- `lib/investing/research/researchIr.ts` is physically present in the canonical
  Genesis lineage.
- `SYNTRAKE:RESEARCH_IR:V1` is physically admitted by current canonical runtime.
- `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` exists but still labels itself as a
  candidate owner contract.
- `canonicalBenchmarkV1()` requires an open correction so benchmark admission
  first fails closed unless `input.type === "BENCHMARK"`.
- Correction candidate `2e88cde07e2f38dfc455e0a928adb709474f8af7` is
  `UNACCEPTED`.

Therefore this state map does not claim A5 is formally accepted, and it does
not claim A5 is absent from canonical. It records A5 as
`PRESENT_IN_CANONICAL_LINEAGE / OPEN_CORRECTION / NOT_TRUST_RECOVERY_ACCEPTED`.

DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`.

## Repository Control Plane

Read-only external-state evidence for this hygiene correction:

- GitHub default branch: `main`.
- `main` is disconnected from Genesis canonical lineage.
- `git merge-base origin/main 9e341accb7658cbc9bff7cb749be4acc1437ad6c`
  returns no common ancestor.
- GitHub repository rulesets: empty.
- Genesis canonical branch protection: disabled.

`REPOSITORY CONTROL PLANE = RED / REQUIRES SEPARATE OWNER-AUTHORIZED GATE`.

This hygiene slice records that state only. It does not change default branch,
rulesets, branch protection or remote branch topology.

## CI And Dependency Baseline

The GitHub Actions run for hygiene candidate
`2cc97f6a4a63c9aadd3ae55933718126a9fe773d` failed after the functional verify
stage. Independent audit classified the functional stage as passing: full tests,
lint, TypeScript, build and hygiene regression passed.

Known dependency/security audit failures are:

- Next.js `16.3.0`, affected range `16.0.0 - 16.3.2`, CRITICAL.
- sharp `<0.35.4`, HIGH.

Classification:

`PRE-EXISTING SECURITY BASELINE - TRUST RECOVERY BLOCKER`.

This hygiene correction does not modify dependencies and must not report CI as
green while that blocker remains.

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
