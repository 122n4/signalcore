# Investing Genesis I3 Accounting Design

PARENT_SHA =
af5feb8f4e62659adad0784b4dcab2c6eb6698b9

I2_FROZEN_SHA =
af5feb8f4e62659adad0784b4dcab2c6eb6698b9

STATUS = DESIGN_CANDIDATE

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
- immutable fills
- deterministic accounting lots
- derived positions
- fill-to-lot allocation
- realized accounting results where evidence is complete
- corporate actions that affect quantity, cost basis, or cash
- immutable corrections/reversals
- reconciliation between position accounting and the I2 ledger

I3 must make it possible to reconstruct why an account holds a quantity, which
fills created it, which lots remain open, which events consumed or transformed
those lots, and which cash ledger events correspond to those economic events.

I3 does not create a mutable portfolio balance as financial authority.

POSITION_IS_DERIVED = TRUE

LOT_HISTORY_IS_APPEND_ONLY = TRUE

FILL_IS_IMMUTABLE = TRUE

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
- lot creation and lot-consumption model
- long-position accounting
- deterministic lot matching
- position derivation and completeness semantics
- fill correction / bust / reversal design
- accounting cost basis
- realized result derivation when evidence is sufficient
- corporate-action source and account-application design
- split / reverse split accounting
- cash dividend accounting
- cash-in-lieu contract
- I2 ledger integration and reconciliation
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
- wash-sale or equivalent tax-jurisdiction rules
- short selling
- margin
- options/futures/derivatives accounting
- securities lending
- multi-leg instruments
- arbitrary merger/spinoff/tender/rights workflows in the first implementation
- implicit FX conversion

I3 may preserve an optional external/order reference on a fill for lineage.
It does not make order state canonical. Canonical paper order lifecycle belongs
to I7.

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

I3 distinguishes four different concepts:

1. EVENT TRUTH
   - immutable fill or corporate-action application events
2. LOT ACCOUNTING
   - immutable lot creation, consumption, and transformation lineage
3. POSITION PROJECTION
   - a deterministic derivation from canonical event and lot evidence
4. CASH TRUTH
   - derived from the I2 ledger, never from a position cache

A position row or cache, if a later implementation materializes one for
performance, is a rebuildable projection only.

A cached projection MUST NOT be the only evidence for:

- quantity
- cost basis
- realized result
- cash
- dividends
- fees

Any materialized position projection must carry enough lineage to prove the
canonical event watermark/revision from which it was derived.

Deleting or corrupting a projection must not destroy canonical accounting
history.

## Completeness And Zero Semantics

Missing holdings evidence is not zero.

A quantity may be reported as KNOWN_ZERO only when canonical evidence proves a
complete accounting baseline for the account and the deterministic event stream
through the requested as-of boundary derives exactly zero.

For Genesis paper accounts, a future explicit immutable accounting-genesis
anchor may establish:

```text
source = PAPER_ACCOUNT_GENESIS
value_origin = SIMULATED
freshness = NOT_APPLICABLE
context = DEMO
```

Such an anchor means only that the canonical Syntrake paper accounting book
starts from zero holdings. It does not claim that a real broker or external user
owns no securities.

Without a complete baseline or complete event stream:

```text
POSITION_QUANTITY = UNAVAILABLE
COST_BASIS = UNAVAILABLE
REALIZED_RESULT = UNAVAILABLE when dependent evidence is missing
```

Zero rows, a failed query, an absent cache, or an unknown instrument are never
sufficient evidence of zero.

## Instrument Identity

Symbol/ticker is not durable identity.

Canonical I3 instrument identity requires an internal immutable instrument_id.

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
- venue/exchange context must be explicit when required to disambiguate.
- client-provided ticker text never proves canonical instrument identity.
- every fill and corporate-action application references instrument_id.
- external identifiers are evidence mappings, not the account ownership key.
- identifier history is not silently overwritten.

First I3 implementation may restrict supported asset classes to a narrow paper
universe. Unsupported asset classes are VALIDATION_ERROR or UNAVAILABLE, never
silently coerced.

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
- accounting_revision_id

