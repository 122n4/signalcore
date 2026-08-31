# Investing Genesis I2 Ledger Design

PARENT_SHA =
c03c7467452f39752a6e73217b02aff7be8a11b0

This document is DESIGN / THREAT MODEL ONLY.

It creates no runtime code, SQL, migration, Supabase state, Vercel state,
Production mutation, public API, UI, engine, schema, table, function, policy, or
ledger data.

I2 ledger work starts from Genesis:

- I0 Constitution
- I1 Authority Design
- I1 Database Boundary Contract
- I2-A authority materialization
- I2-B AuthorizedInvestingContext
- I2-C atomic personal bootstrap

Pre-Genesis Investing source, behavior, migrations, dashboards, readers,
writers, fallbacks, plans, portfolios, recommendations, and UX are not
implementation references.

## I2 Objective

I2 introduces the first canonical Investing financial persistence design:
an append-only, double-entry cash ledger.

The objective is to make cash mutations:

- account-scoped
- authority-gated
- idempotent
- balanced
- append-only
- auditable
- reconcilable
- explicit about financial truth provenance

I2 does not build a portfolio system. Cash is only cash.

## Current Runtime Ledger

CURRENT_RUNTIME_LEDGER = ABSENT

There is currently no canonical Investing:

- cash ledger runtime
- ledger schema
- ledger repository
- ledger API
- ledger UI
- position engine
- lot engine
- fill engine
- corporate-action engine
- valuation engine
- performance engine
- allocation engine
- recommendation engine
- execution engine

This design must not imply those engines exist.

## I2 Scope

IN SCOPE:

- immutable cash ledger design
- ledger account model
- ledger transaction model
- ledger posting model
- idempotent cash mutation contract
- authority revalidation contract for ledger mutations
- decimal and currency contract
- balancing invariants
- reversal/correction model
- RLS and privilege design requirements
- concurrency design requirements
- threat model
- implementation acceptance gates

OUT OF SCOPE:

- SQL migration
- runtime implementation
- server routes
- bootstrap endpoint changes
- UI
- public browser access
- plans
- recommendations
- portfolio valuation
- holdings
- positions
- tax lots
- fills
- orders
- broker integration
- live execution
- market data ingestion
- corporate-action processing
- performance analytics
- FX conversion engine
- Trading changes

## Boundary With I2-C

I2-C creates the canonical personal authority graph.

The ledger may only attach to an account that exists through the I2-C authority
graph and is resolved through AuthorizedInvestingContext.

I2 ledger design must not bypass, duplicate, or weaken:

- Principal identity uniqueness
- TenantMembership authority
- AccountAccess authority
- Account state checks
- idempotency semantics
- transaction-local contamination preflight
- READ COMMITTED concurrency assumptions
- FORCE RLS

## Core Model

### LedgerAccount

LedgerAccount is the durable chart entry used by postings.

LedgerAccount is not a user account, broker account, portfolio, position, or
balance cache.

Required conceptual fields:

- ledger_account_id
- tenant_id
- account_id
- currency_code
- account_class
- normal_side
- ledger_account_type
- ledger_account_code
- state
- created_at
- closed_at
- lineage_id
- metadata

Required constraints:

- tenant_id and account_id must match the canonical Investing account tuple.
- currency_code is explicit and immutable after creation.
- account_class is explicit and immutable after creation.
- normal_side is explicit and immutable after creation.
- ledger_account_type is explicit and immutable after creation.
- ledger_account_code is unique within account_id + currency_code.
- singleton I2 account types are unique by tenant_id + account_id +
  currency_code + ledger_account_type.
- state changes cannot rewrite historical postings.
- closed ledger accounts cannot receive new ordinary postings.

Minimum canonical account types for the first I2 capability:

```text
ledger_account_type     account_class      normal_side
CASH_ASSET              ASSET              DEBIT
SIMULATED_CAPITAL       EQUITY             CREDIT
```

INITIAL_PAPER_CASH_FUNDING freezes this economic entry:

```text
DEBIT   CASH_ASSET
CREDIT  SIMULATED_CAPITAL
```

Both postings must be in the same canonical InvestingAccount, same tenant,
same currency, and same positive amount.

SIMULATED_CAPITAL represents paper/simulated opening capital only.

It MUST NOT imply:

- broker cash
- REAL external contribution
- deposited real money
- verified bank funding
- verified broker funding

I2 may implement only the minimum account types required for initial paper cash
funding, but the model must not prevent later trade settlement, fees, dividends,
corporate-action cash, or FX events.

CASH_ASSET must remain separate from contribution, withdrawal, fee, source,
expense, and clearing accounts.

Future clearing accounts may exist only where they have genuine clearing
semantics.

Future I3 account types remain future contracts and must not be prematurely
frozen as implemented enums.

Singleton ledger-account uniqueness:

```text
tenant_id
account_id
currency_code
ledger_account_type
```

For I2, CASH_ASSET and SIMULATED_CAPITAL are singleton account types.

Exactly one canonical LedgerAccount may exist for each singleton tuple.

Concurrent creation must not produce duplicates. The future database must
enforce this with a UNIQUE constraint/index or equivalent.

