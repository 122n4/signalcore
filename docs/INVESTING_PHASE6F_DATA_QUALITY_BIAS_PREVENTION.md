# Investing Research Lab — Phase 6F data quality and bias prevention

Phase 6F qualifies immutable Phase 6E dataset versions. It does not mutate an
`awaiting_quality` version. A successful qualification publishes an immutable
derived version, an immutable quality report, and a scoped lineage edge in one
database transaction.

## Boundary and lifecycle

The only input dataset state is `awaiting_quality`. The report outcome is one of
`invalid`, `incomplete`, `valid_not_research_ready`, or `research_ready`.
Missing evidence always produces `incomplete`; it is never interpreted as a
pass. Only a report whose outcome is exactly `research_ready` can authorize the
derived version. That version is not a promotion candidate and is not sent to
Trading, Paper, Live, a broker, or the Investing Engine.

The source payload, acquisition provenance, storage reference, content hash,
requirement, and full tenant/owner/portfolio/account scope remain attached to
the derived version. The database guard verifies those relationships rather
than trusting IDs embedded only in JSON.

## Evidence matrix

Every report contains exactly one result for each gate:

1. storage and raw/normalized hash integrity;
2. requested versus observed coverage;
3. calendar and session policy;
4. gaps;
5. duplicate/conflicting observations;
6. source and canonical timezone;
7. staleness against a versioned threshold and explicit `asOfExclusive`;
8. structural OHLCV and bounded outlier evidence;
9. adjustment policy;
10. corporate actions;
11. look-ahead;
12. survivorship;
13. provenance.

Evidence references are closed, content-hashed records. The evaluator does not
claim to reconstruct evidence that Phase 6E did not persist. Existing versions
therefore remain `incomplete` until the required evidence is supplied.

The application caller supplies only a source version ID and a closed policy
profile. Source material and requirement material are loaded from the scoped
catalog. A server-only collector reads the content-addressed payload, verifies
its normalized hash and record count, derives structural evidence, and combines
it only with trusted calendar/acquisition/corporate-action/universe evidence
ports. Evidence IDs and hashes are recomputed over canonical evidence material
in both the evaluator and PostgreSQL guard.

`not_applicable` is limited to two explicit v1 rules: corporate-action evidence
for non-equity/non-fund instruments and survivorship for an explicitly declared
single-instrument universe. Equity/fund corporate actions and point-in-time
universes require evidence.

## Identity and concurrency

The report ID is a SHA-256 digest of official canonical JSON with the additive
domain `syntrake.investing.dataset-quality-report/v1`. Operational
`evaluatedAt`, correlation ID, actor, process, host, paths, and credentials are
outside this identity. Identical source, policy, evidence, gates, and outcome
converge through a database unique key. Different evidence produces a different
report identity.

The quality report, derived dataset version, and lineage event are immutable.
Scoped composite foreign keys reject cross-tenant, cross-owner, cross-portfolio,
and cross-account references. RLS is a second barrier; the server-side service
still resolves and enforces application identity before database access.

## Deliberate exclusions

Phase 6F creates no queue, worker, scheduler, lease, UI, public API, backtest,
hypothesis, candidate, promotion, order, position, fill, accounting entry,
broker call, or live action. Distributed orchestration belongs to Phase 6G.
