import type { EngineContext, GovernorResult, Guardrail, LoopStage, PriorityClass } from "./types";

function guardrail(code: string, message: string, severity: Guardrail["severity"]): Guardrail {
  return { code, message, severity };
}

export function applySafetyGovernors(args: {
  ctx: EngineContext;
  loopStage: LoopStage;
  priorityClass: PriorityClass;
}): GovernorResult {
  const { ctx, loopStage } = args;
  const trace: GovernorResult["trace"] = [];
  const guardrails: Guardrail[] = [];

  if (ctx.access.modeAllowed === false) {
    trace.push({ step: "governor.access", outcome: "override", detail: "Mode blocked by access frame" });
    guardrails.push(guardrail("mode_blocked", "This mode is not allowed for the current access level.", "high"));
    return { overridden: true, actionKind: "PAUSE", reason: "Mode access is blocked", guardrails, trace };
  }

  if (loopStage === "DAY0_SETUP" || !ctx.plan.hasPlan) {
    trace.push({ step: "governor.plan", outcome: "override", detail: "No active plan/setup incomplete" });
    guardrails.push(guardrail("plan_required", "Do not execute orders before an active plan exists.", "high"));
    return { overridden: true, actionKind: "PAUSE", reason: "Plan/setup missing", guardrails, trace };
  }

  if (ctx.dayState.doneToday) {
    trace.push({ step: "governor.day_closed", outcome: "override", detail: "Day already closed" });
    guardrails.push(guardrail("day_closed", "Do not open new execution tasks after closing the day.", "high"));
    return { overridden: true, actionKind: "HOLD", reason: "Day already closed", guardrails, trace };
  }

  if ((ctx.market.dataQuality.coveragePct ?? 0) < 35 || ctx.market.dataQuality.status === "poor") {
    trace.push({ step: "governor.data_quality", outcome: "override", detail: "Low market data coverage" });
    guardrails.push(guardrail("data_quality_low", "Wait for better market coverage before executing.", "high"));
    return { overridden: true, actionKind: "WAIT", reason: "Market data coverage too low", guardrails, trace };
  }

  if ((ctx.dayState.lastProofQuality ?? 100) < 40 && ctx.dayState.receiptsCount > 0) {
    trace.push({ step: "governor.proof_quality", outcome: "pass", detail: "Weak proof quality flagged" });
    guardrails.push(guardrail("proof_quality_weak", "Capture stronger execution proof before increasing risk.", "medium"));
  }

  return { overridden: false, actionKind: null, reason: null, guardrails, trace };
}
