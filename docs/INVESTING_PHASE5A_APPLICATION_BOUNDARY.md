# Investing Phase 5A — Internal Server-Side Application Boundary

## Status and objective

Phase 5A introduces an internal, typed and fail-closed application boundary
between future product callers and the accepted Investing engine v1. It does
not activate a product caller, Paper execution, broker integration or Live
operation.

The boundary lets a future server-side caller refer to already validated
canonical engine material without importing engine internals, constructing
artifacts, selecting database credentials or writing Investing tables.

## Scope

Phase 5A contains:

- versioned internal request and response contracts;
- an explicit authenticated execution context;
- one canonical persistence command;
- read, verification and replay queries;
- deterministic application errors;
- owner, tenant, portfolio and account scope authorization;
- an opaque canonical source resolver;
- a mandatory integrity guard;
- a single server-side composition root;
- unit, isolation and real PostgreSQL tests.

Phase 5A contains no API route, page, component, cron, queue, worker, daily
bundle, provider or broker caller.

## Architecture

The implementation lives under `lib/investing/application`:

- `contracts.ts` — versioned public internal contracts and safe results;
- `errors.ts` — deterministic application error and failure translation;
- `ports.ts` — server-side authorization, source-resolution and integrity
  interfaces;
- `validation.ts` — strict request, context, scope, secret and Live checks;
- `boundary.ts` — server-only command/query use cases and result translation;
- `factory.server.ts` — server-only dependency validation and composition over
  the accepted persistence services;
- `server.ts` — the sole supported server-only composition entrypoint;
- `index.ts` — safe contracts and errors only.

The public internal contract does not export PostgreSQL pools, repositories,
connection strings, credentials, canonical payloads, manifests, writer,
reader, verifier or replay classes. Administrative composition dependencies
are available only through the explicit server entrypoint.

## Execution context

Every operation receives `investing-application-context/v1` with:

- `authenticatedOwnerId`;
- `tenantId`;
- `portfolioId`;
- `correlationId`;
- `idempotencyKey` when the operation writes;
- `requestedOperation`;
- `applicationVersion`;
- `actorType`;
- `executionMode`.

The boundary has no default owner, tenant or portfolio. Empty, malformed,
implicit or mismatched identifiers fail before canonical source resolution,
reader access or transaction creation.

The functional request cannot contain a service role, token, credential,
secret, database URL, connection string or PostgreSQL object.

## Commands

### `createCanonicalRun`

Contract: `investing-application-create-run/v1`.

The command contains only:

- an opaque `sourceReference`;
- the requested owner/tenant/portfolio/account target.

The source reference is resolved behind an explicitly injected administrative
port. A future caller therefore cannot construct canonical artifacts or hashes.
The resolved material is checked against the authenticated scope and then
passed unchanged to `InvestingEnginePersistenceServiceV1`.

The command is restricted to:

- actor type `service_operator`;
- execution mode `administrative_canonical_persistence`;
- a valid explicit idempotency key.

## Queries

The boundary exposes only capabilities implemented by the accepted
persistence layer:

- `getRun` — load an exact scoped run through the official reader;
- `getLatestRun` — load the latest run for an authorized owner/account;
- `verifyRun` — load and verify a run through the official reader/verifier;
- `replayRun` — replay an authorized run through
  `InvestingEngineReplayServiceV1`.

There is no list implementation because the accepted repository port does not
currently provide a list operation. Phase 5A does not invent one.

Responses contain a safe summary: canonical IDs, state, quality, as-of,
manifest/final hashes, counts, correlation ID, idempotency outcome and reason
code. Full canonical payloads are not returned.

## Scope isolation

Validation occurs in this order:

1. reject secrets, forbidden execution intent and malformed context;
2. validate the exact contract version and allowed fields;
3. match authenticated owner, tenant and portfolio to the requested target;
4. call the mandatory scope authorizer;
5. for writes, require a clean integrity decision;
6. resolve the opaque canonical source;
7. match resolved owner, portfolio, account, run and idempotency identity;
8. call the accepted writer or reader.

