# Syntrake Investing Genesis I5-A — Canonical Bytes + Hash Preimages V1

Status: `WORKING CONTRACT — A2 CANDIDATE — NOT FROZEN`

Parent branch HEAD before this document:

```text
fc168738f2e74c69fc2cf51af8f78b1729249bdc
```

Purpose: close I5-A2 without inventing scientific/domain semantics that belong to later I5-A design steps.

This document is design only.

It does not implement runtime, schema, migrations, RLS, workers, datasets, metrics, backtests, Trading integration, Supabase changes, Vercel production deploys, or financial writes.

---

# 1. Controlling law and supersession

I0/I1 and the exact I4 freeze remain predecessor authority.

For I5 canonical bytes, primitive encoding, hash representation, hash preimage construction, self-hash exclusion, and scientific-vs-storage identity, this document supersedes conflicting statements in earlier working I5 documents.

Earlier I5 documents remain useful design history but are not controlling where they conflict with this contract.

In particular, the following earlier working statements are superseded where applicable:

```text
"standard JSON escaping"
"safe integers may be JSON integers"
"lowercase hash hex"
"Run input hash binds at least ..."
"raw-or-canonical-bytes"
"sort by generated object ID as generic tie-breaker"
```

No earlier I5 working hash vector is frozen merely because its digest is mathematically correct.

---

# 2. I5-A2 scope boundary

I5-A2 freezes:

1. canonical scientific scalar primitives;
2. canonical structured byte emission;
3. collection admission rules;
4. SHA-256 textual representation for I5 Investing hashes;
5. domain separation preimage law;
6. hash-bearing wrapper/payload separation;
7. scientific content identity vs record identity vs request identity vs storage integrity;
8. stable reference binding law;
9. exact Run-input hash envelope;
10. exact EvidenceObject scientific-content byte identity;
11. fail-closed admission for hash domains whose semantic payload schema is not yet frozen;
12. golden vectors for the rules that are closed here.

I5-A2 does **not** invent the final semantic field schema for ResearchDraft, Hypothesis, ResearchSpec, Experiment, DatasetSnapshot, Result, metrics, or final RESEARCH_IR_V1.

Those owner steps must later provide an exact `*_HASH_PAYLOAD_V1` schema before the corresponding hash domain is admitted.

Therefore:

```text
HASH DOMAIN DECLARED
!=
HASH DOMAIN ADMISSIBLE
```

If a domain's exact semantic payload is not frozen, hashing that domain is blocked rather than guessed.

---

# 3. Canonicalization pipeline

Every canonical scientific hash follows exactly this conceptual sequence:

```text
untrusted/material source values
  -> field-level validation
  -> field-level canonicalization
  -> closed versioned HASH_PAYLOAD object
  -> collection validation/sorting
  -> SYNTRAKE_CANONICAL_JSON_V1 bytes
  -> exact domain preimage
  -> SHA-256 digest bytes
  -> uppercase hexadecimal representation
```

No implementation may hash a persistence row/object wholesale.

No implementation may serialize arbitrary provider/native objects and call the result canonical.

No implementation may use insertion order, runtime locale, JavaScript floating point formatting, JavaScript `Date` formatting, PostgreSQL default text rendering, or database collation as scientific identity authority.

---

# 4. Canonical primitive vocabulary

## 4.1 CanonicalTextV1

Canonical scientific text is Unicode scalar text.

Admission rules:

1. input must contain only valid Unicode scalar values;
2. lone UTF-16 surrogate code units are invalid and must not be replaced with U+FFFD;
3. canonical scientific text is NFC-normalized before byte emission;
4. normalization occurs once at admission; canonical serialization never performs hidden normalization;
5. field-specific byte limits belong to the owner schema and are checked after NFC normalization;
6. raw binary evidence is not converted to CanonicalText merely to obtain a hash.

Canonical text preserves meaningful case, spaces, punctuation, and line breaks unless the owning field contract defines a stricter token grammar.

## 4.2 CanonicalTokenV1

Tokens are schema-defined finite values or schema-defined ASCII identifiers.

A token contract must define its exact grammar or closed enum.

