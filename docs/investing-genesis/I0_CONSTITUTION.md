# Investing Genesis I0 Constitution

GENESIS_BASELINE_SHA =
87c19fd5ebadcc5b20ce587c185346379fd8d96b

I0 defines the law for the new Investing system. Implementation begins in I1.

The pre-Genesis Investing implementation is:

- HISTORICAL_LINEAGE_ONLY
- NOT_ARCHITECTURAL_AUTHORITY
- NOT_RUNTIME_AUTHORITY
- NOT_SCHEMA_AUTHORITY

Do not consult or resurrect historical Investing commits, deleted files, old Investing migrations, old Investing docs, or old branches as architecture or contract sources. The only authorities are the current repository state, current live schema truth, current `AGENTS.md`, and accepted Genesis requirements.

## Domain Independence

Investing and Trading are independent domains.

Forbidden dependencies:

- `lib/investing` -> `lib/trading`
- `lib/trading` -> `lib/investing`
- `app/api/investing` -> Trading domain
- `app/api/trading` -> Investing domain

Do not recreate `mode = investing | trading` as a financial-truth multiplexer.

Do not share portfolio state, plans, accounting, execution state, recommendations, research state, risk state, or financial persistence between Trading and Investing.

Shared code is allowed only for proven domain-neutral primitives:

- authentication primitive
- billing/entitlement primitive
- observability
- generic database transport
- generic market-data transport
- generic cryptographic/hash primitives
- generic IDs/time utilities

Use explicit adapters where a neutral primitive crosses a domain boundary.

## Source Ownership And Dependency Law

The only Investing Genesis implementation namespaces are:

- `lib/investing/**`
- `app/api/investing/**`
- `app/app/investing/**`
- `components/investing/**`
- `scripts/investing/**`

Investing implementation must not appear in any other namespace without a future explicit and independently accepted Constitution and architecture-guard change.

INTERNAL DEPENDENCY POLICY = DENY BY DEFAULT

Investing code may depend only on:

1. other code inside the Investing Genesis namespaces;
2. external packages;
3. internal primitives explicitly audited and placed in the approved neutral allowlist of the architecture guard.

A path such as `lib/shared`, `lib/common`, `lib/server`, or `lib/signalcore` does not prove neutrality.

No internal primitive is automatically approved only because of its name or path.

APPROVED_NEUTRAL_INTERNAL_IMPORTS = EMPTY

The allowlist may grow only in a future slice after independent audit of the primitive and its transitive dependencies.

Forbidden:

- Investing -> neutral bridge -> Trading
- Trading -> neutral bridge -> Investing

Intermediation does not turn coupling into neutrality.

Architecture isolation applies transitively across the dependency graph, not only to direct imports.

Dynamically constructed module paths that cannot be statically audited are prohibited inside Investing Genesis and inside approved neutral primitives.

Inside Investing-owned files and approved neutral primitives, these are prohibited when the target is not a static literal:

- `import(variable)`
- `require(variable)`
- `module.require(variable)`

Equivalent computed module references intended to bypass the graph are also prohibited.

Static literal module references are allowed and must be resolved by the architecture guard.

Canonical Investing implementation MUST NOT use filesystem symbolic links or Git submodules as executable/source indirection.

A symlink or submodule encountered inside an Investing-owned source namespace must FAIL CLOSED unless a future explicit Constitution and architecture-guard change independently approves that mechanism.

The Git index gitlink entry, not `.gitmodules` alone, is the authority for detecting a versioned submodule path.

This rule applies to the Investing Genesis namespaces and any future approved-neutral source traversed as part of the authority boundary. It is not a repository-wide ban on symlinks.

The module/reference graph is an enforcement layer for TypeScript/JavaScript source dependencies.

Cross-domain coupling is also forbidden through:

- database
- HTTP/internal API
- queue
- subprocess
- filesystem
- shared persistence

Those mechanisms require phase-specific guards when they are introduced.

A new executable language inside Investing Genesis requires a prior explicit and accepted Constitution and architecture-guard change.

