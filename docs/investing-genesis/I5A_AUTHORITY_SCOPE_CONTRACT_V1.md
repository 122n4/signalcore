# Syntrake Investing Genesis I5-A — Authority + Scope Contract V1

Status: `WORKING CONTRACT — NOT FROZEN`

Canonical predecessor: `5de091fcfe1f595d781f6cbc4eaa49ed49341398` (`I4 = FROZEN`).

I5 design branch at the start of this contract: `design/i5-research-lab-canonical-20260906` @ `1e6f3e123e9f90a7f098f3dfef7d0f2c1c898240`.

Product source: `SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md`, authoritative as a product/source specification for the **Research Lab / I5 only**. It is not authority for I6 or any other future Investing slice.

This contract closes the I5-A authority/scope design boundary. It does **not** authorize schema, migrations, runtime implementation, merge, production deploy, production DDL/DML, financial writes, broker access, paper execution, live execution, or recommendations.

---

# 1. Evidence classification at contract creation

The distinction below is mandatory.

## REAL / inherited runtime at I4

At the exact I4 predecessor, the runtime has a server-only runtime-branded `AuthorizedInvestingContext` and a real authority resolver for:

```text
ACTOR_KIND       = USER_PRINCIPAL
OPERATION_SCOPE  = ACCOUNT_SCOPE
RESOLVE_OPERATION = ACCOUNT_CONTEXT_RESOLVE
CAPABILITY        = ACCOUNT_AUTHORITY_READ
```

The resolver:

1. verifies Clerk identity server-side;
2. resolves exactly one canonical Principal;
3. accepts `accountId` only as an untrusted selector;
4. derives canonical `tenant_id` from the InvestingAccount;
5. resolves exactly one ACTIVE OWNER TenantMembership;
6. resolves exactly one ACTIVE OWNER AccountAccess;
7. validates the complete authority tuple;
8. requires active authority lifecycle state;
9. emits a runtime-branded context that cannot be reconstructed by ordinary client JSON.

I4 material Plan writes additionally revalidate authority under lock inside the mutation transaction before the material effect.

## DESIGNED IN I0/I1, RUNTIME UNAVAILABLE AT I4

I0/I1 already define the concepts:

```text
USER_PRINCIPAL
SYSTEM_ACTOR

ACCOUNT_SCOPE
TENANT_SCOPE
DOMAIN_SCOPE
```

but the I4 runtime type currently materializes only `USER_PRINCIPAL + ACCOUNT_SCOPE`.

Therefore, for I5 at the time of this contract:

```text
USER_PRINCIPAL + ACCOUNT_SCOPE = REAL PREDECESSOR CAPABILITY
USER_PRINCIPAL + TENANT_SCOPE  = DESIGN TARGET / RUNTIME UNAVAILABLE
USER_PRINCIPAL + DOMAIN_SCOPE  = DESIGN TARGET / RUNTIME UNAVAILABLE
SYSTEM_ACTOR + scoped authority = DESIGN TARGET / RUNTIME UNAVAILABLE
```

No I5 implementation may relabel a design-target authority path as REAL before implementation and a real authority rehearsal prove it.

---

# 2. Controlling authority law

I5 inherits these laws unchanged:

```text
Principal != Tenant != InvestingAccount

authentication != authorization
service_role != authorization
service_role != system authorization
client IDs != ownership proof
source context != authorization
conversation state != authorization
idempotency != authorization
RLS != authorization decision
```

`AuthorizedInvestingContext` remains the single canonical Investing authority family.

I5 MUST NOT create a parallel public authority type that can be fabricated from persisted IDs or request JSON.

The candidate `CanonicalResearchScope` from earlier I5 working documents is therefore reclassified as:

```text
PERSISTED / DERIVED SCOPE EVIDENCE ONLY
NOT AN AUTHORITY TOKEN
NOT ACCEPTABLE AS REPOSITORY AUTHORIZATION
```

A Research repository/service that performs a privileged scoped effect must require authority emitted by the canonical server authority boundary, not merely a scope-shaped object.