Rules:

- fills are INSERT-only canonical events.
- runtime cannot UPDATE or DELETE a committed fill.
- BUY/SELL direction is explicit; quantity and monetary fields are non-negative
  decimal magnitudes with direction carried by semantics.
- quantity must be strictly positive.
- unit_price must be strictly positive for ordinary BUY/SELL fills.
- source_reference is required whenever the source has a stable external event
  identifier.
- gross_consideration must be deterministically derivable or independently
  verifiable from quantity, unit_price, and the accepted rounding contract.
- no caller may mark a simulated fill as REAL.
- a paper/test fill must remain SIMULATED + NOT_APPLICABLE freshness + DEMO.

A canonical fill does not by itself prove current market price.

## Fill Semantic Identity And Idempotency

Transport idempotency and economic identity are distinct.

TRANSPORT_IDEMPOTENCY:

- idempotency_key
- material_request_hash
- actor/scope

ECONOMIC_FILL_IDENTITY:

For an external source with a stable event id:

```text
account_id
source
source_reference
event_kind = FILL
```

For a future internally generated paper execution, identity must bind to the
canonical I7 execution/fill identity rather than a client-generated arbitrary
reference.

Same semantic identity + same canonical material:

```text
REPLAY existing fill/accounting result
NO duplicate lot effect
NO duplicate position effect
NO duplicate ledger effect
```

Same semantic identity + different canonical material:

```text
CONFLICT
NO new financial effect
```

The material hash must include every field that changes accounting meaning,
including at minimum:

- canonical account_id
- instrument_id
- side
- canonical quantity
- canonical unit_price
- settlement currency
- gross consideration
- fee amount/currency
- effective_at when source-controlled
- settlement_at when material
- source and source_reference
- value_origin/freshness/context
- material corporate/execution references

correlation_id and transport idempotency_key are not economic material.

## Decimal And Precision Contract

JavaScript number is forbidden as financial authority.

Application boundary for quantity, price, money, and rate:

```text
decimal string
```

Persistence:

```text
bounded PostgreSQL NUMERIC(p,s)
```

I3 implementation MUST NOT use unconstrained NUMERIC for attacker- or
source-controlled decimal authority.

Exact p/s values for quantity, unit price, rate, and derived monetary fields
must be frozen in the implementation schema only after the supported instrument
universe and source precision are audited.

The implementation gate must prove:

- bounded precision and scale for each semantic decimal field
- no exponent notation
- no NaN/Infinity
- no locale separators
- no implicit rounding
- explicit instrument quantity-scale policy
- explicit currency money-scale policy
- explicit price tick/scale policy where applicable
- deterministic multiplication/division rounding rules
- overflow fails closed

I2 cash postings remain constrained by the accepted I2 money contract. I3 may
not weaken I2 NUMERIC(24,8) cash authority by passing values that require silent
rounding.

If an I3 calculation cannot be represented exactly under the required target
scale, the event must either follow an explicitly accepted rounding rule with
recorded methodology/version or fail closed.

## Currency Contract

Currency is explicit.

A fill has a settlement currency. Fee currency is explicit independently.

Initial I3 implementation should require fee_currency_code to equal the fill
settlement currency unless an explicit FX evidence contract is implemented.

No implicit conversion is permitted for:

- cost basis
- fees
- realized result
- dividends
- cash-in-lieu
- portfolio totals

If cross-currency evidence is required and unavailable:

```text
VALUE = UNAVAILABLE
```

not zero and not guessed FX.

## Time Contract

I3 differentiates:

- effective_at: when the economic fill/action takes effect
- settlement_at: when cash settlement occurs, when applicable
- record_date: entitlement date for actions such as dividends
- ex_date: market corporate-action date when applicable
- payable_at/payment_date: cash payment date when applicable
- observed_at: when external evidence was observed
- retrieved_at: when it was fetched
- recorded_at: when Syntrake canonically recorded the event
- as_of: projection boundary

recorded_at never substitutes for missing economic time.

A late-arriving event with an earlier effective_at must not silently rewrite
previous canonical lot allocations.

