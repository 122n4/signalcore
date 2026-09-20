# I5 RL-2 Evidence Ledger And Passport Owner Contract V1

State: `IMPLEMENTED_CANDIDATE / NOT CURRENT_ACCEPTED / UNNUMBERED`

Classification: `CANDIDATE / RL-2_EVIDENCE_LEDGER_PASSPORT / UNNUMBERED`

Parent accepted program: `I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md`

## Authority

RL-2 introduces the dedicated internal read operation `RESEARCH_PASSPORT_READ_V1` with capability `RESEARCH_READ`.

The authorized context is `AuthorizedResearchPassportReadContext`. It binds authenticated principal, tenant, tenant membership, research investigation, operation, capability, operation scope, source context, correlation ID, and, when the Investigation is account-scoped, exact account and account-access IDs.

Investigation authority is resolved from authenticated identity plus canonical Investigation ownership. Caller-supplied tenant, principal, membership, account, account-access, operation, capability, scope, or source authority is rejected.

Tenant-scoped Investigations admit `TENANT_SCOPE` with `PURE_RESEARCH` or `TEST_PORTFOLIO` and no account/account-access binding. Account-scoped Investigations admit `ACCOUNT_SCOPE` with `USER_PORTFOLIO` and exact account/account-access binding.

## Sources

Passport V1 is a deterministic read projection over accepted canonical records, including:

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

The Passport is not a new scientific authority, not duplicated persistence, and not a new hash domain.

## Projection Semantics

`ResearchPassportV1` has schema version `RESEARCH_PASSPORT_V1`.

It reconstructs one Investigation's read history across Investigation identity, current pointer convenience state, material revision lineage, ResearchSpec revisions, BASELINE/VARIANT Experiments, RunInputs, operational Runs, Run lifecycle events, Results, Evidence Objects, and a projected Evidence Ledger.

Current pointers are exposed only as convenience state. Historical revisions, Experiments, Runs, Results, and Evidence remain visible even when pointer state changes or operational execution is repeated.

Reads run in one `investing_app` transaction using a repeatable-read read-only snapshot where supported by the repository transport.

## Evidence Ledger

The Evidence Ledger V1 is generated from canonical rows at read time. It is not an event store and not a financial ledger.

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

## Deterministic Ordering

Arrays are sorted explicitly. Ledger events sort by persisted timestamp, semantic phase order, canonical sequence when present, and stable source record ID. The projection does not include `generatedAt`, random IDs, wall-clock values, provider calls, or request ordering.

## Integrity Invariants

Passport construction fails closed when canonical lineage is impossible, including:

- material predecessor outside the same root
- duplicate material revision number per root/kind
- Experiment parent missing from the same Investigation projection
- ResearchSpec predecessor missing, cross-root, cyclic, or duplicate revision number
- ResearchSpec source Draft/Hypothesis material binding missing or hash-mismatched
- RunInput bound to missing Experiment or ResearchSpec revision
- malformed Run lifecycle sequence; allowed visible histories are `[REGISTERED]`, `[REGISTERED, STARTED]`, `[REGISTERED, STARTED, SUCCEEDED]`, and `[REGISTERED, STARTED, FAILED]`
- SUCCEEDED Run without Result
- Result bound to another RunInput
- Result artifact hidden or missing
- Evidence bound to another Result or RunInput
- SUCCEEDED Run without Evidence after RL-1

The read transport proof is enforced: Passport construction fails closed unless `current_user` and `current_role` are both exactly `investing_app`.

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

## PostgreSQL 17 Acceptance Requirements

Acceptance requires a fresh PostgreSQL 17 migration rehearsal through the RL-2 migration, proof of `show server_version`, proof that real reads execute as `current_user = investing_app` and `current_role = investing_app`, a seeded Investigation with material revisions, Experiments, RunInput, successful repeated execution, Result, Evidence, failed execution, and isolation against another Investigation/authority boundary.

The RLS matrix must prove valid `RESEARCH_PASSPORT_READ_V1` visibility and invalid-context invisibility for wrong operation, capability, tenant, principal, membership, Investigation, operation scope, source context, tenant-scope account fields, account-scope account, and account-scope account access. It must also prove `RESEARCH_READ` does not grant INSERT, UPDATE, or DELETE.

## Supersession

WHAT DID THIS SLICE SUPERSEDE?

RL-2 supersedes the limitation that current accepted Research records can only be inspected separately and there is no canonical Investigation-level Evidence Ledger/Passport projection.

It does not supersede any scientific source object, Evidence Object, Result, RunInput, Experiment, material revision, financial ledger, audit log, Paper, Core, or Capital Kernel. Passport derives from accepted records. It does not replace them.

## Production

Production migration status for this candidate is `NOT APPLIED`.

Production migration-history reconciliation remains separate.
