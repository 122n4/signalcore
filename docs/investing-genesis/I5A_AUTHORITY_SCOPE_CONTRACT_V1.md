# Syntrake Investing Genesis I5-A — Authority + Scope Contract V1

Status: `WORKING CONTRACT — INDEPENDENT AUDIT APPLIED — NOT FROZEN`

Canonical predecessor: `5de091fcfe1f595d781f6cbc4eaa49ed49341398` (`I4 = FROZEN`).

I5 design branch before this contract was introduced: `design/i5-research-lab-canonical-20260906` @ `1e6f3e123e9f90a7f098f3dfef7d0f2c1c898240`.

Product source: `SYNTRAKE_I5_RESEARCH_LAB_CANONICAL_BUILD_SPEC.md`, authoritative as a product/source specification for the **Research Lab / I5 only**. It is not authority for I6 or any other future Investing slice.

This contract defines the I5-A authority/scope design boundary. It does **not** authorize schema, migrations, runtime implementation, merge, production deploy, production DDL/DML, financial writes, broker access, paper execution, live execution, or recommendations.

---

# 1. Evidence classification

The distinction below is mandatory.

## 1.1 REAL / inherited runtime at I4

At the exact I4 predecessor, the runtime has a server-only runtime-branded `AuthorizedInvestingContext` and a real authority resolver for:

```text
ACTOR_KIND        = USER_PRINCIPAL
OPERATION_SCOPE   = ACCOUNT_SCOPE
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
8. validates tenant lifecycle and relationship consistency;
9. emits a runtime-branded context that ordinary client JSON cannot reconstruct.

I4 material Plan writes additionally revalidate authority under lock inside the mutation transaction before the material effect.

## 1.2 DESIGNED IN I0/I1, RUNTIME UNAVAILABLE AT I4

I0/I1 already define:

```text
USER_PRINCIPAL
SYSTEM_ACTOR

ACCOUNT_SCOPE
TENANT_SCOPE
DOMAIN_SCOPE
```

but the I4 runtime type currently materializes only `USER_PRINCIPAL + ACCOUNT_SCOPE`.

Therefore at the start of I5:

```text
USER_PRINCIPAL + ACCOUNT_SCOPE = REAL PREDECESSOR CAPABILITY
USER_PRINCIPAL + TENANT_SCOPE  = DESIGN TARGET / RUNTIME UNAVAILABLE
USER_PRINCIPAL + DOMAIN_SCOPE  = DESIGN TARGET / RUNTIME UNAVAILABLE
SYSTEM_ACTOR + scoped authority = DESIGN TARGET / RUNTIME UNAVAILABLE
```

No I5 document or implementation may relabel a design-target authority path as REAL before implementation and real rehearsal evidence prove it.

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
research state != financial authority
```

`AuthorizedInvestingContext` remains the single canonical Investing authority family.

I5 MUST NOT create a parallel public authority type that can be fabricated from persisted IDs or request JSON.

The candidate `CanonicalResearchScope` from earlier I5 working documents is therefore classified as:

```text
PERSISTED / DERIVED SCOPE EVIDENCE ONLY
NOT AN AUTHORITY TOKEN
NOT ACCEPTABLE AS REPOSITORY AUTHORIZATION
```

A privileged Research repository/service must require authority emitted by the canonical server authority boundary, not merely a scope-shaped object.

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

Conceptual union only — exact TypeScript implementation belongs to a later implementation slice:

```text
AuthorizedInvestingContext =
  UserAccountAuthorizedContext
  | UserTenantAuthorizedContext
  | UserDomainAuthorizedContext
  | SystemAccountAuthorizedContext
  | SystemTenantAuthorizedContext
  | SystemDomainAuthorizedContext
```

Absence of tenant/account identity never promotes a request to a broader scope:

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

- `accountId` is an untrusted selector only;
- tenant is derived from the canonical account;
- client `tenantId` is not needed for ACCOUNT_SCOPE ownership;
- an unexpected client `tenantId` on an ACCOUNT_SCOPE command fails strict validation or authority resolution;
- account/tenant mismatch never falls back to another account or tenant;
- multiplicity where exactly one authority row is required fails closed.