Do not assume the import graph alone proves total isolation.

## Identity And Authorization

The current authenticated identity provider is Clerk.

ACTOR_KIND =
USER_PRINCIPAL
SYSTEM_ACTOR

Genesis defines three distinct entities:

- Principal: authenticated identity
- Tenant: internal ownership boundary
- InvestingAccount: financial boundary inside the tenant

An initial user may have a personal tenant, but architecture must never assume `user == tenant == account`.

Absolute rules:

- authentication != authorization
- service_role != authorization
- client-provided `userId`, `tenantId`, and `accountId` never prove ownership
- service_role != system authorization

AuthorizedInvestingContext is server-internal authority. It MUST NOT be accepted, reconstructed, or deserialized from client input.

It MUST only be created through one of two verified server-side authority paths:

USER_PRINCIPAL:

```text
authenticated principal
         |
membership
         |
canonical operation scope
         |
account access when ACCOUNT_SCOPE
         |
required entitlement/capability checks
         |
AuthorizedInvestingContext
```

SYSTEM_ACTOR:

```text
trusted server-side system identity
         |
explicit job/work identity
         |
canonical server-side operation scope
         |
narrowly scoped capability policy
         |
canonical tenant/account resolution when ACCOUNT_SCOPE
         |
AuthorizedInvestingContext
```

A SYSTEM_ACTOR does not require or fabricate a USER_PRINCIPAL.

System context must never be created from client IDs.

Financial account writes by a system actor still require canonical tenant/account scope.

No privileged financial repository may be called directly with only `userId`, `accountId`, or a `service_role` client. It must require an authorized context emitted by the server boundary.

Cross-tenant and cross-account ambiguity must FAIL CLOSED.

## Schema Boundary

New Investing MUST use its own dedicated namespace/schema. The conceptual target is `investing.*`.

Do not reuse these public tables as Genesis financial authority:

- `public.plans`
- `public.portfolios`
- `public.portfolio_items`
- `public.portfolio_meta`
- `public.user_settings`
- `public.daily_snapshots`

Table existence does not imply Genesis authority.

The new schema must be server-controlled and must not be exposed directly as a browser financial API. `anon` and browser clients must not have direct financial access. Concrete grants and RLS belong to I1+ after live Data API configuration is verified.

## Financial Truth

Every financial truth value must preserve these labels:

- REAL
- STALE
- ESTIMATED
- SIMULATED
- DEMO
- UNAVAILABLE

These labels are not a single mutually exclusive dimension.

Required dimensions:

```text
VALUE_ORIGIN:
REAL | ESTIMATED | SIMULATED | UNAVAILABLE

FRESHNESS:
FRESH | STALE | UNKNOWN | NOT_APPLICABLE

CONTEXT:
PRODUCTION | DEMO
```

All applicable dimensions must remain auditable.

Valid combinations include:

- REAL + FRESH + PRODUCTION
- REAL + STALE + PRODUCTION
- REAL + FRESH + DEMO
- ESTIMATED + STALE + PRODUCTION
- SIMULATED + NOT_APPLICABLE + DEMO

Rules:

- missing != 0
- unavailable != 0
- STALE != FRESH
- ESTIMATED != REAL value origin
- SIMULATED != REAL value origin
- DEMO != PRODUCTION context

STALE must never be presented as current/fresh REAL.

DEMO must never be confused with production account truth.

REAL describes value origin/nature. DEMO describes context. REAL + DEMO must not be confused with production account truth.

UNAVAILABLE contains no invented value.

Never generate `EUR 0`, `0%`, zero return, target, probability, balance, position, or cost from missing data.

UNAVAILABLE is a valid product and API state.

Observed or derived financial truth must be able to carry:

- `value_origin`
- `freshness`
- `context`
- `source`
- `source_reference`
- `observed_at`
- `retrieved_at`
- `as_of`
- `lineage_id`
- `methodology_version`

An eventual object/envelope called `truth_status` is acceptable only if it preserves `value_origin`, `freshness`, and `context` without loss. It must not be a singular enum that selects only one of the six preserved labels.

