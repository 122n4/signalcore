# UX-T1 — Product contract gap roadmap

No contract below is implemented by UX-T1.

## UX-C1 — Canonical plan precedence and rule provenance

- Problem: `plans`, `user_settings`, generated mandate policy and snapshots can disagree; UX cannot say who selected a rule.
- Current sources: `plans`, `user_settings`, `investing_mandate_snapshots`, Phase 3D policy evaluation.
- Invariants: one effective plan version per user/mode/time; immutable rule origin; evaluation binds exact snapshot.
- Logical schema: `plan_definition(id,user_id,mode,version,status,effective_at)`; `plan_rule(id,plan_id,key,value,origin[user|syntrake_default|derived],source_ref)`; immutable `mandate_snapshot` references both.
- States: draft, active, superseded, archived; rule provenance never null.
- Authorization: owner read/write drafts; activation owner-confirmed; OPS read only when authorized.
- Idempotency/audit: activation idempotency key; append-only version and before/after diff.
- Migration/runtime: backfill precedence with `origin=legacy_unknown`; new resolver and snapshot builder.
- UX unlocked: truthful “selected by you”, “derived from selected risk profile”, rule editing.
- Dependencies: none; foundation for C2, C3 and C6.
- Risks: silently assigning provenance; retroactive rule mutation.
- Acceptance: every evaluated constraint resolves to immutable plan/rule/version/origin.

## UX-C2 — Global priority semantics

- Problem: blockers, failed constraints and proposals lack one cross-domain priority contract.
- Sources: final engine state, reason severity/consequence, constraints, data quality.
- Invariants: insufficient evidence cannot become “all clear”; deterministic ordering; one primary item; scope/time explicit.
- Schema: `priority_projection(subject_type,subject_id,run_id,kind,severity,rank,reason_refs,computed_at,expires_at)`; projection may be recomputable rather than authoritative persistence.
- States: none, information, review, blocked, insufficient_data, stale.
- Authorization: same owner/account as source run.
- Idempotency/audit: hash of inputs and policy version; retain projection hash in activity event.
- Runtime: deterministic projector/read model.
- UX unlocked: Home’s single priority and safe attention state.
- Dependencies: C1; later C3.
- Risks: hiding secondary blockers; wording “nothing requires attention”.
- Acceptance: identical inputs/policy produce identical rank and explanation.

## UX-C3 — Stable situation identity and lifecycle

- Problem: run IDs and leak-family disappearance are not stable issue identity or resolution.
- Sources: constraints, reason codes, account, symbols and mandate rules.
- Invariants: stable semantic key; new evaluations append observations; absence does not resolve; explicit terminal cause.
- Schema: `investing_situations(id,user_id,account_id,semantic_key,type,status,opened_at,last_observed_at,resolved_at,resolution_event_id)` and `situation_observations(situation_id,run_id,evidence_hash,state,observed_at)`.
- States: open, monitoring, superseded, resolved, invalidated; transitions explicit.
- Authorization: owner-scoped RLS; service writes from verified runs.
- Idempotency/audit: unique semantic key + observation run; append-only events.
- Migration/runtime: situation matcher/projector; no legacy “resolved” backfill without evidence.
- UX unlocked: durable situation pages and truthful lifecycle.
- Dependencies: C1, C2.
- Risks: identity collisions and false resolution.
- Acceptance: same issue across runs keeps ID; resolution requires recorded event/reason.

## UX-C4 — Human decision, defer and follow-up

- Problem: engine decisions exist; human decisions, reasons and durable defer/follow-up do not.
- Sources: engine result, manual-execution journal state, approvals.
- Invariants: human actor explicit; engine proposal immutable; no financial execution implied; due dates timezone-safe.
- Schema: `situation_decisions(id,situation_id,user_id,decision[acknowledge|defer|dismiss|prepare],reason,created_at,idempotency_key)` and `follow_ups(id,decision_id,due_at,status,completed_at)`.
- States: recorded, deferred, follow_up_due, completed, cancelled.
- Authorization: owner only; service cannot impersonate human choice.
- Idempotency/audit: client request ID unique per situation/action; append-only decision events.
- Migration/runtime: new tables, scheduler only for due-state projection; delivery belongs to C8.
- UX unlocked: Defer, decision record, follow-up.
- Dependencies: C3.
- Risks: treating prepare as execute; reminder spam.
- Acceptance: every user-facing decision has actor, timestamp, target situation and immutable evidence.