---

# 3. Canonical authority family extension

I5 extends the *design* of the existing `AuthorizedInvestingContext`; it does not replace it.

The future authority family must remain:

- server-only;
- opaque/runtime-branded;
- non-client-constructible;
- non-deserializable;
- operation-scoped;
- capability-scoped;
- evidence-bearing;
- revalidated where the operation class requires transaction-time proof.

Conceptual union only — exact TypeScript implementation belongs to the later runtime slice:

```text
AuthorizedInvestingContext =
  UserAccountAuthorizedContext
  | UserTenantAuthorizedContext
  | UserDomainAuthorizedContext
  | SystemAccountAuthorizedContext
  | SystemTenantAuthorizedContext
  | SystemDomainAuthorizedContext
```

Absence of tenant/account identity never promotes a request to a broader scope.

```text
missing accountId != TENANT_SCOPE
missing tenantId  != DOMAIN_SCOPE
```

Scope is selected by the operation contract and proven by the authority resolver.

---

# 4. Selector law

Selectors locate candidate canonical records. They never prove authority.

## 4.1 ACCOUNT_SCOPE selector

Preferred user input:

```text
accountId
```

Rules:

- `accountId` is untrusted selector only;
- tenant is derived from the canonical account;
- client `tenantId` is not needed for ACCOUNT_SCOPE ownership;
- an unexpected client `tenantId` on an ACCOUNT_SCOPE command fails strict command validation or authority resolution;
- account/tenant mismatch never falls back to another account or tenant;
- multiplicity where one authority row is required fails closed.

## 4.2 TENANT_SCOPE selector

A genuine I5 TENANT_SCOPE user operation may accept:

```text
tenantId
```

only as an untrusted selector.

Canonical flow:

```text
verified Clerk identity
  -> exactly one canonical Principal
  -> untrusted tenantId selector
  -> exactly one canonical Tenant
  -> exactly one ACTIVE OWNER TenantMembership for Principal + Tenant
  -> Tenant lifecycle permits operation
  -> operation capability/entitlement
  -> branded AuthorizedInvestingContext
```

I5 V1 does not derive tenant authority from `organizationId`, `userId`, conversation state, browser state, or an arbitrary persisted Research object.

If future product UX supplies an external organization selector, a separately accepted server-side mapping to canonical Tenant is required. The external organization identifier itself is not ownership proof.

## 4.3 DOMAIN_SCOPE

DOMAIN_SCOPE is never inferred from absent tenant/account selectors.

It requires:

```text
explicit domain operation
+ explicit domain capability
+ verified USER_PRINCIPAL or trusted SYSTEM_ACTOR path
```

I5 V1 permits DOMAIN_SCOPE only for the narrow operations explicitly listed by this contract.

---

# 5. Actor paths

## 5.1 USER_PRINCIPAL

Canonical source of user identity remains verified Clerk identity resolved to exactly one Principal.

A user authority context contains `principal_id` and appropriate membership/access evidence for the operation scope.

Client values such as these are never actor proof:

```text
userId
requestedBy
principalId
actorId
organizationId
```

## 5.2 SYSTEM_ACTOR

A worker/scheduler/internal operation uses a stable trusted `SYSTEM_ACTOR` identity.

A SYSTEM_ACTOR:

- is not a Clerk user;
- has no fabricated `principal_id`;
- does not impersonate the initiating user;
- does not acquire authority because a process has `service_role`;
- receives only an explicit operation/capability;
- derives scoped tenant/account ownership from canonical persisted Research job/run/investigation relationships;
- cannot broaden from one job/run to another without a separately authorized claim/effect;
- cannot use queue payload `tenantId`/`accountId` as proof.

For worker effects, job/attempt/lease evidence is an additional necessary authorization condition, not a substitute for Investing scope authority.

---

# 6. Research source context -> canonical operation scope

Research `sourceContext` is scientific/product context only. It does not grant authority.