## 4.2 TENANT_SCOPE selector

I5 V1 user TENANT_SCOPE commands require an explicit:

```text
tenantId
```

as an untrusted selector.

I5 V1 does not silently auto-pick a tenant from conversation state, browser state, `organizationId`, or “the first membership”.

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

If future product UX supplies an external organization selector, a separately accepted server-side mapping to canonical Tenant is required. The external identifier itself is not ownership proof.

## 4.3 DOMAIN_SCOPE

DOMAIN_SCOPE is never inferred from absent tenant/account selectors.

It requires:

```text
explicit domain operation
+ explicit domain capability
+ verified USER_PRINCIPAL or trusted SYSTEM_ACTOR path
```

I5 V1 DOMAIN_SCOPE is limited to **I5-owned global Research reference state**, such as versioned Research templates and ontology/reference definitions.

I5-A1 does not claim global market-data authority.

---

# 5. Actor paths

## 5.1 USER_PRINCIPAL

Canonical user identity remains verified Clerk identity resolved to exactly one Principal.

A user authority context contains `principal_id` and the membership/access evidence required by scope.

These client values are never actor proof:

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

`USER_PORTFOLIO` MUST NOT downgrade to tenant scope because account authority fails.

Research execution environment is a separate scientific dimension:

```text
HISTORICAL_BACKTEST
SIMULATION
```

It is not an authority scope. `PAPER`, broker demo, and live execution remain outside I5 execution authority.

---

# 7. I5 V1 operation vocabulary

Every material I5 application operation has a stable versioned operation token.

Initial user/scoped operations:

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

Initial internal/system operations:

```text
RESEARCH_JOB_CLAIM_V1
RESEARCH_RUN_EXECUTE_V1
RESEARCH_RUN_VALIDATE_V1
RESEARCH_DATASET_SNAPSHOT_CREATE_V1
RESEARCH_ARTIFACT_PERSIST_V1
RESEARCH_RESULT_PUBLISH_V1
RESEARCH_JOB_TERMINALIZE_V1

RESEARCH_TEMPLATE_VERSION_PUBLISH_V1
RESEARCH_ONTOLOGY_VERSION_PUBLISH_V1
```

Adding an operation token is an authority-contract change, not a free-form string addition.

---

# 8. I5 V1 capability vocabulary

Operation and capability are separate dimensions.

Initial capability families:

```text
RESEARCH_READ
RESEARCH_MUTATE
RESEARCH_RUN_REQUEST
RESEARCH_ACCOUNT_CONTEXT_PROJECT
RESEARCH_REFERENCE_READ
RESEARCH_REFERENCE_PUBLISH
RESEARCH_WORKER_EXECUTE
RESEARCH_RESULT_PUBLISH
```

A capability never grants wider ownership scope than the authorized context.

A context for one operation/capability MUST NOT be reused as generic Research authority.

`ACCOUNT_AUTHORITY_READ` from the I4 resolver is predecessor evidence for account authority resolution. It is not permission to perform every I5 Research operation or read arbitrary financial truth.

Entitlement checks may deny an otherwise-owned Research operation, but entitlement never proves ownership or widens scope.

---

# 9. Canonical operation/scope/capability matrix

