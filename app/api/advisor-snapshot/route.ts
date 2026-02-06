// app/api/advisor-snapshot/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getLatestSnapshot } from "@/lib/brokerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ latest: null, previous: null }, { status: 200 });
    }

    // v1: devolvemos o snapshot mais recente (se existir)
    const latest = await getLatestSnapshot(userId);

    return NextResponse.json(
      { latest: latest ?? null, previous: null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "advisor_snapshot_get_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Mantemos POST compatível: se no futuro quiseres gravar snapshots, fazes aqui.
    // Por agora apenas devolve o mesmo que o GET para não quebrar o frontend.
    const latest = await getLatestSnapshot(userId);

    return NextResponse.json(
      { ok: true, latest: latest ?? null, previous: null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "advisor_snapshot_post_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}