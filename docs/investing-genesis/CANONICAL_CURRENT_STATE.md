# Syntrake Investing Genesis - Canonical Current State

Status: `CURRENT CANONICAL STATE MAP`

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
| I5-A5 Research IR runtime/owner contract | YES | YES | `I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md` + runtime/tests + canonical lineage | CURRENT ACCEPTED OWNER CONTRACT | CURRENT_ACCEPTED / TRUST_RECOVERY_CLOSED | NONE |

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

DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`.

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

This control-plane acceptance record supersedes active `REPOSITORY CONTROL PLANE = RED`,
disconnected active `main`, empty rulesets and unprotected canonical refs. It
does not supersede final A+B+C rehearsal, Trusted Genesis Baseline declaration,
future Research Lab work, DatasetSnapshot deferral or any Investing/Trading/Paper
feature requirement.

Final complete rehearsal across:

- A. `EXECUTION REHEARSAL`
- B. `CANONICAL INTEGRITY REHEARSAL`
- C. `REPOSITORY CONTROL PLANE REHEARSAL`

has not yet been completed against the final candidate state.

`TRUSTED GENESIS BASELINE = NOT YET DECLARED`.

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

This dependency/security gate supersedes only
`PRE-EXISTING SECURITY BASELINE - TRUST RECOVERY BLOCKER` for the known
Next.js/sharp findings. It does not supersede repository control-plane RED,
default branch `main`, disconnected Genesis/main histories, missing rulesets,
missing branch protection, final A+B+C rehearsal or Trusted Genesis Baseline
declaration.

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
