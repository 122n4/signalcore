import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { investingAuthzResponse, requireInvestingRequestContext } from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const GOALS = new Set(["balanced", "growth", "income", "preservation"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);
const HORIZONS = new Set(["Short", "Medium", "Long"]);
const GOAL_TEXT: Record<string, string> = {
  balanced: "Balanced growth with controlled risk",
  growth: "Long-term growth and compounding",
  income: "Income and dividend cashflow",
  preservation: "Capital preservation and safety",
};

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function finiteMoney(value: unknown, min: number, max: number) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

function assertQuery(error: { message?: string } | null | undefined, code: string) {
  if (error) throw new Error(`${code}:${error.message || "database_error"}`);
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 16_384) return reply({ ok: false, error: "request_too_large" }, 413);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ ok: false, error: "invalid_request" }, 400);

    const action = String((body as any).action || "");
    const createNew = action === "create_plan_version";
    if (action !== "save_plan" && !createNew) return reply({ ok: false, error: "invalid_action" }, 400);

    const clientRequestId = String((body as any).clientRequestId || "").trim();
    const goalType = String((body as any).goalType || "").trim().toLowerCase();
    const riskProfile = String((body as any).riskProfile || "").trim();
    const horizon = String((body as any).horizon || "").trim();
    const targetValue = finiteMoney((body as any).targetValue, 100, 1_000_000_000);
    const monthlyContribution = finiteMoney((body as any).monthlyContribution ?? 0, 0, 10_000_000);

    if (!SAFE_ID.test(clientRequestId)) return reply({ ok: false, error: "invalid_client_request_id" }, 400);
    if (!GOALS.has(goalType) || !RISK_PROFILES.has(riskProfile) || !HORIZONS.has(horizon) || targetValue == null || monthlyContribution == null) {
      return reply({ ok: false, error: "invalid_plan_command" }, 400);
    }

    const now = new Date().toISOString();
    const database = getInvestingSupabaseAdmin() as any;
    const planPayload = {
      contractVersion: "investing-plan-settings/v1",
      clientRequestId,
      goalType,
      riskProfile,
      horizon,
      targetValueEur: targetValue,
      monthlyContributionEur: monthlyContribution,
      savedAt: now,
    };
    const settingsResult = await database
      .from("user_settings")
      .upsert({
        user_id: authz.userId,
        active_mode: "investing",
        goal_type: goalType,
        goal_amount: targetValue,
        goal_target_value: targetValue,
        monthly_contribution: monthlyContribution,
        risk_profile: riskProfile,
        horizon,
        setup_status: "complete",
        setup_mode: "offline",
        plan_v1: planPayload,
        plan_active: true,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();
    assertQuery(settingsResult.error, "investing_settings_write_failed");

    const currentResult = await database
      .from("plans")
      .select("id,goal,version,activated_at")
      .eq("user_id", authz.userId)
      .eq("mode", "investing")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertQuery(currentResult.error, "investing_plan_read_failed");

    const current = currentResult.data as Record<string, unknown> | null;
    let planResult;
    if (current && !createNew) {
      planResult = await database
        .from("plans")
        .update({
          goal: GOAL_TEXT[goalType],
          status: "active",
          is_active: true,
          version: Math.max(1, Number(current.version) || 1) + 1,
          activated_at: current.activated_at || now,
          archived_at: null,
          updated_at: now,
        })
        .eq("id", current.id)
        .eq("user_id", authz.userId)
        .select("*")
        .maybeSingle();
    } else {
      if (current) {
        const archiveResult = await database
          .from("plans")
          .update({ status: "archived", is_active: false, archived_at: now, updated_at: now })
          .eq("user_id", authz.userId)
          .eq("mode", "investing")
          .eq("is_active", true);
        assertQuery(archiveResult.error, "investing_plan_archive_failed");
      }
      planResult = await database
        .from("plans")
        .insert({
          user_id: authz.userId,
          mode: "investing",
          goal: GOAL_TEXT[goalType],
          status: "active",
          is_active: true,
          version: 1,
          activated_at: now,
          updated_at: now,
        })
        .select("*")
        .maybeSingle();
    }
    assertQuery(planResult.error, "investing_plan_write_failed");

    return reply({
      ok: true,
      plan: planResult.data,
      settings: settingsResult.data,
      createdNew: createNew || !current,
    });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const code = String((error as { message?: string })?.message || "investing_plan_write_failed").split(":", 1)[0];
    return reply({ ok: false, error: code }, code.includes("invalid") ? 400 : 500);
  }
}
