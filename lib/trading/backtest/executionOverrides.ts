import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { ExecutionPlanOutput } from "@/lib/trading/execution";
import type { SessionState } from "@/lib/trading/market";
import type { SetupCoreOutput, SetupType } from "@/lib/trading/setups";

import type {
  TradingBacktestExecutionOverrides,
  TradingBacktestExecutionRule,
} from "./types";

function matchesRule(args: {
  rule: TradingBacktestExecutionRule;
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  riskMode: ExecutionPlanOutput["riskFraming"]["riskMode"];
  executionStatus: ExecutionPlanOutput["executionStatus"]["executionStatus"];
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
}): boolean {
  const instrumentMatches =
    !args.rule.instrument ||
    args.rule.instrument.trim().toUpperCase() === args.instrument.trim().toUpperCase();
  const sessionMatches =
    !args.rule.sessions ||
    args.rule.sessions.length === 0 ||
    args.rule.sessions.includes(args.session);
  const setupMatches =
    !args.rule.setupTypes ||
    args.rule.setupTypes.length === 0 ||
    args.rule.setupTypes.includes(args.setupType);
  const riskModeMatches =
    !args.rule.riskModes ||
    args.rule.riskModes.length === 0 ||
    args.rule.riskModes.includes(args.riskMode);
  const executionStatusMatches =
    !args.rule.executionStatuses ||
    args.rule.executionStatuses.length === 0 ||
    args.rule.executionStatuses.includes(args.executionStatus);
  const qualityMatches =
    !args.rule.qualityGrades ||
    args.rule.qualityGrades.length === 0 ||
    args.rule.qualityGrades.includes(args.qualityGrade);
  const clarityMatches =
    !args.rule.clarityLevels ||
    args.rule.clarityLevels.length === 0 ||
    args.rule.clarityLevels.includes(args.clarityLevel);
  const environmentMatches =
    !args.rule.environmentStates ||
    args.rule.environmentStates.length === 0 ||
    args.rule.environmentStates.includes(args.environmentState);

  return (
    instrumentMatches &&
    sessionMatches &&
    setupMatches &&
    riskModeMatches &&
    executionStatusMatches &&
    qualityMatches &&
    clarityMatches &&
    environmentMatches
  );
}

export function resolveMatchingBacktestExecutionRule(args: {
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  riskMode: ExecutionPlanOutput["riskFraming"]["riskMode"];
  executionStatus: ExecutionPlanOutput["executionStatus"]["executionStatus"];
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
  overrides: TradingBacktestExecutionOverrides | null;
}): TradingBacktestExecutionRule | null {
  const rules = args.overrides?.blockedSignalContexts ?? [];

  for (const rule of rules) {
    if (
      matchesRule({
        rule,
        instrument: args.instrument,
        session: args.session,
        setupType: args.setupType,
        riskMode: args.riskMode,
        executionStatus: args.executionStatus,
        qualityGrade: args.qualityGrade,
        clarityLevel: args.clarityLevel,
        environmentState: args.environmentState,
      })
    ) {
      return rule;
    }
  }

  return null;
}

