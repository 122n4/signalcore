import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.FINNHUB_API_KEY;

export async function GET(req: Request) {
  try {
    if (!KEY) {
      return NextResponse.json({ error: "missing_env", message: "FINNHUB_API_KEY missing" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") ?? "").trim();

    if (!q || q.length < 1) return NextResponse.json({ results: [] }, { status: 200 });

    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${KEY}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    const raw = Array.isArray(json?.result) ? json.result : [];
    const results = raw.slice(0, 12).map((r: any) => ({
      symbol: String(r?.symbol ?? "").trim(),
      description: String(r?.description ?? "").trim(),
      type: String(r?.type ?? "").trim(),
    })).filter((r: any) => r.symbol);

    return NextResponse.json({ results }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: "search_failed", message: err?.message ?? "Unknown" }, { status: 500 });
  }
}