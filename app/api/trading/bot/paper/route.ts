import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import {
  buildApiRequestContext,
  jsonWithRequestContext,
  logApiEvent,
  toErrorMessage,
} from "@/lib/ops/apiObservability";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import {
  readPaperHistoryPayloadSafe,
  runPaperBotCycleForUser,
} from "@/lib/trading/bot/paperRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBotOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

export async function GET(req: Request) {
  const context = buildApiRequestContext(req);
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonWithRequestContext(context, { ok: false, error: "unauthorized" }, { status: 401 });
    if (!isBotOperator(userId)) return jsonWithRequestContext(context, { ok: false, error: "forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 183);
    return jsonWithRequestContext(
      context,
      {
        ok: true,
        ...(await readPaperHistoryPayloadSafe(userId, {
          days: Number.isFinite(days) ? days : 183,
          maxSettlements: 4,
        })),
      },
    );
  } catch (error: any) {
    logApiEvent({
      scope: "trading.bot.paper.read",
      level: "error",
      context,
      details: { error: toErrorMessage(error, "paper_history_failed") },
    });
    return jsonWithRequestContext(
      context,
      { ok: false, error: toErrorMessage(error, "paper_history_failed") },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const context = buildApiRequestContext(req);
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonWithRequestContext(context, { ok: false, error: "unauthorized" }, { status: 401 });
    if (!isBotOperator(userId)) return jsonWithRequestContext(context, { ok: false, error: "forbidden" }, { status: 403 });

    const result = await runPaperBotCycleForUser({
      userId,
      source: "manual",
      maxTradesPerDay: 3,
    });
    return jsonWithRequestContext(context, result, {
      status: result.status === "no_signal" ? 409 : 200,
    });
  } catch (error: any) {
    logApiEvent({
      scope: "trading.bot.paper.cycle",
      level: "error",
      context,
      details: { error: toErrorMessage(error, "paper_cycle_failed") },
    });
    return jsonWithRequestContext(
      context,
      { ok: false, error: toErrorMessage(error, "paper_cycle_failed") },
      { status: 500 },
    );
  }
}
