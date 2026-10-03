# I5 RL-8 Scientific Promotion State Machine V1 Design Freeze

Status: CANDIDATE DESIGN FREEZE - RL-8 SCIENTIFIC PROMOTION STATE MACHINE V1 - UNNUMBERED

Classification:
`CANDIDATE / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`0981a2a7a346051d9ccec55609c37df3885dbe56`

Historical lineage only (not acceptance authority):

- PR #106; historical design merge `b3f48e3f55a1f0c41004c60a3119fbd2cb7f84f0`.
- Historical design predecessor `05b4192557e8e2c22f63769774a1ca2985199e62`.
- Historical candidate HEAD `31bb982b17a999fe67613c7a9251218f697e9150`.
- PR #106 merge is not RL-8 acceptance. This recovery is CANDIDATE / NOT ACCEPTED.

Current accepted predecessor authority:
`RL-7 = CURRENT_ACCEPTED / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED`

Research Lab frontier:
`I5 RESEARCH LAB = IN_PROGRESS / RL-8_TO_RL-11 / PRODUCT_UI_DEFERRED`.
Canonical current state is unchanged by this local candidate.

RL-8 acceptance:
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

RL-8 freezes a deterministic scientific promotion-state protocol that answers only:

```text
What is the current scientific promotion state of this accepted research
candidate, based on immutable accepted scientific evidence?
```

It does not answer whether capital should be allocated, whether a strategy
should be traded, whether a strategy is suitable for a user, or whether Paper
or Live execution should occur.

`PROMOTION_ELIGIBLE` is scientific governance evidence only. It is not an
investment recommendation, suitability conclusion, Paper authorization, capital
authorization, Live authorization, broker instruction, portfolio mutation or
Capital Kernel approval.

RL-8 consumes accepted Investing Genesis scientific authorities only. It MUST
NOT import from or depend on `lib/trading/**`.

## Promotion Subject

The V1 promotion subject is one exact scientific research candidate:

```text
SCIENTIFIC_PROMOTION_SUBJECT_V1 = {
  subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>,
  subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>
}
```

These three exact HashRefs are the stable scientific identity across the chain.
Tenant authority and Investigation UUID are server-derived authority scope,
not scientific replacement identity. No execution, validation, metric or RL-7
artifact is required merely to identify a DRAFT_RESEARCH subject.

## Transition-Specific Evidence Snapshot

The exact nested structure inside SCIENTIFIC_PROMOTION_TRANSITION_V1 is:

```text
evidenceSnapshot = {
  runInput: HashRef<SYNTRAKE:RUN_INPUT:V1> | null,
  result: HashRef<SYNTRAKE:RESULT:V1> | null,
  evidenceObject: HashRef<SYNTRAKE:EVIDENCE_OBJECT:V1> | null,
  validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1> | null,
  validationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1> | null,
  metricResultSet: HashRef<METRIC_RESULT_SET_V2> | null,
  robustnessComparisonProtocol: HashRef<SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1> | null,
  robustnessComparisonResult: HashRef<SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1> | null
}
```

Every key is required; absence is explicit null, never omitted/undefined.
This transition-specific accepted evidence snapshot is part of the transition
canonical preimage, not a third scientific HashRef domain or subject identity.
Missing evidence NEVER becomes zero/PASS/fabricated identity.
All non-null references must resolve to accepted artifacts with exact domains,
canonical bytes and compatible subject/result lineage in the authority scope.
A validationResult requires its exact validationProtocol; a comparison result
requires its exact robustnessComparisonProtocol. Protocols may exist without
results. RL-7 subjectResult and subjectValidationResult must match this snapshot.
Unavailable artifacts are null, not invented HashRefs; known corrupt or
unauthorized evidence fails closed rather than being laundered into absence.

Exact presence rules by resulting state (R = required non-null; N = null;
O = accepted HashRef or explicit null; COPY = exact predecessor snapshot):

| resultingState | runInput | result | evidenceObject | validationProtocol | validationResult | metricResultSet | robustnessComparisonProtocol | robustnessComparisonResult |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DRAFT_RESEARCH | N | N | N | N | N | N | N | N |
| EXECUTED | R | R | O | O | O | O | O | O |
| INSUFFICIENT_EVIDENCE | R | R | O | O | O | O | O | O |
| VALIDATION_FAILED | R | R | R | R | R | R | R | R |
| VALIDATION_PASSED | R | R | R | R | R | R | R | R |
| PROMOTION_ELIGIBLE | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| REJECTED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| INVALIDATED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| SUPERSEDED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |

DRAFT_RESEARCH is only an upstream observation; it is never a resulting RL-8
transition. Its row describes absence before execution, not a persisted root.
EXECUTED proves accepted runInput/result lineage without requiring later evidence.
Stage A retains the root's exact runInput/result, and may bind newly accepted
validation/metric/RL-7 evidence. INSUFFICIENT_EVIDENCE can have all references
present when accepted evidence is incomplete or RL-7 is MIXED/INSUFFICIENT.
Missing required evaluation evidence takes precedence over failure, hence both
VALIDATION_FAILED and VALIDATION_PASSED require the full snapshot.
Lifecycle COPY preserves historical evidence even when subsequently invalidated;
it does not recertify that evidence. Invalidation reasons describe the later
integrity discovery. Supersession replacement evidence belongs to the referenced
successor chain; it does not overwrite the old snapshot.

Operational UUIDs identify persisted rows and authority scope only. They are
not scientific identity and must not appear as replacement truth for HashRefs.
Tenant and Investigation authority are derived server-side from accepted
persistence.

## State Vocabulary

The closed V1 state vocabulary is exactly:

```text
DRAFT_RESEARCH
EXECUTED
INSUFFICIENT_EVIDENCE
VALIDATION_FAILED
VALIDATION_PASSED
PROMOTION_ELIGIBLE
REJECTED
SUPERSEDED
INVALIDATED
```

`DRAFT_RESEARCH` and `EXECUTED` are admissible observed predecessor states.
They may be projected from accepted upstream research history but are not by
themselves promotion success.

`INSUFFICIENT_EVIDENCE`, `VALIDATION_FAILED` and `VALIDATION_PASSED` are
deterministic Stage A evaluation outcome states. `PROMOTION_ELIGIBLE` is the
separate deterministic Stage B materialization state.

`REJECTED`, `SUPERSEDED` and `INVALIDATED` are append-only governance states.
They do not delete, mutate or rewrite earlier scientific truth.

RL-8 distinguishes:

```text
evaluation outcome/state = deterministic gate result for one protocol run
governance/lifecycle state = append-only lifecycle marker over accepted history
immutable historical transition = canonical transition artifact that never mutates
active/current projection = deterministic read model reconstructed from history
truly terminal state = state with no admitted outgoing transition
```

V1 has no truly terminal state token in the state vocabulary. The design freeze
therefore uses the explicit terminal marker:

```text
NO_TERMINAL_STATE_IN_V1
```

A state MUST NOT be described as terminal if an admitted outgoing transition
exists. `PROMOTION_ELIGIBLE`, `REJECTED` and `INVALIDATED` are non-terminal
historical states because the V1 graph admits outgoing transitions from them.
`SUPERSEDED` has no outgoing transition in the V1 graph and is an inactive
lifecycle endpoint for one chain, but it is not called a terminal state token
because a later V2 graph may define a successor without mutating V1 history.

One promotion chain key is deterministically knowable before the first
transition is created and is identified by:

```text
tenant authority
Investigation UUID
subject Experiment HashRef
subject ExperimentParameters HashRef
subject Research IR HashRef
protocol HashRef
```

The root transition HashRef is not part of the pre-root promotion chain key. It
is the immutable first accepted transition anchoring history for that already
determined chain key and has `predecessorState = DRAFT_RESEARCH`. One chain key can have
exactly one authoritative root transition. Concurrent identical root creation
reuses the same root transition identity. Concurrent or divergent root creation
for the same chain key fails closed with `DIVERGENT_EXISTING_IDENTITY`.
Supersession or invalidation caused by new evidence under the same protocol
occurs inside the same chain through an explicit successor transition. A
methodology/protocol change creates a new promotion chain with a different
protocol HashRef; the old chain is linked to the exact accepted successor chain
by an explicit `SUPERSEDED` transition that preserves the old chain's
historical truth.

Cross-chain methodology/protocol supersession is represented canonically inside
the superseding `SCIENTIFIC_PROMOTION_TRANSITION_V1` artifact and does not
introduce a third RL-8 scientific HashRef domain. The transition contains a
`supersededByChain` value that references both:

```text
successor protocol HashRef
successor root transition HashRef
```

The referenced successor root transition MUST actually be a root transition
with `predecessorState = DRAFT_RESEARCH`, `resultingState = EXECUTED` and
`predecessorTransition = null`. The
successor chain MUST be in the same tenant authority, same Investigation and
same scientific subject lineage, but MUST have a different protocol HashRef
when supersession is caused by methodology/protocol change. Dangling successor
chain references, self-reference, self-supersession and supersession cycles are
forbidden and fail closed.
`supersededByChain.successorRootTransition` MUST identify the unique accepted
root belonging to the exact successor promotion chain key/protocol.

## Transition Graph

The only admitted V1 transitions are:

```text
DRAFT_RESEARCH -> EXECUTED
EXECUTED -> INSUFFICIENT_EVIDENCE
EXECUTED -> VALIDATION_FAILED
EXECUTED -> VALIDATION_PASSED
INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE
INSUFFICIENT_EVIDENCE -> VALIDATION_FAILED
INSUFFICIENT_EVIDENCE -> VALIDATION_PASSED
VALIDATION_FAILED -> REJECTED
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
PROMOTION_ELIGIBLE -> SUPERSEDED
PROMOTION_ELIGIBLE -> INVALIDATED
REJECTED -> SUPERSEDED
INVALIDATED -> SUPERSEDED
```

All other transitions are forbidden and fail closed with
`FORBIDDEN_TRANSITION`.

Retry semantics are idempotent for identical protocol, subject, predecessor
state, predecessor transition and evidence payload. Identical payload reuse
returns the same scientific transition identity. A divergent payload for the
same logical transition is `DIVERGENT_EXISTING_IDENTITY`.

Regression is not mutation. If later accepted evidence changes the scientific
answer, the previous transition remains immutable and a successor transition
records `SUPERSEDED` or `INVALIDATED`. Historical `PROMOTION_ELIGIBLE` remains
immutable evidence even when it is no longer the active/current projection.

## Promotion Eligibility Gates

The only admitted V1 protocol token is:

`SCIENTIFIC_PROMOTION_PROTOCOL_V20261002`

The earlier dated candidate rules were never accepted runtime authority; no
migration or runtime depends on that historical token.

`PROMOTION_ELIGIBLE` is reachable only when every required gate below returns
`PASS`:

```text
GATE_AUTHORITY_AND_TENANCY
GATE_SUBJECT_IDENTITY
GATE_ACCEPTED_EXECUTION_RESULT
GATE_EVIDENCE_OBJECT_BINDING
GATE_VALIDATION_RESULT
GATE_METRIC_RESULT_SET_V2
GATE_RL7_ROBUSTNESS_COMPARISON
GATE_LINEAGE_INTEGRITY
GATE_PROTOCOL_COMPATIBILITY
GATE_EVIDENCE_COMPLETENESS
```

RL-7 evidence is mandatory in V1 for successful Stage A evaluation, not root creation. The required RL-7 result must be an accepted
`SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` HashRef produced under an accepted
`SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` HashRef for the same tenant,
Investigation and subject Experiment.

Accepted Validation Result evidence is mandatory for successful Stage A evaluation. A failed validation gate
produces `VALIDATION_FAILED`; missing, incomplete or unavailable validation
produces `INSUFFICIENT_EVIDENCE`; corrupt or incompatible validation fails
closed.

The Metric Result Set must be `METRIC_RESULT_SET_V2` under
`METRIC_REGISTRY_V20260927`. Missing metric evidence, unknown metric version or
incompatible artifact schema cannot become zero or PASS.

## RL-7 Consumption Semantics

RL-8 consumes RL-7 classifications exactly. It does not recompute robustness,
reinterpret numerical robustness evidence or run a second robustness engine.

```text
ROBUSTNESS_STABLE -> permits further promotion evaluation
ROBUSTNESS_MIXED -> INSUFFICIENT_EVIDENCE
ROBUSTNESS_DEGRADED -> VALIDATION_FAILED
ROBUSTNESS_UNSTABLE -> VALIDATION_FAILED
ROBUSTNESS_INSUFFICIENT_EVIDENCE -> INSUFFICIENT_EVIDENCE
null classification with fail-closed failure -> fail closed
unknown classification -> fail closed
```

RL-8 may project RL-7 diagnostics into gate reasons, but the scientific
authority for robustness remains the accepted RL-7 comparison result.

## Gate Outcomes And Reasons

The closed gate status vocabulary is exactly:

```text
PASS
FAIL
INSUFFICIENT_EVIDENCE
INCOMPATIBLE_EVIDENCE
UNAVAILABLE
```

The closed reason/error vocabulary is exactly:

```text
MISSING_SUBJECT
MISSING_RESULT
MISSING_EVIDENCE_OBJECT
MISSING_VALIDATION_RESULT
MISSING_METRIC_RESULT_SET
MISSING_RL7_COMPARISON
INCOMPLETE_VALIDATION
INSUFFICIENT_RL7_EVIDENCE
FAILED_VALIDATION
FAILED_ROBUSTNESS_GATE
INCOMPATIBLE_SCHEMA_VERSION
INCOMPATIBLE_PROTOCOL_VERSION
INCOMPATIBLE_METRIC_REGISTRY
INCOMPATIBLE_ENGINE_VERSION
INCOMPATIBLE_ARTIFACT_SCHEMA
WRONG_LINEAGE
WRONG_TENANT
WRONG_INVESTIGATION
WRONG_HASHREF_DOMAIN
MALFORMED_HASHREF
MALFORMED_PROTOCOL
MALFORMED_TRANSITION
FORBIDDEN_TRANSITION
DIVERGENT_EXISTING_IDENTITY
CORRUPTED_EVIDENCE
UNAUTHORIZED_EVIDENCE
AUTHORITY_FAILURE
SUPERSEDED_EVIDENCE
INVALIDATED_EVIDENCE
UNKNOWN_GATE
UNKNOWN_STATE
UNKNOWN_RL7_CLASSIFICATION
```

No free-form string carries scientific authority. Human-readable text may be
attached as non-authoritative explanatory metadata only if the authoritative
closed code is present.

## Decision Precedence

Stage A applies only from EXECUTED or INSUFFICIENT_EVIDENCE and derives exactly
one of INSUFFICIENT_EVIDENCE, VALIDATION_FAILED or VALIDATION_PASSED.
The V1 decision table is evaluated in this exact order:

```text
1. malformed protocol, malformed transition, unknown state, unknown gate,
   unknown RL-7 classification or null classification with fail-closed failure,
   wrong HashRef domain, corrupted evidence, authority failure, wrong tenant,
   wrong Investigation, wrong lineage, incompatible schema/protocol/engine/
   metric/artifact version, unauthorized evidence, divergent existing identity
   -> fail closed; no authoritative promotion state is produced

2. forbidden requested transition
   -> fail closed with FORBIDDEN_TRANSITION

3. missing required evidence, unavailable required predecessor evidence,
   incomplete validation, ROBUSTNESS_MIXED,
   ROBUSTNESS_INSUFFICIENT_EVIDENCE, superseded evidence or invalidated evidence
   -> INSUFFICIENT_EVIDENCE

4. accepted Validation Result explicitly fails or RL-7 classification is
   ROBUSTNESS_DEGRADED or ROBUSTNESS_UNSTABLE
   -> VALIDATION_FAILED

5. accepted Validation Result passes and RL-7 classification is
   ROBUSTNESS_STABLE, and every required gate is PASS
   -> VALIDATION_PASSED
```

Integrity, authority and lineage incompatibility dominate eligibility. Then
insufficient evidence (including RL-7 MIXED/INSUFFICIENT even if validation
failed). Then explicit failed scientific gates. Only after every
required gate returns `PASS` may `PROMOTION_ELIGIBLE` exist.

### Stage B - Promotion Eligibility Materialization

Only VALIDATION_PASSED -> PROMOTION_ELIGIBLE is admitted in Stage B.
The exact predecessor must prove every required V1 promotion gate PASS under
the same protocol and same evidence snapshot. Copy its gateOutcomes exactly;
transitionReasons is empty and supersedes, invalidates, rejectedTransition and
supersededByChain are null. No re-evaluation, new evidence or caller decision
may intervene. Non-root predecessorState always equals the exact predecessor's
resultingState. The two stages remain two distinct immutable scientific
transition artifacts even if later persisted atomically in one DB transaction.

## Canonical Identity Domains

RL-8 freezes exactly two future canonical domains. They are DESIGN_FROZEN /
NOT_RUNTIME_ADMITTED in this slice:

```text
SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1
SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1
```

No third RL-8 scientific domain is admitted in V1. A mutable current-state
projection, if later implemented, is non-authoritative and has no scientific
HashRef domain.

Hash preimages are the accepted canonical bytes of the exact closed payloads,
domain-separated by the domain string. Required keys are exact. Unknown keys
are forbidden. Arrays are byte-sorted where specified. Undefined values are
forbidden. Null is admitted only where the payload explicitly says `null`.
Duplicate HashRefs, duplicate gate ids, duplicate states and duplicate reason
codes are rejected. Numeric values, if any appear in future evidence summaries,
must use the accepted canonical scientific numeric representation of the source
artifact and must not be rounded or reserialized by RL-8.

Operational UUIDs, tenant IDs, timestamps, labels, comments, markdown,
idempotency keys, UI wording and row IDs are excluded from scientific identity
unless explicitly listed as server-derived authority scope outside the
canonical scientific preimage.

## Scientific Promotion Protocol Payload

The canonical payload for `SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1` is exactly:

```text
{
  schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
  protocolId: "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002",
  requiredEvidenceClasses: [
    "EXECUTION_RESULT",
    "EVIDENCE_OBJECT",
    "VALIDATION_RESULT",
    "METRIC_RESULT_SET_V2",
    "RL7_EXPERIMENT_COMPARISON_RESULT"
  ],
  compatibleMetricRegistryVersion: "METRIC_REGISTRY_V20260927",
  requiredRl7PolicyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927",
  rl7Required: true,
  stateVocabulary: byte-sorted array of closed V1 states,
  gateVocabulary: byte-sorted array of closed V1 gate ids,
  gateStatusVocabulary: byte-sorted array of closed V1 gate statuses,
  reasonVocabulary: byte-sorted array of closed V1 reason/error codes,
  decisionPrecedence: exact ordered V1 decision table token list,
  transitionGraph: byte-sorted array of { from, to } pairs
}
```

No extra keys. This payload binds all methodological rules required to
reproduce promotion evaluation. It contains no UI wording and no mutable
`latest`, `default`, `current` or environment-selected alias.

## Transition Artifact Payload

The canonical payload for `SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1` is
exactly:

```text
{
  schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
  protocol: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1>,
  subject: SCIENTIFIC_PROMOTION_SUBJECT_V1,
  evidenceSnapshot: exact nested evidenceSnapshot structure defined above,
  predecessorState: closed V1 state,
  resultingState: closed V1 state,
  gateOutcomes: byte-sorted array of {
    gateId: closed V1 gate id,
    status: closed V1 gate status,
    reasons: byte-sorted unique array of closed V1 reason/error codes,
    evidence: byte-sorted array of admitted HashRef envelopes
  },
  transitionReasons: byte-sorted unique array of closed V1 reason/error codes,
  supersedes: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null,
  invalidates: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null,
  rejectedTransition:
    HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null,
  predecessorTransition:
    HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null,
  supersededByChain: {
    successorProtocol:
      HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1>,
    successorRootTransition:
      HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1>
  } | null
}
```

No extra keys. The root is exactly:

```text
predecessorTransition = null
predecessorState = DRAFT_RESEARCH
resultingState = EXECUTED
```

Only accepted upstream execution/result evidence can create this root.
Rootness never depends on wall-clock order or row insertion order.
Identical canonical root retry returns REUSED_IDENTICAL; a divergent second
root returns DIVERGENT_EXISTING_IDENTITY. predecessorState is never nullable.
DRAFT_RESEARCH as predecessor and null predecessorTransition occur together
only at this root. Every non-root transition requires exactly one
`predecessorTransition` in the same chain. `resultingState = PROMOTION_ELIGIBLE`
requires every required gate outcome to be `PASS`. `supersedes`, `invalidates`
and `rejectedTransition` may reference only immutable prior RL-8 transition
HashRefs for the same tenant, Investigation, subject lineage and promotion
chain. `supersededByChain` is null except when `resultingState = SUPERSEDED`
records cross-chain methodology/protocol replacement. In that case it is the
canonical immutable reference from the superseded old chain to the exact
successor chain. It belongs to `SCIENTIFIC_PROMOTION_TRANSITION_V1`, points to
an existing accepted successor protocol and successor root transition, and uses
only the two already frozen RL-8 domains:
`SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1` and
`SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1`.

The successor root transition MUST have `predecessorState = DRAFT_RESEARCH`,
`resultingState = EXECUTED` and `predecessorTransition = null`. It MUST share tenant authority, Investigation
UUID and scientific subject lineage with the old chain. Its protocol HashRef
MUST differ from the old chain's protocol HashRef when the supersession reason
is methodology/protocol change. It MUST NOT be the same transition as the
`SUPERSEDED` transition and MUST NOT be any transition in the old chain. The
successor root transition MUST be the unique accepted root for the exact
successor promotion chain key. The linked graph from old chain to successor
chain MUST be acyclic. Dangling successor-chain references, self-reference,
self-supersession, cycles, a successor root that is not actually a root, or a
successor root that does not belong to the exact successor chain key fail
closed with `DIVERGENT_EXISTING_IDENTITY`.

No mutable current-truth field may replace immutable transition history.

## Persistence Contract

This design slice writes no SQL. The later implementation must provide:

- append-only transition persistence;
- immutable accepted protocol and transition scientific identities;
- deterministic identical-payload reuse;
- deterministic divergent-payload conflict;
- concurrency equivalent to one accepted authoritative root transition for one
  promotion chain key;
- identical root retry reuses the same root transition identity;
- divergent root creation for the same promotion chain key fails closed with
  `DIVERGENT_EXISTING_IDENTITY`;
- concurrency equivalent to one accepted authoritative successor for one
  predecessor transition;
- logical root uniqueness by tenant authority, Investigation, exact scientific
  subject identity and protocol HashRef;
- logical non-root uniqueness by tenant authority, Investigation, exact
  scientific subject identity, protocol HashRef and predecessor transition HashRef;
- exact reuse for the same successor payload and fail-closed conflict for any
  second divergent authoritative successor to the same predecessor;
- server-derived tenant authority;
- same-Investigation enforcement;
- RLS and FORCE RLS;
- minimum grants to the accepted Investing application role only;
- no public, anon, authenticated or service-role mutation authority;
- no client authority injection;
- reconstruction of current state from immutable history by following the
  unique successor chain from root transition to the only leaf transition.
- uniqueness of cross-chain supersession linkage: one old chain may point to
  only one accepted successor chain/root transition;
- identical cross-chain linkage retry is idempotent;
- divergent cross-chain linkage for the same old chain fails closed with
  `DIVERGENT_EXISTING_IDENTITY`;
- no dangling successor-chain references, no self-reference, no
  self-supersession and no supersession cycles.

Successor uniqueness excludes resultingState. For one exact chain and exact
non-root predecessorTransition there is at most ONE authoritative successor,
regardless of resulting state. Identical canonical payload retry returns
REUSED_IDENTICAL. Any second different payload/state/reason/evidence snapshot
for that predecessor returns DIVERGENT_EXISTING_IDENTITY. These root and
successor invariants MUST later be enforceable at PostgreSQL level, not merely
in TypeScript; concurrent writers cannot admit two winners.

An optional current-state projection may exist only as a non-authoritative read
model. If projection and immutable transition history disagree, history wins
and the projection is corrupt evidence.

If one predecessor transition has zero successors, it is the active leaf for
that chain. If one predecessor transition has one successor, reconstruction
continues to that successor. If one predecessor transition has more than one
authoritative successor, the chain is corrupt and Passport/Evidence reads fail
closed with `DIVERGENT_EXISTING_IDENTITY`; no active/current state is projected.
If the active leaf is `SUPERSEDED` with a non-null `supersededByChain`,
cross-chain reconstruction continues to the referenced successor root transition
after validating rootness, same tenant, same Investigation, same subject
lineage, different successor protocol for methodology/protocol replacement and
acyclic linkage. If validation fails, no cross-chain active/current state is
projected.

## Passport Integration

Passport currently exposes:

```text
scientificPromotion.availability = DEFERRED_RL8
```

After RL-8 implementation, Passport replaces this with a projection over
accepted RL-8 transition history:

```text
scientificPromotion = {
  availability: "MATERIALIZED" | "UNAVAILABLE",
  protocol: HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1> | null,
  latestTransition:
    HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null,
  currentState: closed V1 state | null,
  transitions: ordered immutable transition projections,
  gateOutcomes: latest transition gate outcomes | [],
  evidence: exact HashRefs consumed by latest transition | []
}
```

Legacy or missing RL-8 evidence remains explicit as `UNAVAILABLE`; it is not
success and not failure by default. Corrupt RL-8 evidence fails closed. Passport
chooses `currentState` only by first resolving the unique accepted root
transition for the exact promotion chain key, then reconstructing the unique
successor chain from that root transition to leaf transition. It does not choose
by wall-clock time, row insertion order, mutable latest pointer or caller
preference. Missing root, multiple roots or divergent roots for one promotion
chain key fail closed with `DIVERGENT_EXISTING_IDENTITY`. Passport reports
scientific state/evidence only and does not become recommendation, Paper, Live,
capital or suitability authority.

For methodology/protocol supersession, Passport first reconstructs the old
chain to its active leaf. If that leaf is a `SUPERSEDED` transition with
`supersededByChain`, Passport follows only that immutable reference to the exact
successor root transition and then reconstructs the successor chain from root to
leaf. It validates that `supersededByChain.successorRootTransition` is the
unique accepted root for the exact successor promotion chain key/protocol. It
must not infer a successor chain from timestamps, insertion order, mutable
latest pointers, protocol aliases or caller preference. Multiple divergent
successor-chain references for one old chain, dangling references, non-root
successor references, self-reference, self-supersession, cycles or successor
root/key mismatch all fail closed; historical transitions remain immutable
evidence.

## Evidence Ledger Integration

RL-8 transitions are represented in the Evidence Ledger as accepted scientific
events that reference the immutable protocol and transition HashRefs. The
Ledger does not create duplicate scientific truth and does not mint a competing
promotion decision.

Owner/write authority remains the future RL-8 persistence writer. Ledger and
Passport read/projection authority remains downstream of immutable RL-8
transition records. Absence remains explicit.

## Supersession, Rejection And Invalidation

Historical scientific decisions remain immutable.

New experiment evidence, validation rerun, Metric Registry version change,
or RL-7 comparison rerun under the same protocol creates an explicit successor
transition inside the same promotion chain. A promotion methodology/protocol
change creates a new promotion chain because the protocol HashRef changes. The
old chain is explicitly linked to the new chain by a `SUPERSEDED` successor
transition in the old chain whose `supersededByChain` points to the exact
successor protocol and successor root transition. It does not silently rewrite
an old `PROMOTION_ELIGIBLE` result.

`REJECTED` is deterministic scientific lifecycle closure for failed scientific
validation only: VALIDATION_FAILED -> REJECTED. It copies the failed
predecessor snapshot and gate outcomes; rejectedTransition identifies that exact
predecessor. A user, adviser or downstream product choosing not to use an
eligible result is outside RL-8 and must not alter scientific truth.
`SUPERSEDED` records replacement by newer accepted evidence or methodology.
`INVALIDATED` records later discovery that accepted evidence was corrupt,
unauthorized or incompatible. All three states remain append-only and
reconstructable.

## Determinism

Identical canonical inputs plus identical protocol produce identical canonical
scientific output bytes and HashRefs.

RL-8 admits no current wall-clock time as scientific input, random numbers, AI
judgment, LLM judgment, environment-dependent classification, hidden mutable
configuration, mutable process-global scientific state, provider call, network
call, filesystem call, locale ordering, floating-point authority where exact
canonical predecessor evidence exists, or mutable `current`/`latest`/`default`
methodology alias.

## Tenancy And Authority

Tenant authority, membership and principal authorization are derived by the
accepted Investing authority architecture. Authenticated identity is not
ownership. `service_role` is capability, not authorization.

Cross-tenant, cross-account, wrong-Investigation, wrong-domain HashRef and
unauthorized evidence are rejected before promotion eligibility is evaluated.
Client IDs never prove tenant/Investigation authority.
RL-8 does not invent a second tenant model.

## Explicit Non-Authority

RL-8 MUST NOT authorize:

- investment recommendation;
- suitability;
- portfolio allocation;
- portfolio mutation;
- Paper order creation;
- Paper execution;
- Live order creation;
- Live execution;
- broker interaction;
- cash mutation;
- position mutation;
- financial accounting;
- P&L accounting;
- broker accounting;
- Capital Kernel approval;
- Decision Firewall bypass;
- UI product claims.

```text
PROMOTION_ELIGIBLE != investment recommendation
PROMOTION_ELIGIBLE != suitability
PROMOTION_ELIGIBLE != APPLY NEW CAPITAL
PROMOTION_ELIGIBLE != Paper authorization
PROMOTION_ELIGIBLE != Live authorization
PROMOTION_ELIGIBLE != broker instruction
PROMOTION_ELIGIBLE != Capital Kernel authority
```

Any downstream consumer must treat `PROMOTION_ELIGIBLE` only as scientific
evidence.

## Explicit Out Of Scope

RL-8 excludes Blind Truth / Evidence Vault implementation, secret holdout
execution, RL-9, RL-10 orchestration, RL-11 backend closure, Paper
authorization, Live authorization, financial accounting, P&L accounting, broker
accounting, portfolio construction, optimization, recommendation, suitability,
Capital Kernel authority, Product API, UI redesign and Trading research
runtime.

Boundaries preserved:

```text
CORE != LAB
LAB != PAPER
INVESTING != TRADING
```

## Design Candidate Evidence

This is a candidate design freeze only. It is not self-accepted.

Runtime changed:
`NO`

Migration changed:
`NO`

Production mutation:
`NONE`

PG17:
`NOT REQUIRED / DESIGN-ONLY`

PR:
`NOT CREATED BY THIS SLICE`