ledger_account_code uniqueness alone is insufficient.

Balance derivation must never choose one arbitrary CASH_ASSET among duplicates.

Any impossible duplicate state is:

```text
INTERNAL_ERROR
FAIL CLOSED
```

### LedgerTransaction

LedgerTransaction is the immutable financial event header.

Required conceptual fields:

- ledger_transaction_id
- tenant_id
- account_id
- actor_kind
- actor_id
- principal_id when actor_kind = USER_PRINCIPAL
- operation_scope
- operation
- transaction_kind
- effective_at
- recorded_at
- sealed_at
- correlation_id
- idempotency_record_id
- material_request_hash
- lineage_id
- source
- source_reference
- value_origin
- freshness
- context
- reversal_of_ledger_transaction_id
- correction_of_ledger_transaction_id
- metadata

Transaction kinds:

- INITIAL_PAPER_CASH_FUNDING
- REVERSAL
- CORRECTION

I2 implementation may start with INITIAL_PAPER_CASH_FUNDING only.

POSTED_TRANSACTION_IS_SEALED = TRUE

TRANSACTION_SEAL_MODEL =
APPEND_ONLY_IMMUTABLE_SEAL_RECORD

Canonical assembly:

```text
insert transaction header
  -> insert postings
  -> validate balance/integrity
  -> insert exactly one immutable transaction seal
  -> COMMIT
```

The seal means the transaction is POSTED.

Required seal semantics:

- exactly one seal per ledger_transaction_id
- no transaction may commit without a valid seal
- no transaction with fewer than two postings may commit
- no unbalanced transaction may commit
- no late posting may be appended after seal
- the seal itself is immutable
- after seal, economic transaction data is immutable

Failed or incomplete financial mutations must leave zero canonical ledger
transaction/posting effect.

No future INSERT may append a posting to a financial transaction after that
transaction has been canonically posted and sealed.

STARTED and FAILED ledger transactions are prohibited.

STARTED and FAILED belong to idempotency records, not to financial ledger truth.

Reversal/correction status is derived from linked immutable transactions, not
from updating the original transaction's economic meaning.

### LedgerPosting

LedgerPosting is the immutable debit/credit line.

Required conceptual fields:

- ledger_posting_id
- ledger_transaction_id
- tenant_id
- account_id
- ledger_account_id
- currency_code
- side
- amount
- created_at
- lineage_id

Required constraints:

- side is DEBIT or CREDIT.
- amount is a decimal string at the application boundary.
- amount persists as PostgreSQL NUMERIC.
- amount must be positive and non-zero.
- ledger_transaction_id/tenant_id/account_id must match the transaction header.
- tenant_id/account_id/currency_code must match the referenced ledger account.
- postings cannot be updated or deleted by runtime code.
- no posting may exist without a transaction.
- no posting may be inserted into an already sealed POSTED transaction.

## Ledger Account Model Decision

Decision:

Use per-InvestingAccount, per-currency ledger accounts.

Rationale:

- It preserves account ownership and tenant isolation.
- It avoids cross-account balance mixing.
- It supports future multi-currency cash without implicit FX conversion.
- It keeps CASH_ASSET separate from SIMULATED_CAPITAL, source, expense, and
  genuine clearing semantics.
- It allows future event-specific accounts without changing posting identity.

Rejected:

- One global cash account per user.
- One mutable cash balance column.
- One posting table without ledger accounts.
- A permanent contribution-clearing balance used only as a fake second side for
  arithmetic.
- ledger_account_code as the only semantic uniqueness proof.
- Using operational audit_events as the financial ledger.
- Using plan, portfolio, or recommendation tables as cash truth.

## Currency Model

Decision:

The ledger is structurally multi-currency from Genesis, while I2 product
capabilities may initially allow only account-base-currency paper cash funding.

Rules:

- Currency is explicit on every ledger account and posting.
- Account base currency is a default/display contract, not a conversion engine.
- A balance is derived per account_id + currency_code.
- No values may be summed across currencies without an explicit future FX event.
- Missing FX is UNAVAILABLE, not zero.
- Missing cash evidence is UNAVAILABLE, not zero.
- Cross-currency trade settlement and FX realized gain/loss are I3+ design.

Why not single-currency schema:

A single-currency schema would either block future legitimate assets or invite
implicit conversion. I2 can limit exposed operations to base-currency paper cash
without encoding single-currency falsehood into storage.

## Money And Decimal Contract

JavaScript number is not financial authority.

Application boundary:

```text
decimal string
```

Persistence:

```text
PostgreSQL NUMERIC(24, 8)
```

STORAGE_MAX_PRECISION = 24

STORAGE_MAX_SCALE = 8

NUMERIC(24, 8) gives 16 integer digits and 8 fractional digits. This is bounded
enough to prevent arbitrarily expensive NUMERIC inputs, large enough for Genesis
cash authority magnitudes, and structurally compatible with future
multi-currency cash.

The storage scale is a maximum. It does not mean every currency accepts 8
fractional digits.

Required:

