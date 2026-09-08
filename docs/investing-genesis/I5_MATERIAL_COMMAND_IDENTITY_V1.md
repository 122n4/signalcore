# I5 Material Command Identity V1

Status: candidate owner contract with deterministic runtime; no persistence authority.
Exact predecessor: `d6f45f3edce536d552fb9d2d740aa43d80d1b1b7`.

## Authority and scope

This contract owns only `RESEARCH_INVESTIGATION_CREATE_V1`,
`RESEARCH_DRAFT_REVISION_CREATE_V1`, and `RESEARCH_HYPOTHESIS_REVISION_CREATE_V1`.
It applies A1, A2 plus its amendment, and A3 with precedence
V3 > V2 > V1 amendment > original. I4-B is a framing precedent only.

The deterministic functions consume **derived material evidence, not authority**.
`ResearchMaterialScopeEvidenceV1` is a data projection, never an alternative
`AuthorizedInvestingContext`. Computing these bytes proves neither ownership nor
permission. A future application must first resolve canonical, operation-specific
Research authority, strictly validate the client command, and construct this
projection itself. It must not deserialize scope evidence from a client request.
This slice does not implement that application, a resolver, or TENANT_SCOPE.
The existing ACCOUNT_AUTHORITY_READ capability does not authorize these operations.

| sourceContext | actorKind | operationScope | tenantId | accountId |
|---|---|---|---|---|
| PURE_RESEARCH | USER_PRINCIPAL | TENANT_SCOPE | canonical required | absent |
| TEST_PORTFOLIO | USER_PRINCIPAL | TENANT_SCOPE | canonical required | absent |
| USER_PORTFOLIO | USER_PRINCIPAL | ACCOUNT_SCOPE | derived from account | canonical required |

All operations bind the canonical Principal UUID, following I4-B's material
request precedent: changing the Principal changes the request even for identical
content and ownership. They additionally bind actor kind and exact actor ID.
In the accepted authority runtime (`authority/context.ts`), USER_PRINCIPAL actorId
is the verified Clerk externalSubject, **not** principalId and **not** a UUID.
It is copied without trimming, normalization, case folding or provider-prefix
invention. This identity format admits 1..4096 UTF-8 bytes of valid Unicode scalar
text for that copied value; this is a serialization bound, not an actor resolver.
No fake SYSTEM_ACTOR or service-role authority is admitted.

For Investigation creation, sourceContext is the authorized requested context.
For revision creation, the server derives it and the ownership tuple from the
resolved Investigation. Client selectors never establish these facts. Future
transaction-time revalidation, same-scope object resolution, lifecycle eligibility,
idempotency reservation/replay and CAS remain mandatory under A1/A3.

## Exact framing and scalar rules

Domain/version: `SYNTRAKE_INVESTING_I5_MATERIAL_COMMAND_REQUEST_V1`.
Algorithm: SHA-256; output: exactly 64 uppercase hexadecimal characters.
This domain is separate from the scientific HashDomainV1 registry and never
admits ResearchSpec or another disabled scientific domain.

For each ordered fragment list below:

```text
preimage = UTF8(fragment[0]) || 0x00 || ... || 0x00 || UTF8(fragment[last])
hash = UPPERCASE_HEX(SHA256(preimage))
```

No leading/trailing separator, BOM, newline, whitespace padding, JSON encoding,
or platform newline conversion. Literal labels and tokens are case-sensitive.
All variable values except actorId are closed ASCII tokens, canonical UUIDs,
canonical decimal counters, canonical hashes, or the exact sentinel `-`.
actorId is encoded as uppercase hex of its exact UTF-8 bytes. Thus no variable
fragment can contain NUL: splitting on NUL uniquely recovers the ordered
fragments, and hex decoding uniquely recovers the actor. Even an actor containing
NUL, equals, newline, or non-ASCII text cannot inject a fragment.

UUID: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
No UUID version assumption; no uppercase normalization or coercion.
CAS: `^(0|[1-9][0-9]*)$`, range 0..9223372036854775807.
Head revision: `^[1-9][0-9]*$`, range 1..9223372036854775807.
Counters are strings, never JSON numbers or floating-point conversions.
The maximum itself has a request identity; this does not authorize overflowing
the counter in a future mutation. Increment/eligibility belongs to the transaction.

All input objects are closed plain records with own enumerable data properties.
Unexpected fields, missing required fields, undefined, accessors, symbol keys,
class instances and alternative sentinel encodings fail closed. No runtime
ignore-list projects arbitrary client JSON into canonical identity.

## Common prefix C (all operations, exact order)

```text
SYNTRAKE_INVESTING_I5_MATERIAL_COMMAND_REQUEST_V1
<exact operation token>
actor_kind=USER_PRINCIPAL
actor_utf8_hex=<uppercase UTF8 hex of canonical actorId>
principal=<canonical principalId>
scope=<TENANT_SCOPE or ACCOUNT_SCOPE>
tenant=<canonical tenantId>
account=<canonical accountId or ->
source_context=<PURE_RESEARCH or TEST_PORTFOLIO or USER_PORTFOLIO>
```

TENANT_SCOPE accountId must be absent as an object property; null and explicit
undefined are rejected. Its one framing representation is `account=-`.
ACCOUNT_SCOPE accountId must be present and canonical. No absent-field fallback
selects a scope. The operation token is validated by its dedicated function.