Tenant authorization is an explicit port because the Phase 4 persistence
schema stores owner/account scope and the canonical input stores portfolio,
but no tenant column exists. The boundary does not infer a tenant or weaken the
Phase 4 schema.

## Transactions and idempotency

The boundary does not implement a second transaction or idempotency system.

`InvestingEnginePersistenceWriterV1` remains responsible for:

- transaction start and end;
- idempotency and run advisory locks;
- atomic insertion of the sealed run and all related artifacts;
- exact retry detection;
- payload conflict detection;
- rollback before commit;
- recovery after an ambiguous commit.

Application outcomes translate the accepted writer result:

- `inserted` → `created`;
- `idempotent_existing` → `existing_same_payload`;
- `recovered_after_ambiguous_commit` →
  `recovered_after_ambiguous_commit`;
- persistence key/run conflict → `idempotency_conflict`.

A retry after a committed write but lost response resolves deterministically
to the existing canonical run.

## Error taxonomy

The application contract distinguishes:

- `invalid_request`;
- `authentication_context_required`;
- `owner_scope_mismatch`;
- `tenant_scope_mismatch`;
- `portfolio_scope_mismatch`;
- `unsupported_version`;
- `idempotency_conflict`;
- `canonical_persistence_failed`;
- `verification_failed`;
- `replay_failed`;
- `integrity_blocked`;
- `live_operation_forbidden`;
- `internal_dependency_unavailable`;
- `run_not_found`.

Technical causes remain attached to the internal error chain. Responses expose
only a deterministic reason code and correlation ID; PostgreSQL messages,
credentials and connection details are not returned.

## Live block

The only accepted execution modes are:

- `internal_validation`;
- `administrative_canonical_persistence`.

Live, real-money, broker execution, order submission and trade placement intent
is rejected before authorization, source resolution or persistence. The
boundary exposes no Paper order operation and imports no Trading, broker or
provider module.

## Composition root

`lib/investing/application/server.ts` is the server-only entrypoint. Its factory
requires all dependencies explicitly:

- the accepted persistence repository;
- the accepted pure replay runner;
- a canonical source resolver;
- a scope authorizer;
- an integrity guard.

Missing dependencies fail deterministically. The factory does not read
credentials, create a pool or open a connection on import, install a mock,
create a mutable singleton or fall back to a global.

## Canonical persistence flow

```text
future server caller
  -> strict context/request validation
  -> scope authorizer
  -> integrity guard
  -> opaque canonical source resolver
  -> accepted PersistenceService writer
  -> accepted reader/verifier
  -> safe application result
```

Replay follows the same authorization path and delegates to the accepted
reader and replay service. There is no direct SQL in the application boundary.

## Tests

Unit and isolation tests cover:

- valid context and command;
- missing owner, tenant and portfolio;
- cross-owner, cross-tenant and cross-portfolio requests;
- identifiers hidden in resolved payload material;
- unknown versions and invalid idempotency keys;
- exact retry and payload conflict;
- missing or failing dependencies;
- integrity block;
- internal error translation;
- Live rejection before writes;
- safe deterministic responses;
- official reader, verifier and replay delegation;
- zero application callers.

Real PostgreSQL tests use a guarded disposable local database and synthetic
data. They cover canonical writer/reader use, retry, conflict, owner/tenant/
portfolio isolation, pre-write failure, ambiguous-commit recovery, canonical
equivalence and a final clean Phase 4C integrity scan.

The direct-engine equivalence assertion compares the manifest and final result
hash produced by `InvestingEnginePersistenceVerifierV1` with the values loaded
after the same input passes through the application boundary.

## Compatibility

Phase 5A does not modify:

- engine canonicalization or hashes;
- final decisions, manifests or replay;
- the writer, reader, verifier or PostgreSQL adapter;
- migrations, rollbacks or RLS;
- accounting;
- Trading or Paper Trading behavior;
- Live controls.