Canonical I5 V1 mapping:

| source context | owning operation scope | tenant | account | rule |
|---|---|---:|---:|---|
| `PURE_RESEARCH` | `TENANT_SCOPE` | required | absent | tenant-owned research; no fabricated InvestingAccount |
| `TEST_PORTFOLIO` | `TENANT_SCOPE` | required | absent | simulated capital is Research input, never a financial account |
| `USER_PORTFOLIO` | `ACCOUNT_SCOPE` | required, canonically derived from account | required | account context is server-resolved; Research remains read-only to financial truth |

No source context may widen scope.

`PURE_RESEARCH` and `TEST_PORTFOLIO` MUST NOT receive placeholder or synthetic account IDs.

`USER_PORTFOLIO` MUST NOT downgrade to tenant scope merely because account authority fails.

---

# 7. I5 V1 operation vocabulary

Every material I5 application operation has a stable versioned operation token.

Initial user-facing/scoped operation tokens:

```text
RESEARCH_INVESTIGATION_CREATE_V1
RESEARCH_INVESTIGATION_READ_V1
RESEARCH_INVESTIGATION_ARCHIVE_V1

RESEARCH_DRAFT_REVISION_CREATE_V1
RESEARCH_HYPOTHESIS_REVISION_CREATE_V1
RESEARCH_SPEC_REVISION_CANONICALIZE_V1
RESEARCH_EXPERIMENT_CREATE_V1
RESEARCH_EXPERIMENT_PLAN_CREATE_V1

RESEARCH_ACCOUNT_CONTEXT_SNAPSHOT_CREATE_V1
RESEARCH_RUN_QUEUE_V1
RESEARCH_RUN_CANCEL_V1
RESEARCH_RUN_RESULT_READ_V1
RESEARCH_COMPARISON_CREATE_V1
RESEARCH_CHALLENGE_CREATE_V1
RESEARCH_EVIDENCE_READ_V1
RESEARCH_EXPLANATION_REQUEST_V1

RESEARCH_TEMPLATE_READ_V1
RESEARCH_ONTOLOGY_READ_V1
```

Initial internal/system operation tokens:

```text
RESEARCH_JOB_CLAIM_V1
RESEARCH_RUN_EXECUTE_V1
RESEARCH_RUN_VALIDATE_V1
RESEARCH_DATASET_SNAPSHOT_CREATE_V1
RESEARCH_ARTIFACT_PERSIST_V1
RESEARCH_RESULT_PUBLISH_V1
RESEARCH_JOB_TERMINALIZE_V1
RESEARCH_DOMAIN_DATA_ACQUIRE_V1
```

Adding an operation token is an authority-contract change, not a free-form string addition.

---

# 8. I5 V1 capability vocabulary

Operation and capability are separate dimensions.

Initial I5 capability families:

```text
RESEARCH_READ
RESEARCH_MUTATE
RESEARCH_RUN_REQUEST
RESEARCH_ACCOUNT_CONTEXT_PROJECT
RESEARCH_REFERENCE_READ
RESEARCH_WORKER_EXECUTE
RESEARCH_RESULT_PUBLISH
RESEARCH_DOMAIN_DATA_ACQUIRE
```

A capability never grants wider ownership scope than the authorized context.

A context for one operation/capability MUST NOT be reused as generic Research authority.

`ACCOUNT_AUTHORITY_READ` from the I4 resolver is predecessor evidence for account authority resolution; it is not, by itself, permission to perform every I5 Research operation.

---

# 9. Canonical operation/scope/capability matrix

`inherits Investigation` means the object selector must resolve server-side to exactly one Investigation and the operation must prove the same canonical scope tuple as that Investigation.

