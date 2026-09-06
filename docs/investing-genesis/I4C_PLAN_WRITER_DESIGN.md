# Syntrake Investing Genesis I4-C Plan Writer Candidate

Status: I4-C source candidate for independent audit.

Parent: 812b2ea11f8696abcc55f00d70beff85f0701733

I4-C implements candidate source only for the authorized Plan writer. It does
not start I4-D, apply SQL, create a Supabase migration, touch Production,
deploy, create UI, create recommendations, mutate Trading, or widen any
unrelated I2/I3 privilege.

## Frozen I4-B Gate

```text
I4-B DEPENDENCY AUDIT EXECUTION = UNAVAILABLE
FAILURE CAUSE = EXTERNAL NPM AUDIT SERVICE 503
NEW CODE FAILURE = NO EVIDENCE
DEPENDENCY FILE CHANGE = NONE
I4-C BLOCKER FROM THIS FAILURE = NO
I4-B FROZEN SHA = 812b2ea11f8696abcc55f00d70beff85f0701733
```

The dependency-audit result is not recorded as PASS.

## Scope

I4-C adds:

```text
lib/investing/plan/writer.ts
docs/investing-genesis/I4C_PLAN_WRITER_DESIGN.md
docs/investing-genesis/sql/I4C_PLAN_WRITER_CANDIDATE.sql
tests/investingGenesisI4PlanWriterCandidate.test.ts
```

The only material V1 operations are:

```text
PLAN_INITIALIZE_V1
PLAN_CREATE_AND_ACTIVATE_REVISION_V1
```

No standalone create, standalone activate, deactivate, inactive committed draft,
arbitrary branch, last-write-wins, financial ledger write, Trading import,
Research Lab implementation, recommendation, suitability, or execution path is
introduced.

## Writer Contract

```text
PLAN_MATERIAL_INTENT_WRITER_V1 = USER_PRINCIPAL_ONLY
service_role = capability, never authorization
accountId = untrusted selector
tenant derived canonically
transactional authority revalidation
FROZEN/CLOSED account mutations blocked
```

The runtime writer requires a branded `AuthorizedInvestingContext` from the
accepted I2 authority path, but the context is not treated as sufficient
authority. Every request first revalidates current disclosure authority:
Principal ACTIVE and bound to the Clerk external subject, Tenant ACTIVE, exact
OWNER TenantMembership ACTIVE, exact OWNER AccountAccess ACTIVE, and the exact
Tenant/Account tuple. Account state may be ACTIVE, FROZEN, or CLOSED for
historical disclosure and exact terminal replay. New material mutation then
requires Account ACTIVE before it can create a STARTED idempotency row or any
Plan effect.

The writer sets transaction-local context for:

- actor and external identity;
- Principal/Tenant/Account;
- membership and account access;
- operation and `PLAN_WRITE`;
- idempotency key and record;
- material request hash;
- Plan root/revision and expected active predecessor where applicable.

Stale pre-existing transaction context is fail-closed.

## Atomicity

`PLAN_INITIALIZE_V1` commits atomically:

```text
PlanRoot
+ initial PlanRevision #1
+ active pointer
+ terminal SUCCEEDED idempotency result
+ exactly one success audit binding/event
```

`PLAN_CREATE_AND_ACTIVATE_REVISION_V1` requires exact:

```text
plan_root_id
expected_active_revision_id
expected_active_version
new canonical Plan content/hash
```

It serializes on the PlanRoot row, requires predecessor/version CAS, creates the
successor revision, moves the active pointer once, finalizes idempotency, and
writes success audit in the same transaction.

## Idempotency

The writer uses the accepted idempotency table and operation-specific material
hash from I4-B. Same key plus same material replays the exact canonical result.
Same key plus different material conflicts before material effect. STARTED and
FAILED states are not replayed as success.

After `INSERT ... ON CONFLICT DO NOTHING`, a loser reads the existing
idempotency row through the normal idempotency SELECT/disclosure policy rather
than trying to lock terminal rows through the STARTED-only UPDATE policy. This
keeps `SUCCEEDED`, `CONFLICT`, `FAILED`, and `STARTED` terminal dispatch visible
for exact replay or fail-closed handling after a concurrent insert race.

Frozen terminal dispatch uses the exact I4-A terminal semantics:

