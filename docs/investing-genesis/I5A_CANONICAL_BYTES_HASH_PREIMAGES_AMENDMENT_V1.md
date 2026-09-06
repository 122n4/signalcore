# Syntrake Investing Genesis I5-A2 — Canonical Bytes/Hash Amendment V1

Status: `WORKING A2 GATE AMENDMENT — NOT I5-A FROZEN`

Parent A2 candidate:

```text
2cbd4b64c8baa9ff71413258ba1c4eb96f4fc2de
```

This amendment closes two material ambiguities found during independent post-write audit of:

```text
docs/investing-genesis/I5A_CANONICAL_BYTES_HASH_PREIMAGES_V1.md
```

It is design only. It changes no runtime, schema, migration, Supabase state, Trading code, or production state.

Where this amendment conflicts with the parent A2 candidate, this amendment controls.

---

# 1. Immutable deterministic version binding law

Any identifier/version token included in a scientific hash because it can affect deterministic output MUST resolve to one immutable implementation, schema, methodology, registry, or policy definition for all historical time.

Therefore the following are forbidden inside admitted scientific hash payloads when used as behavior identity:

```text
latest
current
stable
production
default
active
rolling aliases
mutable deployment labels
mutable package/channel tags
any token whose referenced implementation can change without changing the token
```

Examples of fields governed by this law include, when present in an admitted payload:

```text
engineId
engineVersion
metricRegistryVersion
metric implementation/version refs
compilerVersion
ontologyVersion
policyVersion
MaterialPolicyRefV1.policyVersion
execution configuration version refs
valuation methodology version
FX methodology version
cost methodology version
slippage methodology version
artifactSchemaVersion
```

A semantic version string such as `V1` is acceptable only if the owner contract proves it is an immutable identifier for one exact behavior/schema. Merely looking version-like is not proof.

If an external component is identified by a mutable release name, scientific identity must instead bind an immutable implementation identifier/content digest through a later exact owner payload.

Fail-closed rule:

```text
BEHAVIOR_VERSION_NOT_IMMUTABLE
  -> CANONICAL HASH ADMISSION BLOCKED
  -> RUN CREATION BLOCKED WHEN OUTPUT COULD CHANGE
```

Historical replay MUST NOT resolve the same scientific hash to different engine, metric, policy, compiler, ontology, execution, valuation, or FX behavior at different times.

---

# 2. Deterministic seed is opaque, not NFC semantic text

The parent A2 candidate typed:

```ts
deterministicSeed?: CanonicalTextV1;
```

That is superseded.

The exact field type is:

```ts
deterministicSeed?: CanonicalOpaqueStringV1;
```

Reason:

- a deterministic seed is machine material, not human semantic prose;
- two distinct admitted scalar sequences must not collapse merely because NFC would consider them canonically equivalent;
- the seed owner must freeze an exact non-empty byte bound before an executable Run type using a seed is admitted.

No trimming, case folding, Unicode normalization, numeric coercion, or locale conversion is allowed for a deterministic seed.

If a future Run type uses a numeric seed instead, that Run type must define a different explicit canonical seed primitive and versioned payload contract; it may not silently reinterpret this V1 field.

---

# 3. RunInputHashPayloadV1 corrected excerpt

The controlling A2 shape is therefore conceptually identical to the parent except for the seed primitive:

```ts
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
  deterministicSeed?: CanonicalOpaqueStringV1;
  materialPolicies: MaterialPolicyRefV1[];
}
```

`engineId`, `engineVersion`, `metricRegistryVersion`, and `materialPolicies[].policyVersion` are additionally subject to the immutable deterministic version binding law above.

---

# 4. Golden vector impact

The existing A2 Vector E uses ASCII seed:

```text
seed-001
```

Its canonical bytes are identical under `CanonicalTextV1` and `CanonicalOpaqueStringV1` because this fixture is ASCII.

Therefore Vector E expected SHA-256 remains exactly:

```text
48605C6D47930999F42958C52851B45B18EDBF35F2045628BF108A31F89352B6
```

Additional rejection/parity requirement before runtime admission:

```text
seed composed NFC sequence
!=
seed canonically-equivalent decomposed sequence
```

when both are admitted as distinct `CanonicalOpaqueStringV1` values.

---

# 5. A2 controlling set and consolidation law

Until a later consolidated I5-A design freeze document is created, the A2 controlling design set is:

```text
I5A_CANONICAL_BYTES_HASH_PREIMAGES_V1.md
+
I5A_CANONICAL_BYTES_HASH_PREIMAGES_AMENDMENT_V1.md
```

The amendment is intentionally small so the audited parent contract is not rewritten unnecessarily.

Before final I5-A freeze, any remaining working/superseded A2 text MUST be consolidated or accompanied by an explicit supersession map so an implementer never has to guess which rule controls.

---

# 6. Explicit non-actions

This amendment authorizes none of:

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
