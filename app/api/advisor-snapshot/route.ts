export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isoNow() {
  return new Date().toISOString();
}

export async function GET() {
  const { userId } = await auth();F
  if (!userId) return Response.json({ latest: null, previous: null });

  try {
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("advisor_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2);

    // If table doesn't exist / no perms: no-op
    if (error) return Response.json({ latest: null, previous: null });

    return Response.json({
      latest: data?.[0] ?? null,
      previous: data?.[1] ?? null,
    });
  } catch {
    return Response.json({ latest: null, previous: null });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  try {
    const sb = supabaseAdmin();

    const payload = {
      user_id: userId,
      created_at: isoNow(),
      regime: body.regime ?? null,
      horizon: body.horizon ?? null,
      risk: body.risk ?? null,
      coherence_score: body.coherenceScore ?? null,
      breakdown: body.breakdown ?? null,
      payload: body.payload ?? null,
    };

    const { error } = await sb.from("advisor_snapshots").insert(payload);

    // If table missing / perms: no-op (still OK)
    if (error) return Response.json({ ok: true, note: "snapshot_not_persisted" });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true, note: "snapshot_failed" });
  }
}