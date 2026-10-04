# I5 RL-8C Scientific Promotion Persistence Contract V1 Design Freeze

Status: WIP DESIGN FREEZE CANDIDATE - RL-8C SCIENTIFIC PROMOTION PERSISTENCE CONTRACT V1 - NON-CANONICAL

Classification:
`WIP / RL-8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1 / DESIGN_FREEZE_CANDIDATE`

Mode:
`STACKED WIP / DESIGN FREEZE / NO DATABASE MUTATION`

Canonical predecessor stack:

```text
RL-8B deterministic engine TECHNICAL_PASS = a39d785e279b5239988279433751e54b7f275c02
RL-8A corrected technical predecessor = ec691bbf4b1c47d4e909b2b2ba14d13a9e7e6bec
RL-8 Design Freeze = 333e77f550a40b374a49764f58cc61276c6c965e
```

Branch:
`wip/i5-rl8c-persistence-contract-20261004`

Acceptance:
`NOT ACCEPTED`

Runtime:
`NOT IMPLEMENTED BY THIS SLICE`

Migration:
`NONE`

Supabase mutation:
`NONE`

Production mutation:
`NONE`

This document freezes the executable PostgreSQL persistence contract for RL-8 scientific promotion history. It creates no SQL, no migration, no table, no function, no trigger, no Supabase branch, no Production mutation and no Passport mutation. The next migration slices MUST implement this contract mechanically without introducing material architecture decisions.

The design follows current post-Genesis Investing patterns only. Pre-Genesis Investing migrations are historical lineage only. Current verified baseline is PostgreSQL `17`; current accepted RL-7 writers are `SECURITY INVOKER`, owned by `investing_owner`, use a safe explicit search path, and current scientific relations are owned by `investing_owner` with `RLS = true` and `FORCE RLS = true`. Zero-row current data is not a correctness dependency.

## 1. Persistence principles

RL-8C persistence MUST enforce these principles:

- append-only scientific transition history;
- immutable accepted scientific identities;
- canonical protocol HashRef persistence;
- canonical transition HashRef persistence;
- server-derived tenant authority;
- server-derived Investigation authority;
- no client ownership authority;
- `service_role` is not authorization;
- RLS + FORCE RLS on every RL-8C relation;
- minimum grants only;
- no public/anon/authenticated/service_role mutation authority;
- no mutable current truth row as scientific authority;
- reconstruction comes only from immutable root -> unique successor -> leaf history;
- operational row UUIDs are not scientific identity;
- canonical payload remains the scientific authority and relational columns must agree with it.

## 2. Exact database object set

The exact minimum RL-8C object set is:

```text
investing.research_scientific_promotion_protocols_scientific_identities
investing.research_scientific_promotion_transitions_scientific_identities
```

There are exactly two RL-8 scientific HashRef domains:

```text
SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1
SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1
```

No third RL-8 scientific HashRef domain is admitted. There is no mutable active pointer table, no latest table, no current-state table and no convenience table. Operational UUID primary keys are `NON_SCIENTIFIC_OPERATIONAL` and exist only for relational authority, locking, FK and RLS enforcement.

## 3. Protocol identity relation contract

Relation name:

```text
investing.research_scientific_promotion_protocols_scientific_identities
```

Primary key:

```text
research_scientific_promotion_protocol_identity_id uuid primary key default gen_random_uuid()
```

Columns are exact:

```text
research_scientific_promotion_protocol_identity_id uuid
operation text check = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
capability text check = 'RESEARCH_MUTATE'
operation_scope text check = 'TENANT_SCOPE'
source_context text check = 'PURE_RESEARCH'
hash_algorithm text check = 'SHA-256'
hash_domain text check = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
hash_version text check = 'SYNTRAKE_SHA256_V1'
hash_hex text check ~ '^[0-9A-F]{64}$'
canonical_payload jsonb not null
created_at timestamptz not null default transaction_timestamp()
```

Protocol operational persistence is reusable across tenants and Investigations because the protocol canonical payload contains no tenant, principal, membership, Investigation or subject. Authority metadata MUST NOT be part of protocol scientific identity. Therefore this relation intentionally has no tenant columns. It is a global immutable protocol identity table owned by `investing_owner`, protected by RLS/FORCE RLS and writer grants only to `investing_app` under the protocol-create operation.

