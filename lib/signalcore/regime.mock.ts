import type { MarketRegime } from "./regime.schema";

export const regimeMock: MarketRegime = {
  week: "Week 12",
  updated_at: "Monday",
  market_regime: "Transitional",
  confidence: "Moderate",
  summary:
    "Market conditions remain fragile with mixed signals across risk assets. Volatility is still elevated while momentum has weakened, suggesting a market that is searching for direction rather than committing to one.",
  key_risks: [
    "Liquidity-driven reversals following macro headlines",
    "Rising asset correlations reducing diversification benefits",
    "Overreaction to short-term economic data",
    "Narrow leadership increasing downside asymmetry",
  ],
  regime_change_triggers: [
    "Volatility compresses sustainably across major indices",
    "Market breadth improves consistently, not just episodically",
    "Macro communication becomes clearer and less reactive",
  ],
};