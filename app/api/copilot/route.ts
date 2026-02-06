import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runCopilot, type CopilotContext, type UserTier } from "@/lib/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // “ping” / status — útil para UI
  return NextResponse.json(
    {
      ok: true,
      message: "Copilot is alive.",
    },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    const userId = a.userId;

    const body = await req.json().catch(() => ({}));
    const context = (body?.context ?? {}) as Partial<CopilotContext>;
    const userMessage = typeof body?.message === "string" ? body.message : null;

    const tier: UserTier = context?.tier === "paid" ? "paid" : "free";

    const ctx: CopilotContext = {
      tab: context?.tab ?? null,
      tier,
      isAuthenticated: Boolean(userId),

      regime: context?.regime ?? "Neutral",

      horizon: context?.horizon ?? null,
      risk: context?.risk ?? null,
      goal: context?.goal ?? null,

      portfolio: Array.isArray(context?.portfolio) ? context.portfolio : [],

      previousOverall: typeof context?.previousOverall === "number" ? context.previousOverall : null,
    };

    const out = runCopilot({ context: ctx, userMessage });

    return NextResponse.json(out, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "copilot_failed", message: err?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}