`inherits Investigation` means the selector must resolve server-side to exactly one Investigation and the operation must prove the same canonical scope tuple as that Investigation.

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
| create AccountResearchContextSnapshot | USER_PRINCIPAL | ACCOUNT_SCOPE only | RESEARCH_ACCOUNT_CONTEXT_PROJECT | yes, Research projection only |
| queue Run | USER_PRINCIPAL | inherits Investigation | RESEARCH_RUN_REQUEST | yes |
| cancel Run | USER_PRINCIPAL | inherits Investigation | RESEARCH_RUN_REQUEST | yes |
| read Run/Result | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no |
| create Comparison | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| create Challenge | USER_PRINCIPAL | inherits Investigation | RESEARCH_MUTATE | yes |
| read Evidence | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no |
| request Explanation | USER_PRINCIPAL | inherits Investigation | RESEARCH_READ | no canonical scientific mutation |
| read ResearchTemplateVersion | USER_PRINCIPAL | DOMAIN_SCOPE | RESEARCH_REFERENCE_READ | no |
| read ontology/reference definitions | USER_PRINCIPAL | DOMAIN_SCOPE | RESEARCH_REFERENCE_READ | no |
| publish template version | SYSTEM_ACTOR | DOMAIN_SCOPE | RESEARCH_REFERENCE_PUBLISH | yes, I5 reference state only |
| publish ontology/reference version | SYSTEM_ACTOR | DOMAIN_SCOPE | RESEARCH_REFERENCE_PUBLISH | yes, I5 reference state only |
| claim ResearchJob | SYSTEM_ACTOR | scope derived from canonical Job -> Run -> Investigation | RESEARCH_WORKER_EXECUTE | yes, operational |
| execute Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes, scientific attempt |
| validate Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes, scientific state |
| create scoped DatasetSnapshot for Run | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |
| persist scoped artifact | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |
| publish Result | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_RESULT_PUBLISH | yes |
| terminalize Job/Run attempt | SYSTEM_ACTOR | inherited canonical Run scope | RESEARCH_WORKER_EXECUTE | yes |

A user command never obtains `RESEARCH_WORKER_EXECUTE`, `RESEARCH_RESULT_PUBLISH`, or `RESEARCH_REFERENCE_PUBLISH`.

A worker never obtains generic `RESEARCH_MUTATE` for arbitrary Investigations.

---

# 10. Cross-object ownership and scope law

Research object IDs are selectors, not authority.

Before any scoped operation, the server resolves the complete canonical ownership chain.

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
DatasetSnapshot -> Run/Investigation ownership binding in I5 V1
```

All material relationships required by the operation must agree on the same canonical scope.

A selector resolving to another tenant/account/investigation, inconsistent duplicate ownership rows, or a mixed-scope object graph fails closed.

No repository may query merely by object ID and trust returned tenant/account fields afterward.

For scoped storage, queries bind canonical authority evidence and object ownership in the same operation.

---

# 11. DatasetSnapshot authority boundary

I5 `DatasetSnapshot` is scientific input. Its existence does **not** make I5 a market-truth authority.

For I5 V1, the DatasetSnapshot consumed by a Run is a scoped Research object bound to the owning Run/Investigation scope.

The worker may assemble that immutable snapshot only after claiming the canonical scoped Run/job and only from data inputs admitted by the later I5-A5 data contract.

Mandatory separation:

```text
Research authority != market-data authority
DatasetSnapshot scientific identity != source market-truth authority
worker Research capability != unrestricted data-provider capability
```

I5-A1 does not define or claim a global market-data ingestion/catalog mutation capability.

The authority, adapter, provenance, licensing, source-truth and instrument-resolution boundary used to obtain market data is deliberately deferred to **I5-A5 Data / DatasetSnapshot boundary design** and must remain compatible with I0 domain-isolation law.

Until A5 closes it:

```text
I5 MARKET-DATA AUTHORITY = UNRESOLVED
I5 GLOBAL MARKET-DATA WRITE CAPABILITY = NOT DEFINED
```

This does not permit invented or ad-hoc data. It means the Research Lab must consume data through a separately accepted boundary rather than silently becoming that authority itself.

A client cannot upload `tenantId`, `accountId`, provider IDs, prices, balances, or arbitrary series and thereby make them canonical Research data.

Cross-Investigation or cross-tenant DatasetSnapshot reuse is `OUT_OF_I5_V1_AUTHORITY` unless a later explicit immutable sharing/content-addressing contract proves it safe.

This ownership decision may require amendment of the earlier candidate `DatasetSnapshotV1` type during I5-A5. That type is not frozen.

---

# 12. USER_PORTFOLIO financial-read boundary

`USER_PORTFOLIO` Research is account-scoped but remains read-only with respect to financial truth.

The Research engine MUST NOT receive a live mutable pointer to account state.

Canonical V1 sequence:

```text
USER_PRINCIPAL
  -> ACCOUNT_SCOPE authority
  -> RESEARCH_ACCOUNT_CONTEXT_SNAPSHOT_CREATE_V1
  -> same-operation proof of narrow financial-read capability/policy
  -> immutable AccountResearchContextSnapshot
  -> scoped Run references exact snapshot
  -> worker reads snapshot, not live account state
