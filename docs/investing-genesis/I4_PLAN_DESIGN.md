# Investing Genesis I4 Plan Design

BASE_SHA =
c993bc7b88b5fe1eb84cb4dda5cec305b1bcb328

STATUS =
DESIGN_CANDIDATE

I4-A is DESIGN / THREAT MODEL ONLY.

This document creates no runtime code, SQL, migration, Supabase state, Vercel
state, Production mutation, public API, UI, research engine, recommendation
engine, suitability engine, execution path, or schema.

Pre-Genesis Investing Plan implementation, including historical migrations
`20260816202000_investing_canonical_plan_persistence_schema` and
`20260817023650_investing_canonical_plan_persistence_writer`, is
HISTORICAL_LINEAGE_ONLY and is not architecture, authority, schema, runtime, or
implementation authority for Genesis.

## Verified Inputs

Repository authority was read at the exact base SHA above:

- `AGENTS.md`
- `supabase/migrations/AGENTS.md`
- `docs/investing-genesis/I0_CONSTITUTION.md`
- `docs/investing-genesis/I1_AUTHORITY_DESIGN.md`
- `docs/investing-genesis/I1_DB_BOUNDARY_CONTRACT.md`
- `docs/investing-genesis/I2_LEDGER_DESIGN.md`
- `docs/investing-genesis/I3_ACCOUNTING_DESIGN.md`
- `docs/investing-genesis/I3_ACCOUNTING_DESIGN_FREEZE.md`
- `docs/investing-genesis/I3A_IMPLEMENTATION_CHECKPOINT.md`
- `docs/investing-genesis/I3B_IMPLEMENTATION_CHECKPOINT.md`

Frozen controlling laws:

```text
PLAN = USER_INTENT
PLAN != MARKET_TRUTH
PLAN != PORTFOLIO_TRUTH
PLAN != RECOMMENDATION
PLAN != EXECUTION
Principal != Tenant != InvestingAccount
service_role != authorization
client IDs are selectors, not ownership proof
Trading and Investing are isolated
missing financial or intent truth is not zero/default truth
```

Accepted Genesis authority path for ACCOUNT_SCOPE:

```text
verified external identity
  -> exactly one canonical Principal
  -> untrusted InvestingAccount selector
  -> canonical tenant derivation from InvestingAccount
  -> exactly one ACTIVE TenantMembership
  -> exactly one ACTIVE AccountAccess
  -> AuthorizedInvestingContext
  -> transaction-local revalidation for material writes
```

Accepted financial lineage already separates:

- authority and operational audit;
- I2 cash ledger;
- I3 accounting fills/lots/revisions;
- future plan/user-intent history;
- future decision/research lineage.

Current CI baseline is not globally green. Known historical failures must be
reported as absolute CI state and compared exactly for any future candidate.

## Explicit Scope

I4 scope:

```text
Plan / immutable user-intent revisions
```

I4-A designs:

- one canonical Plan root per InvestingAccount in V1;
- immutable Plan revisions;
- active revision semantics that preserve history;
- predecessor lineage;
- material content hash semantics;
- actor, authority, correlation, and idempotency lineage;
- concurrency and idempotency rules for Plan mutation;
- audit and future I5/I6 lineage requirements;
- threat model and acceptance gates for later implementation.

Out of scope:

- Market Truth;
- Portfolio Truth;
- Research Lab;
- Quant Engine;
- Recommendation;
- Suitability engine;
- Execution;
- Dashboard/UX;
- broker connectivity;
- live trading;
- tax advice;
- runtime API;
- schema, SQL, migrations, DDL, DML;
- Supabase or Vercel changes.

## Entity Model

PlanRoot:
The stable canonical user-intent container for one InvestingAccount. It is not
financial truth and not a recommendation. In V1 there is at most one canonical
PlanRoot per `(tenant_id, account_id)`.

PlanRevision:
An immutable material user-intent snapshot belonging to exactly one PlanRoot.
Any change to intent creates a new revision. A revision is never updated or
deleted to rewrite history.

ActivePlanPointer:
The controlled current pointer for a PlanRoot. It identifies which immutable
PlanRevision is active. Moving the pointer never mutates any prior revision.

PlanRevisionPredecessor:
Lineage from a new revision to the exact expected active predecessor revision.
V1 topology is a linear active-predecessor chain. Arbitrary branch graphs,
committed inactive draft revisions, and standalone activation of old revisions
are deferred.

PlanMutationAudit:
Operational audit evidence for Plan material mutation. It is distinct from the
financial ledger and from future research/decision lineage.

ResearchPlanReference:
Future I5/I6 reference to an exact PlanRevision and material hash. It must not
mean "latest plan".

## Canonical Identities

PlanRoot canonical identity:

```text
tenant_id
account_id
plan_root_id
```

PlanRevision canonical identity:

```text
tenant_id
account_id
plan_root_id
plan_revision_id
```

PLAN_REVISION_CANONICAL_IDENTITY is only the canonical tuple above.

Immutable PlanRevision evidence is separate from canonical revision identity:

- plan_revision_content_hash;
- content_schema_version;
- predecessor identity/version;
- revision_number or monotonic version evidence when materialized;
- immutable actor/authority/lineage evidence.

```text
PLAN_REVISION_CONTENT_HASH != PLAN_REVISION_IDENTITY
```

A content/hash mismatch for an existing `plan_revision_id` is integrity
corruption and must fail closed as INTERNAL_ERROR. It does not create a new
revision identity.

If a later schema stores this value under the legacy conceptual name
`material_content_hash`, that field must mean exactly
`PLAN_REVISION_CONTENT_HASH`. It must never mean `MATERIAL_REQUEST_HASH`.

Authority and actor lineage for every material Plan mutation:

```text
actor_kind
actor_id
principal_id when USER_PRINCIPAL
tenant_id
account_id
tenant_membership_id or equivalent version evidence
account_access_id or equivalent version evidence
operation_scope = ACCOUNT_SCOPE
operation
capability
correlation_id
idempotency_record_id
idempotency_key
material_request_hash
```

Client-provided `accountId` may select the candidate account. Client-provided
`tenantId`, `userId`, `principalId`, or `accountId` never prove ownership.

PlanRoot tuple integrity:

```text
Account -> PlanRoot -> PlanRevision -> ActivePlanPointer
```

must preserve the same canonical `(tenant_id, account_id, plan_root_id)` tuple.

PlanRoot ownership endpoints are immutable:

