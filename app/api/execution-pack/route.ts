import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLatestSnapshot } from "@/lib/brokerStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildExecutionPack(snapshot: any) {
  // V2: universal instructions pack (no trading)
  // Later: integrate with your Engine V3 candidates.
  const holdings = Array.isArray(snapshot?.holdings) ? snapshot.holdings : [];
  const top = [...holdings].sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0)).slice(0, 3);

  return {
    summary: "Execution pack (read-only guidance)",
    actions: top.map((h: any) => ({
      type: "review_position",
      symbol: h.symbol,
      rationale: "Top position — verify alignment with plan & guardrails.",
      suggested: null,
    })),
    notes: [
      "These are guidance instructions. Execute manually in your broker.",
      "Next step: connect to Engine candidates for buy/sell sizing.",
    ],
  };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const snap = await getLatestSnapshot({ userId, provider: "snaptrade" });
    if (!snap) return NextResponse.json({ pack: null }, { status: 200 });

    const pack = buildExecutionPack(snap);

    // persist (proof + audit)
    const sb = supabaseAdmin();
    await sb.from("execution_packs").insert({
      user_id: userId,
      provider: snap.provider,
      as_of: new Date().toISOString(),
      pack,
    });

    return NextResponse.json({ pack }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "execution_pack_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}