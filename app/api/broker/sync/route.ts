import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveConnection, insertSnapshot, getLatestSnapshot } from "@/lib/brokerStore";
import { snapshotHash, snaptradeFetchSnapshot } from "@/lib/brokers";
import { computeMetrics } from "@/lib/brokers/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const conn = await getActiveConnection(userId);
    if (!conn) return NextResponse.json({ error: "no_active_connection" }, { status: 400 });

    if (conn.provider === "snaptrade") {
      if (!conn.access_token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

      const snap = await snaptradeFetchSnapshot({ userId, accessToken: conn.access_token });

      // Ensure metrics/weights
      const m = computeMetrics(snap as any);
      (snap as any).metrics = {
        totalValue: m.totalValue,
        currency: m.currency,
        concentrationTop5Pct: m.concentrationTop5Pct,
        holdingsCount: m.holdingsCount,
      };
      (snap as any).holdings = (m as any).holdingsWeighted ?? snap.holdings;

      const hash = snapshotHash(snap as any);
      const last = await getLatestSnapshot(userId);
      if (last?.hash && last.hash === hash) {
        return NextResponse.json({ ok: true, deduped: true, asOf: last.as_of }, { status: 200 });
      }

      const inserted = await insertSnapshot({
        userId,
        provider: "snaptrade",
        connectionId: conn.id,
        asOf: snap.asOf,
        hash,
        holdings: snap.holdings,
        cash: snap.cash,
        trades: snap.trades,
        metrics: snap.metrics,
      });

      return NextResponse.json({ ok: true, deduped: false, asOf: inserted.as_of }, { status: 200 });
    }

    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "broker_sync_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}