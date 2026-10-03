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
results. The accepted RL-7 comparison protocol/result lineage consumed by RL-8
must bind its subjectResult and subjectValidationResult to the exact result and
validationResult HashRefs in this transition evidenceSnapshot. Those fields
belong to accepted RL-7 comparison evidence, not SCIENTIFIC_PROMOTION_SUBJECT_V1.
Unavailable artifacts are null, not invented HashRefs; known corrupt or
unauthorized evidence fails closed rather than being laundered into absence.

Exact presence rules by resulting state (R = required non-null; N = null;
O = accepted HashRef or explicit null; COPY = exact predecessor snapshot):

| resultingState | runInput | result | evidenceObject | validationProtocol | validationResult | metricResultSet | robustnessComparisonProtocol | robustnessComparisonResult |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DRAFT_RESEARCH | N | N | N | N | N | N | N | N |
| EXECUTED | R | R | N | N | N | N | N | N |
| INSUFFICIENT_EVIDENCE | R | R | O | O | O | O | O | O |
| VALIDATION_FAILED | R | R | R | R | R | R | R | R |
| VALIDATION_PASSED | R | R | R | R | R | R | R | R |
| PROMOTION_ELIGIBLE | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| REJECTED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| INVALIDATED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |
| SUPERSEDED | COPY | COPY | COPY | COPY | COPY | COPY | COPY | COPY |

