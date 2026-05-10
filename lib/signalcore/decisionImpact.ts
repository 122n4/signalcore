type MoneyConfirmedLike = {
  today?: number | null;
  week?: number | null;
  total?: number | null;
};

type PerformanceLike = {
  hasData?: boolean | null;
  trackedDays?: number | null;
  benchmarkAnnualPct?: number | null;
  benchmark30dPct?: number | null;
  return30dPct?: number | null;
  alpha30dPct?: number | null;
  benchmarkTotalPct?: number | null;
  totalReturnPct?: number | null;
  alphaTotalPct?: number | null;
};

type ExecutionScoreLike = {
  score?: number | null;
  disciplinePct?: number | null;
  validationPct?: number | null;
};

type ExecutionEvidenceLike = {
  avgQuality14?: number | null;
  strongProofDays7?: number | null;
};

type SnapshotRowLike = {
  day_key?: string | null;
  total_eur?: number | null;
  created_at?: string | null;
  meta?: unknown;
};

export type DecisionImpactSegment = {
  key: string;
  samples: number;
  latestAt: string | null;
  observedDeltaEur: number;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  alphaPct: number | null;
};

export type DecisionImpact = {
  confirmedMoneyEur: {
    today: number;
    week: number;
    total: number;
  };
  baseline: {
    type: "mode_benchmark_v1";
    window: "30d";
    returnPct: number | null;
    portfolioReturnPct: number | null;
    alphaPct: number | null;
  };
  attributionConfidence: {
    level: "low" | "medium" | "high";
    score: number;
    reasons: string[];
  };
  narrative: {
    headline: string;
    detail: string;
  };
  segments: {
    byStateReason: DecisionImpactSegment[];
    byAction: DecisionImpactSegment[];
  };
};

export type DecisionSnapshotGroundwork = {
  decisionStateReason: string | null;
  decisionAction: "BUY" | "SELL" | "HOLD" | null;
  stabilitySource: "live" | "held" | null;
};

export type DecisionImpactSegmentDisplayPolicy = {
  show: boolean;
  softened: boolean;
  showAlpha: boolean;
  showObservedDeltaEur: boolean;
  reason: "normal" | "low_confidence" | "not_enough_samples" | "weak_signal" | "hidden";
};

const DECISION_STATE_LABELS: Record<string, string> = {
  no_plan: "plan setup",
  no_holdings: "build core",
  starter_warmup: "starter warmup",
  fatal_fallback: "fallback recovery",
  low_data_quality: "data quality repair",
  none: "steady state",
  action_gate: "execution gate",
  risk_policy: "risk policy",
  capital_protection: "capital protection",
  fallback: "fallback recovery",
};

