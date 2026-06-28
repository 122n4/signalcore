import {
  buildTradingLightScannerInputs,
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";
import { readLatestTradingScannerSnapshots } from "@/lib/trading/scannerSnapshotStore";

export async function loadTradingScannerOperationalDiagnostics(args: {
  asOf: string;
  liveFetch?: boolean;
}) {
  if (args.liveFetch !== true) {
    const storedScannerSnapshots = await readLatestTradingScannerSnapshots({
      asOf: args.asOf,
    }).catch(() => ({
      schemaReady: false,
      inputs: [],
      generatedAt: null,
      excludedStaleOpenCount: 0,
      error: "trading_scanner_snapshot_read_failed",
    }));

    const inputs = await buildTradingLightScannerInputs({
      asOf: args.asOf,
      forceRefresh: true,
      allowLiveFetch: false,
      includeInactiveMarkets: true,
      storedInputs: storedScannerSnapshots.inputs,
    }).catch(() => []);

    return inputs.map((input) => ({
      instrument: input.snapshot.instrument,
      dataSymbol: input.scannerSnapshot?.dataSymbol ?? input.snapshot.instrument,
      dataRelation: input.scannerSnapshot?.dataRelation ?? null,
      source: input.scannerSnapshot?.source ?? "empty",
      providerError: input.scannerSnapshot?.providerError ?? null,
      hasAnyCandles: input.snapshot.availableTimeframes.length > 0,
      snapshotAt: input.snapshot.snapshotAt,
      sessionLabel: input.market.session.session,
      marketOpen: input.market.session.marketOpen,
      snapshotAgeMs: input.scannerSnapshot?.snapshotAgeMs ?? Number.POSITIVE_INFINITY,
      actionableFreshness: input.scannerSnapshot?.actionableFreshness === true,
      staleReason: input.scannerSnapshot?.staleReason ?? null,
      coverage: input.scannerCoverage,
      candleCounts: {},
    }));
  }

  const firstPass = await inspectTradingLightScanner({
    asOf: args.asOf,
    liveFetch: true,
    openMarketsOnlyLiveFetch: true,
  }).catch(() => []);
  const firstSummary = summarizeTradingLightScannerDiagnostics(firstPass);
  const needsHardRefresh =
    firstSummary.openMarketCount > 0 &&
    firstSummary.freshOpenMarketCount === 0;

  if (!needsHardRefresh) {
    return firstPass;
  }

  return inspectTradingLightScanner({
    asOf: args.asOf,
    liveFetch: true,
    forceProviderRefresh: true,
    openMarketsOnlyLiveFetch: true,
  }).catch(() => firstPass);
}
