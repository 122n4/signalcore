# Investing Genesis I1 Authority Design

PARENT_SHA =
e0de1ed6fbea9f1d276b5e50228f995543af8be0

I1 is design and threat model only. It does not create runtime code, APIs, UI, SQL, migrations, Supabase mutations, or Vercel mutations.

I0 remains the controlling Constitution. This document narrows I1 authority semantics for future implementation.

## Verified Inputs

- Clerk is the authenticated identity provider.
- `lib/auth/requestUser.ts` and `getRequestUserId` MUST NOT be used as Investing Genesis authority because that path includes local QA bypass behavior.
- Client-provided `userId`, `tenantId`, and `accountId` are selectors or request inputs only. They are not ownership proof.
- `service_role` is database transport power. `service_role != authorization`.
- `service_role != system authorization`.
- Current live Supabase project: `qdnvbamoamtkujzwrxdb`.
- Current live PostgreSQL version: `17.6.1.063`.
- Current live `investing` schema: absent.
- Current live active Investing DB objects: zero.
- Existing Supabase branch `phase4-7-migration-audit` is STALE and MUST NOT be selected as Genesis development authority.
- DATA_API_EXPOSED_SCHEMA_CONFIGURATION = UNAVAILABLE / MUST VERIFY.
- FINAL_DB_TRANSPORT = UNRESOLVED GATE.

No historical Investing migrations, deleted files, old docs, or stale Supabase branches are Genesis design authority.

## Verified External Identity Binding

VERIFIED_EXTERNAL_IDENTITY =
identity_provider + external_subject

For Clerk:

```text
identity_provider = CLERK
external_subject = verified Clerk subject/user id
```

One verified external identity -> exactly one canonical Principal.

The binding between verified external identity and Principal must be:

- unique
- unambiguous
- immutable in I1
- non-reassignable in I1

More than one Principal matching the same verified Clerk identity must FAIL CLOSED with INTERNAL_ERROR.

A Principal must not be silently rebound from one external subject to another.

Identity migration or rebinding is future explicit scope only.

## Entity Model

Principal:
The canonical internal representation of an authenticated identity. A Principal is derived from a verified Clerk subject and persisted internally before it can participate in Investing authority.

Tenant:
The internal ownership boundary. A Tenant owns or contains Investing accounts and authority records. A Tenant is not a user.

TenantMembership:
The relationship that authorizes a Principal to act within a Tenant. I1 supports only the `OWNER` role.

InvestingAccount:
The financial authority boundary inside a Tenant. An InvestingAccount is not a Principal and is not a Tenant.

AccountAccess:
The relationship that authorizes a Principal, through a TenantMembership, to act on an InvestingAccount. I1 supports only the `OWNER` role.

AuthorizedInvestingContext:
A server-only, opaque, branded, operation-scoped authority object created only by the server authority boundary. It is not accepted from client input and is not deserialized from request payloads.

SystemActor:
A stable trusted internal actor identity for server-side jobs or internal operations. A SystemActor is not a Clerk user and must not fabricate a user principal.

AuditEvent:
An append-only operational authority event recording who or what attempted an operation, the scope, the target, the result, and the reason.

IdempotencyRecord:
A durable operation record binding a key to a material request hash, scope, actor, result, and conflict semantics.

Absolute identity invariant:

```text
Principal != Tenant != InvestingAccount
```

Authority relationship invariants:

```text
InvestingAccount belongs to exactly one canonical Tenant
TenantMembership binds Principal <-> Tenant
AccountAccess binds Principal/TenantMembership <-> InvestingAccount
```

In I1 these authority endpoints are immutable.

Silent reassignment is prohibited:

- InvestingAccount tenant reparenting
- TenantMembership principal/tenant reassignment
- AccountAccess principal/membership/account reassignment

Changes require revoke/close plus an explicit future operation, not an UPDATE that rewrites history.

## Initial Role Surface

I1 does not design collaboration, family sharing, teams, delegated advisors, or multi-role workflows.

Initial supported role:

```text
OWNER
```

`OWNER` applies only to:

- TenantMembership
- AccountAccess

The model may permit future role expansion, but I1 must not implement or imply speculative sharing behavior.

## User Authority Flow

Preferred APIs should use account selectors that do not require client `tenantId`.

`accountId` may be accepted as a selector only. Tenant ownership must be resolved canonically from persisted account ownership/access relationships.

