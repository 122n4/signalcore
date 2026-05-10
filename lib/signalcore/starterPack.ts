import type { AutopilotMode } from "@/lib/signalcore/modes";

export type StarterPackItem = {
  symbol: string;
  name: string;
  weight: number;
  rationale: string;
};

export function getStarterPack(mode: AutopilotMode): StarterPackItem[] {
  void mode;

  return [
    { symbol: "VWCE", name: "Global Equity ETF", weight: 0.65, rationale: "Global diversified baseline. Long-term compounding." },
    { symbol: "AGGH", name: "Global Bonds ETF", weight: 0.25, rationale: "Volatility control. Reduces drawdowns." },
    { symbol: "GLD", name: "Gold ETF", weight: 0.1, rationale: "Crisis hedge. Helps during regime shifts." },
  ];
}

export const generateStarterPack = getStarterPack;
