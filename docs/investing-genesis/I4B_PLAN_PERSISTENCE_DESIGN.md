# Syntrake Investing Genesis I4-B Plan Persistence Design

Status: I4-B corrected candidate for independent audit.

Parent: 8d45b1f57305f3d9b1e44705915739c6c5796269

I4-B defines the persistence/schema candidate for immutable Plan user intent.
It does not implement I4-C runtime writing, public API, UI, recommendations,
execution, Trading, Supabase deployment, or Production mutation.

## Scope

I4-B creates candidate source artifacts only:

```text
docs/investing-genesis/I4B_CANONICAL_BYTES_CONTRACT.md
docs/investing-genesis/I4B_PLAN_PERSISTENCE_DESIGN.md
docs/investing-genesis/sql/I4B_PLAN_PERSISTENCE_CANDIDATE.sql
tests/investingGenesisI4PlanPersistenceCandidate.test.ts
```

The historical pre-Genesis Plan migrations are `HISTORICAL_LINEAGE_ONLY` and
are not copied as authority:

```text
20260816202000_investing_canonical_plan_persistence_schema
20260817023650_investing_canonical_plan_persistence_writer
```

## Content Model

Plan remains:

```text
PLAN = USER_INTENT
PLAN != MARKET_TRUTH
PLAN != PORTFOLIO_TRUTH
PLAN != RECOMMENDATION
PLAN != EXECUTION
```

The exact V1 content byte contract is frozen in
`I4B_CANONICAL_BYTES_CONTRACT.md`. I4-B removes the unsafe redundant
`canonical_content jsonb` representation from the failed candidate. The
database stores one canonical content truth:

```text
canonical_content_bytes
plan_revision_content_hash
```

The candidate adds a DB validator:

```text
investing.i4_plan_content_bytes_are_canonical_v1(bytea)
```

and a DB hash check. Arbitrary bytea plus matching SHA is not sufficient; bytes
must conform to the frozen V1 grammar and length bounds.

## Tables

I4-B defines:

```text
investing.plan_roots
investing.plan_revisions
investing.plan_revision_success_audit_bindings
```

Canonical Plan scope:

```text
(tenant_id, account_id, plan_root_id)
```

PlanRevision identity:

```text
tenant_id
account_id
plan_root_id
plan_revision_id
```

`PLAN_REVISION_CONTENT_HASH` is immutable evidence, not revision identity.

## PlanRoot Cardinality and Active Pointer

V1 freezes:

```text
ONE_CANONICAL_PLAN_ROOT_PER_ACCOUNT_V1 = YES
PLAN_ROOT_CARDINALITY_PRE_INITIALIZATION = 0
PLAN_ROOT_CARDINALITY_POST_INITIALIZATION = EXACTLY_1
ACTIVE_PLAN_REVISION_CARDINALITY_POST_INITIALIZATION = EXACTLY_1
INITIALIZED_PLAN_ROOT_REQUIRES_ACTIVE_REVISION = TRUE
ACTIVE_POINTER_NULL_AFTER_INITIALIZATION = FORBIDDEN
PLAN_DEACTIVATE_REVISION_V1 = NOT_AVAILABLE_IN_V1
V1_NO_COMMITTED_INACTIVE_DRAFT_REVISIONS = TRUE
```

`plan_roots.active_plan_revision_id` is `NOT NULL`.
`plan_roots.active_version` must equal the active revision's
`revision_number`.

The active pointer uses a deferred composite FK:

```text
(tenant_id, account_id, plan_root_id, active_plan_revision_id, active_version)
  -> plan_revisions(
       tenant_id,
       account_id,
       plan_root_id,
       plan_revision_id,
       revision_number
     )
```

Initialization must commit with exactly one root, exactly one R1 initial
revision, `active_plan_revision_id = R1`, and `active_version = 1`. It must not
commit root + R1 + R2 with R2 active as one initialization effect.

## Linear Revision Lineage

`plan_revisions` is append-only. No ordinary update or delete is allowed.

The predecessor relationship is DB-proven by both id and number:

```text
(tenant_id, account_id, plan_root_id,
 predecessor_plan_revision_id, predecessor_revision_number)
  -> plan_revisions(
       tenant_id,
       account_id,
       plan_root_id,
       plan_revision_id,
       revision_number
     )
```

Therefore R(n) cannot point at an arbitrary revision while claiming
`predecessor_revision_number = n - 1`.

The candidate also enforces:

- exactly one R1 per root;
- one successor per predecessor;
- `revision_number = 1` only for `PLAN_INITIALIZE_V1`;
- `revision_number > 1` only for `PLAN_CREATE_AND_ACTIVATE_REVISION_V1`;
- no silent last-write-wins.

## Root Transition Guard

The root endpoint trigger forbids:

- hard delete;
- tenant/account/root reparenting;
- creator/idempotency/lineage mutation;
- metadata mutation;
- active pointer nulling;
- active version changes without pointer changes.

For an active pointer transition, the DB requires:

```text
NEW_REVISION.predecessor_plan_revision_id = OLD_ROOT.active_plan_revision_id
NEW_REVISION.predecessor_revision_number = OLD_ROOT.active_version
NEW_REVISION.revision_number = OLD_ROOT.active_version + 1
NEW_ROOT.active_version = NEW_REVISION.revision_number
```

This rejects skipped revisions, reactivation of old revisions, arbitrary same
root activation, and standalone deactivation.

## Authority Lineage

Each PlanRevision persists immutable mutation authority evidence:

```text
tenant_membership_id
account_access_id
principal_id
tenant_id
account_id
actor_kind
actor_id
operation_scope
operation
capability
```

The candidate adds a non-destructive composite identity key to
`investing.account_access` so a PlanRevision can bind exactly to:

```text
(account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
```

It also references the existing
`tenant_memberships_identity_tuple_key(tenant_membership_id, tenant_id,
principal_id)`.

I4-C must still revalidate current authority at execution time; I4-B preserves
which membership/access authorized the immutable effect.

## Idempotency and Atomic Result

I4-B extends the idempotency operation vocabulary only with:

```text
PLAN_INITIALIZE_V1
PLAN_CREATE_AND_ACTIVATE_REVISION_V1
```

It preserves the accepted predecessor I3 vocabulary and does not resurrect
unproven historical values such as `INITIAL_PAPER_CASH_FUNDING_SUCCEEDED` in
the audit action vocabulary.

At commit, every PlanRevision must bind to an idempotency record with:

```text
status = SUCCEEDED
same operation
same tenant/account
same Principal/actor
same material_request_hash
canonical_result_reference.plan_root_id = plan_root_id
canonical_result_reference.plan_revision_id = plan_revision_id
```

The JSON result reference is not sole authority; it must match the structured
PlanRevision row.

## Success Audit Atomicity

At commit, every PlanRevision must have exactly one success-audit binding.

The binding must match the revision's:

- tenant;
- account;
- root;
- revision;
- predecessor;
- Principal;
- actor;
- tenant membership;
- account access;
- operation;
- idempotency record;
- material request hash;
- correlation id.

The referenced `audit_events` row must itself match the binding:

```text
PLAN_INITIALIZE_V1
  -> action = PLAN_INITIALIZATION_SUCCEEDED
  -> object_type = PLAN_REVISION
  -> object_id = plan_revision_id::text
  -> outcome = SUCCEEDED
  -> reason_code IS NULL

PLAN_CREATE_AND_ACTIVATE_REVISION_V1
  -> action = PLAN_REVISION_ACTIVATED
  -> object_type = PLAN_REVISION
  -> object_id = plan_revision_id::text
  -> outcome = SUCCEEDED
  -> reason_code IS NULL
```

`PLAN_REVISION` is the success object because the revision is the immutable
result. `PLAN_ROOT` is not added to audit object vocabulary in I4-B; any future
root-scoped audit operation must widen vocabulary only in its own accepted slice.

## Security Posture

All new persistent objects live in `investing` and are owned by
`investing_owner`.

All Plan tables:

- enable RLS;
- force RLS;
- grant no privileges to `PUBLIC`, `anon`, `authenticated`, `service_role`, or
  `investing_app` in I4-B;
- create no runtime Plan RLS policies in I4-B.

I4-B uses `pg_catalog` ACL inspection with `aclexplode`, not
`information_schema.role_table_grants`, to prove PUBLIC/shared/runtime roles have
no Plan table privileges.

No `SECURITY DEFINER` function is introduced. Integrity functions use
`SECURITY INVOKER` and `search_path = pg_catalog`; every referenced Investing
object is schema-qualified.

The canonical-byte validator uses deterministic byte/`pg_catalog` checks for
record structure, ASCII controls, and TOKEN_SET ordering. It must not depend on
database default locale/collation.

## Predecessor State

I4-B prestate requires the accepted predecessor I3 state, including:

- I2/I3 authority tables owned by `investing_owner` with RLS and FORCE RLS;
- `idempotency_records_i2_ledger_material_tuple_key`;
- `I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1` in idempotency operation vocabulary;
- accepted audit action vocabulary through `I3_FILL_ACCOUNTING_SUCCEEDED`;
- accepted audit object type vocabulary through `I3_FILL`;
- exact critical I3 guard function identity and material body fingerprints;
- exact critical I3 trigger relation/function/deferrability fingerprints;
- exact critical I3 policy relation/command/role/body fingerprints for the
  accounting/seal/lineage authority surface;
- no unexpected PUBLIC/shared/destructive ACL privilege on the accepted I3
  surface;
- no pre-existing Plan relations/functions;
- no pre-existing Plan runtime policies.

This prevents I4-B from applying to stale I2-only or incomplete I3 databases.

## Open Gates

I4-B remains a candidate until independent audit and real PostgreSQL rehearsal.
I4-C must still implement runtime writer logic, operation-scoped RLS policies,
current authority revalidation, idempotency arbitration, canonical audit writes,
and denial routing.
