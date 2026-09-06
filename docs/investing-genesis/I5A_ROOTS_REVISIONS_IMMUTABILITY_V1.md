# Syntrake Investing Genesis I5-A3 — Roots, Revisions, Immutability + CAS V1

Status: `WORKING CONTRACT — A3 CANDIDATE — NOT I5-A FROZEN`

Canonical A3 parent:

```text
2eb4c271a2224610ecc422fde44a7254b2236381
```

This document closes the structural identity/versioning questions for I5-A3 only.

It is design only. It authorizes no runtime implementation, DB schema, migration, RLS, Supabase branch, DDL/DML, merge, production deploy, financial mutation, broker/paper/live execution, recommendation, or Trading import/reuse.

---

# 1. Controlling law and supersession

I0/I1, the exact I4 freeze, I5-A1 authority/scope, and I5-A2 canonical-bytes/hash law remain controlling predecessors.

For roots, revision lineage, mutable-vs-immutable object boundaries, active-pointer CAS, revision-head CAS, Experiment lineage, ExperimentPlan version identity, and ResearchTemplate lifecycle separation, this document supersedes conflicting statements in earlier **working** I5 documents.

The following earlier candidate shapes are specifically superseded where they conflict with A3:

```text
ResearchDraftRootV1 without a durable head
HypothesisRootV1 without a durable head
ResearchSpecRootV1 without a durable head
revision/version counters modeled as JavaScript number
ExperimentPlanV1 with experimentPlanId + version but no root/predecessor identity
ResearchTemplateVersionV1 containing mutable ACTIVE/RETIRED lifecycle state
any interpretation that active-pointer CAS is independent per semantic pointer
any interpretation that a canonical revision fork may be created implicitly
```

No earlier working type becomes implementation authority merely because its name ends in `V1`.

---

# 2. A3 scope boundary

I5-A3 closes:

1. Investigation durable identity and immutable ownership fields;
2. the narrow mutable partitions of InvestigationRoot;
3. one-root-per-Investigation V1 law for Draft, Hypothesis, and ResearchSpec;
4. exact linear immutable revision lineage for those roots;
5. revision-head predecessor/CAS law;
6. aggregate Investigation active-pointer CAS law;
7. active-pointer dependency closure and deterministic downstream invalidation;
8. immutable Experiment parent/variant lineage;
9. ExperimentPlan root/revision identity;
10. ResearchTemplate immutable-version vs mutable-root lifecycle separation;
11. no-fork/no-hard-delete V1 policy;
12. transaction/idempotency ordering for structural mutations;
13. the boundary between A3 structural identity and later owner hash payloads.

I5-A3 does **not** freeze:

```text
final ResearchDraft semantic fields/hash payload       -> A4 owner work
final Hypothesis semantic fields/hash payload          -> A4 owner work
final ResearchSpec semantic fields/hash payload        -> A4 owner work
final DatasetSnapshot identity/content                 -> A5 owner work
Run/Result state machine and publication               -> A6 owner work
ResearchJob/WorkerAttempt state machine                -> A7 owner work
metric mathematics / adapter economics                 -> A8 owner work
final executable RESEARCH_IR_V1 subset                 -> A9 owner work
```

A later owner step may add semantic fields to an immutable revision/object, but it may not weaken the lineage/immutability laws frozen here without an explicit canonical amendment.

---

# 3. Canonical counter primitives for structural state

Earlier working types used JavaScript `number` for revision/version counters. That is not accepted as the cross-runtime contract.

A3 uses decimal-string structural counters:

```ts
type CanonicalCasVersionV1 = string;       // 0..9223372036854775807
type CanonicalRevisionNumberV1 = string;   // 1..9223372036854775807
```

Exact lexical forms:

```text
CanonicalCasVersionV1:
  ^(?:0|[1-9][0-9]*)$

CanonicalRevisionNumberV1:
  ^[1-9][0-9]*$
```

Both are bounded to signed PostgreSQL BIGINT maximum:

```text
9223372036854775807
```

Rules:

- no `+` prefix;
- no leading zeroes except exact CAS value `0`;
- no exponent notation;
- no JSON numeric authority at an external/application boundary;
- increment is exact integer arithmetic, never IEEE-754 arithmetic;
- overflow fails closed;
- timestamps never substitute for structural ordering.

Future PostgreSQL persistence may use `BIGINT` internally, but application/API canonical evidence remains exact decimal text unless a later accepted contract says otherwise.

---

# 4. Canonical object mutability classes

A3 recognizes four structural classes.

## 4.1 Durable mutable root

A root provides durable identity and owns only narrowly declared mutable selectors/lifecycle state.

Examples:

```text
InvestigationRoot
ResearchDraftRoot
HypothesisRoot
ResearchSpecRoot
ExperimentPlanRoot
ResearchTemplateRoot
```

A root is not a mutable JSON bucket. Fields not explicitly declared mutable are immutable after creation.

## 4.2 Immutable revision/version

Examples:

```text
ResearchDraftRevision
HypothesisRevision
ResearchSpecRevision
ExperimentPlanRevision
ResearchTemplateVersion
```

After successful commit, every material field is immutable.

Correction creates a successor revision/version; it never rewrites predecessor history.

## 4.3 Immutable standalone scientific object

Examples governed structurally here:

```text
Experiment
```

Other I5 standalone objects already intended to be immutable remain so, with exact owner semantics closed later:

```text
DatasetSnapshot
AccountResearchContextSnapshot
Result
Comparison
Evidence scientific content
```

## 4.4 Stateful execution object

`Run`, `ResearchJob`, and `WorkerAttempt` are state-machine exceptions. They are not free-form mutable records. Their exact transitions belong to A6/A7.

Nothing in A3 authorizes mutation outside a later accepted transition table.

---

# 5. InvestigationRoot identity law

The Investigation is the durable ownership/lifecycle root for one research question/workstream.

The following fields are immutable after creation:

```text
investigationId
operationScope
tenantId/accountId canonical ownership tuple
sourceContext
createdByActorKind
createdByActorId
createdAt
```

Therefore V1 forbids:

```text
re-parent Investigation to another Tenant
re-parent Investigation to another Account
change ACCOUNT_SCOPE <-> TENANT_SCOPE <-> DOMAIN_SCOPE
change PURE_RESEARCH <-> TEST_PORTFOLIO <-> USER_PORTFOLIO
replace creator provenance
clone-by-mutating the same Investigation
```

A different ownership/source context requires a new Investigation under a separately authorized command/contract. I5 V1 defines no cross-owner transfer operation.

`createdByActor*` is provenance only. It is never current authorization evidence.

---

# 6. InvestigationRoot mutable partitions

A3 splits mutable root state into two separate CAS domains.

Conceptual controlling shape:

```ts
interface InvestigationRootV1 {
  schemaVersion: "INVESTIGATION_ROOT_V1";
  investigationId: Uuid;

  operationScope: OperationScope;
  tenantId?: Uuid;
  accountId?: Uuid;
  sourceContext: ResearchSourceContext;

  createdByActorKind: ActorKind;
  createdByActorId: CanonicalActorId;

  status: InvestigationStatus;
  currentStage: ResearchStage;
  lifecycleVersion: CanonicalCasVersionV1;
  archivedAt?: CanonicalTimestamp;

  activeResearchDraftRevisionId?: Uuid;
  activeHypothesisRevisionId?: Uuid;
  activeResearchSpecRevisionId?: Uuid;
  activeExperimentId?: Uuid;
  activePointerVersion: CanonicalCasVersionV1;

  createdAt: CanonicalTimestamp;
}
```

## 6.1 Lifecycle CAS domain

Owns only:

```text
status
currentStage
archivedAt
lifecycleVersion
```

Initial creation:

```text
status           = DRAFT
currentStage     = IDEA
lifecycleVersion = 0
archivedAt       = absent
```

At the currently accepted A1 operation vocabulary, the only direct lifecycle mutation admitted by A3 is:

```text
RESEARCH_INVESTIGATION_ARCHIVE_V1
```

Archive transition:

```text
non-ARCHIVED -> ARCHIVED
archivedAt    -> exact server timestamp
lifecycleVersion -> +1
```

