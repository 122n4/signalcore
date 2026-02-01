export type UserMode = "investing" | "trading";
export type Horizon = "Short" | "Medium" | "Long";
export type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";

export type AdvisorAction = "Increase" | "Hold" | "Reduce";

export type AdvisorPayload = {
  title: string;
  action: AdvisorAction;
  confidence: "Low" | "Moderate" | "High";
  headline: string;
  reasons: string[];
  ifCreatedToday: string;
  riskBudget?: string; // trading
  playbookHint?: string; // trading
};

function pickConfidence(regime: Regime): AdvisorPayload["confidence"] {
  if (regime === "Risk-on") return "Moderate";
  if (regime === "Risk-off") return "High";
  if (regime === "Transitional") return "Moderate";
  return "Low";
}

export function buildAdvisor(args: {
  mode: UserMode;
  regime: Regime;
  horizon: Horizon;
  goalLabel?: string; // ex: "12 months"
}): AdvisorPayload {
  const { mode, regime, horizon, goalLabel } = args;
  const confidence = pickConfidence(regime);

  if (mode === "trading") {
    // trading/forex: foco em ambiente + playbook + risco
    const isTrap = regime === "Transitional" || regime === "Neutral / Range-bound";
    const action: AdvisorAction = isTrap ? "Reduce" : regime === "Risk-on" ? "Increase" : "Hold";

    const headline =
      action === "Reduce"
        ? "Today is an environment where forcing trades gets punished. Reduce aggressiveness."
        : action === "Increase"
        ? "Conditions are cleaner than usual. If you trade, trade selectively — not frequently."
        : "Stay selective. Let confirmation do the heavy lifting.";

    return {
      title: "SignalCore Advisor · Trading/Forex",
      action,
      confidence,
      headline,
      reasons: [
        isTrap
          ? "Choppy regimes create false breaks and emotional overtrading."
          : "Cleaner conditions reward disciplined execution over impulsive entries.",
        "Your edge improves when you trade fewer, higher-quality situations.",
        "The goal is consistency, not activity.",
      ],
      playbookHint: isTrap
        ? "Hint: prefer mean-reversion/pullback confirmation. Avoid impulsive breakouts."
        : "Hint: trend continuation is more coherent. Still wait for confirmation.",
      riskBudget: isTrap
        ? "Risk budget today: LOW (1 mistake → stop)."
        : "Risk budget today: MODERATE (protect capital, avoid doubling down).",
      ifCreatedToday:
        "If you started today, SignalCore would prioritize protection first — and only add risk when conditions prove themselves.",
    };
  }

  // investing: foco em coerência + pacing + objetivo
  const shortH = horizon === "Short";
  const action: AdvisorAction =
    regime === "Risk-on" && !shortH ? "Increase" : regime === "Risk-off" ? "Hold" : "Hold";

  const horizonLine =
    horizon === "Short"
      ? "Short-horizon goals get damaged by noise. Avoid urgency."
      : horizon === "Medium"
      ? "Medium horizon rewards pacing and confirmation."
      : "Long horizon rewards consistency over timing.";

  const headline =
    action === "Increase"
      ? "Conditions are constructive enough to add gradually — without rushing."
      : "The best edge right now is coherence: keep your plan steady and avoid emotional changes.";

  return {
    title: "SignalCore Advisor · Investing",
    action,
    confidence,
    headline,
    reasons: [
      horizonLine,
      regime === "Risk-off"
        ? "In defensive regimes, protecting consistency beats chasing rebounds."
        : "In mixed regimes, doing less often beats doing more.",
      goalLabel
        ? `Your goal (${goalLabel}) improves with consistency, not frequent changes.`
        : "Your goal improves with consistency, not frequent changes.",
    ],
    ifCreatedToday:
      regime === "Risk-off"
        ? "If created today, the plan would lean slightly more defensive — not to be safe, but to keep probability of success stable."
        : "If created today, the plan would emphasize gradual accumulation and discipline over timing.",
  };
}