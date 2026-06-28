import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import {
  buildApiRequestContext,
  jsonWithRequestContext,
  logApiEvent,
  toErrorMessage,
} from "@/lib/ops/apiObservability";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { readPaperHistoryPayloadSafe } from "@/lib/trading/bot/paperRunner";
import { readResearchLabRemoteSnapshot } from "@/lib/trading/research/supabaseSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLabOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

export async function GET(req: Request) {
  const context = buildApiRequestContext(req);
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return jsonWithRequestContext(context, { ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!isLabOperator(userId)) {
      return jsonWithRequestContext(context, { ok: false, error: "forbidden" }, { status: 403 });
    }

    const remote = await readResearchLabRemoteSnapshot({ runLimit: 1, decisionLimit: 1 });
    const state = remote.state;
    const payload = state?.payload ?? {};
    const runtimeHealth = payload.runtime ?? null;
    const status = String(state?.status ?? "unknown");
    const paperTrading = await readPaperHistoryPayloadSafe(userId, { days: 183, maxSettlements: 4 });

    return jsonWithRequestContext(context, {
      ok: remote.schemaReady && Boolean(state) && !remote.error,
      schemaReady: remote.schemaReady,
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
      paperTrading,
    });
  } catch (error) {
    logApiEvent({
      scope: "ops.lab.health",
      level: "error",
      context,
      details: { error: toErrorMessage(error, "lab_health_failed") },
    });
    return jsonWithRequestContext(
      context,
      {
        ok: false,
        error: "lab_health_failed",
        message: toErrorMessage(error, "lab_health_failed"),
      },
      { status: 500 },
    );
  }
}
