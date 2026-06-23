import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanInstrument(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, "")
    .slice(0, 32);
}

function cleanText(value: unknown, maxLen = 240) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function finiteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveTraderAction(context: Record<string, unknown>) {
  const direction = cleanText(context.direction, 16).toUpperCase();
  if (direction.includes("SHORT") || direction.includes("SELL")) return "ENTER SHORT";
  if (direction.includes("LONG") || direction.includes("BUY")) return "ENTER LONG";
  return "ENTER TRADE";
}

function resolvePlanRecommendation(context: Record<string, unknown>) {
  const explicit = cleanText(context.recommendation, 40).toUpperCase();
  if (explicit) return explicit;

  const state = cleanText(context.currentState, 40).toUpperCase();
  const executionStatus = cleanText(context.executionStatus, 40).toLowerCase();
  if ((state === "TRADE_VALID" || state === "TRADE_ACTIVE") && executionStatus === "allowed") {
    return "ENTER";
  }
  if (state === "SETUP_FORMING") return "MONITOR";
  return "WAIT";
}

function resolvePlanDiscipline(args: {
  action: string;
  instrument: string;
  context: Record<string, unknown>;
  resultR?: number | null;
  inherited?: Record<string, unknown>;
}) {
  const inherited = asObject(args.inherited);
  const inheritedDiscipline = asObject(inherited.planDiscipline);
  const state = cleanText(args.context.currentState ?? inherited.currentState, 40).toUpperCase();
  const executionStatus = cleanText(
    args.context.executionStatus ?? inherited.executionStatus,
    40,
  ).toLowerCase();
  const planState = cleanText(args.context.planState ?? inherited.planState, 40).toUpperCase();
  const planIntent = cleanText(args.context.planIntent ?? inherited.planIntent, 40).toLowerCase();
  const clarity =
    finiteNumber(args.context.clarityScore ?? inherited.clarityScore) ??
    finiteNumber(inheritedDiscipline.clarity) ??
    null;
  const recommendation =
    cleanText(args.context.recommendation ?? inherited.recommendation, 40).toUpperCase() ||
    cleanText(inheritedDiscipline.recommendation, 40).toUpperCase() ||
    resolvePlanRecommendation({
      ...inherited,
      ...args.context,
      currentState: state,
      executionStatus,
    });
  const traderAction =
    cleanText(args.context.traderAction ?? inherited.traderAction, 40).toUpperCase() ||
    cleanText(inheritedDiscipline.traderAction, 40).toUpperCase() ||
    resolveTraderAction({ ...inherited, ...args.context });
  const hasValidTrigger =
    Boolean(args.context.hasValidTrigger ?? inherited.hasValidTrigger) ||
    finiteNumber(args.context.triggerLevel ?? inherited.triggerLevel) != null;
  const allowedPlan =
    (state === "TRADE_VALID" || state === "TRADE_ACTIVE") &&
    executionStatus === "allowed" &&
    (planState === "READY" || planIntent === "execute_now") &&
    hasValidTrigger;
  const aligned =
    args.action === "confirm_entry"
      ? allowedPlan && recommendation === "ENTER"
      : inheritedDiscipline.aligned === true;
  const violationReason =
    aligned
      ? null
      : !hasValidTrigger
        ? "Trade taken without valid trigger"
        : recommendation !== "ENTER"
          ? `Syntrake recommendation was ${recommendation}`
          : executionStatus !== "allowed"
            ? "Execution gate was not allowed"
            : "Trade taken outside a READY plan";

  return {
    status: aligned ? "aligned" : "violation",
    aligned,
    violationReason,
    clarity,
    recommendation,
    traderAction,
    currentState: state || null,
    executionStatus: executionStatus || null,
    planState: planState || null,
    planIntent: planIntent || null,
    hasValidTrigger,
    resultR: args.resultR ?? finiteNumber(inheritedDiscipline.resultR),
  };
}

function normalizeContext(value: any) {
  const context = value && typeof value === "object" ? value : {};

  return {
    direction: cleanText(context.direction, 16) || null,
    trigger_level: finiteNumber(context.triggerLevel),
    invalidation_level: finiteNumber(context.invalidationLevel),
    target_zone: cleanText(context.targetZone, 120) || null,
    risk_pct: finiteNumber(context.riskPct),
    last_state: cleanText(context.currentState, 40) || null,
    last_execution_status: cleanText(context.executionStatus, 40) || null,
    last_headline: cleanText(context.headline, 240) || null,
    entry_snapshot: context,
  };
}

