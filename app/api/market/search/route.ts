import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Hit = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
  currency: string | null;
};

function cleanQ(q: string) {
  return String(q || "").trim().slice(0, 64);
}

const LOCAL: Hit[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", type: "Equity", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", type: "Equity", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", type: "Equity", currency: "USD" },
  { symbol: "AMZN", name: "Amazon", exchange: "NASDAQ", type: "Equity", currency: "USD" },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ", type: "Equity", currency: "USD" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSEARCA", type: "ETF", currency: "USD" },
  { symbol: "QQQ", name: "Invesco QQQ ETF", exchange: "NASDAQ", type: "ETF", currency: "USD" },
  { symbol: "VWCE", name: "Vanguard FTSE All-World UCITS ETF", exchange: "XETRA", type: "ETF", currency: "EUR" },
  { symbol: "AGGH", name: "iShares Core Global Aggregate Bond UCITS ETF", exchange: "LSE", type: "ETF", currency: "EUR" },
  { symbol: "GLD", name: "SPDR Gold Shares", exchange: "NYSEARCA", type: "ETF", currency: "USD" },
];

function localSearch(q: string): Hit[] {
  const s = q.toLowerCase();
  return LOCAL.filter((x) => x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s)).slice(0, 10);
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = cleanQ(url.searchParams.get("q") || "");
  if (!q || q.length < 1) return NextResponse.json({ ok: true, q, hits: [] });

  const key = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
  if (!key) return NextResponse.json({ ok: true, q, hits: localSearch(q), source: "local" });

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );

    if (!r.ok) return NextResponse.json({ ok: true, q, hits: localSearch(q), source: "local_fallback" });

    const json: any = await r.json().catch(() => null);
    const result = Array.isArray(json.result) ? json.result : [];

    const hits: Hit[] = result
      .map((x: any) => ({
        symbol: String(x.symbol || "").trim(),
        name: String(x.description || x.name || "").trim(),
        exchange: x.exchange ? String(x.exchange) : null,
        type: x.type ? String(x.type) : null,
        currency: x.currency ? String(x.currency) : null,
      }))
      .filter((x: Hit) => x.symbol && x.name)
      .slice(0, 10);

    return NextResponse.json({ ok: true, q, hits, source: "finnhub" });
  } catch {
    return NextResponse.json({ ok: true, q, hits: localSearch(q), source: "local_fallback" });
  }
}
