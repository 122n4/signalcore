# I5 RL-8 Scientific Promotion State Machine V1 Implementation Closure Owner Contract

Status: CURRENT ACCEPTED OWNER CONTRACT - RL-8 SCIENTIFIC PROMOTION STATE MACHINE V1 IMPLEMENTATION CLOSURE - UNNUMBERED

Classification:
`CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`

Canonical predecessor / implementation merge anchor:
`0ad330bca67a3cfe5fee8de42036f09925f48087`

Final independently audited implementation candidate:
`cd0a7aa9c95593aa11c0f3ce459af97d8c7fca42`

Implementation PR:
`#121`

Runtime implementation:
`PRESENT / CURRENT ACCEPTED`

Production migration:
`APPLIED / POST-APPLY AUDITED`

Supabase Production:
`RL-8 MIGRATIONS APPLIED / POST-APPLY AUDITED`

Permanent A-number:
`NOT ASSIGNED`

## Purpose

This owner contract closes RL-8 Scientific Promotion State Machine V1 after
runtime implementation, PostgreSQL 17 reconciliation, managed-Supabase preview,
merge to main, explicitly authorized Production application and post-apply
audit.

The historical RL-8 design document and RL-8C persistence design contract remain
immutable historical evidence of their original candidate slices. Their
`CANDIDATE / NOT ACCEPTED` and `WIP / NOT ACCEPTED` headers are not rewritten.
This implementation closure is the current acceptance authority.

Git merge alone was not acceptance. CI green alone was not acceptance. A direct
SQL proof alone was not acceptance. Current acceptance is based on the
cumulative evidence recorded below.

## Current Accepted Scope

RL-8 owns deterministic scientific promotion-state governance for one exact
research subject:

`Experiment HashRef + ExperimentParameters HashRef + Research IR HashRef`

within server-derived tenant and Investigation authority.

Accepted runtime surfaces include:

- `lib/investing/research/scientificPromotion.ts`;
- `lib/investing/research/scientificPromotionEngine.ts`;
- RL-8 exports from `lib/investing/research/index.ts`;
- the frozen RL-8 scientific promotion protocol and transition canonical forms;
- deterministic evaluation-plan construction from accepted evidence;
- exact Stage-A plus closure semantics;
- deterministic supersession semantics and immutable chain reconstruction.

Accepted scientific domains are exactly:

- `SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1`;
- `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1`.

No third RL-8 scientific HashRef domain is admitted by this closure.

## Accepted State Machine Boundary

The accepted state vocabulary is:

```text
DRAFT_RESEARCH
EXECUTED
INSUFFICIENT_EVIDENCE
VALIDATION_FAILED
VALIDATION_PASSED
PROMOTION_ELIGIBLE
REJECTED
SUPERSEDED
```

`PROMOTION_ELIGIBLE` is scientific-governance evidence only.

It is not:

- an investment recommendation;
- suitability;
- portfolio allocation authority;
- Paper authorization;
- capital authorization;
- Live authorization;
- broker instruction;
- Capital Kernel approval.

The accepted closure preserves fail-closed authority and evidence behavior.
Caller claims do not replace accepted persisted Evidence, Validation Assessment
or RL-7 robustness evidence.

## Deterministic Closure Semantics

The accepted atomic closure pairs are:

```text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
VALIDATION_FAILED -> REJECTED
```

Stage A plus its required closure is atomic. A committed orphan
`VALIDATION_PASSED` or `VALIDATION_FAILED` without its required closure is
forbidden.

`INSUFFICIENT_EVIDENCE` remains a single Stage-A transition with no fabricated
closure.

`SUPERSEDED` is the terminal promotion-chain state in V1. Cross-chain
supersession binds the successor protocol HashRef and successor root transition
HashRef, requires exact same tenant / Investigation / scientific subject,
requires a different protocol, rejects dangling or self references and prevents
cycles.

## Persistence Authority

The accepted Git migration files are exactly:

- `20261004120000_investing_i5_rl8c1_scientific_promotion_schema_authority.sql`;
- `20261007120000_investing_i5_rl8c2_scientific_promotion_writers.sql`;
- `20261007143000_investing_i5_rl8c3_scientific_promotion_supersession_writer.sql`.

They establish:

- exactly two append-only RL-8 scientific relations;
- RLS + FORCE RLS;
- dedicated `investing_rl8_writer`;
- owner-exact narrow SECURITY DEFINER authority;
- canonical database hash verification;
- immutable transition history;
- atomic Stage-A/closure integrity;
- supersession integrity;
- fail-closed reconstruction.

The four accepted mutation entry points are:

- `investing.persist_research_scientific_promotion_protocol_v1(text,jsonb)`;
- `investing.persist_research_scientific_promotion_root_v1(text,jsonb)`;
- `investing.persist_research_scientific_promotion_evaluation_plan_v1(uuid,text,jsonb,text,jsonb)`;
- `investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)`.

The accepted read-only reconstruction helper is:

- `investing.reconstruct_research_scientific_promotion_chain_v1(uuid)`.