`ARCHIVED` is terminal in I5 V1. No unarchive operation is admitted.

Direct generic setters for `status` or `currentStage` are forbidden.

Transitions involving `ACTIVE`, `BLOCKED`, `COMPLETED`, or stage movement may later be bound to exact owning operations, but until that contract exists they are **NOT ADMITTED MUTATIONS**, not free-form application writes.

`status/currentStage` are workflow/lifecycle projections. They never replace scientific lineage or authority checks.

Archive is not defined as Run cancellation. A6 must separately close in-flight Run/archive interaction. A3 does not silently discard or fabricate Run outcomes.

## 6.2 Active scientific-pointer CAS domain

Owns only:

```text
activeResearchDraftRevisionId
activeHypothesisRevisionId
activeResearchSpecRevisionId
activeExperimentId
activePointerVersion
```

Initial creation:

```text
all active pointers = null/absent
activePointerVersion = 0
```

Every successful material pointer change increments `activePointerVersion` exactly once.

Lifecycle mutation does not increment `activePointerVersion`.

Pointer mutation does not increment `lifecycleVersion`.

Both mutation classes lock/revalidate the same InvestigationRoot when lifecycle eligibility matters, so separate counters do not permit archive/write races to bypass lifecycle policy.

No A3 command mutates both CAS domains in one public operation. A future combined operation must explicitly compare both predecessor domains.

---

# 7. Aggregate active-pointer predecessor snapshot

A pointer-changing command must carry exact predecessor evidence for the **entire** active pointer set, not only the field it hopes to change.

Canonical command-side predecessor shape:

```ts
interface ExpectedInvestigationPointersV1 {
  expectedActivePointerVersion: CanonicalCasVersionV1;
  expectedResearchDraftRevisionId: Uuid | null;
  expectedHypothesisRevisionId: Uuid | null;
  expectedResearchSpecRevisionId: Uuid | null;
  expectedExperimentId: Uuid | null;
}
```

`null` means exactly “no active pointer”. Omission is not “do not care”.

CAS compares:

```text
activePointerVersion
+ all four active pointer values
```

against the exact predecessor snapshot.

Reason: the four pointers form one coupled scientific selector state. A command must not succeed against a different combination merely because the one field it changes still matches.

Required behavior:

```text
stale aggregate predecessor -> CONFLICT
pointer mismatch            -> CONFLICT
no partial revision/object insert survives failed CAS
no partial downstream clear survives failed CAS
successful mutation -> exactly one new aggregate pointer version
```

---

# 8. One-root-per-Investigation V1 law

I5 V1 allows at most one durable root of each semantic revision family per Investigation:

```text
0..1 ResearchDraftRoot per Investigation
0..1 HypothesisRoot    per Investigation
0..1 ResearchSpecRoot  per Investigation
```

Roots are created lazily and atomically with revision 1. Empty semantic roots are not canonical V1 state.

Therefore when a root exists it always has a valid head revision.

Conceptual root pattern:

```ts
interface LinearRevisionRootV1 {
  rootId: Uuid;
  investigationId: Uuid;
  headRevisionId: Uuid;
  headRevisionNumber: CanonicalRevisionNumberV1;
  createdAt: CanonicalTimestamp;
}
```

The future schema must enforce uniqueness of the root family on `investigationId`.

V1 does not permit multiple Draft roots, multiple Hypothesis roots, or multiple ResearchSpec roots inside one Investigation.

A materially separate research question that requires an independent semantic branch is a new Investigation. Once a ResearchSpec exists, controlled scientific variation is represented by immutable Experiment lineage rather than by silently forking Spec history.

---

# 9. Linear revision law — no forks in I5 V1

For ResearchDraft, Hypothesis, and ResearchSpec:

```text
revision 1:
  predecessorRevisionId = absent

revision N > 1:
  predecessorRevisionId = exact current root headRevisionId
  revision               = headRevisionNumber + 1
```

The new revision and root-head update commit atomically.

A successor command must provide:

```text
expectedRootId
expectedHeadRevisionId
expectedHeadRevisionNumber
```

For first-revision creation it must prove root absence through the canonical Investigation/root uniqueness contract rather than guessing a root ID.

