import { z } from "zod";

export const MarketRegimeSchema = z.object({
  market_regime: z.enum(["Risk-on", "Risk-off", "Transitional", "Neutral / Range-bound"]),
  confidence: z.enum(["Low", "Moderate", "High"]),
  summary: z.string().min(10),
  key_risks: z.array(z.string()).min(3).max(6),
  regime_change_triggers: z.array(z.string()).min(2).max(5),
  // opcional: timestamp/semana
  week: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MarketRegime = z.infer<typeof MarketRegimeSchema>;