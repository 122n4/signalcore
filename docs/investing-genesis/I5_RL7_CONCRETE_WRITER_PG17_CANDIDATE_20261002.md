# RL-7 concrete writer PostgreSQL 17 candidate

Status: CANDIDATE / NOT ACCEPTED. No Production application or acceptance.

## Lineage audit

- Required predecessor / observed `origin/main`: `18990a43830bb0c1b12d279e0b9ba987ae8354c1`.
- Target branch: `candidate/i5-rl7-concrete-writer-pg17-20261002`.
- Existing target tip / parent of this correction: `e45b73c4ac30782969aeffe1c82e40627e38f71a`.
- Existing rebuild: `33a16e58dec274ed0424db11fa312d17c06e53f8`, followed by `716ed7d831633b7015c84581f98324a8d1d4baba`.
- Existing rebuild2: `6000ff177ffa87f55de7947180d291a504d3c8b3`.
- Both rebuild histories descend independently from the required predecessor. They are preserved; no reset, rebase, deletion, force push, or change to main.
- Initial GitHub query found no PR for the target branch. The original Vercel status is failure; rebuild and rebuild2 statuses are success. Authenticated Vercel build logs were not available through the connected tools; the original patch itself contains undefined fixture/writer symbols and escaped template-literal delimiters.
- No workflow runs were returned for the original or rebuild tips. Rebuild2 has successful CI run `36968314795` and PG17 run `36968314820`; job `110716784847` was inspected. Those results belong to rebuild2, not this correction.
- Ignoring line endings, rebuild and rebuild2 differ only in blank lines. Their adapter substitutes in-memory artifact responses, so their green PG17 gate does not establish persisted source reads.

This correction recovers the scientific fixture from rebuild2 onto the existing target history, removes its SQL interception, and extends the original target test. Existing local recovery and main-named worktrees remain on their original branches.

## Exact boundary: option B

Mocked: `resolveAuthorizedResearchPassportReadContext`, its runtime-brand predicate, and `readResearchPassportV1`. The resolver fixture refuses a denied context or an investigation mismatch. `server-only` is stubbed for the Node test environment. This does not prove Clerk authentication, the production context brand, the full Passport reader, upstream acceptance, or the upstream creation lifecycle.

Real: `writeExperimentComparisonV1`, `readExperimentComparisonSourcesV1`, evidence issuance, scientific derivation, both canonical serializers and hashes, `pg.Pool` queries, effective `investing_app` role, membership/principal/tenant recheck, RL-7 tables/functions/constraints/triggers/RLS/FORCE RLS, artifact SQL reads and byte validation, and transaction commit/rollback. The typed test adapter forwards every query and records results only after PostgreSQL returns them; it does not synthesize rows or errors. It uses `SET ROLE investing_app` on a disposable administrative connection, not the production Supabase pooler/TLS transport configuration.

Upstream evidence setup is deliberately synthetic. Real Engine V2 generates the metric and valuation bytes. An administrative seed transaction uses `SET LOCAL session_replication_role=replica` to materialize the upstream read projection without rebuilding accepted slices. Upstream foreign-key lineage is therefore not proved: spec/experiment/protocol/input/unused trace references may be placeholders. The result artifacts, result/run-input linkage, validation execution rows, child-result linkage, and metric bytes needed by real read policies are persisted in the actual migrated tables. CHECK constraints validate bytes during setup. No RL-7 row is seeded, no policy/grant/table/function is replaced, and no runtime query uses replica mode. Every writer adapter connection asserts `session_replication_role=origin` before use. This is a writer integration proof with mocked upstream projection, **not Passport end-to-end**.

## Executable evidence

The existing `tests/investingGenesisI5Rl7ExperimentComparisonPg17.test.ts` now checks:

- Real commit, both SQL function creation statuses, effective role, artifact and fold SQL reads, and visibility from a separate administrative connection.
- Independently derived result/hash and canonical protocol/result bytes; persisted JSONB equals those bytes' parsed content. Extra caller hashes, payload bytes, and `prepared` values do not govern persistence.
- Identical replay returns the same protocol/result identities and hashes.
- A disposable `CHECK (false) NOT VALID` on the Result table raises PostgreSQL `23514` after a new Protocol has been created. The writer rolls back, the protocol hash is absent from a separate connection, and retry after removing the constraint succeeds. Existing rows are not rewritten, and no runtime or migration is weakened.
- Denied authority, wrong membership, revoked membership, another tenant's otherwise valid membership, corrupt artifact descriptors, and a pointer to the wrong persisted artifact bytes all reject without adding RL-7 rows. Revocation is an actual database membership update in this disposable test, followed by restoration.
- Existing direct-SQL concurrency, replay/conflict, cross-tenant, append-only, no UPDATE/DELETE/TRUNCATE grants, invoker-function, and denied service-role execution checks remain.

The PG17 workflow explicitly runs this file, and its trigger paths now cover the writer/readers/authority, scientific fixtures, lockfile/package configuration, and Vitest configuration. CI uses a `postgres:17` service and an explicit `PG17_RECONCILIATION_URL`. Without that variable the database tests are skipped; that is not PG17 evidence.

## Local validation

- PostgreSQL **17.6**, disposable cluster bound to `127.0.0.1:55437`: **16/16 passed**, no skipped database test.
- Dedicated RL-7 suite with the real PG17 URL: **125 passed, zero skipped, zero failed**, 12 files.
- Full Vitest suite without database URLs: **1503 passed, 71 skipped, zero failed**, 270 files. Database skips are not counted as PG17 evidence; the dedicated execution above supplies the RL-7 database proof.
- TypeScript: passed. Lint: zero errors; three existing unused-parameter warnings in `investingGenesisI5Rl3cValidationPassport.test.ts`.
- Build: passed using the CI dummy Clerk public key. Initial sandbox-only attempt could not download Google Fonts; execution with network access passed. Existing Trading filesystem-tracing warning remains. Next's generated tsconfig edits were removed.
- Full `npm audit --audit-level=low` and production `npm run audit:prod`: zero vulnerabilities.
- No runtime, migration, RLS, grant, SECURITY DEFINER, or service-role authority changes. No Production data/migrations/deployment changes.

The checkout reports a preexisting normalization discrepancy for `20260912050000_investing_i5_a3_research_material_revisions.sql`: its raw worktree blob and HEAD blob are both `907a6df7da30da13f13e42a37a5af6c433d51c94`. Historical mixed endings conflict with the current `text eol=lf` attribute. The bytes are untouched and the file is excluded from this candidate.

RL-7 remains **NOT ACCEPTED**. Git/CI evidence grants no Production migration or acceptance authority.
