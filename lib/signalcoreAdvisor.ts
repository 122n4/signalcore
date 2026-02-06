import type { MarketRegime, Horizon } from "@/lib/signalcore";

export function buildAdvisor(input: {
  mode: "investing" | "trading";
  regime: MarketRegime;
  horizon: Horizon;
  goalLabel?: string;
}) {
  const { mode, regime, horizon, goalLabel } = input;

  const isRiskOff = regime === "Risk-off";
  const isRiskOn = regime === "Risk-on";

  const confidence = isRiskOff ? "High" : isRiskOn ? "Moderate" : "Moderate";

  const action: "Increase" | "Hold" | "Reduce" =
    isRiskOff ? "Reduce" : isRiskOn ? "Increase" : "Hold";

  const title = mode === "trading" ? "Trading Advisor" : "Goal-based Advisor";

  const reasons: string[] = [];

  if (goalLabel) reasons.push(`Goal timeframe: ${goalLabel} — decisions must respect pace and drawdown.`);
  reasons.push(`Market regime: ${regime} — stance adjusted automatically.`);
  reasons.push(`Horizon: ${horizon} — tempo and risk budget aligned.`);

  const headline =
    action === "Increase"
      ? "You can take risk today — but only inside your plan."
      : action === "Reduce"
      ? "Capital protection matters more than speed right now."
      : "Avoid unnecessary changes. Structure > activity.";

  const ifCreatedToday =
    "If this plan was created today, SignalCore would prioritize coherence first — then execution.";

  return {
    title,
    action,
    confidence: confidence as "Low" | "Moderate" | "High",
    headline,
    reasons,
    ifCreatedToday,
    riskBudget: isRiskOff ? "Tight" : "Normal",
    playbookHint:
      action === "Increase"
        ? "Use incremental adds + strict guardrails."
        : action === "Reduce"
        ? "Reduce tail risk and simplify."
        : "Hold and refine plan drivers.",
  };
}