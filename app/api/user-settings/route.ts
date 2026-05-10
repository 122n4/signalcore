// app/api/user-settings/route.ts

import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";
import { getUserStore, setUserStore } from "@/lib/signalcore/mvpStore";
import { normalizeMode } from "@/lib/signalcore/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canUseMemoryFallback() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MEMORY_FALLBACK === "1";
}

function asText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeGoalTargetValue(raw: any) {
  const fromLegacy = Number(raw?.goal_target_value);
  if (Number.isFinite(fromLegacy) && fromLegacy > 0) return Math.round(fromLegacy);
  const fromGoalAmount = Number(raw?.goal_amount);
  if (Number.isFinite(fromGoalAmount) && fromGoalAmount > 0) return Math.round(fromGoalAmount);
  return null;
}

function deriveSetupStatus(raw: any) {
  const explicit = asText(raw?.setup_status).toLowerCase();
  if (explicit === "complete" || explicit === "new" || explicit === "pending") return explicit;

  const modesObj = raw?.modes && typeof raw.modes === "object" ? (raw.modes as Record<string, any>) : {};
  const fromModes = asText(modesObj.setup_status).toLowerCase();
  if (fromModes === "complete" || fromModes === "new" || fromModes === "pending") return fromModes;

  const hasRisk = asText(raw?.risk_profile).length > 0;
  const hasHorizon = asText(raw?.horizon).length > 0;
  const hasGoalType = asText(raw?.goal_type).length > 0;
  const hasGoalTarget = normalizeGoalTargetValue(raw) != null;
  return hasRisk && hasHorizon && hasGoalType && hasGoalTarget ? "complete" : "new";
}

function deriveSetupMode(raw: any) {
  const explicit = asText(raw?.setup_mode).toLowerCase();
  if (explicit === "offline" || explicit === "broker") return explicit;
  const modesObj = raw?.modes && typeof raw.modes === "object" ? (raw.modes as Record<string, any>) : {};
  const fromModes = asText(modesObj.setup_mode).toLowerCase();
  if (fromModes === "offline" || fromModes === "broker") return fromModes;
  return "offline";
}

function normalizeSettingsForClient(raw: Record<string, any> | null | undefined, userId: string) {
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  const goalTargetValue = normalizeGoalTargetValue(src);
  const setupStatus = deriveSetupStatus(src);
  const setupMode = deriveSetupMode(src);
  return {
    user_id: asText(src.user_id) || userId,
    ...src,
    active_mode: normalizeMode(src.active_mode || "investing"),
    goal_target_value: goalTargetValue,
    setup_status: setupStatus,
    setup_mode: setupMode,
  };
}