| operation | actor | scope | capability | material effect |
|---|---|---|---|---|
| create `PURE_RESEARCH` Investigation | USER_PRINCIPAL | TENANT_SCOPE | RESEARCH_MUTATE | yes |
| create `TEST_PORTFOLIO` Investigation | USER_PRINCIPAL | TENANT_SCOPE | RESEARCH_MUTATE | yes |
| create `USER_PORTFOLIO` Investigation | USER_PRINCIPAL | ACCOUNT_SCOPE | RESEARCH_MUTATE | yes |
| read Investigation | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no |
| archive Investigation | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create Draft revision | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create Hypothesis revision | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| canonicalize/create Spec revision | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create Experiment | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create ExperimentPlan | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create AccountResearchContextSnapshot | USER_PRINCIPAL | ACCOUNT_SCOPE only | RESEARCH_ACCOUNT_CONTEXT_PROJECT | yes |
| queue Run | USER_PRINCIPAL | inherits Investigation | RESEARCH_RUN_REQUEST | yes |
| cancel Run | USER_PRINCIPAL | inherits Investigation | RESEARCH_RUN_REQUEST | yes |
| read Run/Result | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no |
| create Comparison | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create Challenge | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| read Evidence | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no |
| request Explanation | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no scientific mutation |
| read ResearchTemplateVersion | USER_PRINCIPAL | DOMAIN_SCOPE | RESEARCH_REFERENCE_READ | no |
| read ontology/reference definitions | USER_PRINCIPAL | DOMAIN_SCOPE | RESEARCH_REFERENCE_READ | no |
| claim ResearchJob | SYSTEM_ACTOR | scope derived from canonical Job->Run->Investigation | RESEARCH_WORKER_EXECUTE | yes, operational |
| execute Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes, scientific attempt |
| validate Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes, scientific state |
| create scoped DatasetSnapshot for Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |
| persist scoped artifact | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |
| publish Result | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_RESULT_PUBLISH | yes |
| terminalize Job/Run attempt | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |
| acquire/update shared domain market/reference data | SYSTEM_ACTOR | DOMAIN_SCOPE | RESEARCH_DOMAIN_DATA_ACQUIRE | yes, domain data only |

A user command never obtains `RESEARCH_WORKER_EXECUTE`, `RESEARCH_RESULT_PUBLISH`, or `RESEARCH_DOMAIN_DATA_ACQUIRE`.

A worker never obtains generic `RESEARCH_MUTATE` for arbitrary Investigations.

---

# 10. Cross-object ownership and scope law

Research object IDs are selectors, not authority.

Before any scoped operation, the server must resolve the complete canonical ownership chain.

At minimum:

```text
DraftRevision -> Investigation
HypothesisRevision -> Investigation
ResearchSpecRevision -> Investigation
Experiment -> Investigation
ExperimentPlan -> Investigation
Run -> Experiment + ResearchSpecRevision + Investigation
Result -> Run -> Investigation
Comparison -> owning Investigation
EvidenceObjectRef -> Result/Run/Investigation ownership binding
AccountResearchContextSnapshot -> Investigation + canonical Account scope
```

All material relationships required by the operation must agree on the same canonical scope.

A selector that resolves to:

- another tenant;
- another account;
- another Investigation;
- inconsistent duplicate ownership rows;
- a mixed-scope object graph;

fails closed.

No repository may query merely by object ID and trust the returned row's tenant/account fields after the fact.

For scoped storage, queries must bind canonical authority evidence and object ownership in the same operation.

---

# 11. DatasetSnapshot authority boundary

I5 `DatasetSnapshot` is scientific input, not automatic market-truth authority.

For I5 V1, a DatasetSnapshot consumed by a Run is a **scoped Research object** bound to the owning Run/Investigation scope.

Underlying market/reference series may originate from separately governed DOMAIN_SCOPE data objects, but:

```text
DOMAIN data authority != tenant Research authority
DOMAIN data object != scoped DatasetSnapshot ownership
```

The system worker may compose an immutable scoped DatasetSnapshot from authorized domain data references only after it has claimed the canonical scoped Run/job.

A client cannot upload `tenantId`, `accountId`, provider IDs, prices, balances, or arbitrary series and thereby make them canonical Research data.

