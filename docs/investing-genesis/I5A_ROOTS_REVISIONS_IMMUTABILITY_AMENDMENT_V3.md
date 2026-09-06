# Syntrake Investing Genesis I5-A3 — Structural Amendment V3

Status: `WORKING A3 GATE AMENDMENT V3 — NOT I5-A FROZEN`

Parent controlling A3 head before this amendment:

```text
398b7ceb87c7ef5167a78c02ec9b7ac667dbe649
```

This amendment closes two residual contradictions found during independent A1/A3 cross-audit.

It is design only and authorizes no runtime, schema, migration, Supabase change, merge, production deploy, financial mutation, Trading reuse, execution, or recommendation.

Where V3 conflicts with earlier A3 documents, V3 controls.

---

# 1. ExperimentPlan mutation actor is USER_PRINCIPAL only in current I5 V1

The original A3 Plan section said:

```text
current user/system authority for owning Investigation
```

That is too broad.

I5-A1 currently assigns:

```text
RESEARCH_EXPERIMENT_PLAN_CREATE_V1
  actor      = USER_PRINCIPAL
  scope      = inherits Investigation
  capability = RESEARCH_MUTATE
```

and does **not** grant generic `RESEARCH_MUTATE` or ExperimentPlan creation to SYSTEM_ACTOR workers.

Therefore under the current I5 V1 authority vocabulary:

```text
ExperimentPlan root/revision create/append = USER_PRINCIPAL only
```

subject to exact current Investigation authority, lifecycle eligibility, active-Spec predecessor proof, idempotency, and Plan-root head CAS.

A SYSTEM_ACTOR may read/execute only the exact worker operations/capabilities accepted by A1/A7. It may not create or revise an ExperimentPlan merely because it has `service_role`, a Run ID, a Job ID, or worker capability.

Any future SYSTEM_ACTOR ExperimentPlan mutation requires an explicit A1 authority/capability amendment first.

---

# 2. Hypothesis sibling update uses dependency-aware invalidation

V2 correctly removes the invented Draft -> Hypothesis predecessor dependency, but its table still cleared active Spec/Experiment on **every** Hypothesis revision.

That is unnecessarily destructive when the active Spec does not reference a Hypothesis at all.

A3 can decide this mechanically without inventing scientific compatibility because `ResearchSpecRevision.hypothesisRevisionId` already records whether the Spec actually depends on a Hypothesis.

## 2.1 Canonical Hypothesis mutation rule

When a new Hypothesis revision is appended/activated under the locked InvestigationRoot:

```text
preserve active Draft
set active Hypothesis -> NEW
```

Then inspect the exact currently active Spec, if any.

### Case A — no active Spec

```text
active Spec = null
=> no downstream object to invalidate
```

### Case B — active Spec exists and `Spec.hypothesisRevisionId` is absent

```text
Spec does not structurally depend on active Hypothesis
=> preserve active Spec
=> preserve active Experiment if its normal Spec closure still holds
```

The new active Hypothesis is independent working scientific state and must not be falsely presented as part of that unchanged Spec/Experiment lineage.

### Case C — active Spec exists and `Spec.hypothesisRevisionId` is present

Before mutation, canonical closure requires:

```text
Spec.hypothesisRevisionId == old activeHypothesisRevisionId
```

The new Hypothesis makes that downstream Spec selector stale.

Therefore atomically:

```text
clear active Spec
clear active Experiment
```

Historical Spec/Experiment objects remain immutable and preserved.

Any mismatch between active Spec's hypothesis ref and the predecessor active Hypothesis is invalid canonical state and fails closed; the mutation must not “repair” it heuristically.

---

# 3. Controlling downstream invalidation matrix

The controlling A3 V3 rule is:

| successful new canonical object | Draft | Hypothesis | Spec | Experiment |
|---|---|---|---|---|
| Draft revision | NEW | KEEP | CLEAR | CLEAR |
| Hypothesis revision, no active Spec | KEEP | NEW | null | existing pointer must already be null by closure |
| Hypothesis revision, active Spec without hypothesis ref | KEEP | NEW | KEEP | KEEP if Spec closure holds |
| Hypothesis revision, active Spec with hypothesis ref | KEEP | NEW | CLEAR | CLEAR |
| ResearchSpec revision | KEEP | KEEP | NEW | CLEAR |
| Experiment | KEEP | KEEP | KEEP | NEW |

Draft revision always clears active Spec/Experiment because every currently designed ResearchSpec binds required `sourceDraftRevisionId`.

ResearchSpec revision always clears Experiment because every Experiment binds an exact ResearchSpec revision.

Hypothesis revision clears only downstream state that is structurally proven to depend on the predecessor Hypothesis.

---

# 4. Transactional requirement for conditional invalidation

The Hypothesis append transaction must, under the same InvestigationRoot lock:

```text
1. compare full aggregate pointer predecessor
2. resolve the exact active Spec when non-null
3. verify Spec belongs to same Investigation/scope
4. verify Spec.sourceDraft still matches active Draft where required
5. inspect Spec.hypothesisRevisionId
6. fail closed on impossible/mismatched graph
7. create/advance immutable Hypothesis revision/root
8. update active Hypothesis
9. preserve or clear Spec/Experiment according to section 2
10. increment activePointerVersion exactly once
11. persist exact idempotent durable result
```

No read-model heuristic or unlocked pre-check may decide the invalidation branch.

---

# 5. A3 controlling precedence

Until final I5-A consolidation:

```text
V3 amendment
  > V2 amendment
  > V1 amendment
  > original A3 candidate
```

The final freeze document must consolidate these rules so implementation never has to infer precedence from commit chronology.

---

# 6. Explicit non-actions

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
