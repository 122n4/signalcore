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

Acceptance: `NOT ACCEPTED`
Runtime: `NOT IMPLEMENTED BY THIS SLICE`
Migration: `NONE`
Supabase mutation: `NONE`
Production mutation: `NONE`

This document freezes the executable PostgreSQL persistence contract for RL-8 scientific promotion history. It creates no SQL, no migration, no table, no function, no trigger, no Supabase branch, no Production mutation and no Passport mutation.

## 1. Persistence principles

RL-8C persistence MUST enforce append-only scientific transition history, immutable accepted scientific identities, canonical protocol HashRef persistence, canonical transition HashRef persistence, server-derived tenant authority, server-derived Investigation authority, no client ownership authority, `service_role` is not authorization, RLS + FORCE RLS on every RL-8C relation, minimum grants only, no public/anon/authenticated/service_role mutation authority, no mutable current truth row as scientific authority, reconstruction only from immutable root -> unique successor -> leaf history, operational row UUIDs are not scientific identity, canonical payload remains scientific authority, and database canonical hash verification is mandatory.

## 2. Exact database object set

Exact object set:

```text
investing.research_scientific_promotion_protocols_scientific_identities
investing.research_scientific_promotion_transitions_scientific_identities
```

Exactly two RL-8 scientific domains:

```text
SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1
SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1
```

No third RL-8 scientific HashRef domain is admitted. Operational UUID primary keys are `NON_SCIENTIFIC_OPERATIONAL`. There is no mutable active pointer table, no latest table, no current-state table and no convenience table.

## 3. Protocol identity relation contract

Relation name:
`investing.research_scientific_promotion_protocols_scientific_identities`

Primary key:
`research_scientific_promotion_protocol_identity_id uuid primary key default gen_random_uuid()`

Exact columns:

```text
research_scientific_promotion_protocol_identity_id uuid
operation text check = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'
capability text check = 'RESEARCH_MUTATE'
operation_scope text check = 'TENANT_SCOPE'
source_context text check = 'PURE_RESEARCH'
hash_algorithm text check = 'SHA-256'
hash_domain text check = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
hash_version text check = 'SYNTRAKE_SHA256_V1'
hash_hex text check = '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C'
canonical_payload jsonb not null
created_at timestamptz not null default transaction_timestamp()
```

Protocol operational persistence is reusable across tenants and Investigations because the protocol canonical payload contains no tenant, principal, membership, Investigation or subject. Authority metadata MUST NOT be part of protocol scientific identity. Therefore this relation intentionally has no tenant columns. It is a global immutable protocol identity table.

V1 protocol payload exactness:

```text
schemaVersion = SCIENTIFIC_PROMOTION_PROTOCOL_V1
protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002
hashHex = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C
```

Arbitrary additional protocol keys are rejected. Missing protocol keys are rejected. The protocol writer must verify the exact frozen payload shape from the accepted RL-8A canonical runtime. The protocol payload field is `protocolId`.

Uniqueness constraints:

```text
unique (hash_algorithm, hash_domain, hash_version, hash_hex)
unique ((canonical_payload->>'protocolId')) where hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
```

Payload checks MUST prove `canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V1'`, `canonical_payload->>'protocolId' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002'`, and hash hex equals `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`.

## 4. Transition identity relation contract

Relation name:
`investing.research_scientific_promotion_transitions_scientific_identities`

Primary key:
`research_scientific_promotion_transition_identity_id uuid primary key default gen_random_uuid()`

Exact authority, operation and identity columns include:

