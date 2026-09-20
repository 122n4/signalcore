# Syntrake Investing Genesis I5-A - Canonical Hash Domains V1

Status: `CURRENT CONSOLIDATED HASH-DOMAIN CONTRACT`

This contract consolidates the current I5 canonical-bytes/hash-preimage
authority. Runtime truth is `lib/investing/research/canonical.ts` plus the
operation-specific material request identity in
`lib/investing/research/materialRequest.ts`.

## Canonical Pipeline

Scientific hashes use:

```text
validated source/material values
-> exact owner payload
-> SYNTRAKE_CANONICAL_JSON_V1 bytes
-> exact domain preimage
-> SHA-256
-> uppercase 64-character hex
```

JSON numbers, provider-native JSON, locale/collation ordering, runtime Date
rendering, implicit normalization and generated database IDs are never generic
scientific byte authority.

## Scalar Families

- `CanonicalTextV1`: valid Unicode scalar text, NFC normalized, bounded by owner.
- `CanonicalOpaqueStringV1`: valid Unicode scalar text, no normalization, bounded
  by owner.
- `CanonicalTokenV1`: closed enum or owner-defined ASCII identifier.
- `CanonicalUuidV1`: lowercase PostgreSQL UUID text.
- `CanonicalDecimalV1`: canonical decimal string; `-0`, signs, exponent notation,
  commas and NaN/Infinity forms are invalid.
- `CanonicalIntegerV1`: canonical integer string; no JSON numeric authority.
- `CanonicalTimestampUtcMicrosV1`: exact UTC microsecond timestamp text.
- `CanonicalSha256HexV1`: uppercase SHA-256 hexadecimal text.

Deterministic behavior identifiers must resolve to immutable implementation,
schema, methodology, registry or policy definitions. Mutable aliases such as
`latest`, `current`, `stable`, `production`, `default`, `active` and `rolling`
are blocked when they would identify behavior.

## Domain Admission

Current `HashDomainV1` states:

| Domain | State |
| --- | --- |
| `SYNTRAKE:RESEARCH_DRAFT:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:HYPOTHESIS:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:RESEARCH_SPEC:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:RESEARCH_IR:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:EXPERIMENT:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:DATASET_SERIES:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:DATASET_SNAPSHOT:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1` | `DECLARED_BUT_HASHING_DISABLED` |
| `SYNTRAKE:RUN_INPUT:V1` | `PREIMAGE_ENVELOPE_EXACT` |
| `SYNTRAKE:RESULT:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:EVIDENCE_OBJECT:V1` | `CONTENT_PREIMAGE_EXACT` |
| `SYNTRAKE:RESEARCH_TEMPLATE:V1` | `DECLARED_BUT_HASHING_DISABLED` |
| `SYNTRAKE:METRIC_REQUEST_SET:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:EXECUTION_CONFIG:V1` | `OWNER_PAYLOAD_EXACT` |
| `SYNTRAKE:CANONICAL_TEST:V1` | `TEST_ONLY` |

`HASH DOMAIN DECLARED != HASH DOMAIN ADMISSIBLE`.

Declared-but-disabled domains must not be hashed, nested into an executable Run
identity, or treated as final scientific content identity merely because a
working design named them.

## Run Input Envelope

`SYNTRAKE:RUN_INPUT:V1` is a preimage-envelope domain. It validates exact nested
hash references and blocks runtime hashing when required nested scientific
domains remain disabled.

`accountResearchContext` is required only for `USER_PORTFOLIO` and forbidden for
`PURE_RESEARCH` and `TEST_PORTFOLIO`.

## Evidence Object Boundary

`SYNTRAKE:EVIDENCE_OBJECT:V1` is content-preimage exact only for the accepted
descriptor/content byte boundary. Storage integrity, provenance and record
identity are separate from scientific content identity unless an owner contract
binds them.

## Material Request Identity

`SYNTRAKE_INVESTING_I5_MATERIAL_COMMAND_REQUEST_V1` is not a scientific
`HashDomainV1`. It is operation-request identity for idempotency/material
commands. It binds authority-derived scope evidence and operation-specific
material fragments while excluding idempotency key and correlation ID from
material semantics.

ResearchSpec revision workflow status remains `CANDIDATE_ONLY`; that workflow
status is separate from scientific identity. The scientific ResearchSpec owner
payload is current accepted through Dataset & Run Scientific Closure and excludes
operational revision, pointer, tenant, account, principal, idempotency and
timestamp data.

Experiment and ExperimentParameters were not activated by the original
hash-domain consolidation slice. They are current owner-exact domains because
later dedicated accepted owner contracts admitted their exact owner payloads.
DatasetSeries, DatasetSnapshot, MetricRequestSet, ExecutionConfig and
ResearchSpec are current owner-exact domains admitted by the accepted unnumbered
Dataset & Run Scientific Closure owner contract.

## Explicit Exclusions

`SYNTRAKE:RESULT:V1` is current accepted through the unnumbered I5 Research
Execution Closure as `OWNER_PAYLOAD_EXACT` for the exact accepted Result owner
payload. Arbitrary raw Result objects remain outside the public hashing
boundary.

No ResearchTemplate or account-context hashing domain is activated by this
contract unless the runtime already admits it with an exact owner payload.
