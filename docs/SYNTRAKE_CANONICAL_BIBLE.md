# SYNTRAKE — CANONICAL BIBLE

> **Status:** CANONICAL PRODUCT & ENGINEERING CONTRACT  
> **Authority:** Highest-level product/architecture reference for Syntrake  
> **Purpose:** Prevent drift, contradictions, forgotten decisions, architecture erosion, false implementation claims and redesign-by-chat.  
> **Rule:** When this document conflicts with an informal chat, Codex suggestion, implementation shortcut, generated plan or stale document, this Bible wins unless it is explicitly amended through the canonical change process below. Real external state still wins for facts about what is actually deployed, stored or running.

---

# 0. HOW TO USE THIS DOCUMENT

This file is the canonical “Bible” of Syntrake.

It exists so that:

- every new ChatGPT/Codex session starts from the same final vision;
- no agent silently changes the product into something else;
- product, backend, quant, data, security, UX and execution remain aligned;
- accepted architectural decisions remain preserved;
- new implementation work is integrated into the canonical model;
- the difference between **vision**, **accepted design**, **implemented candidate**, **accepted implementation**, and **verified production reality** is always explicit;
- a new engineer can understand not only what exists, but why it exists and what must never be broken.

This document MUST be read before any material Syntrake implementation, refactor, migration, architectural change, financial-engine change, auth/security change, broker/execution change or roadmap change.

## 0.1 Truth hierarchy

When sources disagree, use this hierarchy:

1. **Real external state**, when relevant:
   - GitHub repository and exact SHA;
   - Supabase project/database state;
   - Vercel deployment state;
   - broker/provider state;
   - real market/financial data source.
2. **This Canonical Bible** for product/architecture intent and accepted invariants.
3. Accepted ADRs/contracts/specifications explicitly referenced by this Bible.
4. Verified tests and executable code.
5. Codex/AI reports.
6. Chat discussion / memory.
7. Assumptions.

AI text is never proof of implementation.

## 0.2 Required truth labels

Every material claim about system state must be classifiable as one of:

- **REAL** — directly verified against the authoritative source.
- **STALE** — previously real, but freshness is no longer sufficient.
- **ESTIMATED** — reasoned approximation; not financial truth.
- **SIMULATED / DEMO** — sandboxed/non-real financial state.
- **UNAVAILABLE** — data or proof is absent.

Absence of data MUST NOT be converted into `0`, `€0`, `0%`, “safe”, “no risk”, “no holdings”, “no fees”, “no income”, “no drawdown” or any other fabricated fact.

---

# 1. FINAL PRODUCT VISION

Syntrake is a continuous decision-support and, progressively, governed execution system for **Investing** and **Trading**.

## 1.1 Canonical product identity

**Internal category:** `Financial Decision & Execution System` for Investing and Trading.

**Canonical plain-language definition:**

> Syntrake continuously follows Investing and Trading state and helps decide what to do next — including when to do nothing — using financial truth, risk, objectives, constraints and auditable evidence, with progressively governed execution where authorized.

The product is NOT fundamentally:

- a backtest website;
- a signal generator;
- a generic quant toolbox;
- a charting terminal;
- a collection of AI widgets;
- a portfolio tracker with decorative analytics;
- a buy/sell recommendation bot;
- a Research Lab with Investing/Trading attached to it.

Its central question is:

> **Given this user's real situation, their objectives, constraints, risk, portfolio/trading state and what we know now, is there something they should do — and can Syntrake prove why?**

Valid Investing outcomes include:

`BUY / ADD / REDUCE / SELL / REPLACE / REBALANCE / APPLY NEW CAPITAL / HOLD CASH / NO ACTION`

Valid Trading outcomes include:

`TRADE / NO TRADE / BLOCKED`

Syntrake must never generate activity merely to appear useful.

---

# 2. NON-NEGOTIABLE SYSTEM PRINCIPLES

These principles are constitutional.

## 2.1 Core ≠ Lab

Essential decision engines belong to **Syntrake Core**, never to the Research Lab.

If all Labs were removed tomorrow:

- Investing must still be complete;
- Trading must still be complete;
- monitoring, risk, suitability, decisioning and financial/trading state must still function.

