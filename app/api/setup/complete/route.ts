import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setUserStore } from "@/lib/signalcore/mvpStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetupMode = "offline" | "broker";

function canUseMemoryFallback() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MEMORY_FALLBACK === "1";
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

function normalizeMode(v: unknown): SetupMode {
  return String(v || "").toLowerCase().trim() === "broker" ? "broker" : "offline";
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
  return {
    user_id: asText(src.user_id) || userId,
    ...src,
    goal_target_value: normalizeGoalTargetValue(src),
    setup_status: deriveSetupStatus(src),
    setup_mode: deriveSetupMode(src),
  };
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const allowMemoryFallback = canUseMemoryFallback();
  const body = await req.json().catch(() => ({}));
  const mode = normalizeMode((body as any)?.mode);
  const now = new Date().toISOString();

  const patch = {
    setup_status: "complete",
    setup_mode: mode,
    updated_at: now,
  } as const;

  const sb = await tryGetSupabaseAdmin();
  if (!sb) {
    if (!allowMemoryFallback) {
      return NextResponse.json({ ok: false, error: "persistence_unavailable" }, { status: 503 });
    }
    const settings = setUserStore(userId, {
      ...patch,
      modes: {
        setup_status: patch.setup_status,
        setup_mode: patch.setup_mode,
      },
    });
    return NextResponse.json(
      { ok: true, stored: false, settings: normalizeSettingsForClient(settings as Record<string, any>, userId) },
      { status: 200 }
    );
  }

  try {
    const currentModesRes = await sb.from("user_settings").select("modes").eq("user_id", userId).maybeSingle();
    if (currentModesRes.error) throw currentModesRes.error;
    const currentModes =
      currentModesRes.data?.modes && typeof currentModesRes.data.modes === "object"
        ? (currentModesRes.data.modes as Record<string, any>)
        : {};
    const modes = {
      ...currentModes,
      setup_status: patch.setup_status,
      setup_mode: patch.setup_mode,
    };
    const upsert = await sb
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          updated_at: patch.updated_at,
          modes,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .maybeSingle();
    if (upsert.error) throw upsert.error;

    return NextResponse.json(
      {
        ok: true,
        stored: true,
        settings: normalizeSettingsForClient((upsert.data as Record<string, any> | null) ?? { user_id: userId, modes }, userId),
      },
      { status: 200 }
    );
  } catch (e: any) {
    if (!allowMemoryFallback) {
      return NextResponse.json(
        { ok: false, error: "persistence_failed", message: String(e?.message || "db_failed") },
        { status: 503 }
      );
    }
    const settings = setUserStore(userId, {
      ...patch,
      modes: {
        setup_status: patch.setup_status,
        setup_mode: patch.setup_mode,
      },
    });
    return NextResponse.json(
      {
        ok: true,
        stored: false,
        settings: normalizeSettingsForClient(settings as Record<string, any>, userId),
        error: String(e?.message || "db_failed"),
      },
      { status: 200 }
    );
  }
}
