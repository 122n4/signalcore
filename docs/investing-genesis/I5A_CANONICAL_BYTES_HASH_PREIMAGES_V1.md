# Syntrake Investing Genesis I5-A — Canonical Bytes + Hash Preimages V1

Status: `WORKING CONTRACT — A2 CANDIDATE — NOT FROZEN`

Original A2 parent:

```text
fc168738f2e74c69fc2cf51af8f78b1729249bdc
```

Purpose: close I5-A2 without inventing scientific/domain semantics that belong to later I5-A design steps.

This document is design only. It does not implement runtime, schema, migrations, RLS, workers, datasets, metrics, backtests, Trading integration, Supabase changes, Vercel production deploys, or financial writes.

---

# 1. Controlling law and supersession

I0/I1 and the exact I4 freeze remain predecessor authority.

For I5 canonical bytes, scalar canonicalization, hash representation, hash preimages, self-hash exclusion, collection admission and scientific-vs-storage identity, this document supersedes conflicting statements in earlier **working** I5 documents.

Earlier working I5 documents remain design history but are not controlling where they conflict with this contract.

Specifically superseded where applicable:

```text
"standard JSON escaping"
"safe integers may be JSON integers"
"lowercase hash hex"
"Run input hash binds at least ..."
"raw-or-canonical-bytes"
"sort by generated object ID as generic tie-breaker"
actorId modeled as a generic UUID
```

No earlier working I5 vector becomes frozen merely because its digest is mathematically correct.

---

# 2. I5-A2 scope boundary

I5-A2 freezes:

1. canonical scientific scalar primitives;
2. canonical structured byte emission;
3. collection admission rules;
4. SHA-256 textual representation for I5 Investing hashes;
5. domain separation preimage law;
6. hash-bearing wrapper/payload separation;
7. scientific content identity vs record identity vs material request identity vs storage integrity;
8. nested hash-reference law;
9. stable semantic/reference binding law;
10. exact outer Run-input hash envelope;
11. exact EvidenceObject scientific-content byte identity;
12. fail-closed admission for hash domains whose semantic payload is not yet frozen;
13. normative golden/rejection vectors for rules closed here.

I5-A2 does **not** invent final semantic field schemas for Draft, Hypothesis, ResearchSpec, Experiment, DatasetSnapshot, Result, metrics, or final `RESEARCH_IR_V1`.

Those owner steps must later provide an exact named `*_HASH_PAYLOAD_V1` before their domain becomes admissible.

```text
HASH DOMAIN DECLARED
!=
HASH DOMAIN ADMISSIBLE
```

If semantic payload identity is not frozen, hashing is blocked rather than guessed.

---

# 3. Canonicalization pipeline

Every canonical scientific hash follows this sequence:

```text
source/material values
  -> exact field validation
  -> exact field canonicalization
  -> closed versioned HASH_PAYLOAD object
  -> collection validation/canonical ordering
  -> SYNTRAKE_CANONICAL_JSON_V1 bytes
  -> exact domain preimage
  -> SHA-256 digest bytes
  -> uppercase hexadecimal representation
```

Forbidden shortcuts:

```text
hash persistence row/object wholesale
hash provider-native JSON wholesale
use insertion order as scientific order
use runtime locale/collation
use JavaScript float rendering
use JavaScript Date rendering where microseconds matter
use PostgreSQL default text rendering as byte authority
```

---

# 4. Canonical primitives

## 4.1 CanonicalTextV1 — semantic/human text

For human or semantic natural-language text:

1. only valid Unicode scalar values are admitted;
2. lone UTF-16 surrogates are invalid and must not be replaced with U+FFFD;
3. text is NFC-normalized at admission;
4. canonical JSON serialization performs no hidden normalization;
5. owner schemas freeze byte bounds after NFC;
6. case, spaces, punctuation and line breaks remain meaningful unless the owner defines a stricter token.

Raw binary evidence is never converted to text merely to obtain a hash.

## 4.2 CanonicalOpaqueStringV1 — opaque external/reference text

Not every string is human text.

An opaque provider/reference identifier may use `CanonicalOpaqueStringV1` only when the owner schema explicitly chooses it.

Rules:

- valid Unicode scalar values only;
- **no Unicode normalization**;
- scalar sequence is byte-distinct scientific/reference material;
- exact owner-defined byte bounds required;
- owner must justify why NFC normalization would be unsafe for this field.

Thus free text and opaque identifiers cannot silently share normalization semantics.

## 4.3 CanonicalTokenV1

Tokens are closed enums or owner-defined ASCII identifiers.

Locale-aware case folding is forbidden.

Enum tokens emit exactly as defined.

## 4.4 CanonicalUuidV1

Canonical PostgreSQL UUID text:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

Rules:

- lowercase canonical output;
- no braces or `urn:uuid:` prefix;
- no UUID-version assumption unless a later owner schema explicitly adds one.

Generated UUID identity is not automatically scientific content identity.

## 4.5 CanonicalActorId

`actor_id` is not a generic UUID primitive.

The real predecessor authority runtime uses a string actor identity separate from canonical `principal_id`.

Authority/audit owns actor-ID validation. Scientific content does not gain actor identity merely because an actor created the record.

## 4.6 CanonicalDecimalV1

Canonical decimal grammar:

```text
^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$
```

Additional rule:

```text
-0 = INVALID
```

Canonicalization examples:

```text
1.0      -> 1
1.2300   -> 1.23
0.500    -> 0.5
-0.500   -> -0.5
+1       -> INVALID
1e3      -> INVALID
01       -> INVALID
1,25     -> INVALID
NaN      -> INVALID
Infinity -> INVALID
```

Every owner field must additionally freeze:

```text
sign permission
minimum/maximum
maximum integer digits
maximum fractional scale
unit semantics
```

JavaScript `number` is never canonical authority for financial/scientific decimals.

## 4.7 Money, ratio, percentage and basis points

A numeric value must carry explicit unit semantics where units change meaning.

Minimum money shape:

```ts
interface CanonicalMoneyV1 {
  amount: CanonicalDecimalV1;
  currency: CanonicalTokenV1;
}
```

The owning schema defines accepted currencies.

These are not interchangeable without an explicit conversion contract:

```text
0.01 RATIO
1 PERCENT
100 BASIS_POINTS
```

Cost/slippage fields must freeze unit, sign and range.

## 4.8 CanonicalIntegerV1

Scientific hash payloads do not emit JSON numeric integers.

Integers are canonical JSON strings using base-10 text:

```text
^-?(?:0|[1-9][0-9]*)$
```

`-0` is invalid.

Every owner field freezes exact bounds.

This removes JavaScript safe-integer and cross-language number-rendering ambiguity.

## 4.9 CanonicalTimestampUtcMicrosV1

Canonical instant output is exactly:

```text
YYYY-MM-DDTHH:mm:ss.ffffffZ
```

Rules:

- UTC only;
- exactly six fractional digits;
- valid proleptic Gregorian date;
- four-digit year `0001..9999`;
- hour `00..23`;
- minute `00..59`;
- second `00..59`;
- leap-second text `:60` not admitted in V1;
- `+00:00` is not canonical output;
- millisecond-short form is not canonical output;
- JavaScript `Date` is not canonical authority where it truncates microseconds.

Examples:

```text
2026-09-06T18:20:48.123456Z  VALID
2026-09-06T18:20:48.123Z     INVALID CANONICAL FORM
2026-09-06T18:20:48+00:00    INVALID CANONICAL OUTPUT
```

An owner may accept a noncanonical offset input only if it freezes parsing; admitted canonical output is still UTC microseconds.

## 4.10 CanonicalDateV1

Exact date-only output:

```text
YYYY-MM-DD
```

It must be an actual Gregorian date with year `0001..9999`.

Date-only never silently becomes an instant.

## 4.11 CanonicalHashDomainV1

A hash domain is an ASCII domain token known by the exact hash-domain registry.

Generic lexical admission:

```text
^[A-Z0-9:_-]+$
```

Lexical validity alone does not authorize an unknown domain. Unknown registry domain fails closed.

## 4.12 CanonicalSha256HexV1

I5 Investing SHA-256 canonical text:

```text
^[0-9A-F]{64}$
```

Canonical representation is uppercase hex.

