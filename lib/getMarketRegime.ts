export type MarketRegimePayload = {
  market_regime: "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  key_risks: string[];
  regime_change_triggers: string[];
  week?: string;
  updated_at?: string;
};

function getBaseUrl() {
  // Vercel: usa o domínio real automaticamente
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // Se definires isto na Vercel ou localmente, usa-o
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  // Local dev fallback
  return "http://localhost:3000";
}

export async function getMarketRegime(): Promise<MarketRegimePayload> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/market-regime`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load /api/market-regime (${res.status})`);
  }

  return res.json();
}