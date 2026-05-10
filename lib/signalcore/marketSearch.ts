export type MarketHit = {
  symbol: string;
  name: string;
  exchange?: string | null;
  type?: string | null;
  currency?: string | null;
};

export async function searchMarket(q: string): Promise<MarketHit[]> {
  const s = String(q || "").trim();
  if (s.length < 1) return [];

  const res = await fetch(`/api/market/search?q=${encodeURIComponent(s)}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) return [];
  return Array.isArray(json?.hits) ? (json.hits as MarketHit[]) : [];
}