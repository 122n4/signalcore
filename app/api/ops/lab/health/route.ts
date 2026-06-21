import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { readResearchLabRemoteSnapshot } from "@/lib/trading/research/supabaseSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLabOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isLabOperator(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const remote = await readResearchLabRemoteSnapshot({ runLimit: 1, decisionLimit: 1 });
  const state = remote.state;
  const payload = state?.payload ?? {};
  const runtimeHealth = payload.runtime ?? null;
  const status = String(state?.status ?? "unknown");

  return NextResponse.json(
    {
      ok: remote.schemaReady && Boolean(state) && !remote.error,
      schemaReady: remote.schemaReady,
      generatedAt: new Date().toISOString(),
      source: state ? "supabase" : "none",
      status,
      running: status === "running",
      idle: status === "idle",
      failed: state?.severity === "error",
      lastHeartbeatAt: state?.heartbeat_at ?? runtimeHealth?.lock?.heartbeatAt ?? null,
      heartbeatAgeMs: state?.heartbeat_age_ms ?? runtimeHealth?.lock?.heartbeatAgeMs ?? null,
      lastSuccessfulRunAt: state?.last_successful_run_at ?? null,
      lastError: state?.last_error ?? remote.error ?? null,
      lockStatus: state?.lock_health ?? runtimeHealth?.lock?.health ?? "unknown",
      activeRunId: state?.active_run_id ?? runtimeHealth?.queue?.activeRunId ?? null,
      stage: state?.stage ?? runtimeHealth?.activeRun?.stage ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