Fork behavior:

```text
predecessor != current root head -> CONFLICT
attempt to create two successors from one head -> one winner, one CONFLICT
implicit branch/fork -> FORBIDDEN IN V1
```

No revision number is allocated from wall-clock time or a global sequence whose gaps are treated as lineage.

The canonical lineage order is root-head predecessor order, not `createdAt`.

---

# 10. Root head and Investigation active pointer are different concepts

A semantic root head means:

```text
latest committed revision in that root's linear history
```

An Investigation active pointer means:

```text
revision currently selected as part of the Investigation's active scientific graph
```

They may differ.

Example:

```text
HypothesisRoot head = H7
activeHypothesisRevisionId = null
```

is valid after an upstream Draft change invalidates the active downstream graph.

The next Hypothesis revision may still be H8 with predecessor H7, while binding the new active Draft revision through exact lineage.

Historical revisions are not deleted or rewritten merely because their active pointer is cleared.

---

# 11. Draft revision structural contract

Controlling structural root shape:

```ts
interface ResearchDraftRootV1 {
  schemaVersion: "RESEARCH_DRAFT_ROOT_V1";
  researchDraftRootId: Uuid;
  investigationId: Uuid;
  headRevisionId: Uuid;
  headRevisionNumber: CanonicalRevisionNumberV1;
  createdAt: CanonicalTimestamp;
}
```

Every `ResearchDraftRevisionV1` remains immutable and must contain exact root + Investigation lineage.

First revision creation atomically:

```text
creates ResearchDraftRoot
creates ResearchDraftRevision #1
sets root head -> new revision
sets Investigation.activeResearchDraftRevisionId -> new revision
clears active Hypothesis/Spec/Experiment
increments Investigation.activePointerVersion
```

Successor creation atomically:

```text
compares root head
compares full aggregate Investigation pointer predecessor
creates next immutable Draft revision
advances root head
activates new Draft revision
clears active Hypothesis/Spec/Experiment
increments activePointerVersion
```

A material Draft revision is therefore an upstream semantic change. V1 fails closed by invalidating downstream active selectors rather than guessing compatibility.

If a textual/conversational edit is scientifically immaterial, it belongs in non-authoritative conversation/presentation state rather than creating a canonical Draft revision whose downstream compatibility is guessed.

---

# 12. Hypothesis revision structural contract

Controlling root shape:

```ts
interface HypothesisRootV1 {
  schemaVersion: "HYPOTHESIS_ROOT_V1";
  hypothesisRootId: Uuid;
  investigationId: Uuid;
  headRevisionId: Uuid;
  headRevisionNumber: CanonicalRevisionNumberV1;
  createdAt: CanonicalTimestamp;
}
```

A3 adds mandatory upstream lineage to the working Hypothesis revision shape:

```ts
sourceDraftRevisionId: Uuid;
```

Reason: without this field, the system cannot mechanically prove that an active Hypothesis was derived from the current active Draft.

A Hypothesis revision may be created only when:

```text
activeResearchDraftRevisionId != null
sourceDraftRevisionId == activeResearchDraftRevisionId
```

First/successor creation atomically:

```text
creates/advances Hypothesis root history
sets activeHypothesisRevisionId -> new revision
preserves active Draft
clears active ResearchSpec + Experiment
increments activePointerVersion
```

The old Hypothesis root head remains historical lineage even when its active pointer had previously been cleared by a new Draft revision.

---

# 13. ResearchSpec revision structural contract

Controlling root shape:

```ts
interface ResearchSpecRootV1 {
  schemaVersion: "RESEARCH_SPEC_ROOT_V1";
  researchSpecRootId: Uuid;
  investigationId: Uuid;
  headRevisionId: Uuid;
  headRevisionNumber: CanonicalRevisionNumberV1;
  createdAt: CanonicalTimestamp;
}
```

Every Spec revision must bind:

```text
sourceDraftRevisionId = exact active Draft revision
hypothesisRevisionId  = exact active Hypothesis revision when present
```

Rules:

```text
active Draft is required
if active Hypothesis != null:
  new Spec.hypothesisRevisionId MUST equal it
if active Hypothesis == null:
  new Spec.hypothesisRevisionId MUST be absent
```