## UX-C5 — Investor Activity taxonomy and read model

- Problem: events are fragmented across cycles, engine runs, ledger, orders, reconciliation and journal.
- Sources: all existing owner-scoped event/ledger tables.
- Invariants: no OPS leakage; stable event type/version; source identity; occurred vs recorded time; Paper qualifier.
- Schema: versioned `InvestorActivityItem {id,type,subject,sourceRef,occurredAt,recordedAt,environment,summary,evidenceRefs,integrity}`.
- States: recorded, corrected, superseded; never silently deleted.
- Authorization: owner/account RLS; sanitizer allowlist.
- Idempotency/audit: deterministic source-event ID; correction chain.
- Migration/runtime: read-model projector and cursor pagination; source tables remain canonical.
- UX unlocked: unified Activity and export.
- Dependencies: C1, C3, C4; compatible with C8.
- Risks: double-counting and leaking internal payloads.
- Acceptance: every item maps to one canonical source and passes user-safe field allowlist.

## UX-C6 — Investor-safe Research evidence and rule relationship

- Problem: Research artifacts are OPS-only and not linked canonically to personal rules.
- Sources: Research reports, gates, packages, mandate/rule snapshots.
- Invariants: promotion is not recommendation; limitations mandatory; immutable evidence version; relationship explicitly approved.
- Schema: `research_evidence_publication(id,report_id,scope,status,summary,limitations,dataset_as_of,published_at)` and `rule_evidence_links(rule_definition_id,rule_version,evidence_publication_id,relationship[context|supports_method|contradicts],approved_at)`.
- States: draft, published, withdrawn, superseded; link active/superseded.
- Authorization: Investor reads published allowlisted records; OPS controls publication; owner rule link scoped safely.
- Idempotency/audit: report/version unique; publication and withdrawal events signed/audited.
- Migration/runtime: sanitizer/publisher plus Investor read model; never expose filesystem/runtime controls.
- UX unlocked: Open Research and qualified evidence wording.
- Dependencies: C1.
- Risks: converting population evidence into personal recommendation.
- Acceptance: each claim includes evidence ID, scope, limitations, validation time and relation type.

## UX-C7 — Performance definitions

- Problem: no canonical Investing TWR/MWR, contribution/withdrawal classification or benchmark policy.
- Sources: cash movements, ledger, valuations/daily snapshots, benchmark definitions.
- Invariants: external flows separated from return; method/version/currency/timezone explicit; missing valuations block result.
- Schema: immutable valuation points and classified external flows; `performance_result(account_id,period,method,method_version,return,contributions,withdrawals,coverage,as_of)`.
- States: complete, partial, stale, unavailable, restated.
- Authorization: owner-scoped; calculation service only.
- Idempotency/audit: input-set hash; restatement preserves superseded result.
- Migration/runtime: ledger classification/backfill, valuation scheduler, performance calculator.
- UX unlocked: performance and contributions versus return.
- Dependencies: canonical Paper ledger; future real environment separately.
- Risks: misleading fallback cost basis and double-counted flows.
- Acceptance: reconciliation fixtures match known TWR/MWR cases and incomplete data never emits a return.

## UX-C8 — Notification semantics

- Problem: transient alerts/reminders exist without complete preferences, delivery or receipts.
- Sources: manual reminder state, engine/activity events, user settings.
- Invariants: explicit trigger, channel consent, dedupe, quiet hours, delivery truth, owner scope.
- Schema: `notification_preferences`, `notification_intents`, `notification_deliveries`, with trigger/source/activity refs and statuses.
- States: planned, suppressed, queued, sent, delivered, failed, read, cancelled.
- Authorization: owner manages preferences; delivery worker service-only; no cross-tenant payload.
- Idempotency/audit: unique trigger+recipient+channel+policy window; delivery attempts append-only.
- Migration/runtime: tables, policy evaluator, channel adapters and receipt ingestion.
- UX unlocked: notification settings and truthful delivery/activity records.
- Dependencies: C2/C3 triggers, C4 follow-ups, C5 activity.
- Risks: duplicate financial nudges, false “delivered”, sensitive content exposure.
- Acceptance: every visible notification has consent, trigger, dedupe key, delivery state and audit trail.

## Recommended dependency order

`C1 → C2 → C3 → C4 → C5`, with `C6` after C1, `C7` independently on canonical accounting, and `C8` after C2/C3/C4/C5.
