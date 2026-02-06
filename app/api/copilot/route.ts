// app/api/copilot/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runCopilot } from "@/lib/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * We avoid importing repo-specific Copilot types (they may not be exported).
 * Keep a permissive shape to prevent TS/build breaks.
 */
type UserTier = "free" | "pro";

type LooseCopilotContext = Record<string, any> & {
  intent?: string;
  context?: string;
  state?: any;
  quickActions?: any;
  locale?: "en" | "pt";
  tier?: UserTier;
};

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;

    // allow both { ctx } and direct body
    const ctx: LooseCopilotContext =
      body?.ctx && typeof body.ctx === "object" ? body.ctx : body;

    const tier: UserTier = (ctx?.tier as UserTier) ?? (body?.tier as UserTier) ?? "free";

    const out = await runCopilot({
      ...ctx,
      userId,
      tier,
    } as any);

    return NextResponse.json(out ?? { ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "copilot_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}