export type InvestingDecisionImpactSegment = {
  key: string;
  samples: number;
  observedDeltaEur: number;
  alphaPct: number | null;
};

const STATE_LABELS: Record<string, string> = {
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

export function pickTopDecisionImpactSegment(segments?: InvestingDecisionImpactSegment[] | null) {
  return [...(segments || [])]
    .filter((segment) => Number(segment?.samples) > 0)
    .sort((left, right) => right.samples - left.samples || Math.abs(Number(right.alphaPct || 0)) - Math.abs(Number(left.alphaPct || 0)))[0] ?? null;
}

export function formatDecisionImpactStateLabel(value: unknown) {
  const key = String(value || "").trim().toLowerCase();
  return STATE_LABELS[key] || key.replaceAll("_", " ") || "decision state";
}

export function formatDecisionImpactActionLabel(value: unknown) {
  const key = String(value || "").trim().toUpperCase();
  return key === "BUY" || key === "SELL" || key === "HOLD" ? `${key} states` : key.replaceAll("_", " ").toLowerCase() || "action states";
}

export function getDecisionImpactSegmentDisplayPolicy(args: {
  segment?: InvestingDecisionImpactSegment | null;
  confidenceLevel?: "low" | "medium" | "high" | null;
}) {
  if (!args.segment) return { show: false, softened: false, showAlpha: false, showObservedDeltaEur: false, reason: "hidden" as const };
  const samples = Math.max(0, Number(args.segment.samples) || 0);
  const meaningfulAlpha = Number.isFinite(Number(args.segment.alphaPct)) && Math.abs(Number(args.segment.alphaPct)) >= 0.5;
  const meaningfulDelta = Number.isFinite(Number(args.segment.observedDeltaEur)) && Math.abs(Number(args.segment.observedDeltaEur)) >= 25;
  if (samples < 2 && !meaningfulAlpha && !meaningfulDelta) {
    return { show: false, softened: false, showAlpha: false, showObservedDeltaEur: false, reason: "hidden" as const };
  }
  if (args.confidenceLevel === "low") return { show: true, softened: true, showAlpha: false, showObservedDeltaEur: false, reason: "low_confidence" as const };
  if (samples < 2) return { show: true, softened: true, showAlpha: false, showObservedDeltaEur: false, reason: "not_enough_samples" as const };
  if (!meaningfulAlpha) return { show: true, softened: true, showAlpha: false, showObservedDeltaEur: false, reason: "weak_signal" as const };
  return { show: true, softened: false, showAlpha: true, showObservedDeltaEur: meaningfulDelta, reason: "normal" as const };
}

export function getDecisionImpactTrackRecordSummary(impact: any) {
  const confidence = String(impact?.attributionConfidence?.level || "low").toLowerCase();
  const alpha = Number(impact?.baseline?.alphaPct);
  if (confidence === "low") return "Track Record remains early";
  if (!Number.isFinite(alpha) || Math.abs(alpha) < 0.5) return "Track Record is building";
  return alpha > 0 ? "Track Record shows an observed edge vs the passive benchmark" : "Track Record is building";
}