DRAFT_RESEARCH is only an upstream observation; it is never a resulting RL-8
transition. Its row describes absence before execution, not a persisted root.
EXECUTED binds only accepted runInput/result lineage and the stable scientific
subject under the exact protocol. All six later evidence fields MUST be null,
even when those artifacts already exist. Creating the same root before or after
validation, metrics or RL-7 evidence exists MUST produce identical canonical
bytes and scientific identity. Future evidence cannot change root identity.
Stage A binds the new accepted evidenceSnapshot for the same stable subject.
A compatible accepted execution rerun may supply new runInput/result HashRefs;
all snapshot lineage must resolve consistently. It never rewrites the root. INSUFFICIENT_EVIDENCE can have all references
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
Re-evaluation caused by new accepted evidence under the same protocol occurs
inside the same chain through a direct Stage A successor transition. A
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
for every SUPERSEDED transition. Dangling successor
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
PROMOTION_ELIGIBLE -> INSUFFICIENT_EVIDENCE
PROMOTION_ELIGIBLE -> VALIDATION_FAILED
PROMOTION_ELIGIBLE -> VALIDATION_PASSED
REJECTED -> INSUFFICIENT_EVIDENCE
REJECTED -> VALIDATION_FAILED
REJECTED -> VALIDATION_PASSED
INVALIDATED -> INSUFFICIENT_EVIDENCE
INVALIDATED -> VALIDATION_FAILED
INVALIDATED -> VALIDATION_PASSED
VALIDATION_FAILED -> REJECTED
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
EXECUTED -> SUPERSEDED
INSUFFICIENT_EVIDENCE -> SUPERSEDED
PROMOTION_ELIGIBLE -> SUPERSEDED
REJECTED -> SUPERSEDED
INVALIDATED -> SUPERSEDED
EXECUTED -> INVALIDATED
INSUFFICIENT_EVIDENCE -> INVALIDATED
PROMOTION_ELIGIBLE -> INVALIDATED
REJECTED -> INVALIDATED
```

All other transitions are forbidden and fail closed with
`FORBIDDEN_TRANSITION`.

Retry semantics are idempotent for identical protocol, subject, predecessor
state, predecessor transition and evidence payload. Identical payload reuse
returns the same scientific transition identity. A divergent payload for the
same logical transition is `DIVERGENT_EXISTING_IDENTITY`.

Regression is not mutation. If later accepted evidence changes the scientific
answer, the previous transition remains immutable and a successor transition
records a new Stage A outcome for same-protocol evidence refresh. Lifecycle
invalidation and cross-protocol supersession use only their frozen edges.
Historical `PROMOTION_ELIGIBLE` remains
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

## Gate Outcome Completeness

Root gateOutcomes = []. Accepted root execution lineage is checked before root
creation; root creation does not run the Stage A gate evaluation.
Every authoritative Stage A transition MUST contain exactly ONE outcome for
EVERY gate in the protocol's exact gateVocabulary, byte-sorted by gateId.
No missing gate id. No duplicate gate id. No unknown gate id.
Each outcome deterministically uses a frozen status and closed reason codes.
PASS has reasons = []; every non-PASS outcome has a nonempty byte-sorted unique
array of the applicable closed reason codes. Reason codes cannot be fabricated
or supplied as discretionary human judgment.

```text
VALIDATION_PASSED: every required gate = PASS; transitionReasons = []
INSUFFICIENT_EVIDENCE: transitionReasons = byte-sorted unique union of all non-PASS gate reasons
VALIDATION_FAILED: transitionReasons = byte-sorted unique union of all non-PASS gate reasons
```

Authority failure, corruption, incompatible identity/schema/protocol, unknown
gate/state/classification or any other fail-closed condition produces NO
authoritative RL-8 transition. This dominates all scientific outcome rules.
Stage B and lifecycle transitions copy gateOutcomes exactly as frozen below;
they do not recompute gates. The INVALIDATED lifecycle marker records discovery
about prior accepted evidence without treating that corrupt evidence as a new
accepted Stage A input; authority and lineage of the marker itself must pass.

## Decision Precedence

Stage A sources are exactly the stable active leaves:

```text
EXECUTED
INSUFFICIENT_EVIDENCE
PROMOTION_ELIGIBLE
REJECTED
INVALIDATED
```

Each derives exactly one of INSUFFICIENT_EVIDENCE, VALIDATION_FAILED or
VALIDATION_PASSED under the same protocol and deterministic decision precedence.
Re-evaluation requires a new accepted evidenceSnapshot and a direct successor
in the SAME chain. SUPERSEDED is never an intermediary for same-protocol refresh.
A retry of an already submitted transition targets its original predecessor and
reuses that exact payload; it does not create a fresh evaluation with unchanged
evidence at the new leaf. Historical predecessor transitions remain immutable;
the new successor makes the predecessor no longer the active leaf.

The Stage A decision table is:
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
transition artifacts with distinct HashRefs.

### Required Atomic Closure Pairs

The deterministic closure pairs are exactly:

```text
VALIDATION_PASSED -> PROMOTION_ELIGIBLE
VALIDATION_FAILED -> REJECTED
```

The later implementation MUST persist each Stage A transition and its required
deterministic closure successor atomically in one DB transaction. Either both
artifacts commit or neither commits. No external writer may interleave another
successor between the pair. They remain two distinct immutable transition
HashRefs, with the closure referencing its exact Stage A predecessor. The
single-successor invariant applies to both artifacts and concurrent retries
must reuse the identical pair or fail closed on divergence.
VALIDATION_PASSED and VALIDATION_FAILED are intermediate historical states,
never externally committed active leaves. A committed orphan intermediate is
corrupt history: Passport and Evidence Ledger reads fail closed rather than
projecting it. INSUFFICIENT_EVIDENCE needs no closure successor.

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

## Immutable Invalidation Proof

INVALIDATED is admitted only from EXECUTED, INSUFFICIENT_EVIDENCE,
PROMOTION_ELIGIBLE or REJECTED. INVALIDATED has no self-invalidation edge;
SUPERSEDED has no outgoing edge. VALIDATION_PASSED and VALIDATION_FAILED are
atomic intermediate states, never externally active leaves; later invalidation
attaches to their PROMOTION_ELIGIBLE or REJECTED closure leaf.

lifecycleEvidence is part of the transition canonical preimage. It creates no
third RL-8 scientific domain. It is [] for ROOT, STAGE_A, PROMOTION_ELIGIBLE,
REJECTED and SUPERSEDED; it is REQUIRED_NONEMPTY only for INVALIDATED.
Every entry MUST be immutable accepted scientific evidence proving the later
invalidation, not merely an arbitrary reference to the affected artifact.
The exact closed protocol.invalidationEvidenceDomains array below admits only
the eleven already accepted non-RL8 scientific domains used by the stable subject
or evidenceSnapshot. No other domain is admitted.

Unknown domain, empty/missing lifecycleEvidence, unaccepted, unresolvable,
wrong-tenant, wrong-Investigation or wrong-lineage invalidation evidence fails
closed: NO authoritative INVALIDATED transition is produced. The proof itself
must satisfy exact tenant/Investigation/subject lineage authority, accepted
canonical bytes and HashRef integrity. It must deterministically substantiate
each asserted cause against P; caller choice or free-form text is not proof.
A nonempty array alone does not establish proof. If accepted evidence cannot
prove a cause, no authoritative INVALIDATED transition is produced.

The exact closed protocol.invalidationCauseReasons array below is a subset of
the existing reason vocabulary. INVALIDATION_REASONS is the byte-sorted unique
array containing INVALIDATED_EVIDENCE plus at least one cause from that array,
and no other codes. INVALIDATED_EVIDENCE alone is forbidden. AUTHORITY_FAILURE
remains fail-closed and does NOT itself create an INVALIDATED transition.
Causes describe a proven defect in historical evidence, not permission to consume
corrupt or unauthorized lifecycleEvidence. The proof and marker's own authority
and lineage checks must pass before any transition can be admitted.

```text
predecessorTransition = P
predecessorState = P.resultingState
evidenceSnapshot = exact COPY of P
gateOutcomes = exact COPY of P
invalidates = P
supersedes = null
rejectedTransition = null
supersededByChain = null
lifecycleEvidence = REQUIRED_NONEMPTY
transitionReasons = byte-sorted unique [INVALIDATED_EVIDENCE + >=1 exact invalidation cause]
```

This records a later scientific lifecycle fact and MUST NOT modify or rewrite
the invalidated historical transition. Historical snapshot and gates are copied;
new immutable proof resides exclusively in lifecycleEvidence.

## Deterministic Gate Evidence Mapping

The exact gateEvidenceMapping array in SCIENTIFIC_PROMOTION_PROTOCOL_V1 below
is part of the protocol canonical preimage, not external prose or configuration.
It contains exactly one entry per gateVocabulary member, byte-sorted by gateId.
Each entry has exactly gateId and selectors; selectors are an exact closed,
byte-sorted unique array of field-path tokens. Unknown, duplicate, missing or
additional entries, keys or selectors are forbidden. There are no wildcard,
mutable, default or latest selectors. transition.protocol selects the RL-8
protocol HashRef; subject.* and evidenceSnapshot.* select the exact named fields.

For each Stage A gate, resolve exactly its listed selectors, discard explicit
null values only, deduplicate equal canonical HashRef envelopes, then sort the
remaining envelopes by their exact canonical bytes using unsigned byte order.
Do not use locale/string-label sorting. Missing fields or malformed references
fail closed. Empty selector lists yield []. No extra evidence HashRef may be
attached; no non-null mapped HashRef may be omitted. lifecycleEvidence is never
a gate evidence input. Authority/tenancy is server-derived scope and its gate
evidence is []; an authority failure emits NO transition.

Same canonical subject + snapshot + protocol MUST produce identical gate
evidence arrays. Status/reason selection cannot change the mapping. Different
gate evidence arrays for those same inputs are malformed and fail closed.
Root gates remain []; Stage B and lifecycle copy predecessor gates exactly,
without re-evaluation or adding lifecycleEvidence to historical gates.

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
  invalidationEvidenceDomains: [
    "METRIC_RESULT_SET_V2",
    "SYNTRAKE:EVIDENCE_OBJECT:V1",
    "SYNTRAKE:EXPERIMENT:V1",
    "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
    "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1",
    "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
    "SYNTRAKE:RESEARCH_IR:V1",
    "SYNTRAKE:RESULT:V1",
    "SYNTRAKE:RUN_INPUT:V1",
    "SYNTRAKE:VALIDATION_PROTOCOL:V1",
    "SYNTRAKE:VALIDATION_RESULT:V1"
  ],
  invalidationCauseReasons: [
    "CORRUPTED_EVIDENCE",
    "INCOMPATIBLE_ARTIFACT_SCHEMA",
    "INCOMPATIBLE_ENGINE_VERSION",
    "INCOMPATIBLE_METRIC_REGISTRY",
    "INCOMPATIBLE_PROTOCOL_VERSION",
    "INCOMPATIBLE_SCHEMA_VERSION",
    "UNAUTHORIZED_EVIDENCE",
    "WRONG_LINEAGE"
  ],
  gateEvidenceMapping: [
    {
      "gateId": "GATE_ACCEPTED_EXECUTION_RESULT",
      "selectors": [
        "evidenceSnapshot.result",
        "evidenceSnapshot.runInput"
      ]
    },
    {
      "gateId": "GATE_AUTHORITY_AND_TENANCY",
      "selectors": []
    },
    {
      "gateId": "GATE_EVIDENCE_COMPLETENESS",
      "selectors": [
        "evidenceSnapshot.evidenceObject",
        "evidenceSnapshot.metricResultSet",
        "evidenceSnapshot.result",
        "evidenceSnapshot.robustnessComparisonProtocol",
        "evidenceSnapshot.robustnessComparisonResult",
        "evidenceSnapshot.runInput",
        "evidenceSnapshot.validationProtocol",
        "evidenceSnapshot.validationResult"
      ]
    },
    {
      "gateId": "GATE_EVIDENCE_OBJECT_BINDING",
      "selectors": [
        "evidenceSnapshot.evidenceObject"
      ]
    },
    {
      "gateId": "GATE_LINEAGE_INTEGRITY",
      "selectors": [
        "evidenceSnapshot.evidenceObject",
        "evidenceSnapshot.metricResultSet",
        "evidenceSnapshot.result",
        "evidenceSnapshot.robustnessComparisonProtocol",
        "evidenceSnapshot.robustnessComparisonResult",
        "evidenceSnapshot.runInput",
        "evidenceSnapshot.validationProtocol",
        "evidenceSnapshot.validationResult",
        "subject.subjectExperiment",
        "subject.subjectExperimentParameters",
        "subject.subjectResearchIr"
      ]
    },
    {
      "gateId": "GATE_METRIC_RESULT_SET_V2",
      "selectors": [
        "evidenceSnapshot.metricResultSet"
      ]
    },
    {
      "gateId": "GATE_PROTOCOL_COMPATIBILITY",
      "selectors": [
        "evidenceSnapshot.metricResultSet",
        "evidenceSnapshot.result",
        "evidenceSnapshot.robustnessComparisonProtocol",
        "evidenceSnapshot.validationProtocol",
        "transition.protocol"
      ]
    },
    {
      "gateId": "GATE_RL7_ROBUSTNESS_COMPARISON",
      "selectors": [
        "evidenceSnapshot.robustnessComparisonProtocol",
        "evidenceSnapshot.robustnessComparisonResult"
      ]
    },
    {
      "gateId": "GATE_SUBJECT_IDENTITY",
      "selectors": [
        "subject.subjectExperiment",
        "subject.subjectExperimentParameters",
        "subject.subjectResearchIr"
      ]
    },
    {
      "gateId": "GATE_VALIDATION_RESULT",
      "selectors": [
        "evidenceSnapshot.validationProtocol",
        "evidenceSnapshot.validationResult"
      ]
    }
  ],
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
  lifecycleEvidence: byte-sorted unique array of admitted HashRef envelopes,
  gateOutcomes: byte-sorted array of {
    gateId: closed V1 gate id,
    status: closed V1 gate status,
    reasons: byte-sorted unique array of closed V1 reason/error codes,
    evidence: byte-sorted unique array of HashRef envelopes determined exactly by protocol.gateEvidenceMapping
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
gateOutcomes = []
transitionReasons = []
lifecycleEvidence = []
supersedes = null
invalidates = null
rejectedTransition = null
supersededByChain = null
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
chain. `supersededByChain` is REQUIRED if and only if
`resultingState = SUPERSEDED`, which exclusively records cross-protocol
methodology replacement; it is null for every other transition. In that case it is the
canonical immutable reference from the superseded old chain to the exact
successor chain. It belongs to `SCIENTIFIC_PROMOTION_TRANSITION_V1`, points to
an existing accepted successor protocol and successor root transition, and uses
only the two already frozen RL-8 domains:
`SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1` and
`SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1`.

The successor root transition MUST have `predecessorState = DRAFT_RESEARCH`,
`resultingState = EXECUTED` and `predecessorTransition = null`. It MUST share tenant authority, Investigation
UUID and scientific subject lineage with the old chain. Its protocol HashRef
MUST differ from the old chain's protocol HashRef for every SUPERSEDED transition. It MUST NOT be the same transition as the
`SUPERSEDED` transition and MUST NOT be any transition in the old chain. The
successor root transition MUST be the unique accepted root for the exact
successor promotion chain key. The linked graph from old chain to successor
chain MUST be acyclic. Dangling successor-chain references, self-reference,
self-supersession, cycles, a successor root that is not actually a root, or a
successor root that does not belong to the exact successor chain key fail
closed with `DIVERGENT_EXISTING_IDENTITY`.

No mutable current-truth field may replace immutable transition history.

## Exact Lifecycle Link Rules

P = exact non-null predecessorTransition HashRef in the same chain; COPY means
byte-for-byte copy from that exact predecessor. REQUIRED_CHAIN is the immutable
supersededByChain object binding the different successor protocol and its unique
accepted root. Every row is mandatory; no optional lifecycle reference may be
arbitrarily populated. All non-root predecessorState values equal P.resultingState.

| kind | predecessorTransition | supersedes | invalidates | rejectedTransition | supersededByChain | evidenceSnapshot | gateOutcomes | transitionReasons | lifecycleEvidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ROOT | null | null | null | null | null | ROOT_EXACT | [] | [] | [] |
| STAGE_A | P | null | null | null | null | NEW_ACCEPTED | COMPLETE_GATES | EVALUATION_REASONS | [] |
| PROMOTION_ELIGIBLE | P | null | null | null | null | COPY | COPY | [] | [] |
| REJECTED | P | null | null | P | null | COPY | COPY | COPY | [] |
| INVALIDATED | P | null | P | null | null | COPY | COPY | INVALIDATION_REASONS | REQUIRED_NONEMPTY |
| SUPERSEDED | P | P | null | null | REQUIRED_CHAIN | COPY | COPY | [SUPERSEDED_EVIDENCE] | [] |

ROOT_EXACT is the EXECUTED presence row: runInput/result required, six remaining
snapshot fields null. NEW_ACCEPTED follows the resulting Stage A state's presence
row and exact authority/lineage rules. COMPLETE_GATES and EVALUATION_REASONS are
the Gate Outcome Completeness rules. REJECTED copies the failed predecessor's
transitionReasons as well as its snapshot and gateOutcomes. INVALIDATION_REASONS
is the exact marker-plus-cause rule in Immutable Invalidation Proof. SUPERSEDED
uses the exact reason array shown. Copied gates describe historical evaluation
and do not claim a new PASS.

SUPERSEDED V1 = cross-protocol chain replacement only. Its non-null
supersededByChain MUST point to the exact unique root of the different successor
protocol chain, with the same tenant, Investigation and stable subject.
SUPERSEDED remains the old-chain V1 endpoint. No same-protocol replacement,
null successor-chain link, arbitrary ancestor reference or outgoing SUPERSEDED
edge is admitted. A missing or incompatible lifecycle link fails closed.


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
If the active leaf is `SUPERSEDED`, its `supersededByChain` MUST be non-null;
cross-chain reconstruction continues to the referenced successor root transition
after validating rootness, same tenant, same Investigation, same subject
lineage, a different successor protocol and
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
chain to its active leaf. If that leaf is a `SUPERSEDED` transition, its
`supersededByChain` is mandatory. Passport follows only that immutable reference to the exact
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

New experiment evidence, validation rerun, Metric Registry evidence or RL-7
comparison rerun compatible with the same protocol creates a direct Stage A
successor with a NEW accepted evidenceSnapshot inside the same promotion chain.
The stable subject and exact protocol remain unchanged. A Metric Registry
version incompatible with that protocol fails closed; a methodology change
requires a different protocol chain. Same-protocol refresh never uses SUPERSEDED. A promotion methodology/protocol
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
`SUPERSEDED` records cross-protocol methodology replacement only, from any of
the five stable active leaves; its snapshot and gates copy the predecessor.
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
