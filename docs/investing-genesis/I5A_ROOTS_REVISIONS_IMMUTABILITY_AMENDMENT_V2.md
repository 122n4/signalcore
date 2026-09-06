# Syntrake Investing Genesis I5-A3 — Structural Amendment V2

Status: `WORKING A3 GATE AMENDMENT V2 — NOT I5-A FROZEN`

Parent controlling A3 head before this amendment:

```text
ac6c2f37decf2b4391c4fbe3d8077ac5bafe5753
```

This amendment closes two contradictions found by re-reading the accepted I5 working source/audit and I5-A1 authority contract after A3 V1/V1-amendment were written.

It is design only. It changes no runtime, DB schema, migration, Supabase state, Trading code, production state, or financial truth.

Where this V2 amendment conflicts with either earlier A3 document, V2 controls.

---

# 1. Investigation creation scope/actor must match A1 exactly

The parent A3 conceptual `InvestigationRootV1` reused the generic I1/A1 `OperationScope` and `ActorKind` unions. That is too broad for the **admitted I5 V1 Investigation creation contract**.

I5-A1 already closes the normal Investigation creation paths as:

```text
PURE_RESEARCH
  actor = USER_PRINCIPAL
  scope = TENANT_SCOPE
  tenant = REQUIRED
  account = ABSENT

TEST_PORTFOLIO
  actor = USER_PRINCIPAL
  scope = TENANT_SCOPE
  tenant = REQUIRED
  account = ABSENT

USER_PORTFOLIO
  actor = USER_PRINCIPAL
  scope = ACCOUNT_SCOPE
  tenant = REQUIRED and canonically derived from Account
  account = REQUIRED
```

Therefore canonical I5 V1 Investigation rows MUST satisfy exactly one of those three creation shapes.

The following Investigation creation states are **NOT ADMITTED** by the current A1 operation vocabulary:

```text
DOMAIN_SCOPE Investigation
SYSTEM_ACTOR-created Investigation
PURE_RESEARCH with Account ID
TEST_PORTFOLIO with Account ID
USER_PORTFOLIO without Account ID
USER_PORTFOLIO downgraded to TENANT_SCOPE
client-selected Tenant overriding the canonical Account -> Tenant relationship
```

`DOMAIN_SCOPE` remains available in I5 V1 only for the explicitly accepted I5-owned global Research reference operations such as Template/Ontology read/publish under A1. It is not an Investigation ownership shortcut.

A future SYSTEM_ACTOR or DOMAIN_SCOPE Investigation creation path requires an explicit A1 operation/capability amendment first.

The persisted `createdByActorKind/createdByActorId` fields remain provenance. For rows created under the currently admitted V1 contract:

```text
createdByActorKind = USER_PRINCIPAL
```

This does not make the creator permanent authorization authority.

---

# 2. Draft and Hypothesis are independent sibling revision roots

The first A3 candidate introduced:

```text
HypothesisRevision.sourceDraftRevisionId = required
```

and then made active Hypothesis structurally depend on active Draft.

That is **withdrawn**.

Reason:

- the prior working canonical model deliberately gives ResearchDraft and Hypothesis independent roots/revision histories;
- the I5 domain flow does not establish a frozen Draft -> Hypothesis dependency;
- the accepted audit preserves `ResearchVersion` as a projection over canonical lineage rather than creating a fourth authority, and does not establish Draft as Hypothesis predecessor;
- requiring a Draft predecessor inside Hypothesis would invent a scientific ordering not yet supported by the source-derived design.

A3 must close structural lineage without silently deciding A4 semantic interpretation order.

Therefore:

```text
ResearchDraftRoot   = independent linear root
HypothesisRoot      = independent linear root
ResearchSpecRoot    = downstream canonical specification root
```

No Draft revision ID is added to the Hypothesis wrapper by A3.

A4 may define semantic evidence that relates interpretation artifacts to a Hypothesis, but it may not retroactively treat an invented A3 `sourceDraftRevisionId` as already canonical.

---

# 3. Correct active-pointer dependency closure

A3 V2 uses sibling Draft/Hypothesis state with ResearchSpec as the point where material semantic dependencies are bound.

## 3.1 Draft closure

An active Draft has no A3 structural dependency on an active Hypothesis.

```text
activeResearchDraftRevisionId may exist with or without activeHypothesisRevisionId
```

## 3.2 Hypothesis closure

An active Hypothesis has no A3 structural dependency on an active Draft.

```text
activeHypothesisRevisionId may exist with or without activeResearchDraftRevisionId
```

This supports interpretation workflows without pretending that one root is always the other's predecessor.

## 3.3 ResearchSpec closure

The current working ResearchSpec shape already contains:

```text
sourceDraftRevisionId = REQUIRED
hypothesisRevisionId  = OPTIONAL
```

A3 V2 therefore requires for an **active ResearchSpec**:

```text
activeResearchDraftRevisionId != null
Spec.sourceDraftRevisionId == activeResearchDraftRevisionId
```

