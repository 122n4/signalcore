// lib/planning/engine.ts
import { Bucket, Plan, QualityReport, PacingReport, Regime } from "@/lib/planning/types";

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function sumTargets(buckets: Bucket[]) {
  return buckets.reduce((acc, b) => acc + (Number(b.targetPct) || 0), 0);
}

export function computeQuality(plan: Plan): QualityReport {
  const issues: string[] = [];
  const fixes: string[] = [];
  const warnings: string[] = [];

  // Goal completeness
  if (!plan.name?.trim()) {
    issues.push("Plan name is missing.");
    fixes.push("Give the plan a clear name (e.g., 'Goal 2030 — Balanced').");
  }

  if (plan.goalType === "target_value") {
    if (!plan.targetValue || plan.targetValue <= 0) issues.push("Target value is missing.");
    if (!plan.targetDate) issues.push("Target date is missing.");
    if (!plan.startingValue || plan.startingValue <= 0) warnings.push("Starting value is missing (pacing will be approximate).");
  }
  if (plan.goalType === "annual_return" && (!plan.annualReturnPct || plan.annualReturnPct <= 0)) issues.push("Annual return target is missing.");
  if (plan.goalType === "monthly_income" && (!plan.monthlyIncome || plan.monthlyIncome <= 0)) issues.push("Monthly income target is missing.");
  if (plan.goalType === "preservation" && (!plan.preservationMaxLossPct || plan.preservationMaxLossPct <= 0)) issues.push("Max loss target is missing.");

  // Buckets
  const s = sumTargets(plan.buckets);
  if (Math.abs(s - 100) > 0.5) {
    issues.push(`Bucket targets must sum to 100% (currently ${s.toFixed(1)}%).`);
    fixes.push("Adjust bucket targets so they sum to 100%.");
  }
  for (const b of plan.buckets) {
    if (b.minPct > b.targetPct || b.targetPct > b.maxPct) {
      issues.push(`${b.name}: min/target/max are inconsistent.`);
      fixes.push(`Fix ${b.name} band: ensure min ≤ target ≤ max.`);
    }
    if (b.riskBudget <= 0) {
      warnings.push(`${b.name}: risk budget is 0 (may block meaningful sizing).`);
      fixes.push(`Set a realistic risk budget for ${b.name}.`);
    }
  }

  // Guardrails presence (institutional baseline)
  const g = plan.guardrails ?? {};
  if (g.maxDrawdownPct == null) fixes.push("Add max drawdown guardrail (e.g., 25%).");
  if (g.maxSinglePositionPct == null) fixes.push("Add max single position guardrail (e.g., 10%).");
  if (g.maxTop5ConcentrationPct == null) fixes.push("Add top-5 concentration guardrail (e.g., 40%).");
  if (g.maxFxExposurePct == null) fixes.push("Add FX exposure guardrail (e.g., 60%).");
  if (g.turnoverMonthlyPct == null) fixes.push("Add turnover cap (e.g., 30%/month).");

  // Policy presence
  const p = plan.policy ?? { allowedUniverse: "", forbidden: "", complexityLevel: "low", tradeFrequency: "low" };
  if (!p.allowedUniverse?.trim()) fixes.push("Define allowed universe (ETFs, equities, bonds, etc.).");
  if (!p.forbidden?.trim()) fixes.push("Define forbidden actions (leverage, penny stocks, etc.).");

  // Playbooks baseline
  if (!plan.playbooks?.length) {
    warnings.push("No regime playbooks defined.");
    fixes.push("Add at least 2 regime rules (e.g., High-vol → reduce risk, Bear → add hedge).");
  }

  // Score
  let score = 100;
  score -= issues.length * 12;
  score -= warnings.length * 5;
  score -= Math.min(20, fixes.length * 1); // “missing pro polish”
  score = clamp(score, 0, 100);

  const level: QualityReport["level"] =
    score >= 90 ? "excellent" : score >= 75 ? "high" : score >= 55 ? "medium" : "low";

  return { score, level, issues, fixes: Array.from(new Set(fixes)).slice(0, 12), warnings };
}

export function computeRequiredAnnualReturn(plan: Plan): number | undefined {
  if (plan.goalType !== "target_value") return undefined;
  if (!plan.targetValue || !plan.targetDate) return undefined;

  const start = plan.currentValue ?? plan.startingValue;
  if (!start || start <= 0) return undefined;

  const now = new Date();
  const td = new Date(plan.targetDate + "T00:00:00");
  const years = (td.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years <= 0.1) return undefined;

  // crude required CAGR ignoring contributions
  const cagr = Math.pow(plan.targetValue / start, 1 / years) - 1;
  return clamp(cagr * 100, -50, 200);
}

export function computePacing(plan: Plan): PacingReport {
  // v1 pacing heuristic
  if (plan.goalType === "target_value") {
    const req = computeRequiredAnnualReturn(plan);
    if (req == null) return { status: "unknown", note: "Add starting/current value to compute pacing." };
    // without actual performance, infer status from risk posture vs required return
    const postureBias = plan.riskPosture === "conservative" ? -6 : plan.riskPosture === "balanced" ? 0 : +6;
    const effective = req - postureBias;

    if (effective > 14) return { requiredAnnualReturnPct: req, status: "behind", note: "Required return is high. Consider higher contributions or a more return-seeking posture (within guardrails)." };
    if (effective < 6) return { requiredAnnualReturnPct: req, status: "ahead", note: "Required return is modest. You can prioritize drawdown control and stability." };
    return { requiredAnnualReturnPct: req, status: "on_track", note: "Goal pacing looks reasonable. Maintain discipline and keep drift/guardrails in band." };
  }

  if (plan.goalType === "annual_return") {
    const r = plan.annualReturnPct ?? 0;
    if (r <= 0) return { status: "unknown", note: "Set an annual return target." };
    if (r > 16) return { status: "behind", note: "High target. Ensure your policy allows sufficient risk and the guardrails are realistic." };
    return { status: "on_track", note: "Target is within a typical long-term range. Focus on guardrails + drift discipline." };
  }

  if (plan.goalType === "monthly_income") {
    return { status: "on_track", note: "Income goals require a yield and cashflow policy. Ensure universe + guardrails support it." };
  }

  if (plan.goalType === "preservation") {
    return { status: "on_track", note: "Preservation mode: protect drawdowns first, then opportunistically seek return." };
  }

  return { status: "unknown", note: "Set a goal to enable pacing." };
}

export function defaultPlaybooks(): { id: string; enabled: boolean; whenRegime: Regime; action: string }[] {
  return [
    { id: "pb_highvol", enabled: true, whenRegime: "high_vol", action: "Reduce risk posture by 1 notch, increase Hedge bucket within max band, lower turnover." },
    { id: "pb_bear", enabled: true, whenRegime: "bear", action: "Prioritize drawdown reduction: trim concentration, enforce FX cap, keep Cash buffer." },
    { id: "pb_bull", enabled: true, whenRegime: "bull", action: "Allow Satellite to operate within band; keep drift tight; avoid overtrading." },
  ];
}