```

The account-context projection capability is narrow. It does not mean:

```text
ACCOUNT_AUTHORITY_READ => read every ledger/lot/position/cash table arbitrarily
```

Before implementation, I5-A5/I5-A6 must define exact projection fields and canonical source references.

Mandatory rules:

- no client financial value becomes canonical merely by submission;
- every projected material value preserves source lineage and truth dimensions;
- snapshot creation revalidates account authority at the financial-read boundary;
- the snapshot has an exact `as_of` boundary;
- account FROZEN/CLOSED state must never be presented as fresh/current merely because historical truth remains readable;
- replay uses the same immutable snapshot;
- Research cannot mutate Plan, ledger, cash, lots, positions, accounting, orders, fills, or broker state;
- a worker executing a Run does not need generic live-account read access once the immutable snapshot exists.

If the required financial read is not canonically available, the Research input is `UNAVAILABLE`; it is never synthesized as zero/current state.

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

The source-spec examples `userId`, `organizationId`, and `requestedBy` are explicitly non-canonical authority shapes in I5.

A command such as:

```text
"testa 15%"
```

may resolve a target Experiment from conversation state, but the resulting typed action must pass current server authority for the resolved Investigation before any durable effect.

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

`accountId` is admitted only on genuine ACCOUNT_SCOPE selector contracts or an operation that explicitly selects an account for server-side authorization.

Unexpected authority-shaped fields fail strict validation. They are never ignored and later trusted accidentally.

External content, documents, model output, market-data payloads, and prompt text are data. None can issue capabilities or alter authority policy.

---

# 15. Material-write authority revalidation

Request-time authority is insufficient for material Research writes.

Material I5 mutations revalidate required authority/lifecycle evidence in the same database transaction that commits the material effect.

## 15.1 USER_PRINCIPAL + TENANT_SCOPE

At minimum:

```text
Principal ACTIVE
Tenant ACTIVE
TenantMembership ACTIVE + OWNER
operation/capability permitted
object ownership tuple unchanged
material predecessor/CAS evidence where applicable
```

## 15.2 USER_PRINCIPAL + ACCOUNT_SCOPE

At minimum:

```text
Principal ACTIVE
Tenant ACTIVE
TenantMembership ACTIVE + OWNER
Account belongs to canonical Tenant
AccountAccess ACTIVE + OWNER
Account lifecycle policy permits the exact Research operation
operation/capability permitted
object ownership tuple unchanged
material predecessor/CAS evidence where applicable
```

`Account ACTIVE` is not a blanket prerequisite for every Research-only operation. The exact operation policy is section 16.

## 15.3 SYSTEM_ACTOR scoped worker effect

At minimum:

```text
SYSTEM_ACTOR is registered/trusted
operation/capability permitted
ResearchJob resolves to exact Run
Run resolves to exact Investigation scope
current WorkerAttempt owns exact live lease/attempt when required
Tenant lifecycle permits the system effect
Account relationship remains canonically bound when ACCOUNT_SCOPE
terminal publication has not already been won by another attempt
cancellation has not already won the terminal race
```

Worker authority does not depend on a fabricated user principal or on the initiating user's stale request-time context.

---

# 16. Lifecycle policy for Research authority

This section deliberately separates financial account lifecycle from scientific Research authority.

## 16.1 Tenant lifecycle

For normal user Research operations:

```text
Tenant ACTIVE = required
Tenant SUSPENDED/CLOSED = deny
```

A normal I5 user path does not invent a historical-access exception for an inactive Tenant.

A SYSTEM_ACTOR must not publish a new scoped Result while the owning Tenant is SUSPENDED/CLOSED. The attempt/job is terminalized with operational authority/lifecycle evidence; this is not converted into `SCIENTIFIC_FAILURE`.

## 16.2 USER_PORTFOLIO account lifecycle

I1 defines FROZEN/CLOSED primarily around financial mutation/execution. I5 Research is neither broker execution nor account financial mutation.

Therefore account state alone does not erase scientific history or automatically prohibit Research-only work.

Canonical I5 V1 policy:

```text
Account ACTIVE:
  authorized Research read/mutation/run operations may proceed