- no reparenting to another Tenant;
- no reparenting to another InvestingAccount;
- no hard delete of PlanRoot or Plan history as ordinary runtime behavior.

Future DB implementation must enforce tuple integrity with composite foreign
keys, composite unique constraints, or equivalent database-enforced tuple proof.
Application convention is insufficient.

## Plan Root Semantics

V1 design decision:

```text
ONE_CANONICAL_PLAN_ROOT_PER_ACCOUNT_V1 = YES
```

Why:

- Plan is account-scoped user intent.
- I1 makes InvestingAccount the financial boundary inside Tenant.
- I5/I6 must be able to pin exactly which account intent informed a run or
  decision.
- Multiple roots for the same account in V1 would create ambiguity between
  "current plan", "draft plan", "goal set", and "strategy set" before those
  concepts are separately accepted.
- A single root still permits many immutable revisions and preserves history.

Blockers to a different V1 model:

- multiple active roots would require a separately accepted selector and
  conflict model;
- portfolio-wide or tenant-wide planning would be TENANT_SCOPE or multi-account
  scope and is not designed in I4-A;
- collaboration/shared advisory workflows are not yet accepted authority.

PlanRoot archive/recreate/reactivate semantics are not frozen in V1.

The one-root-per-account invariant must not be undermined by an undefined
archive flow. Archive is deferred until a later accepted contract defines
visibility, reactivation, lineage, and references.

Initial Plan atomicity:

```text
PLAN_ROOT_CARDINALITY_PRE_INITIALIZATION = 0
PLAN_ROOT_CARDINALITY_POST_INITIALIZATION = EXACTLY_1
ACTIVE_PLAN_REVISION_CARDINALITY_POST_INITIALIZATION = EXACTLY_1
INITIALIZED_PLAN_ROOT_REQUIRES_ACTIVE_REVISION = TRUE
ACTIVE_POINTER_NULL_AFTER_INITIALIZATION = FORBIDDEN
PLAN_DEACTIVATE_REVISION_V1 = NOT_AVAILABLE_IN_V1
INITIAL_PLAN_ATOMIC_EFFECT =
  ROOT
  + INITIAL_REVISION
  + ACTIVE_POINTER
  + IDEMPOTENCY_RESULT
  + SUCCESS_AUDIT
```

Successful `PLAN_INITIALIZE_V1` atomically creates exactly one PlanRoot, one
initial PlanRevision, one active pointer to that initial revision, the
idempotency result, and the required success audit. Failure or rollback leaves
none of those material effects. A partially initialized PlanRoot is invalid.
Before `PLAN_INITIALIZE_V1`, there is no PlanRoot and no active revision. Once a
V1 PlanRoot exists, exactly one PlanRevision must be active.

## Immutable Revision Semantics

PlanRevision is append-only.

Forbidden normal operations:

- UPDATE of material user-intent fields;
- DELETE;
- rewriting actor, authority, predecessor, idempotency, or hash lineage;
- changing recorded/effective timestamps after commit;
- changing a prior revision into the current revision.

Permitted mutation:

```text
create a new PlanRevision
activate it through the active pointer in the same ordinary V1 material
mutation
```

Every revision must contain:

- exact PlanRoot identity;
- revision lineage;
- plan_revision_content_hash;
- canonical user-intent content envelope;
- actor and authority lineage;
- idempotency and correlation lineage;
- recorded_at;
- user_declared_effective_at only when truthful evidence or explicit accepted
  semantics exist;
- content_schema_version for the content envelope.

## Active Revision Semantics

The active pointer is mutable control state over immutable revisions.

Rules:

- before `PLAN_INITIALIZE_V1`, there is no PlanRoot and no active revision;
- once a V1 PlanRoot exists, exactly one PlanRevision must be active;
- active pointer references exactly one immutable PlanRevision for the same
  PlanRoot/account/tenant tuple;
- active pointer null/missing/dangling after initialization is integrity
  corruption and fails closed as INTERNAL_ERROR;
- activation must be serialized or compare-and-swap guarded;
- activating a new revision never mutates older revisions;
- ordinary subsequent mutation atomically changes active revision Rn -> Rn+1
  while creating Rn+1;
- there is no intermediate committed state with zero active revisions;
- standalone Plan revision deactivation is not available in V1;
- deactivation of the previous active revision is only represented by the
  atomic pointer transition to the next active revision, not by rewriting the
  old revision's content;
- I5/I6 must pin a concrete `plan_revision_id`, not depend on active pointer
  lookup at later replay time.

Potential implementation choices:

1. Pointer column on PlanRoot:
   `active_plan_revision_id` plus `active_version`.
2. Separate append-only activation event table plus one constrained current
   projection.

If the separate activation-event/current-projection design is selected, the
current projection must still prove exactly one active revision per initialized
PlanRoot.

I4-A does not freeze SQL names. It freezes the semantic requirement:

```text
ACTIVE_POINTER_PRESERVES_HISTORY = TRUE
CONCURRENT_ACTIVATION_NO_DOUBLE_ACTIVE = REQUIRED
INITIALIZED_PLAN_ROOT_HAS_EXACTLY_ONE_ACTIVE_REVISION = REQUIRED
```

## USER_INTENT Field Taxonomy

I4 fields may describe user-declared intent only.

Candidate V1 categories:

- goals;
- planning horizon;
- contribution intentions;
- withdrawal or liquidity requirements;
- user-declared risk constraints;
- user-declared preferences;
- investment restrictions;
- instrument/category restrictions expressed by the user;
- account purpose labels supplied by the user;
- user notes or rationale when validated as bounded text.

Examples of allowed intent fields:

```text
goal_kind
goal_description
target_amount_intent
target_date_intent
horizon_intent
recurring_contribution_intent
one_time_contribution_intent
liquidity_requirement_intent
risk_tolerance_self_description
max_drawdown_preference
excluded_asset_classes
excluded_instruments
preferred_regions
restricted_sectors
ethical_or_policy_restrictions
```

The design must distinguish:

- structured value;
- explicit unknown answer;
- not supplied;
- not applicable;
- user declined to answer;
- source/correlation of the intent.

I4 must not include:

- current market price;
- current portfolio value;
- current cash balance;
- current holdings/position truth;
- projected return as system truth;
- expected return as system truth;
- recommendation result;
- suitability result;
- execution/order state;
- Trading Research Lab state;
- Investing Research Lab output.

If the user supplies an aspirational target, it is:

```text
USER_INTENT
```

