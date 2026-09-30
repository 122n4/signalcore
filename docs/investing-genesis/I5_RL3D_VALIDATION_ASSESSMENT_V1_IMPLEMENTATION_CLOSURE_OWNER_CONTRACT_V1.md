# I5 RL-3D Validation Assessment V1 Implementation Closure Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - RL-3D VALIDATION ASSESSMENT V1 IMPLEMENTATION CLOSURE - UNNUMBERED

Classification:
`CURRENT_ACCEPTED / RL-3D_VALIDATION_ASSESSMENT_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`

Permanent A-number:
`NOT ASSIGNED`

Accepted design predecessor:
`I5_RL3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE_V1.md`

Canonical implementation predecessor:
`a7cd8fbbcf7b7f064b223bffb6501e92ebe746f5`

Canonical acceptance-sync predecessor:
`b7a06290ac68355ba0a403c992d9706cb26e846b`

RL-3D implementation acceptance:
`CURRENT_ACCEPTED`

Final independently audited implementation candidate:
`432e02f8bf5d9c805aecc2e3d367ac9b6b097ff4`

PR:
`#109`

Accepted squash merge/main anchor:
`45de40e9d66bc2e11e30a449e80224a89d5a585a`

Candidate/merge tree:
`c24e2d31f48288e9a21fe16851138ab22e18dfe3`

Tree equality:
`PASS`

CI:
`#1366 / SUCCESS`

PostgreSQL 17:
`#149 / SUCCESS`

Vercel:
`SUCCESS`

Independent auditor verdict:
`PASS`

Production migration set:
`APPLIED / POST-APPLY AUDITED`

Production migration ledger:
`20260929193000 + 20260930175542 + 20260930190148`

Supabase Production:
`ALIGNED FOR RL-3D / RL-7 NOT APPLIED`

Production scientific/financial row mutation:
`NONE`

Production financial state:
`UNCHANGED`

RL-8 implementation:
`NOT STARTED BY RL-3D`

RL-9:
`NOT STARTED`

## Purpose

RL-3D closes the runtime gap between accepted RL-3C Validation Aggregate truth
and the downstream RL-8 scientific promotion gate.

It introduces exactly two scientific authorities:

- `SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1`;
- `SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1`.

The implementation must preserve the accepted RL-3D Design Freeze without
reinterpreting Validation structural completion as scientific PASS/FAIL.

## Runtime Surface

The deterministic kernel is:

`lib/investing/research/validationAssessment.ts`

It owns:

- closed Assessment Protocol canonicalization;
- exact owner-payload hashing;
- closed criterion/evidence/compatibility validation;
- Metric Registry V2-only admission;
- exact integer/rational threshold comparison;
- canonical consumed-evidence ordering;
- `PASS | FAIL | INSUFFICIENT_EVIDENCE` aggregation;
- fail-closed artifact integrity/schema/registry handling;
- Assessment Result canonicalization and hashing.

It must not:

- use floating point for scientific threshold authority;
- infer missing evidence as zero;
- accept caller-provided PASS/FAIL;
- accept hidden scores, confidence or probability;
- mutate predecessor Validation truth;
- authorize RL-8 promotion.

## Hash Domains

The canonical hash-domain registry admits exactly:

`SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1 = OWNER_PAYLOAD_EXACT`

`SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1 = OWNER_PAYLOAD_EXACT`

No `V2` assessment domain is introduced.

## Metric Registry Scope

RL-3D V1 scientific assessment is closed to:

`METRIC_REGISTRY_V20260927 / METRIC_V2 / METRIC_RESULT_SET_V2`

Historical V1 Validation remains preserved.

A V1 Validation Protocol is not promotion-assessed by RL-3D V1 and is not
retroactively invalidated merely because RL-3D exists.

The precommit requirement therefore applies to Validation Protocols whose
scientific metric registry is `METRIC_REGISTRY_V20260927`.

## Assessment Protocol Precommit

For V2 Validation lineage, the unique authoritative Assessment Protocol must be
accepted before the first `VALIDATION_RUN_REGISTERED` event.

The implementation proves this twice:

1. writer path:
   `validationExecutionWriter.ts` checks Assessment Protocol authority before
   persisting the first V2 Validation registration;
