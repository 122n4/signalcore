import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runCopilot } from "@/lib/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: health/info (no auth required)
 * POST: actual copilot execution (auth required)
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: "copilot",
      methods: ["GET", "POST"],
      note: "Use POST (requires auth) to run copilot.",
    },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    if (!a.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Tier: simples e compatível com o resto do projeto
    // (se tiveres paid logic, podes substituir aqui)
    const tier = (body?.tier === "pro" ? "pro" : "free") as "free" | "pro";

    const result = await runCopilot({
      userId: a.userId,
      tier,
      input: body?.input ?? "",
      context: body?.context ?? {},
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "copilot_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}