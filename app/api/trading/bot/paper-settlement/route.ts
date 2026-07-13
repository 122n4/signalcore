import { NextResponse } from "next/server";

import { isEngineLoopAuthorized } from "@/lib/engine/loopAuth";
import { selectPaperOwnerBatch } from "@/lib/trading/bot/ownerBatch";
import { runPaperSettlementCycleForUser } from "@/lib/trading/bot/paperRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function maxSettlements() {
  const raw = Number(process.env.SYNTRAKE_BOT_PAPER_MAX_SETTLEMENTS_PER_RUN ?? 8);
  return Number.isFinite(raw) ? Math.max(0, Math.min(20, Math.round(raw))) : 8;
}

async function handleSettlement(req: Request) {
  if (!isEngineLoopAuthorized({ headers: req.headers, env: process.env })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const owners = selectPaperOwnerBatch();
  if (owners.length === 0) {
    return NextResponse.json(
      { ok: false, error: "missing_owner_user_ids" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const generatedAt = new Date().toISOString();
  const results = [];
  for (const userId of owners) {
    try {
      results.push(
        await runPaperSettlementCycleForUser({
          userId,
          triggerSource: "scheduler",
          maxSettlements: maxSettlements(),
        }),
      );
    } catch (error: any) {
      results.push({
        ok: false,
        status: "settlement_failed",
        userId,
        settled: 0,
        failures: 1,
        generatedAt,
        message: error?.message || "paper_settlement_user_failed",
      });
    }
  }

  return NextResponse.json(
    {
      ok: results.every((result) => result.ok !== false),
      generatedAt,
      maxSettlements: maxSettlements(),
      ownersChecked: results.length,
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  return handleSettlement(req);
}

export async function POST(req: Request) {
  return handleSettlement(req);
}
