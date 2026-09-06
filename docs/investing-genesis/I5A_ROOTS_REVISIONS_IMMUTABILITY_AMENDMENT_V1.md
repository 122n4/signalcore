# Syntrake Investing Genesis I5-A3 — Roots/Revisions/Immutability Amendment V1

Status: `WORKING A3 GATE AMENDMENT — NOT I5-A FROZEN`

Parent A3 candidate:

```text
65ab2872764d57b541c3d93bf0be45ea9f929409
```

This amendment closes material ambiguities found during independent post-write audit of:

```text
docs/investing-genesis/I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md
```

It is design only. It changes no runtime, schema, migration, Supabase state, Trading code, production state, or financial truth.

Where this amendment conflicts with the parent A3 candidate, this amendment controls.

---

# 1. A2 primitive names control all A3 conceptual shapes

The parent A3 candidate used some earlier working aliases in conceptual TypeScript excerpts:

```text
Uuid
CanonicalTimestamp
ContentHash
```

Those aliases are not controlling after I5-A2.

All A3 structural contracts must use the exact A2 primitive families conceptually:

```text
canonical persisted UUID field
  -> CanonicalUuidV1

canonical persisted scientific timestamp
  -> CanonicalTimestampUtcMicrosV1

actor identity
  -> CanonicalActorId under the A1/A2 authority-owned actor validation contract

CAS/revision counters
  -> CanonicalCasVersionV1 / CanonicalRevisionNumberV1 from A3
```

Therefore every A3 excerpt containing `Uuid` or `CanonicalTimestamp` must be read as shorthand only and is superseded by the exact A2 primitive above.

No A3 schema/runtime implementation may reintroduce JavaScript `Date`, arbitrary UUID text, millisecond timestamp truncation, or a generic actor UUID assumption.

---

# 2. A3 does not define `ContentHash` as a generic scalar

The parent A3 candidate showed `canonicalContentHash: ContentHash` in conceptual ExperimentPlanRevision and ResearchTemplateVersion wrappers.

That is not an A3 hash contract and must not be implemented literally.

A2 remains controlling:

```text
HASH DOMAIN DECLARED != HASH DOMAIN ADMISSIBLE
```

and persisted/nested hash evidence must obey the A2 algorithm/domain/version/digest law.

Therefore in A3:

```text
ExperimentPlanRevision canonical hash field = RESERVED / HASHING DISABLED
ResearchTemplateVersion canonical hash field = RESERVED / HASHING DISABLED
```

until the owning semantic step defines the exact named `*_HASH_PAYLOAD_V1`, domain, wrapper evidence, and admissibility contract.

A3 freezes lineage/immutability only; it does not create a new generic `ContentHash` primitive.

---

# 3. Exact idempotency concurrency correction

The parent A3 ordering allowed a request-time idempotency lookup before the material transaction. That lookup is useful as a fast path but is **not sufficient** for concurrent same-key requests.

Problem scenario that must not occur:

```text
request A: key K + material M -> no idempotency row yet
request B: key K + material M -> no idempotency row yet
A commits scientific mutation
B waits on root/CAS, then sees stale predecessor
B incorrectly returns CONFLICT
```

Canonical requirement:

```text
same authorized idempotency namespace
+ same key
+ same material request
=> exact replay of the one durable winner
```

not a false stale-CAS conflict caused by timing.

## 3.1 Correct ordering

For a fresh material command:

```text
1. authenticate + request-time authorize
2. strict command validation
3. compute exact material_request_hash under the operation contract
4. optional authorized idempotency fast-path lookup
5. begin material transaction if no completed replay was returned
6. revalidate authority/lifecycle in transaction
7. lock or atomically reserve the exact canonical idempotency namespace/key
8. re-evaluate idempotency state after that lock/reservation:
     existing COMPLETED + same material hash -> exact durable replay
     existing COMPLETED + different material hash -> CONFLICT
     existing/in-flight same key owned by concurrent transaction -> wait through DB uniqueness/row lock, then re-evaluate
     no row -> establish this transaction as the unique in-flight owner
9. only the unique fresh owner proceeds to Investigation/root CAS
10. perform structural mutation
11. store exact durable resulting object IDs + resulting CAS versions in the same idempotency effect
12. commit
```

A transaction that loses or rolls back before material commit must not leave a durable “successful” idempotency result.

The exact persisted idempotency schema/state machine belongs to later implementation design, but the concurrency semantics above are mandatory.

## 3.2 Authority remains independent

The idempotency namespace is derived from canonical server authority/operation scope according to A1. Client actor/tenant/account fields never select it as proof.

Replay still requires the current ownership/disclosure authorization required by A1.

Idempotency lock/reservation is not an authority token.

---

# 4. Semantic-root append + pointer mutation is one material effect

For Draft/Hypothesis/ResearchSpec revision creation, the following are one indivisible material effect:

```text
immutable revision insert
root creation/head advance
required downstream pointer clears
new active pointer
activePointerVersion increment
idempotent durable result
```

No implementation may commit the root-head advance first and update Investigation pointers in a later transaction.

This also means same-key replay returns the exact original:

```text
root ID
revision ID
revision number
resulting active pointer set
resulting activePointerVersion
```

---

# 5. Exact ExperimentPlan cross-object closure

The A3 parent closes Plan root identity as one root per:

```text
(Investigation, ResearchSpecRevision)
```

The following additional structural invariant is mandatory for every immutable ExperimentPlanRevision:

```text
for every referenced Experiment:
  Experiment.investigationId == PlanRoot.investigationId
  Experiment.researchSpecRevisionId == PlanRoot.researchSpecRevisionId
```

A Plan revision cannot mix Experiments from different Investigations or Spec revisions.

Any nested comparison/sensitivity grouping may reference only Experiments already admitted into that Plan revision's exact same-Investigation/same-Spec experiment set once A4/A8 define the final semantic collection schema.

An object ID match without this canonical ownership resolution is insufficient.

Plan creation/append also locks the InvestigationRoot while proving that the PlanRoot's Spec remains the exact active Spec. This prevents a concurrent Spec activation from committing between the predecessor check and Plan-head mutation.

---

# 6. ExperimentPlan first-revision/root creation law

`ExperimentPlanRootV1` is created lazily and atomically with its first immutable Plan revision.

Canonical V1 state forbids an empty Plan root.

First revision:

```text
PlanRoot absent for (Investigation, SpecRevision)
revision = 1
predecessorRevisionId = absent
root.headRevisionId = new revision
root.headRevisionNumber = 1
```

Successor:

```text
predecessorRevisionId = exact current root head
revision = current head number + 1
```

No Plan forks are admitted in V1.

---

# 7. ResearchTemplate exact head/lifecycle CAS separation

The parent A3 correctly separates mutable Template root lifecycle from immutable TemplateVersion content, but publication concurrency must be explicit.

## 7.1 First publication

`RESEARCH_TEMPLATE_VERSION_PUBLISH_V1` may create a new Template root and version 1 atomically when the canonical template identity does not yet exist.

Canonical first state:

```text
status = ACTIVE
latestVersionId = version 1 ID
latestVersionNumber = 1
lifecycleVersion = 0
retiredAt = absent
```

An empty Template root is not canonical V1 state.

## 7.2 Successor publication

A successor publish must compare under one root lock:

```text
expectedTemplateId
expectedLatestVersionId
expectedLatestVersionNumber
expectedLifecycleVersion
expected status = ACTIVE
```

Then atomically:

```text
insert immutable TemplateVersion N+1
predecessorTemplateVersionId = exact previous latestVersionId
update latestVersionId
update latestVersionNumber
```

Publishing a new immutable content version does **not** increment `lifecycleVersion`.

The latest-version fields themselves are the publication-head predecessor evidence.

## 7.3 Retirement lifecycle

If a future authority amendment admits retirement, that transition must:

```text
lock same Template root
compare expected lifecycleVersion
compare/observe current publication head under the same lock
require status = ACTIVE
set status = RETIRED
set retiredAt
increment lifecycleVersion exactly once
```

Because publication and retirement serialize on the same root lock, neither can race through stale ACTIVE state.

`RETIRED` is terminal for new publication in V1 unless a future canonical amendment explicitly defines reactivation.

A3 still does not authorize the retirement operation because A1 has no such operation token today.

---

# 8. Template version number and predecessor law

Template versions use:

```text
templateVersion = CanonicalRevisionNumberV1
```

and form one linear predecessor chain per Template root:

```text
version 1 -> no predecessor
version N>1 -> predecessor = exact current latest version
```

No Template version forks are admitted by A3 V1.

Historical exact version references remain valid provenance/replay evidence subject to authority even if the root later becomes RETIRED.

New ResearchSpec/template selection must not interpret RETIRED as ACTIVE; A4 owns the exact template-selection semantic rule.

---

# 9. All semantic revision-number fields use A3 canonical counter primitives

The following earlier working numeric fields are superseded structurally:

```text
ResearchDraftRevision.revision
HypothesisRevision.revision
ResearchSpecRevision.revision
ExperimentPlan revision/version
ResearchTemplateVersion.templateVersion
InvestigationRoot.activePointerVersion
```

They must use the A3 exact decimal-string counter contracts at application boundaries.

No future implementation may compare or increment these through JavaScript floating-point arithmetic.

---

# 10. Worker/system structural mutations

Section 20 of the parent described USER_PRINCIPAL ordering. Equivalent idempotency/authority separation applies to SYSTEM_ACTOR structural effects where the owning operation is idempotent.

A SYSTEM_ACTOR must still prove its A1 canonical Job/Run/Investigation or DOMAIN_SCOPE capability before entering the idempotency namespace.

`service_role`, queue credentials, process identity, storage credentials, or a known object ID never substitute for that authority.

A3 does not define Run/Job terminal state machines; A6/A7 remain their owners.

---

# 11. A3 controlling set and consolidation law

Until a later consolidated I5-A design freeze document is created, the A3 controlling design set is:

```text
I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md
+
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V1.md
```

This amendment intentionally preserves the first candidate as audit history rather than silently rewriting it.

Before final I5-A freeze, superseded working shapes must be consolidated or accompanied by an explicit supersession map so an implementer never has to guess which field/type/concurrency law controls.

---

# 12. Explicit non-actions

This amendment authorizes none of:

```text
runtime implementation
DB schema
migration
RLS
DDL/DML
Supabase branch creation
production deploy
merge
Trading import/reuse
financial mutation
broker/paper/live execution
recommendation generation
```