Spec creation/canonicalization atomically:

```text
creates/advances Spec root history
sets activeResearchSpecRevisionId -> new revision
preserves active Draft/Hypothesis
clears active Experiment
increments activePointerVersion
```

A3 does not define final ResearchSpec semantic validity. A4 must prove those fields before a Spec revision is admitted.

---

# 14. Active scientific graph closure

At every committed Investigation active-pointer state, the following must hold.

## 14.1 Hypothesis closure

```text
activeHypothesisRevisionId != null
=> activeResearchDraftRevisionId != null
=> Hypothesis.sourceDraftRevisionId == activeResearchDraftRevisionId
```

## 14.2 ResearchSpec closure

```text
activeResearchSpecRevisionId != null
=> activeResearchDraftRevisionId != null
=> Spec.sourceDraftRevisionId == activeResearchDraftRevisionId
```

and:

```text
if activeHypothesisRevisionId != null:
  Spec.hypothesisRevisionId == activeHypothesisRevisionId
else:
  Spec.hypothesisRevisionId is absent
```

## 14.3 Experiment closure

```text
activeExperimentId != null
=> activeResearchSpecRevisionId != null
=> Experiment.researchSpecRevisionId == activeResearchSpecRevisionId
```

A pointer state violating any closure rule is invalid canonical state and must fail closed.

No read model may repair a broken graph by selecting “latest” rows heuristically.

---

# 15. Deterministic downstream invalidation table

A3 freezes the following V1 pointer effects:

| successful new canonical object | Draft | Hypothesis | Spec | Experiment |
|---|---|---|---|---|
| Draft revision | NEW | CLEAR | CLEAR | CLEAR |
| Hypothesis revision | KEEP | NEW | CLEAR | CLEAR |
| ResearchSpec revision | KEEP | KEEP/null as already proven | NEW | CLEAR |
| Experiment | KEEP | KEEP | KEEP | NEW |

`CLEAR` means the Investigation active pointer becomes null in the same successful transaction. It does not delete historical root heads/revisions/Experiments.

This conservative invalidation prevents A3 from inventing a semantic-compatibility algorithm that does not yet exist.

A future optimization may preserve downstream selectors only under an independently frozen, mechanically provable compatibility contract. V1 does not guess.

---

# 16. Experiment immutable lineage

`ExperimentV1` remains a standalone immutable scientific object. It has no mutable Experiment root.

Immutable structural fields include at minimum:

```text
experimentId
investigationId
parentExperimentId when present
researchSpecRevisionId
relation
parameter-set identity
parent-delta identity when present
createdAt
```

No field is edited in place after commit.

## 16.1 Parent relation rules

For V1:

```text
BASELINE:
  parentExperimentId = absent

VARIANT | SENSITIVITY | VALIDATION:
  parentExperimentId = required
```

A non-baseline parent must:

```text
already exist
belong to the same Investigation
reference the same ResearchSpecRevision
```

The new Experiment must reference the exact current active ResearchSpec revision.

Therefore a variant cannot silently claim a delta against an Experiment from a different Spec revision. After a Spec change, a new baseline Experiment is required before same-Spec variants can branch from it.

Parent cycles are structurally impossible because a parent must be a pre-existing immutable Experiment and the new object cannot later rewrite its parent.

A4/A9 own the exact typed `parentDelta` semantics; A3 only freezes the lineage requirement.

## 16.2 Experiment creation pointer effect

`RESEARCH_EXPERIMENT_CREATE_V1` atomically:

```text
revalidates current active Spec
compares full aggregate active-pointer predecessor
validates parent rules
creates immutable Experiment
sets activeExperimentId -> new Experiment
increments activePointerVersion
```

No Experiment row survives a failed pointer CAS.

Byte-equal Experiment content with a different idempotency key is not automatically replay. Content equality is not authorization or idempotency.

---

# 17. ExperimentPlan identity correction

The earlier candidate:

```text
ExperimentPlanV1 {
  experimentPlanId
  version
  ...
}
```

is structurally insufficient because it does not distinguish durable plan identity from immutable plan revisions and has no exact predecessor chain.

