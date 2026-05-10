// app/api/plans/route.ts

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isActivePlan(plan: Record<string, unknown> | null) {
  if (!plan) return false;
  const status = String(plan.status ?? "").toLowerCase().trim();
  if (status) return status === "active";
  if (typeof plan.is_active === "boolean") return Boolean(plan.is_active);
  return false;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const supabase = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase,
    userId,
    requestedMode: url.searchParams.get("mode"),
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;

  // Evitar schema-cache issues: não selecionar colunas “a dedo” se o teu schema ainda está a mudar
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const plan = rows.find((p) => isActivePlan(p)) ?? rows[0] ?? null;

  return NextResponse.json({ ok: true, mode, plan });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "Growth with controlled risk";
  const activate = body?.activate !== false; // default true

  const supabase = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase,
    userId,
    requestedMode: body?.mode,
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;
  const nowIso = new Date().toISOString();

  // Keep exactly one active plan per user+mode.
  if (activate) {
    const deactivatePatch = {
      status: "draft",
      is_active: false,
      updated_at: nowIso,
      archived_at: null,
    };

    const { error: deactStatusErr } = await supabase
      .from("plans")
      .update(deactivatePatch)
      .eq("user_id", userId)
      .eq("mode", mode)
      .eq("status", "active");

    if (deactStatusErr) return NextResponse.json({ ok: false, error: deactStatusErr.message }, { status: 500 });

    const { error: deactFlagErr } = await supabase
      .from("plans")
      .update({ is_active: false, updated_at: nowIso })
      .eq("user_id", userId)
      .eq("mode", mode)
      .eq("is_active", true);

    if (deactFlagErr) return NextResponse.json({ ok: false, error: deactFlagErr.message }, { status: 500 });
  }

  // Cria plano sempre com status definido
  const planRow: any = {
    user_id: userId,
    mode,
    goal,
    status: activate ? "active" : "draft",
    is_active: !!activate,
    version: 1,
    created_at: nowIso,
    updated_at: nowIso,
    activated_at: activate ? nowIso : null,
    archived_at: null,
  };

  const { data, error } = await supabase.from("plans").insert(planRow).select("*").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, mode, plan: data });
}
