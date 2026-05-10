import type { AutopilotMode } from "@/lib/signalcore/modes";

export type RiskPolicyLevel = "conservative" | "balanced" | "aggressive";
export type RiskPolicyStatus = "pass" | "warn" | "block" | "not_applicable";

export type RiskPolicy = {
  level: RiskPolicyLevel;
  mode: AutopilotMode;
  horizon: "short" | "medium" | "long" | null;
  maxSinglePositionPct: number;
  maxTop3ConcentrationPct: number;
  maxDrawdownPct: number;
  maxExposurePct: number;
  minPricingCoveragePct: number;
  maxDecisionPressure: number;
  maxMissingSymbols: number;
  allowHighSeverityLeak: boolean;
  source: "default" | "custom";
};

export type RiskPolicyBreach = {
  key:
    | "single_position_limit"
    | "top3_concentration_limit"
    | "drawdown_limit"
    | "exposure_limit"
    | "pricing_coverage_limit"
    | "missing_symbols_limit"
    | "decision_pressure_limit"
    | "high_severity_leak";
  message: string;
  actual: number | string | null;
  limit: number | string | null;
};

export type RiskPolicyWarning = {
  key: string;
  message: string;
};

export type RiskPolicyEvaluation = {
  status: RiskPolicyStatus;
  blocked: boolean;
  reasons: string[];
  nextStep: string;
  breaches: RiskPolicyBreach[];
  warnings: RiskPolicyWarning[];
  snapshot: {
    top1Pct: number | null;
    top3Pct: number | null;
    drawdownPct: number | null;
    exposurePct: number | null;
    coveragePct: number | null;
    pressureScore: number | null;
    missingSymbols: number;
    topLeakSeverity: string | null;
  };
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeObj(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function safeArr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRiskLevel(value: unknown): RiskPolicyLevel {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "conservative" || s === "low") return "conservative";
  if (s === "aggressive" || s === "high" || s === "growth") return "aggressive";
  return "balanced";
}

function normalizeHorizon(value: unknown): "short" | "medium" | "long" | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "short" || s === "s") return "short";
  if (s === "medium" || s === "mid" || s === "m") return "medium";
  if (s === "long" || s === "l") return "long";
  return null;
}

function readOverrideNumber(source: Record<string, any>, keys: string[]): number | null {
  for (const key of keys) {
    const n = toNumber(source[key]);
    if (n != null) return n;
  }
  return null;
}