Labs may consume Core engines. Core must never require Lab entities to analyze a portfolio, track a portfolio, assess market state, calculate risk, make a core decision, rebalance, size a trade or enforce execution safety.

## 2.2 Investing and Trading are separate financial domains

They may share safe infrastructure but remain isolated in:

- auth scope where required;
- financial state;
- positions;
- cash;
- ledger;
- risk mandate;
- recommendations;
- execution authority;
- broker/account context;
- accounting semantics;
- suitability logic;
- domain-specific Labs where meaning differs.

A Trading action must never silently mutate Investing state, or vice versa.

## 2.3 Financial truth before AI

AI may interpret, summarize, explain and help investigate.

AI must NOT replace:

- accounting;
- position truth;
- cash truth;
- deterministic calculations;
- authorization;
- ownership;
- broker reconciliation;
- point-in-time market truth;
- ledger integrity.

No material recommendation may exist only because an AI said so, a score is high or a backtest looked good.

## 2.4 No invented confidence/probabilities

Never invent confidence percentages, expected returns, win probabilities, future Sharpe, drawdown probabilities, “chance of success” or safety scores unless they come from an explicit auditable model with valid inputs, assumptions and provenance.

## 2.5 Inaction is first-class

`NO ACTION` and `NO TRADE` are correct product outcomes.

---

# 3. INVESTING — FINAL CANONICAL MODEL

Investing is longitudinal. The user does not merely run an analysis; Syntrake follows a living financial state over time.

## 3.1 User already has a portfolio

Syntrake should:

1. import or construct the current portfolio;
2. establish ownership and scope;
3. establish financial truth;
4. resolve instrument identity;
5. identify cash and positions;
6. classify known vs unknown data;
7. understand goals, horizon, risk and restrictions;
8. evaluate suitability and allocation;
9. assess risk, performance, concentration and opportunity;
10. decide whether action is justified;
11. continue monitoring longitudinally.

## 3.2 User does not have a portfolio

Syntrake should:

1. understand available capital;
2. keep future/recurring contributions separate from current capital;
3. understand goals;
4. understand horizon;
5. understand experience;
6. understand risk tolerance/capacity;
7. understand restrictions;
8. generate explainable alternatives;
9. compare trade-offs;
10. propose a portfolio only when sufficiently justified;
11. continue monitoring after adoption.

## 3.3 Portfolio is a living entity

Where applicable preserve:

- positions;
- cash;
- contributions;
- withdrawals;
- buys/sells;
- income/dividends/interest;
- fees;
- taxes if known and applicable;
- FX;
- corporate actions;
- allocations;
- benchmarks;
- goals;
- constraints;
- risk mandate;
- recommendation/decision history;
- provenance;
- reconciliation state.

## 3.4 Accounting distinction

Always distinguish:

- planned contribution;
- realized contribution;
- future capital;
- cash balance;
- external cash flow;
- investment P&L;
- income;
- performance;
- fees/costs.

**Contributions are never investment return.**

## 3.5 New capital before unnecessary selling

When a portfolio is off target and new capital exists or is expected, consider deploying that capital before proposing unnecessary sales.

---

# 4. INVESTING CORE ENGINES

The exact modules may evolve, but essential conceptual capabilities include:

- Portfolio State
- Instrument Identity
- Cash / Financial Truth
- Allocation
- Performance
- Risk
- Opportunity
- Valuation
- Scenario / Stress
- Suitability
- Rebalance
- Cost Awareness
- Tax Awareness where supported
- Decision
- Recommendation Lifecycle
- Monitoring
- Provenance / Evidence
- Reconciliation

No essential Investing engine may be hidden inside Research Lab merely because it uses quantitative techniques.

---

# 5. TRADING — FINAL CANONICAL MODEL

Trading is a separate decision/execution domain combining:

- market state;
- strategy/opportunity evidence;
- trading-book state;
- risk;
- sizing;
- costs;
- execution feasibility;
- mandate;
- limits;
- broker/account truth.

Conceptual Trading Core capabilities include:

- Market State
- Opportunity
- Strategy Eligibility
- Risk
- Sizing
- Cost / Slippage Awareness
- Execution Intent
- Mandate Validation
- Decision
- Order Lifecycle
- Reconciliation
- Kill Switches
- Monitoring

---

# 6. RESEARCH LAB / “MESA DE FABRICO”

The Research Lab is important, but it is not the center of Syntrake.

Its purpose is to formulate hypotheses, test ideas, perform backtests, compare alternatives, preserve research lineage, detect overfitting, perform blind validation, build evidence and promote only adequately validated ideas.

It may include:

- Scientific Runs;
- hypothesis versioning;
- Blind Truth Test;
- Evidence Vault;
- secret holdout;
- freeze / one-shot verification;
- Strategy DNA;
- Strategy Autopsy;
- overfit detection;
- walk-forward / OOS evaluation;
- SYNTRAKE Passport;
- Evidence Ledger;
- reproducibility contracts.

Backtest result = **historical evidence**, never a future promise.

---

# 7. DIFFERENTIATION

Syntrake should not win by accumulating generic features. It should differentiate through trust, evidence, governance and decision quality.

## 7.1 Truth & Evidence Engine

Preserve evidence around hypotheses, experiments, revisions, failures, accepted ideas, historical results, datasets, versions, promotions and invalidations.

## 7.2 SYNTRAKE Passport

A material research/strategy result should be able to carry, when applicable:

- dataset/snapshot/hash;
- provider/as-of;
- engine version;
- hypothesis version;
- parameters;
- assumptions;
- transaction costs;
- OOS/walk-forward status;
- holdout status;
- paper evidence;
- audit history.

## 7.3 Strategy DNA

Detect hidden overlap/correlation so apparently different strategies do not create fake diversification.

## 7.4 Strategy Autopsy

When performance degrades, help explain possible causes instead of merely showing a falling equity curve.

## 7.5 Blind Truth Test / Evidence Vault

A hypothesis may pre-register markets, timeframe, variables, metrics, thresholds, risk budget and evaluation rules. A protected holdout can remain inaccessible to the user, AI and optimizer before the final one-shot check.

## 7.6 Capital Kernel / Decision Firewall

Before capital is actually acted upon, a central safety boundary should enforce mandate, account scope, capital limits, exposure, risk, authorization, provenance and kill switches.

Prefer `BLOCKED` to unsafe ambiguity.

---

# 8. MARKET / DATA TRUTH

Market data is Core infrastructure, not Lab infrastructure.

Providers sit behind adapters/contracts so the domain model is not permanently coupled to one vendor.

For Investing, `1D` is the preferred base historical frequency when sufficient; `1W`/`1M` may be derived; intraday should be required only when the use case needs it.

Where relevant handle correctly:

- instrument identity;
- exchange;
- currency;
- trading calendar;
- timezone;
- corporate actions;
- delistings;
- missing/stale data;
- adjusted vs raw prices;
- FX;
- survivorship bias;
- look-ahead bias;
- point-in-time correctness;
- provider provenance;
- snapshot/hash;
- data revisions.

Missing data must never be silently fabricated.

---

# 9. DECISIONS AND RECOMMENDATIONS

A material decision should compare, where relevant:

- current state;
- user objectives;
- horizon;
- risk mandate;
- restrictions;
- market state;
- portfolio/trading state;
- costs;
- available cash/new capital;
- alternatives;
- suitability;
- uncertainty/data quality.

A recommendation should be reconstructible through sufficient evidence, including scope, as-of, provenance, assumptions, engines/versions, deterministic metrics, costs, constraints, suitability/risk result, alternatives, final decision and limitations.

---

# 10. AUTOMATION PROGRESSION

Canonical progression:

**ADVISORY → SHADOW → PAPER/DEMO BROKER → LIVE**

## 10.1 Advisory

Syntrake recommends; the user executes.

## 10.2 Shadow

Syntrake decides as if it could execute, but sends no order.

## 10.3 Paper / Demo Broker

Must precede Live. Validate order lifecycle, partial fills, rejects, timeouts, disconnects, idempotency, retries, reconciliation, recovery and kill switches.

## 10.4 Live

