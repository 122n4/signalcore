# I5 RL-9 Blind Truth / Evidence Vault V1 Design Freeze

Status: CANDIDATE DESIGN FREEZE - RL-9 BLIND TRUTH / EVIDENCE VAULT V1 - UNNUMBERED

Classification:
`CANDIDATE / RL-9_BLIND_TRUTH_EVIDENCE_VAULT_V1_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`f06eac41cf3774a198d157b61a830fb492fb6b70`

Current accepted predecessor authority:
`RL-8 = CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`

Research Lab frontier:
`I5 RESEARCH LAB = IN_PROGRESS / RL-9_TO_RL-11 / PRODUCT_UI_DEFERRED`.

RL-9 acceptance:
`NOT ACCEPTED`

Runtime implementation:
`NOT IMPLEMENTED BY THIS SLICE`

Migration:
`NONE`

Production mutation:
`NONE`

Supabase Production:
`UNCHANGED`

Permanent A-number:
`NOT ASSIGNED`

## Purpose

RL-9 freezes the design for a controlled one-shot holdout mechanism whose purpose
is research integrity.

Blind Truth answers only:

```text
Did one exact pre-registered scientific candidate satisfy one exact
pre-registered evaluation contract on one secret holdout that was not available
to the ordinary research/optimization path before the authorized reveal?
```

It does not answer whether the strategy will be profitable in the future.

A Blind Truth PASS is not an investment recommendation, suitability conclusion,
portfolio allocation decision, Paper authorization, capital authorization, Live
authorization, broker instruction or Capital Kernel approval.

The integrity property is stronger than "the caller promises not to look". V1
requires cryptographic commitment, authority separation, one-shot reservation,
append-only reveal history, anti-reuse controls and fail-closed behavior.

## Constitutional Boundaries

The following remain invariant:

- `CORE != LAB`;
- `LAB != PAPER`;
- `INVESTING != TRADING`;
- `service_role` is capability, never scientific authority;
- UI, AI, optimizer and caller-supplied labels are not source authority;
- scientific identity is content-addressed and deterministic;
- operational UUIDs, timestamps, storage locators and encryption keys are not
  scientific identity;
- a Git merge is not acceptance;
- a green CI run is not acceptance;
- this design slice writes no SQL and changes no Production state.

RL-9 MUST NOT import from or depend on `lib/trading/**`.

## V1 Entry Gate

RL-9 is downstream of accepted RL-8 promotion.

A V1 Blind Truth registration is admitted only for one exact accepted
`PROMOTION_ELIGIBLE` RL-8 transition whose subject is exactly:

```text
subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>
subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>
subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
```

Registration also binds:

```text
promotionProtocol: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1>
promotionTransition: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1>
```

The referenced transition MUST be an accepted `PROMOTION_ELIGIBLE` transition
for the same tenant, Investigation and scientific subject.

If that promotion authority is missing, ambiguous, corrupted, wrong-tenant,
wrong-Investigation, wrong-subject or already superseded before registration,
registration fails closed.

Once reveal has started, later promotion supersession does not rewrite historical
Blind Truth evidence. The historical event remains immutable and must be
interpreted with its exact bound promotion transition.

## One Candidate, One Blind Truth Attempt

The V1 logical Blind Truth candidate key is:

```text
tenant authority
+ Investigation UUID
+ subject Experiment HashRef
+ subject ExperimentParameters HashRef
+ subject Research IR HashRef
```

Exactly one authoritative Blind Truth registration is admitted for this logical
candidate key in V1.

The bound RL-8 promotion Protocol/Transition are required eligibility evidence,
but they are deliberately NOT part of the one-shot uniqueness key. A later RL-8
methodology/protocol change or re-promotion of the same exact scientific subject
MUST NOT reopen Blind Truth eligibility.

Changing a protocol id, promotion transition, random salt, storage locator,
encryption key, request id or retry token MUST NOT create a second Blind Truth
attempt for the same exact candidate key.

To obtain a new Blind Truth attempt, the scientific candidate must change and
must pass the accepted upstream promotion path again. A retest of the same exact
candidate after seeing holdout truth is forbidden.

Concurrent identical registration reuses the same scientific identity.
Concurrent or divergent registration for the same logical candidate key fails
closed with `DIVERGENT_EXISTING_IDENTITY`.

## Pre-Registration Freeze

The pre-registration freeze is immutable and MUST exist before any reveal
reservation.

It binds the exact hypothesis and test configuration required by the Research
Lab Completion Program.

The V1 registration freezes:

```text
schemaVersion
protocol
subjectExperiment
subjectExperimentParameters
subjectResearchIr
promotionProtocol
promotionTransition
hypothesis
metricRequestSet
executionConfig
blindTruthCriteria
holdoutScope
evaluatorProfile
```

Where:

- `hypothesis` is an exact `HashRef<SYNTRAKE:HYPOTHESIS:V1>`;
- `metricRequestSet` is an exact
  `HashRef<SYNTRAKE:METRIC_REQUEST_SET:V1>`;
- `executionConfig` is an exact
  `HashRef<SYNTRAKE:EXECUTION_CONFIG:V1>`;
- `blindTruthCriteria` is a byte-sorted, non-empty closed array of exact
  metric identity + comparator + canonical threshold + required/optional flag;
- Blind Truth criteria reuse the accepted Metric Registry numeric kinds and
  deterministic comparison law; they do not reuse a Validation Assessment
  Result and do not require validation-only evidence classes;
- the Registration HashRef is the exact scientific identity of the frozen
  Blind Truth threshold/criteria set;
- `evaluatorProfile` freezes engine id, engine version, Metric Registry version
  and the Blind Truth evaluator behavior version.

Thresholds MUST NOT be selected, changed or reinterpreted after reveal.

Metrics MUST NOT be added, removed or reordered after reveal.

Experiment parameters MUST NOT be changed after reveal.

### Blind Truth Criterion Identity

Each Blind Truth criterion is a closed canonical record:

```text
BLIND_TRUTH_CRITERION_V1 {
  criterionId,
  criterionVersion,
  required,
  metricId,
  metricVersion,
  operator,
  threshold
}
```

`criterionVersion` is exactly `CRITERION_V1`.

Criteria are byte-sorted by `criterionId`, then `criterionVersion`.
Duplicate criterion identities are forbidden.

Allowed operators reuse the accepted deterministic assessment comparison law and
are exactly:

```text
LT
LTE
EQ
GTE
GT
BETWEEN_INCLUSIVE
OUTSIDE_EXCLUSIVE
```

Threshold shape is the same closed scalar/range numeric union already accepted
for deterministic metric comparison. Metric numeric kind comes from the frozen
Metric Registry version in `evaluatorProfile`, never from caller declaration.

Blind Truth criteria deliberately omit Validation-only evidence-source,
fold/phase and evidence-requirement selectors. Holdout evaluation consumes only
the revealed holdout metric results produced by the frozen evaluator.

An empty criteria set or an all-optional criteria set is invalid.

## Exact Holdout Scope Identity

The registration contains one closed nested
`BLIND_TRUTH_HOLDOUT_SCOPE_V1` object.

Exact keys:

```text
schemaVersion
providerId
providerDatasetId
providerDatasetVersion
markets
frequency
fields
coverageStart
coverageEnd
calendarId
timezone
```

Rules:

- `markets` is a byte-sorted unique non-empty array of canonical market /
  instrument identifiers;
- `fields` is a byte-sorted unique non-empty array of canonical field ids;
- `coverageStart <= coverageEnd`;
- frequency, calendar and timezone are explicit;
- provider dataset id and immutable provider dataset version are explicit;
- mutable aliases such as `LATEST` are forbidden;
- no hidden observation value is present in the registration;
- no derived holdout statistic is present in the registration.

This object freezes exact markets, timeframe and fields.

Exact parameters are bound by
`subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>`.

Exact metrics are bound by
`metricRequestSet: HashRef<SYNTRAKE:METRIC_REQUEST_SET:V1>`.

Exact thresholds are bound by the exact `blindTruthCriteria` serialized inside
the Registration scientific identity.

There is no duplicate second source of truth for parameters, metrics or
thresholds.

## Evidence Vault Seal

The holdout material is sealed before evaluation.

The public scientific seal MUST NOT contain raw observations, decrypted bytes,
random commitment salt, encryption key, vault credential, storage locator or
derived holdout statistics.

The V1 public seal binds exactly:

```text
schemaVersion
protocol
registration
holdoutScopeDigest
commitmentAlgorithm
commitmentHash
declaredPlaintextByteLength
vaultFormatVersion
```

`holdoutScopeDigest` is a non-HashRef digest computed exactly as:

```text
SHA-256(
  "SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1\n"
  + canonical_json(BLIND_TRUTH_HOLDOUT_SCOPE_V1)
)
```

It exists only to bind the seal to the exact frozen scope and does not create a
sixth scientific domain.

`commitmentAlgorithm` is exactly:

`SHA256_DOMAIN_SEPARATED_SALTED_V1`

The public commitment is:

```text
SHA-256(
  "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1\n"
  + secret_random_salt_32_bytes
  + exact_canonical_holdout_plaintext_bytes
)
```

The 32-byte random salt is secret before reveal and is stored only inside the
vault envelope with the holdout material.

The public seal stores the resulting commitment hash but not the salt.

At authorized reveal, the salt and exact plaintext are opened together and the
commitment MUST be recomputed before any scientific evaluation.

Commitment mismatch, byte-length mismatch, scope mismatch, malformed plaintext,
provider-version mismatch or canonicalization mismatch fails closed before a
scientific PASS/FAIL result can exist.

## Secret Vault Authority Boundary

Public metadata persistence is not the secrecy boundary.

V1 does not accept any of the following as sufficient proof of holdout secrecy:

- RLS alone;
- a hidden UI control;
- an undocumented application convention;
- a database column that `service_role` can freely read;
- an object path protected only by the same ordinary research credential;
- "do not call this function" discipline;
- prompt instructions telling an AI not to inspect data.

The secret vault MUST use a dedicated secret-bearing capability that is absent
from ordinary research, optimizer, AI, Passport, RL-8, product API and UI
execution paths.

The vault credential MUST NOT be available to the ordinary
`investing_app` research runtime.

The standard Supabase `service_role` credential by itself is NOT an accepted
V1 vault-secrecy boundary.

The future implementation MUST prove capability separation at runtime, not only
through TypeScript visibility.

The secret-bearing vault adapter exposes no list/search/preview/statistics
surface to ordinary research code.

Before authorized reveal, ordinary code may receive only:

- registration identity;
- public seal identity;
- public commitment metadata;
- operational status that does not expose secret truth.

It MUST NOT receive:

- holdout plaintext or ciphertext;
- commitment salt;
- storage locator;
- decryption material;
- row count if not already pre-registered;
- min/max/mean/variance;
- last value;
- missingness profile;
- any derived metric;
- any learned embedding;
- any AI summary of hidden material.

## Ordinary Data Source Embargo

Vault secrecy is insufficient if the same holdout truth can be fetched through
an ordinary market-data/provider path.

Therefore V1 requires an internal holdout embargo for the exact public
`holdoutScope`.

Before registration is admitted, the implementation MUST prove that the exact
holdout scope has not already been materialized into an ordinary research cache,
DatasetSeries/DatasetSnapshot relation, provider preview, AI context or optimizer
input accessible to the candidate's ordinary Research path.

Registration MUST NOT become authoritative until the embargo fence is durably
active. From the perspective of every ordinary Research resolver, authoritative
registration creation and embargo activation are atomic: there is no admitted
interval in which registration exists but overlapping ordinary reads are still
allowed.

After registration and before reveal, all Syntrake-controlled ordinary research
resolvers MUST reject an ordinary data request when canonical market ids
intersect, canonical field ids intersect and the requested coverage interval
overlaps the embargoed interval. This deny rule applies regardless of requested
frequency and across all provider adapters that map to the same canonical market
facts. Unknown or ambiguous provider-field mapping fails closed.

Vault ingestion uses the dedicated vault capability, not the ordinary Research
data-resolver credential.

The implementation MUST maintain append-only access evidence sufficient to prove
that no Syntrake-controlled pre-reveal ordinary read exposed the holdout.
"Absence from application logs" alone is not proof.

If prior exposure, embargo violation or access-audit completeness cannot be
proven, the Blind Truth attempt fails closed with no scientific PASS/FAIL.

RL-9 V1 proves secrecy only across Syntrake-controlled execution and data-access
paths. It does not claim to prove that a human user could not obtain the same
public market facts through an external system outside Syntrake.

## Anti-Leak Logging And Prompt Boundary

Before authorized reveal, secret holdout material MUST NOT be emitted to:

- application logs;
- SQL logs through literal payload interpolation;
- tracing attributes;
- analytics events;
- error messages;
- exception payloads;
- cache keys;
- telemetry;
- AI prompts;
- model tool inputs;
- optimizer callbacks;
- debugging dumps;
- snapshots or test fixtures committed to Git.

Error reporting uses closed reason codes only.

No free-form error may include secret bytes.

## Confidential Anti-Reuse Index

A salted public commitment alone does not prevent the same plaintext from being
resealed under a new salt.

Therefore the secret vault maintains a confidential anti-reuse fingerprint:

```text
HMAC-SHA-256(
  vault_reuse_key,
  "SYNTRAKE:BLIND_TRUTH_REUSE_FINGERPRINT:V1\n"
  + exact_canonical_holdout_plaintext_bytes
)
```

The HMAC key and fingerprint are operational secret-vault data, not scientific
identity and MUST NOT appear in public canonical payloads.

Vault reuse-key rotation MUST preserve historical duplicate detection. Before an
old reuse key can be retired, the confidential index must be re-keyed or another
equivalent proof must preserve comparison against every prior sealed plaintext.
If that continuity cannot be proven, new sealing fails closed.

A plaintext holdout already sealed for another V1 registration is rejected.

If the confidential anti-reuse index cannot be queried or its integrity cannot
be proven, sealing fails closed.

This prevents trivial "same holdout, new salt" retries.

## One-Shot Evaluation Identity

After registration and seal, but before secret material is opened, the system
creates exactly one immutable
`BLIND_TRUTH_EVALUATION_V1` identity.

It binds:

```text
schemaVersion
protocol
registration
vaultSeal
evaluatorProfile
```

The evaluation identity contains no holdout plaintext and no secret vault
locator.

The evaluation's `evaluatorProfile` MUST equal the exact profile frozen by the
registration; it cannot introduce a new engine, registry or behavior version.

One registration + one vault seal has exactly one authoritative evaluation
identity.

Concurrent identical arm requests reuse the identity.

Any divergent second evaluation identity for the same registration/seal fails
closed.

## Reveal Claim Before Secret Read

The one-shot property MUST survive concurrency and process failure.

The implementation MUST persist an append-only
`REVEAL_STARTED` event for the exact evaluation identity before the vault
authority is allowed to open secret material.

The reveal claim is the point of no return.

After one accepted `REVEAL_STARTED` event exists:

- no second reveal may open the vault;
- no retry may consume the secret again;
- changing an idempotency key does not create another attempt;
- changing a caller or worker does not create another attempt;
- a process crash does not restore eligibility for another reveal.

If the worker crashes after `REVEAL_STARTED` and before a final result is
persisted, the evaluation remains consumed and fail-closed.

The system MUST NOT infer from elapsed time that the secret was never observed.

A consumed attempt with no final event projects
`REVEAL_CONSUMED_RESULT_UNAVAILABLE`.

That state is an integrity outcome, not a scientific FAIL.

## Reveal / Result Event Chain

RL-9 uses one append-only reveal/result event scientific domain.

Admitted event states are exactly:

```text
REVEAL_STARTED
REVEAL_COMPLETED
REVEAL_FAILED_CLOSED
```

Admitted transitions are exactly:

```text
<none> -> REVEAL_STARTED
REVEAL_STARTED -> REVEAL_COMPLETED
REVEAL_STARTED -> REVEAL_FAILED_CLOSED
```

All other transitions are forbidden.

`REVEAL_STARTED` is immutable.

`REVEAL_COMPLETED` and `REVEAL_FAILED_CLOSED` are terminal in V1.

There is exactly one root `REVEAL_STARTED` event for one evaluation identity
and at most one final successor.

If a predecessor has more than one final successor, reconstruction fails closed
and no authoritative Blind Truth result is projected.

Wall-clock order never chooses a winner.

## Reveal Verification

After `REVEAL_STARTED` is durably persisted, the dedicated vault authority may
open the secret exactly once.

Before evaluation:

1. verify the 32-byte secret salt shape;
2. verify declared plaintext byte length;
3. recompute public commitment;
4. canonicalize holdout material;
5. prove exact provider/version/market/frequency/field/window scope;
6. prove no unexpected observations outside the frozen window;
7. prove every required field exists under the frozen material contract;
8. prove evaluator profile and dependency versions match registration;
9. prove the evaluation identity is the unique accepted identity;
10. prove no final reveal/result event already exists.

Any failure emits only `REVEAL_FAILED_CLOSED` with closed reason codes where a
safe final event can be appended.

A failure MUST NOT silently fall back to ordinary research data.

## Post-Reveal Dataset Identity

Only after successful commitment verification may the revealed plaintext be
canonicalized into existing accepted DatasetSeries / DatasetSnapshot scientific
identities.

No new RL-9 replacement domain is created for DatasetSeries or DatasetSnapshot.

A successful reveal result may bind exact:

```text
revealedDatasetSeries: HashRef<SYNTRAKE:DATASET_SERIES:V1>[]
revealedDatasetSnapshot: HashRef<SYNTRAKE:DATASET_SNAPSHOT:V1>
```

Those refs do not exist as authoritative revealed-holdout evidence before the
commitment is verified.

The raw vault locator, salt and encryption material never become Dataset
scientific identity.

## Deterministic Evaluation Result

A completed one-shot evaluation produces one closed
`BLIND_TRUTH_RESULT_V1` payload inside the terminal event.

It binds:

```text
registration
vaultSeal
evaluation
revealedDatasetSnapshot
revealedDatasetSeries
observedMetricResults
criterionOutcomes
overallOutcome
```

`overallOutcome` is exactly one of:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
```

Integrity/authority failures are not converted into these scientific outcomes.
They produce `REVEAL_FAILED_CLOSED`.

The evaluator MUST use the frozen metric set, execution configuration,
parameters and thresholds.

It MUST NOT optimize, refit, search, select a best variant, choose a new
threshold or add a metric using revealed holdout truth.

Observed metric ordering is deterministic.

Criterion ordering is deterministic.

No undocumented composite score may decide the result.

## Closed Integrity Reasons

V1 fail-closed reason vocabulary includes exactly:

```text
AUTHORITY_FAILURE
WRONG_TENANT
WRONG_INVESTIGATION
WRONG_SUBJECT
WRONG_PROMOTION_STATE
SUPERSEDED_PROMOTION_AUTHORITY
DIVERGENT_EXISTING_IDENTITY
REGISTRATION_ALREADY_EXISTS
VAULT_SEAL_ALREADY_EXISTS
EVALUATION_ALREADY_EXISTS
REVEAL_ALREADY_STARTED
FINAL_EVENT_ALREADY_EXISTS
MISSING_VAULT_CAPABILITY
VAULT_UNAVAILABLE
ANTI_REUSE_INDEX_UNAVAILABLE
ANTI_REUSE_KEY_ROTATION_INCOMPLETE
HOLDOUT_REUSE_DETECTED
HOLDOUT_ALREADY_EXPOSED
EMBARGO_VIOLATION
ACCESS_AUDIT_UNAVAILABLE
MALFORMED_COMMITMENT
COMMITMENT_MISMATCH
PLAINTEXT_LENGTH_MISMATCH
HOLDOUT_SCOPE_MISMATCH
PROVIDER_VERSION_MISMATCH
MALFORMED_HOLDOUT
INCOMPATIBLE_ENGINE_VERSION
INCOMPATIBLE_METRIC_REGISTRY
INCOMPATIBLE_CRITERIA
WRONG_HASHREF_DOMAIN
MALFORMED_HASHREF
AMBIGUOUS_EVENT_CHAIN
```

No free-form string carries scientific authority.

Implementation may expose an operational diagnostic correlation id separately,
but the scientific reason code remains closed.

## Frozen Future Scientific Domains

RL-9 freezes exactly five future canonical domains:

```text
SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1
SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1
SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1
SYNTRAKE:BLIND_TRUTH_EVALUATION:V1
SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1
```

All five are:

`DESIGN_FROZEN / NOT_RUNTIME_ADMITTED`

in this design slice.

This design does not modify `HashDomainV1`, canonical hash admission, runtime
serializers or public hash helpers.

No sixth RL-9 scientific domain is admitted in V1.

Secret vault storage identities, object locators, salts, keys, HMAC reuse
fingerprints, worker ids, leases and timestamps are
`NON_SCIENTIFIC_OPERATIONAL`.

## Canonical Payload Shapes

### Protocol

```text
BLIND_TRUTH_PROTOCOL_V1 = {
  schemaVersion,
  protocolId,
  commitmentAlgorithm,
  commitmentDomain,
  reuseFingerprintAlgorithm,
  evaluatorBehaviorVersion,
  allowedOutcomeVocabulary,
  eventStateVocabulary,
  reasonVocabulary
}
```

### Registration

```text
BLIND_TRUTH_REGISTRATION_V1 = {
  schemaVersion,
  protocol,
  subjectExperiment,
  subjectExperimentParameters,
  subjectResearchIr,
  promotionProtocol,
  promotionTransition,
  hypothesis,
  metricRequestSet,
  executionConfig,
  blindTruthCriteria,
  holdoutScope,
  evaluatorProfile
}
```

### Vault Seal

```text
BLIND_TRUTH_VAULT_SEAL_V1 = {
  schemaVersion,
  protocol,
  registration,
  holdoutScopeDigest,
  commitmentAlgorithm,
  commitmentHash,
  declaredPlaintextByteLength,
  vaultFormatVersion
}
```

### Evaluation

```text
BLIND_TRUTH_EVALUATION_V1 = {
  schemaVersion,
  protocol,
  registration,
  vaultSeal,
  evaluatorProfile
}
```

### Reveal / Result Event

```text
BLIND_TRUTH_REVEAL_RESULT_EVENT_V1 = {
  schemaVersion,
  protocol,
  registration,
  vaultSeal,
  evaluation,
  predecessorEvent,
  eventState,
  reason,
  result
}
```

For `REVEAL_STARTED`:

- `predecessorEvent = null`;
- `reason = null`;
- `result = null`.

For `REVEAL_COMPLETED`:

- predecessor is the exact `REVEAL_STARTED` HashRef;
- `reason = null`;
- `result` is exact `BLIND_TRUTH_RESULT_V1`.

For `REVEAL_FAILED_CLOSED`:

- predecessor is the exact `REVEAL_STARTED` HashRef;
- `reason` is one closed integrity reason;
- `result = null`.

No extra keys are admitted.

## Hash Preimage Law

Future admitted hashes MUST use the established Genesis domain-separated
canonical JSON law:

```text
UTF8(domain)
+ UTF8("\n")
+ canonical_json(owner_payload)
```

The public holdout commitment is separate from scientific object hashing.

Commitment bytes are never treated as a substitute for a scientific HashRef.

Scientific hashing and secret-vault encryption are separate concerns.

## Persistence Contract

This design slice writes no SQL.

Future persistence MUST provide append-only scientific identity relations for
the five RL-9 domains and MUST preserve exact tenant / Investigation / subject
authority.

At minimum future persistence must prove:

- RLS + FORCE RLS on RL-9 public metadata relations;
- no UPDATE/DELETE authority for scientific identities/events;
- exact database hash recomputation;
- exactly one registration per logical candidate key;
- exactly one seal per registration;
- exactly one evaluation per registration/seal;
- exactly one `REVEAL_STARTED` per evaluation;
- at most one final successor;
- atomic claim-before-secret-read ordering;
- deterministic identical replay;
- divergent replay fails closed;
- no PUBLIC / anon / authenticated / service_role mutation authority;
- minimum `investing_app` surface only through accepted narrow writers;
- a dedicated RL-9 writer role must not grant ordinary code secret vault access.

Secret holdout bytes are not stored in these public metadata relations.

## Required Secret-Vault Implementation Evidence

A later implementation cannot be accepted on unit tests alone.

Acceptance must prove with real integration evidence:

- ordinary research credentials cannot fetch secret holdout material;
- ordinary provider/data-resolver paths reject the embargoed holdout scope;
- pre-reveal access evidence proves no prior Syntrake-controlled exposure;
- `service_role` alone cannot fetch secret holdout material;
- the dedicated reveal worker can open exactly the authorized sealed object;
- wrong tenant / Investigation / registration / evaluation cannot open it;
- public seal commitment verifies after authorized reveal;
- wrong bytes fail commitment verification;
- same plaintext reseal is rejected by the confidential anti-reuse index;
- concurrent reveal attempts yield exactly one accepted `REVEAL_STARTED`;
- after `REVEAL_STARTED`, a second secret read is impossible;
- a crash after reveal claim cannot create a second attempt;
- logs/traces/prompts contain no secret holdout truth before reveal;
- PostgreSQL 17 persistence rehearsal passes;
- managed Supabase preview/rehearsal passes before Production;
- Production mutation requires separate explicit authorization.

## Passport And Evidence Ledger Projection

RL-9 extends future Passport projection without making Passport scientific
authority.

Before reveal, Passport may expose only:

```text
blindTruth.availability
registration HashRef
vaultSeal HashRef
evaluation HashRef | null
state = REGISTERED | SEALED | EVALUATION_ARMED | REVEAL_STARTED
public commitment metadata
```

It MUST NOT expose secret material, secret salt, storage locator, key material or
derived holdout statistics.

After a completed final event, Passport may expose:

```text
latestEvent HashRef
state = REVEAL_COMPLETED | REVEAL_FAILED_CLOSED | REVEAL_CONSUMED_RESULT_UNAVAILABLE
overallOutcome = PASS | FAIL | INSUFFICIENT_EVIDENCE | null
revealed DatasetSeries/DatasetSnapshot HashRefs when present
```

Evidence Ledger records immutable references/events and does not create a
duplicate Blind Truth scientific identity.

## AI And Optimizer Boundary

No AI, LLM, optimizer, hyperparameter search, variant generator, RL-7 comparator
or RL-8 promotion evaluator may receive hidden holdout truth before authorized
reveal.

This includes indirect leakage through:

- features computed from the holdout;
- embeddings;
- aggregate statistics;
- model-generated summaries;
- sample rows;
- charts;
- anomaly counts;
- missing-data diagnostics;
- provider previews.

The only pre-reveal information available to those paths is the public
pre-registration and seal metadata explicitly frozen above.

After reveal, a later product policy may decide what revealed evidence is shown
to a user or AI, but that policy cannot rewrite the historical one-shot
integrity record.

## Recovery And Failure Semantics

Fail-open recovery is forbidden.

If secrecy or integrity cannot be proven:

- no scientific PASS/FAIL is emitted;
- no alternative ordinary dataset is substituted;
- no threshold is relaxed;
- no second holdout attempt is created for the same candidate;
- the system records an allowed fail-closed event when safe;
- otherwise the consumed evaluation remains
  `REVEAL_CONSUMED_RESULT_UNAVAILABLE`.

RL-10 may later orchestrate retries of operations that are semantically
retryable. RL-10 MUST NOT make a consumed Blind Truth reveal retryable.

## Explicit Out Of Scope

RL-9 excludes:

- automatic capital allocation;
- investment recommendation;
- user suitability;
- portfolio construction;
- Paper positions/cash/orders/fills;
- Live/broker execution;
- Capital Kernel authority;
- autonomous parameter optimization on holdout truth;
- repeated holdout testing of one exact candidate;
- multiple-comparison correction across a user-created sequence of separately
  changed candidates;
- product UI;
- public API;
- RL-10 headless orchestration implementation;
- RL-11 full I5 closure;
- Trading research runtime.

A one-shot holdout PASS is evidence, not proof of future profitability.

## Design Acceptance Gates

Before this design can become current accepted design authority, independent
review must prove:

1. the pre-registration payload freezes hypothesis, exact candidate and exact
   test configuration;
2. markets/timeframe/fields/parameters/metrics/threshold identity is exact;
3. public commitment leaks no hidden truth;
4. secret vault capability is separated from ordinary research credentials;
5. ordinary Syntrake data/provider paths enforce the holdout embargo;
6. complete pre-reveal access evidence proves no earlier internal exposure;
7. `service_role` alone is insufficient to reveal the holdout;
8. same-candidate retest is impossible even after a promotion-protocol change;
9. same-plaintext reseal is blocked by confidential anti-reuse control;
10. reveal claim is durable before secret read;
11. a crash after claim cannot produce a second attempt;
12. event history is append-only and reconstructable;
13. integrity failures cannot become scientific FAIL/PASS;
14. five and only five RL-9 scientific domains are frozen;
15. no runtime hash-domain admission occurs in this design slice;
16. no SQL, Supabase or Production mutation occurs;
17. downstream Paper/Live/Core boundaries remain unchanged.

## Implementation Sequence After Design Acceptance

If this design is accepted, implementation should proceed in narrow slices:

```text
RL-9A canonical runtime + closed registration/seal/evaluation/event payloads
-> RL-9B public metadata persistence + authority + one-shot event constraints
-> RL-9C dedicated secret vault adapter + anti-reuse boundary
-> RL-9D one-shot reveal/evaluator integration + real failure/concurrency tests
-> RL-9E managed-Supabase preview + Production gate + canonical acceptance sync
```

A later implementation slice may refine file/module names, but MUST NOT weaken
the frozen authority, one-shot, secrecy, anti-reuse or fail-closed semantics
without a separately reviewed design amendment.

## Final Design-Slice Classification

`RL-9 BLIND TRUTH / EVIDENCE VAULT V1 DESIGN = CANDIDATE / NOT ACCEPTED`

`RUNTIME = NOT IMPLEMENTED BY THIS SLICE`

`SUPABASE = UNCHANGED`

`PRODUCTION = UNCHANGED`