ACCOUNT_SCOPE_CANONICAL_RESOLUTION = account-before-membership.

For ACCOUNT_SCOPE, canonical authority resolution order is:

```text
Clerk auth()
  -> verified external Clerk identity
  -> exactly one canonical Principal
  -> untrusted accountId selector
  -> canonical InvestingAccount lookup
  -> derive canonical tenant_id from InvestingAccount
  -> resolve exactly one ACTIVE TenantMembership for Principal + tenant
  -> resolve exactly one ACTIVE AccountAccess for Principal/membership + account
  -> validate the complete canonical authority tuple
  -> Tenant ACTIVE
  -> InvestingAccount state permits operation
  -> required capability/entitlement
  -> AuthorizedInvestingContext
```

Client IDs never prove ownership. They only select candidate records to be verified server-side.

Tenant must be derived from the canonical account for ACCOUNT_SCOPE.

`tenantId` supplied by a client MUST NOT be needed to establish ACCOUNT_SCOPE ownership.

An unexpected client `tenantId` must never influence canonical resolution.

Deterministic tenant selector behavior:

- an ACCOUNT_SCOPE API that does not contractually accept `tenantId` treats it as invalid/untrusted input
- a future genuine TENANT_SCOPE endpoint may accept `tenantId` only as selector and must prove membership server-side

For ACCOUNT_SCOPE the server must resolve one and only one internally consistent authority tuple:

```text
principal
membership
tenant
account_access
account
```

Required relationships must all agree.

Any mismatch must FAIL CLOSED with INTERNAL_ERROR.

Any multiplicity where exactly one active authority row is required must FAIL CLOSED with INTERNAL_ERROR:

- >1 ACTIVE matching TenantMembership
- >1 ACTIVE matching AccountAccess

Never select the first row. Never hide corruption with `LIMIT 1`.

## System Authority Flow

System authority flow:

```text
trusted internal invocation
  -> stable SYSTEM_ACTOR identity
  -> explicit allowed operation
  -> canonical operation scope
  -> canonical tenant/account resolution when ACCOUNT_SCOPE
  -> AuthorizedInvestingContext
```

A system actor MUST NOT fabricate a Clerk/user principal.

SYSTEM_ACTOR authority requires a stable actor identity, an explicit allowed operation, operation scope, and capability policy. It is not created by passing `service_role`, `userId`, `tenantId`, or `accountId` directly into a financial repository.

## AuthorizedInvestingContext Contract

AuthorizedInvestingContext must be:

- server-only
- opaque/branded
- non-client-constructible
- non-deserializable from request payload
- operation-scoped

It must carry enough canonical authority evidence for audit and revalidation:

- `actor_kind`
- `actor_id`
- `principal_id` when `USER_PRINCIPAL`
- `operation_scope`
- `tenant_id` when required
- `account_id` when required
- membership/access identity or version evidence
- `correlation_id`

It must not carry financial balances, positions, recommendations, execution decisions, or portfolio truth.

## Operation Scopes

ACCOUNT_SCOPE:
Requires canonical tenant and account authority. Material account mutations require authority revalidation inside the same mutation transaction.

TENANT_SCOPE:
Requires canonical tenant authority. It must not fabricate an account.

DOMAIN_SCOPE:
Requires a canonical domain operation and explicit system or user capability. It must not fabricate tenant or account identity.

## Lifecycle State Model

Principal states:

- ACTIVE
- DISABLED

Tenant states:

- ACTIVE
- SUSPENDED
- CLOSED

TenantMembership states:

- ACTIVE
- REVOKED

InvestingAccount states:

- ACTIVE
- FROZEN
- CLOSED

AccountAccess states:

- ACTIVE
- REVOKED

Allowed normal transitions:

- Principal: ACTIVE -> DISABLED
- Tenant: ACTIVE -> SUSPENDED
- Tenant: ACTIVE -> CLOSED
- Tenant: SUSPENDED -> CLOSED
- TenantMembership: ACTIVE -> REVOKED
- InvestingAccount: ACTIVE -> FROZEN
- InvestingAccount: ACTIVE -> CLOSED
- InvestingAccount: FROZEN -> CLOSED
- AccountAccess: ACTIVE -> REVOKED

Forbidden in I1:

- DISABLED -> ACTIVE
- SUSPENDED -> ACTIVE
- CLOSED -> ACTIVE
- REVOKED -> ACTIVE
- FROZEN -> ACTIVE
- CLOSED -> FROZEN
- hard deletion as normal lifecycle for material authority records

Closed and revoked authority must not be silently reactivated by mutation. Re-activation, if ever allowed later, requires an explicit future contract.

## Account State Semantics

ACTIVE:
Normal permitted I1 operations.

FROZEN:
No financial mutation or execution. Read and audit access may remain according to future operation policy.

CLOSED:
No new financial mutations. Historical and audit access is preserved.

FROZEN and CLOSED must not be turned into deletion.

## Bootstrap Contract

INITIAL_PERSONAL_BOOTSTRAP is semantically unique for the canonical Principal.

INITIAL_PERSONAL_BOOTSTRAP != CREATE_ADDITIONAL_ACCOUNT.

CREATE_ADDITIONAL_ACCOUNT is future explicit scope.

Idempotency key alone is insufficient to prevent duplicate first-account authority graphs.

First account bootstrap is one atomic INITIAL_PERSONAL_BOOTSTRAP operation:

```text
canonical Principal
+ Tenant
+ OWNER TenantMembership
+ InvestingAccount
+ OWNER AccountAccess
+ AuditEvent
+ IdempotencyRecord
```

Partial bootstrap is forbidden.

Exact retry:

```text
SAME RESULT
NO DUPLICATE EFFECT
```

Same idempotency key with different material request:

```text
CONFLICT
FAIL CLOSED
```

Duplicate active Principal/Tenant/Account authority created by retry is forbidden.

Two concurrent first-bootstrap requests for the same Principal with different idempotency keys MUST NOT create two initial personal tenants/accounts.

Second INITIAL_PERSONAL_BOOTSTRAP after successful bootstrap must return the canonical initial result or fail closed according to the future implementation contract. It must not create a duplicate authority graph.

The exact mechanism or SQL constraint remains for implementation design.

## Authorization Revalidation

Request-time authorization alone is insufficient for material mutations.

Material writes must revalidate authority inside the same DB transaction used for the mutation.

At minimum, mutation-time revalidation must prove:

- Principal ACTIVE
- Tenant ACTIVE
- TenantMembership ACTIVE
- InvestingAccount state permits operation
- AccountAccess ACTIVE
- actor capability permits operation

Revocation, suspension, freezing, closing, and material writes require a serializable or locking strategy that prevents a stale AuthorizedInvestingContext from silently winning a race.

I1 defines the invariant only. It does not select final SQL locking syntax and does not create a migration.

## Fail-Closed Error Model

Internal classifications:

- UNAUTHENTICATED
- FORBIDDEN_OR_NOT_FOUND
- PRINCIPAL_DISABLED
- TENANT_INACTIVE
- MEMBERSHIP_INACTIVE
- ACCOUNT_INACTIVE
- ACCESS_INACTIVE
- CAPABILITY_DENIED
- CONFLICT
- INTERNAL_ERROR

External APIs must not disclose unauthorized account existence. Unauthorized, missing, cross-tenant, and inaccessible account selectors collapse to `FORBIDDEN_OR_NOT_FOUND` externally.

## Audit Requirements

AuditEvent != financial ledger.

Every material authority decision must be auditable with:

- actor kind
- actor id
- principal id when USER_PRINCIPAL
- operation scope
- tenant id when required
- account id when required
- membership/access identity or version evidence when applicable
- correlation id
- action
- target
- result
- failure classification
- recorded time

Missing authority evidence is itself a fail-closed condition and must be audit-visible without recording secrets or tokens.

Successful material authority/security mutations must commit their required audit evidence atomically with the mutation.

Denied or rolled-back operations must not lose required security/authority audit merely because the mutation transaction rolls back.

The exact storage mechanism is not selected in this design slice.

Audit mechanism failure MUST NEVER convert a denied or ambiguous operation into success.

Do not solve authority/security audit durability with financial ledger writes.

## Threat Matrix