## Accounting Order And Late Events

Lot allocation needs deterministic economic ordering.

Arrival order is not sufficient economic authority.

Canonical ordering must use source/economic evidence such as:

```text
effective_at
source sequence / execution sequence when available
stable source_reference tie-breaker
```

If two events that compete for lot allocation cannot be deterministically
ordered from canonical evidence, accounting must FAIL CLOSED rather than choose
an arbitrary ingestion order.

A late event that belongs before already-accounted dependent events creates:

```text
ACCOUNTING_REBUILD_REQUIRED
```

It must not mutate old lot history in place.

A future implementation may create a new immutable accounting revision that
replays canonical events deterministically and supersedes the prior projection.
Prior revision lineage remains auditable.

## Lot Model

A lot represents a canonical acquisition basis unit for long-position
accounting.

A lot is not a mutable remaining-quantity row as sole authority.

Conceptual lot creation fields:

- lot_id
- tenant_id
- account_id
- instrument_id
- acquisition_fill_id
- acquired_quantity
- acquisition_unit_price
- acquisition_gross_cost
- acquisition_fee_allocated
- settlement_currency_code
- effective_at
- recorded_at
- lineage_id
- accounting_revision_id

Remaining lot quantity is derived from immutable lot-consumption and corporate-
action transformation events.

Conceptual LotConsumption fields:

- lot_consumption_id
- lot_id
- disposal_fill_id
- consumed_quantity
- allocated_cost_basis
- proceeds_allocation
- fee_allocation when applicable
- realized_result when fully supported by evidence
- effective_at
- recorded_at
- lineage_id
- accounting_revision_id

Rules:

- BUY creates acquisition quantity.
- SELL consumes open acquisition lots.
- consumption cannot exceed available quantity in the same canonical revision.
- no cross-account or cross-instrument lot consumption.
- lot creation/consumption rows are immutable.
- a lot may be fully consumed; zero remaining quantity is derived.
- lot history survives correction/rebuild lineage.

## Initial Lot Matching Method

Initial paper accounting method candidate:

```text
LOT_MATCHING_METHOD = FIFO_V1
```

This is an accounting methodology for Syntrake paper simulation. It is not tax
advice and does not claim jurisdiction-specific tax compliance.

FIFO_V1 ordering uses the accepted deterministic economic ordering contract,
not whichever database row arrived first.

The matching methodology and version must be stored in lineage so a later
methodology change cannot silently reinterpret historical realized results.

Future user-selected or jurisdiction-specific tax methods require a separate
accepted design.

## Long-Only Invariant

First I3 implementation is LONG_ONLY.

A SELL that exceeds deterministic open quantity for the instrument/account at
the relevant accounting boundary must fail atomically:

```text
INSUFFICIENT_POSITION
NO fill accounting commit
NO lot consumption
NO ledger effect
```

Short positions, borrowing, margin, and negative inventory are deferred.

## Position Derivation

Canonical position quantity for an account/instrument/as-of is derived from:

- complete baseline/genesis evidence
- canonical BUY/SELL fills
- accepted fill reversals/corrections
- split/reverse-split quantity transformations
- other explicitly supported quantity-changing corporate actions

A position projection may expose:

- account_id
- instrument_id
- quantity
- open lot count
- cost basis by explicit currency
- accounting methodology/version
- as_of
- accounting_revision_id
- truth dimensions
- lineage/evidence references

The projection must not invent:

- current price
- market value
- unrealized PnL
- return
- probability

Without current market evidence, valuation fields are UNAVAILABLE.

## Cost Basis Contract

Cost basis is accounting evidence, not market value.

For the initial paper BUY method, acquisition basis may include purchase gross
consideration plus explicitly designated acquisition fees under a frozen
methodology version.

The chosen fee treatment must be explicit and testable; implementation must not
change it implicitly.

Cost basis must preserve currency.

For SELL, lot-consumption allocations must preserve the exact basis consumed.

Realized accounting result can be derived only when all required proceeds,
basis, fee, currency, and lot-allocation evidence is complete.