This aligns I5 Investing persisted hash text with the exact I4 Investing predecessor convention.

---

# 5. SYNTRAKE_CANONICAL_JSON_V1

Canonical scientific structured payloads use `SYNTRAKE_CANONICAL_JSON_V1`.

This section is byte-exact.

## 5.1 Allowed value classes

Allowed:

```text
object
array
string
boolean
null only where the exact field schema declares null semantically distinct
```

Scientific hash payloads contain **no JSON numbers**.

Decimals and integers are strings.

## 5.2 Object law

1. every object shape is closed and versioned;
2. arbitrary maps are forbidden unless an exact schema freezes key domain and ordering;
3. duplicate JSON keys are invalid and must not be last-write-wins canonicalized;
4. object keys emit in ascending Unicode code-point order;
5. canonical schema keys should be fixed ASCII names;
6. no insignificant whitespace;
7. absent optional fields are omitted;
8. `undefined` is not canonical data;
9. `null` appears only where schema defines distinct null semantics.

## 5.3 Exact string escaping

Strings are already field-canonicalized before JSON emission.

Emitter rules:

```text
U+0022  -> \"
U+005C  -> \\
U+0008  -> \b
U+0009  -> \t
U+000A  -> \n
U+000C  -> \f
U+000D  -> \r
other U+0000..U+001F -> \u00xx with lowercase hex digits
```

Additionally:

```text
/ is never escaped
non-ASCII scalar values are emitted as UTF-8, never optional \uXXXX
U+2028/U+2029 are emitted as UTF-8
no BOM
no library-selectable alternate escape form
```

## 5.4 Array/collection law

Every array in an admitted scientific payload is exactly one of:

```text
ORDERED_SEQUENCE
UNORDERED_SET
```

Undeclared array semantics block hashing.

### ORDERED_SEQUENCE

- preserves semantic order;
- reordering changes bytes;
- duplicates only if owner schema explicitly permits them.

### UNORDERED_SET

- exact uniqueness key required;
- exact stable sort key required;
- duplicates rejected;
- comparison uses owner-declared canonical bytes/ASCII byte lexical order, never locale/collation;
- generated row UUIDs are forbidden as generic deterministic tie-breakers;
- same semantic key with no stable semantic discriminator fails closed.

The earlier working `DatasetSnapshot.series -> canonicalSeriesId, then seriesRefId` rule is therefore not accepted as canonical V1 ordering.

## 5.5 Forbidden payload inputs

```text
undefined
NaN
Infinity
-Infinity
JSON numbers
functions
class instances
Date objects
Buffer objects represented as arbitrary JSON
provider-native objects
arbitrary maps without exact schema
unbounded numeric values
```

Binary evidence uses the EvidenceObject byte contract below.

---

# 6. Hash algorithm and normal structured preimage

Algorithm:

```text
SHA-256
```

Hash version token:

```text
SYNTRAKE_SHA256_V1
```

For normal structured I5 scientific hash domains:

```text
preimage =
  utf8(<ASCII_DOMAIN_PREFIX>)
  || 0x0A
  || SYNTRAKE_CANONICAL_JSON_V1(payload)
```

Digest:

```text
SHA256(preimage)
```

Canonical text:

```text
UPPERCASE_HEX_64
```

Domain prefix and exact payload schema are both part of the hash contract.

Changing domain or payload schema requires a new version/domain. Historical hashes are never rewritten.

---

# 7. Exact HashRefV1

A nested scientific hash ref is self-describing across algorithm, domain, version and digest text.

```ts
interface HashRefV1 {
  hashAlgorithm: "SHA-256";
  hashDomain: CanonicalHashDomainV1;
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}
```

A containing field also constrains the **exact expected domain**. A lexically valid but wrong-domain hash ref fails validation.

Example:

```text
RunInput.researchSpec
  expected hashDomain = SYNTRAKE:RESEARCH_SPEC:V1
```

Hash version does not erase domain type.

---

# 8. Self-hash recursion closure

Persisted wrapper and hash payload are different shapes.

```text
PERSISTED_OBJECT_V1
  may contain canonicalContentHash / snapshotHash / resultHash / ...

HASH_PAYLOAD_V1
  MUST NOT contain the hash field that identifies that payload
```