2. database path:
   `research_validation_registered_requires_assessment_protocol_trigger`
   refuses a V2 `REGISTERED` event without exactly one Assessment Protocol.

The inverse race is closed by:

`research_validation_assessment_protocol_pre_result_trigger`

Both sides acquire the same transaction advisory lock keyed by the accepted
Validation Protocol identity.

Therefore:

- Assessment Protocol first -> V2 registration may proceed;
- V2 registration first -> new Assessment Protocol fails closed;
- concurrent protocol/registration attempts serialize;
- timestamp ordering is never authority.

V1 Validation registration remains executable and historical V1 truth remains
preserved.

## Server-Derived Authority

New authority operations are exactly:

`RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1`

`RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1`

Authority resolution is server-side in:

`lib/investing/authority/context.ts`

Both contexts require:

- verified Clerk principal;
- active tenant;
- active OWNER membership;
- exact Investigation;
- exact accepted Validation Protocol identity;
- exact subject Experiment derived from persisted Protocol lineage;
- `TENANT_SCOPE / PURE_RESEARCH`;
- no account authority;
- no client-supplied tenant/principal/membership/operation authority.

`service_role` remains capability, never authorization.

## Persistence Surface

Candidate migration:

`supabase/migrations/20260929193000_investing_i5_rl3d_validation_assessment_v1.sql`

New relations:

`investing.research_validation_assessment_protocols_scientific_identities`

`investing.research_validation_assessment_results_scientific_identities`

Both are:

- owned by `investing_owner`;
- RLS enabled;
- FORCE RLS enabled;
- append-only;
- server-authority scoped;
- granted only the minimum `SELECT, INSERT` surface to `investing_app`;
- not writable by `public`, `anon`, `authenticated` or `service_role`.

No `UPDATE`, `DELETE` or `TRUNCATE` authority is granted.

## Assessment Protocol Identity

Assessment Protocol persistence binds:

- tenant/principal/membership authority;
- Investigation;
- accepted Validation Protocol identity;
- subject Experiment;
- Validation Protocol HashRef;
- subject Experiment HashRef;
- subject Research IR HashRef;
- exact Metric Registry V2;
- exact assessment methodology;
- Assessment Protocol HashRef;
- canonical owner payload.

The logical protocol authority is unique for one Validation Protocol identity in
the current accepted V1 implementation.

Identical writer retry reuses the same scientific identity.

Divergent retry fails closed with:

`DIVERGENT_ASSESSMENT_PROTOCOL`

## Assessment Result Identity

Assessment Result persistence binds:

- exact authoritative Assessment Protocol;
- exact accepted Validation Result;
- exact Validation Protocol;
- subject Experiment;
- subject Research IR;
- exact registry;
- closed outcome;
- Assessment Result HashRef;
- canonical owner payload.

One exact Assessment Protocol + Validation Result pair has at most one
authoritative Assessment Result.

Identical retry reuses the identity.

Divergent retry fails closed with:

`DIVERGENT_ASSESSMENT_RESULT`

## Evidence Truth

The finalizer does not accept caller evidence.

It resolves evidence from persisted accepted predecessor truth.

Validation Child evidence is re-proved through:

- Validation RunInput canonical payload/hash;
- Validation Child Result canonical payload/hash;
- fold ordinal;
- phase;
- accepted aggregate Validation Result fold membership;
- exact Metric Result Set artifact descriptor and bytes.

Aggregate metric evidence is resolved from the accepted base Research Result
matching the exact scientific inputs bound by the Validation Protocol.

Before a metric value becomes assessment evidence:

- descriptor schema must be `METRIC_RESULT_SET_V2`;
- format must be canonical JSONL;
- SHA-256 must match bytes;
- byte length must match;
- record count must match;
- each JSONL row must be canonical;
- registry must be `METRIC_REGISTRY_V20260927`;
- metric identity/version must be exact;
- duplicate metric identity fails closed.

Evidence Object consumption is bound to persisted Evidence Object HashRefs when
required by the frozen Protocol. The finalizer revalidates Evidence Object
descriptor bytes, content SHA-256, content length, scientific object hash and
base Result / Research IR / Experiment / DatasetSnapshot / metric request /
execution config / engine lineage before projecting an accepted Evidence Object
onto the Protocol-selected observation identities.