- canonical decimal-string grammar
- strict decimal string validation before persistence
- explicit maximum precision
- explicit maximum scale
- per-currency accepted scale validation
- rejection rather than implicit rounding
- no float conversion for canonical money
- no Number, parseFloat, arithmetic on JS number, or JSON number as authority
- no negative amount convention
- no exponent notation
- no NaN
- no Infinity
- no locale separators
- no leading plus-sign ambiguity
- no arbitrarily large PostgreSQL NUMERIC input

Debit/credit direction carries sign semantics. Amount remains positive.

Before a full currency registry exists, implementation must still enforce:

- accepted currency scale policy
- rejection of excess fractional digits
- rejection of magnitude/precision overflow

Currency-scale violation:

```text
VALIDATION_ERROR
NO ledger effect
```

Magnitude/precision overflow:

```text
VALIDATION_ERROR
NO ledger effect
```

## Financial Truth Contract

Every ledger transaction must preserve:

- value_origin
- freshness
- context
- source
- source_reference
- effective_at
- recorded_at
- lineage_id

Genesis paper cash is simulation. It must not be presented as broker-confirmed
REAL cash.

INITIAL_PAPER_CASH_FUNDING provenance is server-controlled:

```text
value_origin = SIMULATED
freshness = NOT_APPLICABLE
source = USER_DECLARED_PAPER_CAPITAL
```

freshness = NOT_APPLICABLE because simulated opening capital is not observed
market, bank, or broker data and has no external freshness claim.

context must come from trusted server/account/environment authority, not
arbitrary request input.

The user may provide permissible non-authoritative reference/note data only if
validated and clearly separated from authoritative provenance.

Client input must never make INITIAL_PAPER_CASH_FUNDING appear:

- REAL
- broker-confirmed
- bank-confirmed
- externally verified
- live

Accepted labels must preserve I0 dimensions:

- VALUE_ORIGIN: REAL | ESTIMATED | SIMULATED | UNAVAILABLE
- FRESHNESS: FRESH | STALE | UNKNOWN | NOT_APPLICABLE
- CONTEXT: PRODUCTION | DEMO

Valid ledger rows must never invent:

- cash
- balance
- position
- valuation
- return
- target
- probability
- cost basis

UNAVAILABLE is a valid state and must remain distinguishable from zero.

## Double-Entry Invariants

For every posted ledger transaction:

- at least two postings exist
- every posting amount is positive
- all postings reference ledger accounts in the same Investing account scope
- per transaction and currency, total DEBIT equals total CREDIT
- each posting uses the ledger account's explicit currency_code
- each posting respects ledger_transaction_id + tenant_id + account_id scope
- currency is explicit
- no cross-currency balancing is allowed in I2
- postings are immutable
- posted transactions are sealed
- balance is derived from postings
- historical mutations are never overwritten

Normal-balance convention:

```text
ACCOUNT_CLASS      NORMAL_SIDE
ASSET              DEBIT
EQUITY             CREDIT
```

I2 minimum account-type semantics:

```text
CASH_ASSET         ASSET     DEBIT
SIMULATED_CAPITAL  EQUITY    CREDIT
```

INITIAL_PAPER_CASH_FUNDING:

```text
DEBIT   CASH_ASSET          amount A
CREDIT  SIMULATED_CAPITAL   amount A
```

Conceptual cash asset balance:

```text
sum(DEBIT postings for CASH_ASSET)
- sum(CREDIT postings for CASH_ASSET)
```

Balance derivation must return UNAVAILABLE or an explicit empty state when
evidence is missing. It must not synthesize zero.

KNOWN_ZERO:

Canonical ledger evidence exists and the mathematically derived
account/currency cash balance is exactly zero.

UNAVAILABLE:

Canonical financial evidence required to establish cash truth does not exist or
cannot be proven complete.

No initialized/evidenced cash state means UNAVAILABLE.

A legitimate balance that becomes zero through balanced canonical postings,
including a valid full reversal, is allowed and must preserve its correct truth
provenance.

Never infer zero solely from:

- zero rows
- missing ledger account
- failed query
- unavailable evidence
- missing initialization

## DB Enforcement Model

The database must enforce financial integrity.

Required DB-enforced classes:

- primary keys
- foreign keys
- account/tenant tuple consistency
- LedgerTransaction tuple uniqueness on ledger_transaction_id + tenant_id +
  account_id
- LedgerAccount tuple uniqueness on ledger_account_id + tenant_id + account_id
  + currency_code
- LedgerPosting composite references to those transaction/account tuples
- positive NUMERIC amounts
- NUMERIC(24, 8) amount storage
- allowed enums/checks
- append-only runtime privileges
- no runtime DELETE
- no runtime posting UPDATE
- no appending postings to sealed POSTED transactions
- idempotency uniqueness
- semantic financial event uniqueness
- per-transaction balanced debit/credit invariant
- minimum posting count
- reversal/correction linkage
- REVERSAL exact-negation invariants
- one canonical reversal per original transaction
- no reversal of REVERSAL in I2
- no reversal chains in I2

DB enforcement must make these impossible:

- Account A transaction header with Account B posting
- Tenant A transaction header with Tenant B posting
- posting whose duplicated account/currency fields disagree with LedgerAccount
- transaction containing postings from more than one InvestingAccount
- appending a late posting after POSTED sealing
- REVERSAL that omits, adds, resizes, or moves any original posting
- more than one canonical reversal for the same original
- reversal of a REVERSAL in I2

Future implementation must use composite FK/unique-key constraints or an
equivalent DB-enforced tuple mechanism. Application convention alone is not
acceptable.

Cross-row balancing cannot be implemented with a simple CHECK constraint.

Preferred implementation direction:

- use a commit-time PostgreSQL mechanism, such as a DEFERRABLE INITIALLY
  DEFERRED constraint trigger, to validate affected ledger transactions before
  commit
- rehearse it on real PostgreSQL 17 under actual investing_app + FORCE RLS
- prove it cannot be bypassed by partial inserts, savepoints, failed cleanup, or
  concurrent writers
- prove POSTED transaction sealing is enforced by the database
- prove exact reversal semantics are enforced by the database

Security constraint:

Do not introduce SECURITY DEFINER casually.

If a future implementation proves that a trigger/function cannot safely enforce
balance under SECURITY INVOKER with FORCE RLS and minimum grants, any SECURITY
DEFINER exception must be a separate audited design decision with:

- no caller-provided authority trust
- fixed search_path
- no PUBLIC/anon/authenticated/service_role execute
- owner and BYPASSRLS proof
- real PostgreSQL rehearsal
- explicit statement that it is integrity enforcement, not authorization

Until that proof exists, the implementation gate remains blocked rather than
silently weakening RLS.

## Authority Model

Every material ledger mutation requires server-created
AuthorizedInvestingContext.

The context:

- is server-only
- is opaque/branded
- is not deserialized from client input
- carries canonical Principal/Tenant/Account evidence
- carries membership/access identity or version evidence
- carries correlation_id
- carries operation scope
- carries no financial truth

Ledger mutation flow:

```text
verified Clerk identity or future approved SYSTEM_ACTOR
  -> AuthorizedInvestingContext
  -> acquire one DB client
  -> BEGIN ISOLATION LEVEL READ COMMITTED
  -> contamination preflight
  -> establish transaction-local scope/capability guardrails
  -> revalidate Principal ACTIVE
  -> revalidate Tenant ACTIVE
  -> revalidate TenantMembership ACTIVE
  -> revalidate AccountAccess ACTIVE
  -> revalidate Account state permits this mutation
  -> revalidate operation/capability
  -> lock/serialize required account/idempotency rows
  -> apply idempotency contract
  -> insert balanced transaction and postings
  -> insert success audit
  -> COMMIT
  -> release clean client
```

Denied flow:

```text
material transaction detects denial
  -> ROLLBACK
  -> bounded durable denial audit using a fresh clean transaction
  -> return denial
```

Audit failure must never turn a denied ledger mutation into success.

Uncertain cleanup must destroy the suspect client and fail closed.

## Account State Rules

ACTIVE account:

- may accept permitted ledger mutations after authority and capability checks

FROZEN account:

- no new ordinary cash mutations
- historical/audit reads may remain allowed by future read policy
- reversal/correction behavior requires explicit future design

CLOSED account:

- no new ordinary cash mutations
- historical/audit reads may remain allowed by future read policy
- regulatory/correction exception requires explicit future design

No account state may be bypassed by idempotency replay, GUCs, service_role, or
direct repository calls.

Terminal successful exact replay creates no new financial mutation.

FROZEN/CLOSED account states block new ledger effects. They do not
retroactively mutate, erase, or invalidate an already committed financial event.

Replaying or disclosing a prior canonical result must still pass current
authorization/read-disclosure policy.

Revoked or cross-account authority must not gain disclosure merely through an
idempotency key.

Terminal replay must not be described as bypassing the account-state mutation
rule.

## User And System Actors

USER_PRINCIPAL:

- current I2 ledger material actor path
- must map to exactly one ACTIVE Principal
- must pass account-scoped authority

SYSTEM_ACTOR:

- future design only
- current status: UNAVAILABLE for ledger mutations
- requires stable registry identity, operation allowlist, capability policy, and
  account/tenant resolution
- must not fabricate a Clerk/user principal
- must not be inferred from service_role or database login

SYSTEM_ACTOR_CURRENT_STATUS = UNAVAILABLE

## Idempotency Model

Every material ledger mutation requires:

- idempotency_key
- material_request_hash
- operation
- operation_scope
- actor_kind
- actor_id
- canonical result reference
- terminal status

Same idempotency key and same material request:

- exact replay
- no duplicate ledger transaction
- no duplicate postings
- no duplicate cash effect

Same idempotency key and different material request:

- CONFLICT
- original terminal row unchanged
- no duplicate ledger transaction

Committed STARTED:

- fail closed
- no automatic recovery in I2

FAILED:

- fail closed in I2
- no invented recovery semantics

The financial event identity is not the same as transport idempotency.

Semantic identity and material hash are distinct:

```text
SEMANTIC_IDENTITY
  -> identifies the external/domain economic event

MATERIAL_HASH
  -> identifies the claimed material content of that event
```

Semantic event identity MUST NOT contain material_request_hash as part of the
identity key.

