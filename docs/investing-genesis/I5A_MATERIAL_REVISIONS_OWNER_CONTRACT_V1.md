# Syntrake Investing Genesis I5-A3 - Material Revisions Owner Contract V1

Status: `CURRENT CONSOLIDATED OWNER CONTRACT`

This contract consolidates the accepted A3 roots/revisions/immutability contract
and its amendments. It creates no new runtime, schema, migration, RLS, Supabase
state, Trading dependency, financial mutation, broker/Paper/Live execution or
recommendation authority.

## Scope

A3 owns structural material revision persistence rules only:

- Investigation durable identity and immutable ownership fields;
- one root per Investigation for Draft, Hypothesis and ResearchSpec;
- linear immutable revision chains;
- root-head predecessor/CAS law;
- aggregate active-pointer CAS law;
- deterministic downstream pointer invalidation;
- immutable Experiment parent/variant lineage as a structural boundary;
- ExperimentPlan and ResearchTemplate structural lineage boundaries;
- the split between structural identity and later semantic/hash owners.

A3 does not define DatasetSnapshot, Run, Result, worker/job execution, metrics,
backtests, Trading, Paper, broker execution, recommendations or final scientific
payload owners beyond the currently accepted Draft/Hypothesis/Spec subset.

## Counters

CAS and revision counters are decimal strings, not JavaScript numbers.

```text
CanonicalCasVersionV1: ^(?:0|[1-9][0-9]*)$
CanonicalRevisionNumberV1: ^[1-9][0-9]*$
Maximum: 9223372036854775807
```

No sign prefix, leading zeroes other than exact `0`, exponent notation, timestamp
substitution or floating-point increment is authority.

## Root And Revision Law

A root is a durable mutable selector container. A revision is immutable after
commit. Corrections append successor revisions; they never rewrite predecessors.

Root creation is lazy and atomic with the first revision. Empty roots are not
canonical V1 state.

Revision 1 has no predecessor. Revision N greater than 1 has predecessor equal
to the current actual root head and revision number equal to actual head + 1. No
implicit forks or hard deletes are admitted.

## Investigation Ownership

Investigation creation admitted by current I5 V1 is exactly:

| sourceContext | actor | scope | tenant | account |
| --- | --- | --- | --- | --- |
| PURE_RESEARCH | USER_PRINCIPAL | TENANT_SCOPE | required | absent |
| TEST_PORTFOLIO | USER_PRINCIPAL | TENANT_SCOPE | required | absent |
| USER_PORTFOLIO | USER_PRINCIPAL | ACCOUNT_SCOPE | derived from account | required |

DOMAIN_SCOPE and SYSTEM_ACTOR Investigation creation are not admitted by current
I5 V1. Creator fields are provenance, not continuing authorization.

## Material Kinds

Current A3/A4 material revision kinds:

- `DRAFT`
- `HYPOTHESIS`
- `RESEARCH_SPEC`

Draft and Hypothesis are independent sibling roots. Hypothesis has no A3
`sourceDraftRevisionId` field and no structural predecessor dependency on Draft.
ResearchSpec binds the exact Draft and optional Hypothesis dependency under the
A4 owner contract.

## Active Pointer CAS

Every pointer-changing command compares the complete aggregate predecessor:

- active pointer version;
- active Draft revision or null;
- active Hypothesis revision or null;
- active Spec revision or null;
- active Experiment or null.

All pointer effects, root/head effects, immutable revision inserts and
idempotent durable results are one transaction.

## Downstream Invalidation

Controlling A3 invalidation matrix:

| successful new object | Draft | Hypothesis | Spec | Experiment |
| --- | --- | --- | --- | --- |
| Draft revision | NEW | KEEP | CLEAR | CLEAR |
| Hypothesis revision, no active Spec | KEEP | NEW | null | existing pointer must already be null |
| Hypothesis revision, active Spec without hypothesis ref | KEEP | NEW | KEEP | KEEP if closure holds |
| Hypothesis revision, active Spec with hypothesis ref | KEEP | NEW | CLEAR | CLEAR |
| ResearchSpec revision | KEEP | KEEP | NEW | CLEAR |
| Experiment | KEEP | KEEP | KEEP | NEW |

All decisions are made under the same locked Investigation root/pointer state.
Impossible ownership or closure graphs fail closed.

## Authority And Idempotency

Material writers must resolve operation-specific Research authority before
building derived material evidence. Client-supplied scope data is never
authorization.

Concurrent same idempotency namespace/key/material must converge to the durable
winner. Same namespace/key with different material is `CONFLICT`. A transaction
that rolls back before material commit must not leave a durable successful
idempotency result.

## Hash Boundary

A3 does not create a generic `ContentHash` scalar. Hash-bearing fields must obey
the current canonical hash-domain owner contract. Declared but disabled domains
remain blocked until an accepted owner contract admits exact payloads.

## Explicit Exclusions

No DatasetSnapshot, Run, Result, execution engine, worker, Paper, broker, Live,
Trading import/reuse, portfolio recommendation, Supabase mutation or production
action is authorized by this contract.