```text
SUCCEEDED + same material hash = exact authorized replay
SUCCEEDED + different material hash = CONFLICT + durable conflict audit
CONFLICT = CONFLICT terminal replay without duplicate conflict audit
committed STARTED = INTERNAL_ERROR fail closed
FAILED = INTERNAL_ERROR fail closed
```

`canonical_result_reference` persisted in `idempotency_records` uses the frozen
I4-B database JSON shape:

```text
plan_root_id
plan_revision_id
active_version
plan_revision_content_hash
```

The public TypeScript success result remains camelCase. I4-C translates at the
persistence/replay boundary because frozen I4-B deferred commit guards read
exactly `v_result ->> 'plan_root_id'` and
`v_result ->> 'plan_revision_id'`.

For FROZEN/CLOSED accounts, only `SUCCEEDED + same material hash` can replay.
Same-key different material, STARTED, FAILED, missing idempotency, or any new
mutation remains blocked and does not create a new STARTED idempotency request,
PlanRoot, PlanRevision, active pointer transition, or success audit.

Different-key initialization that races against an existing root rolls back the
candidate effect to a savepoint. If the canonical winner is the same initial
content, the new idempotency record is completed as a replay of the canonical
winner; otherwise it becomes a conflict with no Plan effect.
Later retry of that loser idempotency is also replayable: replay validation
checks the canonical referenced PlanRevision, content schema/hash, material
hash, tenant/account/root/revision identity, operation, and initialization
lineage. It does not require the canonical PlanRevision producer
`idempotency_record_id` to equal the replaying loser idempotency row.

Different-key create-and-activate races use operation-specific material
semantics. If the locked root already moved from the requested predecessor to
the exact successor version and the active revision proves the same root,
predecessor id/number, content schema, content hash, material request hash, and
tenant/account scope, the losing request completes its own idempotency as an
authorized replay of that canonical winner. It does not create a second
revision, second active transition, or duplicate success audit. Any different
material or arbitrary later revision is a conflict. Later retry of the loser
uses the same canonical-reference replay path and validates successor lineage
without requiring producer idempotency identity equality.

## Audit

Success audit is part of the Plan material transaction and binds to the exact
PlanRevision through `plan_revision_success_audit_bindings`.

Authority denials after a durable Principal/account tuple are routed to the
accepted `AUTHORITY_ACCESS_DENIED` audit pattern outside the rolled-back
material transaction. Audit failure never converts denial into success.

I4-C freezes an explicit conflict audit vocabulary:

```text
action = PLAN_MUTATION_CONFLICT
object_type = IDEMPOTENCY_RECORD
outcome = CONFLICT
reason_code in (
  I4_IDEMPOTENCY_MATERIAL_CONFLICT,
  I4_INITIAL_PLAN_ROOT_MATERIAL_CONFLICT,
  I4_PLAN_STALE_ACTIVE_POINTER,
  I4_PLAN_STALE_ACTIVE_POINTER_AFTER_INSERT
)
```

Conflict evidence is durable, creates no Plan material effect, and preserves
correlation id, actor/principal, tenant/account, operation, idempotency
identity, material hash, expected predecessor/version where applicable,
observed predecessor/version where applicable, safely disclosable winner
material/content hash where applicable, and conflict reason.

## Runtime RLS Candidate

`I4C_PLAN_WRITER_CANDIDATE.sql` keeps:

```text
actual runtime role = investing_app
RLS = ENABLED
FORCE RLS = ENABLED
PUBLIC = closed
anon = closed
authenticated = closed
service_role = no Plan runtime authorization
```

It grants only the minimal `investing_app` table privileges required for the
writer and operation-scoped policies for idempotency, PlanRoot, PlanRevision,
success audit binding, and audit event inserts. Because I4-B commit guards are
`SECURITY INVOKER`, I4-C also grants the narrow SELECT surface those guards need
to read exact PlanRoot, IdempotencyRecord, success audit binding, success
AuditEvent, and PlanRevision rows. It does not widen unrelated I2/I3 privileges.

