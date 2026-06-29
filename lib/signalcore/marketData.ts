// lib/signalcore/marketData.ts
import { getQuotes as getCanonicalQuotes } from "@/lib/market/quotes";
import type { AutopilotMode } from "@/lib/signalcore/modes";

/**
 * getQuotes:
 * Compatibility adapter kept only to avoid breaking legacy signalcore imports.
 * New market quote access should go through `@/lib/market/quotes`.
 */
export async function getQuotes(args: { symbols: string[]; mode: AutopilotMode; ttlSec?: number }) {
  void args.mode;
  return getCanonicalQuotes({
    symbols: args.symbols,
    ttlSec: args.ttlSec,
  });
}