Live is a real target, but only after sufficient evidence of engine quality, financial truth, authorization, execution safety, reconciliation, risk controls, operational resilience and auditability.

Live operates only inside an explicit user mandate covering, as applicable, accounts, capital, instruments, exposure, risk, rules, execution permissions and kill switches.

Ambiguity around mandate or authority → **BLOCKED / fail closed**.

---

# 11. SECURITY, AUTHORITY AND TENANT ISOLATION

## 11.1 service_role is capability, not authorization

Elevated technical capability does not prove authority to act for a user, tenant, account or portfolio.

## 11.2 Client IDs do not prove ownership

Ownership/authority must be derived server-side from trusted state.

## 11.3 Fail closed

Material ambiguity around auth, tenant, account, portfolio, trading book, plan, entitlement, mandate, execution authority or financial truth must reject/block rather than guess.

---

# 12. UX PHILOSOPHY

Syntrake should be powerful without forcing every user to understand quant finance.

After registration, ask Investing or Trading. This is changeable later through a global switch. Do not drop a new user into a dense terminal.

For Investing, ask why the user came: learn, test ideas, build a portfolio, analyze an existing portfolio, use advanced tools, or “I don’t know yet”. Collect only minimal setup such as base currency, experience and whether they already have a portfolio.

Use progressive disclosure, overview vs deep work, contextual panels, staged workspaces, clear empty states and beginner guidance.

“Research Lab” may be presented as **Mesa de Fabrico** where appropriate: the place where ideas are built, tested and proven — not the whole product.

---

# 13. ENGINEERING PHILOSOPHY

Correctness beats speed.

Use maximum rigor where errors can affect auth, tenant isolation, accounting, financial truth, risk, execution, broker state, migrations, provenance, concurrency or idempotency. Avoid bureaucracy where risk is low.

---

# 14. CANONICAL DELIVERY PROCESS

For material work:

**MINIMUM NECESSARY CONTRACT → EXECUTABLE IMPLEMENTATION → TESTS → INDEPENDENT AUDIT → EXACT SHA → GATE**

Preferred pattern:

**Codex/VS Code → candidate commit → GitHub → independent audit → corrections → gate**

Codex is a builder, not the source of truth.

Every candidate must identify accepted predecessor SHA, candidate SHA and exact scope. The predecessor remains canonical until the candidate passes.

Audit actual code, diff, tests and relevant external state — never only a Codex summary or PR description.

New failures introduced by a candidate block acceptance.

---

# 15. DATABASE / MIGRATION RULES

Canonical flow:

**migration in Git → candidate SHA → preview/rehearsal → PG/RLS/security validation → independent audit → authorization → production**

Never silently repair migration drift. Production should receive artifacts corresponding to the exact approved SHA.

Without explicit owner authorization do NOT perform production DDL/DML, destructive rollback, merge where prohibited, modify real financial state or execute real broker orders.

---

# 16. TESTING PHILOSOPHY

Tests are proportional to risk.

- Math/risk: determinism, invariants, numerical boundaries, missing data, sign/currency semantics.
- Backtest: leakage, look-ahead, survivorship, point-in-time correctness, costs, determinism, provenance.
- Persistence/RLS: ownership, tenant isolation, unauthorized reads/writes, server-side authority.
- Financial operations: transactions, idempotency, concurrency, retries, duplicate prevention.
- Broker/execution: accepts, rejects, partial fills, disconnects, duplicate events, stale state, reconciliation, recovery, kill switches.
- Ledger: maximum rigor.

---

# 17. LONG-TERM DESIGN

Syntrake must survive provider, broker, engine, infrastructure, AI-model and team changes.

Preserve lineage, versioning, contracts, event semantics, auditability, provenance, historical decisions and old engine versions where reconstruction requires them.

Do not erase the past merely because the current implementation changed.

---

# 18. PRODUCT FILTER

Before approving a major feature ask:

> **Does this materially improve Investing or Trading monitoring/decision quality, or does it merely turn Syntrake into a collection of tools?**

---

# 19. ROADMAP PRINCIPLE

Canonical roadmap family:

**R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9**

Roadmap intent is not implementation truth. A release is complete only when its acceptance contract is met and verified.