Uniqueness constraints are exact:

```text
unique (hash_algorithm, hash_domain, hash_version, hash_hex)
unique ((canonical_payload->>'protocolToken')) where hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
```

Payload checks MUST prove:

```text
canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V1'
canonical_payload->>'protocolToken' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002'
hash_algorithm = 'SHA-256'
hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
hash_version = 'SYNTRAKE_SHA256_V1'
hash_hex ~ '^[0-9A-F]{64}$'
```

## 4. Transition identity relation contract

Relation name:

```text
investing.research_scientific_promotion_transitions_scientific_identities
```

Primary key:

```text
research_scientific_promotion_transition_identity_id uuid primary key default gen_random_uuid()
```

Exact authority and identity columns:

```text
research_scientific_promotion_transition_identity_id uuid
tenant_id uuid not null
principal_id uuid not null
tenant_membership_id uuid not null
research_investigation_id uuid not null
research_scientific_promotion_protocol_identity_id uuid not null
protocol_hash_algorithm text check = 'SHA-256'
protocol_hash_domain text check = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
protocol_hash_version text check = 'SYNTRAKE_SHA256_V1'
protocol_hash_hex text not null check ~ '^[0-9A-F]{64}$'
subject_experiment_hash_algorithm text check = 'SHA-256'
subject_experiment_hash_domain text check = 'SYNTRAKE:EXPERIMENT:V1'
subject_experiment_hash_version text check = 'SYNTRAKE_SHA256_V1'
subject_experiment_hash_hex text not null check ~ '^[0-9A-F]{64}$'
subject_experiment_parameters_hash_algorithm text check = 'SHA-256'
subject_experiment_parameters_hash_domain text check = 'SYNTRAKE:EXPERIMENT_PARAMETERS:V1'
subject_experiment_parameters_hash_version text check = 'SYNTRAKE_SHA256_V1'
subject_experiment_parameters_hash_hex text not null check ~ '^[0-9A-F]{64}$'
subject_research_ir_hash_algorithm text check = 'SHA-256'
subject_research_ir_hash_domain text check = 'SYNTRAKE:RESEARCH_IR:V1'
subject_research_ir_hash_version text check = 'SYNTRAKE_SHA256_V1'
subject_research_ir_hash_hex text not null check ~ '^[0-9A-F]{64}$'
predecessor_transition_identity_id uuid null
predecessor_transition_hash_algorithm text null
predecessor_transition_hash_domain text null
predecessor_transition_hash_version text null
predecessor_transition_hash_hex text null
predecessor_state text not null
resulting_state text not null
transition_hash_algorithm text check = 'SHA-256'
transition_hash_domain text check = 'SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1'
transition_hash_version text check = 'SYNTRAKE_SHA256_V1'
transition_hash_hex text not null check ~ '^[0-9A-F]{64}$'
supersedes_transition_identity_id uuid null
supersedes_transition_hash_hex text null
rejected_transition_identity_id uuid null
rejected_transition_hash_hex text null
superseded_by_successor_protocol_identity_id uuid null
superseded_by_successor_protocol_hash_hex text null
superseded_by_successor_root_transition_identity_id uuid null
superseded_by_successor_root_transition_hash_hex text null
canonical_payload jsonb not null
created_at timestamptz not null default transaction_timestamp()
```

Exact upstream provenance operational columns are included on the transition table and are never scientific replacements for canonical HashRefs:

```text
run_input_identity_id uuid null
result_identity_id uuid null
evidence_object_identity_id uuid null
validation_protocol_identity_id uuid null
validation_result_identity_id uuid null
validation_assessment_protocol_identity_id uuid null
validation_assessment_result_identity_id uuid null
robustness_comparison_protocol_identity_id uuid null
robustness_comparison_result_identity_id uuid null
```

The canonical payload remains authority. Every non-null operational FK MUST correspond exactly to the HashRef in `canonical_payload->'evidenceSnapshot'`.

## 5. Upstream evidence provenance FK model

