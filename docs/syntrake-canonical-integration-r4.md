# Syntrake Canonical Integration R4

R4 defines a read-only Accounting Truth and Performance Read contract for Investing customer surfaces. It does not add persistence, does not create migrations, and does not change production database state.

## Accounting Truth

Deposits and withdrawals are external cash flows. They may appear as immutable account movements, but they are not investment return and must not be used to create positive or negative performance.

Cash balance truth comes from canonical cash balance rows. An explicit zero balance row is REAL. A missing cash row is UNAVAILABLE. Movements must not reconstruct a customer-visible REAL balance.

Movement responses are sanitized. They expose only movement type, amount, currency, occurrence time, environment, and immutable provenance. Raw metadata, correlation identifiers, and provider payloads are not part of the customer DTO.

## Performance Truth

Customer-visible portfolio valuation is currency-safe. A quote may contribute to a field named `valueEur` or `totalEur` only when the quote currency is explicitly present, valid, and equal to EUR/account valuation currency. R4 does not default missing quote currency to EUR and does not relabel foreign-currency prices as EUR.

Unavailable EUR values are represented as `null`, never synthetic zero. If any material active holding lacks a provable EUR valuation, `portfolio.totalEur` and `portfolio.valuation.totalEur` are `null`; canonical cash remains independently available through `portfolio.cash.amountEur`.

Customer-visible portfolio weights derived from `totalEur` are also nullable. Unknown holding weight or current allocation weight is displayed as unavailable, never `0%`.

Cost-basis fallback cannot create unrealized P&L. If a holding does not have usable current market evidence, the unrealized P&L component is UNAVAILABLE. It must not be displayed as EUR 0, 0%, or no gain/loss.

Unrealized P&L requires every active positive-quantity holding included in the portfolio to have:

- finite positive quantity;
- finite cost basis;
- current valuation from a market quote;
- valuation source `market_quote`;
- market evidence that is not UNAVAILABLE;
- proven currency compatibility with the account base currency.

If one material active holding lacks this evidence, portfolio unrealized P&L is UNAVAILABLE. R4 does not calculate a partial portfolio P&L and present it as total unrealized P&L.

No implicit FX is allowed. A USD quote, fee, dividend, or tax row cannot be relabelled EUR because the account base currency is EUR. If currencies are missing, mixed, or not equal to the account base currency, and no accepted canonical FX lineage exists, the component is UNAVAILABLE.

Incomplete history cannot produce complete performance totals. Presentation pagination must not affect financial totals. Bounded reads cannot certify complete fee, dividend, tax, corporate-action, reconciliation, or ledger history. R4 therefore keeps total return, TWR, MWR, and historical aggregate components unavailable unless completeness is explicitly proven by a later contract.

Position P&L is not total portfolio performance. A limited unrealized P&L component may be shown only as limited current-holdings information. It must not be labelled as total performance.

TWR and MWR remain unavailable without complete valuation and cash-flow series.

## Scope Limits

Paper is not LIVE. R4 preserves environment-aware account scope and does not imply live execution readiness.

R4 does not certify suitability, expected return, Goal Probability, Monte Carlo output, or any investment recommendation methodology.

R4 does not reactivate customer decision authority. The R3 canonical plan gate remains authoritative: portfolio and accounting truth may be available while customer decision guidance remains UNAVAILABLE.