| case | attack/precondition | authority checked | expected result | failure classification | audit requirement |
| --- | --- | --- | --- | --- | --- |
| User A selects Account B | Authenticated Principal A sends Account B selector | Principal, TenantMembership, AccountAccess, account tenant relationship | Reject without revealing Account B | FORBIDDEN_OR_NOT_FOUND | Actor A, selector hash/reference, denied account access |
| User A supplies Tenant B | Principal A sends another tenant id to an ACCOUNT_SCOPE endpoint | Tenant derived from canonical account; unexpected tenantId is invalid/untrusted input | Reject deterministic invalid/untrusted tenant input | FORBIDDEN_OR_NOT_FOUND | Actor A, supplied tenant selector, canonical mismatch |
| forged userId | Request body/query contains fake userId | Clerk subject to canonical Principal | Reject client userId authority | FORBIDDEN_OR_NOT_FOUND | Actor from Clerk, forged input noted without trusting it |
| forged accountId | Request contains accountId not accessible to actor | AccountAccess ACTIVE for canonical Principal/Tenant | Reject | FORBIDDEN_OR_NOT_FOUND | Actor, account selector, access failure |
| forged tenantId | Request contains tenantId not linked to canonical access | Tenant resolved from persisted authority | Reject | FORBIDDEN_OR_NOT_FOUND | Actor, tenant selector, mismatch |
| duplicate Principal records for same Clerk subject | More than one Principal matches the same verified Clerk identity | Verified external identity -> exactly one canonical Principal | Fail closed; do not choose first Principal | INTERNAL_ERROR | Clerk identity, duplicate Principal evidence |
| attempted external identity reassignment | Mutation attempts to rebind Principal from one external subject to another | External identity binding immutable/non-reassignable in I1 | Reject | INTERNAL_ERROR | Principal id, old identity, attempted new identity |
| serialized/fabricated AuthorizedInvestingContext | Client sends context-shaped payload | Context is server-only and non-deserializable | Reject | FORBIDDEN_OR_NOT_FOUND | Actor, fabricated context attempt |
| direct repository call with service_role | Internal code calls repository with only service_role | AuthorizedInvestingContext required | Reject by type/runtime boundary | INTERNAL_ERROR | Caller, missing context, blocked repository access |
| fake SYSTEM_ACTOR | Untrusted invocation claims system identity | Trusted internal invocation and stable actor registry | Reject | FORBIDDEN_OR_NOT_FOUND | Invocation source, claimed actor |
| SYSTEM_ACTOR missing capability | Real system actor requests disallowed operation | Explicit allowed operation and capability policy | Reject | CAPABILITY_DENIED | System actor, operation, capability denial |
| Principal DISABLED | Principal exists but disabled | Principal ACTIVE | Reject | PRINCIPAL_DISABLED | Principal id, operation, disabled state |
| Tenant SUSPENDED | Tenant exists but suspended | Tenant ACTIVE for normal operation | Reject material operation | TENANT_INACTIVE | Tenant id, suspended state |
| Tenant CLOSED | Tenant exists but closed | Tenant ACTIVE | Reject | TENANT_INACTIVE | Tenant id, closed state |
| TenantMembership REVOKED | Membership was revoked | TenantMembership ACTIVE | Reject | MEMBERSHIP_INACTIVE | Membership id/version, revoked state |
| AccountAccess REVOKED | Account access was revoked | AccountAccess ACTIVE | Reject | ACCESS_INACTIVE | Access id/version, revoked state |
| Account FROZEN | Account is frozen | InvestingAccount state permits operation | Reject financial mutation/execution | ACCOUNT_INACTIVE | Account id, frozen state, attempted operation |
| Account CLOSED | Account is closed | InvestingAccount ACTIVE for new mutation | Reject new financial mutation | ACCOUNT_INACTIVE | Account id, closed state |
| membership revoked between resolve and mutation | Race after request-time context creation | Revalidation inside mutation transaction | Reject stale mutation | MEMBERSHIP_INACTIVE | Context evidence, revalidation version mismatch |
| account frozen between resolve and mutation | Race after request-time context creation | Revalidation inside mutation transaction | Reject stale mutation | ACCOUNT_INACTIVE | Account state/version mismatch |
| concurrent initial bootstrap with same key | Same INITIAL_PERSONAL_BOOTSTRAP request runs concurrently with same idempotency key | IdempotencyRecord and atomic bootstrap transaction | Exactly one canonical initial result; no duplicate authority graph | CONFLICT only if payload differs | Idempotency key, request hash, canonical result |
| concurrent initial bootstrap with different keys | Same Principal sends concurrent INITIAL_PERSONAL_BOOTSTRAP requests with different idempotency keys | Semantic uniqueness for canonical Principal, not idempotency key alone | Exactly one canonical initial result; no duplicate authority graph | CONFLICT or same canonical result per future contract | Principal id, competing keys, canonical result |
| second initial bootstrap after successful bootstrap | Principal already has completed INITIAL_PERSONAL_BOOTSTRAP | INITIAL_PERSONAL_BOOTSTRAP semantic uniqueness | Return canonical initial result or fail closed; never create duplicate graph | CONFLICT or FORBIDDEN_OR_NOT_FOUND per future contract | Principal id, existing bootstrap evidence |
| same idempotency key + different payload | Key reused with different material request | Request/content hash bound to IdempotencyRecord | Reject | CONFLICT | Key, old hash, new hash |
| duplicate active membership corruption | More than one active owner membership found | Unambiguous active TenantMembership | Fail closed | INTERNAL_ERROR | Principal, tenant, duplicate membership evidence |
| duplicate active AccountAccess | More than one active account access row matches Principal/membership/account | Unambiguous active AccountAccess | Fail closed; never hide with LIMIT 1 | INTERNAL_ERROR | Principal, membership, account, duplicate access evidence |
| account/tenant relationship corruption | Account tenant does not match access/membership tenant | Canonical account/access/tenant relationship | Fail closed | INTERNAL_ERROR | Account, access, tenant mismatch |
| account tenant reassignment attempt | Mutation attempts to reparent InvestingAccount to another Tenant | InvestingAccount tenant endpoint immutable in I1 | Reject; require close/revoke plus future explicit operation | INTERNAL_ERROR | Account id, old tenant, attempted new tenant |
| membership endpoint reassignment attempt | Mutation attempts to rewrite TenantMembership principal or tenant | TenantMembership endpoints immutable in I1 | Reject; require revoke plus future explicit operation | INTERNAL_ERROR | Membership id, old endpoints, attempted endpoints |
| account access endpoint reassignment attempt | Mutation attempts to rewrite AccountAccess principal, membership, or account | AccountAccess endpoints immutable in I1 | Reject; require revoke plus future explicit operation | INTERNAL_ERROR | Access id, old endpoints, attempted endpoints |
| missing authority evidence | Context lacks membership/access/version/correlation evidence | AuthorizedInvestingContext evidence completeness | Reject | INTERNAL_ERROR | Missing evidence fields |
| authority denied after transactional revalidation and transaction rolls back | Mutation transaction revalidates authority, detects denial, then rolls back mutation | Denial audit durability independent of mutation commit | Mutation absent and denial remains durably audit-visible | MEMBERSHIP_INACTIVE, ACCOUNT_INACTIVE, ACCESS_INACTIVE, or INTERNAL_ERROR | Durable denial audit with actor, scope, target, reason |

