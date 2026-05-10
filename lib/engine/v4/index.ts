import { computeLoopStage } from "./loopStage";
import { selectPriorityClass } from "./priority";
import { applySafetyGovernors } from "./governors";
import { stableHash } from "./hash";
import { capTrace, pushTrace } from "./trace";
import type {
  ActionKind,
  AggressionLevel,
  DailyBundleV4,
  DecisionTraceItem,
  EngineContext,
  Guardrail,
  RiskLeak,
  StructuredDecisionTrace,
} from "./types";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildWhatToDo(action: ActionKind, mode: EngineContext["mode"]) {
  switch (action) {
    case "PAUSE":
      return [
        "Open Planning and confirm an active plan.",
        "Verify setup/risk profile inputs.",
        "Return to Daily after the plan is active.",
      ];
    case "EXECUTE_STARTER_PACK":
      return [
        "Open Portfolio and review the starter allocation from your setup.",
        "Execute the listed starter holdings in the broker.",
        "Save execution proof before closing the day.",
      ];
    case "MANUAL_BROKER_CHECKLIST":
      return [
        "Open the manual broker checklist.",
        "Execute each listed order in sequence in your broker.",
        "Save proof (reference + fees/slippage) and close the day.",
      ];
    case "REDUCE_CONCENTRATION":
      return [
        "Open the top risk leak details.",
        "Reduce oversized exposure before adding new risk.",
        "Capture proof of the rebalance.",
      ];
    case "DEPLOY_CASH":
      return [
        "Deploy available cash within plan/risk limits.",
        "Use the Daily execution flow to place the orders.",
        "Save proof before closing the day.",
      ];
    case "HOLD":
      return ["Do not place new orders today.", "Review proof/journal only.", "Return at next cycle."];
    case "WAIT":
      return ["Wait for data quality to recover.", "Avoid forced trades under uncertainty.", "Refresh Daily later."];
    default:
      return [
        `Follow the ${mode} checklist for the selected action.`,
        "Keep position sizing within plan limits.",
        "Capture proof before close-day.",
      ];
  }
}

function buildActionCta(action: ActionKind, mode: EngineContext["mode"]) {
  const dailyHref = `/app?tab=daily&mode=${mode}`;
  switch (action) {
    case "PAUSE":
      return { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` };
    case "EXECUTE_STARTER_PACK":
      return { label: "Open Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${mode}` };
    case "MANUAL_BROKER_CHECKLIST":
      return { label: "Generate manual checklist now", action: "open_manual_checklist", href: `${dailyHref}&manual=1` };
    case "REDUCE_CONCENTRATION":
      return { label: "Fix top leak", action: "fix_top_leak", href: `${dailyHref}&fixNow=1` };
    case "DEPLOY_CASH":
      return { label: "Open Daily execution", action: "open_daily_execution", href: dailyHref };
    case "WAIT":
      return { label: "Refresh Daily", action: "refresh_daily", href: dailyHref };
    case "HOLD":
      return { label: "View Daily", action: "view_daily", href: dailyHref };
    default:
      return { label: "Open Daily", action: "open_daily", href: dailyHref };
  }
}

function buildActionTitle(action: ActionKind) {
  switch (action) {
    case "PAUSE":
      return "Pause execution until setup is valid";
    case "EXECUTE_STARTER_PACK":
      return "Execute your starter pack";
    case "MANUAL_BROKER_CHECKLIST":
      return "Run the manual broker checklist";
    case "REDUCE_CONCENTRATION":
      return "Reduce concentration before adding risk";
    case "DEPLOY_CASH":
      return "Deploy cash within your active plan";
    case "HOLD":
      return "Hold — day already closed";
    case "WAIT":
      return "Wait — data quality is not sufficient";
    default:
      return "Follow the next best action";
  }
}

function buildActionDesc(action: ActionKind, ctx: EngineContext, reason: string) {
  if (action === "REDUCE_CONCENTRATION" && ctx.signals.topRiskLeakTitle) {
    return `${reason}. Top leak: ${ctx.signals.topRiskLeakTitle}.`;
  }
  if (action === "DEPLOY_CASH") {
    return `${reason}. Pricing coverage ${ctx.market.dataQuality.coveragePct}%.`;
  }
  return reason;
}