Metric Result Set evidence is admitted only when the persisted artifact
descriptor exactly equals the descriptor already hashed into its owning Result
or Validation Child Result. Unselected child metric artifacts are not passed to
the assessment kernel as accidental evidence.

No absent evidence is converted to numeric zero.

## Result Semantics

Scientific result statuses are exactly:

`PASS`

`FAIL`

`INSUFFICIENT_EVIDENCE`

Operational/integrity/authority incompatibility is not serialized as one of
those scientific outcomes.

Such failures abort admission before authoritative Assessment Result
persistence.

Required-criterion aggregation is exactly:

- any required FAIL -> FAIL;
- otherwise any required INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE;
- otherwise -> PASS.

Optional criteria never override required criteria.

## Service Surface

Internal server-only commands are:

`createValidationAssessmentProtocolCommandV1`

`finalizeValidationAssessmentResultCommandV1`

No public product API is introduced by RL-3D.

No UI is introduced.

## Validation Execution Compatibility

RL-3D must not silently retire historical V1 Validation.

The V2 Assessment precommit gate is conditional on:

`validationProtocol.metricRegistryVersion === METRIC_REGISTRY_V20260927`

Existing V1 Validation execution tests remain valid.

V2 Validation without an authoritative Assessment Protocol is fail-closed.

## Tests

Deterministic runtime:

`tests/investingGenesisI5Rl3dValidationAssessmentRuntime.test.ts`

Coverage includes:

- admitted domains;
- canonical ordering;
- protocol evidence-union equality;
- compatibility matrix;
- ratio/integer metric-kind authority;
- canonical decimal rejection;
- exact PASS;
- exact FAIL;
- UNAVAILABLE policy;
- artifact corruption;
- wrong registry;
- duplicate metric identity;
- multi-fold aggregation;
- missing evidence != zero.

Authority:

`tests/investingGenesisI5Rl3bValidationAuthorityRuntime.test.ts`

Coverage includes both RL-3D server-derived contexts and rejection of
caller-injected authority.

Writer integration:

`tests/investingGenesisI5Rl3dValidationAssessmentWriter.test.ts`

Coverage includes:

- branded/server-derived Assessment create/finalize contexts;
- Protocol create and identical replay;
- divergent Protocol retry;
- late Protocol rejection after Validation registration;
- Assessment Result finalization from persisted predecessor evidence;
- identical Result replay;
- fail-closed persisted Metric Result Set descriptor drift.

Architecture:

`tests/investingGenesisArchitectureBoundaries.test.ts`

The Assessment kernel is explicitly admitted as an owner-payload preimage
consumer rather than bypassing the architecture boundary.

PostgreSQL 17:

`tests/investingGenesisI5Rl3dValidationAssessmentPg17.test.ts`

The rehearsal must prove:

- cumulative migration application;
- PostgreSQL 17;
- owner/RLS/FORCE RLS;
- minimum grants;
- no regulated role mutation grants;
- V1 registration preservation;
- V2 registration blocked without Assessment Protocol;
- V2 registration succeeds with precommitted Assessment Protocol;
- first Assessment Protocol after V2 REGISTERED fails;
- Assessment Result persistence;
- append-only Protocol and Result truth.

Workflow:

`.github/workflows/investing-supabase-reconciliation-pg17.yml`

The RL-3D PG17 rehearsal is mandatory for PRs changing its migration/test/workflow
surface.

## Failure-Closed Invariants

The implementation must fail closed for:

- unknown Assessment Protocol fields;
- unknown Assessment Result fields;
- unsupported metric/registry/version;
- threshold type mismatch;
- noncanonical numeric representations;
- incompatible evidence/source/owner/scope/cardinality matrix;
- divergent requirement descriptor under same requirement ID;
- divergent top-level requirement union;
- duplicate criterion identity;
- no required criterion;
- artifact corruption;
- artifact/descriptor mismatch;
- duplicate metric identity;
- missing fail-closed evidence;
- unauthorized or cross-lineage predecessor truth;
- missing authoritative Assessment Protocol for V2 Validation registration;
- late Assessment Protocol creation;
- divergent Protocol retry;
- divergent Result retry.

## Explicit Non-Authority

RL-3D does not authorize or implement:

- RL-8 promotion state changes;
- RL-9;
- Paper;
- Live;
- broker integration;
- portfolio allocation;
- suitability;
- recommendations;
- Capital Kernel approval;
- autonomous optimization;
- Blind Truth / Evidence Vault;
- product API;
- product UI.

