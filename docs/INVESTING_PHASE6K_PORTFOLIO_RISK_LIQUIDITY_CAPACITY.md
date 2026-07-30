# Investing Research Phase 6K

Phase 6K produces one immutable, tenant-scoped
`PortfolioRiskCapacityAssessment` from one or more validated Phase 6J decisions.
It covers allocation, gross/net exposure, drawdown, turnover, transaction
costs, observed liquidity, estimated capacity, concentration and correlation.

The public request contains only a decision reference and audit metadata.
The server boundary reconstructs identity scope, loads the immutable decision,
resolves a versioned policy profile and derives evidence from the verified
Phase 6I backtest artifact and exact research-ready dataset. Callers cannot
supply weights, limits, liquidity, capacity or risk observations.

The versioned `equal_weight` policy constructs allocations deterministically.
Exposure is aligned to equity by timestamp. Concentration is calculated across
all allocations and correlations use aligned return observations. For one
member, correlation is explicitly `not applicable`, never fabricated as zero.

Outcomes are `passed`, `failed`, `inconclusive` or `blocked`. A passed
assessment is only evidence for a future eligibility evaluation. Phase 6K
does not create promotion eligibility, prepare promotion, call the Investing
Engine, or produce orders, positions, fills or accounting.

Persistence is append-only and content-addressed. A scoped immutable member
table ties every assessment member to its decision, report, experiment, run and
dataset version; a fail-closed trigger proves that complete chain from the
immutable decision payload. RLS is a second barrier. The additive tables belong
only to Phase 6K; the frozen Phase 6C blueprint and earlier migrations remain
unchanged.