Cross-Investigation or cross-tenant DatasetSnapshot reuse is `OUT_OF_I5_V1_AUTHORITY` unless a later explicit immutable sharing/content-addressing contract proves it safe.

This ownership rule may require amendment of the earlier candidate `DatasetSnapshotV1` type during I5-A5. That earlier type is not yet frozen.

---

# 12. USER_PORTFOLIO financial-read boundary

`USER_PORTFOLIO` Research is account-scoped but remains read-only with respect to financial truth.

The Research engine MUST NOT receive a live mutable pointer to account state.

Canonical V1 sequence:

```text
USER_PRINCIPAL
  -> ACCOUNT_SCOPE authority
  -> RESEARCH_ACCOUNT_CONTEXT_SNAPSHOT_CREATE_V1
  -> same-operation proof of narrow financial-read entitlement/capability
  -> immutable AccountResearchContextSnapshot
  -> scoped Run references exact snapshot
  -> worker reads snapshot, not live account state
```

The account-context projection capability is narrow. It does not mean:

```text
ACCOUNT_AUTHORITY_READ => read every ledger/lot/position/cash table arbitrarily
```

Before implementation, I5-A5/I5-A6 must define the exact allowed projection fields and canonical source references.

Mandatory rules:

- no client financial values become canonical by submission;
- every projected material value preserves source lineage and truth dimensions;
- snapshot creation revalidates account authority at the financial-read boundary;
- replay uses the same immutable snapshot;
- Research cannot mutate Plan, ledger, cash, lots, positions, accounting, orders, fills, or broker state;
- a worker executing a Run does not need generic live-account read access once the immutable snapshot exists.

---

# 13. Conversation/context resolution is not authority

ResearchConversationState may contain selectors such as:

```text
activeInvestigationId
activeResearchSpecRevisionId
activeExperimentId
selectedObjectIds
```

These improve conversational ergonomics only.

Every selected object is re-resolved and re-authorized before use.

The source-spec examples `userId` and `requestedBy` are explicitly non-canonical authority shapes in I5.

A command such as:

```text
"testa 15%"
```

may resolve a target Experiment from conversation state, but the resulting structured action must still pass current server-side authority for the resolved Investigation before any durable effect.

---

# 14. Strict client command boundary

Client commands contain only:

- operation-specific selectors;
- material scientific inputs permitted by schema;
- idempotency key when required;
- correlation ID.

Authority-shaped fields are rejected unless the operation contract explicitly admits the field as an untrusted selector.

Globally non-authoritative client fields include:

```text
userId
principalId
actorId
requestedBy
authorizedContext
AuthorizedInvestingContext
capability
service_role
serviceRole
```

`organizationId` has no canonical I5 V1 authority meaning and is rejected until a future explicit external-organization -> canonical-Tenant mapping contract is accepted.

`tenantId` is admitted only on genuine TENANT_SCOPE selector contracts.

`accountId` is admitted only on genuine ACCOUNT_SCOPE selector contracts or where an operation explicitly selects an account for server-side authorization.

Unexpected authority-shaped fields fail strict validation; they are never ignored and later trusted accidentally.

---

# 15. Material-write authority revalidation

Request-time authority is insufficient for material Research writes.

Material I5 mutations must revalidate the required authority/lifecycle evidence in the same database transaction that commits the material effect.

## USER_PRINCIPAL + TENANT_SCOPE

At minimum revalidate:

```text
Principal ACTIVE
Tenant ACTIVE
TenantMembership ACTIVE + OWNER
operation/capability permitted
object ownership tuple unchanged
material predecessor/CAS evidence where applicable
```

## USER_PRINCIPAL + ACCOUNT_SCOPE

At minimum revalidate:

```text
Principal ACTIVE
Tenant ACTIVE
TenantMembership ACTIVE + OWNER
Account belongs to canonical Tenant
AccountAccess ACTIVE + OWNER
Account lifecycle permits the exact operation
operation/capability permitted
object ownership tuple unchanged
material predecessor/CAS evidence where applicable
```