function readOverrideBool(source: Record<string, any>, keys: string[]): boolean | null {
  for (const key of keys) {
    if (source[key] === true) return true;
    if (source[key] === false) return false;
    const s = String(source[key] ?? "").trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return null;
}

function modeAdjustments(mode: AutopilotMode) {
  void mode;
  return { single: 0, top3: 0, coverage: 0, pressure: 0, missing: 0 };
}

export function deriveRiskPolicy(args: {
  mode: AutopilotMode;
  riskProfile?: unknown;
  horizon?: unknown;
  userSettings?: Record<string, any> | null;
  plan?: Record<string, any> | null;
}): RiskPolicy {
  const level = normalizeRiskLevel(args.riskProfile);
  const horizon = normalizeHorizon(args.horizon);

  type BasePolicy = {
    maxSinglePositionPct: number;
    maxTop3ConcentrationPct: number;
    maxDrawdownPct: number;
    maxExposurePct: number;
    minPricingCoveragePct: number;
    maxDecisionPressure: number;
    maxMissingSymbols: number;
    allowHighSeverityLeak: boolean;
  };

  const baseByLevel: Record<RiskPolicyLevel, BasePolicy> = {
    conservative: {
      maxSinglePositionPct: 14,
      maxTop3ConcentrationPct: 42,
      maxDrawdownPct: 12,
      maxExposurePct: 82,
      minPricingCoveragePct: 88,
      maxDecisionPressure: 62,
      maxMissingSymbols: 0,
      allowHighSeverityLeak: false,
    },
    balanced: {
      maxSinglePositionPct: 22,
      maxTop3ConcentrationPct: 58,
      maxDrawdownPct: 20,
      maxExposurePct: 90,
      minPricingCoveragePct: 80,
      maxDecisionPressure: 74,
      maxMissingSymbols: 1,
      allowHighSeverityLeak: false,
    },
    aggressive: {
      maxSinglePositionPct: 30,
      maxTop3ConcentrationPct: 70,
      maxDrawdownPct: 30,
      maxExposurePct: 97,
      minPricingCoveragePct: 72,
      maxDecisionPressure: 84,
      maxMissingSymbols: 2,
      allowHighSeverityLeak: false,
    },
  };

  const base = baseByLevel[level];
  const adj = modeAdjustments(args.mode);
  const settings = safeObj(args.userSettings);
  const plan = safeObj(args.plan);
  const guardrails = safeObj(settings.guardrails);
  const planGuardrails = safeObj(plan.guardrails);
  const mergedOverrides = {
    ...guardrails,
    ...planGuardrails,
    ...settings,
  };

  const overrideSingle = readOverrideNumber(mergedOverrides, [
    "maxSinglePositionPct",
    "max_single_position_pct",
    "maxPositionPct",
    "max_position_pct",
  ]);
  const overrideTop3 = readOverrideNumber(mergedOverrides, [
    "maxTop3ConcentrationPct",
    "max_top3_concentration_pct",
    "maxTop3Pct",
    "max_top3_pct",
  ]);
  const overrideCoverage = readOverrideNumber(mergedOverrides, [
    "minPricingCoveragePct",
    "min_pricing_coverage_pct",
    "minCoveragePct",
    "min_coverage_pct",
  ]);
  const overrideDrawdown = readOverrideNumber(mergedOverrides, [
    "maxDrawdownPct",
    "max_drawdown_pct",
    "maxDrawdown",
    "max_drawdown",
  ]);
  const overrideExposure = readOverrideNumber(mergedOverrides, [
    "maxExposurePct",
    "max_exposure_pct",
    "maxExposure",
    "max_exposure",
  ]);
  const overridePressure = readOverrideNumber(mergedOverrides, [
    "maxDecisionPressure",
    "max_decision_pressure",
    "maxPressure",
    "max_pressure",
  ]);
  const overrideMissing = readOverrideNumber(mergedOverrides, [
    "maxMissingSymbols",
    "max_missing_symbols",
  ]);
  const overrideAllowHighLeak = readOverrideBool(mergedOverrides, [
    "allowHighSeverityLeak",
    "allow_high_severity_leak",
  ]);

  const maxSinglePositionPct = clamp(
    round(overrideSingle ?? base.maxSinglePositionPct + adj.single),
    8,
    60
  );
  const maxTop3ConcentrationPct = clamp(
    round(overrideTop3 ?? base.maxTop3ConcentrationPct + adj.top3),
    20,
    95
  );
  const minPricingCoveragePct = clamp(
    round(overrideCoverage ?? base.minPricingCoveragePct + adj.coverage),
    45,
    99
  );
  const maxDrawdownPct = clamp(
    round(overrideDrawdown ?? base.maxDrawdownPct),
    5,
    70
  );
  const maxExposurePct = clamp(
    round(overrideExposure ?? base.maxExposurePct),
    30,
    100
  );
  const maxDecisionPressure = clamp(
    round(overridePressure ?? base.maxDecisionPressure + adj.pressure),
    45,
    99
  );
  const maxMissingSymbols = clamp(
    Math.round(overrideMissing ?? base.maxMissingSymbols + adj.missing),
    0,
    25
  );
  const allowHighSeverityLeak = overrideAllowHighLeak ?? base.allowHighSeverityLeak;

  const hasCustom =
    overrideSingle != null ||
    overrideTop3 != null ||
    overrideCoverage != null ||
    overrideDrawdown != null ||
    overrideExposure != null ||
    overridePressure != null ||
    overrideMissing != null ||
    overrideAllowHighLeak != null;

  return {
    level,
    mode: args.mode,
    horizon,
    maxSinglePositionPct,
    maxTop3ConcentrationPct,
    maxDrawdownPct,
    maxExposurePct,
    minPricingCoveragePct,
    maxDecisionPressure,
    maxMissingSymbols,
    allowHighSeverityLeak,
    source: hasCustom ? "custom" : "default",
  };
}

export function evaluateRiskPolicy(args: {
  policy: RiskPolicy;
  diagnostics: Record<string, unknown> | null | undefined;
  pressureScore: number | null | undefined;
  maxDrawdownPct?: number | null | undefined;
  hasPlan: boolean;
  hasHoldings: boolean;
}): RiskPolicyEvaluation {
  const diagnostics = safeObj(args.diagnostics);
  const concentration = safeObj((diagnostics as any).concentration);
  const pricing = safeObj((diagnostics as any).pricing);
  const riskLeaks = safeArr((diagnostics as any).riskLeaks);
  const topLeak = safeObj(riskLeaks[0]);

  const top1Pct = toNumber((diagnostics as any).concentrationTop1Pct ?? concentration.top1Pct);
  const top3Pct = toNumber((diagnostics as any).concentrationTop3Pct ?? concentration.top3Pct);
  const cashDragPct = toNumber((diagnostics as any).cashDragPct);
  const drawdownRaw = toNumber(args.maxDrawdownPct);
  const drawdownPct = drawdownRaw == null ? null : Math.abs(Math.min(0, drawdownRaw));
  const coveragePct = toNumber(pricing.coveragePct);
  const pressureScore = toNumber(args.pressureScore);
  const missingSymbols = safeArr(pricing.missingSymbols).length;
  const topLeakSeverity = String(topLeak.severity ?? "").trim().toLowerCase() || null;
  const explicitExposurePct = toNumber(
    (diagnostics as any).exposurePct ??
    (diagnostics as any).exposure_pct ??
    (diagnostics as any).grossExposurePct ??
    (diagnostics as any).gross_exposure_pct ??
    safeObj((diagnostics as any).exposure).pct,
  );
  const derivedExposurePct = cashDragPct != null ? Math.max(0, Math.min(100, 100 - cashDragPct)) : null;
  const exposurePct =
    explicitExposurePct != null
      ? explicitExposurePct
      : derivedExposurePct;
  const singleHardLimit = args.policy.maxSinglePositionPct;
  const top3HardLimit = args.policy.maxTop3ConcentrationPct;
  const drawdownHardLimit = args.policy.maxDrawdownPct;
  const exposureHardLimit = args.policy.maxExposurePct;
  const hardCoverageFloor = args.policy.minPricingCoveragePct;
  const hardMissingLimit = args.policy.maxMissingSymbols;
  const hardPressureLimit = args.policy.maxDecisionPressure;

  const breaches: RiskPolicyBreach[] = [];
  const warnings: RiskPolicyWarning[] = [];

  if (!(args.hasPlan && args.hasHoldings)) {
    return {
      status: "not_applicable",
      blocked: false,
      reasons: ["Risk policy will be enforced after plan and holdings are available."],
      nextStep: "Complete plan and holdings setup to activate policy guardrails.",
      breaches,
      warnings,
      snapshot: {
        top1Pct,
        top3Pct,
        drawdownPct,
        exposurePct,
        coveragePct,
        pressureScore,
        missingSymbols,
        topLeakSeverity,
      },
    };
  }

  if (top1Pct != null && top1Pct > args.policy.maxSinglePositionPct) {
    if (top1Pct > singleHardLimit) {
      breaches.push({
        key: "single_position_limit",
        message: `Single-position cap breached (${round(top1Pct)}% > ${args.policy.maxSinglePositionPct}%).`,
        actual: round(top1Pct),
        limit: args.policy.maxSinglePositionPct,
      });
    } else {
      warnings.push({
        key: "single_position_above_limit",
        message: `Single-position risk is above the preferred cap (${round(top1Pct)}%).`,
      });
    }
  } else if (top1Pct != null && top1Pct > args.policy.maxSinglePositionPct * 0.92) {
    warnings.push({
      key: "single_position_near_limit",
      message: `Single-position risk is near cap (${round(top1Pct)}%).`,
    });
  }

  if (top3Pct != null && top3Pct > args.policy.maxTop3ConcentrationPct) {
    if (top3Pct > top3HardLimit) {
      breaches.push({
        key: "top3_concentration_limit",
        message: `Top-3 concentration cap breached (${round(top3Pct)}% > ${args.policy.maxTop3ConcentrationPct}%).`,
        actual: round(top3Pct),
        limit: args.policy.maxTop3ConcentrationPct,
      });
    } else {
      warnings.push({
        key: "top3_concentration_above_limit",
        message: `Top-3 concentration is above the preferred cap (${round(top3Pct)}%).`,
      });
    }
  } else if (top3Pct != null && top3Pct > args.policy.maxTop3ConcentrationPct * 0.92) {
    warnings.push({
      key: "top3_concentration_near_limit",
      message: `Top-3 concentration is near cap (${round(top3Pct)}%).`,
    });
  }

  if (drawdownPct != null && drawdownPct > args.policy.maxDrawdownPct) {
    if (drawdownPct > drawdownHardLimit) {
      breaches.push({
        key: "drawdown_limit",
        message: `Drawdown limit breached (${round(drawdownPct)}% > ${args.policy.maxDrawdownPct}%).`,
        actual: round(drawdownPct),
        limit: args.policy.maxDrawdownPct,
      });
    } else {
      warnings.push({
        key: "drawdown_above_limit",
        message: `Drawdown is above the preferred policy limit (${round(drawdownPct)}%).`,
      });
    }
  } else if (drawdownPct != null && drawdownPct > args.policy.maxDrawdownPct * 0.9) {
    warnings.push({
      key: "drawdown_near_limit",
      message: `Drawdown is near policy limit (${round(drawdownPct)}%).`,
    });
  }

  if (exposurePct != null && exposurePct > args.policy.maxExposurePct) {
    if (exposurePct > exposureHardLimit) {
      breaches.push({
        key: "exposure_limit",
        message: `Exposure limit breached (${round(exposurePct)}% > ${args.policy.maxExposurePct}%).`,
        actual: round(exposurePct),
        limit: args.policy.maxExposurePct,
      });
    } else {
      warnings.push({
        key: "exposure_above_limit",
        message: `Exposure is above the preferred policy limit (${round(exposurePct)}%).`,
      });
    }
  } else if (exposurePct != null && exposurePct > args.policy.maxExposurePct * 0.94) {
    warnings.push({
      key: "exposure_near_limit",
      message: `Exposure is near policy limit (${round(exposurePct)}%).`,
    });
  }

  if (coveragePct != null && coveragePct < args.policy.minPricingCoveragePct) {
    if (coveragePct < hardCoverageFloor) {
      breaches.push({
        key: "pricing_coverage_limit",
        message: `Pricing coverage below policy (${round(coveragePct)}% < ${args.policy.minPricingCoveragePct}%).`,
        actual: round(coveragePct),
        limit: args.policy.minPricingCoveragePct,
      });
    } else {
      warnings.push({
        key: "pricing_coverage_below_limit",
        message: `Pricing coverage is below the preferred policy floor (${round(coveragePct)}%).`,
      });
    }
  } else if (coveragePct != null && coveragePct < args.policy.minPricingCoveragePct + 5) {
    warnings.push({
      key: "pricing_coverage_near_limit",
      message: `Pricing coverage is close to policy floor (${round(coveragePct)}%).`,
    });
  }

  if (pressureScore != null && pressureScore > args.policy.maxDecisionPressure) {
    if (pressureScore > hardPressureLimit) {
      breaches.push({
        key: "decision_pressure_limit",
        message: `Decision pressure above policy (${round(pressureScore)} > ${args.policy.maxDecisionPressure}).`,
        actual: round(pressureScore),
        limit: args.policy.maxDecisionPressure,
      });
    } else {
      warnings.push({
        key: "decision_pressure_above_limit",
        message: `Decision pressure is above the preferred limit (${round(pressureScore)}).`,
      });
    }
  } else if (pressureScore != null && pressureScore > args.policy.maxDecisionPressure - 6) {
    warnings.push({
      key: "decision_pressure_near_limit",
      message: `Decision pressure is near policy limit (${round(pressureScore)}).`,
    });
  }

  if (missingSymbols > args.policy.maxMissingSymbols) {
    if (missingSymbols > hardMissingLimit) {
      breaches.push({
        key: "missing_symbols_limit",
        message: `Too many missing symbols (${missingSymbols} > ${args.policy.maxMissingSymbols}).`,
        actual: missingSymbols,
        limit: args.policy.maxMissingSymbols,
      });
    } else {
      warnings.push({
        key: "missing_symbols_above_limit",
        message: `Some symbols are still missing from the preferred coverage set (${missingSymbols}).`,
      });
    }
  }

  if (!args.policy.allowHighSeverityLeak && topLeakSeverity === "high") {
    breaches.push({
      key: "high_severity_leak",
      message: "High-severity leak active. Policy blocks execution.",
      actual: "high",
      limit: "no-high-severity-leaks",
    });
  }

  const status: RiskPolicyStatus = breaches.length > 0 ? "block" : warnings.length > 0 ? "warn" : "pass";
  const reasons = (breaches.length > 0 ? breaches.map((b) => b.message) : warnings.map((w) => w.message)).slice(0, 3);
  const nextStep =
    status === "block"
      ? "Reduce concentration/pressure and restore pricing coverage before executing."
      : status === "warn"
        ? "Execute with reduced size and complete full checklist proof."
        : "Risk policy is respected for this session.";

  return {
    status,
    blocked: status === "block",
    reasons,
    nextStep,
    breaches,
    warnings: warnings.slice(0, 3),
    snapshot: {
      top1Pct,
      top3Pct,
      drawdownPct,
      exposurePct,
      coveragePct,
      pressureScore,
      missingSymbols,
      topLeakSeverity,
    },
  };
}