If material evidence is missing:

```text
REALIZED_RESULT = UNAVAILABLE
```

For paper events, any realized result remains SIMULATED. It is not realized
broker performance.

## I2 Ledger Integration

I3 does not create a second cash balance.

Every I3 event that has a cash effect must reference a canonical I2 ledger
transaction or an explicitly pending settlement state whose later cash event is
canonically linked.

Initial implementation candidate uses:

```text
SETTLEMENT_MODEL = IMMEDIATE_PAPER
```

for supported paper fills. This avoids pretending to model external broker
settlement before such a contract exists.

I3 may extend the I2 ledger chart only with economically meaningful account
types required by accepted I3 accounting. Candidate concepts include:

- SECURITIES_BOOK_COST_ASSET
- TRADING_FEE_EXPENSE
- REALIZED_GAIN_LOSS
- DIVIDEND_INCOME

Names and exact posting shapes are not runtime authority until the I3 schema
implementation is separately accepted and rehearsed.

A fake permanent clearing account whose only purpose is to balance arithmetic is
forbidden.

If future non-immediate settlement is introduced, receivable/payable or clearing
accounts must represent genuine unsettled economic obligations and must reconcile
to later settlement events.

Required reconciliation principle:

```text
I3 accounting cash effects
        <->
canonical I2 ledger transaction lineage
```

A fill may not report successful cash impact if the corresponding ledger effect
failed to commit.

For an immediate-settlement capability, fill accounting, lot effects, success
audit, and required ledger transaction(s) should commit atomically in one
material database transaction or fail with zero canonical effect.

## Fees

Fees are explicit evidence.

Do not hide fees inside a derived price without retaining the original fee
amount and currency.

Initial implementation candidate:

- fee amount >= 0
- same currency as settlement currency
- acquisition fee treatment frozen by methodology
- disposal fee treatment explicit in realized-result methodology

Missing fee evidence for a source that requires it means affected cost/result
truth is UNAVAILABLE or the event is BLOCKED, never assumed zero.

A genuine explicit fee of exactly zero is allowed only when canonical evidence
states zero.

## Corporate Action Model

Corporate actions have two layers:

1. DOMAIN ACTION EVIDENCE
   - source-level action identity and terms
2. ACCOUNT ACTION APPLICATION
   - immutable application to a specific account's eligible position/lots

These layers must not be conflated.

Conceptual domain action fields:

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
- terms
- observed_at
- retrieved_at
- recorded_at
- value_origin
- freshness
- lineage_id
- correction_of_corporate_action_id when applicable

Conceptual account application fields:

- corporate_action_application_id
- corporate_action_id
- tenant_id
- account_id
- instrument_id
- eligibility_as_of
- affected_quantity
- accounting_revision_id
- correlation_id
- actor_kind
- actor_id
- lineage_id
- resulting ledger_transaction_id when cash-affecting

Both are immutable canonical records.

## Corporate Action Authority Dependency

External corporate-action ingestion is not user financial authority.

A future trusted ingestion path requires an explicitly accepted SYSTEM_ACTOR or
other Constitution-compliant domain authority.

service_role, a database login, a cron process name, or client input does not
become SYSTEM_ACTOR automatically.

Until trusted SYSTEM_ACTOR/domain ingestion is accepted:

```text
EXTERNAL_CORPORATE_ACTION_INGESTION = BLOCKED
```

Designing the schema does not waive this authority dependency.

## Split And Reverse Split

First corporate-action quantity capability candidate:

- SPLIT
- REVERSE_SPLIT

Ratios should use exact rational semantics where the source expresses them as
N-for-D:

```text
ratio_numerator > 0
ratio_denominator > 0
```

Do not convert a rational split ratio through floating point.

For each affected open lot:

- total pre-action basis is preserved unless the action terms explicitly require
  another accepted treatment
- quantity transforms deterministically by the exact ratio
- per-unit basis is a derived result
- original lot/event history remains unchanged
- transformation lineage is immutable

If the resulting quantity exceeds supported scale or requires unsupported
fractional-share handling, do not round silently.

