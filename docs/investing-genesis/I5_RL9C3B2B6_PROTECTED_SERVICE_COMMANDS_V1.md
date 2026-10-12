# RL-9C3B2B6 — Protected Research/Validation Service Boundaries

Status: `CANDIDATE / FAIL_CLOSED_PUBLIC_COMMANDS / NOT_OPERATIONAL_EMBARGO / UNMERGED`.

Accepted main predecessor: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Immediate stacked predecessor PR #145: `4c16c86ddf4dc10f452c7b2e7993324428aebd17`.
Stacked PRs #138–#145 remain open Draft and unmerged.

## Executable integration

**The two existing service commands now explicitly reject caller-supplied material providers** (and unknown caller fields, prototypes and symbol keys):

- `executeResearchRunCommandV1`
- `executeValidationChildCommandV1`

They resolve the server-owned authorized scientific context as before, then **install only the B5 denial-only journal provider**, backed by the Investing DB. No caller can substitute an `InMemoryResearchDatasetMaterialProviderV1`, a cache, a forged `ALLOW` callback, tenant authority, or raw bytes through the service input.

Since the B5 provider **always returns `RESEARCH_MATERIAL_ACCESS_UNPROVEN`** (even if a denied attempt is successfully journaled), both public execution commands currently fail closed until the full real read-admission and all-access audit is constructed. This is deliberate safety behavior, **not** permission to use those commands for real scientific runs. Metadata preparation may still occur before the denied provider is reached. An absent Production migration prevents journaling and leaves the command unavailable; it must NEVER fall back to raw material. No financial read or paper/live execution is affected, and no Core or Trading module imports Lab embargo code.

## Preserve scientific functionality without a test bypass in public services

The old scientific writer and compatibility fixtures were moved to call the lower-level writer **directly from the tests**, after invoking the existing server authority resolver and using their synthetic fixture material provider. Their scientific golden results, lifecycle and real PG17 transactions remain under test, but do not pass through the newly protected public service commands. There is **no `NODE_ENV` bypass**, hard-coded tenant exception, client-provided `ALLOW`, special request header or live data fallback.

Remaining risk: lower-level writers remain exported server-only building blocks and can still be invoked by trusted server code with a raw provider. Call-site inventory and further policy enforcement are mandatory before the entire Research Lab may claim an operational embargo. These tests are explicitly **not proof** of permitted real Research material reads.

## Next acceptance gates (mandatory)

1. Server-owned canonical instrument/field/time mapping with verified adapter provenance.
2. Full permission protocol for ordinary non-embargoed data, tenant identity and complete registration access ledger. A no-fence result must never be equated to authorizing evidence.
3. Lock coverage across actual source/cache/materialization byte fetch **and byte release/consumption**, with abort/crash/timeout recovery and register-vs-reader race tests.
4. Lock down lower-level writer access paths and audit all provider/cache/export, optimizer and transformed-frequency routes; isolate every tenant. Rehearse registration only when prior non-exposure can be proved.
5. Replace denial-only public service behavior with the above authoritative guard; demonstrate legitimate ordinary Research and Validation succeed without embargo or hidden test flags.

No real holdout, vault secret, paid infra, migrations in Production, merge, deployment, production account or cash movement is authorized by this candidate.