Persistence MUST NOT accept nine arbitrary HashRef strings. It must FK to accepted upstream operational rows in the same tenant authority and Investigation scope where those relations exist.

Exact mapping:

| Evidence key | Upstream table | Operational FK column | Nullability |
| --- | --- | --- | --- |
| runInput | `investing.research_run_inputs_scientific_identities` | `run_input_identity_id` | root/Stage A required, copied for Stage B/lifecycle |
| result | `investing.research_results_scientific_identities` | `result_identity_id` | root/Stage A required, copied for Stage B/lifecycle |
| evidenceObject | `investing.research_evidence_objects_scientific_identities` | `evidence_object_identity_id` | root null; Stage A optional only for `INSUFFICIENT_EVIDENCE`, required for pass/fail; copied for Stage B/lifecycle |
| validationProtocol | `investing.research_validation_protocols_scientific_identities` | `validation_protocol_identity_id` | root null; Stage A required; copied for Stage B/lifecycle |
| validationResult | `investing.research_validation_results_scientific_identities` | `validation_result_identity_id` | root null; Stage A required; copied for Stage B/lifecycle |
| validationAssessmentProtocol | `investing.research_validation_assessment_protocols_scientific_identities` | `validation_assessment_protocol_identity_id` | root null; Stage A required; copied for Stage B/lifecycle |
| validationAssessmentResult | `investing.research_validation_assessment_results_scientific_identities` | `validation_assessment_result_identity_id` | root null; Stage A required; copied for Stage B/lifecycle |
| robustnessComparisonProtocol | `investing.research_experiment_comparison_protocols_scientific_identities` | `robustness_comparison_protocol_identity_id` | root null; Stage A optional only for `INSUFFICIENT_EVIDENCE`, required for pass/fail; copied for Stage B/lifecycle |
| robustnessComparisonResult | `investing.research_experiment_comparison_results_scientific_identities` | `robustness_comparison_result_identity_id` | root null; Stage A optional only for `INSUFFICIENT_EVIDENCE`, required for pass/fail; copied for Stage B/lifecycle |

Every upstream FK MUST include the composite authority tuple and Investigation linkage supported by that upstream table, never row UUID alone. Required FK shape is:

```text
(upstream_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)
```

When an upstream relation includes parent lineage IDs such as `research_experiment_id`, `research_validation_protocol_identity_id`, or `research_validation_assessment_protocol_identity_id`, RL-8C MUST include those columns in the FK and in relational/canonical payload consistency checks.

ROOT (`EXECUTED`) admits only `runInput` and `result`; the seven later evidence operational references and canonical HashRefs MUST be null.

Stage A follows the RL-8 state presence matrix. `VALIDATION_PASSED` and `VALIDATION_FAILED` require all nine evidence keys non-null. `INSUFFICIENT_EVIDENCE` requires runInput, result, validationProtocol, validationResult, validationAssessmentProtocol and validationAssessmentResult; evidenceObject and RL-7 protocol/result may be null only when the canonical gate semantics make them unavailable or insufficient.

Stage B/lifecycle (`PROMOTION_ELIGIBLE`, `REJECTED`, `SUPERSEDED`) MUST copy predecessor evidence operational references and canonical evidenceSnapshot exactly.

## 6. Root uniqueness

Logical promotion chain key is exact:

```text
tenant_id
research_investigation_id
subject_experiment_hash_hex
subject_experiment_parameters_hash_hex
subject_research_ir_hash_hex
protocol_hash_hex
```

Exactly one authoritative root may exist for one chain key. Root exact scientific shape is:

```text
predecessorTransition = null
predecessorState = DRAFT_RESEARCH
resultingState = EXECUTED
```

PostgreSQL uniqueness mechanism:

```text
create unique index research_scientific_promotion_one_root_per_chain_key
on investing.research_scientific_promotion_transitions_scientific_identities (
  tenant_id,
  research_investigation_id,
  subject_experiment_hash_hex,
  subject_experiment_parameters_hash_hex,
  subject_research_ir_hash_hex,
  protocol_hash_hex
)
where predecessor_transition_identity_id is null;
```

