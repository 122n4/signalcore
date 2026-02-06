// lib/signalcore/scenarioLab.ts
import type { MarketRegime, Horizon, RiskProfile, Goal, PortfolioItem } from "./types";

export type Scenario = {
  name: string;
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
};

export type ScenarioLabOutput = {
  scenarios: Array<{
    name: string;
    highlights: string[];
    risks: string[];
  }>;
};

export function runScenarioLab(input: {
  baseRegime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}): ScenarioLabOutput {
  const base: Scenario[] = [
    { name: "Base case", regime: input.baseRegime, horizon: input.horizon, risk: input.risk },
    { name: "Risk-off shock", regime: "Risk-off", horizon: input.horizon, risk: input.risk },
    { name: "Risk-on upside", regime: "Risk-on", horizon: input.horizon, risk: input.risk },
    { name: "Choppy range", regime: "Neutral / Range-bound", horizon: input.horizon, risk: input.risk },
    { name: "Transition", regime: "Transitional", horizon: input.horizon, risk: input.risk },
  ];

  return {
    scenarios: base.map((s) => {
      const risks: string[] = [];
      const highlights: string[] = [];

      if (s.regime === "Risk-off") {
        highlights.push("Prioritize protection and position sizing.");
        risks.push("Overexposure to high-vol assets gets punished.");
      }
      if (s.regime === "Risk-on") {
        highlights.push("Selective risk-taking can compound.");
        risks.push("Chasing momentum without rules increases drawdown risk.");
      }
      if (s.regime === "Neutral / Range-bound") {
        highlights.push("Reduce frequency; increase quality.");
        risks.push("Overtrading in chop erodes edge.");
      }
      if (s.regime === "Transitional") {
        highlights.push("Wait for confirmation; phase entries.");
        risks.push("False breaks and reversals are common.");
      }

      // basic horizon/risk notes
      if (s.horizon === "Short") {
        highlights.push("Short horizon: rules + risk budget > optimization.");
      }
      if (s.risk === "Aggressive" && (s.regime === "Risk-off" || s.regime === "Transitional")) {
        risks.push("Aggressive profile may be incoherent under current regime.");
      }

      return {
        name: s.name,
        highlights,
        risks,
      };
    }),
  };
}