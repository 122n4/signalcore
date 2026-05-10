import type { ProbabilityOutput } from "@/lib/engine/probabilityEngine";

export type OpportunityRankingInput = {
  probabilities: ProbabilityOutput[];
  exposureByAssetPct?: Record<string, number> | null;
  maxSinglePositionPct?: number | null;
};

export type RankedOpportunity = {
  asset: string;
  expected_value: number;
  expected_move: number;
  confidence: number;
  prob_up: number;
  prob_down: number;
  exposure_pct: number;
};

function safePct(x: unknown) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function round4(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10_000) / 10_000;
}

export function rankOpportunities(input: OpportunityRankingInput): RankedOpportunity[] {
  const probs = Array.isArray(input.probabilities) ? input.probabilities : [];
  const exposureByAssetPct = input.exposureByAssetPct ?? {};
  const maxSingle = Math.max(5, Math.min(80, Number(input.maxSinglePositionPct ?? 22)));

  const ranked = probs
    .map((p) => {
      const asset = String(p.asset || "").trim().toUpperCase();
      const exposure = safePct(exposureByAssetPct[asset]);
      const concentrationOverflow = Math.max(0, exposure - maxSingle);
      const exposurePenalty = Math.max(0, Math.min(0.65, exposure / 100));
      const concentrationPenalty = concentrationOverflow * 0.04;
      const adjustedExpectedValue = Number(p.expected_value) * (1 - exposurePenalty) - concentrationPenalty;
      return {
        asset,
        expected_value: round4(adjustedExpectedValue),
        expected_move: round4(Number(p.expected_move)),
        confidence: round4(Number(p.confidence)),
        prob_up: round4(Number(p.prob_up)),
        prob_down: round4(Number(p.prob_down)),
        exposure_pct: round4(exposure),
      };
    })
    .filter((x) => x.asset.length > 0);

  ranked.sort((a, b) => {
    if (b.expected_value !== a.expected_value) return b.expected_value - a.expected_value;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.asset.localeCompare(b.asset);
  });

  return ranked;
}
