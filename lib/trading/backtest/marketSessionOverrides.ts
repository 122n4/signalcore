import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { SessionState } from "@/lib/trading/market";
import type { SetupCoreOutput, SetupType } from "@/lib/trading/setups";

import type {
  TradingBacktestMarketSessionOverrides,
  TradingBacktestMarketSessionRule,
} from "./types";

function matchesRule(args: {
  rule: TradingBacktestMarketSessionRule;
  instrument: string;
  session: SessionState;
  setupType: SetupType;
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
    qualityMatches &&
    clarityMatches &&
    environmentMatches
  );
}

export function resolveMatchingBacktestMarketSessionRule(args: {
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
  overrides: TradingBacktestMarketSessionOverrides | null;
}): TradingBacktestMarketSessionRule | null {
  const rules = args.overrides?.blockedTradeValidContexts ?? [];

  for (const rule of rules) {
    if (
      matchesRule({
        rule,
        instrument: args.instrument,
        session: args.session,
        setupType: args.setupType,
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

export function applyBacktestMarketSessionOverrides(args: {
  instrument: string;
  session: SessionState;
  setupType: SetupType;
  qualityGrade: SetupCoreOutput["quality"]["grade"];
  clarityLevel: DecisionCoreOutput["clarity"]["level"];
  environmentState: DecisionCoreOutput["environment"]["state"];
  decisionCore: DecisionCoreOutput;
  overrides: TradingBacktestMarketSessionOverrides | null;
}): DecisionCoreOutput {
  if (args.decisionCore.decision.currentState !== "TRADE_VALID") {
    return args.decisionCore;
  }

  const matchingRule = resolveMatchingBacktestMarketSessionRule({
    instrument: args.instrument,
    session: args.session,
    setupType: args.setupType,
    qualityGrade: args.qualityGrade,
    clarityLevel: args.clarityLevel,
    environmentState: args.environmentState,
    overrides: args.overrides,
  });

  if (!matchingRule) {
    return args.decisionCore;
  }

  const reason =
    matchingRule.reason ??
    `Backtest market/session calibration blocked ${args.instrument} during ${args.session}.`;

  return {
    ...args.decisionCore,
    decision: {
      ...args.decisionCore.decision,
      currentState: "BLOCKED",
      primaryMessage: "Backtest market/session override blocked this trade-valid context.",
      secondaryMessage: reason,
      reasons: [...args.decisionCore.decision.reasons, reason],
    },
  };
}