Concurrent identical root creation returns `REUSED_IDENTICAL`. Concurrent or sequential divergent root creation for the same chain returns `DIVERGENT_EXISTING_IDENTITY`. This is enforced at PostgreSQL level by the partial unique index plus writer conflict comparison under advisory lock.

## 7. Single-successor invariant

For every non-root predecessor there may be at most one authoritative successor. `resultingState` is excluded from successor uniqueness.

Exact unique constraint/index:

```text
create unique index research_scientific_promotion_one_successor_per_predecessor
on investing.research_scientific_promotion_transitions_scientific_identities (
  tenant_id,
  research_investigation_id,
  predecessor_transition_identity_id
)
where predecessor_transition_identity_id is not null;
```

For one exact predecessor, identical canonical successor retry returns `REUSED_IDENTICAL`. Any second different state, hash, canonical payload, evidenceSnapshot, reasons or lifecycle link returns `DIVERGENT_EXISTING_IDENTITY`. Database concurrency permits only one winner through advisory locks plus this unique index.

## 8. Atomic Stage-A + closure pairs

Mandatory pairs are exact:

```text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
VALIDATION_FAILED -> REJECTED
```

They MUST persist atomically in one database transaction. Either both rows commit or neither row commits. `INSUFFICIENT_EVIDENCE` persists Stage A only.

Writer API for Stage A and closure is a single function:

```text
investing.persist_research_scientific_promotion_evaluation_plan_v1(
  p_predecessor_transition_identity_id uuid,
  p_stage_a_transition_hash_hex text,
  p_stage_a_canonical_payload jsonb,
  p_closure_transition_hash_hex text default null,
  p_closure_canonical_payload jsonb default null
) returns jsonb
```

Return JSONB shape:

```text
{
  status: 'CREATED' | 'REUSED_IDENTICAL',
  stageATransitionIdentityId: uuid,
  stageATransitionHashHex: text,
  closureTransitionIdentityId: uuid | null,
  closureTransitionHashHex: text | null
}
```

Conflict is raised as SQLSTATE `P0001` with message token `DIVERGENT_EXISTING_IDENTITY`.

## 9. Orphan intermediate DB impossibility

Chosen enforcement mechanism: a DEFERRABLE INITIALLY DEFERRED constraint trigger on `investing.research_scientific_promotion_transitions_scientific_identities` named:

```text
research_scientific_promotion_no_orphan_intermediate
```

The trigger function is:

```text
investing.enforce_research_scientific_promotion_no_orphan_intermediate_v1()
```

It is `SECURITY INVOKER`, owned by `investing_owner`, and uses `set search_path = pg_catalog`. It checks at commit time that every committed row with `resulting_state in ('VALIDATION_PASSED','VALIDATION_FAILED')` has exactly one successor row in the same tenant and Investigation:

```text
VALIDATION_PASSED successor resulting_state = PROMOTION_ELIGIBLE
VALIDATION_FAILED successor resulting_state = REJECTED
successor.predecessor_transition_identity_id = intermediate.research_scientific_promotion_transition_identity_id
successor.evidenceSnapshot = intermediate.evidenceSnapshot
successor lifecycle reference matches the intermediate HashRef where required
```

This survives direct SQL using `investing_app` grants because the invariant is enforced by a deferrable constraint trigger at commit. It does not rely on TypeScript convention and does not rely on a transaction-local custom GUC.

## 10. Writer API

Exact writer function names/signatures:

```text
investing.persist_research_scientific_promotion_protocol_v1(
  p_protocol_hash_hex text,
  p_canonical_payload jsonb
) returns jsonb

investing.persist_research_scientific_promotion_root_v1(
  p_research_investigation_id uuid,
  p_protocol_identity_id uuid,
  p_transition_hash_hex text,
  p_canonical_payload jsonb
) returns jsonb

investing.persist_research_scientific_promotion_evaluation_plan_v1(
  p_predecessor_transition_identity_id uuid,
  p_stage_a_transition_hash_hex text,
  p_stage_a_canonical_payload jsonb,
  p_closure_transition_hash_hex text default null,
  p_closure_canonical_payload jsonb default null
) returns jsonb

investing.persist_research_scientific_promotion_supersession_v1(
  p_predecessor_transition_identity_id uuid,
  p_superseded_transition_hash_hex text,
  p_superseded_canonical_payload jsonb,
  p_successor_protocol_identity_id uuid,
  p_successor_root_transition_identity_id uuid
) returns jsonb
```