---

# 20. VERIFIED IMPLEMENTATION STATE

This section MUST NOT be updated from memory alone.

## 20.1 Verified GitHub canonical baseline — 2026-09-12

The following repository facts were directly verified from GitHub while bootstrapping this Bible:

- Repository: `122n4/signalcore`.
- Default `main` is legacy/disconnected from the canonical Investing lineage and MUST NOT be treated as the canonical technical root.
- Canonical technical root branch: `fix/canonical-paper-lifecycle`.
- Verified branch HEAD: `87c19fd5ebadcc5b20ce587c185346379fd8d96b`.
- That HEAD is the merge of PR `#62`, `R6 canonical purge: remove legacy Investing truth paths`.
- PR #62 merged the Investing canonical purge / Genesis baseline on 2026-08-22.
- That merge explicitly did **not** authorize production deployment.
- Existing root `AGENTS.md` declares old Investing implementation retired and pre-Genesis Investing source/contracts/architecture prohibited as implementation references.
- Supabase migrations before the verified retirement boundary are historical lineage only for implementation purposes.

These are Git/repository facts only. They do not prove current production deployment, Supabase database state, broker state, market-data state or runtime health.

## 20.2 Production/external state

**STATE: UNVERIFIED / STALE UNTIL RECHECKED**

Before relying on production state verify:

- current production deployment SHA;
- Supabase migration state/schema/RLS where relevant;
- broker/provider state where relevant;
- actual production data/runtime health where relevant.

Never copy a previous PR statement into this section and call it current without re-verification.

## 20.3 Required state table

| Area | Status | Evidence | Exact SHA / Version | Last Verified |
|---|---|---|---|---|
| Canonical Git root | REAL | GitHub branch `fix/canonical-paper-lifecycle` | `87c19fd5ebadcc5b20ce587c185346379fd8d96b` | 2026-09-12 |
| Investing Core | UNVERIFIED | — | — | — |
| Trading Core | UNVERIFIED | — | — | — |
| Research Lab | UNVERIFIED | — | — | — |
| Auth / Tenant Isolation | UNVERIFIED | — | — | — |
| Market Data | UNVERIFIED | — | — | — |
| Accounting / Ledger | UNVERIFIED | — | — | — |
| Shadow | UNVERIFIED | — | — | — |
| Paper/Demo Broker | UNVERIFIED | — | — | — |
| Live | UNVERIFIED | — | — | — |
| Production DB | UNVERIFIED | — | — | — |
| Production Deploy | UNVERIFIED | — | — | — |

---

# 21. CHANGE GOVERNANCE — THE BIBLE MUST EVOLVE

This is a living contract.

Update it when an accepted material change affects product vision, architectural boundaries, financial semantics, security model, engine behavior, domain model, roadmap, execution model, UX canon, external interfaces, data/provenance rules or accepted implementation state.

Do not change canonical truth for trivial refactors, formatting, local variable renames, experiments or rejected candidates.

## 21.1 Candidate changes are not automatically canonical

Sequence:

1. proposal / contract;
2. candidate implementation;
3. tests;
4. independent audit;
5. gate;
6. accepted SHA;
7. update accepted Bible sections if canonical truth changed;
8. preserve amendment/ledger traceability.

## 21.2 No retrospective rewriting

When a material rule changes preserve what the old rule was, why it changed, when it changed and which SHA/version introduced the new rule.

## 21.3 MATERIAL WORK LEDGER — REQUIRED FOR CODEX

Every material Codex slice MUST add/update an entry here in the same candidate branch/commit series.

A ledger entry records that work exists; it does **not** make the work accepted. Codex may never promote its own candidate to canonical acceptance.

Lifecycle:

`PROPOSED → IMPLEMENTED_CANDIDATE → AUDITED → ACCEPTED`

or:

`PROPOSED → IMPLEMENTED_CANDIDATE → BLOCKED / REJECTED`

Minimum entry:

```text
Work ID / slice:
Date:
Domain: Investing | Trading | Shared Infrastructure | Research | UX | Security | Data | Ops
Accepted predecessor SHA:
Candidate SHA:
Status: IMPLEMENTED_CANDIDATE | AUDITED | ACCEPTED | BLOCKED | REJECTED
Scope:
Files / contracts materially changed:
Financial-truth impact: NONE | describe
Auth/tenant/authority impact: NONE | describe
DB/migration impact: NONE | describe
Execution/broker impact: NONE | describe
Tests/evidence:
Known limitations / baseline failures:
Bible impact: NONE | sections changed
Independent audit evidence:
Gate outcome:
```

Rules:

- `Candidate SHA` is filled only after the implementation commit exists.
- `ACCEPTED` requires an independent gate; Codex implementation alone is insufficient.
- If product vision, architectural invariants, financial semantics, authority, roadmap or accepted state changes, update the relevant sections after acceptance.
- Pure implementation detail may use `Bible impact: NONE`, but the ledger entry is still required for material work.
- Never rewrite older accepted history to make it cleaner.

### Bootstrap ledger entry

```text
Work ID / slice: CANONICAL-BIBLE-BOOTSTRAP
Date: 2026-09-12
Domain: Shared Infrastructure / Governance
Accepted predecessor SHA: 87c19fd5ebadcc5b20ce587c185346379fd8d96b
Candidate SHA: 5e9744c38c16e5f18df2f43449329a7e30ebd928
Status: IMPLEMENTED_CANDIDATE
Scope: Add the Syntrake Canonical Bible, bind root AGENTS.md to mandatory Bible bootstrap/maintenance, and add the canonical PR candidate-gate template.
Files / contracts materially changed: docs/SYNTRAKE_CANONICAL_BIBLE.md; AGENTS.md; .github/pull_request_template.md
Financial-truth impact: NONE
Auth/tenant/authority impact: NONE
DB/migration impact: NONE
Execution/broker impact: NONE
Tests/evidence: Documentation/bootstrap review; GitHub canonical branch/PR lineage verified before creation; candidate files created only on chore/syntrake-canonical-bible-bootstrap.
Known limitations / baseline failures: Does not certify production Supabase/Vercel/broker/runtime state; no runtime/product tests required for documentation/governance-only candidate.
Bible impact: Establishes this document as canonical product/engineering contract, mandatory Codex bootstrap, material-work ledger, and PR gate discipline.
Independent audit evidence: PENDING
Gate outcome: PENDING
```

The bookkeeping commit that records the candidate SHA is not itself the implementation candidate; the candidate above is the immediately preceding governance implementation commit.

---

# 22. CODEX OPERATING PROTOCOL

Every material Codex task begins by reading this Bible.

If Codex cannot access/parse this file, material Syntrake work is:

`BLOCKED — CANONICAL CONTEXT UNAVAILABLE`

At task end, every material implementation must leave the Bible consistent with the candidate by updating the Material Work Ledger. Accepted-state sections may change only after independent gate evidence exists.

Codex must:

1. identify relevant Bible sections;
2. identify accepted predecessor SHA;
3. define exact scope;
4. avoid unrelated changes;
5. preserve Investing/Trading boundaries;
6. preserve truth/provenance invariants;
7. implement the smallest safe executable slice;
8. add proportional tests;
9. report exact files changed;
10. report exact candidate SHA;
11. report `BIBLE IMPACT`;
12. explicitly identify contradictions;
13. fail closed rather than silently violate a canonical invariant.

## 22.1 Canonical contradiction

If requested work conflicts with this Bible, do not silently implement it.

Return:

`BLOCKED — CANONICAL CONTRADICTION`

with the conflicting section, requested behavior, why they conflict and resolution options.

## 22.2 Mandatory Bible impact assessment

Every material candidate must include:

```text
BIBLE IMPACT
- NONE
```

or list affected sections, proposed amendment, reason and whether amendment occurs only after gate.

---

# 23. NEW CHAT / NEW AGENT BOOTSTRAP

A new ChatGPT/Codex session must distinguish:

1. **What Syntrake is supposed to be** → Bible.
2. **What was accepted historically** → Bible + accepted artifacts.
3. **What actually exists now** → verify GitHub/Supabase/Vercel/provider state.
4. **What is proposed next** → candidate, not truth.

## 23.1 Root AGENTS.md contract