It is not:

```text
PROJECTED_RETURN
EXPECTED_RETURN
MARKET_TRUTH
RECOMMENDATION
```

## Money / Decimal / Currency Contract

Any canonical Plan amount, money, percentage, rate, contribution amount,
liquidity amount, target amount, drawdown preference, or comparable numeric
intent value must use decimal string at the application boundary.

JavaScript `number` is not Plan financial-intent authority.

Monetary user-intent values must carry explicit currency whenever the amount is
monetary. I4 must not assume the account base currency for:

- target_amount_intent;
- contribution amount;
- liquidity requirement amount;
- withdrawal amount;
- any other money-like Plan field.

If a future Plan field intentionally inherits account base currency, that rule
must be explicitly versioned, audited, and included in canonical hashing. It is
not implicit.

Future persistence contract:

- money/rate/percentage decimals use bounded PostgreSQL NUMERIC appropriate to
  the semantic field;
- no unconstrained attacker-controlled numeric authority;
- no implicit rounding;
- no exponent notation ambiguity;
- no locale separators;
- no NaN/Infinity;
- no implicit FX;
- no cross-currency comparison or aggregation without accepted FX evidence.

For any monetary Plan field with state = SUPPLIED, canonical decimal amount and
explicit currency are both required.

Amount supplied with absent currency is:

```text
VALIDATION_ERROR
NO_NEW_PLAN_REVISION
NO_PARTIAL_SUPPLIED_MONEY_STATE
```

If the user did not supply the monetary field, persist the truthful USER_INTENT
state: NOT_SUPPLIED, UNKNOWN, DECLINED, or NOT_APPLICABLE. Do not invent amount
or currency.

Missing FX evidence is system/evidence availability, not user intent. It stays
outside PLAN_REVISION_CONTENT_HASH and blocks any operation that requires FX
truth until accepted FX evidence exists.

## Unknown And Missing Truth Rules

Rules:

- missing contribution != 0;
- missing target != 0%;
- missing target amount != EUR 0;
- missing horizon != arbitrary default horizon;
- unknown risk != LOW/MEDIUM/HIGH;
- missing liquidity requirement != EUR 0;
- absent restriction list != "no restrictions" unless the user explicitly
  supplied that assertion;
- absent preference != neutral preference unless explicitly supplied.

Canonical representations must preserve semantic absence.

Candidate field-state vocabulary:

```text
SUPPLIED
NOT_SUPPLIED
UNKNOWN
DECLINED
NOT_APPLICABLE
```

State meanings:

- SUPPLIED: user provided a syntactically valid value or explicit assertion.
- NOT_SUPPLIED: field was omitted or never asked; no intent value exists.
- UNKNOWN: user indicated they do not know the answer.
- DECLINED: user was asked and chose not to provide the value.
- NOT_APPLICABLE: field is semantically irrelevant for this Plan content shape.

Canonical hashing/storage must encode field presence and field state explicitly.
An omitted field and an explicit state such as UNKNOWN, DECLINED, or
NOT_APPLICABLE must not accidentally serialize to the same canonical bytes.

System validation/evidence state is separate from immutable user-intent field
state. Transient inability to validate, represent, or retrieve supporting
evidence is not itself Plan user intent and must not alter
PLAN_REVISION_CONTENT_HASH unless the user intent changed.

If required validation/evidence is unavailable, the implementation must fail
validation, block persistence, or record non-content operational/audit evidence
under a future accepted contract. It must not encode transient system
availability into immutable PlanRevision content.

The implementation must not use UI convenience defaults as canonical Plan
truth. A product form may show placeholders, but persisted PlanRevision content
must record only truthful intent state.

## Plan Revision Content Hash

`PLAN_REVISION_CONTENT_HASH` is distinct from `MATERIAL_REQUEST_HASH`.

`PLAN_REVISION_CONTENT_HASH` identifies deterministic immutable user-intent
content. It must not include transport retry metadata.

Required domain separation:

```text
hash domain = SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1
content_schema_version = explicit versioned value
algorithm = SHA-256 unless a later accepted contract changes it
encoding = deterministic UTF-8 canonical serialization
```

Canonical content envelope must include:

- content_schema_version;
- Plan content type/version;
- all user-intent fields that are part of the accepted schema;
- each field's explicit state;
- supplied value in canonical representation when state = SUPPLIED;
- explicit currency for monetary supplied values;
- user-declared effective timestamp only when present under accepted semantics;
- bounded user rationale/notes when accepted as material intent;
- restriction/preference arrays or sets in deterministic canonical order.

I4-A freezes semantic canonicalization requirements, not exact canonical bytes.

```text
EXACT_PLAN_CONTENT_CANONICAL_BYTES =
  MUST_FREEZE_IN_I4_B_BEFORE_IMPLEMENTATION
```

I4-B must freeze exact byte-level canonical serialization before any hash
implementation or persistence, including:

- serialization format/order;
- Unicode normalization algorithm;
- date canonical encoding;
- instant canonical encoding and timezone normalization;
- decimal canonical encoding;
- set ordering representation.

Semantic canonicalization requirements:

- object keys have deterministic field ordering;
- enums/tokens use the schema-defined canonical representation;
- free user text such as `goal_description`, rationale, notes, and comparable
  user language preserves user text semantics;
- free user text must not be uppercased, lowercased, trimmed, collapsed, or
  otherwise changed unless the accepted schema version explicitly defines that
  normalization;
- semantically different user text must not collide merely because of generic
  case normalization;
- text uses deterministic UTF-8 representation;
- Unicode normalization policy must be explicit and schema-versioned;
- dates and timestamps included in hashed content use deterministic
  schema-versioned canonical representation;
- date-only intent must not silently become a timestamp;
- instants must carry explicit timezone/offset semantics;
- decimal strings are canonical decimal representations, not JavaScript
  numbers;
- no exponent notation;
- no locale separators;
- no insignificant transport formatting;
- arrays that are semantically ordered preserve order;
- sets that are semantically unordered are sorted by canonical element bytes;
- missing/unknown/declined/not-applicable states are encoded distinctly;
- omitted optional field and explicit NOT_SUPPLIED are encoded consistently only
  when the schema defines that equivalence.

Fields explicitly excluded from PLAN_REVISION_CONTENT_HASH:

- idempotency_key;
- correlation_id;
- recorded_at;
- database row ids;
- transport retry metadata;
- active pointer state;
- operational audit row ids.

