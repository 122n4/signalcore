# I5 Experiment Scientific Closure Owner Contract V1

Status: CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT SCIENTIFIC CLOSURE - UNNUMBERED

## Purpose

This current accepted unnumbered slice closes Experiment scientific identity for accepted BASELINE and VARIANT Experiment rows.

It establishes:

```text
SYNTRAKE:EXPERIMENT:V1 = OWNER_PAYLOAD_EXACT
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = OWNER_PAYLOAD_EXACT
```

It does not assign a permanent A-number.

## Accepted Scientific Payloads

BASELINE Experiment scientific identity is the exact owner payload:

```ts
{
  schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1";
  relation: "BASELINE";
  researchIr: HashRefV1;
  experimentParameters: null;
}
```

VARIANT Experiment scientific identity is the exact owner payload:

```ts
{
  schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1";
  relation: "VARIANT";
  parentExperiment: HashRefV1;
  researchIr: HashRefV1;
  experimentParameters: HashRefV1;
}
```

The accepted VARIANT payload binds scientific parent Experiment identity, resolved Research IR identity and ExperimentParameters identity. It does not use operational Experiment UUID as scientific identity.

## Scientific And Operational Identity Separation

Operational parent UUID and scientific parent Experiment HashRef are distinct required facts.

The operational parent UUID proves persisted lineage and database referential integrity. The scientific parent Experiment HashRef proves the exact scientific parent identity used by a VARIANT.

The accepted matrix proves sibling VARIANT rows may share an operational parent when their scientific identity differs.

## ExperimentParameters Relationship

ExperimentParameters scientific identity remains:

```text
SYNTRAKE:EXPERIMENT_PARAMETERS:V1 = OWNER_PAYLOAD_EXACT
```

VARIANT Experiment rows persist the ExperimentParameters HashRef envelope. This is durable hash-envelope persistence for VARIANT lineage.

This contract does not establish standalone raw ExperimentParameters payload persistence.

## Persistence Authority

The accepted scientific-closure migration persists:

- Experiment HashRef envelope on BASELINE and VARIANT Experiment rows;
- ExperimentParameters HashRef envelope on VARIANT Experiment rows;
- scientific uniqueness for Experiment identity;
- operational parent UUID FK for VARIANT lineage.

The migration is fail-closed for non-empty existing `investing.research_experiments` prestate. It does not backfill or invent scientific hashes.

Production Supabase migration application was not performed.

## RLS And Authority Model

The accepted PostgreSQL 17 rehearsal proved Tenant and Account authority with RLS and FORCE RLS enabled.

BASELINE authority binds the persisted Experiment HashRef to transaction context.

VARIANT authority binds:

- child Experiment HashRef;
- parent Experiment HashRef;
- parent Research IR HashRef;
- ExperimentParameters HashRef;
- expected active operational Experiment pointer;
- operational parent Experiment UUID.

Application grants remain minimal for the accepted Experiment persistence surface.

## Duplicate Identity Behavior

Exact duplicate scientific Experiment identity cannot create a second authoritative row.

Sibling VARIANT coexistence is allowed when scientific identity differs.

## Sibling And Chained VARIANT Semantics

The accepted matrix proves:

```text
E0 = BASELINE
E1 = VARIANT(parent E0, P1)
E2 = VARIANT(parent E0, P2)
E3 = VARIANT(parent E1, P3)
```

It also proves parent Experiment identity and expected active Experiment pointer are separate concepts.

## Rollback Guarantee

The accepted PostgreSQL 17 rehearsal proves rollback leaves no partial mutation across:

- Experiment row;
- research material pointer state;
- idempotency record state.

## Accepted Provenance

```text
technical candidate:
59575f91bd276d607ca286a6dd1d485d3f68c497

original implementation base:
b10fed247ebeb04a43ff5dcda3a1e6040bf14148

current canonical main predecessor at acceptance time:
87e3083a5e3b8a95c65adf115f76a2aa7e2218d3

PR:
#71

CI:
35361968564 - SUCCESS

PG17:
35361968472 - SUCCESS

PostgreSQL:
17.11

Static reconciliation:
6/6 PASS

Existing Genesis/I5 PG17 rehearsal:
6/6 PASS

Dedicated Experiment Scientific Closure PG17 rehearsal:
3/3 PASS

Integrated RLS + sibling/chained scientific identity matrix:
PASS

Vercel:
SUCCESS

Independent auditor verdict:
PASS

Permanent A-number:
NOT ASSIGNED

Production Supabase migration application:
NOT PERFORMED
```

## Boundaries And Non-Goals

This contract does not claim Research Spec scientific hashing, standalone raw ExperimentParameters object persistence, DatasetSnapshot, MetricRequestSet, ExecutionConfig, RunInput, execution engine, Run, Result, Evidence, Passport completion, Paper, Trading, Capital, broker, Live, optimizer, Strategy DNA, Strategy Autopsy, Blind Truth Test or UI completion.

```text
SYNTRAKE:RESEARCH_SPEC:V1 = DECLARED_BUT_HASHING_DISABLED
```

DatasetSnapshot remains deferred and is the next scientific dependency.

## Supersession

This acceptance supersedes the prior limitations that scientific Experiment identity was not yet accepted and current VARIANT persistence could not distinguish same-parent variants solely by ExperimentParameters.

It does not supersede DatasetSnapshot deferral, ResearchSpec disabled scientific hashing, standalone raw ExperimentParameters persistence deferral, Run/Result/Evidence, Paper, Trading or Investing Core.