Fields can be null only when semantically correct. Missing critical evidence prevents classification as REAL.

## Money And Decimal Authority

JavaScript floating-point numbers are forbidden as financial authority.

Future contract:

```text
Money / Price / Quantity / Rate
    -> decimal string at the application boundary
    -> PostgreSQL NUMERIC in persistence
```

Do not use `number` for canonical monetary values.

Rounding must be explicit, per operation, per currency or instrument, and never implicit.

Currency must be explicit. Do not sum values across currencies without identified FX conversion.

## Time And Lineage

Differentiate:

- `effective_at`
- `observed_at`
- `recorded_at`
- `as_of`
- `retrieved_at`

Never replace economic or event time with `now()`.

History remains history. Corrections must preserve lineage.

## Ledger Law

I2 implements an append-only double-entry ledger for cash.

Constitution:

- balances are derived
- position is not money
- cash is not portfolio valuation
- historical financial mutations are not silently overwritten
- corrections use reversal or corrective entries
- every transaction has identity and lineage
- financial integrity must be verifiable and reconcilable

Do not create a mutable balance as the only source of truth.

The operational audit log is not the financial ledger. The financial ledger is not the operational log.

## Plan Law

A plan is USER_INTENT.

A plan is not:

- MARKET_TRUTH
- PORTFOLIO_TRUTH
- RECOMMENDATION
- EXECUTION

Plans must have immutable revisions. Changing a plan creates a new revision. The active pointer must not erase history.

Do not use mutable JSON in `user_settings` as canonical plan storage.

## Research And Recommendation Law

Future research and recommendation outputs must be reproducible. They must be able to reference:

- dataset snapshot
- source versions
- code/engine version
- methodology version
- parameters
- assumptions
- run id
- timestamps
- outputs
- hashes

Scientific output without reproducibility is NOT_CANONICAL.

Research output must not automatically mutate portfolio or execution truth.

A future recommendation cannot be final truth without:

- current account scope
- plan/intention revision
- suitability evidence
- risk constraints
- market-data provenance
- methodology version
- costs
- assumptions
- evidence lineage

Missing material input means UNAVAILABLE or BLOCKED, never an invented recommendation.

## Idempotency And Audit

Operation scope must be explicit:

- ACCOUNT_SCOPE
- TENANT_SCOPE
- DOMAIN_SCOPE

Account financial mutation:

- `tenant_id` REQUIRED
- `account_id` REQUIRED

Tenant operation:

- `tenant_id` REQUIRED
- `account_id` absent unless genuinely account-scoped

Domain/global operation, such as a global Research Lab dataset, methodology, or market-data operation:

- explicit domain scope REQUIRED
- tenant/account MUST NOT be fabricated

Audit and idempotency must record:

- `actor_kind`
- `actor_id`
- `operation_scope`
- `correlation_id`

`principal_id`, `tenant_id`, and `account_id` are scope-dependent. Absence is allowed only when semantically correct.

Never transform absence into a false identity.

Every material mutable operation must have:

- `idempotency_key`
- request/content hash
- operation scope
- actor kind
- actor id
- scope-dependent principal, tenant, and account identifiers when semantically required
- timestamp

Exact retry means SAME RESULT and NO DUPLICATE EFFECT.

Same key plus different material payload means CONFLICT and FAIL CLOSED.

Financial and security mutations must produce an append-only audit trail containing at least:

- `correlation_id`
- `actor_kind`
- `actor_id`
- `operation_scope`
- `action`
- `object_type`
- `object_id`
- `outcome`
- `reason`
- `recorded_at`

Audit must additionally include `principal_id`, `tenant_id`, and `account_id` only when semantically required by scope:

- ACCOUNT_SCOPE financial mutation -> `tenant_id` REQUIRED and `account_id` REQUIRED
- TENANT_SCOPE -> `tenant_id` REQUIRED and `account_id` absent unless genuinely account-scoped
- DOMAIN_SCOPE -> tenant/account MUST NOT be fabricated
- USER_PRINCIPAL -> `principal_id` REQUIRED
- SYSTEM_ACTOR -> no fabricated `principal_id`

