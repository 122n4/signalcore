import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { ExecutionPlanOutput } from "@/lib/trading/execution";
import type { SessionState } from "@/lib/trading/market";
import type { BehaviorGuardOutput, TradingBehaviorSnapshot } from "@/lib/trading/playbook";
import type { SetupCoreOutput, SetupType } from "@/lib/trading/setups";
import { resolveTradingPlaybookRules, type TradingPlaybook } from "@/lib/trading/playbook";

import type { TradingBacktestRiskOverrides, TradingBacktestRiskRule } from "./types";

function roundRisk(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function matchesRule(args: {
  rule: TradingBacktestRiskRule;
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  riskMode: ExecutionPlanOutput["riskFraming"]["riskMode"];
  executionStatus: ExecutionPlanOutput["executionStatus"]["executionStatus"];
  behaviorState: BehaviorGuardOutput["state"];
  behavior: TradingBehaviorSnapshot;
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
}): boolean {
  const instrument = args.instrument.trim().toUpperCase();

  if (args.rule.instrument?.trim() && args.rule.instrument.trim().toUpperCase() !== instrument) {
    return false;
  }

  if (args.rule.sessions?.length && !args.rule.sessions.includes(args.session)) {
    return false;
  }

  if (args.rule.setupTypes?.length && !args.rule.setupTypes.includes(args.setupType)) {
    return false;
  }

  if (args.rule.riskModes?.length && !args.rule.riskModes.includes(args.riskMode)) {
    return false;
  }

  if (
    args.rule.executionStatuses?.length &&
    !args.rule.executionStatuses.includes(args.executionStatus)
  ) {
    return false;
  }

  if (args.rule.behaviorStates?.length && !args.rule.behaviorStates.includes(args.behaviorState)) {
    return false;
  }

  if (
    typeof args.rule.minConsecutiveLosses === "number" &&
    args.behavior.consecutiveLosses < args.rule.minConsecutiveLosses
  ) {
    return false;
  }

  if (
    typeof args.rule.minDailyLossPct === "number" &&
    args.behavior.dailyLossPct < args.rule.minDailyLossPct
  ) {
    return false;
  }

  if (args.rule.qualityGrades?.length && !args.rule.qualityGrades.includes(args.qualityGrade)) {
    return false;
  }

  if (args.rule.clarityLevels?.length && !args.rule.clarityLevels.includes(args.clarityLevel)) {
    return false;
  }

  if (
    args.rule.environmentStates?.length &&
    !args.rule.environmentStates.includes(args.environmentState)
  ) {
    return false;
  }

  return true;
}

export function applyBacktestRiskOverrides(args: {
  executionPlan: ExecutionPlanOutput;
  playbook: TradingPlaybook;
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  executionStatus: ExecutionPlanOutput["executionStatus"]["executionStatus"];
  behaviorState: BehaviorGuardOutput["state"];
  behavior: TradingBehaviorSnapshot;
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
  overrides?: TradingBacktestRiskOverrides | null;
}): ExecutionPlanOutput {
  const aggressiveRiskPct = roundRisk(args.overrides?.aggressiveRiskPct);
  let adjustedPlan = args.executionPlan;

  if (aggressiveRiskPct && aggressiveRiskPct > 0 && args.executionPlan.riskFraming.riskMode === "aggressive") {
    const rules = resolveTradingPlaybookRules(args.playbook, args.session);
    const baseRiskPct = roundRisk(rules.riskPerTradePct);
    const sizeAdjustment =
      typeof baseRiskPct === "number" && baseRiskPct > 0
        ? roundRisk(aggressiveRiskPct / baseRiskPct)
        : args.executionPlan.riskFraming.sizeAdjustment ?? null;

    adjustedPlan = {
      ...adjustedPlan,
      riskFraming: {
        ...adjustedPlan.riskFraming,
        riskPct: aggressiveRiskPct,
        sizeAdjustment,
      },
    };
  }

  const matchedRules = (args.overrides?.rules ?? []).filter((rule) =>
    matchesRule({
      rule,
      instrument: args.instrument,
      session: args.session,
      setupType: args.setupType,
      riskMode: adjustedPlan.riskFraming.riskMode,
      executionStatus: adjustedPlan.executionStatus.executionStatus,
      behaviorState: args.behaviorState,
      behavior: args.behavior,
      qualityGrade: args.qualityGrade,
      clarityLevel: args.clarityLevel,
      environmentState: args.environmentState,
    }),
  );

  if (matchedRules.length === 0) {
    return adjustedPlan;
  }

  let nextPlan = adjustedPlan;
  const rules = resolveTradingPlaybookRules(args.playbook, args.session);
  const baseRiskPct = roundRisk(rules.riskPerTradePct);

  for (const matchedRule of matchedRules) {
    const currentRiskPct = roundRisk(nextPlan.riskFraming.riskPct);

    if (!currentRiskPct || currentRiskPct <= 0) {
      return nextPlan;
    }

    const explicitRiskPct = roundRisk(matchedRule.riskPct);
    const multiplier =
      typeof matchedRule.riskMultiplier === "number" && Number.isFinite(matchedRule.riskMultiplier)
        ? matchedRule.riskMultiplier
        : null;
    const nextRiskPct = explicitRiskPct ?? (multiplier !== null ? roundRisk(currentRiskPct * multiplier) : null);

    if (!nextRiskPct || nextRiskPct <= 0) {
      return nextPlan;
    }

    const sizeAdjustment =
      typeof baseRiskPct === "number" && baseRiskPct > 0
        ? roundRisk(nextRiskPct / baseRiskPct)
        : nextPlan.riskFraming.sizeAdjustment ?? null;

    nextPlan = {
      ...nextPlan,
      riskFraming: {
        ...nextPlan.riskFraming,
        riskPct: nextRiskPct,
        sizeAdjustment,
      },
    };
  }

  return nextPlan;
}
