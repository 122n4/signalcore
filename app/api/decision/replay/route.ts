import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode } from "@/lib/signalcore/modes";
import { buildEngineContext } from "@/lib/engine/v4/context";
import { computeDailyBundleV4 } from "@/lib/engine/v4";
import {
  buildDecisionReplayDiff,
  buildReplayComputationSignature,
  computeScoresAndReplayAudit,
} from "@/lib/signalcore/scoresAuditReplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function asArray(v: any) {
  return Array.isArray(v) ? v : [];
}

function asString(v: any) {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

function readDecisionTrace(engineV4: any) {
  const structured = (engineV4 as any)?.decisionTrace;
  return structured && typeof structured === "object" && !Array.isArray(structured) && Object.keys(structured).length > 0
    ? structured
    : asArray((engineV4 as any)?.trace);
}

function asNum(v: any, fallback = 0) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function mapEngineV4KindToLoopType(kind: any) {
  const k = String(kind || "").trim().toUpperCase();
  if (k === "EXECUTE_STARTER_PACK" || k === "MANUAL_BROKER_CHECKLIST") return "EXECUTE_BROKER";
  if (k === "ENTER_POSITION") return "ENTER";
  if (k === "DEPLOY_CASH") return "ADD";
  if (k === "REDUCE_CONCENTRATION" || k === "REBALANCE" || k === "HEDGE_RISK" || k === "ADJUST_STOPS") return "REDUCE";
  if (k === "EXIT_POSITION") return "EXIT";
  if (k === "PAUSE") return "PAUSE";
  if (k === "WAIT" || k === "HOLD") return "HOLD";
  return "HOLD";
}

function readInputHashFromSnapshotRow(row: any) {
  const meta = asObject(row.meta);
  const snap = asObject(row.snapshot);
  const daily = asObject((snap as any).daily);
  const engineV4 = asObject((daily as any).engineV4);
  return (
    asString((meta as any).inputHash) ||
    asString(asObject((meta as any).replayMeta).inputHash) ||
    asString((engineV4 as any).inputHash)
  );
}

function extractTopLeak(derived: any) {
  const d = asObject(derived);
  const diagnostics = asObject((d as any).diagnostics);
  const leaks = asArray((diagnostics as any).riskLeaks);
  const top = asObject(leaks[0]);
  return {
    key: asString((d as any).topLeakKey) || asString((top as any).key),
    title: asString((d as any).topRiskLeak) || asString((top as any).title),
    severity: asString((top as any).severity),
  };
}

function buildReplayV4ContextFromSnapshot(args: { userId: string; row: any }) {
  const row = args.row;
  const snap = asObject(row.snapshot);
  const mode = normalizeMode(row.mode || (snap as any).mode);
  const daily = asObject((snap as any).daily);
  const portfolio = asObject((snap as any).portfolio);
  const derived = asObject((snap as any).derived);
  const plan = asObject((snap as any).plan);
  const valuation = asObject((portfolio as any).valuation);
  const quotes = asObject((portfolio as any).quotes);
  const executionEvidence = asObject((daily as any).executionEvidence);
  const topLeak = extractTopLeak(derived);
  const asOf = asString((snap as any).asOf) || asString(row.as_of) || new Date().toISOString();

  const timeline = asArray((derived as any).receiptsTimeline);
  const closedDays7 = timeline.filter((r) => Boolean(asString((r as any).dayKey))).length;

  const ctx = buildEngineContext({
    userId: args.userId,
    mode,
    asOf,
    setupStatus: "complete",
    plan,
    portfolioItems: asArray((portfolio as any).items),
    portfolioCashEur: asNum((valuation as any).cashEur ?? (row as any).cash_eur, 0),
    valuation,
    quotes,
    dailyState: {
      doneToday: Boolean((derived as any).doneToday),
      receiptsCount: Math.max(0, Math.round(asNum((derived as any).receiptsCount, 0))),
      streak: Math.max(0, Math.round(asNum((derived as any).streak, 0))),
      lastSnapshotAt: asString((daily as any).lastSnapshotAt) || asString((row as any).created_at),
      lastProofAt: asString((executionEvidence as any).latestAt),
      lastProofQuality:
        (executionEvidence as any).avgQuality14 != null ? Math.max(0, Math.min(100, Math.round(asNum((executionEvidence as any).avgQuality14, 0)))) : null,
    },
    reliability: {
      executionRate7d:
        (executionEvidence as any).strongProofDays7 != null
          ? Math.max(0, Math.min(1, asNum((executionEvidence as any).strongProofDays7, 0) / 7))
          : null,
      closeDayRate7d: Math.max(0, Math.min(1, closedDays7 / 7)),
      dataCoveragePct: Math.max(0, Math.min(100, Math.round(asNum((valuation as any).coveragePct, 0)))),
    },
    access: {
      isPro: null,
      modeAllowed: true,
    },
    signals: {
      topRiskLeakKey: topLeak.key,
      topRiskLeakTitle: topLeak.title,
      topRiskLeakSeverity: topLeak.severity as any,
    },
  });

  return { ctx, mode, snap, daily, portfolio, derived, valuation, topLeak };
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const inputHash = asString((body as any).inputHash);
  if (!inputHash) {
    return NextResponse.json({ ok: false, error: "input_hash_required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("daily_snapshots")
    .select("user_id,mode,day_key,as_of,total_eur,cash_eur,holdings,meta,snapshot,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(365);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = asArray(data);
  const snapshotRow = rows.find((row) => readInputHashFromSnapshotRow(row) === inputHash);
  if (!snapshotRow) {
    return NextResponse.json({ ok: false, error: "snapshot_not_found_for_input_hash" }, { status: 404 });
  }

  const { ctx, mode, daily, derived, valuation, topLeak } = buildReplayV4ContextFromSnapshot({ userId, row: snapshotRow });
  const replayV4 = computeDailyBundleV4(ctx);

  const replayActionType = mapEngineV4KindToLoopType((replayV4 as any).decision.nextBestAction.kind);
  const storedNextBestAction = asObject((daily as any).nextBestAction);
  const storedCapitalStatusRaw = asObject((daily as any).capitalStatus);
  const storedScoresRaw = asObject((daily as any).scores);
  const actionGate = asObject((daily as any).actionGate);

  const replayScoreAudit = computeScoresAndReplayAudit({
    mode,
    hasPlan: Boolean((derived as any).hasPlan ?? (ctx as any).plan.hasPlan),
    hasHoldings: Boolean((derived as any).hasHoldings ?? (ctx as any).portfolio.hasHoldings),
    doneToday: Boolean((derived as any).doneToday),
    actionType: replayActionType,
    actionInstruction: asString((replayV4 as any).decision.nextBestAction.title),
    actionReason: asString((replayV4 as any).decision.whyNow),
    coveragePct: asNum((valuation as any).coveragePct, 0),
    exposurePct: asNum((storedCapitalStatusRaw as any).exposurePct, 0),
    cashPct: asNum((storedCapitalStatusRaw as any).cashPct, 100),
    topLeakKey: topLeak.key,
    topLeakSeverity: topLeak.severity,
    actionGateStatus: asString((actionGate as any).status),
    actionGateAllowExecution:
      typeof (actionGate as any).allowExecution === "boolean" ? Boolean((actionGate as any).allowExecution) : null,
    engineV4: {
      inputHash: asString((replayV4 as any).inputHash),
      confidence01:
        typeof (replayV4 as any).decision.confidence === "number" ? Number((replayV4 as any).decision.confidence) : null,
      aggression: asString((replayV4 as any).decision.aggression),
      trace: asArray((replayV4 as any).trace),
      guardrails: asArray((replayV4 as any).decision.guardrails),
      confidenceScore:
        typeof (replayV4 as any).scores.confidenceScore === "number" ? Number((replayV4 as any).scores.confidenceScore) : null,
    },
    executionReality: {
      brokerExecutionPending: replayActionType === "EXECUTE_BROKER",
      executionScoreValue: Number.isFinite(Number((derived as any).executionScore.score))
        ? Number((derived as any).executionScore.score)
        : null,
    },
  });

  const replayCapitalStatus = {
    ...storedCapitalStatusRaw,
    posture: replayScoreAudit.capitalStatusPatch.posture,
    planAlignment: replayScoreAudit.capitalStatusPatch.planAlignment,
    riskPressure: replayScoreAudit.scores.riskPressure,
  };

  const storedActionType =
    asString((storedNextBestAction as any).type) ||
    mapEngineV4KindToLoopType(asString(asObject((daily as any).engineV4).decision.nextBestAction.kind));

  const diffResult = buildDecisionReplayDiff({
    storedActionType,
    replayActionType,
    storedScores: {
      autopilotScore: Number.isFinite(Number((storedScoresRaw as any).autopilotScore)) ? Number((storedScoresRaw as any).autopilotScore) : null,
      decisionConfidence: Number.isFinite(Number((storedScoresRaw as any).decisionConfidence)) ? Number((storedScoresRaw as any).decisionConfidence) : null,
      riskPressure: Number.isFinite(Number((storedScoresRaw as any).riskPressure)) ? Number((storedScoresRaw as any).riskPressure) : null,
      planCoherence: Number.isFinite(Number((storedScoresRaw as any).planCoherence)) ? Number((storedScoresRaw as any).planCoherence) : null,
    } as any,
    replayScores: replayScoreAudit.scores,
    storedCapitalStatus: {
      posture: asString((storedCapitalStatusRaw as any).posture),
      planAlignment: asString((storedCapitalStatusRaw as any).planAlignment),
      riskPressure: Number.isFinite(Number((storedCapitalStatusRaw as any).riskPressure)) ? Number((storedCapitalStatusRaw as any).riskPressure) : null,
    },
    replayCapitalStatus,
  });

  const replayPayload = {
    nextBestAction: {
      type: replayActionType,
      instruction: asString((replayV4 as any).decision.nextBestAction.title),
      summary: asString((replayV4 as any).decision.nextBestAction.desc),
      reason: asString((replayV4 as any).decision.whyNow),
      reasons: replayScoreAudit.reasonList,
      cta: (replayV4 as any).decision.nextBestAction.cta ?? null,
      source: "engine_v4",
      engineVersion: (replayV4 as any).engineVersion || "v4-ultra",
      asOf: (replayV4 as any).asOf || (ctx as any).asOf,
    },
    decisionTrace: readDecisionTrace(replayV4),
    scores: replayScoreAudit.scores,
    capitalStatus: replayCapitalStatus,
    auditTrail: {
      notes: replayScoreAudit.audit.notes,
      noteCount: replayScoreAudit.audit.noteCount,
      inputHash: replayScoreAudit.audit.inputHash,
      deterministic: replayScoreAudit.audit.deterministic,
    },
  };

  const signature = buildReplayComputationSignature({
    mode,
    actionType: replayActionType,
    scores: replayScoreAudit.scores,
    capitalStatus: replayCapitalStatus,
    inputHash: replayScoreAudit.audit.inputHash,
  });

  const isProd = process.env.NODE_ENV === "production";
  return NextResponse.json(
    {
      ok: true,
      match: diffResult.match,
      ...(diffResult.match || isProd ? {} : { diff: diffResult.diff }),
      replay: replayPayload,
      metadata: {
        inputHash,
        replayInputHash: (replayV4 as any).inputHash || null,
        dayKey: asString((snapshotRow as any).day_key),
        mode,
        reproducible: Boolean(diffResult.match),
        signature,
      },
      stored: {
        nextBestActionType: storedActionType,
        scores: storedScoresRaw,
        capitalStatus: storedCapitalStatusRaw,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
