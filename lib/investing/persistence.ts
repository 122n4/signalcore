import { createHash } from "node:crypto";

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value ?? null;
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(normalizeJson(value));
}

export function createInvestingFingerprint(value: unknown) {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDate(value: string | Date | null | undefined) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function extractReasonCodes(engine: Record<string, any>) {
  const notes = [
    ...normalizeArray(engine?.notes),
    ...normalizeArray(engine?.construction?.notes),
    ...normalizeArray(engine?.rebalance?.notes),
    ...normalizeArray(engine?.executionPolicy?.notes),
    ...normalizeArray(engine?.governancePolicy?.notes),
    ...normalizeArray(engine?.benchmark?.notes),
  ]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  return Array.from(new Set(notes));
}

export function resolveInvestingEngine(snapshot: Record<string, any> | null | undefined) {
  const dailyEngine = snapshot?.daily?.investingEngine;
  if (dailyEngine && typeof dailyEngine === "object") return dailyEngine as Record<string, any>;

  const derivedEngine = snapshot?.derived?.investingEngine;
  if (derivedEngine && typeof derivedEngine === "object") return derivedEngine as Record<string, any>;

  return null;
}

export function buildInvestingMandateSnapshotRow(args: {
  userId: string;
  mode: string;
  dayKey: string;
  asOf: string | Date;
  engine: Record<string, any>;
}) {
  const mandate = args.engine?.construction?.mandate ?? {};
  const benchmark = args.engine?.benchmark ?? {};
  const inputs = {
    objective: args.engine?.objective ?? mandate?.objective ?? null,
    riskProfile: mandate?.riskProfile ?? null,
    horizon: mandate?.horizon ?? null,
    baseCurrency: mandate?.baseCurrency ?? null,
    benchmarkId: benchmark?.benchmarkId ?? null,
    benchmarkName: benchmark?.benchmarkName ?? null,
  };
  const policy = {
    mandate,
    benchmark,
  };
  const meta = {
    notes: normalizeArray(args.engine?.notes),
    source: "daily_snapshot_v4",
  };
  const mandateFingerprint = createInvestingFingerprint({ inputs, policy });

  return {
    user_id: args.userId,
    mode: args.mode,
    day_key: args.dayKey,
    as_of: normalizeDate(args.asOf),
    mandate_fingerprint: mandateFingerprint,
    algorithm_version: "investing_v1",
    objective: inputs.objective,
    risk_profile: inputs.riskProfile,
    horizon: inputs.horizon,
    base_currency: inputs.baseCurrency,
    policy,
    inputs,
    meta,
  };
}

export function buildInvestingRebalanceLedgerRow(args: {
  userId: string;
  mode: string;
  dayKey: string;
  asOf: string | Date;
  engine: Record<string, any>;
  mandateFingerprint: string;
  totalEur: number;
  cashEur: number;
  holdingsCount: number;
}) {
  const construction = args.engine?.construction ?? {};
  const rebalance = args.engine?.rebalance ?? {};
  const executionPolicy = args.engine?.executionPolicy ?? {};
  const governancePolicy = args.engine?.governancePolicy ?? {};
  const benchmark = args.engine?.benchmark ?? {};
  const targetPortfolio = normalizeArray(construction?.targetAllocations);
  const rebalanceActions = normalizeArray(rebalance?.actions);
  const reasonCodes = extractReasonCodes(args.engine);
  const decisionFingerprint = createInvestingFingerprint({
    objective: args.engine?.objective ?? null,
    targetPortfolio,
      rebalanceActions,
      executionPolicy,
      governancePolicy,
      benchmark,
  });

  const hasTrades = rebalanceActions.some((action: any) => action?.action === "buy" || action?.action === "sell");
  const status = rebalance?.withinPolicy === false ? "blocked" : hasTrades ? "proposed" : "no_action";

  return {
    user_id: args.userId,
    mode: args.mode,
    day_key: args.dayKey,
    as_of: normalizeDate(args.asOf),
    decision_fingerprint: decisionFingerprint,
    mandate_fingerprint: args.mandateFingerprint,
    algorithm_version: "investing_v1",
    objective: args.engine?.objective ?? null,
    status,
    target_portfolio: targetPortfolio,
    rebalance_actions: rebalanceActions,
    benchmark,
    execution_policy: executionPolicy,
    governance_policy: governancePolicy,
    valuation_context: {
      total_eur: safeNumber(args.totalEur),
      cash_eur: safeNumber(args.cashEur),
      holdings_count: safeNumber(args.holdingsCount),
      gross_turnover_pct: safeNumber(rebalance?.grossTurnoverPct),
    },
    reason_codes: reasonCodes,
    meta: {
      withinPolicy: rebalance?.withinPolicy ?? null,
      source: "daily_snapshot_v4",
    },
  };
}

export function buildInvestingResearchSnapshotRow(args: {
  userId: string;
  mode: string;
  dayKey: string;
  asOf: string | Date;
  engine: Record<string, any>;
  mandateFingerprint: string;
}) {
  const benchmarkValidation = args.engine?.benchmarkValidation ?? {};
  const instrumentScorecards = normalizeArray(args.engine?.instrumentScorecards);
  const summary = {
    benchmarkId: benchmarkValidation?.benchmarkId ?? null,
    benchmarkName: benchmarkValidation?.benchmarkName ?? null,
    validationStatus: benchmarkValidation?.status ?? "review",
    overlapWeightPct: safeNumber(benchmarkValidation?.overlapWeightPct),
    activeSharePct: safeNumber(benchmarkValidation?.activeSharePct),
    concentrationDriftPct: safeNumber(benchmarkValidation?.concentrationDriftPct),
    turnoverPct: safeNumber(benchmarkValidation?.turnoverPct),
    scorecardCount: instrumentScorecards.length,
    highFitCount: instrumentScorecards.filter((entry: any) => entry?.mandateFit === "high").length,
    warningCount: instrumentScorecards.reduce(
      (sum: number, entry: any) => sum + normalizeArray(entry?.warnings).length,
      0,
    ),
  };
  const researchPayload = {
    benchmarkValidation,
    instrumentScorecards,
  };
  const researchFingerprint = createInvestingFingerprint({
    mandateFingerprint: args.mandateFingerprint,
    benchmarkValidation,
    instrumentScorecards,
  });

  return {
    user_id: args.userId,
    mode: args.mode,
    day_key: args.dayKey,
    as_of: normalizeDate(args.asOf),
    research_fingerprint: researchFingerprint,
    mandate_fingerprint: args.mandateFingerprint,
    algorithm_version: "investing_v1",
    benchmark_id: summary.benchmarkId,
    status: summary.validationStatus,
    summary,
    research_payload: researchPayload,
    meta: {
      source: "daily_snapshot_v4",
      notes: normalizeArray(benchmarkValidation?.notes),
    },
  };
}

export function buildInvestingExecutionPlanRow(args: {
  userId: string;
  mode: string;
  dayKey: string;
  asOf: string | Date;
  engine: Record<string, any>;
  mandateFingerprint: string;
  decisionFingerprint: string;
  executionPlan: Record<string, any>;
}) {
  return {
    user_id: args.userId,
    mode: args.mode,
    day_key: args.dayKey,
    as_of: normalizeDate(args.asOf),
    decision_fingerprint: args.decisionFingerprint,
    mandate_fingerprint: args.mandateFingerprint,
    algorithm_version: "investing_v1",
    execution_decision: String(args.executionPlan?.decision ?? "hold"),
    approval_status: String(args.executionPlan?.approvalStatus ?? "not_required"),
    approval_required: Boolean(args.executionPlan?.approvalRequired),
    kill_switch_active: Boolean(args.executionPlan?.killSwitchActive),
    override_allowed: Boolean(args.executionPlan?.overrideAllowed),
    max_deployable_pct: safeNumber(args.executionPlan?.maxDeployablePct),
    deployable_capital_eur: safeNumber(args.executionPlan?.deployableCapitalEur),
    expires_at: args.executionPlan?.expiresAt ? normalizeDate(args.executionPlan.expiresAt) : null,
    checklist: normalizeArray(args.executionPlan?.checklist),
    blocking_reasons: normalizeArray(args.executionPlan?.blockingReasons),
    notes: normalizeArray(args.executionPlan?.notes),
    meta: {
      objective: args.engine?.objective ?? null,
      benchmark_id: args.engine?.benchmark?.benchmarkId ?? null,
      source: "daily_snapshot_v4",
    },
  };
}