Required process:

```text
PersistedObject
  -> exact named HASH_PAYLOAD_V1 projection
  -> canonical bytes
  -> hash
  -> hash stored on wrapper/row
```

Forbidden:

```text
hash(full object including own hash)
placeholder self-hash
recursive convergence
runtime ignore-list serialization
```

Every admissible hash domain requires an exact named payload schema.

---

# 9. Identity classes remain disjoint

## 9.1 Scientific content hash

Identifies immutable scientific content/evidence/input.

It is not authorization, idempotency or DB primary-key identity.

## 9.2 Material request hash

Identifies one exact material state-transition request.

Future I5 material request hashes must follow the I4 pattern:

```text
operation-specific exact preimage
domain separated from scientific content
explicit authority/scope/object/CAS/content bindings when material
```

Correlation IDs, retry/queue metadata and other ephemeral fields are not silently included.

`idempotencyKey` scopes replay lookup; it is not automatically the material request hash itself.

## 9.3 Record identity

Generated UUIDs identify persisted records/lineage.

They are not automatically scientific content.

## 9.4 Storage integrity

Storage locator, provider, compression, multipart representation and stored-byte digest are storage concerns.

They are not scientific identity unless a future artifact contract explicitly makes representation itself the evidence.

---

# 10. Stable scientific reference binding

Default scientific content reference:

```ts
interface CanonicalScientificRefV1 {
  objectKind: CanonicalTokenV1;
  objectSchemaVersion: CanonicalTokenV1;
  contentHash: HashRefV1;
}
```

A persistence wrapper may carry record IDs outside the scientific hash.

If exact record identity itself is scientifically material, the owner must opt in explicitly:

```ts
interface CanonicalRecordBoundRefV1 {
  objectKind: CanonicalTokenV1;
  objectSchemaVersion: CanonicalTokenV1;
  objectId: CanonicalUuidV1;
  contentHash: HashRefV1;
}
```

The owner contract must justify why `objectId` participates.

Therefore:

```text
NOT all IDs are excluded
NOT all IDs are included
payload schema decides explicitly
```

Generated UUIDs must not be used merely as sort tie-breakers for otherwise equivalent scientific content.

---

# 11. Hash-domain admission registry

| Domain | A2 state | Exact semantic owner |
|---|---|---|
| `SYNTRAKE:RESEARCH_DRAFT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 Draft |
| `SYNTRAKE:HYPOTHESIS:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 Hypothesis |
| `SYNTRAKE:RESEARCH_SPEC:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 ResearchSpec |
| `SYNTRAKE:RESEARCH_IR:V1` | `DECLARED_BUT_HASHING_DISABLED` | A9 closed IR subset |
| `SYNTRAKE:EXPERIMENT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A3/A4 experiment identity |
| `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 typed parameters |
| `SYNTRAKE:DATASET_SERIES:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5 series content |
| `SYNTRAKE:DATASET_SNAPSHOT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5 DatasetSnapshot |
| `SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5/A6 immutable projection |
| `SYNTRAKE:RUN_INPUT:V1` | `PREIMAGE_ENVELOPE_EXACT` | A2; unusable until required nested hashes are admitted |
| `SYNTRAKE:RESULT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A6 Result |
| `SYNTRAKE:EVIDENCE_OBJECT:V1` | `CONTENT_PREIMAGE_EXACT` | A2 artifact bytes |
| `SYNTRAKE:RESEARCH_TEMPLATE:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 immutable template version |
| `SYNTRAKE:METRIC_REQUEST_SET:V1` | `DECLARED_BUT_HASHING_DISABLED` | A8 metrics |
| `SYNTRAKE:EXECUTION_CONFIG:V1` | `DECLARED_BUT_HASHING_DISABLED` | A8 deterministic adapter |

`DECLARED_BUT_HASHING_DISABLED` means canonical hash computation/persistence must fail closed until its owner payload is frozen.

---

# 12. Exact RunInputHashPayloadV1

A2 freezes the **outer** deterministic scientific-input envelope.