Account FROZEN:
  no financial mutation or broker/account execution
  Research-only objects may still be read/created/versioned if current tenant/membership/access authority permits
  historical/account-context projection may be allowed only by the narrow read policy and exact as_of/truth metadata
  BACKTEST/SIMULATION may use immutable admitted inputs

Account CLOSED:
  no new financial mutation or broker/account execution
  historical Research remains preserved
  Research-only objects may remain readable and may be versioned only while current tenant/membership/access authority and operation policy permit
  account-context projection is historical-only when the underlying financial read contract permits it; it must never imply a live/current account
  BACKTEST/SIMULATION may use immutable admitted historical inputs
```

If a FROZEN/CLOSED account's required financial truth cannot be read under the narrow projection contract, `AccountResearchContextSnapshot` creation fails closed/returns `UNAVAILABLE`. It is not replaced with zeroes or stale values presented as current.

## 16.3 Worker completion after account state change

A SYSTEM_ACTOR may complete/validate/publish an already-authorized ACCOUNT_SCOPE Research Run after the account transitions to FROZEN or CLOSED **only when all are true**:

1. owning Tenant remains ACTIVE;
2. canonical Account -> Tenant relationship is unchanged;
3. Run/Experiment/Spec/DatasetSnapshot ownership remains internally consistent;
4. the Run uses immutable captured inputs and requires no new live financial read;
5. no account financial mutation, order, fill, cash/position/ledger mutation or broker action occurs;
6. current WorkerAttempt owns the live authoritative lease/effect;
7. cancellation has not already terminalized the Run;
8. Result publication CAS/idempotency has not already been won.

The initiating user's later membership/access revocation does not turn the SYSTEM_ACTOR into that user and does not itself fabricate or destroy worker authority. It does prevent that user from subsequently accessing protected Research unless current user authority independently permits access.

This is scientific-history completion, not financial execution.

---

# 17. Worker claim and effect authority

`ResearchJob`, `WorkerAttempt`, and `Run` are separate objects.

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

`service_role`, queue credentials, storage credentials, or process identity provide transport capability only.

---

# 18. Market-data / Research authority boundary

The source Research Lab requires DatasetSnapshots and provenance. That requirement does **not** authorize I5 to become the global market-data source of truth.

I5-A1 therefore defines only this side of the boundary:

```text
scoped SYSTEM_ACTOR Run authority
  -> admitted data-boundary inputs
  -> deterministic validation/provenance
  -> scoped immutable DatasetSnapshot