function mapPosition(row: any) {
  return {
    id: String(row.id),
    instrument: String(row.instrument),
    status: String(row.status),
    source: String(row.source || "manual_follow"),
    direction: row.direction ?? null,
    triggerLevel: row.trigger_level == null ? null : Number(row.trigger_level),
    invalidationLevel: row.invalidation_level == null ? null : Number(row.invalidation_level),
    targetZone: row.target_zone ?? null,
    riskPct: row.risk_pct == null ? null : Number(row.risk_pct),
    lifecycleStatus: row.lifecycle_status ?? "watching",
    entryConfirmedAt: row.entry_confirmed_at ?? null,
    entryPrice: row.entry_price == null ? null : Number(row.entry_price),
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    resultR: row.result_r == null ? null : Number(row.result_r),
    closeReason: row.close_reason ?? null,
    lastState: row.last_state ?? null,
    lastExecutionStatus: row.last_execution_status ?? null,
    lastHeadline: row.last_headline ?? null,
    openedAt: row.opened_at ?? null,
    closedAt: row.closed_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function loadOpenPositions(sb: any, userId: string, mode: string) {
  const { data, error } = await sb
    .from("trading_followed_positions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("status", "open")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message || "followed_positions_read_failed");
  return (data || []).map(mapPosition);
}

async function writeFollowJournal(args: {
  sb: any;
  userId: string;
  mode: string;
  action: string;
  instrument: string;
  context: Record<string, unknown>;
  planDiscipline?: Record<string, unknown> | null;
  resultR?: number | null;
}) {
  await args.sb.from("journal_entries").insert({
    user_id: args.userId,
    mode: args.mode,
    type:
      args.action === "entry_confirmed" && args.planDiscipline?.status === "violation"
        ? "trading_plan_violation"
        : "trading_follow",
    title:
      args.action === "entry_confirmed" && args.planDiscipline?.status === "violation"
        ? `Plan Violation: ${args.instrument}`
        : `Trading follow ${args.action}: ${args.instrument}`,
    details: {
      action: args.action,
      instrument: args.instrument,
      resultR: args.resultR ?? null,
      planDiscipline: args.planDiscipline ?? null,
      ...args.context,
    },
    created_at: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const sb = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase: sb,
      userId,
      requestedMode: url.searchParams.get("mode") || "trading",
      capability: "alerts",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }

    const positions = await loadOpenPositions(sb, userId, String(access.mode));
    return NextResponse.json({
      ok: true,
      mode: access.mode,
      positions,
      instruments: positions.map((position: any) => position.instrument),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action || "follow", 24).toLowerCase();
    const instrument = cleanInstrument(body?.instrument);
    if (!instrument) {
      return NextResponse.json({ ok: false, error: "instrument_required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase: sb,
      userId,
      requestedMode: body?.mode || "trading",
      capability: "alerts",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }
    const mode = String(access.mode);

    if (action === "follow") {
      const context = normalizeContext(body?.context);
      const { data: existing, error: existingError } = await sb
        .from("trading_followed_positions")
        .select("id")
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("instrument", instrument)
        .eq("status", "open")
        .maybeSingle();
      if (existingError) throw new Error(existingError.message || "followed_position_read_failed");

      const payload = {
        status: "open",
        lifecycle_status: "watching",
        source: "manual_follow",
        ...context,
        closed_at: null,
        close_reason: null,
        updated_at: new Date().toISOString(),
      };
      const writeResult = existing?.id
        ? await sb
            .from("trading_followed_positions")
            .update(payload)
            .eq("id", existing.id)
            .eq("user_id", userId)
        : await sb.from("trading_followed_positions").insert({
          user_id: userId,
          mode,
          instrument,
          ...payload,
        });
      const { error } = writeResult;
      if (error) throw new Error(error.message || "followed_position_upsert_failed");
      await writeFollowJournal({ sb, userId, mode, action: "started", instrument, context });
    } else if (action === "confirm_entry") {
      const context = normalizeContext(body?.context);
      const { data: existing, error: existingError } = await sb
        .from("trading_followed_positions")
        .select("entry_snapshot")
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("instrument", instrument)
        .eq("status", "open")
        .maybeSingle();
      if (existingError) throw new Error(existingError.message || "followed_position_read_failed");

      const rawContext = asObject(body?.context);
      const planDiscipline = resolvePlanDiscipline({
        action: "confirm_entry",
        instrument,
        context: rawContext,
        inherited: asObject(existing?.entry_snapshot),
      });
      const { error } = await sb
        .from("trading_followed_positions")
        .update({
          lifecycle_status: "active",
          entry_confirmed_at: new Date().toISOString(),
          entry_price: finiteNumber(body?.entryPrice ?? body?.context?.entryPrice),
          ...context,
          entry_snapshot: {
            ...asObject(existing?.entry_snapshot),
            ...rawContext,
            planDiscipline,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("instrument", instrument)
        .eq("status", "open");
      if (error) throw new Error(error.message || "followed_position_confirm_failed");
      await writeFollowJournal({
        sb,
        userId,
        mode,
        action: "entry_confirmed",
        instrument,
        context,
        planDiscipline,
      });
    } else if (action === "unfollow" || action === "close") {
      const status = action === "close" ? "closed" : "removed";
      const { data: existing, error: existingError } = await sb
        .from("trading_followed_positions")
        .select("entry_snapshot")
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("instrument", instrument)
        .eq("status", "open")
        .maybeSingle();
      if (existingError) throw new Error(existingError.message || "followed_position_read_failed");
      const resultR = finiteNumber(body?.resultR);
      const planDiscipline =
        action === "close"
          ? resolvePlanDiscipline({
              action: "close",
              instrument,
              context: {},
              inherited: asObject(existing?.entry_snapshot),
              resultR,
            })
          : null;
      const { error } = await sb
        .from("trading_followed_positions")
        .update({
          status,
          lifecycle_status: action === "close" ? "closed" : "removed",
          closed_at: new Date().toISOString(),
          exit_price: finiteNumber(body?.exitPrice),
          result_r: resultR,
          close_reason: cleanText(body?.reason, 240) || null,
          updated_at: new Date().toISOString(),
          last_headline: cleanText(body?.reason, 240) || null,
        })
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("instrument", instrument)
        .eq("status", "open");
      if (error) throw new Error(error.message || "followed_position_update_failed");
      await writeFollowJournal({
        sb,
        userId,
        mode,
        action: status,
        instrument,
        context: { reason: cleanText(body?.reason, 240) || null },
        planDiscipline,
        resultR,
      });
    } else {
      return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
    }

    const positions = await loadOpenPositions(sb, userId, mode);
    return NextResponse.json({
      ok: true,
      mode,
      positions,
      instruments: positions.map((position: any) => position.instrument),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