`MATERIAL_REQUEST_HASH` identifies the material mutation request under an
operation-specific semantic contract. It may include operation, expected
predecessor/version when that predecessor exists, activation intent, and the
PLAN_REVISION_CONTENT_HASH, but it is separately domain-versioned:

```text
hash domain = SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1
```

Idempotency compares MATERIAL_REQUEST_HASH. Research/decision lineage pins
PLAN_REVISION_CONTENT_HASH.

`PLAN_INITIALIZE_V1` material request hash scope:

- canonical tenant/account;
- operation;
- PLAN_REVISION_CONTENT_HASH;
- activation semantics;
- actor/principal when material;
- accepted source/request-class semantics;
- other material caller-controlled input.

Generated result identities that do not exist before initialization are
excluded from the pre-effect MATERIAL_REQUEST_HASH, including:

- generated `plan_root_id`;
- generated `plan_revision_id`;
- generated active pointer id, if any.

Two semantically identical initialization requests must not hash differently
merely because they would generate different database ids.

Subsequent `PLAN_CREATE_AND_ACTIVATE_REVISION_V1` material request hash scope
may include:

- canonical PlanRoot identity;
- exact expected active predecessor revision/version;
- activation semantics;
- PLAN_REVISION_CONTENT_HASH;
- actor/principal and other material caller-controlled input.

## Time Semantics

`recorded_at` is Syntrake recording time.

User-declared effective time exists only when the user supplied truthful
evidence or a future operation has explicitly accepted and versioned semantics
for that field.

Never invent economic or user-intent effective time using `now()`.

If a future operation accepts "effective immediately on canonical acceptance",
that rule must be explicit, versioned, audited, and included in the material
request and content hash semantics. It is not silently derived.

## Authority Model

I4 V1 is ACCOUNT_SCOPE.

```text
PLAN_MATERIAL_INTENT_WRITER_V1 = USER_PRINCIPAL_ONLY
```

Plan is USER_INTENT. SYSTEM_ACTOR cannot invent, alter, replace, import, or
substitute material user intent in V1.

Any future system import, migration, delegated advisor flow, collaboration flow,
or non-user actor mutation of Plan intent requires an explicit future contract.

Database credential, `service_role`, and `investing_app` never count as the
user-intent actor.

Plan mutations require:

- server-created AuthorizedInvestingContext;
- ACCOUNT_SCOPE operation;
- canonical account selector resolution;
- transaction-local revalidation inside the same DB transaction as the Plan
  mutation;
- Principal ACTIVE;
- Tenant ACTIVE;
- TenantMembership ACTIVE;
- AccountAccess ACTIVE;
- InvestingAccount state permitting Plan mutation;
- exact operation/capability guard.

Plan writes must never authorize from:

- client `userId`;
- client `tenantId`;
- client `principalId`;
- client `accountId` alone;
- `service_role`;
- `investing_app` login identity alone;
- transaction-local GUC alone;
- table owner bypass;
- SECURITY DEFINER bypass;
- historical `public.plans` rows.

Account state candidate:

- ACTIVE: Plan mutation permitted if all other authority checks pass.
- FROZEN: ordinary Plan initialization, revision creation, and activation are
  BLOCKED_IN_V1.
- CLOSED: ordinary Plan initialization, revision creation, and activation are
  BLOCKED_IN_V1.

FROZEN/CLOSED account semantics:

- FROZEN/CLOSED accounts never delete, rewrite, invalidate, or hide existing
  immutable PlanRevision history.
- Historical reads/references may remain available only under current
  authorized read/disclosure policy.
- Exact idempotency replay must not bypass current authority/disclosure policy.
- Any future capability allowing Plan mutation while FROZEN requires a separate
  explicit contract and independent audit.

## Operation Scopes

I4 V1 operations are ACCOUNT_SCOPE.

Candidate operation names are conceptual only:

```text
PLAN_INITIALIZE_V1
PLAN_CREATE_AND_ACTIVATE_REVISION_V1
```

Not available in V1:

```text
PLAN_CREATE_REVISION_V1 = NOT_AVAILABLE_IN_V1
PLAN_ACTIVATE_REVISION_V1 = NOT_AVAILABLE_IN_V1
```

Normal V1 material mutation after initialization is
`PLAN_CREATE_AND_ACTIVATE_REVISION_V1` against the exact expected active
predecessor/version. V1 does not support committed inactive drafts or arbitrary
standalone activation.

Candidate capability:

```text
PLAN_WRITE
```

Reads for future product/API must still be ACCOUNT_SCOPE and must not expose
cross-account Plan existence.

Tenant-wide planning, household planning, model portfolios, and shared advisory
plans are deferred.

## Lifecycle

PlanRoot V1 lifecycle is intentionally minimal:

- before initialization, the account has zero PlanRoot;
- canonical root exists for the account;
- hard delete is forbidden as ordinary runtime behavior;
- archive/recreate/reactivate semantics are deferred.

PlanRevision lifecycle:

- successful initialization atomically creates the canonical PlanRoot, initial
  PlanRevision, active pointer, idempotency result, and success audit;
- subsequent canonical revision identifies the exact expected active
  predecessor/version;
- create-and-activate is the normal material revision operation in V1;
- ACTIVE means referenced by the active pointer;
- SUPERSEDED means the active pointer moved to a later revision;
- committed inactive draft revision is not available in V1;
- arbitrary inactive draft branches are deferred;
- arbitrary activation of an old or stale branch is forbidden in V1;
- stale predecessor/version returns CONFLICT;
- INVALIDATED requires a future explicit correction/invalidating event, not
  UPDATE/DELETE.

Lifecycle truth must be reconstructible:

- what revision existed;
- when it was recorded;
- when it became active;
- what predecessor it replaced;
- what actor/correlation/idempotency caused it;
- why it changed when user-supplied reason exists.

I0 also requires Plan/user-intent history to preserve user acceptance,
rejection, and actions.

I4-A decision:

```text
USER_ACCEPTANCE_REJECTION_ACTIONS = DEFERRED_CANONICAL_USER_INTENT_ACTION_LINEAGE
```

Reason:

- acceptance/rejection/action history is user-intent history;
- it must not be represented as recommendation output;
- it should be associated with exact PlanRevision identity and material hash;
- it may require future interaction semantics not needed to freeze immutable
  Plan revisions.

Later implementation must either include this lineage in I4 proper or open a
separate accepted slice before I5/I6 depend on it.

## Idempotency