The only shared test-fixture extension is an optional synthetic `portfolioId`,
used to prove cross-portfolio isolation. Its existing default remains
`primary`.

## Explicit limitations and later phases

Phase 5A deliberately leaves the following work for later authorization:

- Phase 5B: product-facing server adapters/callers and authenticated identity
  integration;
- Phase 5C: product query presentation, pagination/listing if a canonical
  repository capability is approved, and UI/API response adaptation.

No Phase 5B or 5C caller is present here. Broker execution, Paper operations,
Live operations and automatic scheduling remain out of scope.

## Validation record

Validation was performed from the clean Phase 5A worktree against synthetic
fixtures and explicitly named disposable local PostgreSQL databases.

| Check | Result |
| --- | --- |
| Phase 5A unit, isolation and real PostgreSQL tests | exit 0; 3 files and 30 tests passed |
| Complete Investing regression | exit 0; 53 files passed, 3 PostgreSQL suites skipped without their opt-in variables; 418 tests passed and 22 skipped |
| Phase 4C-R1 real PostgreSQL regression | exit 0; 7 tests passed |
| Phase 4B real PostgreSQL regression | exit 0; 9 tests passed |
| SQL 4A, R1, R2, R3, R4 and R5 | exit 0 for each suite |
| From-zero migration application | exit 0; 34 migrations applied |
| Persistent Paper crash recovery | exit 0 |
| Replay, RLS, Persistent Paper and Live-block regression | exit 0; 18 tests passed |
| TypeScript (`npx tsc --noEmit`) | exit 0 |
| Full ESLint | exit 0 |
| `git diff --check` | exit 0 |
| Global suite | exit 1; 253 files passed, 18 skipped and 3 failed; 1137 tests passed, 44 skipped and only the six accepted Trading Paper baseline tests failed |

The global-suite baseline was exactly:

- `paperSignalExecutionContract`: 3 failures;
- `paperRunnerConcurrency`: 1 failure;
- `paperRunnerHistory`: 2 failures.

No new failure was observed. The Phase 5A PostgreSQL comparison asserted that
the accepted direct verifier and the application-boundary path produced the
same manifest hash and final-result hash for the same canonical input. The
final Phase 4C integrity scan reported the synthetic dataset clean.

## Phase 5A-R1 local PostgreSQL QA closure

The closure run used an isolated PostgreSQL 17 cluster under the Windows
temporary directory, listening only on `127.0.0.1:55439`, with local trust
authentication and no password. The pre-existing PostgreSQL service was not
modified. Four new disposable databases were used:
`investing_phase5a_qa`, `investing_phase4c_qa`, `investing_phase4b_qa`, and
`investing_regression_qa`.

Configuration existed only in the validation session, using
`INVESTING_5A_TEST_DATABASE_URL`, `INVESTING_4C_TEST_DATABASE_URL`,
`INVESTING_4B_TEST_DATABASE_URL`, `INVESTING_TEST_DATABASE_URL`,
`ALLOW_DESTRUCTIVE_INVESTING_QA`, and `PGUSER`. URLs contained no userinfo,
password, query, or fragment.

Reproduction, after provisioning new allowlisted local databases and applying
the standalone bootstrap plus migrations in lexical order:

```powershell
npx vitest run tests/investingPhase5AApplicationBoundaryPostgres.integration.test.ts
npx vitest run tests/investingEnginePhase4BPostgres.integration.test.ts tests/investingEnginePhase4CPostgres.integration.test.ts
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4a.sql
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4b_r1.sql
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4b_r2.sql
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4b_r3.sql
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4b_r4.sql
psql $env:INVESTING_TEST_DATABASE_URL -f supabase/tests/investing_engine_phase4b_r5.sql
node scripts/qa/runInvestingPostgresConcurrency.mjs
node scripts/qa/runInvestingEnginePhase4AConcurrency.mjs
node scripts/qa/runInvestingWorkerCrashRecovery.mjs
```