The canonical repository root `AGENTS.md` must preserve these instructions:

1. Read `docs/SYNTRAKE_CANONICAL_BIBLE.md` before material work.
2. Treat the Bible as product/architecture canon, subject to independently verified external truth for real system state.
3. Never use pre-Genesis Investing source/contracts/architecture as implementation authority.
4. Update the Bible Material Work Ledger for every material candidate.
5. Never mark a candidate `ACCEPTED` without independent audit/gate evidence.
6. If requested work contradicts the Bible, stop with `BLOCKED — CANONICAL CONTRADICTION`.
7. No merge, production deploy, destructive DB action, migration-history rewrite or real financial action without explicit owner authorization.

This linkage makes the Bible operational for Codex instead of passive documentation.

---

# 24. INVESTING GENESIS RULE

The old Investing implementation has been retired.

Pre-Genesis Investing source, contracts and architecture are prohibited as implementation references.

Supabase migrations before the verified retirement boundary are `HISTORICAL_LINEAGE_ONLY`.

Investing Genesis must be designed from:

- current requirements;
- current live schema truth when relevant and verified;
- explicitly accepted new contracts.

Never infer current behavior from deleted Investing code or historical migrations.

Historical artifacts may be used to understand lineage, incidents and why a boundary exists — not as authority for rebuilding retired behavior.

---

# 25. ANTI-DRIFT RULES

Forbidden drift includes:

- moving essential Core logic into Labs;
- merging Investing and Trading financial state;
- generating recommendations without financial truth;
- treating AI output as authority;
- treating backtests as future guarantees;
- inventing missing market/portfolio data;
- converting unknown cash/fees/positions into zero;
- trusting client IDs as ownership proof;
- treating service-role capability as authorization;
- executing outside explicit user mandate;
- silently bypassing risk controls;
- auto-promoting candidates because tests “probably pass”;
- declaring production state from memory;
- using retired pre-Genesis Investing implementation as current authority;
- implementing fashionable features unrelated to the core decision problem;
- losing historical lineage during refactors.

---

# 26. ACCEPTANCE CHECKLIST FOR MATERIAL SLICES

Before acceptance verify:

- [ ] Scope is explicit.
- [ ] Accepted predecessor SHA is known.
- [ ] Candidate SHA is exact.
- [ ] Diff is understood.
- [ ] No unrelated architecture drift.
- [ ] Auth/tenant boundaries remain correct.
- [ ] Financial semantics remain correct.
- [ ] Missing-data behavior is fail-closed/explicit.
- [ ] Tests are proportional to risk.
- [ ] No new failures.
- [ ] Migrations reviewed where relevant.
- [ ] RLS/security tested where relevant.
- [ ] Data provenance preserved where relevant.
- [ ] Idempotency/concurrency handled where relevant.
- [ ] Broker/reconciliation handled where relevant.
- [ ] No production action occurred without authorization.
- [ ] Bible impact assessed.
- [ ] Material Work Ledger updated.
- [ ] Bible amended if accepted canonical truth changed.
- [ ] Final gate explicit: ACCEPTED / BLOCKED / REJECTED.

---

# 27. CANONICAL AMENDMENT LOG

For material canonical changes record:

```text
Date:
Accepted predecessor SHA:
Accepted new SHA:
Sections changed:
Reason:
Old rule / state:
New rule / state:
Evidence:
Gate: ACCEPTED | BLOCKED | REJECTED
Audited by:
```

Never fabricate missing fields.

---

# 28. FINAL CANONICAL QUESTION

Every important Syntrake decision should ultimately serve:

> **Given the real situation of this user, their objectives, constraints, risk and what Syntrake actually knows now, is there something they should do — and can we prove why?**

If no action is justified:

**NO ACTION / NO TRADE is correct.**

If the answer cannot be proven safely:

**BLOCKED / UNAVAILABLE is preferable to fiction.**

---

# 29. STATUS OF THIS DOCUMENT

This document defines the canonical vision and governance contract.

It does **not** claim every described capability is implemented.

The Bible protects the destination and accepted invariants.

Git, tests, databases, deployments and external systems prove where Syntrake actually is today.
