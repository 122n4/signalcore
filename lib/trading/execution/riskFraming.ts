import type { ExecutionPlanningInput, RiskFramingOutput } from "./types";
import { resolveTradingPlaybookRules } from "@/lib/trading/playbook";

const HIGH_EDGE_AGGRESSIVE_RISK_PCT = 1;
const CONTEXTUAL_RISK_MULTIPLIERS = [
  {
    instrument: "NAS100",
    setupType: "breakout_continuation",
    multiplier: 0.75,
  },
  {
    instrument: "NAS100",
    session: "london_ny_overlap",
    setupType: "breakout_continuation",
    multiplier: 0.67,
  },
  {
    instrument: "US500",
    session: "pre_market",
    multiplier: 0.5,
  },
  {
    instrument: "XAUUSD",
    session: "london_open",
    setupType: "breakout_continuation",
    multiplier: 0.5,
  },
  {
    instrument: "BTCUSD",
    session: "weekend_drift",
    setupType: "breakout_continuation",
    multiplier: 0.5,
  },
] as const;

function roundRisk(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function resolveContextualRiskMultiplier(input: ExecutionPlanningInput): number | null {
  const instrument = input.snapshot.instrument.trim().toUpperCase();
  let multiplier = 1;
  let matched = false;

  for (const rule of CONTEXTUAL_RISK_MULTIPLIERS) {
    if (rule.instrument !== instrument) {
      continue;
    }

    if ("session" in rule && rule.session !== input.market.session.session) {
      continue;
    }

    if ("setupType" in rule && rule.setupType !== input.setupCore.setup.type) {
      continue;
    }

    multiplier *= rule.multiplier;
    matched = true;
  }

  return matched ? multiplier : null;
}

export function buildRiskFraming(input: ExecutionPlanningInput): RiskFramingOutput {
  const rules = resolveTradingPlaybookRules(input.playbook, input.market.session.session);
  const baseRiskPct = roundRisk(rules.riskPerTradePct);

  if (!input.playbookCheck.executionAllowed || input.behaviorGuard.state === "restricted") {
    return {
      riskPct: null,
      sizeAdjustment: 0,
      riskMode: "reduced",
    };
  }

  let riskMode: RiskFramingOutput["riskMode"] = "normal";
  let sizeAdjustment = 1;
  let riskPct = baseRiskPct;

  if (
    input.behaviorGuard.state === "caution" ||
    input.decisionCore.environment.state === "neutral" ||
    input.decisionCore.clarity.level === "medium" ||
    ["C", "D"].includes(input.setupCore.quality.grade)
  ) {
    riskMode = "reduced";
    sizeAdjustment = input.behaviorGuard.state === "caution" ? 0.5 : 0.75;
  } else if (
    input.decisionCore.clarity.level === "high" &&
    input.decisionCore.environment.state === "favorable" &&
    input.setupCore.quality.grade === "A" &&
    input.decisionCore.bias.direction !== "mixed"
  ) {
    riskMode = "aggressive";
    riskPct = HIGH_EDGE_AGGRESSIVE_RISK_PCT;
    sizeAdjustment =
      typeof baseRiskPct === "number" && baseRiskPct > 0 ? HIGH_EDGE_AGGRESSIVE_RISK_PCT / baseRiskPct : 1;
  }

  let effectiveRiskPct = roundRisk(
    typeof riskPct === "number" && typeof sizeAdjustment === "number" && riskMode !== "aggressive"
      ? riskPct * sizeAdjustment
      : riskPct,
  );
  let effectiveSizeAdjustment = sizeAdjustment;
  const contextualMultiplier = resolveContextualRiskMultiplier(input);

  if (contextualMultiplier !== null && typeof effectiveRiskPct === "number" && effectiveRiskPct > 0) {
    effectiveRiskPct = roundRisk(effectiveRiskPct * contextualMultiplier);
    effectiveSizeAdjustment =
      typeof baseRiskPct === "number" && baseRiskPct > 0 && typeof effectiveRiskPct === "number"
        ? effectiveRiskPct / baseRiskPct
        : effectiveSizeAdjustment;
  }

  return {
    riskPct: effectiveRiskPct,
    sizeAdjustment: roundRisk(effectiveSizeAdjustment),
    riskMode,
  };
}
