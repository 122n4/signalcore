import type { VolatilityRegime } from "@/lib/engine/features";

export type CapitalProtectionInput = {
  drawdown_pct?: number | null;
  volatility_regime?: VolatilityRegime | null;
  execution_quality_score?: number | null;
  action_gate_status?: string | null;
  risk_policy_blocked?: boolean;
  correlation_risk_high?: boolean;
  thresholds?: {
    drawdown_pct?: number;
    execution_quality_min?: number;
  };
};

export type CapitalProtectionOutput = {
  protection_mode: boolean;
  recommended_action_bias: "defensive" | "neutral";
  size_multiplier: number;
  position_size_multiplier: number;
  restrict_aggressive_entries: boolean;
  reasons: string[];
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round3(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

export function computeCapitalProtection(input: CapitalProtectionInput): CapitalProtectionOutput {
  const ddThreshold = clamp(Number(input.thresholds?.drawdown_pct ?? 12), 4, 60);
  const qualityMin = clamp(Number(input.thresholds?.execution_quality_min ?? 60), 20, 95);

  const drawdownAbs = Math.abs(Math.min(0, Number(input.drawdown_pct ?? 0)));
  const executionQuality = Number(input.execution_quality_score);
  const regime = String(input.volatility_regime || "").toLowerCase() as VolatilityRegime | "";
  const gateStatus = String(input.action_gate_status || "").toLowerCase();

  const reasons: string[] = [];
  if (drawdownAbs >= ddThreshold) {
    reasons.push(`drawdown_exceeded_${ddThreshold}`);
  }
  if (regime === "high") {
    reasons.push("volatility_regime_high");
  }
  if (Number.isFinite(executionQuality) && executionQuality < qualityMin) {
    reasons.push(`execution_quality_below_${qualityMin}`);
  }
  if (gateStatus === "blocked" || gateStatus === "caution") {
    reasons.push(`action_gate_${gateStatus || "blocked"}`);
  }
  if (input.risk_policy_blocked) {
    reasons.push("risk_policy_blocked");
  }
  if (input.correlation_risk_high) {
    reasons.push("correlation_risk_high");
  }

  const active = reasons.length > 0;
  const severityScore =
    (drawdownAbs >= ddThreshold ? 2 : 0) +
    (regime === "high" ? 1 : 0) +
    (Number.isFinite(executionQuality) && executionQuality < qualityMin ? 1 : 0) +
    (gateStatus === "blocked" ? 2 : gateStatus === "caution" ? 1 : 0) +
    (input.risk_policy_blocked ? 2 : 0) +
    (input.correlation_risk_high ? 1 : 0);

  let sizeMultiplier = 1;
  if (active) {
    if (severityScore >= 4) sizeMultiplier = 0.4;
    else if (severityScore >= 2) sizeMultiplier = 0.55;
    else sizeMultiplier = 0.7;
  }

  return {
    protection_mode: active,
    recommended_action_bias: active ? "defensive" : "neutral",
    size_multiplier: round3(sizeMultiplier),
    position_size_multiplier: round3(sizeMultiplier),
    restrict_aggressive_entries: active,
    reasons,
  };
}