```

The other side is intentionally unresolved until I5-A5:

```text
where canonical prices/series originate
which adapter owns retrieval
how instrument/proxy identity is authorized
which market-data objects are domain-global
which source/licensing/provenance rules apply
which neutral primitive, if any, may be imported under I0
```

I5-A1 makes **no assignment to another future I-slice**. It records only:

```text
GLOBAL MARKET-DATA AUTHORITY OWNERSHIP = UNRESOLVED HERE
I5 GLOBAL MARKET-DATA WRITE AUTHORITY = NOT CLAIMED
```

I5-owned DOMAIN_SCOPE remains limited to Research reference state such as templates/ontology and their explicit publication/read capabilities.

This separation prevents:

```text
Research user authority -> unrestricted market-data write
worker Research authority -> unrestricted provider/catalog mutation
market-data transport privilege -> tenant Research authority
```

---

# 19. Idempotency is not authorization

I5 material commands may use durable idempotency, but an idempotency key never grants access.

Rules:

- authority/scope is proven independently of idempotency;
- same key + same material request may replay the exact durable historical result;
- same key + different material request conflicts;
- new key never selects another actor's result because content is equal;
- replay never bypasses current ownership/access checks required to disclose the historical result;
- a stale/forged context cannot become valid because an idempotency record exists;
- worker retries replay the same scientific effect only after exact Job/Run/Attempt authority validation.

---

# 20. Audit boundary

ResearchScientificEvent and InvestingAuditEvent remain separate.

Every material authority decision preserves enough operational evidence to answer:

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

Denied or rolled-back authority decisions must not disappear because the material transaction rolled back.

Audit mechanism failure never converts denial/ambiguity into success.

Do not use the financial ledger as Research authority audit.

---

# 21. Fail-closed error policy

I5 inherits I1 authority classifications and may add operation-specific Research validation errors without weakening non-disclosure.

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

A mixed-scope Research object graph is `INTERNAL_ERROR` when it proves persisted canonical corruption and `FORBIDDEN_OR_NOT_FOUND` when it is an unauthorized selector attempt; exact external mapping preserves non-disclosure.

No ambiguity is resolved by `LIMIT 1`, first-row selection, tenant fallback, account fallback, or client hints.

Data/financial unavailability is not an authorization success and is not converted to zero.

---

# 22. RLS / database transport law

RLS, PostgreSQL roles, dedicated application roles, Data API configuration, service-role transport, direct PostgreSQL transport, worker credentials, storage credentials, and queue credentials are enforcement/transport mechanisms.

They are not end-user or SYSTEM_ACTOR authorization decisions.

I5 repositories remain fail-closed if called without required canonical authority evidence even when the credential could technically execute the query.

Any future RLS/policy implementation is defense in depth and must agree with the same canonical actor/scope context.

---

# 23. Threat cases required by the future implementation rehearsal

At minimum, future authority tests/rehearsal must prove:

1. forged `userId` cannot select authority;
2. forged `requestedBy` cannot select authority;
3. forged `organizationId` cannot select Tenant;
4. USER A cannot read USER B's Investigation by ID;
5. tenant A cannot read tenant B's Experiment/Result/Evidence by ID;
6. ACCOUNT_SCOPE derives tenant from canonical account;
7. account selector + injected tenant selector cannot alter canonical tenant;
8. TENANT_SCOPE does not choose the first membership or conversation tenant implicitly;
9. PURE_RESEARCH cannot receive/fabricate account authority;
10. TEST_PORTFOLIO cannot receive/fabricate account authority;
11. USER_PORTFOLIO without canonical account authority fails closed;
12. revoked TenantMembership loses user Research authority;
13. revoked AccountAccess loses USER_PORTFOLIO user authority;
14. stale user authority loses a material-write race after revocation;
15. fake SYSTEM_ACTOR is rejected;
16. real SYSTEM_ACTOR with wrong capability is rejected;
17. worker for Run A cannot read/write Run B;
18. expired/superseded WorkerAttempt cannot publish Result;
19. double worker claim produces one authoritative live claim;
20. completion-vs-cancellation race has one terminal scientific effect;
21. service-role-only repository invocation is rejected;
22. conversation active IDs do not bypass ownership checks;
23. cross-Investigation Spec/Experiment/Run combinations fail closed;
24. DatasetSnapshot from another owning scope cannot be attached in V1;
25. client-submitted financial values cannot become AccountResearchContextSnapshot truth;
26. FROZEN/CLOSED account state never permits financial mutation/execution through Research;
27. FROZEN/CLOSED historical projection never relabels stale/historical truth as current;
28. valid immutable Run may finalize after account freeze/close only under section 16.3 conditions;
29. inactive Tenant blocks new scoped Result publication;
30. exact historical replay does not create a new material effect;
31. idempotency key reuse by a different actor/scope cannot reveal prior result;
32. I5 Research authority cannot mutate global market-data truth merely through worker/system credentials;
33. I5 DOMAIN reference publication capability cannot mutate tenant Research;
34. external content/model/data payload cannot inject authority/capability policy;
35. denied authority audit remains durable when the material transaction rolls back.

New failures relative to the exact accepted baseline block implementation acceptance.

---

# 24. Supersession / amendments to earlier I5 working docs

This contract supersedes only conflicting **authority/scope** statements in earlier *working* I5 documents. It does not freeze their other domains.

Specific amendments:

1. `CanonicalResearchScope` is not an authority object; it is derived/persisted evidence only.
2. `DatasetSnapshotV1` requires an owning-scope decision consistent with section 11 before I5-A5 freeze.
3. source-spec `userId`, `organizationId`, and `requestedBy` examples are non-canonical authority shapes.
4. source-spec `ResearchConversationState.userId` is non-authoritative and must not be ownership evidence.
5. USER_PORTFOLIO account context requires a separately named narrow projection capability; generic account authority read is insufficient financial-data authority.
6. SYSTEM_ACTOR worker authority requires canonical Job/Run scope + narrow capability + attempt/lease evidence; service role is never enough.
7. I5 does not claim global market-data authority merely because its Runs require DatasetSnapshots.
8. Account FROZEN/CLOSED is not silently equated with “Research forbidden”; Research-only behavior follows the explicit operation policy in section 16 and never mutates financial truth.

---

# 25. What remains unavailable after this design contract

This document deliberately does not pretend runtime support exists.

At the I4 predecessor:

```text
TENANT_SCOPE user resolver               = UNAVAILABLE
DOMAIN_SCOPE user resolver               = UNAVAILABLE
SYSTEM_ACTOR registry/resolver           = UNAVAILABLE
I5 Research operation capabilities       = UNAVAILABLE
Research repositories/schema             = UNAVAILABLE
Research worker lease authority runtime  = UNAVAILABLE
AccountResearchContext projection runtime = UNAVAILABLE
I5 market-data adapter/authority boundary = UNRESOLVED
```

These are implementation/design gates, not reasons to weaken authority semantics.

---

# 26. Design gate versus future runtime proof

I5-A1 is a **design contract** inside the wider I5-A design campaign.

It may become `DESIGN ACCEPTED` after:

1. independent contradiction audit against I0/I1/I4 and the I5 source specification;
2. exact operation/scope/capability matrix review;
3. confirmation that it does not claim Trading, market-truth, paper/live execution, recommendation, or other non-I5 authority;
4. confirmation that no unresolved authority ambiguity is hidden as a default;
5. docs-only diff audit;
6. branch CI has no new failure versus the exact accepted baseline.

`DESIGN ACCEPTED` for A1 does **not** authorize runtime/schema implementation and does not mean overall I5-A is frozen.

Future runtime implementation acceptance must additionally prove:

1. exact branded context union/types are non-client-constructible;
2. TENANT_SCOPE resolver follows Principal -> Tenant -> Membership resolution;
3. ACCOUNT_SCOPE remains compatible with frozen account-before-membership law;
4. SYSTEM_ACTOR identity registry and capability policy are exact;
5. operation tokens/capability matrix are mechanically enforced;
6. strict parsers reject authority-shaped fields;
7. material writes revalidate authority transactionally;
8. worker claim/effect authority derives scope from canonical Job/Run/Investigation;
9. account Research-context projection has a narrow read contract;
10. object ownership relationships are scope-safe/fail-closed;
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

I5-A1 AUTHORITY / SCOPE
  CORE DESIGN DECISIONS = DEFINED + INDEPENDENT AUDIT CORRECTIONS APPLIED
  STATUS = WORKING CONTRACT
  DESIGN ACCEPTANCE = PENDING FINAL DIFF/CI AUDIT
  OVERALL I5-A FREEZE = NO

REAL PREDECESSOR AUTHORITY
  USER_PRINCIPAL + ACCOUNT_SCOPE = YES

I5 REQUIRED AUTHORITY EXTENSIONS
  USER_PRINCIPAL + TENANT_SCOPE = DESIGN TARGET / RUNTIME UNAVAILABLE
  USER_PRINCIPAL + DOMAIN_SCOPE = DESIGN TARGET / RUNTIME UNAVAILABLE
  SYSTEM_ACTOR scoped authority = DESIGN TARGET / RUNTIME UNAVAILABLE

I5 DOMAIN_SCOPE OWNERSHIP
  RESEARCH TEMPLATE/ONTOLOGY REFERENCE STATE = IN I5
  GLOBAL MARKET-DATA AUTHORITY = NOT CLAIMED / UNRESOLVED HERE

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