Every writer returns `CREATED` or `REUSED_IDENTICAL`; divergent conflict is `DIVERGENT_EXISTING_IDENTITY`. UPSERT semantics are forbidden unless the writer verifies byte-identical canonical payload and exact HashRef identity before returning `REUSED_IDENTICAL`.

SUPERSEDED uses the separate writer above because it requires successor-chain traversal and cycle checks.

## 11. Writer security

All writers and trigger functions MUST be:

```text
SECURITY INVOKER
owner = investing_owner
set search_path = pg_catalog
all Investing relations fully qualified as investing.<relation>
```

No RL-8C routine may be `SECURITY DEFINER`. If a future implementation appears to require `SECURITY DEFINER`, implementation MUST STOP and report contradiction.

Exact EXECUTE grants:

```text
revoke all on function investing.persist_research_scientific_promotion_protocol_v1(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_scientific_promotion_root_v1(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_scientific_promotion_evaluation_plan_v1(uuid, text, jsonb, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function ... to investing_app;
```

`public`, `anon`, `authenticated`, and `service_role` have no writer EXECUTE authority.

## 12. Table grants and direct insert prevention

Because writers are `SECURITY INVOKER`, `investing_app` requires minimum table grants:

```text
grant select, insert on investing.research_scientific_promotion_protocols_scientific_identities to investing_app;
grant select, insert on investing.research_scientific_promotion_transitions_scientific_identities to investing_app;
```

No UPDATE grant and no DELETE grant exist. Direct INSERT by `investing_app` remains technically possible, therefore all material scientific invariants MUST be enforced by database constraints, FKs, RLS and triggers:

- root uniqueness by partial unique index;
- successor uniqueness by partial unique index excluding `resultingState`;
- atomic closure pair by deferrable constraint trigger;
- append-only by absence of UPDATE/DELETE grants plus reject trigger if a grant is accidentally introduced;
- authority scope by RLS policies and composite authority FKs;
- lifecycle linkage by FKs and payload check constraints;
- no orphan `VALIDATION_PASSED` or `VALIDATION_FAILED` by commit-time trigger;
- no arbitrary upstream HashRefs by required operational FKs.

Writer convention alone is not security.

## 13. RLS contract

Every RL-8C relation has RLS enabled and FORCE RLS enabled.

Operation vocabulary is exact:

```text
RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1
RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1
RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1
RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1
```

Capability:

```text
RESEARCH_MUTATE
```

Required request settings:

```text
syntrake.investing.operation
syntrake.investing.capability
syntrake.investing.tenant_id
syntrake.investing.principal_id
syntrake.investing.tenant_membership_id
syntrake.investing.research_investigation_id
```

Every policy MUST enforce operation, capability, tenant, principal, membership, Investigation, expected `TENANT_SCOPE`, and `PURE_RESEARCH`. No `auth.uid()` shortcut. No authenticated-role-only authorization.

Protocol table insert policy admits only `RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1` and `RESEARCH_MUTATE`; because protocol identity is global, it does not store tenant metadata but still requires an authorized current request context. Transition table policies require exact tenant, principal, membership and Investigation columns equal current settings.

## 14. Authority FKs

Protocol table has no authority FK because protocol scientific identity is global and reusable.

Transition rows MUST include:

```text
foreign key (tenant_membership_id, tenant_id, principal_id)
references investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)

foreign key (research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)
references investing.research_investigations (...same authority tuple...)
```

Every upstream evidence row FK must prove the same tenant, principal, membership and Investigation where current upstream schemas support the composite key. Row UUID alone is never trusted.

## 15. Append-only

Scientific protocol and transition rows are immutable.

```text
UPDATE authority = none
DELETE authority = none
```

Both tables MUST have BEFORE UPDATE OR DELETE triggers:

```text
investing.reject_research_scientific_promotion_update_delete_v1()
```

The trigger raises `MALFORMED_TRANSITION` for transition rows and `MALFORMED_PROTOCOL` for protocol rows. Direct UPDATE/DELETE negative tests are mandatory.