Genesis idempotency law applies:

```text
same idempotency key + same material request
  -> SAME RESULT
  -> NO DUPLICATE EFFECT

same idempotency key + different material request
  -> CONFLICT
  -> FAIL CLOSED
```

Material request hash for Plan mutation must cover operation-specific material
semantics:

- canonical tenant/account/plan root scope;
- operation;
- intended predecessor or expected active revision evidence;
- complete canonical PlanRevision content envelope;
- activation intent;
- content schema version;
- user-supplied effective intent timestamp when present;
- source/client request class when material;
- actor/principal when required for semantic operation identity.

It must exclude:

- idempotency key;
- correlation id;
- transport retry metadata.

Terminal dispatch:

- SUCCEEDED + same material hash -> exact replay only after current
  authorization/read-disclosure still permits the caller to see that Plan
  object;
- SUCCEEDED + different material hash -> CONFLICT;
- CONFLICT -> CONFLICT;
- FAILED -> fail closed; no automatic recovery semantics in I4-A;
- committed STARTED -> INTERNAL_ERROR / fail closed.

Idempotency disclosure rule:

```text
EXACT_REPLAY_DOES_NOT_BYPASS_CURRENT_AUTHORITY
```

Knowing an idempotency key is never read authorization. Before returning a prior
canonical Plan result, the server and database must prove current authority for
the same account/object. Revoked membership/access, disabled Principal,
inactive Tenant, cross-account selection, or cross-tenant selection cannot
obtain Plan data by replaying or guessing an idempotency key.

## Semantic Uniqueness

Idempotency key is not semantic uniqueness.

Required semantic uniqueness:

- one canonical PlanRoot per `(tenant_id, account_id)` in V1;
- exactly one active PlanRevision per initialized PlanRoot in V1;
- no duplicate revision for the same operation-specific material request
  semantics unless the operation is exact replay;
- revision_number or version must be unique and monotonic per PlanRoot if
  materialized.

Concurrent initial Plan creation with different idempotency keys:

- same operation-specific material request semantics -> exactly one
  PlanRoot/revision wins; loser discovers canonical winner after safe cleanup
  and returns the same canonical result only if current authority still permits
  disclosure;
- different operation-specific material request semantics -> exactly one
  PlanRoot/revision wins; loser returns CONFLICT; no duplicate root/revision;
- no ambiguous "reuse or conflict" decision may be left to implementation
  convenience.

Concurrent revisions with different idempotency keys against the same expected
active predecessor:

- same operation-specific material request semantics -> one revision effect
  wins; loser may exact-replay the canonical result after authority/read
  disclosure;
- different operation-specific material request semantics -> one wins; stale
  loser returns CONFLICT because expected predecessor/version no longer matches.

Concurrent activation of two revisions must not create two active revisions.

## Concurrency Model

I4 must prevent lost update.

Core race:

```text
active revision R7
request A reads R7
request B reads R7
A creates/activates R8
B attempts to create/activate R9
```

Silent last-write-wins is forbidden.

Required semantic behavior:

```text
expected active revision/version != actual active revision/version
  -> CONFLICT
  -> no activation of the stale request
```

Preferred design:

- use READ COMMITTED explicitly for material Plan transactions unless a later
  implementation proves another isolation level;
- acquire a PlanRoot/account-scoped row lock before creating or activating a
  revision;
- use optimistic compare-and-swap on expected active revision/version;
- use unique constraints for one PlanRoot per account and one active pointer;
- use idempotency row arbitration before material effects;
- on uniqueness conflict, rollback to savepoint before canonical reread when
  needed;
- reread canonical winner using a fresh READ COMMITTED statement snapshot.

Threat-modeled races:

Concurrent initial Plan creation, same key:

- exactly one idempotency winner;
- loser waits/loses conflict path safely;
- same material -> replay canonical result only after current authority/read
  disclosure passes;
- different material -> CONFLICT;
- no duplicate PlanRoot or revision.

Concurrent initial Plan creation, different keys:

- both may pass initial absence read;
- one PlanRoot/account uniqueness winner;
- loser rolls back candidate effects before canonical discovery;
- same operation-specific material request semantics -> loser observes the
  canonical winner and returns the same result only after authority/read
  disclosure;
- different operation-specific material request semantics -> loser returns
  CONFLICT;
- no orphan revisions/audit/idempotency residues.

Concurrent revision creation:

- both must identify expected predecessor/active revision;
- PlanRoot lock or CAS serializes activation;
- same operation-specific material request semantics -> one canonical effect
  and authorized exact replay;
- different operation-specific material request semantics -> one wins and the
  other receives CONFLICT;
- stale expected predecessor/version -> CONFLICT;
- no silent overwrite.

Concurrent activation:

- active pointer version is compared;
- at most one activation succeeds;
- loser returns CONFLICT;
- older revision remains immutable.

Stale AuthorizedInvestingContext:

- transaction revalidation detects revoked membership/access, inactive tenant,
  or account state change;
- mutation rolls back;
- denial audit remains durable;
- stale context cannot create or activate PlanRevision.

Membership revocation race:

- revalidation and authority row locks/version checks must happen inside the
  Plan mutation transaction;
- if membership/access changes before commit, Plan mutation fails closed.

Account FROZEN/CLOSED race:

- account state is revalidated and locked/version-checked in the mutation
  transaction;
- FROZEN and CLOSED both block ordinary Plan initialization, revision creation,
  and activation in V1;
- existing immutable PlanRevision history remains preserved and may be read only
  through current authorized read/disclosure policy.

## Audit Model

Plan history is not the financial ledger and not the operational audit log.

Plan mutation must still be audit-visible.

For every material Plan mutation, the system must answer:

- WHAT changed?
- WHEN was it recorded?
- WHO/WHAT caused it?
- WHICH Principal/Tenant/Account?
- WHICH previous revision?
- WHICH new revision became active, if any?
- WHY/correlation?
- WHICH idempotency record and material hash?
- WHICH later research/decision referenced it?

Success audit:

- mutation and success audit commit atomically;
- audit records PlanRoot/PlanRevision identity and outcome;
- no secrets/tokens/plain credentials.

Denial audit:

- authority denial during transaction rolls back the mutation;
- bounded durable denial audit is written independently when required;
- audit failure never converts denial into success.

PlanRevision content is itself history. Operational audit does not need to copy
the full content if it records stable object identity and material hashes, but
the full canonical content must remain reconstructible from immutable revision
storage.