## Fractional Shares And Cash-In-Lieu

Fractional eligibility is an instrument/account capability, not an assumption.

If a corporate action yields a fractional remainder:

- retain the exact fractional quantity if the accepted account/instrument policy
  supports it; or
- require a canonical cash-in-lieu event with actual/simulated amount and
  provenance under an accepted methodology.

Never invent cash-in-lieu from a guessed price.

If the account cannot hold the fractional quantity and no cash-in-lieu evidence
exists:

```text
CORPORATE_ACTION_APPLICATION = BLOCKED or UNAVAILABLE
```

not silent truncation.

## Cash Dividends

Cash dividend accounting requires complete evidence for:

- canonical corporate action
- entitlement/record-date rule
- eligible account position as of the required boundary
- amount/rate and currency
- payment/effective date
- provenance

Entitlement must be derived from canonical position history, not current mutable
quantity.

A cash dividend that is successfully applied must produce a canonically linked
I2 ledger cash event.

Missing entitlement evidence, missing amount, or missing currency is
UNAVAILABLE/BLOCKED, never zero dividend.

For paper simulation, dividend truth remains SIMULATED unless later external
source evidence and account context justify another classification.

## Deferred Corporate Actions

The initial implementation may defer complex actions such as:

- merger
- spinoff
- rights issue
- tender
- return of capital
- mandatory conversion
- symbol-only/reference changes with no economic effect

A deferred action encountered by a source must fail closed as UNSUPPORTED rather
than be coerced into SPLIT or DIVIDEND semantics.

## Corrections, Busts, And Reversals

Committed fills and corporate-action applications are never rewritten.

Correction model:

- immutable reversal/bust event linked to the original
- optional corrected replacement event
- original remains queryable
- lot effects are reversed through immutable accounting events/revision lineage
- cash effects are reversed/corrected through canonical I2 ledger reversal or
  correction semantics
- dependent projections are rebuilt/revised, not edited as authority

A correction that cannot deterministically restore accounting and ledger
consistency must fail closed and require explicit reconciliation.

Double reversal, reversal loops, and ambiguous correction chains are prohibited
unless a future accepted contract defines them.

## Realized And Unrealized Results

REALIZED ACCOUNTING RESULT:

May be derived from canonical sale proceeds, consumed lot basis, fee treatment,
currency, and methodology when all evidence is complete.

UNREALIZED PNL / MARKET VALUE:

Not canonical in I3 without current market-data evidence and an accepted
valuation methodology.

Therefore I3 must return UNAVAILABLE rather than manufacturing current market
value or unrealized PnL from fill price.

Fill price is historical execution evidence, not current market truth.

## Financial Truth Dimensions

I3 preserves I0 dimensions:

- VALUE_ORIGIN: REAL | ESTIMATED | SIMULATED | UNAVAILABLE
- FRESHNESS: FRESH | STALE | UNKNOWN | NOT_APPLICABLE
- CONTEXT: PRODUCTION | DEMO

Every material external evidence object must be able to carry source lineage and
relevant time fields.

A derived position/result must not claim stronger truth than its weakest
material dependency supports.

Examples:

- SIMULATED fill + DEMO account -> position/result remains SIMULATED + DEMO
- missing FX required for base-currency result -> UNAVAILABLE
- stale external action evidence must not be labeled FRESH

No truth label may be client-controlled authority.

## Authority Model

Every account-scoped material I3 mutation requires server-created
AuthorizedInvestingContext or a future explicitly accepted SYSTEM_ACTOR path.

USER_PRINCIPAL flow must revalidate inside the material transaction:

- Principal ACTIVE
- Tenant ACTIVE
- TenantMembership ACTIVE
- AccountAccess ACTIVE
- InvestingAccount state permits the operation
- operation/capability
- account/instrument scope
- idempotency state

client userId/tenantId/accountId are selectors at most, never ownership proof.

service_role is capability, never authorization.

Corporate-action domain ingestion and account application must use authority
appropriate to their actual scope; a DOMAIN_SCOPE source event must not fabricate
tenant/account, while an ACCOUNT_SCOPE application requires canonical tenant and
account.