A3 replaces it with:

```text
ExperimentPlanRootV1
  -> ExperimentPlanRevisionV1
```

## 17.1 ExperimentPlan root cardinality

There is at most one ExperimentPlanRoot per exact pair:

```text
(Investigation, ResearchSpecRevision)
```

Reason: a plan is orchestration for a fixed Spec revision. A new Spec revision gets a different plan root; it does not continue a mutable planning history across changed scientific specification identity.

Conceptual root:

```ts
interface ExperimentPlanRootV1 {
  schemaVersion: "EXPERIMENT_PLAN_ROOT_V1";
  experimentPlanRootId: Uuid;
  investigationId: Uuid;
  researchSpecRevisionId: Uuid;
  headRevisionId: Uuid;
  headRevisionNumber: CanonicalRevisionNumberV1;
  createdAt: CanonicalTimestamp;
}
```

## 17.2 Immutable plan revision

Conceptual structural wrapper:

```ts
interface ExperimentPlanRevisionV1 {
  schemaVersion: "EXPERIMENT_PLAN_REVISION_V1";
  experimentPlanRevisionId: Uuid;
  experimentPlanRootId: Uuid;
  investigationId: Uuid;
  researchSpecRevisionId: Uuid;
  revision: CanonicalRevisionNumberV1;
  predecessorRevisionId?: Uuid;
  canonicalContentHash: ContentHash; // hashing still blocked until exact owner payload exists
  createdAt: CanonicalTimestamp;
}
```

The later consolidated semantic type may add the already-designed experiment groups, sensitivity refs, required-data requirements, and compute budget. Those fields are immutable per revision.

## 17.3 Plan revision CAS

First/successor plan revision requires:

```text
current user/system authority for owning Investigation
exact active ResearchSpec == plan root ResearchSpec
full Investigation active-pointer predecessor evidence
exact plan-root head predecessor evidence when root exists
```

The command then atomically creates/advances the plan revision root head.

ExperimentPlan revision creation does **not** change an Investigation active scientific pointer and therefore does not increment `activePointerVersion`.

It still compares the active-pointer predecessor to prove that the bound Spec remained current during the planning mutation.

When a new Spec becomes active, older ExperimentPlan roots remain immutable historical orchestration. New revisions may not be appended to those stale-Spec roots in V1.

Runs must never infer scientific input from “latest ExperimentPlan”. A6 must bind exact Experiment/Spec/Dataset/Run input identities.

---

# 18. ResearchTemplate lifecycle correction

Earlier working `ResearchTemplateVersionV1` included:

```text
status = ACTIVE | RETIRED
```

inside an object also described as an immutable version with a canonical content hash.

That is rejected. Mutable publication/lifecycle state must not live inside immutable scientific/reference content.

A3 separates:

```text
ResearchTemplateRootV1
  -> immutable ResearchTemplateVersionV1 rows
```

## 18.1 Template root

Conceptual root:

```ts
interface ResearchTemplateRootV1 {
  schemaVersion: "RESEARCH_TEMPLATE_ROOT_V1";
  templateId: Uuid;
  status: "ACTIVE" | "RETIRED";
  latestVersionId: Uuid;
  latestVersionNumber: CanonicalRevisionNumberV1;
  lifecycleVersion: CanonicalCasVersionV1;
  createdAt: CanonicalTimestamp;
  retiredAt?: CanonicalTimestamp;
}
```

`templateId` is durable reference identity, not version content identity.

## 18.2 Immutable template version

A template version must have its own immutable row identity and predecessor:

```ts
interface ResearchTemplateVersionV1 {
  schemaVersion: "RESEARCH_TEMPLATE_VERSION_V1";
  templateVersionId: Uuid;
  templateId: Uuid;
  templateVersion: CanonicalRevisionNumberV1;
  predecessorTemplateVersionId?: Uuid;
  // immutable semantic template fields owned by the later template/spec contract
  canonicalContentHash: ContentHash;
  createdAt: CanonicalTimestamp;
}
```

`status` and `retiredAt` are forbidden inside the immutable version payload.

Publishing a new version uses linear head CAS on the root and requires the root to be ACTIVE.

