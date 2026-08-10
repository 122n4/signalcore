import { NextResponse } from "next/server";

import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";
import { investingAuthzResponse, requireInvestingRequestContext } from "@/lib/investing/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set(["beginner", "pro"]);

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const authz = await requireInvestingRequestContext(req);
    if (Number(req.headers.get("content-length") || 0) > 4096) return reply({ ok: false, error: "request_too_large" }, 413);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ ok: false, error: "invalid_request" }, 400);

    const action = String((body as any).action || "");
    if (action !== "update_mission_brief") return reply({ ok: false, error: "invalid_action" }, 400);

    const missionBriefHidden = Boolean((body as any).missionBriefHidden);
    const missionBriefMode = String((body as any).missionBriefMode || "beginner").toLowerCase();
    if (!MODES.has(missionBriefMode)) return reply({ ok: false, error: "invalid_mission_brief_mode" }, 400);

    const now = new Date().toISOString();
    const investingUiState = {
      contractVersion: "investing-ui-state/v1",
      missionBriefHidden,
      missionBriefMode,
      updatedAt: now,
    };

    const database = getInvestingSupabaseAdmin() as any;
    const result = await database
      .from("user_settings")
      .upsert({
        user_id: authz.userId,
        active_mode: "investing",
        investing_ui_state: investingUiState,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("user_id,investing_ui_state")
      .maybeSingle();

    if (result.error) return reply({ ok: false, error: "investing_preferences_write_failed" }, 500);
    return reply({ ok: true, investingUiState: result.data?.investing_ui_state ?? investingUiState });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    return reply({ ok: false, error: "investing_preferences_write_failed" }, 500);
  }
}
