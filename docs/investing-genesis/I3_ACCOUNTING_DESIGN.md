# Investing Genesis I3 Accounting Design

PARENT_SHA =
af5feb8f4e62659adad0784b4dcab2c6eb6698b9

I2_FROZEN_SHA =
af5feb8f4e62659adad0784b4dcab2c6eb6698b9

STATUS = DESIGN_CANDIDATE_AUDIT_ITERATION_2

This document is DESIGN / THREAT MODEL ONLY.

It creates no runtime code, SQL, migration, Supabase state, Vercel state,
Production mutation, public API, UI, broker integration, execution engine, or
financial rows.

I3 starts from the accepted Investing Genesis lineage:

- I0 Constitution
- I1 Authority Design
- I1 Database Boundary Contract
- accepted I2 authority materialization and AuthorizedInvestingContext
- accepted I2 atomic personal bootstrap
- accepted I2 immutable double-entry ledger / cash

Pre-Genesis Investing source, historical portfolio models, deleted Investing
code, old migrations, old holdings tables, old recommendations, and Trading
state are not implementation authorities.

## I3 Objective

I3 defines canonical accounting for:

- instrument identity required by account holdings
- immutable fill events
- deterministic accounting lots
- derived positions
- fill-to-lot allocation
- realized accounting results when evidence is complete
- corporate actions that affect quantity, cost basis, or cash
- immutable corrections/reversals
- reconciliation between position accounting and the I2 ledger

I3 must make it possible to reconstruct why an account holds a quantity, which
fills created it, which acquisition lots remain economically open, which events
consumed or transformed those lots, and which I2 ledger transactions correspond
to cash effects.

POSITION_IS_DERIVED = TRUE

FILL_IS_IMMUTABLE = TRUE

LOT_ORIGIN_IS_IMMUTABLE = TRUE

LOT_ACCOUNTING_HISTORY_IS_APPEND_ONLY = TRUE

CORPORATE_ACTION_EVENT_IS_IMMUTABLE = TRUE

CORPORATE_ACTION_APPLICATION_IS_IMMUTABLE = TRUE

CASH_AUTHORITY_REMAINS_I2_LEDGER = TRUE

## Current Runtime Status

I3_RUNTIME_STATUS = NOT_PROVEN_IN_THIS_DESIGN_SLICE

This design authorization does not include Supabase inspection or mutation.
No claim about live I3 schema or runtime behavior is made here.

Repository truth at the parent SHA contains no accepted I3 design document.

## Scope

IN SCOPE:

- canonical instrument identity contract for I3 accounting
- fill event model
- acquisition-lot origin model
- lot-consumption/allocation model
- long-only position accounting
- deterministic FIFO accounting methodology candidate
- position completeness and KNOWN_ZERO semantics
- fill bust/correction/reversal design
- accounting cost basis
- realized result derivation when evidence is sufficient
- corporate-action source and account-application design
- split / reverse split accounting
- cash dividend accounting
- fractional/cash-in-lieu contract
- I2 ledger extension and reconciliation contract
- cash-only / no-margin invariant for the initial capability
- decimal, currency, time, provenance, lineage, idempotency, RLS, privilege,
  concurrency, and failure contracts
- implementation acceptance gates

OUT OF SCOPE:

- public API
- browser financial access
- product UI
- Trading integration
- live broker credentials
- live order routing
- order execution engine
- paper order execution engine (I7)
- broker synchronization runtime
- market-data ingestion engine
- current market valuation
- performance analytics
- portfolio optimization
- recommendation engine
- plan engine
- tax filing or jurisdiction-specific tax advice
- wash-sale or equivalent jurisdiction-specific tax rules
- short selling
- margin
- options/futures/derivatives accounting
- securities lending
- multi-leg instruments
- arbitrary merger/spinoff/tender/rights workflows in the first implementation
- implicit FX conversion

I3 may preserve an optional order/execution reference on a fill for lineage.
It does not make order state canonical. Canonical paper order lifecycle belongs
to I7.

## Product Producer Boundary

I3 is an accounting consumer, not an execution producer.

I3_PRODUCT_FILL_PRODUCER = UNAVAILABLE

Until I7 or another separately accepted producer exists, I3 must not expose a
product route that lets a client invent a canonical fill by supplying arbitrary
price/quantity/execution truth.

A future I3 implementation may be behaviorally rehearsed with controlled
synthetic NON-PRODUCTION fixtures. Such fixtures are DEMO/SIMULATED evidence and
are not product execution truth.

## Domain Boundary

Investing and Trading remain independent.

Forbidden:

- reading Trading positions as Investing truth
- reusing Trading fills as Investing authority without an explicitly accepted
  neutral ingestion contract
- using Trading PnL, portfolio, orders, market state, or execution state as I3
  persistence
- writing Investing accounting events into Trading persistence

No path, service, queue, database object, or shared module may silently bridge
these domains.

## Accounting Truth Model

I3 distinguishes:

1. EVENT TRUTH
   - immutable fills and corporate-action events/applications
2. ACQUISITION LOT ORIGINS
   - immutable economic acquisition identity from BUY fills
3. ACCOUNTING REVISION OUTPUTS
   - immutable lot-consumption/transform allocations under a frozen methodology
4. POSITION PROJECTION
   - deterministic derivation from canonical event/revision evidence
5. CASH TRUTH
   - I2 ledger authority, never a position cache

A position cache may exist later only as a rebuildable projection.

A cached projection MUST NOT be the only evidence for:

- quantity
- cost basis
- realized result
- cash
- dividends
- fees

Any materialized projection must identify the exact accounting revision/event
watermark from which it was derived.

Deleting or corrupting a projection must not destroy canonical accounting
history.

## Completeness And Zero Semantics

Missing holdings evidence is not zero.

A quantity may be KNOWN_ZERO only when canonical evidence proves:

- an explicit complete accounting baseline for the account; and
- a complete deterministic event stream through the requested as-of boundary;
  and
- the derived quantity is exactly zero.

For Genesis paper accounts, a future immutable accounting-genesis anchor may
establish:

```text
source = PAPER_ACCOUNT_GENESIS
value_origin = SIMULATED
freshness = NOT_APPLICABLE
context = DEMO
```

Such an anchor means only that the canonical Syntrake paper accounting book
starts from zero holdings. It does not claim that a real broker or external user
owns no securities.

There may be at most one canonical paper accounting-genesis semantic event per
InvestingAccount.

Without complete baseline/event evidence:

```text
POSITION_QUANTITY = UNAVAILABLE
COST_BASIS = UNAVAILABLE
REALIZED_RESULT = UNAVAILABLE when dependent evidence is missing
```

Zero rows, failed queries, absent caches, or unknown instruments never prove
zero.

## Instrument Identity

Symbol/ticker is not durable identity.

Canonical I3 instrument identity requires immutable internal instrument_id.

Conceptual Instrument fields:

- instrument_id
- asset_class
- primary_currency_code when semantically known
- state
- created_at
- lineage_id

Conceptual external identifier mapping fields:

- instrument_identifier_id
- instrument_id
- identifier_type
- identifier_value
- source
- venue_or_mic when applicable
- valid_from
- valid_to
- recorded_at
- lineage_id

Rules:

- ticker/symbol changes do not create a new economic holding by themselves.
- identifier reuse across time must not alias two instruments.
- venue/exchange context is explicit when required to disambiguate.
- client ticker text never proves canonical instrument identity.
- every fill and account corporate-action application references instrument_id.
- identifier history is never silently overwritten.

### Instrument Registry Authority

Client input cannot create authoritative instrument identity.

A trusted runtime instrument registry requires a Constitution-compliant domain
authority path and source provenance.

Until that path is separately accepted:

```text
PRODUCT_INSTRUMENT_REGISTRY_INGESTION = BLOCKED
```

Synthetic instrument fixtures are permitted only in authorized NON-PRODUCTION
rehearsal and remain DEMO/SIMULATED context where financial values are involved.

First implementation may restrict the supported instrument universe narrowly.
Unsupported instruments fail VALIDATION_ERROR/UNAVAILABLE, never coercion.

## Fill Event Model

A Fill is an immutable economic execution event consumed by accounting.

A Fill is not an order, quote, recommendation, position, or cash balance.

Conceptual fields:

- fill_id
- tenant_id
- account_id
- instrument_id
- side: BUY | SELL
- quantity
- unit_price
- settlement_currency_code
- gross_consideration
- fee_amount
- fee_currency_code
- effective_at
- settlement_at when known/applicable
- recorded_at
- actor_kind
- actor_id
- principal_id when USER_PRINCIPAL
- operation_scope
- operation
- correlation_id
- idempotency_record_id
- material_request_hash
- source
- source_reference
- optional order_reference for lineage only
- value_origin
- freshness
- context
- lineage_id
- reversal_of_fill_id when applicable
- correction_of_fill_id when applicable

Fill event truth MUST NOT contain accounting_revision_id as identity.
A fill exists independently of whichever deterministic accounting revision later
consumes it.

Rules:

- fills are INSERT-only canonical events.
- runtime cannot UPDATE or DELETE a committed fill.
- direction is explicit; quantity and monetary fields are decimal magnitudes.
- quantity > 0.
- unit_price > 0 for ordinary BUY/SELL.
- gross_consideration > 0 for ordinary BUY/SELL.
- fee_amount >= 0.
- initial capability requires fee_currency_code = settlement_currency_code.
- initial SELL requires fee_amount <= gross_consideration so net cash proceeds
  are non-negative; more complex fee settlement is deferred.
- source_reference is required whenever the producer/source has a stable event
  identifier.
- gross consideration is deterministically derived or independently verified
  using the accepted rounding contract.
- a simulated/rehearsal fill cannot be marked REAL.
- paper/rehearsal fills are SIMULATED + NOT_APPLICABLE + DEMO.

A fill price is historical execution evidence, never proof of current market
price.

## Fill Semantic Identity And Idempotency

Transport idempotency and economic identity are distinct.

TRANSPORT_IDEMPOTENCY:

- idempotency_key
- material_request_hash
- actor/scope

For a producer/source with stable fill id:

```text
ECONOMIC_FILL_IDENTITY =
tenant_id
account_id
source
source_reference
event_kind = FILL
```

For future internal paper execution, source_reference must bind to canonical I7
fill/execution identity, not a client-arbitrary reference.

For controlled non-production rehearsal, source/source_reference are synthetic
fixture evidence and never product truth.

Same semantic identity + same canonical material:

```text
REPLAY existing canonical fill/accounting result
NO duplicate lot effect
NO duplicate position effect
NO duplicate ledger effect
```

Same semantic identity + different canonical material:

```text
CONFLICT
NO new financial effect
```

The material hash covers every field that changes accounting meaning, including:

- canonical tenant/account
- instrument_id
- side
- canonical quantity
- canonical unit_price
- settlement currency
- gross consideration
- fee amount/currency
- effective_at when source-controlled
- settlement_at when material
- source/source_reference
- value_origin/freshness/context
- material execution/correction references

correlation_id and transport idempotency_key are not economic material.

## Decimal And Precision Contract

JavaScript number is forbidden as financial authority.

Application boundary:

```text
quantity / price / money / rate -> decimal string
```

Persistence:

```text
bounded PostgreSQL NUMERIC(p,s)
```

I3 MUST NOT use unconstrained NUMERIC for attacker- or source-controlled decimal
financial authority.

Exact p/s values for quantity, unit price, rates, and derived money must be
frozen in the implementation schema only after the supported instrument universe
and source precision are audited.

The implementation gate must prove:

- bounded precision/scale per semantic field
- no exponent notation
- no NaN/Infinity
- no locale separators
- no implicit rounding
- explicit instrument quantity scale
- explicit currency money scale
- explicit accepted price scale/tick policy when applicable
- deterministic multiply/divide rounding rules
- overflow fails closed

I2 cash postings remain under accepted I2 NUMERIC(24,8) money authority. I3 may
not pass values requiring silent I2 rounding.

Unrepresentable result:

- use an explicitly accepted/versioned rounding rule where economically valid;
  or
- fail closed.

## Currency Contract

Currency is explicit.

Initial I3 capability:

- one settlement currency per fill
- fee currency equals settlement currency
- no implicit FX

No implicit conversion for:

- cost basis
- fees
- realized result
- dividends
- cash-in-lieu
- portfolio totals

If required FX evidence is unavailable:

```text
VALUE = UNAVAILABLE
```

not zero and not guessed FX.

## Time Contract

I3 differentiates:

- effective_at: economic fill/action time
- settlement_at: cash settlement time when applicable
- record_date: entitlement boundary when applicable
- ex_date: market action date when applicable
- payment_date: payment date when applicable
- observed_at: external evidence observation time
- retrieved_at: fetch time
- recorded_at: canonical Syntrake recording time
- as_of: projection boundary

recorded_at never substitutes for missing economic time.

Late arrival with earlier effective_at must not silently rewrite prior canonical
lot allocation history.

## Accounting Order And Late Events

Lot allocation needs deterministic economic ordering.

Arrival order is not sufficient authority.

Canonical ordering uses source/economic evidence such as:

```text
effective_at
source execution sequence when available
stable source_reference tie-breaker
```

If two competing events cannot be deterministically ordered from canonical
evidence, accounting FAILS CLOSED rather than using arbitrary insertion order.

A late event that belongs before already-accounted dependent events creates:

```text
ACCOUNTING_REBUILD_REQUIRED
```

Old accounting outputs are not mutated.

## Accounting Revision Model

Economic events are immutable and revision-independent.

Derived accounting outputs may belong to an immutable AccountingRevision.

Conceptual fields:

- accounting_revision_id
- tenant_id
- account_id
- instrument_id
- methodology_id
- methodology_version
- event_set_hash or exact event watermark
- supersedes_accounting_revision_id when applicable
- created_at
- lineage_id

A revision replays the same immutable event truth under an explicitly identified
canonical event set/methodology.

A current-revision pointer, if materialized later, is a controlled projection
pointer and never erases or mutates prior revision history.

Methodology changes or late events cannot silently reinterpret previous results.

## Acquisition Lot Origin Model

A BUY creates exactly one logical acquisition-lot origin in the initial simple-
security capability.

Conceptual AcquisitionLotOrigin fields:

- lot_origin_id
- tenant_id
- account_id
- instrument_id
- acquisition_fill_id
- acquired_quantity
- acquisition_unit_price
- acquisition_gross_cost
- acquisition_fee_amount
- settlement_currency_code
- effective_at
- recorded_at
- lineage_id

Semantic uniqueness:

```text
ONE acquisition lot origin per canonical BUY fill_id
```

The origin is immutable and does not acquire a new identity merely because a
later accounting revision recalculates downstream allocations.

## Lot Consumption Allocation Model

SELL accounting consumes acquisition-lot origins under an AccountingRevision.

Conceptual fields:

- lot_consumption_allocation_id
- accounting_revision_id
- lot_origin_id
- disposal_fill_id
- tenant_id
- account_id
- instrument_id
- consumed_quantity
- allocated_cost_basis
- allocated_gross_proceeds
- allocated_disposal_fee
- realized_result when evidence is complete
- effective_at
- recorded_at
- lineage_id

Semantic uniqueness in one revision:

```text
(accounting_revision_id, disposal_fill_id, lot_origin_id)
```

Required DB-enforced invariants:

- SUM(consumed_quantity for disposal_fill_id + revision) = SELL fill quantity.
- consumption of one lot origin cannot exceed its revision-valid available
  quantity.
- no cross-account consumption.
- no cross-instrument consumption.
- allocated basis/proceeds/fee reconcile exactly to their source fill and lot
  evidence under the accepted rounding methodology.
- allocation rows are immutable.

## Initial Lot Matching Method

Initial candidate:

```text
LOT_MATCHING_METHOD = FIFO_V1
```

FIFO_V1 is Syntrake paper accounting methodology, not tax advice.

FIFO ordering uses deterministic economic/source ordering, not DB arrival order.

Methodology/version is stored in AccountingRevision lineage.

Future user-selected or jurisdiction-specific tax methods require separate
accepted design.

## Position Derivation

Canonical position quantity for account/instrument/as-of is derived from:

- complete baseline/genesis evidence
- canonical BUY/SELL fills
- accepted fill reversals/corrections
- revisioned lot consumption allocations
- split/reverse-split transformations
- other explicitly supported quantity actions

A position projection may expose:

- tenant/account/instrument
- quantity
- open lot count
- cost basis by explicit currency
- methodology/version
- as_of
- accounting_revision_id
- truth dimensions
- evidence references

It must not invent:

- current price
- market value
- unrealized PnL
- return
- target
- probability

Without accepted current market evidence, those values are UNAVAILABLE.

Required quantity reconciliation:

```text
DERIVED_POSITION_QUANTITY
=
SUM(revision-valid open acquisition-lot quantity)
```

including accepted corporate-action transformations.

## Long-Only And Cash-Only Invariants

Initial I3 implementation is:

```text
LONG_ONLY = TRUE
MARGIN = FALSE
NEGATIVE_CASH = FORBIDDEN
```

SELL beyond deterministic open quantity:

```text
INSUFFICIENT_POSITION
NO fill commit
NO lot allocation
NO ledger effect
```

BUY requires a complete, known I2 cash balance in the settlement currency.

Initial paper BUY cash requirement:

```text
cash_required = gross_consideration + acquisition_fee
```

If canonical cash evidence is incomplete:

```text
CASH = UNAVAILABLE
BUY = BLOCKED
```

If known available cash < cash_required:

```text
INSUFFICIENT_CASH
NO fill commit
NO lot effect
NO ledger effect
```

No margin loan, negative cash, or implicit borrowing is created.

A legitimate known zero cash balance is distinct from unavailable cash.

## Cost Basis And Realized Result V1

Initial BUY acquisition basis methodology:

```text
acquisition_basis
= gross_consideration + acquisition_fee
```

Both components must be in the same settlement currency for V1.

For SELL:

```text
consumed_basis
= exact sum of FIFO_V1 allocated lot basis

gross_trading_result
= gross_consideration - consumed_basis

net_realized_result
= gross_consideration - disposal_fee - consumed_basis
```

All values preserve explicit currency.

If any required basis/proceeds/fee/currency evidence is missing:

```text
REALIZED_RESULT = UNAVAILABLE
```

Paper results remain SIMULATED + DEMO and must never be described as broker-
realized performance.

## I2 Ledger Integration

I3 does not create a second cash balance.

Initial settlement candidate:

```text
SETTLEMENT_MODEL = IMMEDIATE_PAPER
```

I3 extends I2 ledger only through separately accepted schema changes.

Candidate economically meaningful ledger account types for V1:

```text
SECURITIES_BOOK_COST_ASSET   ASSET    normal DEBIT
TRADING_FEE_EXPENSE          EXPENSE  normal DEBIT
REALIZED_GAIN_LOSS           INCOME   normal CREDIT
DIVIDEND_INCOME              INCOME   normal CREDIT
```

Exact schema names/checks remain implementation work, but the V1 economic posting
shapes below are design authority.

### BUY Immediate-Paper Posting Shape

For:

```text
gross = G > 0
acquisition fee = F >= 0
basis = B = G + F
```

post exactly:

```text
DEBIT   SECURITIES_BOOK_COST_ASSET   B
CREDIT  CASH_ASSET                   B
```

Acquisition fee remains explicit in Fill/Lot evidence and is capitalized into
V1 acquisition basis.

### SELL Immediate-Paper Posting Shape

For:

```text
gross proceeds = G > 0
disposal fee = F >= 0 and F <= G
consumed basis = B > 0
net cash proceeds = C = G - F
```

always:

```text
DEBIT   CASH_ASSET                   C   when C > 0
DEBIT   TRADING_FEE_EXPENSE          F   when F > 0
CREDIT  SECURITIES_BOOK_COST_ASSET   B
```

Then balance gross trading result before disposal fee:

If G > B:

```text
CREDIT  REALIZED_GAIN_LOSS           G - B
```

If G < B:

```text
DEBIT   REALIZED_GAIN_LOSS            B - G
```

If G = B, no zero PnL posting is inserted.

If C = 0, no zero CASH_ASSET posting is inserted; the remaining postings must
still form a valid balanced transaction.

User-facing V1 net realized result is:

```text
G - F - B
```

and reconciles to the combined REALIZED_GAIN_LOSS and TRADING_FEE_EXPENSE ledger
effects.

No zero-amount ledger postings are allowed.

### Cash Dividend Posting Shape

For accepted dividend cash amount D > 0:

```text
DEBIT   CASH_ASSET       D
CREDIT  DIVIDEND_INCOME  D
```

The dividend account application and ledger transaction are canonically linked.

### Cash-In-Lieu

Cash-in-lieu posting/basis treatment is not guessed from split ratio alone.
It requires an accepted disposal/basis allocation contract and explicit cash
evidence before implementation.

## Atomicity Contract

For V1 immediate settlement, the following are one material atomic transaction:

- authority revalidation
- idempotency/semantic arbitration
- fill insert or replay decision
- acquisition-lot origin / lot-consumption allocation
- required I2 ledger transaction/postings/seal
- success audit

Any material failure rolls back the whole new effect.

A fill cannot return success while required ledger cash effect failed.

A ledger trade cash effect without matching canonical I3 lineage is a
reconciliation failure.

## Synchronization And Locking Contract

I3 requires serialization across different idempotency keys that compete for the
same financial resources.

Idempotency-row locks alone are insufficient for:

- two BUYs spending the same cash
- two SELLs consuming the same open lot quantity
- fill vs split/corporate-action races

I3 implementation must introduce or prove persisted canonical synchronization
rows that are NOT financial authority.

Minimum logical mutex scopes:

```text
ACCOUNT_CURRENCY_CASH_SCOPE
  key = tenant_id + account_id + currency_code

ACCOUNT_INSTRUMENT_ACCOUNTING_SCOPE
  key = tenant_id + account_id + instrument_id
```

The mutex rows contain no cash balance, quantity, PnL, or ownership truth.
They exist only as narrow DB serialization points.

All I3 operations must follow one frozen global lock order. Candidate order:

```text
1 authority/idempotency arbitration required by accepted I1/I2 contracts
2 account-currency cash mutexes, sorted canonically
3 account-instrument accounting mutexes, sorted canonically
4 dependent accounting/ledger rows
```

Any operation needing both cash and instrument locks follows that same order.

### RLS / FOR UPDATE Requirement

The I2 rehearsal proved that merely writing `FOR UPDATE` in a function does not
prove the actual investing_app role can obtain the lock through ACL + FORCE RLS.

Therefore I3 implementation acceptance requires real proof that actual
investing_app can lock exactly the authorized mutex row and cannot mutate its
semantic key/economic data.

If PostgreSQL row locking requires UPDATE privilege, use only the minimum narrow
column privilege/policy proven necessary for locking a non-financial mutex row.
Actual UPDATE must remain denied or semantically harmless by DB enforcement.

Required regressions:

- authorized actual-role SELECT ... FOR UPDATE sees/locks exactly one mutex row
- wrong tenant/account/currency/instrument sees zero rows
- actual UPDATE of mutex scope identity is denied
- no table-level broad UPDATE is introduced merely to obtain locks
- competing sessions really block/serialize as designed

Do not use a session advisory lock as sole correctness machinery.

## DB-Enforced No-Overspend / No-Oversell

Application checks alone are insufficient.

The future DB integrity layer must validate, under the canonical mutex lock and
before commit/seal:

- a V1 cash-consuming BUY cannot make known paper CASH_ASSET balance negative;
- a SELL cannot consume more quantity than revision-valid open lot quantity;
- SELL lot-consumption sum equals SELL quantity;
- lot and fill scope match tenant/account/instrument;
- ledger cash effects match the accepted I3 event.

Two-session regressions must prove no write-skew allows overspending or
overconsumption.

## Corporate Action Model

Corporate actions have two distinct layers:

1. DOMAIN ACTION EVIDENCE
2. ACCOUNT ACTION APPLICATION

Conceptual domain fields:

- corporate_action_id
- instrument_id
- action_type
- source
- source_reference
- announced_at when known
- ex_date when applicable
- record_date when applicable
- effective_at
- payment_date when applicable
- canonical terms
- material_request_hash/content hash
- observed_at
- retrieved_at
- recorded_at
- value_origin/freshness
- lineage_id
- correction_of_corporate_action_id when applicable

Domain semantic identity when source_reference is stable:

```text
instrument_id
source
source_reference
action_type
```

Same identity + same canonical material -> replay.

Same identity + different material -> CONFLICT unless an explicit correction
contract/source correction event is used.

Conceptual account application fields:

- corporate_action_application_id
- corporate_action_id
- tenant_id
- account_id
- instrument_id
- eligibility_as_of
- affected_quantity
- correlation_id
- actor_kind
- actor_id
- lineage_id
- resulting_ledger_transaction_id when cash-affecting

Account application event truth is revision-independent.
Derived lot transformations may belong to AccountingRevision.

Account-application semantic identity:

```text
corporate_action_id
tenant_id
account_id
application_kind
```

Same identity + same material -> replay/no duplicate quantity or cash effect.

Same identity + different material -> CONFLICT or explicit correction path.

## Corporate Action Authority Dependency

External corporate-action ingestion is domain evidence, not user authority.

A future trusted ingestion path requires explicitly accepted SYSTEM_ACTOR or
another Constitution-compliant domain authority.

service_role, database login, cron name, or client input does not become
SYSTEM_ACTOR.

Until accepted:

```text
EXTERNAL_CORPORATE_ACTION_INGESTION = BLOCKED
```

Domain evidence tables must remain server-controlled, deny browser write access,
and use authority appropriate to DOMAIN_SCOPE. They must not fabricate tenant or
account identity.

Account application is ACCOUNT_SCOPE and requires canonical account authority.

## Split And Reverse Split

First quantity corporate-action candidates:

- SPLIT
- REVERSE_SPLIT

Use exact rational terms where source expresses N-for-D:

```text
ratio_numerator > 0
ratio_denominator > 0
```

No floating-point ratio conversion.

For every affected acquisition-lot origin/revision output:

- total pre-action basis is preserved unless accepted action terms require
  another treatment
- quantity transforms deterministically by exact ratio
- per-unit basis is derived
- original event/lot-origin history remains unchanged
- transformation output is immutable and linked to action/application/revision

If resulting quantity exceeds supported scale or fractional policy is unresolved,
do not round silently.

## Fractional Shares And Cash-In-Lieu

Fractional eligibility is explicit account/instrument capability.

If split yields fractional remainder:

- retain exact fractional quantity if supported; or
- require explicit canonical cash-in-lieu evidence and accepted basis allocation.

Never invent cash-in-lieu from guessed price.

If fractional holding is prohibited and cash-in-lieu evidence is missing:

```text
ACCOUNT APPLICATION = BLOCKED / UNAVAILABLE
```

not truncation.

## Cash Dividends

Cash dividend application requires complete evidence for:

- canonical action
- accepted entitlement rule
- eligible historical account position at the required record/ex boundary
- dividend amount/rate
- currency
- payment/effective date
- provenance

Entitlement derives from historical position evidence, not current mutable
quantity.

Successful application creates exactly one canonically linked I2 dividend ledger
transaction under semantic uniqueness.

Missing entitlement/amount/currency is UNAVAILABLE/BLOCKED, never zero dividend.

Paper dividend remains SIMULATED unless later external evidence and account
context justify stronger truth.

## Deferred Corporate Actions

Initial implementation may defer:

- merger
- spinoff
- rights issue
- tender
- return of capital
- mandatory conversion
- complex reorganization

A deferred action is UNSUPPORTED/BLOCKED. It must not be coerced into split or
dividend semantics.

Reference-only symbol changes belong to versioned instrument identifier history,
not fake quantity events.

## Corrections, Busts, And Reversals

Committed fills and corporate-action applications are never overwritten.

Correction model:

- immutable reversal/bust event linked to original
- optional corrected replacement event
- original remains queryable
- derived lot/accounting outputs are recreated in a new revision where required
- cash effects use canonical I2 reversal/correction lineage
- projections are rebuilt, not edited as authority

Double reversal, loops, ambiguous chains, or correction that cannot restore I2
and I3 reconciliation fail closed.

## Realized And Unrealized Results

REALIZED ACCOUNTING RESULT:

May be derived only from complete canonical sale proceeds, consumed lot basis,
fee treatment, currency, and methodology evidence.

UNREALIZED PNL / MARKET VALUE:

Not canonical in I3 without accepted current market-data evidence and valuation
methodology.

Fill price cannot substitute for current market price.

Missing current valuation evidence -> UNAVAILABLE.

## Financial Truth Dimensions

I3 preserves:

- VALUE_ORIGIN: REAL | ESTIMATED | SIMULATED | UNAVAILABLE
- FRESHNESS: FRESH | STALE | UNKNOWN | NOT_APPLICABLE
- CONTEXT: PRODUCTION | DEMO

Derived truth must not claim stronger provenance/freshness/context than its
material dependencies support.

Examples:

- SIMULATED fill + DEMO account -> SIMULATED + DEMO result
- missing required FX -> UNAVAILABLE
- stale external action evidence cannot be FRESH

Truth labels are never client-controlled financial authority.

## Authority Model

Every account-scoped material I3 mutation requires server-created
AuthorizedInvestingContext or a future explicitly accepted SYSTEM_ACTOR path.

USER_PRINCIPAL path revalidates in the material transaction:

- Principal ACTIVE
- Tenant ACTIVE
- TenantMembership ACTIVE
- AccountAccess ACTIVE
- InvestingAccount state permits operation
- operation/capability
- account/instrument scope
- idempotency state

Client userId/tenantId/accountId are selectors at most, never ownership proof.

service_role is capability, never authorization.

DOMAIN_SCOPE events do not fabricate tenant/account.
ACCOUNT_SCOPE applications require canonical tenant/account.

## Account State

ACTIVE:

- may accept permitted I3 ordinary events after revalidation

FROZEN / CLOSED:

- no new ordinary fills
- historical reads may remain under future read policy
- corrections, mandatory corporate actions, and reconciliation require explicit
  operation-specific policy and are not automatically allowed

Exact replay creates no new economic effect and still obeys current disclosure
authorization.

## RLS And Privilege Model

Future I3 account-scoped tables must:

- be in investing schema
- be owned by investing_owner
- ENABLE RLS
- FORCE RLS
- deny PUBLIC
- deny anon
- deny authenticated browser access
- deny service_role as normal application access
- grant investing_app minimum privileges only
- expose no direct browser financial API

Policies bind persisted canonical relationships and trusted transaction context.
GUCs alone do not prove ownership.

Append-only financial/event tables do not grant runtime UPDATE/DELETE.

No casual SECURITY DEFINER bypass.

Domain reference/evidence tables must also deny untrusted browser mutation and
must have explicit domain authority even when account RLS is not the relevant
model.

## Concurrency Model

Baseline:

- READ COMMITTED unless a stronger level is separately proven necessary
- one acquired DB client per material transaction
- persisted narrow mutex rows for correctness-critical scope serialization
- no split pool.query pseudo-transaction
- no session SET authority
- no session advisory lock as sole correctness

Required guarantees:

- duplicate same-source fill cannot double-apply
- different keys for same fill cannot double-apply
- two concurrent BUYs cannot spend the same known cash
- two concurrent SELLs cannot consume the same lot quantity
- BUY/SELL ordering is deterministic or ambiguity fails closed
- fill vs split/action races serialize around the account/instrument scope
- unrelated accounts do not serialize globally
- loser paths leave zero orphan fill/lot/ledger/audit effect

## Reconciliation Contract

Required position reconciliation:

```text
fills + accepted corporate actions + corrections
  -> revisioned lot allocations/transformations
  -> open lot quantities
  -> derived position
```

Required cash reconciliation:

```text
I3 cash-affecting event
  -> exact expected economic cash effect
  -> canonical I2 ledger transaction
  -> derived I2 cash balance
```

Required book-cost reconciliation for V1:

```text
SUM(open lot acquisition basis after accepted consumptions/transformations)
=
account/instrument contribution to securities book cost projection
```