Locale-aware case folding is forbidden.

Enum values are emitted exactly as defined by the schema.

## 4.3 CanonicalUuidV1

Canonical PostgreSQL UUID textual representation is:

```text
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

Rules:

- lowercase only in canonical payloads;
- no braces;
- no `urn:uuid:` prefix;
- no UUID-version assumption beyond canonical PostgreSQL textual shape unless a later owner schema adds one.

Generated UUID identity is not automatically scientific content identity.

## 4.4 CanonicalActorId

`actor_id` is **not** a generic UUID primitive.

The real predecessor authority runtime uses a string actor identity and keeps it distinct from canonical `principal_id`.

I5 scientific content hashes do not gain actor identity merely because a record was created by an actor.

Authority/audit persistence owns actor-ID validation; this A2 scientific-byte contract does not reinterpret an external actor identifier as UUID.

## 4.5 CanonicalDecimalV1

Canonical decimal textual grammar:

```text
^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$
```

Additional rule:

```text
-0 = INVALID
```

Equivalent inputs are canonicalized before admission:

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

The primitive does not silently invent precision/range.

Every owning financial/scientific field must additionally freeze:

- sign permission;
- minimum/maximum;
- maximum integer digits;
- maximum fractional scale;
- unit semantics.

JavaScript `number` is never canonical authority for a decimal financial/scientific value.

## 4.6 Money, ratio, percentage, basis points

A numeric string alone is not enough where unit changes meaning.

Canonical money requires at least:

```ts
interface CanonicalMoneyV1 {
  amount: CanonicalDecimalV1;
  currency: CanonicalTokenV1;
}
```

The owning schema defines the accepted currency vocabulary.

Canonical ratios/percentages/basis points require explicit unit semantics.

Examples of different meanings that must never be silently conflated:

```text
0.01 RATIO
1 PERCENT
100 BASIS_POINTS
```

A cost/slippage field must freeze its unit and range explicitly.

## 4.7 CanonicalIntegerV1

Scientific hash payloads do not emit JSON numeric integers.

Canonical integer representation inside hash payloads is a JSON string using base-10 integer text.

Generic signed grammar:

```text
^-?(?:0|[1-9][0-9]*)$
```

`-0` is invalid.

The owner schema must freeze exact bounds for every integer field.

This avoids JavaScript safe-integer ambiguity and cross-language numeric rendering differences.

## 4.8 CanonicalTimestampUtcMicrosV1

Canonical instant representation is exactly:

```text
YYYY-MM-DDTHH:mm:ss.ffffffZ
```

Rules:

- UTC only;
- exactly six fractional digits;
- valid proleptic Gregorian calendar date;
- four-digit year `0001..9999`;
- hour `00..23`;
- minute `00..59`;
- second `00..59`;
- leap-second text `:60` is not admitted in V1;
- no offset form such as `+00:00` in canonical output;
- no millisecond-short form;
- no omitted fraction;
- PostgreSQL microsecond precision may be canonical source precision;
- JavaScript `Date` must not be the authority where it would truncate canonical microseconds.

Examples:

```text
2026-09-06T18:20:48.123456Z  VALID
2026-09-06T18:20:48.123Z     INVALID CANONICAL FORM
2026-09-06T20:20:48+02:00    INPUT MAY BE PARSED ONLY IF OWNER CONTRACT ALLOWS; NOT CANONICAL OUTPUT
```

## 4.9 CanonicalDateV1

Canonical date-only representation is exactly:

```text
YYYY-MM-DD
```

It must be an actual Gregorian calendar date with year `0001..9999`.

A date-only value never silently becomes an instant.

## 4.10 CanonicalSha256HexV1

I5 Investing SHA-256 textual representation is:

```text
^[0-9A-F]{64}$
```

Canonical representation is **uppercase hexadecimal**.

Binary digest identity is SHA-256; textual casing is part of the persisted canonical representation contract.

This aligns I5 Investing hash text with the exact I4 Investing predecessor convention.

---

# 5. SYNTRAKE_CANONICAL_JSON_V1

Canonical structured scientific payload bytes use:

```text
SYNTRAKE_CANONICAL_JSON_V1
```

This section is exact and supersedes the earlier working I5 JSON rules.

## 5.1 Allowed JSON value classes

Canonical scientific hash payloads may contain only:

```text
object
array
string
boolean
null when schema explicitly declares null semantically distinct
```

Canonical scientific hash payloads **do not contain JSON numbers**.

Decimals and integers are canonical strings.

This eliminates cross-language JSON number ambiguity.

## 5.2 Objects

Rules:

1. every object shape is closed and versioned by schema;
2. arbitrary map objects are forbidden unless a later exact schema freezes the key domain and ordering;
3. duplicate JSON keys are invalid at admission and must never be last-write-wins canonicalized;
4. object keys are emitted in ascending Unicode code-point order;
5. canonical schema keys should be fixed ASCII field names;
6. no insignificant whitespace is emitted;
7. optional absent fields are omitted;
8. `undefined` does not exist in canonical payloads;
9. `null` is emitted only when the exact field schema says null has a distinct meaning.

## 5.3 String emission

String values are already field-canonicalized before JSON emission.

The canonical emitter then applies exactly these escaping rules:

```text
U+0022  "     -> \"
U+005C  \     -> \\
U+0008        -> \b
U+0009        -> \t
U+000A        -> \n
U+000C        -> \f
U+000D        -> \r
other U+0000..U+001F -> \u00xx using lowercase hex digits
```

Rules:

- `/` is never escaped;
- non-ASCII Unicode scalar values are never converted to `\uXXXX`; they are emitted as UTF-8;
- U+2028/U+2029 are emitted as UTF-8, not escaped;
- no BOM;
- no optional escape form may be chosen by runtime/library preference.

Example canonical string payload:

```json
{"schemaVersion":"CANONICAL_TEXT_VECTOR_V1","text":"café\n\"x\"\\y"}
```

## 5.4 Arrays and collections

Every array field admitted into a scientific hash payload must be declared as exactly one of:

```text
ORDERED_SEQUENCE
UNORDERED_SET
```

No undeclared array is admissible.

### ORDERED_SEQUENCE

- preserves exact semantic sequence;
- reordering changes canonical bytes;
- duplicates are allowed only if the owner schema explicitly permits them.

### UNORDERED_SET

- requires a schema-defined stable canonical sort key;
- requires a schema-defined uniqueness key;
- duplicates are rejected before serialization;
- sort comparison uses canonical UTF-8 bytes / ASCII byte lexical order as specified by the field contract, never locale/database collation;
- generated row UUIDs are forbidden as generic tie-breakers;
- if two elements have the same declared semantic key and no further stable semantic discriminator exists, admission fails rather than sorting by generated identity.

This explicitly supersedes `DatasetSnapshot.series -> canonicalSeriesId, then seriesRefId` as a generic canonical rule.

A5 must either prove semantic uniqueness of the canonical series key or define a stable semantic/content-hash discriminator.

## 5.5 Forbidden canonical inputs

The following are forbidden inside canonical scientific hash payloads:

```text
undefined
NaN
Infinity
-Infinity
functions
class instances
Date objects
Buffer objects as JSON objects
provider-native payloads
arbitrary maps without an exact schema
floating-point JSON numbers
unbounded numeric values
```

Binary evidence uses the separate EvidenceObject byte contract below.

---

# 6. Hash algorithm, domain separation and textual representation

Hash algorithm:

```text
SHA-256
```

Hash representation/version token:

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

Persisted/display canonical digest text:

```text
UPPERCASE_HEX_64
```

Domain prefix is part of the hash contract.

A domain rename or preimage-schema change requires a new domain/version. Historical hashes are never rewritten.

---

# 7. HashRefV1

A nested scientific hash reference is never an untyped 64-character string in a hash payload.

Exact hash-reference shape:

```ts
interface HashRefV1 {
  hashAlgorithm: "SHA-256";
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}
```

Canonical object key sorting determines byte order.

A future algorithm or textual representation version must use a different version token and coexist with historical refs.

---

# 8. Self-hash recursion closure

A hash-bearing persistence/domain wrapper and the bytes it identifies are different shapes.

Required law:

```text
PERSISTED_OBJECT_V1
  contains contentHash/resultHash/snapshotHash/...