## 16. Canonical payload and structural checks

PostgreSQL does not reimplement the TypeScript canonical hashing engine. It MUST enforce structural checks that relational columns agree with canonical payload:

- `canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_TRANSITION_V1'` for transitions;
- protocol HashRef domain/version/hash equals protocol columns;
- subject Experiment HashRef equals `subject_experiment_hash_*` columns;
- subject Experiment Parameters HashRef equals `subject_experiment_parameters_hash_*` columns;
- subject Research IR HashRef equals `subject_research_ir_hash_*` columns;
- predecessor transition HashRef/null matches predecessor columns;
- predecessorState equals `predecessor_state`;
- resultingState equals `resulting_state`;
- lifecycle references `supersedes`, `rejectedTransition`, and `supersededByChain` match lifecycle columns;
- evidenceSnapshot HashRefs/nulls match the nine operational FK columns and upstream row hash columns;
- transition HashRef domain/version equals `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1` and `SYNTRAKE_SHA256_V1`;
- protocol token equals `SCIENTIFIC_PROMOTION_PROTOCOL_V20261002`.

A row whose relational provenance contradicts `canonical_payload` must not persist.

## 17. Hash identity

Hash identity uniqueness is exact:

```text
protocol: unique (hash_algorithm, hash_domain, hash_version, hash_hex)
transition: unique (tenant_id, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex)
```

Hash format is exact:

```text
SHA-256
SYNTRAKE_SHA256_V1
64 uppercase hex
```

No lowercase normalization at persistence time. Invalid hash fails closed.

## 18. SUPERSEDED contract

`SUPERSEDED` persistence freezes:

```text
supersedes
supersededByChain.successorProtocol
supersededByChain.successorRootTransition
```

Invariants:

- SUPERSEDED only from allowed stable leaves `PROMOTION_ELIGIBLE` or `REJECTED`;
- exact predecessor COPY semantics for evidenceSnapshot;
- successor protocol differs from old protocol;
- successor root exists;
- referenced successor is actually ROOT: `predecessorTransition = null`, `predecessorState = DRAFT_RESEARCH`, `resultingState = EXECUTED`;
- same tenant authority;
- same Investigation;
- same subject;
- no self-reference;
- no old-chain transition as successor root;
- one old chain -> at most one successor-chain link;
- identical link retry idempotent returns `REUSED_IDENTICAL`;
- divergent link conflict returns `DIVERGENT_EXISTING_IDENTITY`;
- no cycles.

Cycle prevention is frozen in `persist_research_scientific_promotion_supersession_v1`: before insert, the writer recursively traverses `supersededByChain.successorRootTransition` links with a recursive CTE under advisory locks. If the proposed successor root reaches the old chain root, the writer raises `DIVERGENT_EXISTING_IDENTITY`. A check trigger also verifies direct self-reference and same-chain references for direct SQL.

## 19. Reconstruction contract

Deterministic read semantics:

1. resolve unique root for chain key;
2. follow unique successor by `predecessor_transition_identity_id`;
3. continue until leaf;
4. zero successor = active leaf;
5. more than one successor = corrupt history / `DIVERGENT_EXISTING_IDENTITY`;
6. `VALIDATION_PASSED` or `VALIDATION_FAILED` as committed leaf = corrupt history;
7. `SUPERSEDED` leaf requires valid successor-chain reference and reconstruction continues at `supersededByChain.successorRootTransition`.

No timestamp choice, no `MAX(created_at)`, no insertion-order authority, no mutable latest pointer, no caller preference. Passport integration is later; schema must support this reconstruction exactly.

## 20. Concurrency contract

Lock strategy uses `pg_advisory_xact_lock` plus unique constraints as final defense.

Exact lock identities:

```text
protocol identity: hashtextextended('RL8C_PROTOCOL:' || p_protocol_hash_hex, 0)
root chain key: hashtextextended('RL8C_ROOT:' || tenant_id || ':' || research_investigation_id || ':' || subject_experiment_hash_hex || ':' || subject_experiment_parameters_hash_hex || ':' || subject_research_ir_hash_hex || ':' || protocol_hash_hex, 0)
predecessor successor slot: hashtextextended('RL8C_SUCCESSOR:' || tenant_id || ':' || research_investigation_id || ':' || predecessor_transition_identity_id, 0)
supersession link: hashtextextended('RL8C_SUPERSEDE:' || tenant_id || ':' || research_investigation_id || ':' || predecessor_transition_identity_id || ':' || successor_root_transition_identity_id, 0)
```