Never write secrets or tokens to audit.

## End-To-End User Traceability

END_TO_END_USER_TRACEABILITY = REQUIRED

Investing must preserve enough information to reconstruct, from inception to current state, all material account events.

There must be three logically distinct histories:

- FINANCIAL HISTORY
- DECISION HISTORY
- PLAN / USER-INTENT HISTORY

Financial history must support lineage for:

- cash
- ledger transactions
- fees
- orders
- fills
- lots
- positions
- dividends
- corporate actions
- reversals/corrections
- reconciliation
- valuation snapshots

Decision history must support reconstruction of:

- data/evidence used
- research run
- simulation run
- methodology version
- assumptions
- suitability/risk constraints
- decision produced
- reason
- later invalidation/supersession

Plan / user-intent history must preserve:

- plan revisions
- goals
- horizon
- contributions
- risk constraints
- liquidity requirements
- user acceptance/rejection/actions

For any material transition it must be possible to answer, when applicable:

- WHAT happened?
- WHEN?
- WHO/WHAT process caused it?
- WHICH tenant/account?
- WHY?
- WHICH prior object/event caused it?
- WHICH later objects/events resulted?
- WHICH truth status applied?
- WHICH lineage/evidence supports it?

A single table is not required to contain everything.

Financial Ledger != Operational Audit != Decision Lineage != User-Facing History

User-facing history is an explainable projection of canonical sources, not a second financial authority.

No material change may depend only on mutable state without enough lineage to reconstruct the transition.

## API Law

Future `/api/investing/**` routes must not accept client `userId` as authority. `tenantId` and `accountId` can be selectors, never proof.

APIs must return explicit states. Never use `catch => return 0` or `catch => return []` when that falsifies financial truth.

Differentiate:

- UNAUTHENTICATED
- FORBIDDEN_OR_NOT_FOUND
- ENTITLEMENT_REQUIRED
- DATA_UNAVAILABLE
- DATA_STALE
- CONFLICT
- VALIDATION_ERROR
- INTERNAL_ERROR

Financial failures must not be masked as empty success.

## Execution And Product Claims

Genesis starts as PAPER / SIMULATION ONLY.

Live Investing execution must be impossible by construction in early phases:

- no live broker credential
- no live order route
- no fallback to live

Live capability requires a future separate explicit gate.

The system may measure results and risks. It must not promise return, invent probability of profit, hide costs, confuse backtest with real results, confuse paper with live, or present estimate/simulation as realized performance.

## Slice Roadmap

- I0 Constitution / Architecture
- I1 Identity / Tenant / InvestingAccount authority
- I2 Immutable double-entry ledger / cash
- I3 Positions / lots / fills accounting / corporate actions
- I4 Plan / immutable user-intent revisions
- I5 Investing Research Lab / lineage / reproducibility
- I6 Quant & Decision Science
  - portfolio analytics
  - Monte Carlo
  - scenario analysis
  - stress testing
  - allocation methodology
  - suitability
  - decision methodology
- I7 Paper execution
- I8 Daily operating cycle
- I9 Product API
- I10 System integration / end-to-end traceability
- I11 Prolonged validation
  - replay
  - reconciliation
  - concurrency
  - fault injection
  - adversarial/security validation
  - quantitative validation
- I12 Core Investing Readiness Gate

After I12 is accepted:

- DASHBOARD / UX DISCOVERY
- DASHBOARD / UX IMPLEMENTATION
- UX VALIDATION
- BETA READINESS GATE

Product dashboard scope is intentionally deferred until the Investing core, quantitative engines, APIs, integration, and prolonged validation are accepted.

During I0-I12, internal diagnostic/test tools may exist only when a future accepted slice actually needs them:

- NOT_PRODUCT_UI
- NOT_FINANCIAL_AUTHORITY

No product dashboard may drive backend architecture.

Each slice begins only after independent acceptance of the previous slice.