I4-C preserves the accepted I2-C `INITIAL_PERSONAL_BOOTSTRAP` capability. The
predecessor already grants `investing_app` table-level SELECT and INSERT on
`principals`, `tenants`, `tenant_memberships`, `accounts`, and
`account_access` for the operation-scoped bootstrap policies:
`principals_i2c_bootstrap_insert`, `tenants_i2c_bootstrap_insert`,
`tenant_memberships_i2c_bootstrap_insert`, `accounts_i2c_bootstrap_insert`, and
`account_access_i2c_bootstrap_insert`. I4-C must neither revoke nor require
removal of those inherited INSERT privileges, and must not add authority-table
UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, or any other
authority-table privilege beyond that predecessor surface. The only
authority-table UPDATE capability remains the existing narrow column UPDATE
lock grants.

The candidate adds exact PLAN_WRITE authority revalidation policies on
`principals`, `tenants`, `accounts`, `tenant_memberships`, and
`account_access`. Each table has a narrow exact-row SELECT policy plus a
matching UPDATE policy with `WITH CHECK (false)` so `SELECT ... FOR UPDATE`
can lock the row without permitting authority-row mutation. Membership and
access revalidation reads are exact-row and state-independent enough to observe
`REVOKED`, but remain operation-scoped, tuple-bound, and non-enumerable.

PlanRoot and PlanRevision read policies require the current disclosure authority
graph, not GUCs alone. They bind tenant/account and, when transaction-local
Plan root/revision identifiers are available, bind those exact identifiers.
Account FROZEN/CLOSED is allowed only for historical disclosure.

The PlanRoot UPDATE policy intentionally separates row visibility from the CAS
predicate. Its `USING` clause allows an ACTIVE-authorized writer to see and lock
the exact tenant/account/root row even if the active pointer is already stale,
so the TypeScript writer can classify stale predecessors deterministically.
The new pointer, version increment, operation, and ACTIVE authority graph remain
enforced by `WITH CHECK`, the SQL UPDATE predicate, and the frozen I4-B deferred
guards.

Every material Plan write policy independently requires the ACTIVE authority
graph: Principal ACTIVE and bound to Clerk external subject, Tenant ACTIVE,
Account ACTIVE, exact OWNER TenantMembership ACTIVE, exact OWNER AccountAccess
ACTIVE, and one tenant/account/principal/membership/access tuple. Denial audit
does not require active membership/access because inactive rows are the evidence
being audited, but it still binds durable Principal/external subject and the
canonical Account/Tenant tuple.

Success and conflict audit policies are operation-scoped to the two Plan V1
operations, require `PLAN_WRITE` where they are part of the material
transaction, and bind conflict `object_id` to the canonical idempotency record.
Conflict audit insertion independently proves that `object_id` names an
existing `idempotency_records` row for the exact actor/principal/tenant/account/
operation/key scope. That proof intentionally does not require the stored
idempotency material hash to equal the current request material hash, because a
same-key/different-material conflict must point at the original idempotency row
while recording the conflicting request material in audit evidence.

The only new function execution grant is:

```text
GRANT EXECUTE ON FUNCTION investing.i4_plan_content_bytes_are_canonical_v1(bytea) TO investing_app
```

PUBLIC, anon, authenticated, service_role, and all other I4 guard/helper
functions remain unexecutable by `investing_app`.

## Static Proofs

The focused I4-C tests prove source structure, canonical byte/hash parity with
I4-B vectors, orchestration-level authority rejection paths, frozen idempotency
dispatch, same-material successor replay, CAS query shape, success/denial/
conflict audit shape, static RLS/grant boundaries, and isolation from Trading.
The fake client is not a PostgreSQL RLS emulator.

## TO_PROVE_IN_I4_D

The following require real PostgreSQL execution and are intentionally not
claimed as proven by TypeScript:

- actual RLS/FORCE behavior under `investing_app`;
- `SELECT ... FOR UPDATE` authority-row and PlanRoot locking through the exact
  I4-C SELECT plus fail-closed or CAS-preserving UPDATE policies;
- deferrable I4-B constraint behavior at commit;
- concurrent duplicate initialize convergence;
- concurrent create-and-activate conflict behavior;
- concurrent same-material create-and-activate replay of the canonical winner;
- rollback absence of orphan Plan effects after injected DB errors;
- success audit/idempotency/PlanRevision circular deferred constraint closure;
- policy deparse tolerance on PostgreSQL 17;
- lock ordering and transaction serialization under live contention.