I2 must define semantic duplicate protection so that different keys cannot
create duplicate economic events.

Example:

```text
same account
same operation
same source
same source_reference
same transaction_kind
```

Material hash is compared after semantic identity collision.

Same semantic identity + same material:

```text
REPLAY canonical financial event
NO duplicate effect
```

Same semantic identity + different material:

```text
CONFLICT
NO new financial effect
```

Material hash domain for INITIAL_PAPER_CASH_FUNDING:

```text
INVESTING:I2:INITIAL_PAPER_CASH_FUNDING:v1
```

The material hash must cover every field that can alter financial or evidence
meaning:

- canonical account_id
- operation
- transaction_kind
- canonical decimal amount
- currency_code
- economic source
- source_reference when semantically applicable
- effective_at when semantically caller-controlled
- value_origin
- freshness
- context
- material metadata

Transport/tracing fields:

```text
idempotency_key = NOT part of material hash
correlation_id = NOT part of financial material hash
```

actor/scope remain bound by authority and idempotency scope even if not
duplicated inside the material hash.

Canonicalization rules:

- deterministic field order
- no JSON key-order ambiguity
- canonical decimal form before hashing
- no decimal textual aliases representing different hashes for the same
  canonical amount
- same material semantics must hash identically

For externally sourced future events, semantic identity should conceptually use
stable source identity such as:

```text
account
source
source_reference
event kind
```

For INITIAL_PAPER_CASH_FUNDING, semantic uniqueness is:

```text
exactly one canonical INITIAL_PAPER_CASH_FUNDING event
per canonical InvestingAccount
```

Different idempotency keys MUST NOT create two initial paper funding events.

Same account initial-funding semantic identity + same material:

```text
canonical replay
```

Same account initial-funding semantic identity + different material:

```text
CONFLICT
```

Future top-ups/contributions are distinct future operations and MUST NOT be
smuggled through INITIAL_PAPER_CASH_FUNDING.

## Concurrency Model

Baseline:

- READ COMMITTED is explicit for material ledger transactions.
- All statements for one material mutation run on one acquired client.
- No independent pool.query split transaction.
- No session advisory lock as correctness machinery.
- No prepared statement dependency under Supavisor transaction mode.
- No temp-table authority or persistence.
- No session SET authority.

Required serialization tools:

- unique constraints for idempotency and semantic event identity
- row locks for account/authority rows that must not change during mutation
- savepoints for candidate creation where a loser path must recover cleanly
- fresh READ COMMITTED statement snapshots after ON CONFLICT loser paths

Different concurrent requests must not produce:

- duplicate ledger transactions
- duplicate postings
- duplicate cash effects
- unbalanced transactions
- orphan postings
- stale STARTED idempotency residue
- false success after cleanup uncertainty

## RLS And Privilege Model

Future ledger tables must:

- be in investing schema
- be owned by investing_owner
- ENABLE ROW LEVEL SECURITY
- FORCE ROW LEVEL SECURITY
- deny PUBLIC
- deny anon
- deny authenticated
- deny service_role as normal application access
- grant investing_app only the exact runtime privileges required
- grant no GRANT ALL
- grant no TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN to investing_app
- expose no browser Data API access

RLS policies must validate persisted canonical relationships.

Forbidden policy foundations:

- account_id GUC alone
- tenant_id GUC alone
- client tenantId
- service_role
- table owner bypass
- SECURITY DEFINER bypass
- USING (true)
- stale AuthorizedInvestingContext

Allowed transaction-local GUCs are guardrails and scope carriers only. They are
not independent authentication proof.

## Append-Only And Reversal Model

Runtime must not update or delete posted ledger transactions or postings.

Corrections preserve history.

POSTED_TRANSACTION_IS_SEALED = TRUE

The database must make it impossible for investing_app to:

- update existing postings
- delete existing postings
- insert additional postings into an already sealed transaction
- change the economic meaning of a posted transaction

Failed/incomplete financial mutations leave zero canonical ledger effect.

Do not persist STARTED or FAILED rows as financial ledger truth.

Idempotency lifecycle belongs to idempotency_records, not to mutable financial
truth.

I2 correction model:

- full reversal transaction
- optional replacement corrective transaction
- explicit linkage to original transaction
- original transaction remains unchanged
- reversal transaction is balanced
- replacement transaction is balanced
- one original transaction may have at most one canonical reversal
- reversal of a REVERSAL is not supported in I2
- reversal chains are not supported in I2 unless a future accepted contract
  explicitly introduces them

Full reversal means exact economic negation of the original transaction.

For every original posting:

```text
ledger_account X
currency C
side S
amount A
```

the reversal must contain:

```text
same ledger_account X
same currency C
opposite side(S)
same amount A
```

No posting may be omitted, added, resized, moved to another ledger account,
moved to another currency, or otherwise changed.

Reversal transaction rules:

- independently balanced
- linked immutably to exactly one original transaction
- same tenant/account scope as the original
- original unchanged

Partial corrections are deferred unless represented as:

```text
full reversal + new corrected transaction
```

No cash mutation may be silently rewritten in place.

Effective-time semantics:

- original effective_at never changes
- reversal has its own effective_at representing when the correcting/reversing
  economic event takes effect
- recorded_at is the immutable recording time of each transaction
- no backdating may rewrite original history

## Audit And Lineage Separation

Financial Ledger != Operational Audit != Decision Lineage != User-Facing History

Ledger rows record financial events.

audit_events record authority/security/operational events.

Decision lineage records future recommendation or intent derivation.

User-facing history may render a projection, but it is not authority.

Do not use financial ledger writes to solve authority/security audit durability.

Do not use audit_events as balance, cash, portfolio, or performance truth.

## Initial Capability Candidate

First real I2 ledger capability should be:

INITIAL_PAPER_CASH_FUNDING

Purpose:

- create a balanced simulated cash event for an already bootstrapped canonical
  Investing account
- prove authority, idempotency, decimal, RLS, balancing, and append-only
  constraints end to end

Minimum input:

- account selector
- idempotency key
- decimal amount string
- explicit currency
- correlation id
- optional user note/reference, if validated as non-authoritative

Server-controlled fields:

- value_origin = SIMULATED
- freshness = NOT_APPLICABLE
- source = USER_DECLARED_PAPER_CAPITAL
- context from trusted server/account/environment authority

The client must not supply authoritative financial truth classification,
BROKER/BANK/REAL source, or live/external verification state.

Minimum output:

- ledger_transaction_id
- ledger posting ids or canonical transaction reference
- derived cash balance projection with truth labels
- explicit unavailable state when balance cannot be derived

Still not built in this design slice.

## Performance Contract

Performance never weakens financial or authority invariants.

Implementation requirements:

- hot account+currency balance/history paths must be indexable without
  repository-wide scans
- posting lookup by ledger_transaction_id must be index-supported
- semantic identity arbitration must be unique-index/constraint supported
- idempotency arbitration must remain index-supported
- account/currency/ledger-account lookup must be index-supported
- singleton LedgerAccount lookup by account_id + currency_code +
  ledger_account_type must be index-supported
- unique initial funding semantic arbitration must be index-supported
- reversal lookup and reversal uniqueness must be index-supported
- transaction seal lookup must be index-supported
- material/idempotency lookup must be index-supported
- pagination/history must have deterministic stable ordering
- no N+1 balance derivation
- no cross-tenant scans
- lock scope must be the minimum required for correctness
- unrelated InvestingAccounts must not be serialized together
- real PostgreSQL 17 implementation gate must include EXPLAIN/plan inspection
  for canonical read paths
- real PostgreSQL 17 implementation gate must include lock-contention and
  concurrency measurement

## I3 Boundary

Deferred to I3+:

- positions
- lots
- fills
- orders
- broker sync
- live cash
- dividend event ingestion
- corporate-action event ingestion
- FX conversion
- tax lots
- realized/unrealized PnL
- portfolio valuation
- performance analytics
- allocation/recommendation/plan engines
- Trading integration
- public UX

I2 ledger design must not block those future events, but it must not pretend to
implement them.

## Threat Matrix

