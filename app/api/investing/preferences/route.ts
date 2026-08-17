import { NextResponse } from "next/server";

import { investingAuthzResponse, requireInvestingUser } from "@/lib/investing/server/authz";
import {
  InvestingPreferencesError,
  readInvestingUiPreferences,
  validateInvestingUiPreferencesInput,
  writeInvestingUiPreferences,
} from "@/lib/investing/server/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function preferencesErrorResponse(error: unknown) {
  if (error instanceof InvestingPreferencesError) {
    return reply({ ok: false, error: error.code }, error.status);
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireInvestingUser(req);
    return reply({ ok: true, ...(await readInvestingUiPreferences({ userId: auth.userId })) });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const preferencesResponse = preferencesErrorResponse(error);
    if (preferencesResponse) return preferencesResponse;
    return reply({ ok: false, error: "investing_preferences_unavailable" }, 503);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireInvestingUser(req);
    const body = await req.json().catch(() => null);
    const preferences = validateInvestingUiPreferencesInput(body);
    return reply({ ok: true, ...(await writeInvestingUiPreferences({ userId: auth.userId, preferences })) });
  } catch (error: unknown) {
    const authzResponse = investingAuthzResponse(error);
    if (authzResponse) return authzResponse;
    const preferencesResponse = preferencesErrorResponse(error);
    if (preferencesResponse) return preferencesResponse;
    return reply({ ok: false, error: "investing_preferences_unavailable" }, 503);
  }
}
