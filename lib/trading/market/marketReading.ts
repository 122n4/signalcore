import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { MarketReadingOutput } from "./types";
import { readLiquidity } from "./liquidity";
import { readMomentum } from "./momentum";
import { readRegime } from "./regime";
import { readSession } from "./session";
import { readStructure } from "./structure";
import { readVolatility } from "./volatility";

export function createMarketReading(snapshot: TradingMarketDataSnapshot): MarketReadingOutput {
  return {
    instrument: snapshot.instrument,
    snapshotAt: snapshot.snapshotAt,
    timeframes: snapshot.availableTimeframes,
    structure: readStructure(snapshot),
    regime: readRegime(snapshot),
    volatility: readVolatility(snapshot),
    session: readSession(snapshot),
    momentum: readMomentum(snapshot),
    liquidity: readLiquidity(snapshot),
  };
}