## Account State

ACTIVE:

- may accept permitted I3 material events after revalidation

FROZEN / CLOSED:

- no new ordinary fills
- historical reads may remain available under future read policy
- corrections, externally mandatory corporate actions, and reconciliation need
  explicit operation-specific policy; they are not automatically allowed

No idempotency replay may create new economic effect after authority is revoked.
Current read-disclosure policy still governs replay disclosure.

## RLS And Privilege Model

Future I3 account-scoped tables must:

- live in investing schema
- be owned by investing_owner
- ENABLE RLS
- FORCE RLS
- deny PUBLIC
- deny anon
- deny authenticated browser access
- deny service_role as normal application access
- grant investing_app only minimum runtime privileges
- expose no direct browser financial API

Policies must bind persisted canonical relationships and current trusted
transaction context. GUCs alone are not ownership proof.

Append-only event tables must not grant runtime UPDATE/DELETE unless an exact
non-economic lifecycle column capability is separately proven necessary.

No casual SECURITY DEFINER bypass is allowed.

## Concurrency Model

Baseline:

- READ COMMITTED unless a future implementation proves a stronger isolation
  level is necessary
- one acquired DB client per material transaction
- account-scoped locks only where required
- no session advisory lock as sole correctness mechanism
- no split pool.query pseudo-transaction
- no session SET authority

Required concurrency guarantees:

- duplicate same-source fill cannot double-apply
- different idempotency keys for same semantic fill cannot double-apply
- two concurrent SELLs cannot consume the same remaining lot quantity
- concurrent BUY/SELL ordering must be deterministic or one path must block/fail
  closed when economic ordering is ambiguous
- corporate action and competing fill around an effective boundary cannot
  produce two incompatible canonical position states
- unrelated InvestingAccounts must not serialize globally
- failed loser paths leave no orphan lot, fill, projection, audit, or ledger
  effect

## Reconciliation Contract

I3 must support deterministic reconciliation at least across:

```text
fills
  -> lot creations/consumptions
  -> derived position quantity
  -> open lot quantity total
```

Required quantity invariant per account/instrument/revision:

```text
DERIVED_POSITION_QUANTITY
=
SUM(OPEN_LOT_QUANTITY)
```

subject to explicitly supported non-lot quantity events such as corporate-action
transformations being incorporated into the same canonical lot lineage.

Cash-affecting events must also reconcile:

```text
fill/dividend/cash-in-lieu lineage
  -> expected economic cash effect
  -> canonical I2 ledger transaction
  -> derived I2 cash balance
```

Reconciliation mismatch is INTERNAL_ERROR / BLOCKED, not a value to hide.

## Audit And Lineage

Financial Ledger != I3 Accounting Events != Operational Audit != Decision
Lineage != User-Facing History.

For any material position change it must be possible to answer:

- what event changed quantity?
- when was it economically effective?
- which source/reference caused it?
- which actor/process applied it?
- which tenant/account/instrument?
- which lot(s) were created/consumed/transformed?
- which methodology/version was used?
- which correction/reversal superseded prior interpretation?
- which I2 ledger event carries the cash effect, if any?
- which truth dimensions and evidence support the result?

Audit must never contain secrets or tokens.

## Initial I3 Capability Candidate

First implementation candidate:

```text
I3_PAPER_FILL_ACCOUNTING_V1
```

Constraints:

- canonical bootstrapped InvestingAccount
- DEMO / paper context
- LONG_ONLY
- supported simple cash security instrument
- BUY and SELL fills only
- decimal-string quantity and price
- one settlement currency
- fee currency equals settlement currency
- FIFO_V1 lot matching
- immediate paper settlement
- no external broker claim
- no public API required
- no live execution
- no market valuation

Purpose:

- prove immutable fill identity
- prove deterministic lot creation/consumption
- prove oversell prevention
- prove position derivation
- prove exact retry/conflict behavior
- prove I2 cash reconciliation
- prove append-only correction lineage
- prove actual investing_app + FORCE RLS behavior on real PostgreSQL before
  acceptance