THREAT_CASE_COUNT = 32

## Database Boundary

Design only.

Target schema remains:

```text
investing.*
```

DATA_API_EXPOSED_SCHEMA_CONFIGURATION = UNAVAILABLE / MUST VERIFY

FINAL_DB_TRANSPORT = UNRESOLVED GATE

OPTION A: Supabase Data API / service_role transport

Security requirements if selected later:

- financial tables are never exposed directly to browser `anon` or `authenticated` clients
- `service_role` is only transport power, never authorization
- every financial repository requires AuthorizedInvestingContext
- writes revalidate authority in the mutation transaction
- exposed schemas and grants must be verified before use
- no SECURITY DEFINER shortcut may bypass I1 authority

OPTION B: direct PostgreSQL/Supavisor with dedicated application role

Security requirements if selected later:

- dedicated application role has only required privileges
- browser clients never receive direct financial table access
- every financial repository requires AuthorizedInvestingContext
- writes revalidate authority in the mutation transaction
- connection/session identity must not be confused with end-user authority
- SQL functions, views, and grants must preserve fail-closed authorization

I1 does not select PostgREST, Supabase Data API, direct PostgreSQL, or Supavisor. DB_TRANSPORT_DECISION = UNRESOLVED.

## Explicit Non-Scope

- NO_DASHBOARD_UI_SCOPE = TRUE
- no product dashboard
- no UI discovery
- no Trading modification
- no runtime Investing implementation
- no Supabase mutation
- no SQL
- no migration
- no package install
- no PR or push
