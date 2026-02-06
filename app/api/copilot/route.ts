import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runCopilot } from "@/lib/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Health/info endpoint (browser-friendly)
  return NextResponse.json(
    { ok: true, endpoint: "copilot", method: "POST", auth: "clerk" },
    { status: 200 }
  );
}

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: true, endpoint: "copilot", method: "POST", note: "Use POST (requires auth)" },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Se não tens key/config em produção, NÃO rebentes o build/deploy:
    // devolve 200 com disabled para não parecer “site quebrado”
    if (!process.env.OPENAI_API_KEY && !process.env.COPILOT_DISABLED) {
      return NextResponse.json(
        { ok: false, error: "copilot_not_configured" },
        { status: 200 }
      );
    }

    const out = await runCopilot({ userId, ...body });
    return NextResponse.json({ ok: true, ...out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "copilot_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}