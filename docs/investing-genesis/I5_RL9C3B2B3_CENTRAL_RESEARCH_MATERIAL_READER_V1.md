# RL-9C3B2B3 — Single Ordinary Investing Research Material Read Seam

Status: `CANDIDATE / SOURCE-COVERAGE_AND_HASH_VALIDATION / NOT_OPERATIONAL_EMBARGO / UNMERGED`.

Accepted main SHA: `f9b377668b1eea56ee8b18afa9151a24291e385c`.
Unaccepted stacked PRs: #138 → #139 → #140 → #141 → #142.
Immediate predecessor PR #142: `4de52bd97e588491d0ac47e297c4df68b3d10330`.

## Why

The original two Investing Research writers directly invoked `ResearchDatasetMaterialProviderV1.loadSeriesContent`: research execution and validation child execution. While that split persists, one future security patch can miss the other path. This slice funnels both writers into `ordinaryResearchDatasetMaterialRead.ts`; the exact hash-domain and DatasetSeries canonical SHA are verified **before** invoking the provider. Existing hash-addressed scientific fixture execution is retained.

Updated `investingGenesisI5Rl9c3b2b0ReadSurfaceInventory.test.ts` now requires **exactly one** direct `provider.loadSeriesContent(...)` site under the entire `lib/investing/research` tree, in the new seam. It also verifies both writers actually call the seam and no longer call the provider directly. Dedicated tests cover valid fixture dispatch, wrong digest/domain, malformed series, missing material and explicit acknowledgment of the remaining unguarded read.

## Non-claims and hard restrictions

**No operational embargo is implemented here.** The central seam is currently an unguarded provider delegation after scientific hash-identity checks; checking content hashes does NOT establish authorization. This change does not call the C3B2B2 denied-read journal. The journal itself is only a denial telemetry precursor and cannot grant bytes. Both components remain unaccepted and unapplied in Production.

The coverage inventory does not detect aliases, re-exported helpers, dynamically generated calls or other market/provider HTTP, cache or file-system routes. A complete read-surface review is required before registration admission.

**The mandatory next step** is to supply authenticated server-owned tenant and canonical provider mappings, check the complete durable embargo state, record access in an append-only and replay-safe ledger, and hold the register/read synchronization across read admission *and byte delivery*. Unit/PG17 integration must prove actual conflicting reader-vs-registration sequences and reject stale snapshots, tenant swaps, mapper ambiguity and alternate provider/frequency workarounds. No caller-provided `ALLOW`, `VERIFIED`, empty embargo list or hash digest counts as authority.

Do not re-enable the Blind Truth registration writer. No production migrations, merges, infrastructure costs, Vault access, customer data or Core/Trading changes are authorized by this candidate. No Research Lab gate can claim acceptance from this code until the true provider guard and isolation tests pass.