function traceAction(kind: ActionKind, reason: string): StructuredDecisionTrace["rankedTop"][number]["action"] {
  return {
    kind,
    title: buildActionTitle(kind),
    reason: [reason].filter(Boolean),
  };
}

function buildDecisionBlockers(args: {
  governors: ReturnType<typeof applySafetyGovernors>;
  guardrails: Guardrail[];
}) {
  const governorBlockers = (args.governors.trace || [])
    .filter((item) => item.outcome === "override")
    .map((item) => [item.step, item.detail].filter(Boolean).join(": "));
  const guardrailBlockers = args.guardrails
    .filter((item) => item.severity === "high")
    .map((item) => `${item.code}: ${item.message}`);

  return Array.from(new Set([...governorBlockers, ...guardrailBlockers])).slice(0, 8);
}

function scoreTraceCandidate(args: {
  kind: ActionKind;
  chosen: ActionKind;
  ctx: EngineContext;
  loopStage: DailyBundleV4["loopStage"];
  priorityClass: DailyBundleV4["decision"]["priorityClass"];
  aggression: AggressionLevel;
}) {
  const base: Record<ActionKind, number> = {
    EXECUTE_STARTER_PACK: 82,
    MANUAL_BROKER_CHECKLIST: 86,
    DEPLOY_CASH: 72,
    REBALANCE: 70,
    REDUCE_CONCENTRATION: 88,
    HEDGE_RISK: 74,
    ENTER_POSITION: 66,
    EXIT_POSITION: 78,
    ADJUST_STOPS: 68,
    WAIT: 60,
    HOLD: 58,
    PAUSE: 45,
  };
  let score = base[args.kind] ?? 50;

  if (args.kind === args.chosen) score += 35;
  if (args.priorityClass === "SURVIVAL" && ["PAUSE", "WAIT", "HOLD", "REDUCE_CONCENTRATION", "EXIT_POSITION"].includes(args.kind)) score += 12;
  if (args.priorityClass === "GROWTH" && ["DEPLOY_CASH", "ENTER_POSITION", "EXECUTE_STARTER_PACK"].includes(args.kind)) score += 8;
  if (args.loopStage === "DAY0_EXECUTE" && ["EXECUTE_STARTER_PACK", "MANUAL_BROKER_CHECKLIST"].includes(args.kind)) score += 10;
  if (args.ctx.market.dataQuality.status === "poor" && ["DEPLOY_CASH", "ENTER_POSITION"].includes(args.kind)) score -= 30;
  if (!args.ctx.plan.hasPlan && args.kind !== "PAUSE") score -= 40;
  if (args.ctx.dayState.doneToday && args.kind !== "HOLD") score -= 40;
  if (args.aggression === "LOW" && ["DEPLOY_CASH", "ENTER_POSITION"].includes(args.kind)) score -= 8;

  return clampPct(score);
}