## Lineage Contract For I5/I6

Future I5 Investing Research Lab and I6 decision science must reference:

```text
plan_revision_id
plan_root_id
tenant_id
account_id
plan_revision_content_hash
content_schema_version
recorded_at
activation evidence when relevant
```

Forbidden:

```text
research run depends only on "latest plan"
decision depends only on active pointer at replay time
Trading Research Lab used as Investing Research Lab
```

Required:

```text
TRADING RESEARCH LAB != INVESTING RESEARCH LAB
```

Both future labs must remain no-code for the final user experience:

- declarative;
- deterministic;
- reproducible;
- auditable;
- no arbitrary user code as a requirement.

I4 does not create Research Lab infrastructure.

## Database And Security Expectations For Later Implementation

Future implementation must preserve:

- `investing.*`;
- browser has no direct financial or Plan DB access;
- anon has no access;
- authenticated has no access;
- PUBLIC has no access;
- service_role has no normal Investing application authority;
- investing_app is runtime DB capability only;
- investing_app is LOGIN, NOINHERIT, NOBYPASSRLS, not owner;
- investing_owner owns persistent objects and is not runtime;
- minimum explicit grants only;
- no GRANT ALL;
- no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for runtime;
- RLS + FORCE RLS on Plan authority/history tables;
- transaction-local context only;
- persisted authority relationships revalidated in policies/functions;
- no session-scoped authority;
- no SECURITY DEFINER authorization shortcut;
- no Trading dependency.

Future Plan tables must be append-only or history-preserving where material:

- PlanRevision content immutable;
- active pointer transition auditable;
- no UPDATE/DELETE that rewrites user-intent history.

No SQL is frozen by this design.

## Threat Matrix

| case | attack/precondition | invariant | expected result | failure class | audit requirement |
| --- | --- | --- | --- | --- | --- |
| User A writes Account B plan | Authenticated User A submits Account B selector | ACCOUNT_SCOPE canonical authority | Deny without revealing Account B | FORBIDDEN_OR_NOT_FOUND | Denial audit with actor and selector hash |
| Client sends tenantId | ACCOUNT_SCOPE request includes tenantId | Tenant derives from canonical account | Ignore/reject as authority | FORBIDDEN_OR_NOT_FOUND | Record supplied selector class when safe |
| Client sends userId/principalId | Request attempts identity override | Clerk verified identity binds Principal | Reject client identity authority | FORBIDDEN_OR_NOT_FOUND | Actor and invalid input class |
| service_role direct call | Internal caller bypasses context | AuthorizedInvestingContext required | Reject | INTERNAL_ERROR | Missing authority evidence |
| investing_app login treated as user | DB role is used as end-user proof | DB credential is capability only | Reject design/implementation | INTERNAL_ERROR | Boundary failure |
| SYSTEM_ACTOR writes user intent | Background/system process invents Plan content | PLAN_MATERIAL_INTENT_WRITER_V1 = USER_PRINCIPAL_ONLY | Reject in V1 | INTERNAL_ERROR | Actor/capability violation |
| PlanRoot duplicate same account | Concurrent different keys create roots | One root per account V1 | Same material semantics replay after disclosure; different material semantics conflict | CONFLICT or replay | Idempotency and uniqueness evidence |
| same key same material | Retry after success | Idempotency exact replay | Same canonical result | none | Replay audit if required |
| same key different material | Key reused | Material hash binding | CONFLICT, original unchanged | CONFLICT | Conflict audit |
| replay after access revoked | Caller knows idempotency key but lost authority | Exact replay does not bypass current authorization | Deny disclosure | FORBIDDEN_OR_NOT_FOUND | Denial audit without leaking Plan content |
| committed STARTED | Prior crash left STARTED | No invented recovery | Fail closed | INTERNAL_ERROR | Idempotency state audit |
| content hash polluted by transport | Hash includes idempotency key, correlation, recorded_at, or retry data | Plan content hash identifies content only | Reject implementation | INTERNAL_ERROR | Static gate evidence |
| request hash confused with content hash | Research lineage pins material request hash instead of immutable content hash | PLAN_REVISION_CONTENT_HASH distinct from MATERIAL_REQUEST_HASH | Reject design/implementation | INTERNAL_ERROR | Lineage gap evidence |
| generated id in initialize hash | Initialization hash includes generated PlanRoot/PlanRevision ids | Pre-effect hash excludes result ids | Reject implementation | INTERNAL_ERROR | Hash scope gate |
| free text case collision | User text differs only by case or meaningful spacing | Free user text semantics preserved | Reject implementation | INTERNAL_ERROR | Canonicalization gate |
| system availability changes content | Transient validation/evidence outage changes immutable Plan content hash | Plan hash represents user intent only | Reject implementation | INTERNAL_ERROR | Field-state gate |
| active update race | A and B read R7, both activate | CAS/version guard | One succeeds, stale loser conflicts | CONFLICT | Conflict audit with expected/actual revision |
| different-key same material root race | Concurrent initial Plan requests use different keys but same operation-specific material semantics | One root/revision, deterministic replay after disclosure | One canonical result | none | Winner/loser idempotency and root evidence |
| different-key different material root race | Concurrent initial Plan requests use different keys and different operation-specific material semantics | One wins, loser conflicts | CONFLICT | Conflict audit with material hashes |
| lost update attempt | Request omits expected revision | No silent overwrite | Reject or require explicit initial flow | VALIDATION_ERROR/CONFLICT | Request validation audit |
| stale branch activation | Caller activates old or arbitrary inactive branch | V1 linear predecessor topology | Reject | CONFLICT | Expected active predecessor evidence |
| stale context | Membership/access revoked after resolve | Transaction revalidation | Rollback, deny | MEMBERSHIP_INACTIVE/ACCESS_INACTIVE | Durable denial audit |
| Principal disabled | Principal state changes | Principal ACTIVE required | Deny | PRINCIPAL_DISABLED | Durable denial audit |
| Tenant suspended/closed | Tenant inactive | Tenant ACTIVE required | Deny | TENANT_INACTIVE | Durable denial audit |
| Account closed | Account state CLOSED | Account permits mutation | Deny | ACCOUNT_INACTIVE | Durable denial audit |
| Account frozen | Account FROZEN | Ordinary Plan mutation blocked in V1 | Deny | ACCOUNT_INACTIVE | Durable denial audit |
| mutable revision write | Runtime updates old revision | Revision immutable | Reject | INTERNAL_ERROR | Attempt audit |
| revision delete | Runtime deletes history | History preserved | Reject | INTERNAL_ERROR | Attempt audit |
| active pointer to wrong account | Pointer references foreign revision | Tuple consistency | Reject | INTERNAL_ERROR | Corruption audit |
| initialized PlanRoot with missing/null active revision | Initialized root has no active pointer or active pointer is null/dangling | Initialized PlanRoot requires exactly one active revision | Reject | INTERNAL_ERROR | Corruption audit |
| PlanRoot reparenting | Mutation rewrites PlanRoot tenant/account endpoints | PlanRoot endpoints immutable | Reject | INTERNAL_ERROR | Old/new tuple evidence |
| Plan tuple FK gap | Revision/pointer can reference mismatched tenant/account/root tuple | DB-enforced tuple proof required | Reject implementation | INTERNAL_ERROR | Static/DB gate evidence |
| content hash identity confusion | Existing plan_revision_id has mismatched content hash | Revision identity and content evidence are separate | Reject as corruption | INTERNAL_ERROR | Object identity and hash evidence |
| predecessor mismatch | New revision claims wrong predecessor | Predecessor lineage exact | Reject/CONFLICT | CONFLICT/INTERNAL_ERROR | Expected vs actual evidence |
| missing contribution | UI omits contribution | Missing != zero | Persist NOT_SUPPLIED, not zero or UNKNOWN | none/VALIDATION_ERROR | Content hash reflects NOT_SUPPLIED |
| missing target | UI omits target | Missing != 0 percent/amount | Persist NOT_SUPPLIED | none/VALIDATION_ERROR | Content hash reflects NOT_SUPPLIED |
| missing horizon | UI omits horizon | No arbitrary default | Persist NOT_SUPPLIED | none/VALIDATION_ERROR | Content hash reflects NOT_SUPPLIED |
| explicit unknown risk | User explicitly says they do not know risk tolerance | No invented LOW/MEDIUM/HIGH | Persist UNKNOWN | none/VALIDATION_ERROR | Content hash reflects UNKNOWN |
| explicit declined risk | User was asked risk tolerance and refuses to answer | DECLINED distinct from UNKNOWN | Persist DECLINED | none/VALIDATION_ERROR | Content hash reflects DECLINED |
| omitted field equals explicit state | Serialization collapses NOT_SUPPLIED and UNKNOWN/DECLINED/NOT_APPLICABLE | Missing-state encoding distinct | Reject implementation | INTERNAL_ERROR | Content hash canonicalization evidence |
| money without currency | Target/contribution/liquidity amount has SUPPLIED amount but absent currency | SUPPLIED money requires canonical amount plus explicit currency | VALIDATION_ERROR, no new revision, no partial supplied money state | VALIDATION_ERROR | Field-state evidence |
| JavaScript number intent authority | Runtime parses amount/rate as number | Decimal string boundary | Reject implementation | INTERNAL_ERROR | Static gate evidence |
| implicit effective time | Implementation fills user intent effective time with now() | recorded_at != user-declared effective time | Reject implementation | INTERNAL_ERROR | Time semantics gate |
| aspirational target misuse | User target treated as forecast | Plan is USER_INTENT | Keep as intent only | INTERNAL_ERROR if violated | Design/test gate |
| plan includes portfolio value | Implementation stores holdings/cash truth in Plan | Plan != PORTFOLIO_TRUTH | Reject implementation | INTERNAL_ERROR | Static gate |
| plan includes recommendation | Implementation stores recommended allocation | Plan != RECOMMENDATION | Reject implementation | INTERNAL_ERROR | Static gate |
| research uses latest plan | I5 run records only active lookup | Exact PlanRevision required | Reject I5 design | INTERNAL_ERROR | Run lineage gap |
| user action lineage omitted | Acceptance/rejection/action event cannot be reconstructed | I0 user-intent history requirement | Block dependent slice or add accepted lineage | DOWNSTREAM_BLOCKED | Exact PlanRevision/action reference |
| Trading research dependency | Investing plan/research imports Trading lab | Domain isolation | Reject | INTERNAL_ERROR | Architecture gate |
| success audit failure | Plan mutation succeeds but audit fails | Atomic success audit | Rollback whole mutation | INTERNAL_ERROR | Audit failure evidence |
| denial audit failure | Denied mutation audit fails | Audit failure not success | Return denial/internal failure | INTERNAL_ERROR | Attempt evidence |