Historical versions remain addressable by exact version identity for provenance/replay even after the root is retired.

Retirement never rewrites or rehashes a historical version.

## 18.3 Authority note

A1 currently admits:

```text
RESEARCH_TEMPLATE_READ_V1
RESEARCH_TEMPLATE_VERSION_PUBLISH_V1
```

but does not yet admit a template-retire operation token.

Therefore A3 defines the structural RETIRED state separation but does **not** authorize a runtime retirement mutation. A retire transition remains blocked until an explicit A1 authority/capability amendment accepts the operation.

The same immutable-version/mutable-selector principle applies to ontology/reference versions, but A3 does not invent their final schema.

---

# 19. No implicit activation operations

A1 has no generic `ACTIVATE_REVISION` operation token.

A3 therefore closes V1 behavior without inventing one:

```text
RESEARCH_DRAFT_REVISION_CREATE_V1
  -> append + activate Draft + downstream clear atomically

RESEARCH_HYPOTHESIS_REVISION_CREATE_V1
  -> append + activate Hypothesis + downstream clear atomically

RESEARCH_SPEC_REVISION_CANONICALIZE_V1
  -> append + activate Spec + Experiment clear atomically

RESEARCH_EXPERIMENT_CREATE_V1
  -> create + activate Experiment atomically
```

There is no separate user operation that later points the Investigation at an arbitrary historical revision/object.

Historical objects remain readable under authority but are not silently reactivated from UI/conversation state.

A future reactivation capability requires a new explicit authority operation and exact compatibility/CAS contract.

---

# 20. Transaction ordering for material structural mutations

A3 structural mutations inherit A1 transaction-time authority revalidation and I4-style CAS discipline.

For a new, not-yet-replayed USER_PRINCIPAL material command, the canonical ordering is conceptually:

```text
1. authenticate + request-time authorize
2. strict command validation
3. compute/bind material_request_hash under the accepted operation contract
4. check durable idempotency namespace after current disclosure/ownership authorization
5. if exact replay exists:
     same key + same material request -> return exact historical durable result
     same key + different material request -> CONFLICT
6. if no replay:
     begin material transaction
7. revalidate authority/lifecycle in transaction
8. lock canonical InvestigationRoot
9. compare required lifecycle eligibility
10. compare full aggregate active-pointer predecessor when operation depends on/changes it
11. lock/create exact semantic root where applicable
12. compare root-head predecessor where applicable
13. validate cross-object lineage/closure
14. insert immutable revision/object
15. advance root head if applicable
16. update/clear active pointers if applicable
17. increment exact CAS counter(s)
18. persist idempotent durable result/effect record
19. commit
20. record/retain audit/conflict evidence according to A1 audit law
```

A successful idempotent retry returns the exact originally committed object IDs and resulting versions. It does not fail merely because active pointers later advanced.

A failed fresh CAS does not leave:

```text
orphan revision
orphan Experiment
advanced root head
partial active-pointer clear
half-created plan version
```

Conflict/denial audit evidence must survive material rollback through the accepted audit boundary.

---

# 21. Exact CAS domains by operation

| operation | lifecycle CAS | Investigation pointer CAS | semantic root-head CAS |
|---|---:|---:|---:|
| create Investigation | n/a | initializes v0 | n/a |
| archive Investigation | YES | no | no |
| create Draft revision | lifecycle eligibility check | YES | Draft head/absence |
| create Hypothesis revision | lifecycle eligibility check | YES | Hypothesis head/absence |
| canonicalize Spec revision | lifecycle eligibility check | YES | Spec head/absence |
| create Experiment | lifecycle eligibility check | YES | no |
| create ExperimentPlan revision | lifecycle eligibility check | compare predecessor, no increment | Plan head/absence |
| publish Template version | template lifecycle/head CAS | n/a | Template latest head |

“lifecycle eligibility check” means the operation locks/revalidates the Investigation lifecycle state but does not mutate `lifecycleVersion`.

No version counter is incremented on failed validation/CAS.

---

# 22. Archive and deletion law

Normal I5 V1 application behavior supports archive, not destructive deletion, for canonical Investigation scientific history.