Aggregate ledger SECURITIES_BOOK_COST_ASSET must reconcile to the sum of
revision-valid open lot basis across supported instruments for the same
account/currency, subject only to explicitly accepted action adjustments.

Mismatch = INTERNAL_ERROR / BLOCKED, never hidden.

## Audit And Lineage

Financial Ledger != I3 Accounting Events != Operational Audit != Decision
Lineage != User-Facing History.

For a material position change it must be possible to answer:

- what changed quantity?
- when economically effective?
- source/reference?
- actor/process?
- tenant/account/instrument?
- which lot origins/allocations/transformations?
- methodology/version?
- which revision supersedes prior derived accounting?
- which I2 ledger event carries cash effect?
- which truth dimensions/evidence support result?

Audit never contains secrets/tokens.

## Initial I3 Capability Candidate

First implementation candidate:

```text
I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1
```

Constraints:

- canonical bootstrapped InvestingAccount
- controlled internal accounting consumer
- no product/client fill producer in I3
- DEMO / paper context
- LONG_ONLY
- CASH_ONLY / no margin
- supported simple cash security instrument
- BUY/SELL only
- decimal-string quantity/price
- one settlement currency
- fee currency = settlement currency
- FIFO_V1
- IMMEDIATE_PAPER settlement
- no external broker claim
- no live execution
- no current market valuation

Purpose:

- prove immutable fill identity
- prove one lot origin per BUY
- prove deterministic/revisioned SELL allocations
- prove oversell prevention
- prove overspend/negative-cash prevention
- prove position derivation and KNOWN_ZERO semantics
- prove exact retry/conflict behavior
- prove I2 ledger atomicity/reconciliation
- prove actual investing_app + FORCE RLS mutex locking and financial writes

This candidate does not authorize implementation.

## Corporate Action Capability Sequence Candidate

After paper fill accounting is independently accepted:

1. split / reverse split accounting
2. cash dividend entitlement + I2 ledger application
3. fractional/cash-in-lieu handling with explicit evidence/basis allocation
4. separately designed complex corporate actions

External instrument/corporate-action product ingestion remains blocked until its
trusted domain authority path is accepted.

## Threat Matrix

| case | invariant | expected result |
| --- | --- | --- |
| forged account selector | AuthorizedInvestingContext + persisted authority | FORBIDDEN_OR_NOT_FOUND; zero effect |
| forged instrument id | canonical trusted instrument identity | reject |
| client creates authoritative ticker mapping | domain registry authority | reject |
| ticker reuse | internal instrument_id + versioned identifiers | no aliasing |
| duplicate fill same key/material | transport idempotency | exact replay |
| same key different material | material hash | CONFLICT |
| different keys same source fill | semantic uniqueness | one event only |
| same source ref different fill material | semantic collision | CONFLICT |
| JS float financial decimal | decimal authority | implementation gate fail |
| precision overflow | bounded NUMERIC | VALIDATION_ERROR |
| missing required fee evidence | completeness | UNAVAILABLE/BLOCKED, not zero |
| two concurrent BUYs each see same cash | cash mutex + DB nonnegative check | at most affordable set commits |
| BUY exceeds known cash | no margin | INSUFFICIENT_CASH; zero effect |
| unknown cash treated as zero/available | completeness | BLOCKED/UNAVAILABLE |
| SELL exceeds holdings | long-only | INSUFFICIENT_POSITION; zero effect |
| two concurrent SELLs consume same lot | instrument mutex + DB allocation check | no overconsumption |
| ambiguous same-time competing fills | deterministic order | BLOCKED |
| late earlier event | immutable events/revisions | ACCOUNTING_REBUILD_REQUIRED |
| fill tied to accounting revision identity | event/revision separation | design/implementation fail |
| mutable fill update/delete | append-only | reject |
| mutable lot origin overwrite | immutable origin | reject |
| duplicate lot origin for BUY | one origin per BUY | unique violation/fail |
| duplicate consumption row same revision/fill/lot | allocation semantic uniqueness | reject/replay |
| projection corruption | projection not authority | rebuild |
| zero rows -> zero position | completeness | UNAVAILABLE unless baseline proves zero |
| fill price -> current market value | market truth separation | UNAVAILABLE |
| missing FX | no implicit FX | UNAVAILABLE |
| ledger BUY creates negative cash | no-margin + DB seal/reconcile gate | reject transaction |
| fill commits but ledger fails | atomicity | rollback all new effect |
| ledger trade effect lacks I3 lineage | reconciliation | INTERNAL_ERROR/BLOCKED |
| split ratio through float | rational exactness | reject |
| split fraction silently truncated | explicit fractional policy | BLOCKED |
| guessed cash-in-lieu | provenance | reject |
| dividend uses current instead of historical entitlement | record/ex-date lineage | reject/reconcile fail |
| duplicate corporate action application | application semantic uniqueness | replay/conflict only |
| same corporate action identity changed terms silently | domain semantic hash | CONFLICT/correction required |
| user supplies REAL corporate action | source authority | reject |
| service_role substitutes for system authority | service_role != authorization | reject |
| mutex FOR UPDATE invisible under RLS | actual-role lock gate | implementation blocked |
| broad UPDATE granted only to enable locking | minimum privilege | implementation blocked |
| cross-account lot consumption | composite scope | reject |
| cross-instrument lot consumption | composite scope | reject |
| correction overwrites original | immutable history | reject |
| unsupported merger coerced to split | action integrity | UNSUPPORTED/BLOCKED |
| stale evidence marked FRESH | truth dimensions | reject |

