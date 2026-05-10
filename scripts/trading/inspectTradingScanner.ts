import {
  buildTradingLightScannerInputs,
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";

function computeWeightedEdge(input: Awaited<ReturnType<typeof buildTradingLightScannerInputs>>[number]) {
  const scores = input.decisionCore.weighting.weightedScores;

  return Math.round(
    scores.setup * 0.16 +
      scores.quality * 0.16 +
      scores.clarity * 0.16 +
      scores.environment * 0.16 +
      scores.maturity * 0.12 +
      scores.opportunityWindow * 0.12 +
      scores.momentum * 0.12 -
      scores.conflictPenalty * 0.1 +
      scores.confluenceBonus,
  );
}

async function main() {
  const asOfArg = process.argv[2];
  const asOf = asOfArg ? new Date(asOfArg).toISOString() : new Date().toISOString();
  const inputs = await buildTradingLightScannerInputs({
    asOf,
    forceRefresh: true,
    includeInactiveMarkets: true,
  });
  const diagnostics = await inspectTradingLightScanner({
    asOf,
    liveFetch: true,
  });
  const diagnosticByInstrument = new Map(
    diagnostics.map((diagnostic) => [diagnostic.instrument, diagnostic]),
  );
  const entries = inputs.map((input) => composeTradingWatchlistEntry(input));

  const byExecutionStatus = Object.fromEntries(
    ["allowed", "caution", "restricted"].map((status) => [
      status,
      entries.filter((entry) => entry.executionStatus === status).length,
    ]),
  );

  const byCurrentState = Object.fromEntries(
    Array.from(new Set(entries.map((entry) => entry.currentState)))
      .sort()
      .map((state) => [state, entries.filter((entry) => entry.currentState === state).length]),
  );

  const details = entries.map((entry, index) => ({
    scannerSource: inputs[index]?.scannerSnapshot?.source ?? null,
    scannerSnapshotAt: inputs[index]?.snapshot.snapshotAt ?? null,
    scannerSnapshotAgeMs: inputs[index]?.scannerSnapshot?.snapshotAgeMs ?? null,
    scannerActionableFreshness:
      inputs[index]?.scannerSnapshot?.actionableFreshness ?? null,
    scannerStaleReason: inputs[index]?.scannerSnapshot?.staleReason ?? null,
    scannerProviderError: inputs[index]?.scannerSnapshot?.providerError ?? null,
    scannerDataSymbol: inputs[index]?.scannerSnapshot?.dataSymbol ?? null,
    scannerDataRelation: inputs[index]?.scannerSnapshot?.dataRelation ?? null,
    diagnostic: diagnosticByInstrument.get(entry.instrument) ?? null,
    instrument: entry.instrument,
    executionStatus: entry.executionStatus,
    currentState: entry.currentState,
    session: entry.contextSummary.sessionLabel,
    marketOpen: entry.contextSummary.marketOpen,
    headline: entry.currentHeadline,
    nextStep: entry.liveDecision.nextDisciplineStep ?? null,
    reasons: entry.liveDecision.reasons.slice(0, 3),
    setupType: inputs[index]?.setupCore.setup.type ?? null,
    maturityState: inputs[index]?.setupCore.maturity.state ?? null,
    maturityScore: inputs[index]?.setupCore.maturity.score ?? null,
    windowState: inputs[index]?.setupCore.opportunityWindow.state ?? null,
    windowScore: inputs[index]?.setupCore.opportunityWindow.score ?? null,
    qualityScore: inputs[index]?.setupCore.quality.score ?? null,
    structureState: inputs[index]?.market.structure.state ?? null,
    structureDirection: inputs[index]?.market.structure.direction ?? null,
    regimeState: inputs[index]?.market.regime.state ?? null,
    momentumState: inputs[index]?.market.momentum.state ?? null,
    momentumDirection: inputs[index]?.market.momentum.direction ?? null,
    liquidityState: inputs[index]?.market.liquidity.state ?? null,
    clarityLevel: inputs[index]?.decisionCore.clarity.level ?? null,
    clarityScore: inputs[index]?.decisionCore.clarity.score ?? null,
    biasDirection: inputs[index]?.decisionCore.bias.direction ?? null,
    environmentState: inputs[index]?.decisionCore.environment.state ?? null,
    environmentScore: inputs[index]?.decisionCore.environment.score ?? null,
    weightedEdge: inputs[index] ? computeWeightedEdge(inputs[index]) : null,
  }));

  console.log(
    JSON.stringify(
      {
        asOf,
        total: entries.length,
        byExecutionStatus,
        byCurrentState,
        diagnosticSummary: summarizeTradingLightScannerDiagnostics(diagnostics),
        details,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
