import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.FINNHUB_API_KEY;

async function finnhubJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) return { ok: false, status: res.status, json };
  if (json?.error) return { ok: false, status: 500, json };
  return { ok: true, status: 200, json };
}

export async function GET(req: Request) {
  try {
    if (!KEY) {
      return NextResponse.json({ error: "missing_env", message: "FINNHUB_API_KEY missing" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const symbol = String(searchParams.get("symbol") ?? "").trim();
    if (!symbol) return NextResponse.json({ error: "missing_symbol" }, { status: 400 });

    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${KEY}`;
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${KEY}`;

    const [p, q] = await Promise.all([finnhubJson(profileUrl), finnhubJson(quoteUrl)]);
    const profile = p.ok ? p.json : null;
    const quote = q.ok ? q.json : null;

    return NextResponse.json(
      {
        symbol,
        name: profile?.name ?? null,
        country: profile?.country ?? null,
        currency: profile?.currency ?? null,
        exchange: profile?.exchange ?? null,
        industry: profile?.finnhubIndustry ?? null,
        sector: profile?.finnhubIndustry ?? null,
        marketCap: typeof profile?.marketCapitalization === "number" ? profile.marketCapitalization : null,
        price: typeof quote?.c === "number" ? quote.c : null,
        updatedAt: new Date().toISOString(),
        source: "finnhub" as const,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: "enrich_failed", message: err?.message ?? "Unknown" }, { status: 500 });
  }
}