export type PlanningMode = "investing";
export type PlanningRiskPreset = "low" | "medium" | "high";
export type PlanningHorizonPreset = "3m" | "12m" | "3y" | "5y" | "10y";

export type StoredWealthPlan = {
  startingCapital?: number;
  monthlyContribution?: number;
  targetCapital?: number;
};

export type StoredGoalQuiz = {
  goalType?: string;
  riskProfile?: string;
  mode?: string;
  horizonMonths?: number;
  startingCapital?: number;
  monthlyContribution?: number;
  targetCapital?: number;
  annualReturn?: number;
  hasExistingHoldings?: boolean;
  verdict?: string;
};

export type GoalQuizSnapshot = Record<string, unknown> & {
  mode: PlanningMode;
  goalType: "Investing";
  riskProfile: "Conservative" | "Balanced" | "Aggressive";
  horizonMonths: number;
  startingCapital: number;
  monthlyContribution: number;
  targetCapital: number;
  annualReturn: number;
};

function readFiniteNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function riskPresetFromProfile(v: unknown): PlanningRiskPreset | null {
  const x = String(v || "").toLowerCase().trim();
  if (x === "conservative" || x === "low") return "low";
  if (x === "balanced" || x === "medium") return "medium";
  if (x === "aggressive" || x === "high") return "high";
  return null;
}

export function riskProfileFromPreset(v: PlanningRiskPreset): "Conservative" | "Balanced" | "Aggressive" {
  if (v === "low") return "Conservative";
  if (v === "high") return "Aggressive";
  return "Balanced";
}

export function horizonPresetFromMonths(v: unknown): PlanningHorizonPreset | null {
  const months = Number(v);
  if (!Number.isFinite(months) || months <= 0) return null;
  if (months <= 3) return "3m";
  if (months <= 12) return "12m";
  if (months <= 36) return "3y";
  if (months <= 60) return "5y";
  return "10y";
}

export function horizonFromMonthsForSettings(months: number): "Short" | "Medium" | "Long" {
  if (months < 12) return "Short";
  if (months < 48) return "Medium";
  return "Long";
}

export function goalTypeFromMode(mode: PlanningMode): "Investing" {
  void mode;
  return "Investing";
}

export function resolvePlanningSeed(args: {
  goalQuiz?: StoredGoalQuiz | null;
  wealthPlan?: StoredWealthPlan | null;
}) {
  const goalQuiz = args.goalQuiz ?? null;
  const wealthPlan = args.wealthPlan ?? null;
  const startingCapital = readFiniteNumber(wealthPlan?.startingCapital) ?? readFiniteNumber(goalQuiz?.startingCapital);
  const monthlyContribution = readFiniteNumber(wealthPlan?.monthlyContribution) ?? readFiniteNumber(goalQuiz?.monthlyContribution);
  const targetCapital = readFiniteNumber(wealthPlan?.targetCapital) ?? readFiniteNumber(goalQuiz?.targetCapital);
  const riskPreset = riskPresetFromProfile(goalQuiz?.riskProfile);
  const horizonPreset = horizonPresetFromMonths(goalQuiz?.horizonMonths);
  return {
    startingCapital,
    monthlyContribution,
    targetCapital,
    riskPreset,
    horizonPreset,
  };
}

export function buildGoalQuizSnapshot(args: {
  existingGoalQuiz?: Record<string, unknown> | null;
  mode: PlanningMode;
  riskPreset: PlanningRiskPreset;
  horizonMonths: number;
  startingCapital: number;
  monthlyContribution: number;
  targetCapital: number;
  annualReturn: number;
}): GoalQuizSnapshot {
  const existing = args.existingGoalQuiz && typeof args.existingGoalQuiz === "object" ? args.existingGoalQuiz : {};
  return {
    ...existing,
    mode: args.mode,
    goalType: goalTypeFromMode(args.mode),
    riskProfile: riskProfileFromPreset(args.riskPreset),
    horizonMonths: Math.max(1, Math.round(args.horizonMonths)),
    startingCapital: Math.round(Math.max(0, args.startingCapital)),
    monthlyContribution: Math.round(Math.max(0, args.monthlyContribution)),
    targetCapital: Math.round(Math.max(0, args.targetCapital)),
    annualReturn: Number(args.annualReturn.toFixed(2)),
  };
}

export function buildUserSettingsSyncPayload(args: {
  mode: PlanningMode;
  riskPreset: PlanningRiskPreset;
  horizonMonths: number;
  targetCapital: number;
}) {
  return {
    active_mode: args.mode,
    risk_profile: riskProfileFromPreset(args.riskPreset),
    horizon: horizonFromMonthsForSettings(args.horizonMonths),
    goal_type: goalTypeFromMode(args.mode),
    goal_target_value: Math.round(Math.max(0, args.targetCapital)),
  };
}
