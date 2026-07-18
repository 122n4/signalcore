import type { InvestingExecutionPlan } from "@/lib/investing/types";

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildInvestingExecutionPlan(args: {
  engine: Record<string, any>;
  totalEur: number;
  cashEur: number;
  asOf: string | Date;
}): InvestingExecutionPlan {
  const asOfDate = args.asOf instanceof Date ? args.asOf : new Date(args.asOf);
  const asOfIso = Number.isFinite(asOfDate.getTime()) ? asOfDate.toISOString() : new Date().toISOString();
  const governance = args.engine?.governancePolicy ?? {};
  const benchmarkValidation = args.engine?.benchmarkValidation ?? {};
  const executionPolicy = args.engine?.executionPolicy ?? {};
  const rebalance = args.engine?.rebalance ?? {};
  const actions = Array.isArray(rebalance?.actions) ? rebalance.actions : [];
  const hasTrades = actions.some((action: any) => action?.action === "buy" || action?.action === "sell");
  const blockingReasons = normalizeArray(governance?.manualReviewReasons);
  const killSwitchActive = Boolean(governance?.killSwitchActive);
  const approvalRequired = Boolean(governance?.approvalRequired);
  const overrideAllowed = Boolean(governance?.overrideAllowed);
  const maxDeployablePct = Math.max(0, safeNumber(governance?.maxDeployablePct, 0));
  const deployableCapitalEur = round2(Math.max(0, safeNumber(args.totalEur) * maxDeployablePct * 0.01));
  const checklist = Array.from(
    new Set(
      [
        hasTrades ? "broker_reconciliation" : null,
        hasTrades ? "position_limit_review" : null,
        benchmarkValidation?.status && benchmarkValidation.status !== "aligned" ? "benchmark_validation_review" : null,
        executionPolicy?.turnoverBucket === "high" ? "turnover_exception_review" : null,
        approvalRequired ? "owner_approval" : null,
      ].filter(Boolean) as string[],
    ),
  );

  if (!hasTrades) {
    return {
      decision: "hold",
      approvalStatus: "not_required",
      approvalRequired: false,
      killSwitchActive,
      overrideAllowed,
      maxDeployablePct,
      deployableCapitalEur,
      expiresAt: null,
      checklist,
      blockingReasons: [],
      notes: ["No rebalance actions require execution."],
    };
  }

  if (killSwitchActive || governance?.executionClearance === "blocked") {
    return {
      decision: "blocked",
      approvalStatus: "rejected",
      approvalRequired: true,
      killSwitchActive,
      overrideAllowed,
      maxDeployablePct,
      deployableCapitalEur,
      expiresAt: null,
      checklist,
      blockingReasons,
      notes: ["Execution blocked by governance policy."],
    };
  }

  if (approvalRequired || governance?.executionClearance === "review") {
    return {
      decision: "manual_execute",
      approvalStatus: "pending",
      approvalRequired: true,
      killSwitchActive,
      overrideAllowed,
      maxDeployablePct,
      deployableCapitalEur,
      expiresAt: new Date(Date.parse(asOfIso) + 24 * 60 * 60 * 1000).toISOString(),
      checklist,
      blockingReasons,
      notes: ["Execution requires supervised approval before any deployment."],
    };
  }

  return {
    decision: "paper_execute",
    approvalStatus: "not_required",
    approvalRequired: false,
    killSwitchActive,
    overrideAllowed,
    maxDeployablePct,
    deployableCapitalEur,
    expiresAt: new Date(Date.parse(asOfIso) + 24 * 60 * 60 * 1000).toISOString(),
    checklist,
    blockingReasons: [],
    notes: ["Execution is cleared for controlled deployment."],
  };
}