## SYSTEM_ACTOR scoped worker effect

At minimum revalidate:

```text
SYSTEM_ACTOR is registered/trusted
operation/capability permitted
ResearchJob resolves to exact Run
Run resolves to exact Investigation scope
current WorkerAttempt owns exact live lease/attempt when required
Tenant remains eligible for the system effect
Account relationship remains canonically bound when ACCOUNT_SCOPE
terminal publication has not already been won by another attempt
```

Worker authority does not depend on a fabricated or stale user principal.

---

# 16. Lifecycle policy for Research authority

Normal new Research mutations require active ownership authority.

## Tenant lifecycle

For normal user Research operations:

```text
Tenant ACTIVE = required
Tenant SUSPENDED/CLOSED = deny
```

No I5 user path silently invents a historical-access exception for an inactive Tenant.

## USER_PORTFOLIO account lifecycle

Initial I5 V1 policy:

```text
Account ACTIVE:
  normal authorized Research reads/mutations/runs permitted

Account FROZEN/CLOSED:
  no new AccountResearchContextSnapshot
  no new USER_PORTFOLIO Experiment/Run requiring account context
  no new account-derived Research mutation
  historical Research read may be permitted if current tenant/membership/access authority still exists
  cancellation of an already queued/running Research job may be permitted as a safety operation
```

A worker that already owns an authorized Run and uses only immutable captured inputs may finalize scientific history after account freeze/close only if the exact worker/result-publication policy permits it and no new financial truth is read or mutated.

This is historical Research behavior, not financial account mutation.

Exact state-transition tests are required before runtime freeze.

---

# 17. Worker claim and effect authority

`ResearchJob`, `WorkerAttempt`, and `Run` remain separate objects.

Canonical authority chain:

```text
trusted SYSTEM_ACTOR
  -> eligible ResearchJob selector
  -> atomic claim
  -> canonical Job -> Run relation
  -> canonical Run -> Investigation relation
  -> derive canonical operation scope
  -> issue/validate exact worker capability
  -> live lease/attempt evidence
  -> execute only allowed effect
```

A job payload may repeat tenant/account IDs for diagnostics, but those values are not authority and must agree with canonical persisted ownership if present.

The authoritative scope is derived from canonical Research ownership.

Claiming one job never authorizes reading/writing another Run or Investigation.

`service_role` or queue credentials provide transport/execution capability only.

---

# 18. Domain data authority split

The Research Lab requires data but does not obtain unrestricted domain authority from a user Run.

Two separate operations exist conceptually:

## A. DOMAIN data acquisition/reference maintenance

```text
SYSTEM_ACTOR
DOMAIN_SCOPE
RESEARCH_DOMAIN_DATA_ACQUIRE
```

This may acquire or maintain shared market/reference data under separately accepted data contracts.

It does not own a tenant Investigation and cannot mutate tenant Research merely because it owns data-acquisition capability.

## B. scoped Research DatasetSnapshot assembly

```text
SYSTEM_ACTOR worker
canonical Job -> Run -> Investigation scope
RESEARCH_WORKER_EXECUTE
```

This composes exact authorized domain data refs into the immutable scoped DatasetSnapshot required by the Run.

The split prevents both of these invalid escalations:

```text
user Research authority -> unrestricted domain data write
DOMAIN data capability -> unrestricted tenant Research write
```

---

# 19. Idempotency is not authorization

I5 material commands may use durable idempotency, but an idempotency key never grants access.

Rules:

- authority/scope is proven independently of idempotency;
- same key + same material request may replay the exact durable historical result;
- same key + different material request conflicts;
- new key never selects another actor's result merely because content is equal;
- replay never bypasses current ownership/access checks required to disclose the historical result;
- a stale/forged context cannot become valid because an idempotency record exists;
- worker retries replay the same scientific effect only after exact Job/Run/Attempt authority validation.

---

# 20. Audit boundary

ResearchScientificEvent and InvestingAuditEvent remain separate.

Every material authority decision must preserve enough operational audit evidence to answer:

```text
who/what acted?
under which actor kind?
under which operation scope?
which canonical tenant/account when applicable?
which operation/capability?
which Research object/job/run?
what was the outcome?
why was it allowed/denied/failed/conflicted?
which correlation ID joins the evidence?
```

Denied or rolled-back authority decisions must not disappear merely because the material transaction rolled back.

Audit mechanism failure never converts denial/ambiguity into success.

Do not use the financial ledger as the Research authority audit.

---

# 21. Fail-closed error policy

I5 inherits I1 authority classifications and may add operation-specific Research validation errors without weakening disclosure rules.

Authority-level internal classifications include:

```text
UNAUTHENTICATED
FORBIDDEN_OR_NOT_FOUND
PRINCIPAL_DISABLED
TENANT_INACTIVE
MEMBERSHIP_INACTIVE
ACCOUNT_INACTIVE
ACCESS_INACTIVE
CAPABILITY_DENIED
CONFLICT
INTERNAL_ERROR
```

Unauthorized/missing/cross-tenant/cross-account object selectors must not reveal protected object existence externally.

A mixed-scope Research object graph is `INTERNAL_ERROR` when it proves canonical persisted corruption and `FORBIDDEN_OR_NOT_FOUND` when it is merely an unauthorized selector attempt; exact external mapping must preserve non-disclosure.

No ambiguity is resolved by `LIMIT 1`, first-row selection, tenant fallback, account fallback, or client hints.

---

# 22. RLS / database transport law

RLS, PostgreSQL roles, dedicated application roles, Data API configuration, service-role transport, direct PostgreSQL transport, worker credentials, and storage credentials are enforcement/transport mechanisms.

They are not end-user or SYSTEM_ACTOR authorization decisions.

I5 repositories must remain fail-closed if called without the required canonical authority evidence even when the database credential could technically perform the query.

Any future RLS/policy implementation is defense in depth and must agree with the same canonical actor/scope context.

---

# 23. Threat cases required before A1 freeze

At minimum, future authority tests/rehearsal must prove:

1. forged `userId` cannot select authority;
2. forged `requestedBy` cannot select authority;
3. forged `organizationId` cannot select Tenant;
4. USER A cannot read USER B's Investigation by ID;
5. tenant A cannot read tenant B's Experiment/Result/Evidence by ID;
6. ACCOUNT_SCOPE derives tenant from canonical account;
7. account selector + injected tenant selector cannot alter canonical tenant;
8. PURE_RESEARCH cannot receive/fabricate account authority;
9. TEST_PORTFOLIO cannot receive/fabricate account authority;
10. USER_PORTFOLIO without canonical account authority fails closed;
11. revoked TenantMembership loses user Research authority;
12. revoked AccountAccess loses USER_PORTFOLIO authority;
13. stale user authority loses a material-write race after revocation;
14. fake SYSTEM_ACTOR is rejected;
15. real SYSTEM_ACTOR with wrong capability is rejected;
16. worker for Run A cannot read/write Run B;
17. expired/superseded WorkerAttempt cannot publish Result;
18. double worker claim produces one authoritative live claim;
19. completion-vs-cancellation race has one terminal scientific effect;
20. service-role-only repository invocation is rejected;
21. conversation active IDs do not bypass ownership checks;
22. cross-Investigation Spec/Experiment/Run combinations fail closed;
23. DatasetSnapshot from another owning scope cannot be attached in V1;
24. client-submitted financial values cannot become AccountResearchContextSnapshot truth;
25. account freeze/close blocks new account-derived Research but does not rewrite existing scientific history;
26. exact historical replay does not create a new material effect;
27. idempotency key reuse by a different actor/scope cannot reveal prior result;
28. DOMAIN data capability cannot mutate tenant Research;
29. scoped worker capability cannot mutate DOMAIN data catalog unless separately authorized;
30. denied authority audit remains durable when the material transaction rolls back.

New failures relative to the exact accepted baseline block freeze.

---

