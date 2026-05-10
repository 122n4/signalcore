// lib/signalcore/engine/index.ts
import type { EngineInput, EngineOutput } from "./types";
import { safeNumber } from "./utils";
import { runDiagnostics } from "./diagnostics";
import { buildCandidates, buildNBA } from "./actions";
import { buildProof } from "./proof";
import { computeAutopilotScore } from "./scoring";
import { computeConfirmedMoney } from "./confirmedMoney";

export function runEngine(input: EngineInput): EngineOutput {
  const plan = input.plan ?? null;
  const hasPlan = !!plan?.id || !!plan?.is_active || !!plan?.active;

  const holdings = Array.isArray(input.portfolio?.items) ? input.portfolio.items : [];
  const hasHoldings = holdings.length > 0;

  const cashEur = safeNumber(input.portfolio?.cashEur, 0) || 0;

  const missingValuesCount = holdings.filter((h) => safeNumber(h?.valueEur, null) === null).length;

  const diagnostics = runDiagnostics({
    mode: input.mode,
    hasPlan,
    holdings: holdings.map((h) => ({ symbol: h.symbol, valueEur: h.valueEur })),
    cashEur,
  });

  const blocking = diagnostics.filter((d) => d.severity === 3);
  const warnings = diagnostics.filter((d) => d.severity === 2);

  const opportunities = buildCandidates({
    mode: input.mode,
    hasPlan,
    hasHoldings,
    holdingsCount: holdings.length,
    missingValuesCount,
    cashEur,
  });

  const nba = buildNBA({
    mode: input.mode,
    hasPlan,
    hasHoldings,
    doneToday: input.doneToday,
    candidates: opportunities,
    starterPackCount: input.starterPack?.length ?? 0,
  });

  // Pressure (0..1)
  let pressure = 0.22;
  if (!hasPlan) pressure = 0.55;
  else if (hasPlan && !hasHoldings) pressure = 0.42;
  else if (blocking.length > 0) pressure = 0.5;
  else if (warnings.length > 0) pressure = 0.3;
  else if (opportunities.length > 0 && opportunities[0]?.type !== "review") pressure = 0.28;

  const { score, moves } = computeAutopilotScore({
    hasPlan,
    hasHoldings,
    doneToday: input.doneToday,
    streak: input.streak ?? 0,
    diagnosticsCount: diagnostics.length,
    blockingCount: blocking.length,
    opportunitiesCount: opportunities.length,
  });

  const proof = buildProof({
    hasPlan,
    hasHoldings,
    doneToday: input.doneToday,
    diagnosticsCount: diagnostics.length,
    blockingCount: blocking.length,
    candidatesCount: opportunities.length,
    streak: input.streak ?? 0,
  });

  const moneyConfirmed = computeConfirmedMoney({ rows: input.recentSnapshots });

  // Meaning: 1 frase, sempre.
  const meaning = !hasPlan
    ? "Activate a plan to arm Safety Brain."
    : !hasHoldings
      ? "Add holdings to unlock drift + protection."
      : blocking.length > 0
        ? "A risk leak is blocking compounding until fixed."
        : opportunities.length > 0 && opportunities[0]?.type !== "review"
          ? "A small fix today may improve plan fit."
          : "Coherence looks stable. Holding is a valid decision.";

  const topRiskLeak = blocking[0]?.title || warnings[0]?.title || "None detected.";

  return {
    daily: {
      proof,
      meaning,
      nba,
      opportunities,
      starterPack: input.starterPack ?? [],
      lastSnapshotAt: input.lastSnapshotAt ?? null,
    },
    derived: {
      regime: "neutral",
      pressure,
      odds: hasPlan && hasHoldings ? 0.64 : 0.58,
      autopilotScore: score,
      scoreMoves: moves.slice(0, 6),
      diagnostics,
      topRiskLeak,
      moneyConfirmed,
      doneToday: input.doneToday,
      streak: input.streak ?? 0,
      lastSnapshotAt: input.lastSnapshotAt ?? null,
    },
  };
}