The obsolete three-argument supersession overload is absent.

All accepted RL-8 privileged functions audited by this closure are owned by
`investing_rl8_writer`, are `SECURITY DEFINER`, and use
`search_path=pg_catalog`.

## Managed Supabase Role Boundary

The managed-Supabase deployment path requires temporary deployment capability
without leaving runtime privilege behind.

Post-apply Production state proves:

- `investing_rl8_writer` is `NOLOGIN`;
- `NOINHERIT`;
- `NOSUPERUSER`;
- `NOCREATEDB`;
- `NOCREATEROLE`;
- `NOREPLICATION`;
- `NOBYPASSRLS`;
- no final `CREATE` on schema `investing`;
- no `investing_owner`, `investing_app` or `service_role` membership in the writer role;
- no residual postgres self-grant;
- the pre-existing `supabase_admin` grant to postgres remains with
  `SET=false` and `INHERIT=false`.

`investing_app` has EXECUTE on the accepted public RL-8 API only.
`PUBLIC`, `anon`, `authenticated` and `service_role` have no accepted
RL-8 mutation EXECUTE authority. Internal helpers are not exposed to
`investing_app`.

## Verification Evidence

Final implementation candidate:
`cd0a7aa9c95593aa11c0f3ce459af97d8c7fca42`.

Implementation PR:
`#121`.

Implementation merge/main anchor:
`0ad330bca67a3cfe5fee8de42036f09925f48087`.

PR checks on the exact candidate:

- CI: `#1517 / SUCCESS`;
- Investing Supabase Reconciliation PG17: `#175 / SUCCESS`;
- RL-8C3 PG17: `26 / 26 PASS`;
- real two-independent-connection identical/divergent concurrency: `PASS`;
- Vercel status: `SUCCESS`;
- PR mergeable before merge: `YES`;
- unresolved review threads: `NONE`.

Disposable managed-Supabase preview rehearsal against the then-current Production
baseline:

- RL-8C1: `PASS`;
- RL-8C2: `PASS`;
- RL-8C3: `PASS`;
- preview post-apply ACL/owner/RLS/trigger audit: `PASS`;
- preview branch deleted after rehearsal: `YES`.

Production application:

- explicit owner authorization: `YES`;
- Supabase project: `qdnvbamoamtkujzwrxdb`;
- RL-8C1 Production ledger version:
  `20261009043031 investing_i5_rl8c1_scientific_promotion_schema_authority`;
- RL-8C2 Production ledger version:
  `20261009043034 investing_i5_rl8c2_scientific_promotion_writers`;
- RL-8C3 Production ledger version:
  `20261009043037 investing_i5_rl8c3_scientific_promotion_supersession_writer`;
- exact three-migration application: `PASS`;
- post-apply audit: `PASS`;
- Security Advisor RL-8 findings: `ZERO`;
- Performance Advisor RL-8 findings:
  `18 unindexed_foreign_keys INFO + 16 auth_rls_initplan WARN / NON-BLOCKING`;
- RL-8 protocol rows after application: `0`;
- RL-8 transition rows after application: `0`;
- scientific row mutation by deployment: `NONE`;
- financial row mutation by deployment: `NONE`.

The performance findings are recorded technical hardening work, not evidence of
a scientific or security-contract failure. This closure does not silently alter
the frozen RL-8 authority policies or add speculative indexes merely to make an
advisor clean.

Acceptance implementation status:
`CURRENT_ACCEPTED / PRODUCTION GATE PASSED / POST-APPLY AUDITED`

Fresh exact-candidate real PG17 execution:
`PASS / POSTGRESQL 17`

## Production Boundary

The Production gate applied exactly the three accepted RL-8 migration files from
the merged implementation to Supabase project `qdnvbamoamtkujzwrxdb`.

The application was schema / RLS / function / trigger authority work. It
created no RL-8 scientific rows and mutated no financial rows.

Production alignment is now:

`RL-8 CURRENT_ACCEPTED = RL-8 PRODUCTION MIGRATIONS APPLIED / POST-APPLY AUDITED`

## Downstream Boundary

RL-8 does not implement Blind Truth / Evidence Vault.

RL-9 remains the next Research Lab closure.

RL-8 does not create autonomous investment execution, recommendation,
suitability, portfolio allocation, Paper, Live or capital authority.

RL-10 still owns future headless research orchestration.

RL-11 still owns the full I5 rehearsal / backend closure gate.

The Research Lab therefore advances to:

`I5 RESEARCH LAB = IN_PROGRESS / RL-9_TO_RL-11 / PRODUCT_UI_DEFERRED`

It is not yet `BACKEND_COMPLETE`.

## Canonical Acceptance

This owner contract plus the canonical current-state sync is the dedicated
current acceptance authority for RL-8.

Historical candidate documents remain historical evidence and are not rewritten
as if their earlier slices had been accepted at the time.

`I5 RL-8 SCIENTIFIC PROMOTION STATE MACHINE V1 IMPLEMENTATION CLOSURE = CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`
