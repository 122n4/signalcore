# Syntrake RL-9C3B2B7B — Core Market Identity Candidate Evidence

Status: `CANDIDATE / EXECUTABLE_PIT_CANDIDATE_RESOLVER / NOT_AUTHORITATIVE / NEVER_ALLOW / UNMERGED`.

Accepted main last verified: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Immediate stacked predecessor: PR #147 `46a17dfc8b231f2816769412e778e319acda6193`.
All PRs #138–#147 remain unaccepted Draft; no migration/deploy/merge is authorized.

## Core placement and purpose

The new `lib/market/identityCandidateEvidence.ts` belongs to shared **market-data Core infrastructure**, independent of Investing/Trading/Research Labs. Neither `lib/market/types.ts` quote/candle shapes nor the existing provider fallback clients prove historical instrument identity, corporate actions, currency/exchange scope or source authenticity.

The new deterministic resolver consumes **candidate** point-in-time instrument/field assertions only. Inputs have a closed schema: source provider identity, dataset/version, instrument/field and field versions, canonical market/field assertions, coverage `validFrom/validThrough`, the strict UTC `knownAt`, source evidence SHA and mandatory `authorityState:'UNVERIFIED'`. The requested series has exact source version and coverage; the caller supplies an explicit `asOf` timestamp rather than a system-clock guess.

The Core resolver enforces strict UTC timestamps and Gregorian date validation (including leap years), requires `asOf` to fall **after** the final observation's civil day (intraday publication time is not established), accepts records only when their `knownAt <= asOf`, refuses future observations, detects missing/partial coverage, duplicate/conflicting overlapping revisions, invalid unrelated records, malformed bounds or spoofed VERIFIED state, and never silently chooses the latest revision. It uses own data-property descriptors and exact schemas to reject accessors, prototype-inherited values, symbols and oversized/sparse evidence arrays. Fully covered, uniquely matched metadata still returns **`classification:'UNPROVEN', reason:'CANDIDATE_UNVERIFIED'`**, *never a read grant*.

No live provider adapter has yet independently verified the candidate; a SHA hash cannot prove historical factual accuracy, corporate-action semantics, survivorship or authentic source identity. The B7A PostgreSQL candidate table retains only `UNVERIFIED` rows and has no writer or promotion mechanism. This Core pure resolver does not read or write Supabase, nor does it invent market movements or timestamps.

## Lab consumes Core; Core does not consume Lab

`lib/investing/research/coreMarketIdentityEmbargoEvidence.ts` projects an ordinary research DatasetSeries into the Core resolver; only if the Core evidence is fully matched does it feed the resulting **unverified** canonical market/field candidate to the existing research holdout-intersection prefilter. A possible overlap may conservatively return `DENY`; disjoint, missing, future, malformed or ambiguous conditions return `UNPROVEN`. No scenario produces `ALLOW` or loads material bytes. The cross-provider and frequency case is explicitly tested.

This is a **pure, non-authorizing classifier**. It is not yet wired into public Research/Validation execution (which remain B6 denial-only), and no persisted mapping candidate from B7A is secretly treated as verified or as a source of authorization. Investing and Trading financial/auth/execution states stay separate; Core identity infrastructure is shared safely without a dependency on Labs.

## Required operational gates

1. Construct authenticated provider adapters and durable, point-in-time source-of-truth records, with actual provider/exchange identifiers, revisions/aliases, splits, adjustments, delistings and FX.
2. Reconcile the Core identity evidence to B7A durable candidate rows under proven server-side tenant ownership; do not promote based on hashes or a `VERIFIED` string.
3. Build complete all-source/caches/export read audit and protect observation retrieval/byte delivery in the same concurrency protocol as registration; handle timeouts and failure/retry.
4. Prove auth isolation, registration/race/no-prior-exposure and paper/demo safety with real disposable PG17. Only then consider enabling legitimate non-embargoed readings through service commands and independently authorizing Blind Truth admission.

**No positive authorization, no holdout registration grant, no operational embargo acceptance, no real Vault secrets, no Production migrations/deploy, no merge, no new paid infrastructure or automatic trading permission.**