## Required Static / Design Acceptance Tests

Before I3 implementation acceptance, tests must prove/statically enforce:

- Investing/Trading isolation
- no product fill producer is smuggled into I3
- client cannot create authoritative instrument identity
- positions are derived, not sole mutable authority
- fill events are revision-independent and immutable
- exactly one acquisition lot origin per BUY fill
- lot allocations are immutable and revisioned
- allocation semantic uniqueness is DB-backed
- corporate action identity/application semantic uniqueness is DB-backed
- client IDs are not authority
- service_role is not authorization
- decimal strings only for financial decimals
- no canonical JS number/parseFloat arithmetic
- bounded NUMERIC for all decimal persistence
- no silent rounding
- explicit quantity/currency/price scale policies
- fill semantic identity independent from transport idempotency
- same semantic fill different material conflicts
- cash baseline completeness distinguishes KNOWN_ZERO/UNAVAILABLE
- BUY cannot overspend or create negative cash
- concurrent BUYs cannot write-skew around cash
- SELL cannot oversell
- concurrent SELLs cannot overconsume lots
- FIFO_V1 uses deterministic economic ordering
- ambiguous ordering fails closed
- late earlier events create new accounting revision/rebuild requirement
- position quantity reconciles to open lot quantity
- acquisition/open lot basis reconciles to securities book-cost ledger
- fill price cannot satisfy current valuation evidence
- fee evidence is explicit and zero is never assumed
- no implicit FX
- BUY/SELL posting shapes exactly match this design
- no zero ledger postings
- immediate fill+lot+ledger+audit commits atomically
- actual-role mutex row locking is explicitly designed
- split uses exact rational semantics
- fractional handling does not truncate
- cash-in-lieu requires explicit evidence and accepted basis treatment
- dividend entitlement uses historical position boundary
- corrections leave original events unchanged
- cross-account/instrument references are DB-enforced
- account-scoped tables FORCE RLS
- PUBLIC/anon/authenticated/service_role have no normal financial writes
- investing_app gets minimum privileges
- no direct browser financial authority

## Required Real PostgreSQL Implementation Gate

Static SQL review is insufficient.

A future authorized NON-PRODUCTION rehearsal on target PostgreSQL major version
must use actual investing_app + FORCE RLS and prove at minimum:

- migration pre/postconditions
- exact table/function owners
- exact grants/policies
- actual runtime SELECT/INSERT/lock behavior
- actual SELECT ... FOR UPDATE on each mutex scope
- actual UPDATE of mutex semantic identity denied
- cross-tenant/account/instrument denial
- immutable fill/lot/action rows
- same-key replay/conflict
- different-key same-fill semantic arbitration
- concurrent duplicate fill arbitration
- concurrent BUY cash contention
- insufficient cash zero residue
- no negative cash after concurrent writers
- concurrent SELL lot contention
- oversell zero residue
- no overconsumed lot after concurrent writers
- fill/lot/ledger/audit atomic rollback on injected ledger failure
- BUY posting shape/basis reconciliation
- SELL gain/loss/fee posting shape reconciliation
- position/open-lot reconciliation
- securities-book-cost/open-basis reconciliation
- split exactness/fractional edge cases
- dividend entitlement edge cases
- correction/reversal behavior
- no new failures versus exact accepted baseline

Two-session tests require real independent sessions.

## Performance Contract

Performance never weakens correctness.

Index-supported paths required for:

- account/instrument fill history
- source/source_reference fill semantic lookup
- BUY fill -> lot origin
- revision/disposal fill -> lot allocations
- open lot derivation
- corporate action -> account application
- account/instrument/as-of inputs
- I3 -> ledger_transaction lineage
- mutex scope lookup
- deterministic history pagination

Forbidden:

- repository-wide scan for one account position
- N+1 lot allocation queries
- global serialization across unrelated accounts
- cache as authority

Real DB gate includes EXPLAIN/plan and contention measurement.

## I4+ Boundary

Deferred:

- plan revisions (I4)
- Research Lab lineage/reproducibility (I5)
- quant/decision science (I6)
- paper execution/order lifecycle (I7)
- daily operating cycle (I8)
- product API (I9)
- integration/readiness gates (I10+)

I3 provides trustworthy accounting primitives without letting later UX become
financial authority.

## I3 Design Freeze Gate

Freeze requires independent audit confirming:

- exact parent SHA
- I0/I1/I2 invariants preserved
- no Trading coupling
- event truth separated from accounting revisions
- positions remain derived
- fill/lot/action semantic identities are deterministic
- FIFO methodology is deterministic/versioned
- KNOWN_ZERO vs UNAVAILABLE preserved
- no-margin/negative-cash prevention is designed under concurrency
- oversell/lot contention is designed under concurrency
- actual-role row locking is a mandatory rehearsal gate
- exact V1 BUY/SELL cash ledger economics are frozen
- I2 cash remains sole cash authority
- corporate action/instrument domain authority dependencies explicit
- correction/rebuild preserves history
- implementation tests cover material financial races

Until an independent audit freezes a specific commit/blob:

```text
I3_DESIGN = CANDIDATE
I3_IMPLEMENTATION = NOT_AUTHORIZED
I3_SCHEMA = NOT_AUTHORIZED
I3_SUPABASE = NOT_AUTHORIZED
I3_PRODUCTION = NOT_AUTHORIZED
```