This candidate does not authorize implementation.

## Corporate Action Capability Sequence Candidate

After paper fill accounting is independently accepted:

1. split / reverse split accounting
2. cash dividend entitlement + I2 ledger application
3. fractional/cash-in-lieu handling with explicit evidence
4. only then consider more complex actions through separate accepted design

External corporate-action ingestion remains blocked until its trusted authority
path is accepted.

## Threat Matrix

| case | invariant | expected result |
| --- | --- | --- |
| forged account selector | persisted authority + AuthorizedInvestingContext | FORBIDDEN_OR_NOT_FOUND; no disclosure/effect |
| forged instrument id | canonical supported instrument mapping | reject; no fill/lot/ledger effect |
| ticker reuse | internal instrument_id, versioned identifiers | no aliasing to wrong instrument |
| duplicate fill same key/material | transport idempotency | replay same canonical result |
| same key different material | material hash | CONFLICT; original unchanged |
| different keys same source fill | economic semantic uniqueness | one canonical event only |
| same source reference different material | semantic collision + material comparison | CONFLICT |
| JS float quantity/price | decimal authority | implementation gate fail |
| excess quantity/price precision | bounded NUMERIC + scale policy | VALIDATION_ERROR |
| BUY missing fee evidence where source requires it | evidence completeness | UNAVAILABLE/BLOCKED, not zero fee |
| SELL exceeds holdings | LONG_ONLY | INSUFFICIENT_POSITION; zero effect |
| concurrent SELL consumes same lot | row/semantic serialization | one valid allocation; loser fails/recomputes safely |
| ambiguous same-time fills | deterministic economic order required | BLOCKED, never arrival-order guess |
| late earlier fill | immutable prior accounting | ACCOUNTING_REBUILD_REQUIRED |
| mutable fill update | append-only | reject |
| mutable lot quantity | derived remaining quantity | reject authority model |
| projection corrupted | projection not authority | rebuild from canonical events |
| zero rows interpreted as zero position | completeness rule | UNAVAILABLE unless baseline proves zero |
| fill price used as current price | market truth separation | valuation UNAVAILABLE |
| missing FX | no implicit conversion | UNAVAILABLE |
| split via float ratio | exact rational split | reject implementation |
| split fractional remainder silently truncated | no implicit rounding | BLOCKED or explicit cash-in-lieu path |
| guessed cash-in-lieu price | provenance required | reject |
| dividend based on current position instead of record date | entitlement history | reject/reconcile failure |
| duplicate corporate action application | semantic uniqueness | replay/conflict; no duplicate cash/quantity |
| user supplies REAL corporate action | provenance authority | reject |
| service_role applies financial event without system/user authority | service_role != authorization | reject |
| fill commits but ledger cash effect fails | atomicity/reconciliation | rollback immediate-settlement material transaction |
| ledger cash effect exists without matching fill lineage | reconciliation | INTERNAL_ERROR/BLOCKED |
| cross-account lot consumption | composite scope constraints | reject |
| cross-instrument lot consumption | instrument tuple constraint | reject |
| correction overwrites original fill | immutable history | reject |
| reversal cannot restore lot/ledger consistency | reconciliation | fail closed |
| unsupported merger coerced to split | action type integrity | UNSUPPORTED/BLOCKED |
| stale source marked fresh | truth dimensions | reject classification |

## Required Static / Design Acceptance Tests

Before any I3 implementation is accepted, tests must prove or statically enforce:

- Investing/Trading isolation remains intact
- no mutable position row is sole authority
- no mutable remaining-lot quantity is sole authority
- fills are immutable
- lot creation/consumption history is immutable
- corporate-action applications are immutable
- client IDs are not authority
- service_role is not authorization
- decimal strings are required for financial decimals
- no JavaScript number/parseFloat arithmetic is canonical
- bounded PostgreSQL NUMERIC is used for all decimal persistence
- no silent rounding
- quantity/currency/price scale policies are explicit
- fill semantic identity is independent from transport idempotency
- duplicate source fill cannot double-apply under different keys
- same semantic identity + different material conflicts
- BUY creates deterministic lot evidence
- SELL consumes deterministic open lots
- oversell fails atomically
- FIFO_V1 is deterministic from economic/source ordering
- ambiguous order fails closed
- late earlier events do not rewrite prior canonical history
- position quantity reconciles with open lot quantity
- known zero requires completeness evidence
- missing evidence remains UNAVAILABLE
- fill price cannot satisfy current valuation evidence
- fees are explicit and not silently defaulted
- no implicit FX
- I3 cash effects reference canonical I2 ledger transactions
- immediate paper fill + lot + audit + ledger effects commit atomically
- split ratio uses exact non-floating semantics
- fractional-share handling does not truncate silently
- cash-in-lieu requires explicit evidence
- dividend entitlement derives from historical position at the required boundary
- correction/reversal leaves original events unchanged
- cross-account and cross-instrument references are DB-enforced
- RLS is ENABLED + FORCED on account-scoped I3 tables
- PUBLIC/anon/authenticated/service_role have no normal financial write access
- investing_app receives minimum privileges only
- no browser Data API financial authority is introduced
- performance optimization cannot weaken financial invariants

## Required Real PostgreSQL Implementation Gate

A future implementation is not accepted from static SQL review alone.

It must be rehearsed on authorized NON-PRODUCTION PostgreSQL matching the target
major version, under the actual investing_app role and FORCE RLS, proving at
minimum:

- migration pre/postconditions
- exact grants/policies
- actual runtime insert/select/lock behavior
- cross-tenant/account denial
- immutable fill/lot/action rows
- same-key exact replay
- same-key conflict
- different-key same-fill semantic arbitration
- concurrent duplicate fill arbitration
- concurrent SELL lot contention
- oversell denial with zero residue
- immediate-settlement atomic rollback if ledger leg fails
- fill/lot/position/I2 ledger reconciliation
- split exactness and fractional edge cases
- dividend record-date entitlement edge cases
- correction/reversal behavior
- no new failures versus the exact accepted baseline

Two-session concurrency tests must use real independent PostgreSQL sessions, not
serial statements labeled as concurrency.

## Performance Contract

Performance must never weaken correctness.

Implementation must provide index-supported paths for:

- account + instrument fill history
- source/source_reference semantic lookup
- open-lot derivation/allocation
- disposal fill -> lot consumptions
- acquisition fill -> lot
- corporate action -> account applications
- account/instrument/as-of projection inputs
- reconciliation to ledger_transaction_id
- deterministic pagination/history

Forbidden:

- repository-wide scans for one account position
- N+1 lot queries when allocating a single fill
- global serialization across unrelated accounts
- arbitrary cache as authority

EXPLAIN/plan inspection and contention measurement belong to the real DB gate.

## I4+ Boundary

Deferred beyond I3:

- immutable plan/user-intent revisions (I4)
- Research Lab lineage/reproducibility (I5)
- quant/decision science (I6)
- paper execution/order lifecycle (I7)
- daily operating cycle (I8)
- product API (I9)
- end-to-end integration/readiness gates (I10+)

I3 must provide trustworthy accounting primitives to those later slices without
letting later product UX become financial authority.

## I3 Design Freeze Gate

This document may be frozen only after independent audit confirms:

- parent SHA is exact
- I0/I1/I2 invariants are preserved
- no Trading coupling
- positions remain derived
- lot methodology is deterministic and versioned
- fill/event semantic identity is safe under retry/concurrency
- zero/unavailable semantics are preserved
- cash effects reconcile to I2
- corporate-action authority dependency is explicit
- corrections preserve history
- implementation acceptance tests are sufficient to catch material races and
  financial-integrity failures

Until then:

```text
I3_DESIGN = CANDIDATE
I3_IMPLEMENTATION = NOT_AUTHORIZED
I3_SCHEMA = NOT_AUTHORIZED
I3_SUPABASE = NOT_AUTHORIZED
I3_PRODUCTION = NOT_AUTHORIZED
```