function buildStructuredDecisionTrace(args: {
  ctx: EngineContext;
  action: { kind: ActionKind; reason: string };
  nextBestAction: DailyBundleV4["decision"]["nextBestAction"];
  loopStage: DailyBundleV4["loopStage"];
  priorityClass: DailyBundleV4["decision"]["priorityClass"];
  aggression: AggressionLevel;
  confidence: number;
  governors: ReturnType<typeof applySafetyGovernors>;
  guardrails: Guardrail[];
  inputHash: string;
}): StructuredDecisionTrace {
  const totalValue = Math.max(0, Number(args.ctx.portfolio.totalValueEur || 0));
  const cashPct = totalValue > 0 ? clampPct((Math.max(0, args.ctx.portfolio.cashEur) / totalValue) * 100) : 100;
  const exposurePct = clampPct(100 - cashPct);
  const coreAlternatives: ActionKind[] = [
    args.action.kind,
    "WAIT",
    "HOLD",
    "PAUSE",
    "REDUCE_CONCENTRATION",
    "DEPLOY_CASH",
    "MANUAL_BROKER_CHECKLIST",
  ];
  const uniqueAlternatives = Array.from(new Set(coreAlternatives));
  const rankedTop = uniqueAlternatives
    .map((kind) => ({
      action: traceAction(
        kind,
        kind === args.action.kind
          ? args.action.reason
          : kind === "WAIT"
            ? "Alternative if data quality or timing is not strong enough."
            : kind === "HOLD"
              ? "Alternative if no capital move is required."
              : kind === "PAUSE"
                ? "Alternative when setup, plan, or access blocks execution."
                : kind === "REDUCE_CONCENTRATION"
                  ? "Alternative if the dominant risk leak must be fixed first."
                  : kind === "MANUAL_BROKER_CHECKLIST"
                    ? "Alternative when execution proof is pending."
                    : "Alternative when cash deployment is allowed by the plan.",
      ),
      score: scoreTraceCandidate({
        kind,
        chosen: args.action.kind,
        ctx: args.ctx,
        loopStage: args.loopStage,
        priorityClass: args.priorityClass,
        aggression: args.aggression,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.action.kind.localeCompare(b.action.kind))
    .slice(0, 5);
  const blockers = buildDecisionBlockers({ governors: args.governors, guardrails: args.guardrails });
  const reasons = Array.from(
    new Set(
      [
        args.action.reason,
        `Priority class: ${args.priorityClass}.`,
        `Data coverage: ${clampPct(args.ctx.market.dataQuality.coveragePct)}%.`,
        `Confidence: ${Math.round(clamp01(args.confidence) * 100)}%.`,
        args.ctx.signals.topRiskLeakSeverity ? `Top risk leak severity: ${args.ctx.signals.topRiskLeakSeverity}.` : null,
      ].filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, 7);

  return {
    version: "v4",
    chosen: args.nextBestAction,
    rankedTop,
    blockers,
    reasons,
    stateSnapshot: {
      mode: args.ctx.mode,
      cashPct,
      exposurePct,
      holdingsPresent: args.ctx.portfolio.hasHoldings,
      brokerExecutionPending: !args.ctx.dayState.doneToday && !["WAIT", "PAUSE", "HOLD"].includes(args.action.kind),
      dailyClosed: args.ctx.dayState.doneToday,
      loopStage: args.loopStage,
      priorityClass: args.priorityClass,
      aggression: args.aggression,
      dataQualityStatus: args.ctx.market.dataQuality.status,
      dataCoveragePct: clampPct(args.ctx.market.dataQuality.coveragePct),
      topRiskLeakSeverity: args.ctx.signals.topRiskLeakSeverity,
    },
    inputHash: args.inputHash,
  };
}

function buildGuardrailsBase(ctx: EngineContext): Guardrail[] {
  const rules: Guardrail[] = [
    {
      code: "no_outside_plan",
      message: "Do not execute trades outside the active plan allocation logic.",
      severity: "high",
    },
    {
      code: "proof_required",
      message: "Capture execution proof before closing the day.",
      severity: "medium",
    },
  ];

  if (ctx.market.dataQuality.coveragePct < 80) {
    rules.push({
      code: "coverage_limited",
      message: "Treat signals as lower confidence while pricing coverage is limited.",
      severity: ctx.market.dataQuality.coveragePct < 50 ? "high" : "medium",
    });
  }

  return rules;
}

function computeAggression(ctx: EngineContext, action: ActionKind, confidence: number): AggressionLevel {
  if (action === "PAUSE" || action === "WAIT" || action === "HOLD") return "LOW";
  if ((ctx.dayState.lastProofQuality ?? 100) < 60) return "LOW";
  if (ctx.market.dataQuality.coveragePct < 80) return "NORMAL";
  if (confidence >= 0.85 && ctx.mode !== "investing") return "HIGH";
  return "NORMAL";
}

function deriveAction(ctx: EngineContext, loopStage: DailyBundleV4["loopStage"], governorAction: ActionKind | null) {
  if (governorAction) {
    const reason =
      governorAction === "HOLD"
        ? "Day is already closed. Replay and review only."
        : governorAction === "WAIT"
          ? "Syntrake is waiting because market data quality is too weak."
          : "Syntrake paused execution until setup/access requirements are valid.";
    return { kind: governorAction, reason };
  }

  if (loopStage === "DAY0_SETUP") {
    return { kind: "PAUSE" as const, reason: "Setup is incomplete or active plan is missing." };
  }

  if (loopStage === "DAY0_EXECUTE") {
    if (!ctx.portfolio.hasHoldings) {
      return { kind: "EXECUTE_STARTER_PACK" as const, reason: "Plan exists but starter execution has not started yet." };
    }
    return {
      kind: "MANUAL_BROKER_CHECKLIST" as const,
      reason: "First execution cycle needs proof-backed manual checklist completion.",
    };
  }

  if (ctx.signals.topRiskLeakSeverity === "high") {
    return { kind: "REDUCE_CONCENTRATION" as const, reason: "High-severity risk leak detected and must be reduced first" };
  }

  const monthly = Math.max(0, Number(ctx.plan.monthlyContributionEur || 0));
  const deployThreshold = monthly > 0 ? Math.min(Math.max(25, monthly * 0.5), 250) : 50;
  if (ctx.portfolio.cashEur >= deployThreshold) {
    return { kind: "DEPLOY_CASH" as const, reason: `Cash reserve (${ctx.portfolio.cashEur} EUR) is above deploy threshold` };
  }

  return { kind: "WAIT" as const, reason: "No higher-priority execution move is required right now" };
}

function buildInputHash(ctx: EngineContext) {
  return stableHash({
    userId: ctx.userId,
    mode: ctx.mode,
    asOf: ctx.asOf,
    setupComplete: ctx.setupComplete,
    plan: {
      hasPlan: ctx.plan.hasPlan,
      status: ctx.plan.status,
      targetEur: ctx.plan.targetEur,
      monthlyContributionEur: ctx.plan.monthlyContributionEur,
      horizonMonths: ctx.plan.horizonMonths,
    },
    portfolio: {
      holdingsCount: ctx.portfolio.holdingsCount,
      cashEur: ctx.portfolio.cashEur,
      totalValueEur: ctx.portfolio.totalValueEur,
      coveragePct: ctx.portfolio.coveragePct,
      items: ctx.portfolio.items.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        qty: item.qty,
        valueEur: item.valueEur,
      })),
    },
    market: {
      coveragePct: ctx.market.dataQuality.coveragePct,
      quoteCount: ctx.market.dataQuality.quoteCount,
      missingCount: ctx.market.dataQuality.missingCount,
    },
    dayState: ctx.dayState,
    reliability: ctx.reliability,
    access: ctx.access,
    signals: ctx.signals,
  });
}

export function computeDailyBundleV4(ctx: EngineContext): DailyBundleV4 {
  let trace: DecisionTraceItem[] = [];

  const loopStage = computeLoopStage(ctx);
  trace = pushTrace(trace, "loop_stage", loopStage, `receipts=${ctx.dayState.receiptsCount}; doneToday=${ctx.dayState.doneToday}`);

  const priority = selectPriorityClass(ctx);
  trace = pushTrace(trace, "priority", priority.priorityClass, priority.reason);

  const governors = applySafetyGovernors({ ctx, loopStage, priorityClass: priority.priorityClass });
  trace = [...trace, ...(governors.trace || [])].slice(-10);

  const action = deriveAction(ctx, loopStage, governors.actionKind);
  trace = pushTrace(trace, "decision", action.kind, action.reason);

  const proofQuality = ctx.dayState.lastProofQuality;
  const confidenceRaw =
    (ctx.plan.hasPlan ? 0.2 : 0) +
    (ctx.portfolio.hasHoldings ? 0.15 : 0) +
    (ctx.market.dataQuality.coveragePct / 100) * 0.35 +
    ((proofQuality == null ? 60 : proofQuality) / 100) * 0.15 +
    (ctx.dayState.doneToday ? 0.05 : 0.1) +
    (governors.overridden ? -0.2 : 0.05);
  const confidence = clamp01(confidenceRaw);

  const aggression = computeAggression(ctx, action.kind, confidence);
  trace = pushTrace(trace, "aggression", aggression, `confidence=${confidence.toFixed(2)}`);

  const nextBestAction = {
    kind: action.kind,
    title: buildActionTitle(action.kind),
    desc: buildActionDesc(action.kind, ctx, action.reason),
    cta: buildActionCta(action.kind, ctx.mode),
  };

  const proofRequiredToday = !ctx.dayState.doneToday && !["WAIT", "PAUSE", "HOLD"].includes(action.kind);
  const proofStatus =
    !proofRequiredToday
      ? "not_required"
      : proofQuality == null
        ? "missing"
        : proofQuality >= 70
          ? "good"
          : proofQuality >= 1
            ? "weak"
            : "missing";

  const guardrails = [...buildGuardrailsBase(ctx), ...(governors.guardrails || [])].slice(0, 5);
  const riskLeaks: RiskLeak[] =
    ctx.signals.topRiskLeakKey && ctx.signals.topRiskLeakSeverity
      ? [
          {
            key: ctx.signals.topRiskLeakKey,
            title: ctx.signals.topRiskLeakTitle || "Top risk leak",
            severity: ctx.signals.topRiskLeakSeverity,
          },
        ]
      : [];

  const proofScore = proofQuality == null ? 0 : clampPct(proofQuality);
  const reliabilityScore = clampPct(
    ((ctx.reliability.executionRate7d ?? 0.5) * 35 +
      (ctx.reliability.closeDayRate7d ?? 0.5) * 35 +
      (ctx.reliability.dataCoveragePct / 100) * 30),
  );
  const dataQualityScore = clampPct(ctx.market.dataQuality.coveragePct);
  const confidenceScore = clampPct(confidence * 100);
  const autopilotScore = clampPct(dataQualityScore * 0.35 + Math.max(proofScore, 40) * 0.2 + reliabilityScore * 0.2 + confidenceScore * 0.25);

  const inputHash = buildInputHash(ctx);
  trace = pushTrace(trace, "hash", "computed", inputHash.slice(0, 12));
  const decisionTrace = buildStructuredDecisionTrace({
    ctx,
    action,
    nextBestAction,
    loopStage,
    priorityClass: priority.priorityClass,
    aggression,
    confidence,
    governors,
    guardrails,
    inputHash,
  });

  return {
    ok: true,
    engineVersion: "v4-ultra",
    mode: ctx.mode,
    asOf: ctx.asOf,
    inputHash,
    loopStage,
    decision: {
      nextBestAction,
      whyNow: action.reason,
      whatToDo: buildWhatToDo(action.kind, ctx.mode),
      guardrails,
      opportunities: [],
      riskLeaks,
      priorityClass: priority.priorityClass,
      aggression,
      confidence,
    },
    scores: {
      autopilotScore,
      proofQualityScore: proofScore,
      dataQualityScore,
      reliabilityScore,
      confidenceScore,
    },
    proof: {
      lastProofQuality: proofQuality,
      proofRequiredToday,
      proofStatus,
      requirements: proofRequiredToday
        ? ["Order completion proof", "Execution note (fees/slippage recommended)"]
        : ["No new proof required after day close"],
      confirmedMoneyEur: null,
    },
    reliability: {
      executionRate7d: ctx.reliability.executionRate7d,
      closeDayRate7d: ctx.reliability.closeDayRate7d,
      dataCoveragePct: ctx.reliability.dataCoveragePct,
    },
    portfolio: {
      holdingsCount: ctx.portfolio.holdingsCount,
      cashEur: ctx.portfolio.cashEur,
      totalValueEur: ctx.portfolio.totalValueEur,
      coveragePct: ctx.portfolio.coveragePct,
    },
    plan: {
      hasPlan: ctx.plan.hasPlan,
      status: ctx.plan.status,
      goal: ctx.plan.goal,
      targetEur: ctx.plan.targetEur,
      monthlyContributionEur: ctx.plan.monthlyContributionEur,
      horizonMonths: ctx.plan.horizonMonths,
    },
    trace: capTrace(trace),
    decisionTrace,
    fallbackUsed: false,
  };
}

export type { DailyBundleV4 } from "./types";
