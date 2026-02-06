import { MarketRegimeSchema } from "./signalcore/regime.schema";
import { regimeMock } from "./signalcore/regime.mock";

export type MarketRegimePayload = {
  market_regime: "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  key_risks: string[];
  regime_change_triggers: string[];
  week?: string;
  updated_at?: string;
};

export async function getMarketRegime(): Promise<MarketRegimePayload> {
  // ✅ Fonte única e estável (sem HTTP)
  const parsed = MarketRegimeSchema.safeParse(regimeMock);

  if (!parsed.success) {
    // não deixamos o site morrer — devolvemos algo mínimo
    return {
      market_regime: "Transitional",
      confidence: "Moderate",
      summary:
        "We couldn’t load the latest regime snapshot right now. Please refresh in a moment.",
      key_risks: [],
      regime_change_triggers: [],
      week: "This week",
      updated_at: "Now",
    };
  }

  return parsed.data;
}