import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import {
  buildBotSnapshotPlan,
  parseBotOption,
  parseLiveAcknowledgement,
} from "@/lib/trading/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isOwnerUserId(userId) && !isLocalQaUserId(userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const option = parseBotOption(url.searchParams.get("option"));
  const armedAt = parseLiveAcknowledgement(url.searchParams.get("armedAt"));
  const asOf = new Date().toISOString();

  try {
    const snapshotPlan = await buildBotSnapshotPlan({ userId, option, armedAt, asOf });
    const candidate = snapshotPlan.candidate;

    if (!candidate) {
      return NextResponse.json(
        {
          ok: true,
          status: "no_signal",
          option,
          armed: Boolean(armedAt),
          generatedAt: asOf,
          message: snapshotPlan.readError
            ? `No bot candidate available. Snapshot read issue: ${snapshotPlan.readError}`
            : "No stored trading scanner snapshot is available for the bot.",
          candidate: null,
          plan: null,
          account: null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const decision = snapshotPlan.decision!;
    const account = snapshotPlan.account!;
    const plan = snapshotPlan.plan!;
    const status = plan.action === "ready" ? "ready" : "blocked";

    return NextResponse.json(
      {
        ok: true,
        status,
        option,
        armed: Boolean(armedAt),
        generatedAt: asOf,
        message:
          status === "ready"
            ? option === "real_money_when_armed"
              ? "Real-money policy is ready, but no live broker adapter is connected yet."
              : "Paper bot plan is ready. No real order will be sent."
            : "Bot policy blocked execution for this candidate.",
        candidate: {
          instrument: decision.instrument,
          side: decision.side,
          state: candidate.decisionCore.decision.currentState,
          executionStatus: decision.executionStatus,
          snapshotFresh: decision.snapshotFresh,
          marketOpen: decision.marketOpen,
          snapshotAt: decision.snapshotAt,
          reason: decision.reason,
        },
        plan,
        account: {
          equity: account.equity,
          currency: account.currency,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        option,
        armed: Boolean(armedAt),
        generatedAt: asOf,
        message: "Bot plan failed.",
        candidate: null,
        plan: null,
        account: null,
        error: error?.message || "bot_plan_failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