```text
research_scientific_promotion_transition_identity_id uuid
operation text not null check (operation in ('RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1','RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1','RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1'))
capability text not null check = 'RESEARCH_MUTATE'
operation_scope text not null check = 'TENANT_SCOPE'
source_context text not null check = 'PURE_RESEARCH'
tenant_id uuid not null
principal_id uuid not null
tenant_membership_id uuid not null
research_investigation_id uuid not null
research_experiment_id uuid not null
research_scientific_promotion_protocol_identity_id uuid not null
protocol_hash_hex text not null check = '122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C'
subject_experiment_hash_hex text not null check ~ '^[0-9A-F]{64}$'
subject_experiment_parameters_hash_hex text not null check ~ '^[0-9A-F]{64}$'
subject_research_ir_hash_hex text not null check ~ '^[0-9A-F]{64}$'
predecessor_transition_identity_id uuid null
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

`research_experiment_id` is `NON_SCIENTIFIC_OPERATIONAL` provenance for the stable subject Experiment.

For every one of the nine evidenceSnapshot classes, the transition relation stores operational ID and hash:

```text
run_input_identity_id uuid null
run_input_hash_hex text null
result_identity_id uuid null
result_hash_hex text null
evidence_object_identity_id uuid null
evidence_object_hash_hex text null
validation_protocol_identity_id uuid null
validation_protocol_hash_hex text null
validation_result_identity_id uuid null
validation_result_hash_hex text null
validation_assessment_protocol_identity_id uuid null
validation_assessment_protocol_hash_hex text null
validation_assessment_result_identity_id uuid null
validation_assessment_result_hash_hex text null
robustness_comparison_protocol_identity_id uuid null
robustness_comparison_protocol_hash_hex text null
robustness_comparison_result_identity_id uuid null
robustness_comparison_result_hash_hex text null
```

For every evidence class: transition relational hash == canonical_payload evidenceSnapshot HashRef.hashHex == accepted upstream row hash_hex. Operational UUID alone is never sufficient. No arbitrary HashRef string may survive without a matching accepted upstream row.
## 5. Subject Experiment operational binding

The accepted `investing.research_experiments` relation is the operational proof for the stable scientific subject. RL-8C1 MUST add or verify this compatibility unique key on `investing.research_experiments`:

```text
unique (
  research_experiment_id,
  research_investigation_id,
  tenant_id,
  principal_id,
  tenant_membership_id,
  operation_scope,
  source_context,
  experiment_hash_hex,
  experiment_parameters_hash_hex,
  research_ir_hash_hex
)
```

The transition row MUST FK to that exact tuple. This proves `subjectExperiment`, `subjectExperimentParameters` and `subjectResearchIr` against an accepted operational Experiment row under the exact same authority and Investigation.

## 6. Investigation authority compatibility key

RL-8C1 MUST add or verify this compatibility unique key before RL-8 transition FKs use it:

```text
create unique index research_investigations_rl8c_authority_tuple_key
on investing.research_investigations (
  research_investigation_id,
  tenant_id,
  principal_id,
  tenant_membership_id,
  operation_scope,
  source_context
);
```

Transition rows MUST FK to this exact tuple. Row-UUID-only Investigation FK is forbidden.

## 7. Exact upstream evidence provenance FK model

Persistence MUST NOT accept nine arbitrary HashRef strings. Each evidence class has an exact FK path. The listed compatibility keys that do not already exist MUST be created in RL-8C1. No generic placeholder wording is permitted.

| Evidence key | Upstream table | Required compatibility key / FK tuple | Key status |
| --- | --- | --- | --- |
| runInput | `investing.run_inputs_scientific_identities` | `(run_input_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_COMPATIBILITY_INDEX_REQUIRED` |
| result | `investing.research_results_scientific_identities` | `(result_identity_id, run_input_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` and same `run_input_identity_id` as the transition runInput FK proves Investigation transitively | `RL8C1_COMPATIBILITY_INDEX_REQUIRED` |
| evidenceObject | `investing.research_evidence_objects_scientific_identities` | `(evidence_object_identity_id, run_input_identity_id, result_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_COMPATIBILITY_INDEX_REQUIRED` |
| validationProtocol | `investing.research_validation_protocols_scientific_identities` | `(validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `EXISTING_OR_RL8C1_VERIFY_REQUIRED` |
| validationResult | `investing.research_validation_results_scientific_identities` | `(validation_result_identity_id, validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `EXISTING_OR_RL8C1_VERIFY_REQUIRED` |
| validationAssessmentProtocol | `investing.research_validation_assessment_protocols_scientific_identities` | `(research_validation_assessment_protocol_identity_id, research_investigation_id, validation_protocol_identity_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `EXISTING_OR_RL8C1_VERIFY_REQUIRED` |
| validationAssessmentResult | `investing.research_validation_assessment_results_scientific_identities` | `(research_validation_assessment_result_identity_id, research_validation_assessment_protocol_identity_id, validation_result_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_COMPATIBILITY_INDEX_REQUIRED` |
| robustnessComparisonProtocol | `investing.research_experiment_comparison_protocols_scientific_identities` | `(research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `EXISTING_OR_RL8C1_VERIFY_REQUIRED` |
| robustnessComparisonResult | `investing.research_experiment_comparison_results_scientific_identities` | `(research_experiment_comparison_result_identity_id, research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_COMPATIBILITY_INDEX_REQUIRED` |

The Result FK proves Investigation transitively through the same `run_input_identity_id` already bound to `investing.run_inputs_scientific_identities`. The Evidence Object FK proves Investigation transitively through the same `run_input_identity_id` and `result_identity_id`. All other rows prove Investigation directly through their compatibility key.

ROOT (`EXECUTED`) admits only `runInput` and `result`; the seven later evidence operational references and canonical HashRefs MUST be null. Stage B/lifecycle (`PROMOTION_ELIGIBLE`, `REJECTED`, `SUPERSEDED`) MUST copy predecessor evidence operational references and canonical evidenceSnapshot exactly.

## 8. Root uniqueness and single successor

Logical promotion chain key is exact:

```text
tenant_id
research_investigation_id
subject_experiment_hash_hex
subject_experiment_parameters_hash_hex
subject_research_ir_hash_hex
protocol_hash_hex
```

Root exact scientific shape is `predecessorTransition = null`, `predecessorState = DRAFT_RESEARCH`, `resultingState = EXECUTED`.

PostgreSQL root uniqueness:

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

For every non-root predecessor there may be at most one authoritative successor. `resultingState` is excluded from successor uniqueness.

```text
create unique index research_scientific_promotion_one_successor_per_predecessor
on investing.research_scientific_promotion_transitions_scientific_identities (
  tenant_id,
  research_investigation_id,
  predecessor_transition_identity_id
)
where predecessor_transition_identity_id is not null;
```

Identical retry returns `REUSED_IDENTICAL`; divergent root or successor returns `DIVERGENT_EXISTING_IDENTITY`.

## 9. Writer role and table privilege model

Live role truth:

```text
investing_app: LOGIN, NOINHERIT, NOBYPASSRLS, not a member of investing_owner
investing_owner: NOLOGIN, NOINHERIT, NOBYPASSRLS
service_role: BYPASSRLS
```

A SECURITY INVOKER writer would require direct table INSERT to `investing_app`, which leaves a bypass of writer semantics. RL-8C therefore freezes a dedicated internal writer role:

```text
investing_rl8_writer
NOLOGIN
NOINHERIT
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOREPLICATION
NOBYPASSRLS
```

`investing_app` MUST NOT be a member of `investing_rl8_writer`. `service_role` MUST NOT be a member of `investing_rl8_writer`.

RL-8 identity table grants:

```text
investing_app: SELECT only
investing_app: NO INSERT, NO UPDATE, NO DELETE, NO TRUNCATE, NO REFERENCES, NO TRIGGER
investing_rl8_writer: minimum SELECT/INSERT required for RL-8 protocol and transition persistence
investing_rl8_writer: NO UPDATE, NO DELETE, NO TRUNCATE
```

Upstream relations grant no mutation authority to `investing_rl8_writer`. If SELECT is required for lifecycle, supersession or reconstruction checks, grant only exact SELECT on required upstream columns and exact RLS policies to `investing_rl8_writer`. No broad schema grants. No ownership transfer to `investing_rl8_writer`.

## 10. Narrow SECURITY DEFINER writer allowlist

The four public persistence entry points are the only intentional RL-8 SECURITY DEFINER writer surface:

```text
investing.persist_research_scientific_promotion_protocol_v1
investing.persist_research_scientific_promotion_root_v1
investing.persist_research_scientific_promotion_evaluation_plan_v1
investing.persist_research_scientific_promotion_supersession_v1
```

They MUST be `SECURITY DEFINER`, `owner = investing_rl8_writer`, `set search_path = pg_catalog`, with all Investing relations fully qualified as `investing.<relation>`. This is a deliberate narrow exception to the recent no-SECURITY-DEFINER preference, justified because SECURITY INVOKER otherwise requires direct table INSERT to the application role and cannot enforce a closed writer boundary. No other RL-8 writer function may be SECURITY DEFINER.

Exact EXECUTE grants revoke `public`, `anon`, `authenticated`, and `service_role`; grant execute only to `investing_app`.

## 11. Writer API

Exact writer signatures:

```text
investing.persist_research_scientific_promotion_protocol_v1(p_protocol_hash_hex text, p_canonical_payload jsonb) returns jsonb
investing.persist_research_scientific_promotion_root_v1(p_transition_hash_hex text, p_canonical_payload jsonb) returns jsonb
investing.persist_research_scientific_promotion_evaluation_plan_v1(p_predecessor_transition_identity_id uuid, p_stage_a_transition_hash_hex text, p_stage_a_canonical_payload jsonb, p_closure_transition_hash_hex text default null, p_closure_canonical_payload jsonb default null) returns jsonb
investing.persist_research_scientific_promotion_supersession_v1(p_predecessor_transition_identity_id uuid, p_superseded_transition_hash_hex text, p_superseded_canonical_payload jsonb, p_successor_protocol_identity_id uuid, p_successor_root_transition_identity_id uuid) returns jsonb
```

The root writer MUST derive `research_investigation_id`, `tenant_id`, `principal_id`, and `tenant_membership_id` from server-side context settings and the accepted referenced operational rows. The caller does not provide authority identity. The writer fails closed if any referenced row does not match server-derived authority.

Every writer returns `CREATED` or `REUSED_IDENTICAL`; divergent conflict is `DIVERGENT_EXISTING_IDENTITY`. UPSERT semantics are forbidden unless the writer verifies byte-identical canonical payload, exact canonical hash and exact HashRef identity before returning `REUSED_IDENTICAL`.

## 12. RLS and FORCE RLS contract

Both RL-8C relations have RLS enabled and FORCE RLS enabled. SECURITY DEFINER is not an RLS bypass because `investing_rl8_writer` is `NOBYPASSRLS`.

Operation vocabulary is exact:

```text
RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1
RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1
RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1
RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1
```

Required request settings are `syntrake.investing.operation`, `syntrake.investing.capability`, `syntrake.investing.tenant_id`, `syntrake.investing.principal_id`, `syntrake.investing.tenant_membership_id`, and `syntrake.investing.research_investigation_id`. Every policy for `investing_rl8_writer` MUST verify operation, capability `RESEARCH_MUTATE`, tenant, principal, membership, Investigation, `TENANT_SCOPE`, and `PURE_RESEARCH` as appropriate. Protocol persistence is global scientific identity but still requires a valid authorized research context before creation/reuse. No `auth.uid()` shortcut. No authenticated-role-only authorization.

## 13. Authority FKs and append-only checks

Protocol table has no authority FK because protocol scientific identity is global and reusable. Transition rows MUST include FK `(tenant_membership_id, tenant_id, principal_id)` to `investing.tenant_memberships` and FK `(research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)` to `investing.research_investigations`. Every upstream evidence row FK must prove the exact tuple frozen in section 7. Row UUID alone is never trusted.

Scientific protocol and transition rows are immutable. `UPDATE authority = none`; `DELETE authority = none`. Both tables MUST have BEFORE UPDATE OR DELETE trigger `investing.reject_research_scientific_promotion_update_delete_v1()`.

Structural checks must prove canonical payload agrees with columns: `canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_TRANSITION_V1'`, protocol HashRef domain/version/hash equals protocol columns, subject Experiment HashRef equals columns, predecessorState equals `predecessor_state`, resultingState equals `resulting_state`, lifecycle references match lifecycle columns, evidenceSnapshot HashRefs/nulls match the nine operational FK/hash columns, transition HashRef domain/version equals `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1` and `SYNTRAKE_SHA256_V1`, and protocol id equals `SCIENTIFIC_PROMOTION_PROTOCOL_V20261002`.

## 14. Database canonical JSON and hash verification

The database writer must not accept a caller-provided RL-8 scientific hash blindly. RL-8C freezes an RL-8-specific deterministic SQL canonical JSON/hash verifier.

Accepted RL-8 scientific payload values contain only `null`, `boolean`, `string`, `array`, and `object`. Canonical JSON numbers are forbidden. The SQL canonicalizer mirrors accepted `syntrakeCanonicalJsonV1` rules:

```text
object keys sorted deterministically
no whitespace
arrays preserve order
strings JSON-escaped deterministically
numbers rejected
undefined impossible
UTF-8
```

Hash computation is exact:

```text
SHA256(
  UTF8(hash_domain + '\n') ||
  canonical_payload_bytes
)
```

The implementation must use schema-qualified pgcrypto through `extensions.digest`. Required verification targets are `SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1` and `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1`. The protocol writer additionally requires exact known V1 protocol hash `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`.

Future PostgreSQL tests MUST prove SQL canonicalizer/hash output is byte-identical to RL-8A/RL-8B runtime for:

```text
protocol canonical payload = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C
root transition
PASS Stage-A = BEEE521649E78934DCE216B8650F51B86F8BAE80A9A8EA5600321D1F2BB263A4
PASS closure = 98A85178DFF04F3598215DF0AB51CF819B8C43CA74C1F5AA74EC42E00B19D531
FAIL Stage-A = F3438AB40774749A8248BAE9C070E51448515BA39167B7DF9672414B55596DF0
FAIL closure = 76D3E5A550D8B5766B8F77F8FB0A3E22024FEFA1C504ED64E3AAB69E5C512E04
INSUFFICIENT Stage-A = D6135FFEAA229F0B870375333D602AE05974DE9AD424587CBBEFB82F9F8EF738
```

A mismatch blocks RL-8C. RL-8C must not introduce a second canonicalization standard. Hash format is exact: `SHA-256`, `SYNTRAKE_SHA256_V1`, `64 uppercase hex`. No lowercase normalization at persistence time.

## 15. Atomic Stage-A + closure pairs and orphan prevention

Mandatory pairs are exact:

```text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
VALIDATION_FAILED -> REJECTED
```

They MUST persist atomically in one database transaction. Either both rows commit or neither row commits. `INSUFFICIENT_EVIDENCE` persists Stage A only.

Chosen orphan-prevention mechanism: DEFERRABLE INITIALLY DEFERRED constraint trigger `research_scientific_promotion_no_orphan_intermediate` using function `investing.enforce_research_scientific_promotion_no_orphan_intermediate_v1()`. It checks at commit time that every committed row with `resulting_state in ('VALIDATION_PASSED','VALIDATION_FAILED')` has exactly one successor row in the same tenant and Investigation.

Closure COPY enforcement is exact:

```text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE:
closure.evidenceSnapshot == predecessor.evidenceSnapshot
closure.gateOutcomes == predecessor.gateOutcomes
closure.transitionReasons == []
closure.predecessorTransition == predecessor HashRef
closure.rejectedTransition == null
closure.supersedes == null
closure.supersededByChain == null

VALIDATION_FAILED -> REJECTED:
closure.evidenceSnapshot == predecessor.evidenceSnapshot
closure.gateOutcomes == predecessor.gateOutcomes
closure.transitionReasons == predecessor.transitionReasons
closure.rejectedTransition == predecessor HashRef
closure.predecessorTransition == predecessor HashRef
closure.supersedes == null
closure.supersededByChain == null
```

This survives writer-role SQL because the invariant is enforced by a deferrable constraint trigger at commit. It does not rely on TypeScript convention and does not rely on a transaction-local custom GUC.

## 16. SUPERSEDED contract

Exact RL-8 V1 SUPERSEDED source states are:

```text
EXECUTED
INSUFFICIENT_EVIDENCE
PROMOTION_ELIGIBLE
REJECTED
```

No other source state is allowed.

SUPERSEDED COPY enforcement is exact:

```text
evidenceSnapshot = COPY predecessor
gateOutcomes = COPY predecessor
transitionReasons = [SUPERSEDED_EVIDENCE]
supersedes = predecessor HashRef
rejectedTransition = null
predecessorTransition = predecessor HashRef
```

Additional invariants: successor protocol differs; successor root exists; referenced successor is actually ROOT with `predecessorTransition = null`, `predecessorState = DRAFT_RESEARCH`, `resultingState = EXECUTED`; same tenant; same Investigation; same subject; no self-reference; no old-chain transition as successor root; one old chain has at most one successor-chain link; identical link retry returns `REUSED_IDENTICAL`; divergent link conflict returns `DIVERGENT_EXISTING_IDENTITY`; no cycles.

Cycle prevention is frozen in `persist_research_scientific_promotion_supersession_v1`: before insert, the writer recursively traverses `supersededByChain.successorRootTransition` links with a recursive CTE under advisory locks. A constraint validation trigger named `research_scientific_promotion_supersession_integrity` also verifies direct self-reference, old-chain-as-successor-root, different protocol, same tenant, same Investigation, same stable subject, exact ROOT target and direct same-chain references. Multi-hop cycle validation is mandatory in the writer because the writer is the only mutation path.

## 17. Reconstruction and concurrency contracts

Deterministic read semantics: resolve unique root for chain key; follow unique successor by `predecessor_transition_identity_id`; continue until leaf; zero successor = active leaf; more than one successor = corrupt history / `DIVERGENT_EXISTING_IDENTITY`; `VALIDATION_PASSED` or `VALIDATION_FAILED` as committed leaf = corrupt history; `SUPERSEDED` leaf requires valid successor-chain reference and reconstruction continues at `supersededByChain.successorRootTransition`. No timestamp choice, no `MAX(created_at)`, no insertion-order authority, no mutable latest pointer, no caller preference.

Lock strategy uses `pg_advisory_xact_lock` plus unique constraints. Exact lock identities: `RL8C_PROTOCOL:`, `RL8C_ROOT:`, `RL8C_SUCCESSOR:`, `RL8C_SUPERSEDE:`. Lock ordering is exact: 1. protocol identity; 2. root chain key; 3. predecessor successor slot; 4. supersession link; 5. upstream evidence rows in lexical table-name order by table name and UUID.

RL-8B rejects fresh same-protocol evaluation with unchanged evidenceSnapshot. Persistence retry semantics are separate: identical retry of the ORIGINAL transition request returns `REUSED_IDENTICAL`; it must not create a successor from the current leaf; a different successor for an already-consumed predecessor returns `DIVERGENT_EXISTING_IDENTITY`.

## 18. Future migration slices

```text
RL-8C1: schema + compatibility authority/hash indexes + subject Experiment operational binding + dedicated investing_rl8_writer role + RLS/FORCE RLS + closed table grants + SQL canonical/hash verifier + append-only + structural/lifecycle constraints.
RL-8C2: privileged narrow writer functions + protocol/root/evaluation-plan persistence + atomic Stage-A/closure + single-successor/root concurrency + idempotency + PostgreSQL 17 golden hash parity.
RL-8C3: SUPERSEDED writer + cycle prevention + cross-chain reconstruction integrity + read-only reconstruction helper.
```

No Passport mutation. No Production action.

## 19. PostgreSQL 17 test matrix

Future executable migration MUST prove clean migration replay on PostgreSQL 17; owner = investing_owner; `investing_rl8_writer` role attributes exact and NOBYPASSRLS; `investing_app` is not a member of `investing_rl8_writer`; `service_role` is not a member of `investing_rl8_writer`; RLS enabled; FORCE RLS enabled; forbidden grants absent; SECURITY DEFINER allowlist contains exactly four RL-8 writer functions; writer search_path safe; SQL canonical protocol hash equals `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`; SQL transition golden hashes match RL-8B runtime golden hashes; exact protocol retry -> REUSED_IDENTICAL; divergent protocol -> conflict; exact root retry -> REUSED_IDENTICAL; concurrent identical roots -> one row / both deterministic results; concurrent divergent roots -> one winner / one DIVERGENT; exact Stage-A pair retry -> REUSED_IDENTICAL; concurrent identical Stage-A pair -> one pair only; concurrent divergent successor -> one winner / one DIVERGENT; VALIDATION_PASSED orphan commit -> impossible; VALIDATION_FAILED orphan commit -> impossible; closure COPY violation -> blocked; pair rollback -> neither row remains; INSUFFICIENT Stage-A -> one row, no closure; wrong tenant -> blocked; wrong Investigation -> blocked; wrong membership -> blocked; service_role mutation -> blocked; anon/authenticated/public mutation -> blocked; UPDATE blocked; DELETE blocked; upstream HashRef without accepted operational row -> blocked; upstream row from wrong Investigation -> blocked; run input relation is `investing.run_inputs_scientific_identities`; SUPERSEDED dangling root -> blocked; SUPERSEDED same protocol -> blocked; SUPERSEDED subject mismatch -> blocked; SUPERSEDED copy violation -> blocked; SUPERSEDED cycle -> blocked; reconstruction with multiple successors -> fail closed.

## 20. Production process

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

## 21. Forbidden stale wording

The operative contract does not permit these meanings:

```text
implementation may choose
optional orphan prevention
best effort closure
latest row wins
service_role authorized writer
authenticated role owns rows
timestamp current state
writer convention only
```
