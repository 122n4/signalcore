export type PortfolioHealthRiskInput = {
  risk_level?: string | null;
  concentration_warning?: boolean | null;
  diversification_score?: number | null;
  concentration_top1_pct?: number | null;
  concentration_top3_pct?: number | null;
  volatility_exposure_pct?: number | null;
};

export type PortfolioHealthInput = {
  portfolio_risk?: PortfolioHealthRiskInput | null;
  protection_mode?: boolean | null;
  action_gate_blocked?: boolean | null;
  risk_policy_blocked?: boolean | null;
};

export type PortfolioHealthOutput = {
  health_score: number;
  status: "stable" | "watch" | "risk_high";
  warning: string | null;
  description: string;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round0(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

export function buildPortfolioHealth(input: PortfolioHealthInput): PortfolioHealthOutput {
  const risk = input.portfolio_risk && typeof input.portfolio_risk === "object" ? input.portfolio_risk : {};
  const top1 = Math.max(0, Number(risk.concentration_top1_pct || 0));
  const top3 = Math.max(0, Number(risk.concentration_top3_pct || 0));
  const diversification = clamp(Number(risk.diversification_score ?? 65), 0, 100);
  const volExposure = Math.max(0, Number(risk.volatility_exposure_pct || 0));
  const riskLevel = String(risk.risk_level || "").trim().toLowerCase();
  const concentrationWarning = Boolean(risk.concentration_warning);
  const protectionMode = Boolean(input.protection_mode);
  const actionGateBlocked = Boolean(input.action_gate_blocked);
  const riskPolicyBlocked = Boolean(input.risk_policy_blocked);

  let healthScore =
    100 -
    top1 * 0.9 -
    Math.max(0, top3 - 45) * 0.55 -
    (100 - diversification) * 0.45 -
    volExposure * 0.35;

  if (concentrationWarning) healthScore -= 8;
  if (protectionMode) healthScore -= 8;
  if (actionGateBlocked) healthScore -= 12;
  if (riskPolicyBlocked) healthScore -= 18;

  healthScore = clamp(round0(healthScore), 0, 100);

  let status: PortfolioHealthOutput["status"] = "stable";
  if (
    riskPolicyBlocked ||
    riskLevel === "high" ||
    top1 >= 30 ||
    top3 >= 75 ||
    healthScore < 45
  ) {
    status = "risk_high";
  } else if (
    protectionMode ||
    actionGateBlocked ||
    riskLevel === "moderate" ||
    top1 >= 22 ||
    top3 >= 60 ||
    healthScore < 70
  ) {
    status = "watch";
  }

  let warning: string | null = null;
  if (riskPolicyBlocked) warning = "Risk policy is blocking execution until portfolio risk improves.";
  else if (top1 >= 30) warning = "Single-position concentration is above safe limits.";
  else if (top3 >= 75) warning = "Top-3 concentration is too high and reduces diversification safety.";
  else if (protectionMode) warning = "Capital protection mode is active; reduce aggressiveness.";
  else if (actionGateBlocked) warning = "Action gate is blocked until checklist quality recovers.";
  else if (volExposure >= 30) warning = "Volatility exposure is elevated for current portfolio structure.";
  else if (riskLevel === "high") warning = "Portfolio risk profile is high.";

  const description =
    status === "stable"
      ? "Portfolio risk is stable with acceptable diversification."
      : status === "watch"
        ? "Portfolio risk needs attention before scaling exposure."
        : "Portfolio risk is high. Prioritize protection before new entries.";

  return {
    health_score: healthScore,
    status,
    warning,
    description,
  };
}
