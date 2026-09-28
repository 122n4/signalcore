# I5 RL-8 Scientific Promotion State Machine V1 Design Freeze

Status: CANDIDATE DESIGN FREEZE - RL-8 SCIENTIFIC PROMOTION STATE MACHINE V1 - UNNUMBERED

Classification:
`CANDIDATE / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_DESIGN_FREEZE / UNNUMBERED`

Canonical predecessor:
`05b4192557e8e2c22f63769774a1ca2985199e62`

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
  tenantAuthority: server-derived tenant authority, not client supplied,
  investigationId: server-derived canonical Investigation UUID,
  subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>,
  subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>,
  subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>,
  subjectRunInput: HashRef<SYNTRAKE:RUN_INPUT:V1>,
  subjectResult: HashRef<SYNTRAKE:RESULT:V1>,
  subjectEvidenceObject: HashRef<SYNTRAKE:EVIDENCE_OBJECT:V1>,
  subjectValidationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>,
  subjectValidationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>,
  subjectMetricResultSet: HashRef<METRIC_RESULT_SET_V2>,
  robustnessComparisonProtocol:
    HashRef<SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1>,
  robustnessComparisonResult:
    HashRef<SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1>
}
```

This is the smallest stable scientific subject that binds Investigation
lineage, Experiment identity, accepted execution/result identity, validation
evidence, metric evidence and RL-7 robustness/comparison evidence.

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

`INSUFFICIENT_EVIDENCE`, `VALIDATION_FAILED`, `VALIDATION_PASSED` and
`PROMOTION_ELIGIBLE` are deterministic RL-8 evaluation outcome states.

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

One promotion chain is identified by:

```text
tenant authority
Investigation UUID
subject Experiment HashRef
subject ExperimentParameters HashRef
subject Research IR HashRef
protocol HashRef
root transition HashRef
```

The root transition is the first admitted RL-8 transition for that exact
subject/protocol chain and has `predecessorState = null`. Supersession or
invalidation caused by new evidence under the same protocol occurs inside the
same chain through an explicit successor transition. A methodology/protocol
change creates a new promotion chain with a different protocol HashRef; the old
chain is linked to the new chain by an explicit `SUPERSEDED` transition that
preserves the old chain's historical truth.

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
VALIDATION_PASSED -> REJECTED
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

`SCIENTIFIC_PROMOTION_PROTOCOL_V20260928`

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

RL-7 evidence is mandatory in V1. The required RL-7 result must be an accepted
`SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` HashRef produced under an accepted
`SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` HashRef for the same tenant,
Investigation and subject Experiment.

Accepted Validation Result evidence is mandatory. A failed validation gate
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

The V1 decision table is evaluated in this exact order:

```text
1. malformed protocol, malformed transition, unknown state, unknown gate,
   wrong HashRef domain, corrupted evidence, authority failure, wrong tenant,
   wrong Investigation, wrong lineage, incompatible schema/protocol/engine/
   metric/artifact version, unauthorized evidence, divergent existing identity
   -> fail closed; no authoritative promotion state is produced

2. forbidden requested transition
   -> fail closed with FORBIDDEN_TRANSITION

3. missing required evidence, unavailable required predecessor evidence,
   incomplete validation, insufficient RL-7 evidence, superseded evidence or
   invalidated evidence
   -> INSUFFICIENT_EVIDENCE

4. accepted Validation Result explicitly fails or RL-7 classification is
   ROBUSTNESS_DEGRADED or ROBUSTNESS_UNSTABLE
   -> VALIDATION_FAILED

5. accepted Validation Result passes and RL-7 classification is
   ROBUSTNESS_MIXED
   -> INSUFFICIENT_EVIDENCE

6. accepted Validation Result passes and RL-7 classification is
   ROBUSTNESS_STABLE, and every required gate is PASS
   -> PROMOTION_ELIGIBLE
```

Integrity, authority and lineage incompatibility dominate eligibility. Then
insufficient evidence. Then explicit failed scientific gates. Only after every
required gate returns `PASS` may `PROMOTION_ELIGIBLE` exist.

## Canonical Identity Domains

RL-8 freezes exactly two future canonical domains. They are DESIGN_FROZEN /
NOT RUNTIME_ADMITTED in this slice:

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
  protocolId: "SCIENTIFIC_PROMOTION_PROTOCOL_V20260928",
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
  predecessorState: closed V1 state | null,
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
    HashRef<SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1> | null
}
```

No extra keys. `predecessorState = null` is admitted only for the first
transition of one promotion chain and then requires
`predecessorTransition = null`. Every non-root transition requires exactly one
`predecessorTransition` in the same chain. `resultingState = PROMOTION_ELIGIBLE`
requires every required gate outcome to be `PASS`. `supersedes`, `invalidates`
and `rejectedTransition` may reference only immutable prior RL-8 transition
HashRefs for the same tenant, Investigation, subject lineage and promotion
chain.

No mutable current-truth field may replace immutable transition history.

## Persistence Contract

This design slice writes no SQL. The later implementation must provide:

- append-only transition persistence;
- immutable accepted protocol and transition scientific identities;
- deterministic identical-payload reuse;
- deterministic divergent-payload conflict;
- concurrency equivalent to one accepted authoritative successor for one
  predecessor transition;
- logical uniqueness by tenant authority, Investigation, subject Experiment
  HashRef, protocol HashRef, root transition HashRef, predecessor transition
  HashRef and resulting state;
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

An optional current-state projection may exist only as a non-authoritative read
model. If projection and immutable transition history disagree, history wins
and the projection is corrupt evidence.

If one predecessor transition has zero successors, it is the active leaf for
that chain. If one predecessor transition has one successor, reconstruction
continues to that successor. If one predecessor transition has more than one
authoritative successor, the chain is corrupt and Passport/Evidence reads fail
closed with `DIVERGENT_EXISTING_IDENTITY`; no active/current state is projected.

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
chooses `currentState` only by reconstructing the unique successor chain from
root transition to leaf transition under the exact promotion chain identity. It
does not choose by wall-clock time, row insertion order, mutable latest pointer
or caller preference. Passport reports scientific state/evidence only and does
not become recommendation, Paper, Live, capital or suitability authority.

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
transition in the old chain. It does not silently rewrite an old
`PROMOTION_ELIGIBLE` result.

`REJECTED` records owner/scientific governance rejection of a transition chain.
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