HASH_PAYLOAD_V1
  MUST NOT contain the hash field that identifies it
```

The hash is always computed over an explicit projection:

```text
PersistedObject
  -> exact HASH_PAYLOAD_V1 projection
  -> canonical bytes
  -> hash
  -> hash stored on wrapper/row
```

Forbidden:

```text
hash(canonicalize(full_object_including_its_own_hash))
placeholder-self-hash tricks
recursive hash convergence
"serialize everything except whatever the runtime happens to ignore"
```

Every admitted hash domain must have an exact named payload schema.

---

# 9. Identity classes must remain disjoint

I5 recognizes at least four different identity/integrity concepts.

## 9.1 Scientific content hash

Answers:

```text
what immutable scientific content/evidence/input is this?
```

It is not authorization.

It is not idempotency.

It is not a database primary key.

## 9.2 Material request hash

Answers:

```text
what exact material state-transition request is this?
```

When I5 later introduces material request hashes, they must follow the I4 pattern of operation-specific exact preimages and remain domain-separated from scientific content hashes.

Authority/scope identity, object selectors, expected CAS/version and scientific content hashes may be material to a request even when they are excluded from scientific content identity.

Correlation IDs, queue metadata and retry metadata are not silently added.

`idempotency_key` scopes replay lookup; it is not automatically scientific content and is not automatically the material request hash itself.

## 9.3 Record identity

Generated UUIDs identify persisted records/lineage.

A generated record ID is not automatically scientific content.

## 9.4 Storage integrity

Compression, object locator, storage provider, multipart representation and stored-byte digest are storage concerns.

They do not become scientific content identity unless an exact scientific artifact contract explicitly says the representation itself is the evidence.

---

# 10. Stable scientific reference binding

A scientific hash payload must not use a generated database UUID as a substitute for immutable semantic identity when the referenced object's content can vary independently.

Default content reference shape:

```ts
interface CanonicalScientificRefV1 {
  objectKind: CanonicalTokenV1;
  objectSchemaVersion: CanonicalTokenV1;
  contentHash: HashRefV1;
}
```

A persistence wrapper may additionally carry a record ID for lookup/audit, but that record ID is outside the scientific hash unless the owner contract explicitly proves that **the identity of that exact record**, not merely its content, is scientifically material.

If exact record binding is scientifically material, the owner schema must use an explicit different shape such as:

```ts
interface CanonicalRecordBoundRefV1 {
  objectKind: CanonicalTokenV1;
  objectSchemaVersion: CanonicalTokenV1;
  objectId: CanonicalUuidV1;
  contentHash: HashRefV1;
}
```

The owner contract must justify why `objectId` participates.

There is no global law that all IDs are excluded, and there is no global law that all IDs are included.

The binding is decided hash-by-hash and made explicit by the payload schema.

---

# 11. Hash-domain admission registry

The following domains exist as I5 design domains. Their admission state after A2 is explicit.

| Domain | Status after A2 | Exact semantic payload owner |
|---|---|---|
| `SYNTRAKE:RESEARCH_DRAFT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 Draft exact schema |
| `SYNTRAKE:HYPOTHESIS:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 Hypothesis exact schema |
| `SYNTRAKE:RESEARCH_SPEC:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 ResearchSpec exact schema |
| `SYNTRAKE:RESEARCH_IR:V1` | `DECLARED_BUT_HASHING_DISABLED` | A9 final closed IR subset |
| `SYNTRAKE:EXPERIMENT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A3/A4 experiment identity |
| `SYNTRAKE:EXPERIMENT_PARAMETERS:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 typed parameter schema |
| `SYNTRAKE:DATASET_SERIES:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5 series/evidence content contract |
| `SYNTRAKE:DATASET_SNAPSHOT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5 DatasetSnapshot |
| `SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A5/A6 immutable projection schema |
| `SYNTRAKE:RUN_INPUT:V1` | `PREIMAGE_ENVELOPE_EXACT` | A2; nested refs remain unavailable until owner hashes exist |
| `SYNTRAKE:RESULT:V1` | `DECLARED_BUT_HASHING_DISABLED` | A6 Result exact schema |
| `SYNTRAKE:EVIDENCE_OBJECT:V1` | `CONTENT_PREIMAGE_EXACT` | A2 byte contract |
| `SYNTRAKE:RESEARCH_TEMPLATE:V1` | `DECLARED_BUT_HASHING_DISABLED` | A4 template immutable-version schema |
| `SYNTRAKE:METRIC_REQUEST_SET:V1` | `DECLARED_BUT_HASHING_DISABLED` | A8 metric registry/math |
| `SYNTRAKE:EXECUTION_CONFIG:V1` | `DECLARED_BUT_HASHING_DISABLED` | A8 deterministic adapter semantics |

`DECLARED_BUT_HASHING_DISABLED` means runtime must fail closed if asked to compute/persist that canonical hash before the owner schema is frozen.

This is intentional. A2 does not fabricate scientific semantics to make all domains executable prematurely.

---

# 12. Exact RunInputHashPayloadV1

A2 freezes the outer Run scientific-input identity envelope.

Exact payload shape:

```ts
interface RunInputHashPayloadV1 {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1";
  researchEnvironment: "HISTORICAL_BACKTEST" | "SIMULATION";
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

interface MaterialPolicyRefV1 {
  policyId: CanonicalTokenV1;
  policyVersion: CanonicalTokenV1;
}
```

`materialPolicies` is an `UNORDERED_SET`:

```text
uniqueness key = policyId
sort key       = policyId ASCII bytes ASC
```

Duplicate `policyId` is invalid.

The Run input hash is:

```text
SHA256(
  utf8("SYNTRAKE:RUN_INPUT:V1")
  || 0x0A
  || canonical_json(RunInputHashPayloadV1)
)
```

rendered as uppercase hex.

## 12.1 Inclusion law

Every value capable of changing deterministic engine output must be reachable through one of the exact fields above.

Examples:

- ResearchSpec semantics -> `researchSpec` hash;
- executable typed IR -> `researchIr` hash;
- experiment semantics/parameters -> `experiment` hash;
- exact historical/scientific dataset -> `datasetSnapshot` hash;
- account projection when USER_PORTFOLIO -> `accountResearchContext` hash;
- engine implementation -> `engineId` + `engineVersion`;
- metric implementations/requests -> registry version + metric request set hash;
- cost/slippage/contribution/valuation/FX/execution semantics -> `executionConfig` and/or IR according to their later exact owner contract;
- deterministic policies capable of changing output -> `materialPolicies`;
- seed -> `deterministicSeed` when applicable.

If any output-changing value is not bound by an admitted nested hash or explicit field, Run creation is blocked.

## 12.2 Exclusion law

RunInputHashPayloadV1 does not contain:

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

These may matter to authority, audit, lineage, idempotency, operation identity, or storage, but they do not change deterministic scientific computation merely by existing.

Account-specific financial facts affect scientific input only through the immutable account-research-context content hash.

---

# 13. Exact EvidenceObject scientific-content identity

EvidenceObject scientific content identity is computed over **canonical uncompressed content bytes**, not over storage representation.

Exact descriptor:

```ts
interface EvidenceContentDescriptorV1 {
  schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1";
  kind: CanonicalTokenV1;
  artifactSchemaVersion: CanonicalTokenV1;
  format: CanonicalTextV1;
  contentByteLength: CanonicalIntegerV1;
}
```

`contentByteLength` is the length of the uncompressed scientific content byte sequence.

Exact preimage:

```text
utf8("SYNTRAKE:EVIDENCE_OBJECT:V1")
|| 0x0A
|| SYNTRAKE_CANONICAL_JSON_V1(EvidenceContentDescriptorV1)
|| 0x0A
|| exact_uncompressed_content_bytes
```

Hash:

```text
SHA256(preimage) -> UPPERCASE_HEX_64
```

Rules:

- content bytes are immutable after publication;
- text artifacts must define their own exact text-byte schema before publication;
- structured artifacts must define their own exact canonical schema before publication;
- binary artifacts hash their exact scientific content bytes;
- absence is `UNAVAILABLE`, not an empty artifact;
- `storageLocator` is excluded;
- storage provider is excluded;
- compression algorithm/level is excluded;
- compressed byte length is excluded;
- upload timestamp is excluded;
- retry/multipart metadata is excluded.

A storage implementation may separately persist:

```text
storedByteLength
compression
storageLocator
storageSha256Hex
```

where `storageSha256Hex` is an integrity digest over exact stored bytes.

That storage digest is **not** `EvidenceObject.contentHash`.

Thus recompressing the same admitted scientific content does not change scientific identity.

---

# 14. Scientific content payload rules for later owner slices

Before any `DECLARED_BUT_HASHING_DISABLED` domain becomes admissible, its owner design must define a named payload such as:

```text
RESEARCH_SPEC_HASH_PAYLOAD_V1
DATASET_SNAPSHOT_HASH_PAYLOAD_V1
RESULT_HASH_PAYLOAD_V1
```

The owner contract must provide all of:

1. exact field list;
2. exact field types;
3. exact required/optional/null law;
4. exact primitive bounds;
5. exact nested scientific reference type for every reference;
6. exact collection class for every array;
7. uniqueness key for every unordered set;
8. stable sort key for every unordered set;
9. duplicate behavior;
10. exact inclusion/exclusion of generated IDs;
11. exact inclusion/exclusion of record timestamps;
12. exact inclusion/exclusion of provenance/evidence references;
13. own-hash field exclusion;
14. golden vectors;
15. rejection vectors.

If the owner cannot answer one of these, the hash domain remains disabled.

---

# 15. Default metadata law — not a blanket rule

For scientific **content** hashes, these values are normally metadata rather than content:

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

However, this is not a universal exclusion rule.

If an owner design proves one of those values is scientifically material, it must include it explicitly in the named payload and justify the binding.

Likewise, an arbitrary domain UUID is not automatically excluded if the identity of that exact referenced record is scientifically material.

No hidden serializer blacklist decides this at runtime.

The payload schema decides it explicitly.

---

# 16. Template lifecycle note

The current working `ResearchTemplateVersionV1` mixes immutable version content with `status: ACTIVE | RETIRED`.

A2 does not resolve template lifecycle ownership, which belongs to A3/A4.

But A2 freezes this hash rule:

```text
mutable lifecycle availability/status MUST NOT silently mutate bytes of an already-published immutable template-version content hash
```

A3/A4 must either:

- separate immutable template-version content from mutable availability/lifecycle state; or
- prove lifecycle status itself is immutable per version and creates a new version on change.

Until then, `SYNTRAKE:RESEARCH_TEMPLATE:V1` remains hashing-disabled.

---

# 17. Dataset ordering note

The earlier working rule:

```text
DatasetSnapshot.series
sort by canonicalSeriesId, then seriesRefId
```

is not accepted for A2 freeze because `seriesRefId` is generated record identity.

A5 must choose one exact safe model:

```text
A) semantic series key is UNIQUE
   -> duplicate key rejected