## Investigation create preimage

Exactly C with operation `RESEARCH_INVESTIGATION_CREATE_V1`; no suffix.
No caller-selectable title, stage, lifecycle or new ID is admitted here.
A3 initial state remains fixed: DRAFT, IDEA, lifecycleVersion 0,
activePointerVersion 0, all pointers null, archivedAt absent. These are immutable
operation-version semantics, not hidden configurable input.

## Draft and Hypothesis revision preimages

Exactly C with the corresponding revision-create operation, followed by these
fragments in order (same labels for both operation-specific histories):

```text
investigation=<canonical investigationId>
content_algorithm=SHA-256
content_domain=<SYNTRAKE:RESEARCH_DRAFT:V1 or SYNTRAKE:HYPOTHESIS:V1>
content_version=SYNTRAKE_SHA256_V1
content=<uppercase scientific digest>
expected_active_pointer_version=<canonical CAS string>
expected_draft=<canonical UUID or ->
expected_hypothesis=<canonical UUID or ->
expected_spec=-
expected_experiment=-
root_state=<ABSENT or PRESENT>
expected_root=<canonical UUID or ->
expected_head=<canonical UUID or ->
expected_head_number=<canonical revision string or ->
```

The content input is the existing A4 `{ref, payload}` proof. Validate the exact
HashRef algorithm/domain/version and recompute the admitted A4 hash to check it.
Only that scientific identity enters the material preimage; there is no second
raw-prose hash. A4 payloads and scientific preimages remain unchanged.

The full A3 predecessor uses all five required fields, with its original names:
`expectedActivePointerVersion`, `expectedResearchDraftRevisionId`,
`expectedHypothesisRevisionId`, `expectedResearchSpecRevisionId`,
`expectedExperimentId`. Pointer absence is exact **null**, never omission.
Null encodes as `-`, which cannot be confused with a UUID.

For the current executable identity subset, Spec and Experiment expectations
must both be exactly null. Both fragments remain in every preimage. Non-null
values are rejected, not omitted or rewritten. This is an admission restriction,
not a reduction of A3's aggregate CAS. Future non-null admission requires an
explicit compatible owner contract and runtime change; historical V1 bytes must
stay unchanged. V3's dependency-aware invalidation remains controlling; only its
no-active-Spec case is currently representable. No transaction is implemented.

`expectedRoot` is exactly one of:

```text
{ state: "ABSENT" }
{ state: "PRESENT", rootId: UUID, headRevisionId: UUID, headRevisionNumber: string }
```

ABSENT emits `root_state=ABSENT`, `expected_root=-`, `expected_head=-`,
`expected_head_number=-`. Its own family's expected active pointer must be null.
PRESENT emits the three exact predecessor values. Empty roots are forbidden.
The new revision is 1 or predecessor head number + 1, determined by A3; generated
new root/revision IDs are not request material. Root head and active pointer are
separate evidence; the encoder does not assert they are equal or query lineage.
The future repository must prove root existence/absence, uniqueness, ownership
and head under the same transaction as aggregate CAS.

Draft and Hypothesis remain independent sibling histories. Hypothesis may be
created with a null Draft pointer. There is no `sourceDraftRevisionId` field.
The sibling pointer is bound solely as aggregate predecessor evidence.

## Exclusions and public runtime boundary

Each operation-specific function takes scope evidence and a closed command.
Commands contain the exact operation token and required opaque `idempotencyKey`
and `correlationId` (16..512 UTF-8 bytes each, valid scalars, no normalization).
These two fields are validated but **excluded** from the fragments. A different
key therefore has the same material hash for the same material request but is
never automatic replay: replay also requires the separate authorized namespace
and key. Correlation is audit linkage only.

Generated result IDs, generated creation timestamps, retry metadata, authority
membership/access record IDs, capability transport, UI/chat state, lifecycle
projections and full raw scientific prose are not independent preimage members.
Generated output metadata is not accepted as command input at all. Changing
output metadata cannot change the original request identity. Extra client
userId/principalId/actorId/tenantId/accountId/requestedBy/organizationId fields
on commands are rejected; accepted selectors and server evidence remain distinct.

Public exports are only the three validated operation-specific identity functions
and their data/result types. Each returns exact preimageBytes and a separately
branded materialRequestHash. Exposing these bytes is intentional for byte-parity
verification; no generic prefix/fragment builder or arbitrary-domain hash API is
exported. Bytes contain actor/scope information and are not public audit logs.

## Fixed vectors and non-scope

`tests/fixtures/investingI5MaterialRequestV1.json` fixes seven complete preimages
(JSON escapes encode literal NUL bytes), byte lengths and SHA-256 digests: all
three creation contexts and first/successor requests for both revision families.
The fixture preimages/digests were assembled independently in PowerShell/.NET
SHA-256 without importing the TypeScript encoder. Tests compare complete UTF-8 bytes and hashes,
including a fixed one-byte mutation, rejection cases and metadata exclusions.

No DB, migration, RLS, Supabase, repository, authority resolver, CAS transaction,
idempotency/event table, archive, ontology, compiler, execution, workers, engine,
ResearchSpec/Experiment/DatasetSnapshot/Run/Result implementation, Trading or
financial mutation. ENGINE_STATE remains ABSENT. This closes request identity
only; it does not by itself pass the later durable-core execution gate.
