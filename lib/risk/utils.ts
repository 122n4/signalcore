// lib/risk/utils.ts
import { Candidate, Guardrail, RiskDriverRow, RiskSnapshot, StressResult } from "@/lib/core/types";

export function pct(x: number, digits = 1) {
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(digits)}%`;
}

export function severityFromImpact(pctImpact: number): "low" | "medium" | "high" {
  const loss = Math.abs(pctImpact);
  if (loss >= 0.18) return "high";
  if (loss >= 0.08) return "medium";
  return "low";
}

export function sortedDrivers(rows: RiskDriverRow[]) {
  return [...rows].sort((a, b) => b.riskContributionPct - a.riskContributionPct);
}

export function horizonScale(h: "1W" | "1M" | "3M" | "1Y") {
  // proxy scaling using sqrt(time). 1M baseline.
  if (h === "1W") return Math.sqrt(1 / 4);
  if (h === "1M") return 1;
  if (h === "3M") return Math.sqrt(3);
  return Math.sqrt(12);
}

export function scaleSnapshotByHorizon(s: RiskSnapshot, h: "1W" | "1M" | "3M" | "1Y"): RiskSnapshot {
  const k = horizonScale(h);
  return {
    volAnnual: s.volAnnual, // annual stays annual
    var95: Math.min(1, Math.max(0, s.var95 * k)),
    maxDrawdownEst: Math.min(1, Math.max(0, s.maxDrawdownEst * Math.min(1.3, k * 0.9))),
    concentrationTop5: s.concentrationTop5,
    fxExposurePct: s.fxExposurePct,
  };
}

export function scaleStressByHorizon(results: StressResult[], h: "1W" | "1M" | "3M" | "1Y") {
  const k = horizonScale(h);
  return results.map((r) => ({
    ...r,
    portfolioImpactPct: Math.max(-1, Math.min(1, r.portfolioImpactPct * Math.min(1.2, k))),
    topContributors: r.topContributors.map((c) => ({
      ...c,
      impactPct: Math.max(-1, Math.min(1, c.impactPct * Math.min(1.2, k))),
    })),
  }));
}

export function buildNarrative(snapshot: RiskSnapshot, drivers: RiskDriverRow[], guardrails: Guardrail[], stress: StressResult[]) {
  const top = sortedDrivers(drivers)[0];
  const breaches = guardrails.filter((g) => g.status === "breach");
  const nears = guardrails.filter((g) => g.status === "near");
  const worstStress = [...stress].sort((a, b) => a.portfolioImpactPct - b.portfolioImpactPct)[0];

  const parts: string[] = [];
  parts.push(`Primary risk driver: ${top?.name ?? "top exposures"}.`);
  parts.push(`Volatility: ${pct(snapshot.volAnnual, 1)} (annual proxy).`);
  parts.push(`Est. max drawdown: ${pct(snapshot.maxDrawdownEst, 1)}.`);

  if (worstStress) {
    parts.push(`Worst stress: ${worstStress.scenario} at ${pct(worstStress.portfolioImpactPct, 1)}.`);
  }

  if (breaches.length) parts.push(`⚠️ Breach: ${breaches.map(b => b.label).join(", ")}.`);
  else if (nears.length) parts.push(`Watch: near limits on ${nears.map(n => n.label).join(", ")}.`);
  else parts.push(`Guardrails: within band.`);

  return parts.join(" ");
}

export function fallbackCandidates(snapshot: RiskSnapshot): Candidate[] {
  const dd = snapshot.maxDrawdownEst;

  const base: Candidate[] = [
    {
      id: "fb_trim_concentration",
      action: "Reduce",
      label: "Trim top concentration",
      rationale:
        "High concentration increases tail risk. Trimming top positions reduces idiosyncratic drawdown while preserving broad exposure.",
      confidence: "medium",
      impact: { riskDown: "Medium", driftDown: "Low" },
      guardrailsCheck: { pass: true, notes: ["Focus on positions near max-size limit."] },
    },
    {
      id: "fb_rebalance_defensive",
      action: "Rebalance",
      label: "Increase defensive allocation",
      rationale:
        "Rotate a small slice into lower-volatility exposure to reduce expected drawdown without fully sacrificing growth.",
      confidence: "medium",
      impact: { riskDown: "Medium", returnUp: "Neutral" },
      guardrailsCheck: { pass: true },
    },
    {
      id: "fb_fx_reduce",
      action: "Hedge",
      label: "Reduce FX exposure (proxy)",
      rationale:
        "FX can dominate short-horizon variance. Consider hedging or reducing non-base currency exposure when it is not intentional.",
      confidence: "low",
      impact: { riskDown: "Low–Medium" },
      guardrailsCheck: { pass: true },
    },
  ];

  if (dd > 0.25) {
    base.unshift({
      id: "fb_dd_back_in_band",
      action: "Reduce",
      label: "Bring drawdown back into band",
      rationale:
        "Expected drawdown is above the guardrail. Reduce high-beta tilts first to restore risk compliance before seeking additional return.",
      confidence: "high",
      impact: { riskDown: "High", driftDown: "Medium" },
      guardrailsCheck: { pass: true, notes: ["Prioritizes policy compliance."] },
    });
  }

  return base;
}