or

B) stable semantic key + stable content/provenance hash discriminator
   -> generated UUID never used only to obtain deterministic order
```

If A5 cannot prove deterministic semantic uniqueness/order, DatasetSnapshot hashing remains disabled.

The same scrutiny applies to artifact/template/reference arrays whose earlier working sort keys use generated IDs.

---

# 18. Golden vectors

All vectors below are normative for this A2 candidate.

## 18.1 Existing working vectors A/B/C

The previous three working I5 SHA-256 vectors were independently recomputed and their binary digests are correct.

A2 changes canonical textual digest representation to uppercase.

Therefore their A2 textual forms are:

```text
Vector A
143ABC3C0E18E00DB486B978665FABC89468A86F2E6513161647C69C8FDB9B7E

Vector B
1827D6293C6F0FCBAD9387042F6C634B4B57E0C0178AAFE384AA9658B402CB97

Vector C
97CD0559988A8FA2234716487D98C1BF1D2A059DF8E49777659080F4AB0EEA59
```

These vectors prove only the exact historical sample byte streams. They do not by themselves make Draft/Spec/Experiment hashing admissible.

## 18.2 Vector D — NFC + exact JSON escaping

Pre-admission input text:

```text
cafe + U+0301 + newline + "x" + backslash + y
```

After NFC admission, canonical JSON bytes decode as:

```json
{"schemaVersion":"CANONICAL_TEXT_VECTOR_V1","text":"café\n\"x\"\\y"}
```

Exact UTF-8 hex:

```text
7B22736368656D6156657273696F6E223A2243414E4F4E4943414C5F544558545F564543544F525F5631222C2274657874223A22636166C3A95C6E5C22785C225C5C79227D
```

Test-only domain preimage:

```text
SYNTRAKE:CANONICAL_TEST:V1\n<canonical-json-bytes>
```

Expected SHA-256 uppercase:

```text
0607C97E6E2663D8EE4AF608A042D84BA477E3B59B52E9147C5AE71695CD1B9E
```

A composed `é` input and decomposed `e + U+0301` input must produce these same admitted bytes.

A lone surrogate input must be rejected rather than normalized/replaced.

## 18.3 Vector E — exact Run input envelope

Canonical payload:

```json
{"datasetSnapshot":{"hashAlgorithm":"SHA-256","hashHex":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD","hashVersion":"SYNTRAKE_SHA256_V1"},"deterministicSeed":"seed-001","engineId":"HISTORICAL_EXECUTION_ADAPTER","engineVersion":"V1","executionConfig":{"hashAlgorithm":"SHA-256","hashHex":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","hashVersion":"SYNTRAKE_SHA256_V1"},"experiment":{"hashAlgorithm":"SHA-256","hashHex":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC","hashVersion":"SYNTRAKE_SHA256_V1"},"materialPolicies":[{"policyId":"FX","policyVersion":"FX_V1"},{"policyId":"MISSING_DATA","policyVersion":"MISSING_DATA_V1"}],"metricRegistryVersion":"METRICS_V1","metricRequestSet":{"hashAlgorithm":"SHA-256","hashHex":"EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE","hashVersion":"SYNTRAKE_SHA256_V1"},"researchEnvironment":"HISTORICAL_BACKTEST","researchIr":{"hashAlgorithm":"SHA-256","hashHex":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","hashVersion":"SYNTRAKE_SHA256_V1"},"researchSpec":{"hashAlgorithm":"SHA-256","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","hashVersion":"SYNTRAKE_SHA256_V1"},"schemaVersion":"RUN_INPUT_HASH_PAYLOAD_V1"}
```

Expected SHA-256 for prefix `SYNTRAKE:RUN_INPUT:V1\n` + exact bytes:

```text
DB625DC824F4FCFD5E1C9A69A0930C0D9C49D93543FB775342FEF0E02416DDDA
```

Reordering the two `materialPolicies` input elements must canonicalize to the same bytes.

Duplicate `policyId=FX` must be rejected.

Changing any nested hash, engine version, metric registry version, execution-config hash, seed, material policy version, or research environment must change the hash.

Changing correlation ID, worker ID, queue timestamp or retry count must not change this hash because those fields are not members of the payload schema.

## 18.4 Vector F — EvidenceObject uncompressed content identity

Descriptor canonical JSON:

```json
{"artifactSchemaVersion":"ENGINE_LOG_SUMMARY_V1","contentByteLength":"4","format":"text/plain; charset=utf-8","kind":"ENGINE_LOG_SUMMARY","schemaVersion":"EVIDENCE_CONTENT_DESCRIPTOR_V1"}
```

Scientific content bytes:

```text
61 62 63 0A
```

which is UTF-8/ASCII:

```text
abc\n
```

Exact preimage:

```text
utf8("SYNTRAKE:EVIDENCE_OBJECT:V1")
|| 0x0A
|| descriptor_json_bytes
|| 0x0A
|| 0x61 0x62 0x63 0x0A
```

Expected SHA-256 uppercase:

```text
0EF6EC9749E99DF97644FA30F143EA6BD5D9D3D8C7C0AEABBB18E89AF34654F4
```

Compressing those four content bytes with any gzip level must not change this scientific content hash.

Changing the artifact schema version, format, kind, content length, or scientific content bytes must change the scientific content hash.

## 18.5 Rejection/canonicalization vectors

The eventual serializer test suite must assert at least:

```text
+1                     INVALID CanonicalDecimalV1
01                     INVALID CanonicalDecimalV1
1e3                    INVALID CanonicalDecimalV1
-0                     INVALID CanonicalDecimalV1
1.2300                  canonicalizes to 1.23 before payload admission
0.500                   canonicalizes to 0.5 before payload admission
JSON numeric 1         INVALID in scientific hash payload
JSON numeric 1.0       INVALID in scientific hash payload
NaN                    INVALID
Infinity               INVALID
UUID uppercase         canonicalizes/validates to lowercase UUID before payload admission
millisecond timestamp  INVALID canonical instant form
+00:00 timestamp       INVALID canonical output form
undeclared array       INVALID
unordered duplicate    INVALID
arbitrary map          INVALID unless exact schema admits it
duplicate JSON key     INVALID
self hash field inside HASH_PAYLOAD_V1 INVALID
```

---

# 19. Cross-runtime parity gate

Before I5-A freeze, canonicalization/hashing implementation must prove byte parity across the runtime boundaries actually used by Syntrake.

At minimum:

```text
TypeScript canonical encoder
PostgreSQL transport/persistence round-trip where relevant
independent golden-vector recomputation
```

The test must compare exact bytes/digest text, not merely parsed semantic equality.

Browser-only runtime is not automatically required if canonical hashing is server-only; if browser hashing is later introduced, browser parity becomes a gate before that feature is admitted.

---

# 20. Fail-closed rules

The following conditions block canonical hash creation/persistence:

```text
unknown schema version
unknown hash domain
payload contains own hash field
payload has undeclared field
required field missing
undeclared array semantics
unordered duplicate
unstable/generated-only sort tie-break
invalid Unicode scalar text
non-NFC CanonicalText after admission stage
invalid UUID representation
invalid decimal/integer grammar
unfrozen numeric bounds when owner schema requires them
invalid timestamp/date
JSON number in scientific hash payload
arbitrary map without closed schema
unknown nested hash algorithm/version
lowercase/mixed-case persisted I5 canonical hash text
referenced scientific hash domain not yet admitted
output-changing Run value not bound into RunInputHashPayloadV1
EvidenceObject storage representation used as scientific identity by accident
```

Failure is a validation/design error, not fallback-to-best-effort serialization.

---

# 21. A2 closure criteria

I5-A2 may be accepted as a design gate only when all of the following hold:

```text
A2 canonical primitive grammar             CLOSED
A2 canonical JSON emitter                  CLOSED
A2 collection admission law                CLOSED
A2 uppercase SHA-256 representation         CLOSED
A2 domain-preimage law                     CLOSED
A2 self-hash recursion                      CLOSED
A2 identity-class separation                CLOSED
A2 stable reference law                     CLOSED
A2 RunInput outer preimage                   CLOSED
A2 EvidenceObject byte identity              CLOSED
A2 owner-domain disable-until-exact rule     CLOSED
A2 golden vectors independently recomputed   PASS
A2 predecessor contradiction audit           PASS
repo CI at exact candidate SHA               PASS
new failures vs exact baseline               ZERO
```

A2 acceptance does **not** mean all I5 scientific object hashes are already executable.

It means they now have a precise byte/preimage framework and cannot become executable until their owner schemas satisfy it.

---

# 22. Explicit non-actions

This contract authorizes none of the following:

```text
runtime implementation
DB schema
migration
DDL
DML
Supabase branch creation
production deploy
merge
Trading import/reuse
financial mutation
broker execution
paper execution
recommendation generation
```

Next owner step after an accepted A2 design gate is I5-A3 roots/revisions/immutability, not runtime implementation.
