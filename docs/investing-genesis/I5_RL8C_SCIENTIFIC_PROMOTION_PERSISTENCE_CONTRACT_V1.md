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
hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$')
canonical_payload jsonb not null
created_at timestamptz not null default transaction_timestamp()
```

Protocol operational persistence is reusable across tenants and Investigations because the protocol canonical payload contains no tenant, principal, membership, Investigation or subject. Authority metadata MUST NOT be part of protocol scientific identity. Therefore this relation intentionally has no tenant columns. It is a global immutable protocol identity table.

Protocol table storage is a version-forward immutable scientific protocol registry under the already frozen domain `SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1`. It supports multiple immutable protocol identities over time without introducing a new scientific domain. Physical protocol columns freeze domain-level invariants only: `hash_algorithm = SHA-256`, `hash_domain = SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1`, `hash_version = SYNTRAKE_SHA256_V1`, uppercase 64-hex `hash_hex`, `schemaVersion = SCIENTIFIC_PROMOTION_PROTOCOL_V1`, closed canonical V1 protocol object shape, and database-computed hash equals `hash_hex`. The table MUST NOT permanently constrain `protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002` or `hash_hex = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`.

The closed V1 protocol object keys remain exactly:

```text
schemaVersion
protocolId
requiredEvidenceClasses
compatibleMetricRegistryVersion
requiredRl7PolicyId
rl7Required
stateVocabulary
gateVocabulary
gateStatusVocabulary
reasonVocabulary
gateEvidenceMapping
decisionPrecedence
transitionGraph
```

No extra keys are admitted. Future admission may change protocol values only through an explicitly accepted future methodology contract.

Current RL-8 V1 runtime authority remains exact:

```text
schemaVersion = SCIENTIFIC_PROMOTION_PROTOCOL_V1
protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002
Current protocol HashRef = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C
```

The current protocol writer must verify the exact frozen payload shape from the accepted RL-8A canonical runtime. The protocol payload field is `protocolId`.

Uniqueness constraints:

```text
unique (hash_algorithm, hash_domain, hash_version, hash_hex)
unique ((canonical_payload->>'protocolId')) where hash_domain = 'SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1'
```

Payload checks MUST prove `canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V1'`, the canonical payload is closed to the frozen V1 protocol object shape, and database-computed protocol hash equals relational `hash_hex`. Current writer admission, not permanent storage schema, proves `canonical_payload->>'protocolId' = 'SCIENTIFIC_PROMOTION_PROTOCOL_V20261002'` and current HashRef equals `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`.

Protocol operational ID plus hash compatibility key is mandatory:

```text
RL8C1_ADD: research_scientific_promotion_protocols_rl8c_identity_hash_key (
  research_scientific_promotion_protocol_identity_id,
  hash_hex
)
```

Every transition MUST FK `(research_scientific_promotion_protocol_identity_id, protocol_hash_hex)` to that key. This proves the operational protocol row and scientific protocol HashRef are the same identity. Row UUID alone is insufficient.

Exact transition protocol FK:

```text
foreign key (
  research_scientific_promotion_protocol_identity_id,
  protocol_hash_hex
)
references investing.research_scientific_promotion_protocols_scientific_identities (
  research_scientific_promotion_protocol_identity_id,
  hash_hex
)
```