| case | attack/precondition | invariant | expected result | failure class | audit requirement |
| --- | --- | --- | --- | --- | --- |
| forged account selector | User A submits Account B id | AuthorizedInvestingContext and transaction revalidation | deny without disclosing Account B | FORBIDDEN_OR_NOT_FOUND | denied account selector hash and actor |
| forged tenant selector | Client supplies tenantId to account-scoped mutation | tenant derived from canonical account | reject/ignore client tenant authority | FORBIDDEN_OR_NOT_FOUND | supplied selector evidence when available |
| stale context | membership/access changed after context creation | revalidate in mutation transaction | deny, rollback, audit | MEMBERSHIP_INACTIVE or ACCESS_INACTIVE | canonical denial audit |
| revoked membership | membership no longer ACTIVE | persisted membership required | deny | MEMBERSHIP_INACTIVE | principal, tenant, membership evidence |
| revoked access | account_access no longer ACTIVE | persisted access required | deny | ACCESS_INACTIVE | principal, account, access evidence |
| frozen account | account state becomes FROZEN | account state permits operation | deny ordinary cash mutation | ACCOUNT_INACTIVE | account state evidence |
| closed account | account state becomes CLOSED | account state permits operation | deny ordinary cash mutation | ACCOUNT_INACTIVE | account state evidence |
| frozen account replay disclosure | exact replay requested after account freezes | replay creates no new effect but disclosure still needs authority/read policy | allow or deny by current read-disclosure policy, never mutate | FORBIDDEN_OR_NOT_FOUND or none | replay and state evidence |
| duplicate retry same key/material | same idempotency key reused for same request | idempotency exact replay | return same canonical result | none | replay audit |
| same key different material | idempotency key reused with different amount/currency/source | material hash bound to key | conflict, original unchanged | CONFLICT | conflict audit |
| committed STARTED | previous mutation left STARTED committed | no automatic recovery semantics | fail closed | INTERNAL_ERROR | idempotency state evidence |
| duplicate semantic source same material | different key repeats same economic event with same material | semantic identity independent of material hash | replay canonical event; no duplicate cash | none | semantic identity and material hash |
| duplicate semantic source different material | different key repeats same economic event with different material | material hash compared after identity collision | conflict; original unchanged | CONFLICT | semantic identity and conflicting hash |
| unbalanced transaction | debit total differs from credit total | balanced per transaction/currency | reject before commit | INTERNAL_ERROR | transaction id and delta |
| one-sided posting | only one posting inserted | minimum posting count | reject before commit | INTERNAL_ERROR | transaction id |
| orphan posting | posting without valid transaction/account | FK and tuple checks | reject | INTERNAL_ERROR | row evidence |
| cross-account posting | Account A transaction includes Account B posting | composite tuple enforcement | reject | INTERNAL_ERROR | transaction/posting tuple evidence |
| cross-ledger-account mismatch | posting duplicates account/currency fields that disagree with LedgerAccount | composite LedgerAccount tuple FK | reject | INTERNAL_ERROR | ledger account/posting tuple evidence |
| mutable posting | runtime updates posting amount/side/account | append-only privilege model | reject | INTERNAL_ERROR | attempted mutation |
| append to sealed transaction | late posting inserted after POSTED sealing | POSTED_TRANSACTION_IS_SEALED | reject | INTERNAL_ERROR | transaction id and seal evidence |
| delete ledger row | runtime deletes transaction/posting | no DELETE privilege | reject | INTERNAL_ERROR | attempted deletion |
| inexact reversal | reversal omits, resizes, moves, or adds postings | exact economic negation | reject | INTERNAL_ERROR | original/reversal posting comparison |
| double reversal | same original reversed twice | one canonical reversal per original | reject | CONFLICT or INTERNAL_ERROR | original/reversal ids |
| reversal chain | reversal of a reversal requested | I2 does not support reversal chains | reject | VALIDATION_ERROR | original/reversal ids |
| correction overwrites history | implementation updates original transaction | append-only correction model | reject | INTERNAL_ERROR | original row evidence |
| cross-currency sum | UI/API totals EUR and USD as one balance | currency explicit, no implicit FX | return per-currency or UNAVAILABLE | VALIDATION_ERROR | requested projection |
| missing currency | mutation omits currency | explicit currency required | reject | VALIDATION_ERROR | request metadata |
| floating point authority | JS number or parseFloat used for money | decimal string + NUMERIC | reject implementation/test gate | INTERNAL_ERROR | code path evidence |
| overflow/precision drift | amount exceeds precision or scale | DB NUMERIC/check and explicit rounding | reject | VALIDATION_ERROR | amount and currency |
| exponent notation | amount uses 1e6-style input | canonical decimal grammar | reject | VALIDATION_ERROR | raw amount class without secret data |
| locale separators | amount uses comma/group separators | canonical decimal grammar | reject | VALIDATION_ERROR | raw amount class without secret data |
| excess fractional digits | amount exceeds accepted currency scale | per-currency scale policy | reject without rounding | VALIDATION_ERROR | amount scale/currency |
| negative amount convention | negative value encodes credit/debit | positive amount + side required | reject | VALIDATION_ERROR | field evidence |
| concurrent same-key mutation | two transactions insert same idempotency key | unique key + READ COMMITTED reread | one winner, one replay/conflict | none or CONFLICT | winner/loser audit |
| concurrent different-key same event | two keys attempt same economic event | semantic uniqueness + savepoint cleanup | one canonical event; no orphan rows | none or CONFLICT | source/hash evidence |
| authority audit failure | denial audit write fails after rollback | audit failure never allows success | deny, surface INTERNAL_ERROR if required | INTERNAL_ERROR | audit failure evidence |
| success audit failure | success audit cannot commit with ledger mutation | mutation and success audit atomic | rollback whole mutation | INTERNAL_ERROR | transaction evidence |
| connection contamination | stale GUC survives pooled client reuse | contamination preflight | destroy suspect client, fail closed | INTERNAL_ERROR | stale key evidence |
| service_role direct call | repository called with service_role only | AuthorizedInvestingContext required | reject | INTERNAL_ERROR | caller/credential class |
| GUC spoofing | attacker sets account/principal GUCs | persisted relationships required | reject | FORBIDDEN_OR_NOT_FOUND or INTERNAL_ERROR | GUC and persisted mismatch |
| SECURITY DEFINER bypass | function bypasses RLS for ledger write | no casual SECURITY DEFINER | fail design/implementation gate | INTERNAL_ERROR | function owner/search_path/grants |
| table owner bypass | owner lacks FORCE RLS | FORCE ROW LEVEL SECURITY | fail migration gate | INTERNAL_ERROR | table and owner |
| Data API exposure | browser reaches investing ledger table | schema not exposed and no anon/auth grants | reject/no route | FORBIDDEN_OR_NOT_FOUND | attempted surface |
| missing balance evidence | balance projection cannot derive postings | missing != zero | return UNAVAILABLE | none | unavailable evidence |
| fake initial cash | default balance generated from account creation | no invented financial truth | reject implementation | INTERNAL_ERROR | source absence |

## Required Tests For Implementation Slice

Static/design tests:

- no JavaScript number authority for money
- decimal strings required at boundary
- PostgreSQL NUMERIC required in persistence
- PostgreSQL NUMERIC(24, 8) required in persistence
- STORAGE_MAX_PRECISION = 24 and STORAGE_MAX_SCALE = 8
- canonical decimal grammar rejects exponent notation, locale separators, NaN,
  Infinity, leading plus ambiguity, excessive scale, and precision overflow
- per-currency scale violation rejects with VALIDATION_ERROR, no rounding, and
  no ledger effect
- ACCOUNT_CLASS and NORMAL_SIDE are frozen
- CASH_ASSET is ASSET/DEBIT
- SIMULATED_CAPITAL is EQUITY/CREDIT
- INITIAL_PAPER_CASH_FUNDING is DEBIT CASH_ASSET / CREDIT SIMULATED_CAPITAL
- INITIAL_PAPER_CASH_FUNDING uses value_origin = SIMULATED, freshness =
  NOT_APPLICABLE, and source = USER_DECLARED_PAPER_CAPITAL
- client input cannot declare REAL, broker, bank, external verification, or live
  provenance for INITIAL_PAPER_CASH_FUNDING
- material hash domain is INVESTING:I2:INITIAL_PAPER_CASH_FUNDING:v1
- material hash covers every financial/evidence field and excludes
  idempotency_key and correlation_id
- semantic identity excludes material_request_hash
- INITIAL_PAPER_CASH_FUNDING is unique per canonical InvestingAccount
- singleton CASH_ASSET and SIMULATED_CAPITAL accounts are unique per tenant_id +
  account_id + currency_code + ledger_account_type
- transaction/posting/account/currency tuple consistency is DB-enforced
- POSTED_TRANSACTION_IS_SEALED is required
- TRANSACTION_SEAL_MODEL = APPEND_ONLY_IMMUTABLE_SEAL_RECORD
- no transaction may commit without exactly one immutable seal
- exact full reversal negates every original posting
- zero versus UNAVAILABLE is explicit
- terminal replay creates no new financial mutation
- performance/index requirements are present
- ledger tables are append-only for runtime
- ledger tables have ENABLE and FORCE RLS
- no service_role normal ledger access
- no anon/authenticated/PUBLIC ledger access
- no SECURITY DEFINER without explicit accepted exception
- no Data API exposure assumption
- no Trading dependency

Database tests on real PostgreSQL 17:

- balanced transaction commits
- unbalanced transaction rejects at commit
- one-sided transaction rejects
- late posting into sealed POSTED transaction rejects
- cross-account transaction/posting tuple rejects
- posting/ledger-account tuple mismatch rejects
- posting update/delete rejects
- ledger delete rejects
- same-key replay creates no duplicate cash effect
- same-key different material conflicts
- same semantic identity/same material replays with no duplicate cash effect
- same semantic identity/different material conflicts with no new effect
- initial paper funding cannot occur twice for one canonical InvestingAccount
- full reversal exactly negates all original postings
- inexact reversal rejects
- double reversal rejects
- reversal chain rejects
- different-key same semantic event does not duplicate cash
- concurrent same-key ledger mutation has one canonical result
- concurrent different-key semantic duplicate has one canonical result
- rollback removes partial postings
- savepoint loser cleanup leaves no orphan rows
- FROZEN/CLOSED account denies new ordinary cash mutation
- revoked membership/access denies mutation after request-time context
- cross-account/cross-tenant access returns no unauthorized rows
- GUC-only authority fails
- service_role-only authority fails
- balance derivation returns UNAVAILABLE when evidence is absent
- balance derivation returns KNOWN_ZERO only from complete canonical ledger
  evidence
- canonical read paths have reviewed PostgreSQL 17 execution plans
- lock contention does not serialize unrelated InvestingAccounts

Runtime tests:

- one acquired client from BEGIN through COMMIT/ROLLBACK
- BEGIN ISOLATION LEVEL READ COMMITTED
- contamination preflight before scope set
- clean COMMIT release
- clean ROLLBACK release
- suspect cleanup destroys client
- denial audit survives mutation rollback
- success audit commits atomically with ledger mutation

## Acceptance Gates For First Ledger Implementation

Future I2 ledger implementation is accepted only if all are true:

- exact parent and branch are verified
- no pre-Genesis Investing imports or behavior references
- no Trading modification
- no Data API or browser direct access
- migration applies on real PostgreSQL 17
- actual investing_app executes runtime paths
- FORCE RLS is exercised
- DB invariants reject malformed ledger states
- double-entry balance is DB-enforced
- idempotency semantics are replay/conflict exact
- concurrency is real two-session PostgreSQL concurrency
- source hashes are frozen before rehearsal
- full tests have no new failure family
- Production remains untouched until explicit owner authorization

No gate is marked PASS by this design document.

## Open Material Questions

OPEN_MATERIAL_QUESTIONS = NONE_FOR_DESIGN

Implementation must still choose and prove exact SQL mechanics for balance
enforcement under FORCE RLS. That is an implementation acceptance gate, not an
unresolved design permission to weaken the contract.

## Design Verdict

DESIGN_GATE = PASS

READY_FOR_INDEPENDENT_I2_DESIGN_AUDIT = YES