function n(value: unknown, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function nullable(value: unknown) {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round2(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

function asString(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function isLowDataQualityLeakKey(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase();
  return (
    key === "pricing_low" ||
    key === "valuation_zero" ||
    key === "pricing_stale_high" ||
    key === "pricing_stale_med" ||
    key === "pricing_missing" ||
    key === "valuation_missing"
  );
}

export function pickTopDecisionImpactSegment(
  segments: DecisionImpactSegment[] | null | undefined,
): DecisionImpactSegment | null {
  const clean = (segments ?? []).filter((segment) => Number(segment?.samples) > 0);
  if (clean.length === 0) return null;
  return [...clean].sort((a, b) => {
    if (b.samples !== a.samples) return b.samples - a.samples;
    return Math.abs(Number(b.alphaPct ?? 0)) - Math.abs(Number(a.alphaPct ?? 0));
  })[0] ?? null;
}

export function formatDecisionImpactStateLabel(key: unknown) {
  const normalized = asString(key)?.toLowerCase() ?? "";
  if (!normalized) return "decision state";
  return DECISION_STATE_LABELS[normalized] ?? normalized.replace(/_/g, " ");
}

export function formatDecisionImpactActionLabel(key: unknown) {
  const normalized = asString(key)?.toUpperCase() ?? "";
  if (normalized === "BUY" || normalized === "SELL" || normalized === "HOLD") {
    return `${normalized} states`;
  }
  return normalized ? normalized.replace(/_/g, " ").toLowerCase() : "action states";
}

export function getDecisionImpactSegmentDisplayPolicy(args: {
  segment: DecisionImpactSegment | null | undefined;
  confidenceLevel: "low" | "medium" | "high" | null | undefined;
}): DecisionImpactSegmentDisplayPolicy {
  const segment = args.segment ?? null;
  if (!segment) {
    return {
      show: false,
      softened: false,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "hidden",
    };
  }

  const samples = Math.max(0, Number(segment.samples) || 0);
  const absAlpha = Math.abs(Number(segment.alphaPct ?? 0));
  const absObservedDeltaEur = Math.abs(Number(segment.observedDeltaEur ?? 0));
  const lowConfidence = args.confidenceLevel === "low";
  const hasStrongSamples = samples >= 2;
  const hasMeaningfulAlpha = Number.isFinite(Number(segment.alphaPct)) && absAlpha >= 0.5;
  const hasMeaningfulObservedDeltaEur = Number.isFinite(Number(segment.observedDeltaEur)) && absObservedDeltaEur >= 25;
  const show = hasStrongSamples || hasMeaningfulAlpha || hasMeaningfulObservedDeltaEur;

  if (!show) {
    return {
      show: false,
      softened: false,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "hidden",
    };
  }

  if (lowConfidence) {
    return {
      show: true,
      softened: true,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "low_confidence",
    };
  }

  if (!hasStrongSamples) {
    return {
      show: true,
      softened: true,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "not_enough_samples",
    };
  }

  if (!hasMeaningfulAlpha) {
    return {
      show: true,
      softened: true,
      showAlpha: false,
      showObservedDeltaEur: false,
      reason: "weak_signal",
    };
  }

  return {
    show: true,
    softened: false,
    showAlpha: true,
    showObservedDeltaEur: hasMeaningfulObservedDeltaEur,
    reason: "normal",
  };
}

export function getDecisionImpactTrackRecordSummary(impact: Pick<
  DecisionImpact,
  "baseline" | "attributionConfidence"
>) {
  const confidenceLevel = String(impact?.attributionConfidence?.level || "low").toLowerCase();
  const alphaPct = Number(impact?.baseline?.alphaPct);
  const hasMeaningfulAlpha = Number.isFinite(alphaPct) && Math.abs(alphaPct) >= 0.5;
  if (confidenceLevel === "low") return "Track Record remains early";
  if (!hasMeaningfulAlpha) return "Track Record is building";
  if (alphaPct > 0) return "Track Record shows an observed edge vs the passive benchmark";
  return "Track Record is building";
}

function compoundPct(items: number[]) {
  if (items.length === 0) return null;
  const factor = items.reduce((acc, item) => acc * (1 + item / 100), 1);
  return round2((factor - 1) * 100);
}

function benchmarkPctForSamples(benchmarkAnnualPct: number | null, samples: number) {
  if (benchmarkAnnualPct == null || samples <= 0) return null;
  return round2(((1 + benchmarkAnnualPct / 100) ** (samples / 365) - 1) * 100);
}

function buildImpactSegments(args: {
  recentSnapshots?: SnapshotRowLike[] | null;
  benchmarkAnnualPct?: number | null;
}) {
  const cleanDesc = (args.recentSnapshots ?? [])
    .map((row) => ({
      day_key: asString(row?.day_key),
      created_at: asString(row?.created_at),
      total_eur: nullable(row?.total_eur),
      meta: row?.meta ?? null,
    }))
    .filter((row) => row.total_eur != null && row.total_eur >= 0);

  if (cleanDesc.length < 2) {
    return {
      byStateReason: [] as DecisionImpactSegment[],
      byAction: [] as DecisionImpactSegment[],
    };
  }

  const cleanAsc = [...cleanDesc].reverse();
  const benchmarkAnnualPct = nullable(args.benchmarkAnnualPct);
  const byStateReason = new Map<
    string,
    {
      latestAt: string | null;
      deltas: number[];
      returns: number[];
    }
  >();
  const byAction = new Map<
    string,
    {
      latestAt: string | null;
      deltas: number[];
      returns: number[];
    }
  >();

  for (let i = 0; i < cleanAsc.length - 1; i += 1) {
    const current = cleanAsc[i];
    const next = cleanAsc[i + 1];
    const currentTotal = current.total_eur;
    const nextTotal = next.total_eur;
    if (currentTotal == null || nextTotal == null || currentTotal <= 0) continue;

    const lifecycle = asRecord(asRecord(current.meta)?.decisionLifecycle);
    const decisionStateReason = asString(lifecycle?.decisionStateReason);
    const decisionAction = asString(lifecycle?.decisionAction);
    const latestAt = next.created_at ?? next.day_key ?? current.created_at ?? current.day_key;
    const deltaEur = nextTotal - currentTotal;
    const returnPct = ((nextTotal - currentTotal) / currentTotal) * 100;

    if (decisionStateReason) {
      const entry = byStateReason.get(decisionStateReason) ?? {
        latestAt,
        deltas: [],
        returns: [],
      };
      entry.latestAt = entry.latestAt && latestAt ? (entry.latestAt > latestAt ? entry.latestAt : latestAt) : entry.latestAt ?? latestAt;
      entry.deltas.push(deltaEur);
      entry.returns.push(returnPct);
      byStateReason.set(decisionStateReason, entry);
    }

    if (decisionAction) {
      const entry = byAction.get(decisionAction) ?? {
        latestAt,
        deltas: [],
        returns: [],
      };
      entry.latestAt = entry.latestAt && latestAt ? (entry.latestAt > latestAt ? entry.latestAt : latestAt) : entry.latestAt ?? latestAt;
      entry.deltas.push(deltaEur);
      entry.returns.push(returnPct);
      byAction.set(decisionAction, entry);
    }
  }

  const toSegments = (
    source: Map<
      string,
      {
        latestAt: string | null;
        deltas: number[];
        returns: number[];
      }
    >,
  ) =>
    Array.from(source.entries())
      .map(([key, entry]) => {
        const samples = entry.returns.length;
        const portfolioReturnPct = compoundPct(entry.returns);
        const benchmarkReturnPct = benchmarkPctForSamples(benchmarkAnnualPct, samples);
        return {
          key,
          samples,
          latestAt: entry.latestAt,
          observedDeltaEur: round2(entry.deltas.reduce((sum, value) => sum + value, 0)) ?? 0,
          portfolioReturnPct,
          benchmarkReturnPct,
          alphaPct:
            portfolioReturnPct != null && benchmarkReturnPct != null
              ? round2(portfolioReturnPct - benchmarkReturnPct)
              : null,
        };
      })
      .filter((segment) => segment.samples > 0)
      .sort((a, b) => {
        if (b.samples !== a.samples) return b.samples - a.samples;
        return String(b.latestAt || "").localeCompare(String(a.latestAt || ""));
      })
      .slice(0, 6);

  return {
    byStateReason: toSegments(byStateReason),
    byAction: toSegments(byAction),
  };
}

export function deriveDecisionSnapshotGroundwork(snapshot: unknown): DecisionSnapshotGroundwork {
  const root = asRecord(snapshot);
  const daily = asRecord(root?.daily);
  const derived = asRecord(root?.derived);
  const plan = asRecord(root?.plan);
  const portfolio = asRecord(root?.portfolio);
  const decisionUi = asRecord(root?.decisionUi);
  const envelope = asRecord(daily?.decisionEnvelope);
  const workflow = asRecord(envelope?.workflowDecision);
  const stance = asRecord(envelope?.portfolioStance);
  const support = asRecord(envelope?.support);
  const precedence = asRecord(support?.precedence);
  const pricing = asRecord(derived?.pricing);
  const diagnostics = asRecord(derived?.diagnostics);
  const topLeak = Array.isArray(diagnostics?.riskLeaks) ? asRecord((diagnostics?.riskLeaks as any[])[0]) : null;

  const hasPlan =
    typeof derived?.hasPlan === "boolean"
      ? Boolean(derived.hasPlan)
      : Boolean(plan?.id) || Boolean(plan?.is_active) || Boolean(plan?.active);
  const holdings =
    Array.isArray((portfolio as any)?.holdings)
      ? ((portfolio as any).holdings as any[])
      : Array.isArray((portfolio as any)?.items)
        ? ((portfolio as any).items as any[])
        : [];
  const hasHoldings = typeof derived?.hasHoldings === "boolean" ? Boolean(derived.hasHoldings) : holdings.length > 0;
  const starterWarmupActive = asBoolean((daily as any)?.starterWarmup?.active);
  const branch = asString(envelope?.branch) || "success";
  const coveragePct =
    nullable(pricing?.coveragePct) ??
    nullable((portfolio as any)?.valuation?.liveCoveragePct) ??
    nullable((portfolio as any)?.valuation?.coveragePct);
  const topLeakKey = asString(derived?.topLeakKey) || asString(topLeak?.key);
  const uiStateReason = asString(decisionUi?.stateReason);
  const uiAction = asString(decisionUi?.action);
  const uiStabilitySource = asString(decisionUi?.stabilitySource);

  let decisionStateReason = uiStateReason;
  if (!decisionStateReason) {
    if (!hasPlan) {
      decisionStateReason = "no_plan";
    } else if (!hasHoldings) {
      decisionStateReason = "no_holdings";
    } else if (starterWarmupActive) {
      decisionStateReason = "starter_warmup";
    } else if (branch === "fatal_fallback") {
      decisionStateReason = "fatal_fallback";
    } else if ((coveragePct != null && coveragePct < 80) || isLowDataQualityLeakKey(topLeakKey)) {
      decisionStateReason = "low_data_quality";
    } else {
      decisionStateReason = asString(precedence?.override) || "none";
    }
  }

  let decisionAction: "BUY" | "SELL" | "HOLD" | null =
    uiAction === "BUY" || uiAction === "SELL" || uiAction === "HOLD" ? uiAction : null;
  if (!decisionAction) {
    if (!hasPlan) {
      decisionAction = "HOLD";
    } else if (!hasHoldings) {
      decisionAction = "BUY";
    } else if (starterWarmupActive || branch === "fatal_fallback" || decisionStateReason === "low_data_quality") {
      decisionAction = "HOLD";
    } else {
      const workflowType = asString(workflow?.type);
      const portfolioDecision = asString(stance?.decision);
      const allowExecution = precedence?.allowExecution !== false;
      const executionCategory = asString((daily as any)?.decisionEnvelope?.executionInstruction?.category);
      const protective =
        workflowType === "REDUCE" ||
        workflowType === "EXIT" ||
        portfolioDecision === "REDUCE" ||
        (portfolioDecision === "AVOID" && executionCategory === "PROTECT");
      if (!allowExecution) {
        decisionAction = protective ? "SELL" : "HOLD";
      } else if (
        workflowType === "ADD" ||
        workflowType === "ENTER" ||
        workflowType === "EXECUTE_BROKER" ||
        portfolioDecision === "BUY"
      ) {
        decisionAction = "BUY";
      } else if (protective) {
        decisionAction = "SELL";
      } else {
        decisionAction = "HOLD";
      }
    }
  }

  const stabilitySource =
    uiStabilitySource === "live" || uiStabilitySource === "held" ? uiStabilitySource : "live";

  return {
    decisionStateReason: decisionStateReason || null,
    decisionAction,
    stabilitySource,
  };
}

export function computeDecisionImpact(args: {
  moneyConfirmed?: MoneyConfirmedLike | null;
  performance?: PerformanceLike | null;
  executionScore?: ExecutionScoreLike | null;
  executionEvidence?: ExecutionEvidenceLike | null;
  coveragePct?: number | null;
  recentSnapshots?: SnapshotRowLike[] | null;
}): DecisionImpact {
  const money = args.moneyConfirmed ?? {};
  const performance = args.performance ?? {};
  const executionScore = args.executionScore ?? {};
  const executionEvidence = args.executionEvidence ?? {};
  const coveragePct = nullable(args.coveragePct);

  const trackedDays = Math.max(0, n(performance.trackedDays, 0));
  const hasData = Boolean(performance.hasData) || trackedDays >= 2;
  const benchmark30dPct = round2(nullable(performance.benchmark30dPct));
  const return30dPct = round2(nullable(performance.return30dPct));
  const alpha30dPct = round2(nullable(performance.alpha30dPct));
  const benchmarkTotalPct = round2(nullable(performance.benchmarkTotalPct));
  const totalReturnPct = round2(nullable(performance.totalReturnPct));
  const alphaTotalPct = round2(nullable(performance.alphaTotalPct));
  const baselineReturnPct = benchmark30dPct ?? benchmarkTotalPct;
  const baselinePortfolioPct = return30dPct ?? totalReturnPct;
  const baselineAlphaPct = alpha30dPct ?? alphaTotalPct;
  const segments = buildImpactSegments({
    recentSnapshots: args.recentSnapshots,
    benchmarkAnnualPct: nullable(performance.benchmarkAnnualPct),
  });

  const proofQuality = nullable(executionEvidence.avgQuality14);
  const strongProofDays7 = Math.max(0, n(executionEvidence.strongProofDays7, 0));
  const disciplinePct = nullable(executionScore.disciplinePct);
  const executionQuality = nullable(executionScore.score);

  let confidenceScore = 10;
  const reasons: string[] = [];

  if (trackedDays >= 30) {
    confidenceScore += 28;
    reasons.push("enough_tracked_days");
  } else if (trackedDays >= 14) {
    confidenceScore += 18;
    reasons.push("moderate_tracking_window");
  } else if (trackedDays >= 7) {
    confidenceScore += 10;
    reasons.push("early_tracking_window");
  } else {
    reasons.push("short_tracking_window");
  }

  if (proofQuality != null && proofQuality >= 75) {
    confidenceScore += 18;
    reasons.push("strong_proof_quality");
  } else if (proofQuality != null && proofQuality >= 60) {
    confidenceScore += 10;
    reasons.push("moderate_proof_quality");
  } else {
    reasons.push("weak_proof_quality");
  }

  if (strongProofDays7 >= 3) {
    confidenceScore += 10;
    reasons.push("enough_strong_proof_days");
  } else if (strongProofDays7 <= 1) {
    reasons.push("limited_strong_proof_history");
  }

  if (disciplinePct != null && disciplinePct >= 75) {
    confidenceScore += 16;
    reasons.push("consistent_execution_history");
  } else if (disciplinePct != null && disciplinePct >= 60) {
    confidenceScore += 8;
    reasons.push("building_execution_history");
  } else if (executionQuality != null && executionQuality < 55) {
    reasons.push("weak_execution_discipline");
  }

  if (coveragePct != null && coveragePct >= 90) {
    confidenceScore += 18;
    reasons.push("high_pricing_coverage");
  } else if (coveragePct != null && coveragePct >= 80) {
    confidenceScore += 10;
    reasons.push("acceptable_pricing_coverage");
  } else {
    reasons.push("low_pricing_coverage");
  }

  if (!hasData) {
    reasons.push("not_enough_baseline_data");
  } else {
    confidenceScore += 6;
  }

  const score = clamp(confidenceScore);
  const level = score >= 75 ? "high" : score >= 45 ? "medium" : "low";

  let headline = "Not enough evidence yet";
  let detail = "Syntrake is still collecting enough tracked history to compare the current path with the passive baseline.";

  if (baselineAlphaPct != null && hasData) {
    if (baselineAlphaPct > 1) {
      headline = "Current edge is above the passive baseline.";
      detail = `Over ${baselineReturnPct != null ? "30d" : "the tracked window"}, portfolio return is ${baselinePortfolioPct?.toFixed(2) ?? "--"}% versus ${baselineReturnPct?.toFixed(2) ?? "--"}% for the passive benchmark.`;
    } else if (baselineAlphaPct < -1) {
      headline = "Current path is trailing the passive baseline.";
      detail = `Recent return is ${baselinePortfolioPct?.toFixed(2) ?? "--"}% versus ${baselineReturnPct?.toFixed(2) ?? "--"}% for the passive benchmark, so attribution should stay cautious while more evidence builds.`;
    } else {
      headline = "Current edge is close to the passive baseline.";
      detail = `Recent return is ${baselinePortfolioPct?.toFixed(2) ?? "--"}% versus ${baselineReturnPct?.toFixed(2) ?? "--"}% for the passive benchmark, so edge is still within a narrow range.`;
    }
  }

  return {
    confirmedMoneyEur: {
      today: Math.round(n(money.today, 0)),
      week: Math.round(n(money.week, 0)),
      total: Math.round(n(money.total, 0)),
    },
    baseline: {
      type: "mode_benchmark_v1",
      window: "30d",
      returnPct: baselineReturnPct,
      portfolioReturnPct: baselinePortfolioPct,
      alphaPct: baselineAlphaPct,
    },
    attributionConfidence: {
      level,
      score,
      reasons: unique(reasons).slice(0, 5),
    },
    narrative: {
      headline,
      detail,
    },
    segments,
  };
}