THREAT_CASE_COUNT = 51

## Acceptance Gates

Required design/static gates:

- PLAN_IS_USER_INTENT_ONLY
- ACCOUNT_SCOPE_CANONICAL_AUTHORITY
- CLIENT_IDS_NOT_OWNERSHIP
- SERVICE_ROLE_NOT_AUTHORITY
- ONE_CANONICAL_PLAN_ROOT_PER_ACCOUNT_V1
- PLAN_REVISIONS_IMMUTABLE
- ACTIVE_POINTER_PRESERVES_HISTORY
- INITIALIZED_PLAN_ROOT_HAS_EXACTLY_ONE_ACTIVE_REVISION
- ACTIVE_POINTER_NULL_AFTER_INITIALIZATION_FORBIDDEN
- V1_STANDALONE_DEACTIVATION_NOT_AVAILABLE
- DB_ENFORCED_ACTIVE_REVISION_CARDINALITY
- PREDECESSOR_LINEAGE
- PLAN_REVISION_CANONICAL_IDENTITY_EXCLUDES_CONTENT_HASH
- PLAN_REVISION_CONTENT_HASH_SEPARATE_IMMUTABLE_EVIDENCE
- PLAN_REVISION_CONTENT_HASH
- PLAN_REVISION_CONTENT_HASH_DOMAIN_SEPARATED
- MATERIAL_REQUEST_HASH_DOMAIN_SEPARATED
- CONTENT_HASH_EXCLUDES_TRANSPORT_METADATA
- INITIALIZE_MATERIAL_REQUEST_HASH_EXCLUDES_GENERATED_RESULT_IDS
- DIFFERENT_KEY_REPLAY_REQUIRES_OPERATION_SPECIFIC_MATERIAL_EQUIVALENCE
- CANONICAL_CONTENT_SERIALIZATION_DETERMINISTIC
- EXACT_PLAN_CONTENT_CANONICAL_BYTES_MUST_FREEZE_IN_I4B_BEFORE_IMPLEMENTATION
- FREE_USER_TEXT_SEMANTICS_PRESERVED
- UNICODE_NORMALIZATION_SCHEMA_VERSIONED
- DATE_TIMESTAMP_CANONICALIZATION_SCHEMA_VERSIONED
- CANONICAL_DECIMAL_STRING_BOUNDARY
- MONEY_INTENT_REQUIRES_EXPLICIT_CURRENCY
- SUPPLIED_MONEY_REQUIRES_CANONICAL_AMOUNT_AND_EXPLICIT_CURRENCY
- SUPPLIED_MONEY_WITHOUT_CURRENCY_VALIDATION_ERROR_NO_REVISION
- NO_IMPLICIT_ROUNDING_OR_FX
- RECORDED_AT_NOT_EFFECTIVE_AT
- NO_IMPLICIT_EFFECTIVE_NOW
- FIELD_STATES_DISTINGUISH_NOT_SUPPLIED_UNKNOWN_DECLINED_NOT_APPLICABLE
- SYSTEM_AVAILABILITY_NOT_PLAN_CONTENT_HASH_INPUT
- SYSTEM_VALIDATION_EVIDENCE_AVAILABILITY_NOT_USER_INTENT_STATE
- MISSING_INTENT_NOT_DEFAULTED_TO_ZERO
- NO_MARKET_TRUTH_IN_PLAN
- NO_PORTFOLIO_TRUTH_IN_PLAN
- NO_RECOMMENDATION_IN_PLAN
- NO_EXECUTION_IN_PLAN
- PLAN_MATERIAL_INTENT_WRITER_V1_USER_PRINCIPAL_ONLY
- SYSTEM_ACTOR_PLAN_MUTATION_DEFERRED
- PLAN_ROOT_TUPLE_ENDPOINTS_IMMUTABLE
- DB_ENFORCED_PLAN_TUPLE_INTEGRITY
- V1_REVISION_TOPOLOGY_LINEAR_EXPECTED_ACTIVE_PREDECESSOR
- V1_INITIALIZATION_ATOMIC_ROOT_REVISION_POINTER_IDEMPOTENCY_AUDIT
- V1_NO_COMMITTED_INACTIVE_DRAFT_REVISIONS
- V1_STANDALONE_ACTIVATION_NOT_AVAILABLE
- ARBITRARY_BRANCHING_DEFERRED
- EXACT_RETRY_SAME_RESULT
- EXACT_REPLAY_REQUIRES_CURRENT_AUTHORITY_DISCLOSURE
- KEY_REUSE_DIFFERENT_PAYLOAD_CONFLICT
- DIFFERENT_KEY_SAME_MATERIAL_SEMANTICS_DETERMINISTIC_REPLAY
- DIFFERENT_KEY_DIFFERENT_MATERIAL_SEMANTICS_DETERMINISTIC_CONFLICT
- CONCURRENT_INITIAL_PLAN_NO_DUPLICATE
- CONCURRENT_REVISION_NO_LOST_UPDATE
- CONCURRENT_ACTIVATION_NO_DOUBLE_ACTIVE
- USER_ACCEPTANCE_REJECTION_ACTION_LINEAGE_DEFERRED_EXPLICITLY
- CROSS_TENANT_WRITE_BLOCKED
- CROSS_ACCOUNT_WRITE_BLOCKED
- STALE_AUTHORITY_CONTEXT_BLOCKED
- I5_CAN_PIN_EXACT_PLAN_REVISION
- TRADING_DEPENDENCY_NONE