If `Spec.hypothesisRevisionId` is present:

```text
activeHypothesisRevisionId != null
Spec.hypothesisRevisionId == activeHypothesisRevisionId
```

If `Spec.hypothesisRevisionId` is absent, an independent active Hypothesis may still exist, but it is **not part of that Spec's scientific lineage**.

A read/explanation layer must not claim that an unreferenced active Hypothesis was tested by that Spec merely because both pointers coexist.

A4 owns the semantic rule for when a Hypothesis is required, optional, or intentionally omitted.

## 3.4 Experiment closure

Unchanged:

```text
activeExperimentId != null
=> activeResearchSpecRevisionId != null
=> Experiment.researchSpecRevisionId == activeResearchSpecRevisionId
```

---

# 4. Correct deterministic downstream invalidation table

The first A3 candidate cleared Hypothesis when a new Draft revision was created. That encoded the withdrawn Draft -> Hypothesis dependency.

The controlling V2 table is:

| successful new canonical object | Draft | Hypothesis | Spec | Experiment |
|---|---|---|---|---|
| Draft revision | NEW | KEEP | CLEAR | CLEAR |
| Hypothesis revision | KEEP | NEW | CLEAR | CLEAR |
| ResearchSpec revision | KEEP | KEEP | NEW | CLEAR |
| Experiment | KEEP | KEEP | KEEP | NEW |

Reason:

- Draft and Hypothesis are independent sibling histories;
- either may materially affect the next Spec;
- therefore changing either invalidates downstream Spec/Experiment selectors;
- neither sibling is silently rewritten, cleared, or declared incompatible with the other by A3;
- A4 canonicalization decides which exact sibling revisions a new Spec actually binds.

`KEEP` preserves the sibling active pointer exactly as it was.

`CLEAR` affects only the Investigation active selector, never historical root heads/objects.

---

# 5. Correct Draft/Hypothesis mutation effects

## 5.1 Draft revision

Successful Draft append/activation atomically:

```text
creates/advances Draft linear root
sets activeResearchDraftRevisionId -> NEW
preserves activeHypothesisRevisionId exactly
clears activeResearchSpecRevisionId
clears activeExperimentId
increments activePointerVersion exactly once
```

## 5.2 Hypothesis revision

Successful Hypothesis append/activation atomically:

```text
creates/advances Hypothesis linear root
preserves activeResearchDraftRevisionId exactly
sets activeHypothesisRevisionId -> NEW
clears activeResearchSpecRevisionId
clears activeExperimentId
increments activePointerVersion exactly once
```

Neither operation invents cross-sibling predecessor lineage.

---

# 6. Correct ResearchSpec activation rule

A new ResearchSpec revision must bind the exact active Draft revision because `sourceDraftRevisionId` is currently required by the working semantic shape.

For optional Hypothesis:

```text
if new Spec includes hypothesisRevisionId:
  it MUST equal the exact current activeHypothesisRevisionId

if new Spec omits hypothesisRevisionId:
  A3 permits that structurally even if an independent active Hypothesis exists
```

Spec activation preserves both sibling active pointers and clears only Experiment.

This does **not** imply every Spec without a Hypothesis is semantically valid. A4 owns that validation.

A3 only prevents false lineage claims.

---

# 7. Full aggregate CAS remains mandatory

Sibling independence does not weaken Decision 2/A3 aggregate pointer CAS.

Every pointer-changing command still compares the exact full predecessor snapshot:

```text
activePointerVersion
active Draft pointer or null
active Hypothesis pointer or null
active Spec pointer or null
active Experiment pointer or null
```

Reason: even independent sibling roots share one downstream Spec/Experiment selector graph, so concurrent changes must not silently compose against a stale aggregate state.

---

# 8. A3 V2 supersession map

The following parent A3 statements are superseded:

```text
HypothesisRevision.sourceDraftRevisionId required
active Hypothesis => active Draft
Hypothesis.sourceDraft == active Draft closure
Draft revision clears active Hypothesis
Spec with no hypothesis requires activeHypothesis == null
```

The following remain unchanged:

```text
one Draft root per Investigation
one Hypothesis root per Investigation
one Spec root per Investigation
linear no-fork revision chains
root-head CAS
full Investigation pointer CAS
Spec.sourceDraft must bind active Draft
Spec hypothesis ref, when present, must bind active Hypothesis
Experiment binds active Spec
Experiment immutable lineage
ExperimentPlan root/revision correction
Template lifecycle/version correction
A2 primitive/hash amendment
idempotency concurrency amendment
archive/no-hard-delete law
```

---

# 9. A3 controlling set

Until final I5-A consolidation, the controlling A3 set is:

```text
I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md
+
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V1.md
+
I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V2.md
```

Conflict precedence inside A3 is:

```text
V2 amendment
  > V1 amendment
  > original A3 candidate
```

Before final I5-A freeze these must be consolidated or accompanied by a complete supersession map.

---

# 10. Explicit non-actions

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
