# I5 RL-2 Evidence Ledger And Passport Owner Contract V1

State: `CURRENT ACCEPTED OWNER CONTRACT - RL-2 EVIDENCE LEDGER AND PASSPORT V1 - UNNUMBERED`

Classification: `CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT / UNNUMBERED`

Parent accepted program: `I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md`

## Acceptance Provenance

- Technical candidate: `326feaf0c047c36a88a3be1c0cc71a573d75ffa5`.
- Canonical predecessor: `15444892a8b12bd53ec8e48d4162093482c4fa40`.
- PR: `#82`.
- CI: `35774520717 - SUCCESS`.
- Full suite: `216 passed / 18 skipped files`; `1192 passed / 43 skipped tests`.
- Lint: `PASS`.
- TypeScript: `PASS`.
- Production build: `PASS`.
- Dependency audit: `0 vulnerabilities`.
- PG17: `35774520535 - SUCCESS`.
- Historical PG17 job: `106904206482 - SUCCESS`.
- Cumulative compatibility PG17 job: `106904206842 - SUCCESS`.
- RL-2 dedicated PostgreSQL rehearsal: `7 / 7 PASS`.
- PostgreSQL: `17.11 (Debian 17.11-1.pgdg13+2)`.
- Vercel candidate: `READY / PREVIEW`.
- Production Supabase mutation: `NONE`.
- Production migration application: `NOT PERFORMED`.
- Cumulative compatibility repair production application: `NOT PERFORMED`.
- Production RL-2 migration application: `NOT PERFORMED`.
- Accepted RL-2 migration: `20260922192229_investing_i5_rl2_evidence_ledger_passport_read.sql`.
- Permanent A-number: `NOT ASSIGNED`.
- Independent auditor verdict: `PASS`.

## Authority

RL-2 introduces the dedicated internal read operation `RESEARCH_PASSPORT_READ_V1` with capability `RESEARCH_READ`.

The authorized context is `AuthorizedResearchPassportReadContext`. It binds authenticated principal, tenant, tenant membership, research investigation, operation, capability, operation scope, source context, correlation ID, and, when the Investigation is account-scoped, exact account and account-access IDs.

Investigation authority is resolved from authenticated identity plus canonical Investigation ownership. Caller-supplied tenant, principal, membership, account, account-access, operation, capability, scope, or source authority is rejected.

Tenant-scoped Investigations admit `TENANT_SCOPE` with `PURE_RESEARCH` or `TEST_PORTFOLIO` and no account/account-access binding. Account-scoped Investigations admit `ACCOUNT_SCOPE` with `USER_PORTFOLIO` and exact account/account-access binding.

The read transport proof is enforced: Passport construction fails closed unless `current_user` and `current_role` are both exactly `investing_app`.

## Sources

Passport V1 is a deterministic projection/read model over accepted canonical records, including:

- `research_investigations`
- `research_material_roots`
- `research_material_revisions`
- `research_material_pointer_states`
- `research_spec_revisions`
- `research_specs_scientific_identities`
- `research_experiments`
- `run_inputs_scientific_identities`
- `research_execution_runs`
- `research_execution_run_events`
- `research_result_artifacts`
- `research_results_scientific_identities`
- `research_evidence_objects_scientific_identities`

The Passport is not a new scientific authority, not duplicated persistence, not a Passport persistence table, and not a new hash domain.

## Projection Semantics

`ResearchPassportV1` has schema version `RESEARCH_PASSPORT_V1`.

It reconstructs one Investigation's read history across Investigation identity, current pointer convenience state, material revision lineage, ResearchSpec revisions, BASELINE/VARIANT Experiments, RunInputs, operational Runs, Run lifecycle events, Results, Evidence Objects, and a projected Evidence Ledger.

Current pointers are exposed only as convenience state. Historical revisions, Experiments, Runs, Results, and Evidence remain visible even when pointer state changes or operational execution is repeated.

Reads run in one `investing_app` transaction using a repeatable-read read-only snapshot where supported by the repository transport.

RL-2 preserves Result/Evidence reuse visibility across distinct operational Runs. Repeated Runs remain operationally distinct even when they share the same scientific Result and Evidence identity.

## Evidence Ledger

The Evidence Ledger V1 is generated from canonical rows at read time. It is not an event store, not a financial ledger, and not an independent scientific hash identity.

Closed event vocabulary:

- `INVESTIGATION_CREATED`
- `MATERIAL_REVISION_CREATED`
- `RESEARCH_SPEC_REVISION_CREATED`
- `EXPERIMENT_BASELINE_CREATED`
- `EXPERIMENT_VARIANT_CREATED`
- `RUN_INPUT_MATERIALIZED`
- `RUN_REGISTERED`
- `RUN_STARTED`
- `RUN_SUCCEEDED`
- `RUN_FAILED`
- `RESULT_AVAILABLE`
- `EVIDENCE_AVAILABLE`

Each event includes event kind, source table, source record ID, Investigation ID, relevant parent IDs, accepted scientific HashRefs where present, canonical event sequence where present, failure reason where present, and persisted occurrence time.

Material revision ledger events may expose scientific HashRefs only for accepted material domains:

- `DRAFT -> SYNTRAKE:RESEARCH_DRAFT:V1`
- `HYPOTHESIS -> SYNTRAKE:HYPOTHESIS:V1`

`RESEARCH_SPEC` revisions expose `SYNTRAKE:RESEARCH_SPEC:V1` only when an accepted row exists in `research_specs_scientific_identities`. The Passport distinguishes revision existence from scientific identity materialization with machine-readable `MATERIALIZED` and `NOT_MATERIALIZED` states.

`NO_HYPOTHESIS` is a valid ResearchSpec state. In that state Passport exposes `hypothesisRevisionId = null` and `hypothesisMaterialHash = null`, and the Evidence Ledger omits `hypothesisRevisionId` from relevant parent IDs.

## Deterministic Ordering

Arrays are sorted explicitly. Ledger events sort by persisted timestamp, semantic phase order, canonical sequence when present, and stable source record ID. The projection does not include `generatedAt`, random IDs, wall-clock values, provider calls, or request ordering.

## Integrity Invariants

Passport construction fails closed when canonical lineage is impossible, including:

- material predecessor outside the same root
- duplicate material revision number per root/kind
- Experiment parent missing from the same Investigation projection
- ResearchSpec predecessor missing, cross-root, cyclic, or duplicate revision number
- ResearchSpec source Draft/Hypothesis material binding missing or hash-mismatched
- malformed, duplicate, or ambiguous ResearchSpec scientific identity
- ResearchSpec scientific identity envelope outside `SHA-256 / SYNTRAKE:RESEARCH_SPEC:V1 / SYNTRAKE_SHA256_V1`
- ResearchSpec scientific identity payload drift from its source Draft or optional Hypothesis binding
- RunInput bound to missing Experiment or ResearchSpec revision
- RunInput ResearchSpec scientific hash drift
- RunInput Research IR binding drift
- RunInput Experiment binding drift
- RunInput requiring a missing materialized ResearchSpec scientific identity
- malformed Run lifecycle sequence; allowed visible histories are `[REGISTERED]`, `[REGISTERED, STARTED]`, `[REGISTERED, STARTED, SUCCEEDED]`, and `[REGISTERED, STARTED, FAILED]`
- SUCCEEDED Run without Result
- Result bound to another RunInput
- Result artifact hidden or missing
- Evidence bound to another Result or RunInput
- SUCCEEDED Run without Evidence after RL-1

Cross-tenant, cross-principal and cross-membership Investigation access is externally denied as `FORBIDDEN_OR_NOT_FOUND`.

The pending PG17 reaudit must prove `RESEARCH_PASSPORT_READ_V1 / RESEARCH_READ` visibility and invalid-context invisibility across `research_specs_scientific_identities`, `run_inputs_scientific_identities`, `research_execution_runs`, `research_execution_run_events`, `research_result_artifacts`, `research_results_scientific_identities`, and `research_evidence_objects_scientific_identities`.

`RESEARCH_READ` grants no mutation authority.

Typed internal failure codes distinguish unavailable future layers from corrupt accepted lineage.

## Future Layers

RL-3 validation, RL-8 scientific promotion, and RL-9 blind truth are intentionally unavailable in this slice:

- `validation.availability = DEFERRED_RL3`
- `scientificPromotion.availability = DEFERRED_RL8`
- `blindTruth.availability = DEFERRED_RL9`

Absence of future authority is not an empty successful scientific result.

## Out Of Scope

RL-2 does not implement OOS/walk-forward validation, validation methodology, Engine V2, runtime Engine V2, Metric V2, robustness/overfit, promotion state machine, Blind Truth, orchestration, product API, UI, Paper, broker, Capital Kernel, Live, Monte Carlo, stress/scenario analysis, allocation, suitability, Strategy DNA, Strategy Autopsy, optimizer, Trading Research, or pre-Genesis scientific memory.

`ENGINE_V20260918` is unchanged by this contract.

## PostgreSQL 17 Acceptance

The accepted rehearsal used PostgreSQL `17.11 (Debian 17.11-1.pgdg13+2)`.

The accepted PG17 proof showed real reads executing as `current_user = investing_app` and `current_role = investing_app`, a seeded Investigation with material revisions, Experiments, RunInput, successful repeated execution, Result, Evidence, failed execution, account-scoped Passport support, same-owner Investigation control, foreign authority denial, full execution/scientific RLS matrix, and mutation denial under `RESEARCH_READ`.

## Supersession

WHAT DID THIS SLICE SUPERSEDE?

RL-2 supersedes the limitation that current accepted Research records can only be inspected separately and there is no canonical Investigation-level Evidence Ledger/Passport projection.

It does not supersede any scientific source object, Evidence Object, Result, RunInput, Experiment, material revision, financial ledger, audit log, Paper, Core, or Capital Kernel. Passport derives from accepted records. It does not replace them.

## Production

Production Supabase mutation: `NONE`.

Production migration application: `NOT PERFORMED`.

Production RL-2 migration application: `NOT PERFORMED`.

Permanent A-number: `NOT ASSIGNED`.

Production migration-history reconciliation remains separate.

`I5 RL-2 EVIDENCE LEDGER AND PASSPORT V1 = CURRENT_ACCEPTED / UNNUMBERED`