After Investigation becomes ARCHIVED:

```text
new user material Research revisions/Experiments/Plans/Runs = denied
historical reads = still require current authority
historical objects = preserved
active pointers = preserved as historical selector state
```

Archive does not erase root heads, revision lineage, hashes, evidence, or Results.

In-flight Run completion/cancellation semantics are not guessed here; A6 must close them explicitly.

Hard delete/retention-erasure is not a normal A3 Research mutation and is not authorized by this contract. Any future legal/retention process requires its own audited operational contract and must not masquerade as scientific revision.

---

# 23. Hash/preimage interaction with A2

A3 structural fields do not become scientific hash inputs merely because they exist.

A2 remains controlling:

```text
HASH DOMAIN DECLARED != HASH DOMAIN ADMISSIBLE
```

Therefore:

- A3 does not hash whole root rows;
- mutable Investigation pointers/lifecycle are not silently included in immutable revision content hashes;
- mutable Template root status is not part of immutable TemplateVersion scientific/reference content identity;
- generated UUIDs are not generic scientific sort/tie-break authority;
- `canonicalContentHash` fields on working semantic wrappers remain unusable until the exact owner `*_HASH_PAYLOAD_V1` is frozen;
- root-head CAS identity is structural concurrency evidence, not automatically scientific content identity.

A4/A5/A6/A9 must each declare their exact hash payloads before runtime hash admission.

---

# 24. Structural invariants that future schema/runtime must prove

At minimum, implementation design must be able to enforce mechanically:

```text
Investigation ownership/source fields immutable
ARCHIVED terminal for user material mutations
separate lifecycleVersion and activePointerVersion
full active-pointer aggregate CAS
one Draft root per Investigation
one Hypothesis root per Investigation
one Spec root per Investigation
one Plan root per (Investigation, SpecRevision)
root cannot exist without head revision in V1
revision number contiguous from root head
revision predecessor exact current head
no revision forks
Hypothesis.sourceDraft == active Draft at activation
Spec.sourceDraft == active Draft at activation
Spec.hypothesis == active Hypothesis or absent when none active
Experiment.spec == active Spec at activation
non-baseline Experiment parent same Investigation + same Spec
Experiment immutable
Plan revision immutable
TemplateVersion immutable
Template lifecycle separate from TemplateVersion content
no active-pointer state violating dependency closure
failed CAS leaves no partial material state
idempotency never authorizes or cross-owns state
```

A schema/runtime proposal that cannot prove these without trusting client IDs is not A3 compliant.

---

# 25. Explicitly rejected A3 alternatives

I5 V1 rejects:

```text
mutable overwrite-only Draft/Hypothesis/Spec rows
multiple implicit semantic roots per Investigation
revision forks without an explicit branch contract
"max(revision)+1" without locked predecessor authority
using createdAt as revision order
one mutable Experiment row with version field
Experiment variants across different Spec revisions
ExperimentPlan ID reused with mutable version field and no predecessor root
mutable template status inside hashed immutable version content
independent active-pointer CAS counters per Draft/Hypothesis/Spec/Experiment
partial downstream pointer preservation based on guessed compatibility
client-provided active pointer as authority
reactivating historical objects from conversation state
hard deleting scientific history as a normal edit
```

---

# 26. A3 acceptance boundary

A3 is structurally acceptable only if independent audit confirms all of:

```text
A1 authority laws preserved
A2 byte/hash laws preserved
no parallel authority object created
no schema/runtime/prod mutation introduced
root cardinalities closed
revision predecessor law closed
fork policy closed
active pointer aggregate predecessor closed
downstream invalidation deterministic
Experiment lineage closed
ExperimentPlan root/version gap closed
Template lifecycle/hash ambiguity closed
counter representation no longer depends on JS number precision
archive semantics do not delete history
known later-owner semantic questions remain explicitly blocked, not guessed
CI baseline has no new failures
```

Passing A3 does not freeze I5-A and does not authorize implementation.

Next owner step after A3 is:

```text
I5-A4 — Research Draft / Hypothesis / ResearchSpec semantics,
ambiguity/default policy, canonical semantic payloads and hash admission.
```
