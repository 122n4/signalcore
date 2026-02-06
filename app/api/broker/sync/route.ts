// app/api/broker/sync/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getConnection } from "@/lib/brokerStore";
import { snaptradeFetchSnapshot } from "@/lib/brokers";
import { computeMetrics } from "@/lib/brokers/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const accountId =
      typeof body?.accountId === "string" && body.accountId.trim()
        ? body.accountId.trim()
        : undefined;

    // Confirma que existe ligação Snaptrade guardada
    const conn = await getConnection(userId, "snaptrade");
    if (!conn) return NextResponse.json({ error: "not_connected" }, { status: 400 });

    // (Opcional) se tiveres status no store, bloqueia estados inválidos
    const status = (conn as any).status as
      | "active"
      | "revoked"
      | "needs_attention"
      | "error"
      | undefined;

    if (status && status !== "active") {
      return NextResponse.json(
        { error: "connection_not_active", status },
        { status: 409 }
      );
    }

    // Fetch do snapshot: o adapter resolve tokens internamente via store (ou via API Snaptrade)
    const snap = await snaptradeFetchSnapshot({ userId, accountId });

    // Normaliza métricas/pesos
    const metrics = computeMetrics(snap as any);

    // Persistência no Supabase:
    // - aqui assumo que tens (ou vais ter) uma função no brokerStore tipo saveSnapshot/upsertSnapshot.
    // - se o teu brokerStore usar outro nome, troca aqui (ver nota abaixo).
    const brokerStore: any = await import("@/lib/brokerStore");
    const save =
      brokerStore.saveSnapshot ??
      brokerStore.upsertSnapshot ??
      brokerStore.insertSnapshot ??
      null;

    if (typeof save === "function") {
      await save({
        userId,
        provider: "snaptrade",
        accountId: accountId ?? null,
        snapshot: snap,
        metrics,
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        provider: "snaptrade",
        accountId: accountId ?? null,
        snapshot: snap,
        metrics,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "broker_sync_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}