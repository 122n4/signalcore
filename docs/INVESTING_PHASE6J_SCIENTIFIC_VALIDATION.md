# Investing Research Phase 6J

Phase 6J consumes completed, reproducible Phase 6I result envelopes and produces
immutable Phase 6B `ValidationReport` and `ScientificDecision` records.

The closed profile covers train/validation/holdout separation, minimum
out-of-sample evidence, Bonferroni multiple-testing correction, walk-forward
consistency, drawdown, stressed costs, robustness and degradation. Thresholds
are explicit versioned policy. The application boundary resolves the profile
through a server-only registry from the experiment reference; caller-supplied
thresholds are not accepted.

Window returns, benchmark returns, p-values, drawdowns, stress outcomes and
robustness counts are likewise never accepted from the caller. A server-only
collector verifies the Phase 6I artifact hash, loads the exact research-ready
dataset version through scoped PostgreSQL and content-addressed storage, maps
the immutable equity curve to experiment splits, builds a deterministic
buy-and-hold benchmark and derives all validation statistics internally. The
versioned server profile fixes that benchmark policy and the one-sided normal
approximation used before the Bonferroni correction; callers cannot select or
override either method.

Results may be validated, rejected, inconclusive, blocked or invalid. Negative
and inconclusive results are permanent scientific evidence. Validation is not
promotion eligibility and cannot call the Promotion Boundary, Investing Engine,
Trading, brokers, orders, positions, fills or accounting.

Reports and decisions are inserted atomically, append-only, tenant-scoped and
idempotent by canonical hashes. RLS is a second barrier; the application
boundary reconstructs scope through the public Investing identity entrypoint.