Future real PostgreSQL implementation gates:

- migration applies on PostgreSQL 17 from accepted lineage;
- actual investing_app executes permitted Plan paths;
- FORCE RLS is exercised;
- cross-account and cross-tenant writes are denied;
- same-key concurrency has one canonical result;
- different-key initial root concurrency creates no duplicate PlanRoot;
- different-key same-material-semantics initial root race has deterministic
  replay after disclosure;
- different-key different-material-semantics initial root race deterministically
  conflicts;
- concurrent activation cannot create two active revisions;
- content hash canonicalization distinguishes every missing-state value;
- money/rate fields reject JavaScript number authority and implicit currency;
- stale authority context is blocked after transaction revalidation;
- Account FROZEN blocks ordinary Plan initialization, revision creation, and
  activation in V1;
- Account CLOSED blocks ordinary Plan initialization, revision creation, and
  activation in V1;
- FROZEN/CLOSED preserves immutable PlanRevision history and requires current
  read/disclosure authority for historical reads or exact idempotency replay;
- rollback leaves no orphan PlanRevision or active pointer;
- success audit commits atomically;
- denial audit remains durable after rollback.

CI gates:

- absolute CI state reported;
- exact failing files/tests reported;
- no new failure family vs exact base;
- dependency audit reported.

No gate is marked PASS by this design document.

## Deferred Scope

Deferred beyond I4-A:

- SQL names and exact schema;
- migration;
- runtime repository/API;
- UX;
- multi-account plans;
- tenant/household planning;
- sharing/collaboration/advisor roles;
- suitability engine;
- recommendation engine;
- portfolio optimization;
- market truth ingestion;
- portfolio valuation;
- execution/order routing;
- Investing Research Lab implementation;
- Quant/Decision Science implementation;
- Trading Research Lab integration;
- any bridge between Trading and Investing.

## Open Questions

```text
PLAN_ARCHIVE_SEMANTICS
```

PLAN_ARCHIVE_SEMANTICS = DEFERRED

I4_V1_ARCHIVE_IMPLEMENTATION = NO

Archive can preserve history but may affect product visibility. It is not
needed to prove immutable revisions and must not be implemented in I4 V1 unless
a later slice explicitly reopens it under a separate accepted contract.

## Lineage

This I4-A design candidate starts from:

```text
BASE_SHA = c993bc7b88b5fe1eb84cb4dda5cec305b1bcb328
```

It does not reopen I0, I1, I2, or I3.

It does not authorize I4 implementation.

It does not authorize Supabase, Production, Vercel, merge, push, or PR.

## Design Verdict

```text
I4_PLAN_DESIGN_CANDIDATE = READY_FOR_INDEPENDENT_DESIGN_AUDIT
I4_IMPLEMENTATION = NOT_AUTHORIZED
I4_SCHEMA = NOT_AUTHORIZED
I4_MIGRATION = NOT_AUTHORIZED
I4_SUPABASE_CHANGE = NOT_AUTHORIZED
I4_PRODUCTION_CHANGE = NOT_AUTHORIZED
```
