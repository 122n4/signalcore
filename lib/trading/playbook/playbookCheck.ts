import type { PlaybookCheckOutput, TradingOperationalInput, TradingNoTradeCondition } from "./types";
import { resolveTradingPlaybookRules } from "./tradingPlaybook";

function matchesBlockedContext(
  input: TradingOperationalInput,
  blockedContext: NonNullable<
    ReturnType<typeof resolveTradingPlaybookRules>["blockedTradeValidContexts"]
  >[number],
): boolean {
  const instrumentMatches =
    !blockedContext.instrument ||
    blockedContext.instrument.trim().toUpperCase() === input.snapshot.instrument.trim().toUpperCase();
  const sessionMatches =
    !blockedContext.sessions ||
    blockedContext.sessions.length === 0 ||
    blockedContext.sessions.includes(input.market.session.session);
  const setupMatches =
    !blockedContext.setupTypes ||
    blockedContext.setupTypes.length === 0 ||
    blockedContext.setupTypes.includes(input.setupCore.setup.type);
  const qualityMatches =
    !blockedContext.qualityGrades ||
    blockedContext.qualityGrades.length === 0 ||
    blockedContext.qualityGrades.includes(input.setupCore.quality.grade);
  const clarityMatches =
    !blockedContext.clarityLevels ||
    blockedContext.clarityLevels.length === 0 ||
    blockedContext.clarityLevels.includes(input.decisionCore.clarity.level);
  const environmentMatches =
    !blockedContext.environmentStates ||
    blockedContext.environmentStates.length === 0 ||
    blockedContext.environmentStates.includes(input.decisionCore.environment.state);

  return (
    instrumentMatches &&
    sessionMatches &&
    setupMatches &&
    qualityMatches &&
    clarityMatches &&
    environmentMatches
  );
}

function isBlockedByCondition(
  condition: TradingNoTradeCondition,
  input: TradingOperationalInput,
): boolean {
  switch (condition) {
    case "low_clarity":
      return input.decisionCore.clarity.level === "low";
    case "unfavorable_environment":
      return input.decisionCore.environment.state === "unfavorable";
    case "late_setup":
      return ["late", "invalid"].includes(input.setupCore.maturity.state);
    case "degrading_window":
      return ["degrading", "closed"].includes(input.setupCore.opportunityWindow.state);
    case "spike_volatility":
      return input.market.volatility.state === "spike";
    case "noisy_regime":
      return ["noisy", "low_participation"].includes(input.market.regime.state);
    case "mixed_bias":
      return input.decisionCore.bias.direction === "mixed";
  }
}

function nextStepFromReasons(reasons: string[]): string | null {
  if (reasons.some((reason) => reason.includes("technical state"))) {
    return "Wait for a trade-valid technical state before executing.";
  }

  if (reasons.some((reason) => reason.includes("session"))) {
    return "Stand down until the active session matches the playbook.";
  }

  if (reasons.some((reason) => reason.includes("regime"))) {
    return "Stand aside until the regime rotates back inside the playbook.";
  }

  if (reasons.some((reason) => reason.includes("setup"))) {
    return "Only execute setups explicitly allowed by the playbook.";
  }

  if (reasons.some((reason) => reason.includes("clarity"))) {
    return "Wait for clarity to improve before considering execution.";
  }

  return null;
}

function setupSupportsRegimePreference(input: TradingOperationalInput): boolean {
  return (
    input.market.regime.state === "mean_reverting" &&
    ["range_reclaim", "failed_breakout", "liquidity_sweep_reversal"].includes(
      input.setupCore.setup.type,
    )
  );
}

export function runPlaybookCheck(input: TradingOperationalInput): PlaybookCheckOutput {
  const rules = resolveTradingPlaybookRules(input.playbook, input.market.session.session);
  const sessionActive = input.market.session.marketOpen && rules.activeSession !== "market_closed";
  const reasons: string[] = [];

  if (!sessionActive) {
    reasons.push("Active session is not eligible for this playbook.");
  }

  if (input.setupCore.setup.type === "none") {
    reasons.push("No setup is available for playbook validation.");
  } else {
    if (rules.blockedSetups.includes(input.setupCore.setup.type)) {
      reasons.push(`Setup ${input.setupCore.setup.type} is blocked by the playbook.`);
    }

    if (!rules.allowedSetups.includes(input.setupCore.setup.type)) {
      reasons.push(`Setup ${input.setupCore.setup.type} is outside the allowed playbook set.`);
    }
  }

  if (rules.blockedRegimes.includes(input.market.regime.state)) {
    reasons.push(`Regime ${input.market.regime.state} is blocked by the playbook.`);
  }

  if (
    rules.preferredRegimes.length > 0 &&
    !rules.preferredRegimes.includes(input.market.regime.state) &&
    !setupSupportsRegimePreference(input)
  ) {
    reasons.push(`Regime ${input.market.regime.state} is outside the preferred playbook profile.`);
  }

  for (const condition of rules.noTradeIf) {
    if (isBlockedByCondition(condition, input)) {
      reasons.push(`No-trade condition triggered: ${condition.replaceAll("_", " ")}.`);
    }
  }

  const technicalStateTradable = input.decisionCore.decision.currentState === "TRADE_VALID";

  if (technicalStateTradable) {
    for (const blockedContext of rules.blockedTradeValidContexts ?? []) {
      if (matchesBlockedContext(input, blockedContext)) {
        reasons.push(
          blockedContext.reason ??
            `${input.snapshot.instrument} is blocked during ${input.market.session.session} in the current playbook calibration.`,
        );
      }
    }
  }

  const rulesAligned = reasons.length === 0;

  if (!technicalStateTradable) {
    reasons.push("Decision core is not in a trade-valid technical state.");
  }

  return {
    sessionActive,
    rulesAligned,
    executionAllowed: sessionActive && rulesAligned && technicalStateTradable,
    hardBlock: false,
    reasons,
    nextDisciplineStep: nextStepFromReasons(reasons),
  };
}
