import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body?.action) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    const sb = supabaseAdmin();

    const item = {
      user_id: userId,
      status: body.status ?? "queued",
      source: body.source ?? "opportunities",
      action: body.action,
      notes: body.notes ?? null,
      copied: !!body.copied,
      done_at: body.done_at ?? null,
      created_at: new Date().toISOString(),
    };

    const { error } = await sb.from("execution_queue").insert(item);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "execution_queue_failed", message: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}