The canonical payload protocol envelope must equal `SHA-256 / SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1 / SYNTRAKE_SHA256_V1 / protocol_hash_hex`. current writer authority != permanent storage-domain restriction.

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
protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$')
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
| runInput | `investing.run_inputs_scientific_identities` | `(run_input_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: run_inputs_rl8c_authority_hash_key (run_input_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| result | `investing.research_results_scientific_identities` | `(result_identity_id, run_input_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` and same `run_input_identity_id` as the transition runInput FK proves Investigation transitively | `RL8C1_ADD: research_results_rl8c_run_input_hash_key (result_identity_id, run_input_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| evidenceObject | `investing.research_evidence_objects_scientific_identities` | `(evidence_identity_id, run_input_identity_id, result_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_evidence_objects_rl8c_authority_hash_key (evidence_identity_id, run_input_identity_id, result_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| validationProtocol | `investing.research_validation_protocols_scientific_identities` | `(research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_validation_protocols_rl8c_authority_hash_key (research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| validationResult | `investing.research_validation_results_scientific_identities` | `(research_validation_result_identity_id, research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_validation_results_rl8c_authority_hash_key (research_validation_result_identity_id, research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| validationAssessmentProtocol | `investing.research_validation_assessment_protocols_scientific_identities` | `(research_validation_assessment_protocol_identity_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_validation_assessment_protocols_rl8c_authority_hash_key (research_validation_assessment_protocol_identity_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| validationAssessmentResult | `investing.research_validation_assessment_results_scientific_identities` | `(research_validation_assessment_result_identity_id, research_validation_assessment_protocol_identity_id, research_validation_result_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_validation_assessment_results_rl8c_authority_hash_key (research_validation_assessment_result_identity_id, research_validation_assessment_protocol_identity_id, research_validation_result_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| robustnessComparisonProtocol | `investing.research_experiment_comparison_protocols_scientific_identities` | `(research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_experiment_comparison_protocols_rl8c_authority_hash_key (research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |
| robustnessComparisonResult | `investing.research_experiment_comparison_results_scientific_identities` | `(research_experiment_comparison_result_identity_id, research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` | `RL8C1_ADD: research_experiment_comparison_results_rl8c_authority_hash_key (research_experiment_comparison_result_identity_id, research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)` |

The Result FK proves Investigation transitively through the same `run_input_identity_id` already bound to `investing.run_inputs_scientific_identities`. The Evidence Object FK proves Investigation transitively through the same `run_input_identity_id` and `result_identity_id`. All other rows prove Investigation directly through their compatibility key.


Exact compatibility key plan is frozen:

```text
RL8C1_ADD: research_investigations_rl8c_authority_tuple_key (research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)
RL8C1_ADD: research_experiments_rl8c_subject_authority_hash_key (research_experiment_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, experiment_hash_hex, experiment_parameters_hash_hex, research_ir_hash_hex)
RL8C1_ADD: run_inputs_rl8c_authority_hash_key (run_input_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_results_rl8c_run_input_hash_key (result_identity_id, run_input_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_evidence_objects_rl8c_authority_hash_key (evidence_identity_id, run_input_identity_id, result_identity_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_validation_protocols_rl8c_authority_hash_key (research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_validation_results_rl8c_authority_hash_key (research_validation_result_identity_id, research_validation_protocol_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_validation_assessment_protocols_rl8c_authority_hash_key (research_validation_assessment_protocol_identity_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_validation_assessment_results_rl8c_authority_hash_key (research_validation_assessment_result_identity_id, research_validation_assessment_protocol_identity_id, research_validation_result_identity_id, research_investigation_id, research_experiment_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_experiment_comparison_protocols_rl8c_authority_hash_key (research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
RL8C1_ADD: research_experiment_comparison_results_rl8c_authority_hash_key (research_experiment_comparison_result_identity_id, research_experiment_comparison_protocol_identity_id, research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context, hash_hex)
```

The live existing `research_validation_assessment_protocols_authority_key` is historical schema context only. It omits `hash_hex`, so it is not an exact RL-8C FK source and MUST NOT be used as the required Assessment Protocol compatibility key.

Server-side upstream resolution is frozen. Writers parse the canonical payload HashRefs and resolve operational rows server-side using server-derived tenant, server-derived Investigation, stable subject, canonical payload HashRef, and required parent lineage. They MUST NOT accept caller-selected upstream operational IDs for scientific evidence. Each lookup requires exactly one row. Zero matching authoritative rows fail closed with the appropriate frozen integrity/authority error. More than one matching authoritative row returns `DIVERGENT_EXISTING_IDENTITY`. No `LIMIT 1`, no `ORDER BY created_at`, no `MAX(...)`, no `latest`, and no ambiguous row choice.

Exact lookup identities:

```text
runInput: tenant_id, research_investigation_id, research_experiment_id, SHA-256, SYNTRAKE:RUN_INPUT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.runInput.hashHex
result: tenant_id, resolved run_input_identity_id, SHA-256, SYNTRAKE:RESULT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.result.hashHex
evidenceObject: tenant_id, resolved run_input_identity_id, resolved result_identity_id, SHA-256, SYNTRAKE:EVIDENCE_OBJECT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.evidenceObject.hashHex
validationProtocol: tenant_id, research_investigation_id, research_experiment_id, SHA-256, SYNTRAKE:VALIDATION_PROTOCOL:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.validationProtocol.hashHex
validationResult: tenant_id, resolved validation_protocol_identity_id, research_investigation_id, research_experiment_id, SHA-256, SYNTRAKE:VALIDATION_RESULT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.validationResult.hashHex
validationAssessmentProtocol: tenant_id, resolved validation_protocol_identity_id, research_investigation_id, research_experiment_id, SHA-256, SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.validationAssessmentProtocol.hashHex
validationAssessmentResult: tenant_id, resolved validation_assessment_protocol_identity_id, resolved validation_result_identity_id, research_investigation_id, research_experiment_id, SHA-256, SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.validationAssessmentResult.hashHex
robustnessComparisonProtocol: tenant_id, research_investigation_id, SHA-256, SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.robustnessComparisonProtocol.hashHex
robustnessComparisonResult: tenant_id, resolved research_experiment_comparison_protocol_identity_id, research_investigation_id, SHA-256, SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1, SYNTRAKE_SHA256_V1, evidenceSnapshot.robustnessComparisonResult.hashHex
```

Root writer resolution sequence is exact: read and validate current authorized context; verify canonical payload is exact ROOT; resolve subject Experiment from Investigation, subject Experiment hash, subject Experiment Parameters hash, and subject Research IR hash; resolve Run Input from exact root snapshot HashRef under same Experiment/Investigation/authority; resolve Result from exact root snapshot Result HashRef and exact Run Input; resolve exact V1 protocol row; then acquire root-chain lock and evaluate reuse/divergence; then persist. No arbitrary operational UUID input.

Evaluation plan writer resolution is exact: `p_predecessor_transition_identity_id` is a selector, never authority; the function resolves predecessor under server-derived tenant, principal, membership and Investigation; proves predecessor HashRef equals `stageA.canonical_payload.predecessorTransition`; then resolves all nine upstream evidence classes from the Stage-A canonical snapshot. No upstream UUIDs are supplied by caller.

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


## 8A. Lifecycle transition compatibility keys, FKs and nullability

RL-8C1 MUST create this lifecycle composite compatibility key:

```text
RL8C1_ADD: research_scientific_promotion_transitions_rl8c_lifecycle_key (research_scientific_promotion_transition_identity_id, tenant_id, research_investigation_id, research_scientific_promotion_protocol_identity_id, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, transition_hash_hex)
```

Predecessor composite FK uses MATCH SIMPLE:

```text
(predecessor_transition_identity_id, tenant_id, research_investigation_id, research_scientific_promotion_protocol_identity_id, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_transition_hash_hex)
references research_scientific_promotion_transitions_rl8c_lifecycle_key
MATCH SIMPLE
```

Rejected composite FK uses MATCH SIMPLE:

```text
(rejected_transition_identity_id, tenant_id, research_investigation_id, research_scientific_promotion_protocol_identity_id, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, rejected_transition_hash_hex)
references research_scientific_promotion_transitions_rl8c_lifecycle_key
MATCH SIMPLE
```

Supersedes composite FK uses MATCH SIMPLE:

```text
(supersedes_transition_identity_id, tenant_id, research_investigation_id, research_scientific_promotion_protocol_identity_id, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, supersedes_transition_hash_hex)
references research_scientific_promotion_transitions_rl8c_lifecycle_key
MATCH SIMPLE
```

Lifecycle identity/hash pair-integrity CHECK constraints are mandatory with MATCH SIMPLE:

```text
(predecessor_transition_identity_id is null and predecessor_transition_hash_hex is null) or (predecessor_transition_identity_id is not null and predecessor_transition_hash_hex is not null)
(rejected_transition_identity_id is null and rejected_transition_hash_hex is null) or (rejected_transition_identity_id is not null and rejected_transition_hash_hex is not null)
(supersedes_transition_identity_id is null and supersedes_transition_hash_hex is null) or (supersedes_transition_identity_id is not null and supersedes_transition_hash_hex is not null)
(superseded_by_successor_protocol_identity_id is null and superseded_by_successor_protocol_hash_hex is null) or (superseded_by_successor_protocol_identity_id is not null and superseded_by_successor_protocol_hash_hex is not null)
(superseded_by_successor_root_transition_identity_id is null and superseded_by_successor_root_transition_hash_hex is null) or (superseded_by_successor_root_transition_identity_id is not null and superseded_by_successor_root_transition_hash_hex is not null)
```

This combination is intentional: MATCH SIMPLE + identity/hash all-null-or-all-non-null CHECK + state-specific pair presence CHECK. For a present lifecycle reference, both ID/hash are non-null, so the full composite FK is checked. For an absent optional reference, ID/hash are both null and the FK is intentionally skipped. MATCH FULL MUST NOT be used for predecessor, rejected or supersedes lifecycle FKs because those composite FKs include always-non-null tenant, Investigation, protocol and subject columns; MATCH FULL would reject valid absent optional references.

Future PostgreSQL tests MUST prove valid optional references are accepted when shared authority columns are non-null: ROOT with predecessor identity/hash both null; PROMOTION_ELIGIBLE with rejected identity/hash both null; ordinary non-SUPERSEDED with supersedes identity/hash both null. They also MUST prove identity non-null/hash null and identity null/hash non-null are rejected for every lifecycle pair.

State-specific pair presence is frozen:

```text
ROOT: predecessor identity/hash pair = NULL; rejected pair = NULL; supersedes pair = NULL; successor protocol pair = NULL; successor root pair = NULL
Every non-root transition: predecessor identity/hash pair = NON-NULL
REJECTED only: rejected identity/hash pair = NON-NULL
Every non-REJECTED transition: rejected identity/hash pair = NULL
SUPERSEDED only: supersedes identity/hash pair = NON-NULL; successor protocol identity/hash pair = NON-NULL; successor root identity/hash pair = NON-NULL
Every non-SUPERSEDED transition: supersedes identity/hash pair = NULL; successor protocol identity/hash pair = NULL; successor root identity/hash pair = NULL
```

Successor protocol pair FK:

```text
foreign key (
  superseded_by_successor_protocol_identity_id,
  superseded_by_successor_protocol_hash_hex
)
references investing.research_scientific_promotion_protocols_scientific_identities (
  research_scientific_promotion_protocol_identity_id,
  hash_hex
)
MATCH FULL
```

For a SUPERSEDED transition, `superseded_by_successor_protocol_hash_hex <> protocol_hash_hex`. The writer and database structural trigger both enforce this inequality.

Successor-root cross-protocol FK uses this mechanically valid target key:

```text
RL8C1_ADD: research_scientific_promotion_transitions_rl8c_cross_chain_target_key (research_scientific_promotion_transition_identity_id, tenant_id, research_investigation_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, transition_hash_hex)
```

The SUPERSEDED row's successor-root composite FK uses MATCH SIMPLE with this exact referencing tuple:

```text
(
  superseded_by_successor_root_transition_identity_id,
  tenant_id,
  research_investigation_id,
  superseded_by_successor_protocol_identity_id,
  superseded_by_successor_protocol_hash_hex,
  subject_experiment_hash_hex,
  subject_experiment_parameters_hash_hex,
  subject_research_ir_hash_hex,
  superseded_by_successor_root_transition_hash_hex
)
references (
  research_scientific_promotion_transition_identity_id,
  tenant_id,
  research_investigation_id,
  research_scientific_promotion_protocol_identity_id,
  protocol_hash_hex,
  subject_experiment_hash_hex,
  subject_experiment_parameters_hash_hex,
  subject_research_ir_hash_hex,
  transition_hash_hex
)
MATCH SIMPLE
```

The SUPERSEDED row's composite FK proves successor root transition identity, same tenant, same Investigation, successor protocol operational identity, successor protocol hash, same subject Experiment, same Experiment Parameters, same Research IR and successor root transition hash. State-specific checks guarantee that for SUPERSEDED all successor protocol/root pairs are fully non-null; for every non-SUPERSEDED transition all those optional pairs are fully null. Protocol is intentionally different there. Row UUID alone is never sufficient.

Rootness is proved by `research_scientific_promotion_supersession_integrity`, not by a foreign key. The trigger MUST load the referenced successor transition and require exactly: `predecessor_transition_identity_id IS NULL`, `predecessor_transition_hash_hex IS NULL`, `predecessor_state = DRAFT_RESEARCH`, `resulting_state = EXECUTED`, `gateOutcomes = []`, `transitionReasons = []`, `supersedes = null`, `rejectedTransition = null`, `supersededByChain = null`, and exact ROOT evidenceSnapshot presence. Failure returns `DIVERGENT_EXISTING_IDENTITY`. A foreign key MUST NOT be claimed to enforce literal state values.

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
investing_rl8_writer: SELECT, INSERT on exactly the two RL-8 identity relations
investing_rl8_writer: NO UPDATE, NO DELETE, NO TRUNCATE
```

Upstream relations grant no mutation authority to `investing_rl8_writer`. `investing_rl8_writer` receives SELECT only on exactly these upstream provenance relations: `investing.tenant_memberships`, `investing.research_investigations`, `investing.research_experiments`, `investing.run_inputs_scientific_identities`, `investing.research_results_scientific_identities`, `investing.research_evidence_objects_scientific_identities`, `investing.research_validation_protocols_scientific_identities`, `investing.research_validation_results_scientific_identities`, `investing.research_validation_assessment_protocols_scientific_identities`, `investing.research_validation_assessment_results_scientific_identities`, `investing.research_experiment_comparison_protocols_scientific_identities`, and `investing.research_experiment_comparison_results_scientific_identities`. No broad schema grants. No ownership transfer to `investing_rl8_writer`.


Exact writer role schema privileges:

```text
GRANT USAGE ON SCHEMA investing TO investing_rl8_writer;
GRANT USAGE ON SCHEMA extensions TO investing_rl8_writer;
```

Exact table privileges:

```text
GRANT SELECT, INSERT ON investing.research_scientific_promotion_protocols_scientific_identities TO investing_rl8_writer;
GRANT SELECT, INSERT ON investing.research_scientific_promotion_transitions_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.tenant_memberships TO investing_rl8_writer;
GRANT SELECT ON investing.research_investigations TO investing_rl8_writer;
GRANT SELECT ON investing.research_experiments TO investing_rl8_writer;
GRANT SELECT ON investing.run_inputs_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_results_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_evidence_objects_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_validation_protocols_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_validation_results_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_validation_assessment_protocols_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_validation_assessment_results_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_experiment_comparison_protocols_scientific_identities TO investing_rl8_writer;
GRANT SELECT ON investing.research_experiment_comparison_results_scientific_identities TO investing_rl8_writer;
```

No UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER privilege is granted to `investing_rl8_writer`. PostgreSQL 17 pgcrypto `extensions.digest(...)` is executable through schema-qualified function lookup after `USAGE ON SCHEMA extensions`; no broad extension schema grants are allowed.

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

Current root and same-protocol evaluation-plan writers only admit the current RL-8 V1 protocol. Before persisting a current RL-8 root or same-protocol Stage-A plan, the writer requires: `transition.protocol.hashAlgorithm = SHA-256`, `transition.protocol.hashDomain = SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1`, `transition.protocol.hashVersion = SYNTRAKE_SHA256_V1`, and `transition.protocol.hashHex = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`. Anything else through the current root/evaluation writer fails closed with `INCOMPATIBLE_PROTOCOL_VERSION`. This preserves RL-8A/RL-8B current authority while keeping the storage substrate forward-compatible.

The current protocol writer admits only `protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002` and current HashRef `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`. Future protocol identities require a new frozen methodology contract, deterministic runtime support, exact protocol payload/hash golden, explicit migration/writer admission, and independent audit. No generic arbitrary-protocol insertion is permitted. No mutable `currentProtocol` column. No latest. No alias. No environment-selected protocol. Current authority remains the exact 20261002 protocol until a later explicit contract changes authority.

Storage must be forward-compatible because a future different protocol must be able to create its own exact ROOT under the same tenant/Investigation/subject before the old current-protocol chain can persist SUPERSEDED. The SUPERSEDED row's `supersededByChain.successorProtocol` points to the future immutable protocol HashRef and `supersededByChain.successorRootTransition` points to that future protocol's exact accepted ROOT. If the physical transition table permanently hard-codes `122F...`, accepted cross-protocol methodology replacement can never occur.

The supersession writer does not create successor protocol, successor root or future methodology. It only links an old accepted leaf to an already existing accepted different-protocol root. It verifies successor protocol exists, successor root exists, successor root protocol == successor protocol, successor protocol != old protocol, same tenant, same Investigation, same subject, exact rootness and acyclic chain.

The root writer MUST derive `research_investigation_id`, `tenant_id`, `principal_id`, and `tenant_membership_id` from server-side context settings and the accepted referenced operational rows. The caller does not provide authority identity. The writer fails closed if any referenced row does not match server-derived authority.


Authority resolution order is frozen for every RL-8 mutation writer before scientific persistence:

```text
1. read server-derived context settings;
2. resolve exactly one tenant_memberships row matching tenant_membership_id, tenant_id, principal_id, role = OWNER, state = ACTIVE;
3. zero matching membership: AUTHORITY_FAILURE;
4. more than one: fail closed;
5. resolve exact research_investigations row under that same tenant, principal, membership, Investigation, operation_scope = TENANT_SCOPE, source_context = PURE_RESEARCH;
6. only after membership + Investigation authority succeeds: resolve Experiment / upstream scientific evidence; acquire scientific locks; persist.
```

`persist_research_scientific_promotion_protocol_v1` uses this same OWNER / ACTIVE membership plus authorized Investigation proof before it may create or reuse the current global protocol scientific identity. Global scientific identity does not imply unauthenticated or global mutation authority. Root, evaluation-plan and supersession writers require the same proof before resolving any scientific lineage. Revoked membership, non-OWNER membership, membership belonging to another principal, membership belonging to another tenant and missing membership all fail closed before scientific state evaluation or persistence.

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

Required request settings are `syntrake.investing.operation`, `syntrake.investing.capability`, `syntrake.investing.tenant_id`, `syntrake.investing.principal_id`, `syntrake.investing.tenant_membership_id`, and `syntrake.investing.research_investigation_id`. Every policy for `investing_rl8_writer` MUST verify operation, capability `RESEARCH_MUTATE`, tenant, principal, membership, Investigation, `TENANT_SCOPE`, and `PURE_RESEARCH` for the exact relation policy. Protocol persistence is global scientific identity but still requires a valid authorized research context before creation/reuse. No `auth.uid()` shortcut. No authenticated-role-only authorization.


Exact RLS policy contract:

```text
research_scientific_promotion_protocols_rl8c_writer_select
research_scientific_promotion_protocols_rl8c_writer_insert
research_scientific_promotion_transitions_rl8c_writer_select
research_scientific_promotion_transitions_rl8c_writer_insert
tenant_memberships_rl8c_writer_select
research_investigations_rl8c_writer_select
research_experiments_rl8c_writer_select
run_inputs_rl8c_writer_select
research_results_rl8c_writer_select
research_evidence_objects_rl8c_writer_select
research_validation_protocols_rl8c_writer_select
research_validation_results_rl8c_writer_select
research_validation_assessment_protocols_rl8c_writer_select
research_validation_assessment_results_rl8c_writer_select
research_experiment_comparison_protocols_rl8c_writer_select
research_experiment_comparison_results_rl8c_writer_select
```


Tenant membership SELECT policy is exact:

```text
tenant_memberships_rl8c_writer_select
on investing.tenant_memberships
for SELECT
to investing_rl8_writer
using (
  current_setting('syntrake.investing.operation', true) in (
    'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1',
    'RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1'
  )
  and current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'
  and tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
  and tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
  and principal_id::text = current_setting('syntrake.investing.principal_id', true)
  and role = 'OWNER'
  and state = 'ACTIVE'
)
```

No client-supplied membership tuple is authority by itself. Custom GUC values are context only; they are never sufficient proof of ownership without matching authoritative rows.

Transition INSERT predicate must enforce exact equality:

```text
operation = current_setting('syntrake.investing.operation', true)
capability = 'RESEARCH_MUTATE'
capability = current_setting('syntrake.investing.capability', true)
tenant_id::text = current_setting('syntrake.investing.tenant_id', true)
principal_id::text = current_setting('syntrake.investing.principal_id', true)
tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)
research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)
operation_scope = 'TENANT_SCOPE'
source_context = 'PURE_RESEARCH'
```

Protocol INSERT policy uses `operation = 'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1'`, `capability = 'RESEARCH_MUTATE'`, `operation_scope = 'TENANT_SCOPE'`, `source_context = 'PURE_RESEARCH'`, and requires active canonical membership and Investigation authority from the current settings. Upstream SELECT policies for `investing_rl8_writer` use the same tenant, principal, membership, Investigation, scope and source context equality when those columns exist; result/evidence-object relations without direct Investigation use their parent run-input/result FK path.

No UPDATE policy exists. No DELETE policy exists.

## 13. Authority FKs and append-only checks

Protocol table has no authority FK because protocol scientific identity is global and reusable. Transition rows MUST include FK `(tenant_membership_id, tenant_id, principal_id)` to `investing.tenant_memberships` and FK `(research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context)` to `investing.research_investigations`. Every upstream evidence row FK must prove the exact tuple frozen in section 7. Row UUID alone is never trusted.

Scientific protocol and transition rows are immutable. `UPDATE authority = none`; `DELETE authority = none`. Both tables MUST have BEFORE UPDATE OR DELETE trigger `investing.reject_research_scientific_promotion_update_delete_v1()`.

Structural checks must prove canonical payload agrees with columns: `canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_TRANSITION_V1'`, transition.protocol envelope equals `SHA-256 / SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1 / SYNTRAKE_SHA256_V1 / protocol_hash_hex`, and `research_scientific_promotion_protocol_identity_id` resolves to the protocol row whose exact fields are `SHA-256 / SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1 / SYNTRAKE_SHA256_V1 / protocol_hash_hex`, subject Experiment HashRef equals columns, predecessorState equals `predecessor_state`, resultingState equals `resulting_state`, lifecycle references match lifecycle columns, evidenceSnapshot HashRefs/nulls match the nine operational FK/hash columns, transition HashRef domain/version equals `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1` and `SYNTRAKE_SHA256_V1`. Current root/evaluation writers additionally enforce protocol id `SCIENTIFIC_PROMOTION_PROTOCOL_V20261002` and current HashRef `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`.


## 13A. Snapshot HashRef envelopes and transition structural validation

Every non-null canonical evidenceSnapshot entry must use `hashAlgorithm = SHA-256`, `hashVersion = SYNTRAKE_SHA256_V1`, uppercase 64-hex `hashHex`, and the exact domain:

```text
runInput = SYNTRAKE:RUN_INPUT:V1
result = SYNTRAKE:RESULT:V1
evidenceObject = SYNTRAKE:EVIDENCE_OBJECT:V1
validationProtocol = SYNTRAKE:VALIDATION_PROTOCOL:V1
validationResult = SYNTRAKE:VALIDATION_RESULT:V1
validationAssessmentProtocol = SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1
validationAssessmentResult = SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1
robustnessComparisonProtocol = SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1
robustnessComparisonResult = SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1
```

Root structural validation: `DRAFT_RESEARCH -> EXECUTED`, `predecessorTransition = null`, exact root snapshot, `gateOutcomes = []`, `transitionReasons = []`, and all lifecycle links null.

Stage A structural validation: source is exactly one of `EXECUTED`, `INSUFFICIENT_EVIDENCE`, `PROMOTION_ELIGIBLE`, `REJECTED`; result is exactly one of `INSUFFICIENT_EVIDENCE`, `VALIDATION_FAILED`, `VALIDATION_PASSED`; exact snapshot presence row for resulting state; exactly 11 gate IDs each once; no lifecycle links. Forbidden state edges fail. This is structural integrity, not a reimplementation of RL-8B decision math.

Stage A gate structural shape requires exactly these 11 gate IDs, each exactly once:

```text
GATE_ACCEPTED_EXECUTION_RESULT
GATE_AUTHORITY_AND_TENANCY
GATE_EVIDENCE_COMPLETENESS
GATE_EVIDENCE_OBJECT_BINDING
GATE_LINEAGE_INTEGRITY
GATE_METRIC_RESULT_SET_V2
GATE_PROTOCOL_COMPATIBILITY
GATE_RL7_ROBUSTNESS_COMPARISON
GATE_SUBJECT_IDENTITY
GATE_VALIDATION_ASSESSMENT
GATE_VALIDATION_RESULT
```

Each gate status must be one of exactly:

```text
FAIL
INCOMPATIBLE_EVIDENCE
INSUFFICIENT_EVIDENCE
PASS
UNAVAILABLE
```

Malformed, unknown, missing or duplicate gates must not persist.

## 14. Database canonical JSON and hash verification

The database writer must not accept a caller-provided RL-8 scientific hash blindly. RL-8C freezes an RL-8-specific deterministic SQL canonical JSON/hash verifier.

Accepted RL-8 scientific payload values contain only `null`, `boolean`, `string`, `array`, and `object`. Canonical JSON numbers are forbidden. The SQL canonicalizer mirrors accepted `syntrakeCanonicalJsonV1` rules:

```text
object keys sorted lexicographically by Unicode code points
comparator compares scalar code points left-to-right; first non-equal code point decides; if one string is a prefix of the other, shorter string first
no whitespace
arrays preserve order
strings JSON-escaped exactly: quote -> \", backslash -> \\, BACKSPACE -> \b, TAB -> \t, LF -> \n, FORM FEED -> \f, CR -> \r, other U+0000..U+001F -> lowercase \u00xx
all other valid Unicode scalars emitted directly as UTF-8
invalid Unicode scalar sequences rejected
slash is not escaped
non-ASCII characters are not arbitrarily ASCII-escaped
object separators are exactly comma and colon
booleans are exactly lowercase true/false
null is exactly null
numbers rejected recursively
undefined impossible
ordering is Unicode-code-point order, not locale-dependent collation
PostgreSQL 17 parity tests include non-ASCII keys/values and control-character escaping
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
Protocol canonical bytes SHA-256 = A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012
Current protocol HashRef = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C
Root canonical bytes SHA-256 = 3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1
Root HashRef = 3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F
PASS Stage-A = BEEE521649E78934DCE216B8650F51B86F8BAE80A9A8EA5600321D1F2BB263A4
PASS closure = 98A85178DFF04F3598215DF0AB51CF819B8C43CA74C1F5AA74EC42E00B19D531
FAIL Stage-A = F3438AB40774749A8248BAE9C070E51448515BA39167B7DF9672414B55596DF0
FAIL closure = 76D3E5A550D8B5766B8F77F8FB0A3E22024FEFA1C504ED64E3AAB69E5C512E04
INSUFFICIENT Stage-A = D6135FFEAA229F0B870375333D602AE05974DE9AD424587CBBEFB82F9F8EF738
```

A mismatch blocks RL-8C. RL-8C must not introduce a second canonicalization standard. Writer signatures use jsonb; scientific identity is computed over the parsed canonical logical object, not caller raw JSON text. The writer must reject number values recursively, enforce exact closed payload structure, canonicalize the resulting JSONB logical value with the RL-8 SQL canonicalizer, and compute scientific hash from those canonical bytes. Raw input key ordering and whitespace are never scientific identity. Hash format is exact: `SHA-256`, `SYNTRAKE_SHA256_V1`, `64 uppercase hex`. No lowercase normalization at persistence time.

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

Future executable migration MUST prove clean migration replay on PostgreSQL 17; authority gate with valid OWNER + ACTIVE exact tuple -> PASS; wrong tenant_membership_id -> BLOCKED; correct membership ID but wrong tenant -> BLOCKED; correct membership ID but wrong principal -> BLOCKED; role != OWNER -> BLOCKED; state = REVOKED -> BLOCKED; missing membership row -> BLOCKED; fake GUC tuple with no matching membership -> BLOCKED; valid membership but wrong Investigation -> BLOCKED; no scientific row may be inserted in any failing authority case; SECURITY DEFINER regression proves invoking as investing_app with forged custom GUC values cannot bypass tenant_memberships + research_investigations authority resolution because elevated table capability is not authorization; owner = investing_owner; `investing_rl8_writer` role attributes exact and NOBYPASSRLS; `investing_app` is not a member of `investing_rl8_writer`; `service_role` is not a member of `investing_rl8_writer`; RLS enabled; FORCE RLS enabled; forbidden grants absent; SECURITY DEFINER allowlist contains exactly four RL-8 writer functions; writer search_path safe; SQL canonical protocol hash equals `122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C`; SQL transition golden hashes match RL-8B runtime golden hashes; exact protocol retry -> REUSED_IDENTICAL; divergent protocol -> conflict; exact root retry -> REUSED_IDENTICAL; concurrent identical roots -> one row / both deterministic results; concurrent divergent roots -> one winner / one DIVERGENT; exact Stage-A pair retry -> REUSED_IDENTICAL; concurrent identical Stage-A pair -> one pair only; concurrent divergent successor -> one winner / one DIVERGENT; VALIDATION_PASSED orphan commit -> impossible; VALIDATION_FAILED orphan commit -> impossible; closure COPY violation -> blocked; pair rollback -> neither row remains; INSUFFICIENT Stage-A -> one row, no closure; wrong tenant -> blocked; wrong Investigation -> blocked; wrong membership -> blocked; service_role mutation -> blocked; anon/authenticated/public mutation -> blocked; UPDATE blocked; DELETE blocked; upstream HashRef without accepted operational row -> blocked; upstream row from wrong Investigation -> blocked; run input relation is `investing.run_inputs_scientific_identities`; SUPERSEDED dangling root -> blocked; SUPERSEDED same protocol -> blocked; cross-protocol fixture current chain protocol = A; successor root protocol = B; A != B; SUPERSEDED A -> B accepted; A -> A supersession rejected; mismatched successor protocol ID/hash rejected; successor root protocol != supplied successor protocol rejected; future root cannot be created through CURRENT V1 root writer unless explicitly admitted by future authority; SUPERSEDED subject mismatch -> blocked; SUPERSEDED copy violation -> blocked; SUPERSEDED cycle -> blocked; partial-null predecessor identity/hash pair -> blocked; partial-null rejected identity/hash pair -> blocked; partial-null supersedes identity/hash pair -> blocked; partial-null successor protocol identity/hash pair -> blocked; partial-null successor root identity/hash pair -> blocked; successor identity/hash mismatch -> blocked; successor wrong tenant -> blocked; successor wrong Investigation -> blocked; successor wrong subject -> blocked; successor wrong successor protocol identity/hash -> blocked; successor target VALIDATION_PASSED instead of ROOT -> blocked; successor target EXECUTED but non-null predecessor -> blocked; successor root with lifecycle links populated -> blocked; reconstruction with multiple successors -> fail closed.

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