Four independent from-zero installations applied all 34 migrations with exit
`0`. Phase 5A PostgreSQL passed 6/6 tests; Phase 4B and 4C PostgreSQL passed
16/16; SQL 4A and R1-R5 all exited `0`; both concurrency runners and crash
recovery exited `0` with `ok: true`. Two independent schema fingerprints
matched:
`afc18134aa990aa251fba2e2818500a0fd065b7daf0b8b9df53ae5d2c3c0310a`.

Canonical equivalence passed for artifact inventory, manifest and final-result
hashes, verifier, replay, exact idempotency, and the final integrity scanner.
Owner, tenant, and portfolio isolation, RLS, Live rejection, corruption
blocking, and ambiguous-commit recovery passed.

The initially reported migration-chain reapply failure was produced by forcing
every historical SQL file through `psql` a second time. It stopped in
`20260719120000_investing_financial_architecture.sql` because policy
`investing_cash_balances_select_own` already existed. That command bypassed the
repository's migration ledger and was not the accepted reapply contract. It
therefore did not establish a Phase 5A readiness failure.

After evidence collection, the crash-recovery report was removed, all four
databases were deleted, the temporary cluster was stopped, and its temporary
directory was removed. No dump or QA output was retained in the repository.

## Phase 5A-R2 canonical migration reapply validation

R2 validated the repository-defined migration semantics documented by Phase
4C: the canonical runner is `supabase db push --include-all`, not a second
direct execution of the raw SQL files. Validation used Supabase CLI `2.109.1`
against isolated PostgreSQL 17 databases. `PGSSLMODE=disable` was scoped to the
standalone local test session; no production credential or password was used.
The redacted reproduction command was:

```powershell
npx --yes supabase@2.109.1 db push --db-url <disposable-local-postgresql-url> --include-all --yes
```

The canonical ledger was `supabase_migrations.schema_migrations`, with
`version`, `name`, and `statements` columns. On two independently created
databases the first canonical run applied exactly 34 migrations and exited
`0`. The second run on each database applied no migration, reported
`Remote database is up to date.`, and exited `0`. Each ledger contained exactly
34 versions and the six inspected engine tables remained empty.

Before and after the second run, the following fingerprints were identical:

| Surface | SHA-256 |
| --- | --- |
| Schema | `2fc172a7abbaa6a31ac5df944357775ec427d9b3c1627caa0a75116fe83f2230` |
| Migration ledger | `bc63ca4993f0c5f02916217b00264113c03f92a3ba09555a52df647ee96d1e50` |
| RLS, policies and constraints | `86e0b80d9722c50807e60ebcaba1b86256e0768754bbf66b9ee5eaa84611cb70` |

The same three fingerprints also matched between the two independent
databases. The ledger stores the applied statements but exposes no separate
checksum column; no independent altered-file checksum guarantee is claimed.
An absent ledger is handled as a first canonical application: the runner
creates the ledger and records all 34 versions rather than returning a false
up-to-date result. Migration files, rollback files and migration history were
not modified or tampered with during R2.

The R2 regression closure passed Phase 5A PostgreSQL 6/6, Phase 4C PostgreSQL
7/7, Phase 4B PostgreSQL 9/9, SQL 4A and R1-R5, both concurrency runners, and
all four crash/recovery scenarios. The Investing-only regression passed 421
tests with 22 opt-in PostgreSQL tests skipped in the environment-free run.
TypeScript, ESLint and `git diff --check` exited `0`. The global suite retained
only the accepted out-of-scope Trading Paper baseline: 1140 passed, 44 skipped
and six failed across `paperSignalExecutionContract` (3),
`paperRunnerConcurrency` (1), and `paperRunnerHistory` (2).

Canonical migration reapply is therefore idempotent under the accepted runner.
The Phase 5A-R2 classification is `phase5a_ready`.