`PROMOTION_ELIGIBLE` is not produced by RL-3D.

## Accepted Implementation Evidence

The implementation closure is `CURRENT_ACCEPTED` because the full gate was
independently proved on the exact accepted candidate and merge lineage:

1. canonical implementation predecessor:
   `a7cd8fbbcf7b7f064b223bffb6501e92ebe746f5`;
2. final independently audited implementation candidate:
   `432e02f8bf5d9c805aecc2e3d367ac9b6b097ff4`;
3. accepted PR:
   `#109`;
4. accepted squash merge/main anchor:
   `45de40e9d66bc2e11e30a449e80224a89d5a585a`;
5. candidate/merge tree:
   `c24e2d31f48288e9a21fe16851138ab22e18dfe3`;
6. tree equality:
   `PASS`;
7. CI:
   `#1366 / SUCCESS`;
8. full suite:
   `247 passed / 18 skipped files`;
9. tests:
   `1446 passed / 60 skipped`;
10. lint:
    `0 errors / 3 pre-existing warnings`;
11. TypeScript:
    `PASS`;
12. build:
    `PASS`;
13. dependency audit:
    `0 vulnerabilities at the accepted implementation gate`;
14. PostgreSQL 17 reconciliation:
    `#149 / SUCCESS`;
15. cumulative PostgreSQL 17 compatibility:
    `SUCCESS`;
16. RL-3D PostgreSQL 17 assessment rehearsal:
    `SUCCESS`;
17. Vercel:
    `SUCCESS`;
18. independent auditor verdict:
    `PASS`.

At the implementation-acceptance gate above, Git acceptance did not authorize
database application and the RL-3D migration was still `NOT APPLIED`. That
historical fact remains part of the acceptance evidence. A later separately
authorized Production gate applied the accepted RL-3D migration set and completed
the post-apply remediation/audit documented below; this subsequent Production
closure does not rewrite the original implementation-acceptance boundary.

## Subsequent Production Closure Evidence

- initial Production source main anchor:
  `de9b2ffb959ca6bb2abcea0e442e462d71249d8d`;
- initial Production application:
  `36761859894 / Temporary RL3D Production Apply #3 / SUCCESS`;
- initial dry-run:
  `EXACTLY 2 AUTHORIZED RL-3D MIGRATIONS`;
- remote ledger after initial application:
  `20260929193000 + 20260930175542 / MATCH`;
- post-apply audit detected RL-3D-specific performance debt only:
  `+5 unindexed_foreign_keys / +11 auth_rls_initplan / +0 multiple_permissive_policies`;
- accepted remediation final candidate:
  `4163ef0f03aea0e0f9534ba2556367bc765eb33d`;
- remediation PR:
  `#113`;
- remediation accepted merge/main anchor:
  `8cb1e4437eebb155e01d04eef6ee6f23bae9a6c4`;
- remediation candidate/merge tree:
  `2a1af1ddd73e8250621c25f6223c8dc61c72d4d1`;
- remediation CI:
  `#1398 / #1399 / SUCCESS`;
- remediation PostgreSQL 17:
  `#152 / SUCCESS`;
- remediation Production application:
  `36764877624 / Temporary RL3D Performance Remediation Production Apply #1 / SUCCESS`;
- remediation dry-run:
  `EXACTLY 1 AUTHORIZED MIGRATION / 20260930190148`;
- remote ledger after remediation:
  `20260930190148 / MATCH`;
- post-remediation advisors:
  `unindexed_foreign_keys 159 / auth_rls_initplan 317 / multiple_permissive_policies 73`;
- RL-3D-specific unindexed FK findings:
  `NONE`;
- RL-3D-specific auth RLS initplan findings:
  `NONE`;
- five remediation indexes:
  `VALID / READY / investing_owner`;
- seven consolidated Validation relations:
  `EXACTLY 1 investing_app SELECT POLICY EACH`;
- Assessment/Validation scientific row counts:
  `0`;
- Production scientific/financial row mutation:
  `NONE`;
- RL-3D Git/Production alignment:
  `PASS`;
- RL-7 Production migrations:
  `NOT APPLIED / OUTSIDE RL-3D PRODUCTION CLOSURE`.