async function tryGetSupabaseAdmin() {
  try {
    const mod = await import("@/lib/supabase/admin");
    try {
      return mod.getSupabaseAdmin();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const allowMemoryFallback = canUseMemoryFallback();
  const sb = await tryGetSupabaseAdmin();
  if (!sb) {
    if (!allowMemoryFallback) {
      return NextResponse.json({ ok: false, error: "persistence_unavailable" }, { status: 503 });
    }
    const v = getUserStore(userId);
    const seed = normalizeSettingsForClient(
      {
        active_mode: normalizeMode(v.active_mode ?? "investing"),
        setup_status: v.setup_status ?? "new",
        setup_mode: v.setup_mode ?? "offline",
        ...v,
      },
      userId
    );
    return NextResponse.json({ ok: true, settings: seed, stored: false }, { status: 200 });
  }

  try {
    const res = await sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
    if (res.error) throw res.error;

    if (res.data) {
      return NextResponse.json(
        { ok: true, settings: normalizeSettingsForClient(res.data as Record<string, any>, userId), stored: true },
        { status: 200 }
      );
    }

    const now = new Date().toISOString();
    const seed = {
      user_id: userId,
      active_mode: "investing",
      updated_at: now,
    };
    const upsertSeed = await sb.from("user_settings").upsert(seed, { onConflict: "user_id" }).select("*").maybeSingle();
    if (upsertSeed.error) throw upsertSeed.error;
    const normalized = normalizeSettingsForClient((upsertSeed.data as Record<string, any> | null) ?? seed, userId);
    return NextResponse.json({ ok: true, settings: normalized, stored: true }, { status: 200 });
  } catch (e: any) {
    if (!allowMemoryFallback) {
      return NextResponse.json(
        { ok: false, error: "persistence_failed", message: e?.message ?? "db_failed" },
        { status: 503 }
      );
    }
    const v = getUserStore(userId);
    const seed = normalizeSettingsForClient(
      {
        active_mode: normalizeMode(v.active_mode ?? "investing"),
        setup_status: v.setup_status ?? "new",
        setup_mode: v.setup_mode ?? "offline",
        ...v,
      },
      userId
    );
    return NextResponse.json({ ok: true, settings: seed, stored: false, error: e?.message ?? "db_failed" }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const allowMemoryFallback = canUseMemoryFallback();
  const body = (await req.json().catch(() => ({}))) as any;

  const patch: any = {};
  if (body.active_mode != null) patch.active_mode = normalizeMode(body.active_mode);
  if (typeof body.risk_profile === "string") {
    const risk = String(body.risk_profile).trim();
    if (risk === "Conservative" || risk === "Balanced" || risk === "Aggressive") patch.risk_profile = risk;
  }
  if (typeof body.horizon === "string") {
    const horizon = String(body.horizon).trim();
    if (horizon === "Short" || horizon === "Medium" || horizon === "Long") patch.horizon = horizon;
  }
  if (typeof body.goal_type === "string" && body.goal_type.trim()) patch.goal_type = body.goal_type.trim();
  if (Number.isFinite(Number(body.goal_target_value))) patch.goal_amount = Number(body.goal_target_value);
  if (Number.isFinite(Number(body.goal_amount))) patch.goal_amount = Number(body.goal_amount);
  if (Number.isFinite(Number(body.monthly_contribution))) patch.monthly_contribution = Number(body.monthly_contribution);
  if (Number.isFinite(Number(body.goal_timeframe_months))) patch.goal_timeframe_months = Math.max(1, Math.round(Number(body.goal_timeframe_months)));

  const modesPatch: Record<string, any> = {};
  if (body.setup_status != null) modesPatch.setup_status = String(body.setup_status).trim().toLowerCase();
  if (body.setup_mode != null) modesPatch.setup_mode = String(body.setup_mode).trim().toLowerCase();
  for (const k of Object.keys(body)) {
    if (k.startsWith("has_plan_")) modesPatch[k] = Boolean(body[k]);
  }

  const sb = await tryGetSupabaseAdmin();
  if (!sb) {
    if (!allowMemoryFallback) {
      return NextResponse.json({ ok: false, error: "persistence_unavailable" }, { status: 503 });
    }
    const current = getUserStore(userId);
    const memoryPatch: Record<string, any> = { ...patch };
    if (modesPatch.setup_status) memoryPatch.setup_status = modesPatch.setup_status;
    if (modesPatch.setup_mode) memoryPatch.setup_mode = modesPatch.setup_mode;
    if (patch.goal_amount != null) memoryPatch.goal_target_value = patch.goal_amount;
    const currentModes =
      current?.modes && typeof current.modes === "object" ? (current.modes as Record<string, any>) : {};
    let mergedModes: Record<string, any> = { ...currentModes };
    if (Object.keys(modesPatch).length > 0) mergedModes = { ...mergedModes, ...modesPatch };
    if (Object.keys(mergedModes).length > 0) memoryPatch.modes = mergedModes;
    const next = setUserStore(userId, memoryPatch);
    return NextResponse.json(
      { ok: true, stored: false, settings: normalizeSettingsForClient(next as Record<string, any>, userId) },
      { status: 200 }
    );
  }

  try {
    const now = new Date().toISOString();
    let mergedModes: Record<string, any> | null = null;
    if (Object.keys(modesPatch).length > 0) {
      const currentModesRes = await sb.from("user_settings").select("modes").eq("user_id", userId).maybeSingle();
      if (currentModesRes.error) throw currentModesRes.error;
      const currentModes =
        currentModesRes.data?.modes && typeof currentModesRes.data.modes === "object"
          ? (currentModesRes.data.modes as Record<string, any>)
          : {};
      mergedModes = { ...currentModes, ...modesPatch };
    }
    const up: Record<string, any> = { ...patch, updated_at: now };
    if (mergedModes) up.modes = mergedModes;

    const res = await sb
      .from("user_settings")
      .upsert({ user_id: userId, ...up }, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();
    if (res.error) throw res.error;

    const normalized = normalizeSettingsForClient((res.data as Record<string, any> | null) ?? { user_id: userId, ...up }, userId);
    return NextResponse.json({ ok: true, stored: true, settings: normalized }, { status: 200 });
  } catch (e: any) {
    if (!allowMemoryFallback) {
      return NextResponse.json(
        { ok: false, error: "persistence_failed", message: e?.message ?? "db_failed" },
        { status: 503 }
      );
    }
    const current = getUserStore(userId);
    const memoryPatch: Record<string, any> = { ...patch };
    if (modesPatch.setup_status) memoryPatch.setup_status = modesPatch.setup_status;
    if (modesPatch.setup_mode) memoryPatch.setup_mode = modesPatch.setup_mode;
    if (patch.goal_amount != null) memoryPatch.goal_target_value = patch.goal_amount;
    const currentModes =
      current?.modes && typeof current.modes === "object" ? (current.modes as Record<string, any>) : {};
    let mergedModes: Record<string, any> = { ...currentModes };
    if (Object.keys(modesPatch).length > 0) mergedModes = { ...mergedModes, ...modesPatch };
    if (Object.keys(mergedModes).length > 0) memoryPatch.modes = mergedModes;
    const next = setUserStore(userId, memoryPatch);
    return NextResponse.json(
      {
        ok: true,
        stored: false,
        settings: normalizeSettingsForClient(next as Record<string, any>, userId),
        error: e?.message ?? "db_failed",
      },
      { status: 200 }
    );
  }
}