# 24. Supersession / amendments to earlier I5 working docs

This contract supersedes only conflicting **authority/scope** statements in earlier *working* I5 documents. It does not freeze their other domains.

Specific amendments:

1. `CanonicalResearchScope` is not an authority object; it is derived/persisted evidence only.
2. `DatasetSnapshotV1` requires an owning-scope decision consistent with section 11 before I5-A5 freeze.
3. source-spec `userId`, `organizationId`, and `requestedBy` examples are non-canonical authority shapes.
4. source-spec `ResearchConversationState.userId` is non-authoritative and must not be used as ownership evidence.
5. USER_PORTFOLIO account context requires a separately named narrow projection capability; generic account authority read is insufficient financial-data authority.
6. SYSTEM_ACTOR worker authority requires canonical Job/Run scope + narrow capability + attempt/lease evidence; service role is never enough.

---

# 25. What remains unavailable after this design contract

This document deliberately does not pretend runtime support exists.

As of the I4 predecessor:

```text
TENANT_SCOPE user resolver             = UNAVAILABLE
DOMAIN_SCOPE user resolver             = UNAVAILABLE
SYSTEM_ACTOR registry/resolver         = UNAVAILABLE
I5 Research operation capabilities     = UNAVAILABLE
Research repositories/schema           = UNAVAILABLE
Research worker lease authority runtime = UNAVAILABLE
AccountResearchContext projection runtime = UNAVAILABLE
```

These are implementation gates, not reasons to weaken authority semantics.

---

# 26. A1 implementation/freeze gates

Before I5-A1 can be declared frozen or authorize dependent schema/runtime design, independent evidence must prove:

1. exact future branded context union/types are non-client-constructible;
2. TENANT_SCOPE user resolver follows canonical Principal -> Tenant -> Membership resolution;
3. ACCOUNT_SCOPE remains compatible with the frozen I1/I4 account-before-membership law;
4. SYSTEM_ACTOR identity registry and capability policy are exact;
5. operation tokens and capability matrix are mechanically enforced;
6. strict client parsers reject authority-shaped fields;
7. material write paths revalidate authority transactionally;
8. worker claim/effect authority derives scope from canonical Job/Run/Investigation;
9. user/account Research-context projection has a narrow read contract;
10. object ownership relationships are scope-safe and fail closed;
11. audit denial durability is proven;
12. concurrency/revocation threat cases pass on real PostgreSQL where applicable;
13. Trading/Investing isolation remains intact;
14. no production QA path is introduced from branch CI;
15. no new global CI failures exist versus the exact accepted baseline.

No migration/schema/runtime implementation is authorized merely by this document.

---

# 27. Current verdict

```text
I4 CANONICAL PREDECESSOR
  5de091fcfe1f595d781f6cbc4eaa49ed49341398

I5-A1 AUTHORITY / SCOPE DESIGN
  CORE DECISIONS = DEFINED
  STATUS = WORKING CONTRACT
  FREEZE = NO

REAL PREDECESSOR AUTHORITY
  USER_PRINCIPAL + ACCOUNT_SCOPE = YES

I5 REQUIRED AUTHORITY EXTENSIONS
  USER_PRINCIPAL + TENANT_SCOPE = DESIGN TARGET / RUNTIME UNAVAILABLE
  USER_PRINCIPAL + DOMAIN_SCOPE = DESIGN TARGET / RUNTIME UNAVAILABLE
  SYSTEM_ACTOR scoped authority = DESIGN TARGET / RUNTIME UNAVAILABLE

PARALLEL RESEARCH AUTHORITY TYPE
  FORBIDDEN

SERVICE_ROLE AS AUTHORIZATION
  FORBIDDEN

CLIENT USER/TENANT/ACCOUNT IDs AS OWNERSHIP PROOF
  FORBIDDEN

SCHEMA / MIGRATION / RUNTIME
  NOT AUTHORIZED BY THIS CONTRACT

PRODUCTION
  MUST REMAIN UNCHANGED
```
