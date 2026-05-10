export type SimpleCommandDecision = "BUY" | "REDUCE" | "HOLD" | "WAIT" | "CLOSE";
export type WorkspaceMode = "simple" | "advanced";

export type SimpleSectionId =
  | "command_hero"
  | "execution_step"
  | "decision_rationale"
  | "next_cycle_timer";

export function normalizeSimpleDecision(args: {
  governanceDecision?: unknown;
  actionType?: unknown;
  doneToday?: boolean;
}): SimpleCommandDecision {
  if (args.doneToday) return "WAIT";

  const governance = String(args.governanceDecision || "").trim().toUpperCase();
  if (governance === "BUY") return "BUY";
  if (governance === "REDUCE") return "REDUCE";
  if (governance === "HOLD") return "HOLD";
  if (governance === "AVOID" || governance === "PAUSE") return "WAIT";

  const actionType = String(args.actionType || "").trim().toUpperCase();
  if (actionType === "CLOSE_DAY") return "CLOSE";
  if (actionType === "ADD" || actionType === "ENTER" || actionType === "EXECUTE_BROKER") return "BUY";
  if (actionType === "REDUCE" || actionType === "EXIT") return "REDUCE";
  if (actionType === "HOLD" || actionType === "WAIT" || actionType === "PAUSE") return "WAIT";
  return "WAIT";
}

export function decisionRequiresExecution(decision: SimpleCommandDecision) {
  return decision === "BUY" || decision === "REDUCE" || decision === "CLOSE";
}

export function computeProbabilityEdgePct(args: {
  decision: SimpleCommandDecision;
  probabilityUp?: number | null;
  probabilityDown?: number | null;
  baselineProbability?: number | null;
}) {
  const baselineRaw = Number(args.baselineProbability);
  const baseline = Number.isFinite(baselineRaw) ? Math.max(0, Math.min(1, baselineRaw)) : 0.5;
  const upRaw = Number(args.probabilityUp);
  const downRaw = Number(args.probabilityDown);
  const up = Number.isFinite(upRaw) ? Math.max(0, Math.min(1, upRaw)) : null;
  const down = Number.isFinite(downRaw) ? Math.max(0, Math.min(1, downRaw)) : null;

  let systemExpected = baseline;
  if (args.decision === "BUY") {
    systemExpected = up ?? (down != null ? 1 - down : baseline);
  } else if (args.decision === "REDUCE" || args.decision === "CLOSE") {
    systemExpected = down ?? (up != null ? 1 - up : baseline);
  } else {
    systemExpected = baseline;
  }

  const edgePct = (systemExpected - baseline) * 100;
  return Math.round(edgePct * 10) / 10;
}

export function deriveExecutionStreakDays(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function buildSimpleSectionOrder(decision: SimpleCommandDecision): SimpleSectionId[] {
  const base: SimpleSectionId[] = ["command_hero"];
  if (decisionRequiresExecution(decision)) base.push("execution_step");
  base.push("decision_rationale");
  base.push("next_cycle_timer");
  return base;
}

export function buildDailyRenderPlan(args: {
  workspaceMode: WorkspaceMode;
  decision: SimpleCommandDecision;
}) {
  if (args.workspaceMode === "advanced") {
    return {
      workspaceMode: "advanced" as const,
      simpleSections: [] as SimpleSectionId[],
      showAdvancedDiagnostics: true,
    };
  }
  return {
    workspaceMode: "simple" as const,
    simpleSections: buildSimpleSectionOrder(args.decision),
    showAdvancedDiagnostics: false,
  };
}
