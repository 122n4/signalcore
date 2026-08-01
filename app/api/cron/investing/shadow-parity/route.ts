import { NextResponse } from "next/server";

import { createScheduledShadowParityServiceV1 } from "@/lib/investing/shadow-parity/composition.server";
import { authorizedShadowParityCron } from "@/lib/investing/shadow-parity/cronAuthorization.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!authorizedShadowParityCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, reason: "shadow_parity_cron_not_authorized" }, { status: 401, headers: noStore });
  }
  const now = new Date();
  const result = await createScheduledShadowParityServiceV1().run({
    dayKey: now.toISOString().slice(0, 10),
    observedAt: now.toISOString(),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: noStore });
}