```ts
type RunTypeV1 =
  | "HISTORICAL_BACKTEST"
  | "SIMULATION"
  | "SENSITIVITY"
  | "REPRODUCIBILITY_CHECK";

type ResearchEnvironmentV1 =
  | "HISTORICAL_BACKTEST"
  | "SIMULATION";

type ResearchSourceContextV1 =
  | "PURE_RESEARCH"
  | "TEST_PORTFOLIO"
  | "USER_PORTFOLIO";

interface MaterialPolicyRefV1 {
  policyId: CanonicalTokenV1;
  policyVersion: CanonicalTokenV1;
}

interface RunInputHashPayloadV1 {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1";
  runType: RunTypeV1;
  researchEnvironment: ResearchEnvironmentV1;
  researchSourceContext: ResearchSourceContextV1;
  researchSpec: HashRefV1;
  researchIr: HashRefV1;
  experiment: HashRefV1;
  datasetSnapshot: HashRefV1;
  accountResearchContext?: HashRefV1;
  engineId: CanonicalTokenV1;
  engineVersion: CanonicalTokenV1;
  metricRegistryVersion: CanonicalTokenV1;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  deterministicSeed?: CanonicalTextV1;
  materialPolicies: MaterialPolicyRefV1[];
}
```

Exact expected nested domains:

| Field | Required domain |
|---|---|
| `researchSpec` | `SYNTRAKE:RESEARCH_SPEC:V1` |
| `researchIr` | `SYNTRAKE:RESEARCH_IR:V1` |
| `experiment` | `SYNTRAKE:EXPERIMENT:V1` |
| `datasetSnapshot` | `SYNTRAKE:DATASET_SNAPSHOT:V1` |
| `accountResearchContext` | `SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1` |
| `metricRequestSet` | `SYNTRAKE:METRIC_REQUEST_SET:V1` |
| `executionConfig` | `SYNTRAKE:EXECUTION_CONFIG:V1` |

`materialPolicies` is an `UNORDERED_SET`:

```text
uniqueness key = policyId
sort key       = policyId ASCII bytes ASC
```

Duplicate `policyId` is invalid.

`policyVersion` must identify immutable deterministic behavior. Any configurable policy value capable of changing output must be bound through an admitted nested content hash such as `executionConfig`, not hidden behind the version string.

Exact account-context law:

```text
researchSourceContext = USER_PORTFOLIO
  -> accountResearchContext REQUIRED

researchSourceContext = PURE_RESEARCH
  -> accountResearchContext ABSENT

researchSourceContext = TEST_PORTFOLIO
  -> accountResearchContext ABSENT
```

A TEST_PORTFOLIO simulated capital model belongs to deterministic research/execution configuration, never an InvestingAccount projection.

Basic run/environment law:

```text
runType=HISTORICAL_BACKTEST -> researchEnvironment=HISTORICAL_BACKTEST
runType=SIMULATION          -> researchEnvironment=SIMULATION
```

`SENSITIVITY` and `REPRODUCIBILITY_CHECK` execution-environment compatibility must be frozen by their owner design before those run types become executable; no implicit environment is selected.

Exact Run input preimage:

```text
utf8("SYNTRAKE:RUN_INPUT:V1")
|| 0x0A
|| SYNTRAKE_CANONICAL_JSON_V1(RunInputHashPayloadV1)
```

Hash text is uppercase SHA-256 hex.

## 12.1 Inclusion law

Every value capable of changing deterministic output must be reachable through the exact envelope:

```text
ResearchSpec semantics              -> researchSpec
executable typed IR                 -> researchIr
experiment/parameters               -> experiment
scientific dataset                  -> datasetSnapshot
USER_PORTFOLIO immutable projection -> accountResearchContext
engine implementation               -> engineId + engineVersion
metric implementations/requests     -> metricRegistryVersion + metricRequestSet
cost/slippage/contribution/FX/etc   -> executionConfig and/or researchIr according to owner contract
output-changing deterministic policy -> materialPolicies + admitted config hash where needed
seed                                -> deterministicSeed when applicable
run semantic class                  -> runType
historical/simulation environment   -> researchEnvironment
Research source semantics           -> researchSourceContext
```

If an output-changing input is not reachable through these fields, Run creation is blocked.

## 12.2 Exclusion law

Not members of `RunInputHashPayloadV1`:

```text
runId
investigationId
tenantId
accountId
principalId
actorId
correlationId
idempotencyKey
workerId
jobId
attemptId
lease token
retry count
queue timestamp
startedAt
completedAt
createdAt
UI state
conversation state
LLM prose explanation
telemetry counters
storage locators
```

Those may matter to authority, audit, lineage, idempotency, material request identity or storage; they do not become deterministic scientific content merely by existing.

Account-specific financial facts enter scientific computation only through the immutable admitted `accountResearchContext` content hash.

---

# 13. Exact EvidenceObject scientific-content identity

Evidence scientific identity is over **canonical uncompressed scientific content bytes**, not storage representation.

Descriptor:

```ts
interface EvidenceContentDescriptorV1 {
  schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1";
  kind: CanonicalTokenV1;
  artifactSchemaVersion: CanonicalTokenV1;
  format: CanonicalTextV1;
  contentByteLength: CanonicalIntegerV1;
}
```

`contentByteLength` is the decimal byte length of the uncompressed scientific content sequence and must be non-negative under the owner artifact schema.

Exact preimage:

```text
utf8("SYNTRAKE:EVIDENCE_OBJECT:V1")
|| 0x0A
|| SYNTRAKE_CANONICAL_JSON_V1(EvidenceContentDescriptorV1)
|| 0x0A
|| exact_uncompressed_scientific_content_bytes
```

Hash text:

```text
SHA256(preimage) -> UPPERCASE_HEX_64
```

Scientific-content rules:

- immutable after publication;
- structured artifact requires its own exact canonical schema;
- text artifact requires its own exact text-byte schema;
- binary artifact hashes exact scientific content bytes;
- absence is `UNAVAILABLE`, not empty content;
- descriptor kind/schema/format/length are bound into identity.

Excluded storage representation:

```text
storageLocator
storage provider
compression algorithm/level
stored/compressed byte length
upload timestamp
multipart/retry metadata
```

Storage may separately persist:

```text
storedByteLength
compression
storageLocator
storageSha256Hex
```

where `storageSha256Hex = SHA256(exact stored bytes)` is storage integrity only, never `EvidenceObject.contentHash`.

Recompression therefore does not change scientific identity.

---

# 14. Owner payload admission checklist

Before any disabled domain becomes admissible, its owner contract must freeze:

1. exact named payload schema;
2. exact field list/types;
3. required/optional/null semantics;
4. exact primitive bounds;
5. whether each string is Text, OpaqueString or Token;
6. exact nested expected hash domain for every hash ref;
7. array class for every array;
8. uniqueness/sort keys for unordered sets;
9. duplicate behavior;
10. exact inclusion/exclusion of generated IDs;
11. exact inclusion/exclusion of timestamps;
12. exact provenance/evidence binding;
13. own-hash field exclusion;
14. golden vectors;
15. rejection vectors.

Failure to answer any item keeps the domain hashing-disabled.

---

# 15. Metadata law — explicit, not blanket

Normally metadata rather than scientific content:

```text
generated row/object IDs
createdAt / updatedAt
correlationId
idempotencyKey
worker/job/attempt IDs
lease/retry metadata
storage locator/compression
actor/principal/tenant/account authority evidence
```

This is not a universal blacklist.

If an owner proves one of these is scientifically material, it must include it explicitly and justify the binding.

Likewise, a domain UUID is not automatically excluded when identity of that exact record is itself scientifically material.

No runtime ignore-list decides this. The payload schema does.

---

# 16. Known owner-slice consequences

## 16.1 Template lifecycle

Current working `ResearchTemplateVersionV1` mixes immutable version content with `status: ACTIVE | RETIRED`.

A2 freezes only this law:

```text
mutable lifecycle status MUST NOT silently mutate an already-published immutable template content hash
```

A3/A4 must separate lifecycle state or prove every lifecycle change creates a new immutable version.

Until then, template hashing remains disabled.

## 16.2 Dataset ordering

Earlier working rule:

```text
DatasetSnapshot.series
sort by canonicalSeriesId, then seriesRefId
```

is rejected as canonical ordering because `seriesRefId` is generated record identity used merely as tie-breaker.

A5 must choose an exact safe model:

```text
A) semantic series key UNIQUE -> duplicate rejected

or

B) stable semantic key + stable semantic/content-hash discriminator
```

No generated UUID tie-break fallback.

The same rule applies to artifact/template/reference collections previously sorted only by generated IDs.

---

# 17. Golden vectors

## 17.1 Legacy working vectors A/B/C — independently verified, not A2 normative payloads

The previous working byte streams were independently recomputed and their binary SHA-256 digests are mathematically correct:

```text
A 143ABC3C0E18E00DB486B978665FABC89468A86F2E6513161647C69C8FDB9B7E
B 1827D6293C6F0FCBAD9387042F6C634B4B57E0C0178AAFE384AA9658B402CB97
C 97CD0559988A8FA2234716487D98C1BF1D2A059DF8E49777659080F4AB0EEA59
```

They are retained for traceability only because A2 supersedes their incomplete payload/hash-ref conventions.

## 17.2 Vector D — NFC + exact JSON escaping

Pre-admission text:

```text
cafe + U+0301 + newline + "x" + backslash + y
```

After NFC admission, canonical JSON:

```json
{"schemaVersion":"CANONICAL_TEXT_VECTOR_V1","text":"café\n\"x\"\\y"}
```

Exact UTF-8 hex:

```text
7B22736368656D6156657273696F6E223A2243414E4F4E4943414C5F544558545F564543544F525F5631222C2274657874223A22636166C3A95C6E5C22785C225C5C79227D
```

Test-only preimage:

```text
utf8("SYNTRAKE:CANONICAL_TEST:V1") || 0x0A || canonical_json_bytes
```

Expected SHA-256:

```text
0607C97E6E2663D8EE4AF608A042D84BA477E3B59B52E9147C5AE71695CD1B9E
```

Composed `é` and decomposed `e + U+0301` as `CanonicalTextV1` must produce the same admitted bytes.

The same two scalar sequences as `CanonicalOpaqueStringV1` are intentionally byte-distinct.

A lone surrogate is rejected.

## 17.3 Vector E — exact Run input envelope

Canonical payload:

```json
{"datasetSnapshot":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:DATASET_SNAPSHOT:V1","hashHex":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD","hashVersion":"SYNTRAKE_SHA256_V1"},"deterministicSeed":"seed-001","engineId":"HISTORICAL_EXECUTION_ADAPTER","engineVersion":"V1","executionConfig":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:EXECUTION_CONFIG:V1","hashHex":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","hashVersion":"SYNTRAKE_SHA256_V1"},"experiment":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:EXPERIMENT:V1","hashHex":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC","hashVersion":"SYNTRAKE_SHA256_V1"},"materialPolicies":[{"policyId":"FX","policyVersion":"FX_V1"},{"policyId":"MISSING_DATA","policyVersion":"MISSING_DATA_V1"}],"metricRegistryVersion":"METRICS_V1","metricRequestSet":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:METRIC_REQUEST_SET:V1","hashHex":"EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE","hashVersion":"SYNTRAKE_SHA256_V1"},"researchEnvironment":"HISTORICAL_BACKTEST","researchIr":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_IR:V1","hashHex":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","hashVersion":"SYNTRAKE_SHA256_V1"},"researchSourceContext":"PURE_RESEARCH","researchSpec":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_SPEC:V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","hashVersion":"SYNTRAKE_SHA256_V1"},"runType":"HISTORICAL_BACKTEST","schemaVersion":"RUN_INPUT_HASH_PAYLOAD_V1"}
```

Expected hash for `SYNTRAKE:RUN_INPUT:V1\n` + exact payload bytes:

```text
48605C6D47930999F42958C52851B45B18EDBF35F2045628BF108A31F89352B6
```

Required properties:

```text
materialPolicies input reorder -> same canonical bytes/hash
duplicate policyId             -> reject
wrong nested hashDomain         -> reject
change nested digest            -> hash changes
change engine/version           -> hash changes
change sourceContext            -> hash changes
change runType/environment      -> hash changes
change seed/policy version      -> hash changes
change correlation/worker/retry -> impossible inside closed payload; Run hash unchanged
```

## 17.4 Vector F — EvidenceObject uncompressed content

Descriptor canonical JSON:

```json
{"artifactSchemaVersion":"ENGINE_LOG_SUMMARY_V1","contentByteLength":"4","format":"text/plain; charset=utf-8","kind":"ENGINE_LOG_SUMMARY","schemaVersion":"EVIDENCE_CONTENT_DESCRIPTOR_V1"}
```

Scientific content bytes:

```text
61 62 63 0A
```

Exact preimage:

```text
utf8("SYNTRAKE:EVIDENCE_OBJECT:V1")
|| 0x0A
|| descriptor_json_bytes
|| 0x0A
|| 0x61 0x62 0x63 0x0A
```

Expected SHA-256:

```text
0EF6EC9749E99DF97644FA30F143EA6BD5D9D3D8C7C0AEABBB18E89AF34654F4
```

Changing gzip level or storage locator must not change this scientific hash.

Changing descriptor or scientific bytes must change it.

## 17.5 Rejection/canonicalization vectors

```text
+1                     INVALID decimal
01                     INVALID decimal
1e3                    INVALID decimal
-0                     INVALID decimal
1.2300                  canonicalizes to 1.23 before payload
0.500                   canonicalizes to 0.5 before payload
JSON numeric 1         INVALID scientific payload
JSON numeric 1.0       INVALID scientific payload
NaN / Infinity         INVALID
UUID uppercase         canonicalize/validate lowercase before payload
millisecond timestamp  INVALID canonical instant
+00:00 timestamp       INVALID canonical output
undeclared array       INVALID
unordered duplicate    INVALID
arbitrary map          INVALID unless exact schema
duplicate JSON key     INVALID
wrong hash domain      INVALID
self hash in payload   INVALID
```

---

# 18. Cross-runtime parity gate

Before implementation is ever accepted, exact bytes/digests must match across runtime boundaries Syntrake actually uses.

Minimum eventual proof:

```text
TypeScript canonical encoder
PostgreSQL transport/persistence round-trip where relevant
independent golden-vector recomputation
```

Compare bytes/digest text, not merely parsed semantic equality.

Browser parity becomes required only if canonical hashing is introduced in a browser runtime.

---

# 19. Fail-closed hash admission

Block canonical hash creation/persistence on:

```text
unknown schema version
unknown/unexpected hash domain
own hash field inside payload
undeclared field
missing required field
undeclared array semantics
unordered duplicate
unstable/generated-only sort tie-break
invalid Unicode scalar text
wrong text primitive/normalization
invalid UUID
invalid decimal/integer grammar
unfrozen numeric bounds required by owner
invalid timestamp/date
JSON number
arbitrary map without exact schema
unknown hash algorithm/version
lowercase/mixed-case I5 canonical hash text
required nested scientific domain still hashing-disabled
output-changing Run value not bound by envelope
Evidence storage representation confused with scientific identity
```

No best-effort fallback exists.

---

# 20. A2 design-gate closure criteria

I5-A2 may be accepted only when:

```text
canonical primitive grammar               CLOSED
Text vs OpaqueString distinction          CLOSED
canonical JSON emitter                    CLOSED
collection admission law                  CLOSED
uppercase SHA-256 representation           CLOSED
HashRef includes exact domain              CLOSED
domain-preimage law                       CLOSED
self-hash recursion                       CLOSED
identity-class separation                 CLOSED
stable reference law                      CLOSED
RunInput outer preimage                     CLOSED
RunType/sourceContext binding               CLOSED
EvidenceObject byte identity                CLOSED
owner-domain disable-until-exact rule       CLOSED
A2 golden vectors independently recomputed PASS
predecessor contradiction audit             PASS
repo CI at exact candidate SHA               PASS
new failures vs exact baseline               ZERO
```

A2 acceptance does **not** mean every I5 object hash is executable. It means no owner slice may compute one until it satisfies this exact byte/preimage framework.

---

# 21. Explicit non-actions

This contract authorizes none of:

```text
runtime implementation
DB schema
migration
DDL/DML
Supabase branch creation
production deploy
merge
Trading import/reuse
financial mutation
broker/paper execution
recommendation generation
```

After an accepted A2 design gate, the next owner step is I5-A3 roots/revisions/immutability — not runtime implementation.