Lock ordering is exact:

```text
1. protocol identity
2. root chain key
3. predecessor successor slot
4. supersession link
5. upstream evidence rows, selected in lexical table-name order by table name and UUID
```

Writers must take only the locks required by their operation, in this order. Hash lock keys include server-derived tenant/Investigation scope for scoped operations and do not rely on client-supplied authority alone.

## 21. No-new-evidence and retry semantics

RL-8B rejects fresh same-protocol evaluation with unchanged evidenceSnapshot. Persistence enforces retry semantics separately:

- identical retry of the ORIGINAL transition request returns `REUSED_IDENTICAL`;
- it must not create a successor from the current leaf;
- a different successor for an already-consumed predecessor returns `DIVERGENT_EXISTING_IDENTITY`;
- evaluation no-new-evidence is not DB idempotent retry.

## 22. Future migration slices

Future implementation slices are frozen:

```text
RL-8C1: schema + authority + immutable protocol/transition identities + RLS/FORCE RLS + append-only triggers + structural payload checks.
RL-8C2: protocol/root/evaluation-plan writers + root uniqueness + single-successor uniqueness + atomic Stage-A/closure + orphan-intermediate constraint trigger + concurrency/idempotency tests.
RL-8C3: SUPERSEDED linkage writer + recursive cycle prevention + reconstruction integrity tests + read-only reconstruction helper contract.
```

No Passport mutation in RL-8C1/RL-8C2/RL-8C3. Passport integration requires a later explicit slice.

## 23. PostgreSQL 17 test matrix

The future executable migration MUST prove:

- clean migration replay on PostgreSQL 17;
- owner = investing_owner;
- RLS enabled;
- FORCE RLS enabled;
- forbidden grants absent;
- SECURITY DEFINER absent;
- writer search_path safe;
- exact protocol retry -> REUSED_IDENTICAL;
- divergent protocol -> conflict;
- exact root retry -> REUSED_IDENTICAL;
- concurrent identical roots -> one row / both deterministic results;
- concurrent divergent roots -> one winner / one DIVERGENT;
- exact Stage-A pair retry -> REUSED_IDENTICAL;
- concurrent identical Stage-A pair -> one pair only;
- concurrent divergent successor -> one winner / one DIVERGENT;
- VALIDATION_PASSED orphan commit -> impossible;
- VALIDATION_FAILED orphan commit -> impossible;
- pair rollback -> neither row remains;
- INSUFFICIENT Stage-A -> one row, no closure;
- wrong tenant -> blocked;
- wrong Investigation -> blocked;
- wrong membership -> blocked;
- service_role mutation -> blocked;
- anon/authenticated/public mutation -> blocked;
- UPDATE blocked;
- DELETE blocked;
- upstream HashRef without accepted operational row -> blocked;
- upstream row from wrong Investigation -> blocked;
- SUPERSEDED dangling root -> blocked;
- SUPERSEDED same protocol -> blocked;
- SUPERSEDED subject mismatch -> blocked;
- SUPERSEDED cycle -> blocked;
- reconstruction with multiple successors -> fail closed.

## 24. Production process

Sequence is frozen:

```text
contract accepted
-> migration created in Git
-> candidate SHA
-> disposable PostgreSQL 17 replay
-> negative/concurrency tests
-> RLS/security audit
-> Supabase preview/rehearsal
-> independent audit
-> explicit owner authorization
-> Production apply
```

Production migration MUST NOT happen from this design slice.

## 25. Forbidden stale wording

The contract does not permit optional writer behavior. The following are forbidden interpretations:

```text
implementation may choose
optional orphan prevention
best effort closure
latest row wins
service_role authorized writer
authenticated role owns rows
timestamp current state
mutable latest pointer
writer convention only
```

Any future text containing those meanings violates this freeze.