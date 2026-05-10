import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createExecutionId, writeEngineEvent } from "@/lib/engine/events";
import { hasBlockingManualExecutionPendingForToday, readManualExecutionState } from "@/lib/signalcore/manualExecutionState";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";
import { deriveDecisionSnapshotGroundwork } from "@/lib/signalcore/decisionImpact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function clampPct(n: number, fallback = 0) {
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function addHoursIso(baseIso: string, hours: number) {
  const base = new Date(baseIso);
  const ms = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();
  return new Date(ms + Math.max(1, hours) * 60 * 60 * 1000).toISOString();
}

function sumHoldingsValueEUR(holdings: any[]) {
  return (holdings ?? []).reduce((s, h) => s + safeNum(h?.valueEur ?? h?.value_eur ?? h?.value ?? 0, 0), 0);
}

function asObject(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value: any) {
  return Array.isArray(value) ? value : [];
}

function asString(value: any) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function readDecisionTrace(engineV4: any) {
  const structured = (engineV4 as any)?.decisionTrace;
  return structured && typeof structured === "object" && !Array.isArray(structured) && Object.keys(structured).length > 0
    ? structured
    : asArray((engineV4 as any)?.trace).slice(0, 10);
}

function pickLifecycleFirstDailyAt(previousSnapshotRow: any | null, snapshot: any, nowIso: string) {
  const prevMeta = asObject(previousSnapshotRow?.meta);
  const prevLifecycle = asObject((prevMeta as any)?.decisionLifecycle);
  const snapshotDaily = asObject(snapshot?.daily);
  const snapshotPerfect = asObject((snapshotDaily as any)?.perfectLoop);
  const snapshotLifecycle = asObject((snapshotPerfect as any)?.decisionLifecycle);
  return (
    asString((snapshotLifecycle as any)?.firstDailyAt) ||
    asString((prevLifecycle as any)?.firstDailyAt) ||
    nowIso
  );
}

function buildPerfectLoopSnapshotMeta(args: {
  snapshot: any;
  previousSnapshotRow: any | null;
  nowIso: string;
  dayKey: string;
  executionId: string;
  proofPackId: string;
}) {
  const snapshot = asObject(args.snapshot);
  const daily = asObject((snapshot as any)?.daily);
  const derived = asObject((snapshot as any)?.derived);
  const perfectLoop = asObject((daily as any)?.perfectLoop);
  const lifecycle = asObject((perfectLoop as any)?.decisionLifecycle);
  const progression = asObject((perfectLoop as any)?.progression);
  const overnightChanges = asObject((perfectLoop as any)?.overnightChanges);
  const accountability = asObject((perfectLoop as any)?.accountability);
  const systemStatus = asObject((perfectLoop as any)?.systemStatus);
  const capitalStatus = asObject((daily as any)?.capitalStatus);
  const nextBestAction = asObject((daily as any)?.nextBestAction);
  const dailyScores = asObject((daily as any)?.scores);
  const scoreAudit = asObject((daily as any)?.scoreAudit);
  const auditTrail = asObject((daily as any)?.auditTrail);
  const replayAudit = asObject((daily as any)?.replayAudit);
  const engineV4 = asObject((daily as any)?.engineV4);
  const engineV4Scores = asObject((engineV4 as any)?.scores);
  const engineV4Audit = asObject((engineV4 as any)?.audit);
  const decisionGroundwork = deriveDecisionSnapshotGroundwork(snapshot);

  const firstDailyAt = pickLifecycleFirstDailyAt(args.previousSnapshotRow, snapshot, args.nowIso);
  const streakDays = Math.max(0, Math.round(Number((lifecycle as any)?.streakDays ?? (derived as any)?.streak ?? 0)));
  const baselineSnapshotCreated = !args.previousSnapshotRow;
  const decisionLifecycle = {
    sessionState: asString((lifecycle as any)?.sessionState),
    stage: asString((lifecycle as any)?.stage) || "DAY_CLOSED",
    decisionIntent:
      asString((lifecycle as any)?.decisionIntent) ||
      asString((nextBestAction as any)?.intent) ||
      asString((nextBestAction as any)?.reason),
    firstDailyAt,
    lastDailyAt: args.nowIso,
    streakDays,
    cycleCount: Math.max(0, Math.round(Number((lifecycle as any)?.cycleCount ?? (derived as any)?.receiptsCount ?? 0))),
    baselineSnapshotCreated,
    closeExecutionId: args.executionId,
    proofPackId: args.proofPackId,
    decisionStateReason: decisionGroundwork.decisionStateReason,
    decisionAction: decisionGroundwork.decisionAction,
    stabilitySource: decisionGroundwork.stabilitySource,
  };

  return {
    capitalStatus: {
      posture: asString((capitalStatus as any)?.posture),
      planAlignment: asString((capitalStatus as any)?.planAlignment),
      riskPressure: Number.isFinite(Number((capitalStatus as any)?.riskPressure)) ? Number((capitalStatus as any)?.riskPressure) : null,
      exposurePct: Number.isFinite(Number((capitalStatus as any)?.exposurePct)) ? Number((capitalStatus as any)?.exposurePct) : null,
      cashPct: Number.isFinite(Number((capitalStatus as any)?.cashPct)) ? Number((capitalStatus as any)?.cashPct) : null,
      nextEvaluationAt: asString((capitalStatus as any)?.nextEvaluationAt),
    },
    scores: {
      autopilotScore:
        Number.isFinite(Number((dailyScores as any)?.autopilotScore))
          ? Number((dailyScores as any)?.autopilotScore)
          : Number.isFinite(Number((engineV4Scores as any)?.autopilotScore))
            ? Number((engineV4Scores as any)?.autopilotScore)
            : Number.isFinite(Number((derived as any)?.autopilotScore))
              ? Number((derived as any)?.autopilotScore)
              : null,
      decisionConfidence: Number.isFinite(Number((dailyScores as any)?.decisionConfidence)) ? Number((dailyScores as any)?.decisionConfidence) : null,
      riskPressure:
        Number.isFinite(Number((dailyScores as any)?.riskPressure))
          ? Number((dailyScores as any)?.riskPressure)
          : Number.isFinite(Number((capitalStatus as any)?.riskPressure))
            ? Number((capitalStatus as any)?.riskPressure)
            : null,
      planCoherence: Number.isFinite(Number((dailyScores as any)?.planCoherence)) ? Number((dailyScores as any)?.planCoherence) : null,
      proofQualityScore: Number.isFinite(Number((engineV4Scores as any)?.proofQualityScore)) ? Number((engineV4Scores as any)?.proofQualityScore) : null,
      dataQualityScore: Number.isFinite(Number((engineV4Scores as any)?.dataQualityScore)) ? Number((engineV4Scores as any)?.dataQualityScore) : null,
      reliabilityScore: Number.isFinite(Number((engineV4Scores as any)?.reliabilityScore)) ? Number((engineV4Scores as any)?.reliabilityScore) : null,
    },
    trends: {
      trendChips: asArray((progression as any)?.trendChips).slice(0, 4),
      narrative: asString((progression as any)?.narrative),
      overnightChanges: asArray((overnightChanges as any)?.items).slice(0, 6),
    },
    decisionTrace: readDecisionTrace(engineV4),
    decisionIntent: decisionLifecycle.decisionIntent,
    inputHash: asString((engineV4 as any)?.inputHash),
    engineV4Audit: Object.keys(engineV4Audit).length ? engineV4Audit : null,
    scoreAudit: Object.keys(scoreAudit).length ? scoreAudit : null,
    auditTrail: Object.keys(auditTrail).length ? auditTrail : null,
    replayAudit: Object.keys(replayAudit).length ? replayAudit : null,
    projectedOutcomes: null,
    decisionLifecycle,
    accountability: {
      status: asString((accountability as any)?.status),
      line: asString((accountability as any)?.line),
    },
    systemStatus: {
      status: asString((systemStatus as any)?.status),
      lastEvaluationAt: asString((systemStatus as any)?.lastEvaluationAt),
      nextEvaluationAt: asString((systemStatus as any)?.nextEvaluationAt),
    },
    nextBestAction: {
      type: asString((nextBestAction as any)?.type),
      instruction: asString((nextBestAction as any)?.instruction),
      reason: asString((nextBestAction as any)?.reason),
      reasons: asArray((nextBestAction as any)?.reasons).slice(0, 6),
      source: asString((nextBestAction as any)?.source),
      engineVersion: asString((nextBestAction as any)?.engineVersion),
    },
  };
}

async function deleteJournalEntry(params: { sb: any; userId: string; id: string | null | undefined }) {
  if (!params.id) return { ok: true as const };
  const { error } = await params.sb.from("journal_entries").delete().eq("user_id", params.userId).eq("id", params.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

async function restoreDailySnapshot(params: {
  sb: any;
  userId: string;
  mode: string;
  dayKey: string;
  previousRow: any | null;
}) {
  const { sb, userId, mode, dayKey, previousRow } = params;
  if (previousRow) {
    const { error } = await sb.from("daily_snapshots").upsert(previousRow, { onConflict: "user_id,mode,day_key" } as any);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, action: "restored_previous" as const };
  }

  const { error } = await sb.from("daily_snapshots").delete().eq("user_id", userId).eq("mode", mode).eq("day_key", dayKey);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, action: "deleted_new" as const };
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  const executionId = createExecutionId("daily_close");
  const proofPackId = createExecutionId("proof");
  let fallbackUserIdForError: string | null = null;
  let fallbackModeForError = "investing";

  try {
    const { userId } = await auth();
    fallbackUserIdForError = userId ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const access = await resolveModeAccess({
      supabase,
      userId,
      requestedMode: "investing",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
        { status: access.status }
      );
    }
    const mode = access.mode;
    fallbackModeForError = mode;

    const snapshot = body?.snapshot ?? null;
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ ok: false, error: "snapshot_required" }, { status: 400 });
    }

    const dailyDoneInput = asObject(body?.dailyDone);
    const dailyDoneType = String(dailyDoneInput.type || "daily_done");
    const dailyDoneTitle =
      String(dailyDoneInput.title || "").trim() || (dailyDoneType === "daily_done" ? "Daily completed" : "Daily close");
    const dailyDoneDetailsInput = asObject(dailyDoneInput.details);

    const portfolio = asObject(snapshot?.portfolio ?? body?.portfolio ?? {});
    const cash = safeNum(portfolio?.cash ?? portfolio?.cashEur ?? portfolio?.cash_eur ?? 0, 0);
    const holdings =
      Array.isArray((portfolio as any)?.holdings)
        ? (portfolio as any).holdings
        : Array.isArray((portfolio as any)?.items)
          ? (portfolio as any).items
          : [];
    const holdingsValue = sumHoldingsValueEUR(holdings);
    const total = cash + holdingsValue;

    const now = new Date();
    const nowIso = now.toISOString();
    const dk = dayKeyUTC(now);
    const manualState = await readManualExecutionState({ sb: supabase, userId, mode });
    const pendingForToday = hasBlockingManualExecutionPendingForToday({
      snapshot: manualState.snapshot,
      nowIso,
    });
    const lastManualProof = manualState.snapshot.lastProof;
    const proofDate = lastManualProof?.confirmedAt ? new Date(lastManualProof.confirmedAt) : null;
    const proofDayKey = proofDate && Number.isFinite(proofDate.getTime()) ? dayKeyUTC(proofDate) : null;
    const manualProofAcceptedToday =
      Boolean(lastManualProof?.acceptedForCloseDay) &&
      Boolean(proofDayKey) &&
      proofDayKey === dk;

    if (pendingForToday && !manualProofAcceptedToday) {
      await writeEngineEvent({
        userId,
        mode,
        event: "daily_receipt_created",
        status: "warn",
        source: "api.daily_close",
        executionId,
        details: {
          stage: "manual_execution_pending",
          pendingRows: Number(manualState.snapshot.pending?.rows || 0),
          pendingLeakKey: manualState.snapshot.pending?.leakKey || null,
          lastProofAt: lastManualProof?.confirmedAt || null,
          lastProofAcceptedForCloseDay: Boolean(lastManualProof?.acceptedForCloseDay),
          duration_ms: Date.now() - startedAtMs,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          code: "manual_execution_pending",
          error: "Manual execution checklist pending. Confirm execution proof before closing the day.",
          pending: manualState.snapshot.pending,
          lastProof: manualState.snapshot.lastProof,
        },
        { status: 409 }
      );
    }

    const serverManualExecutionProof = manualProofAcceptedToday
      ? {
          broker: lastManualProof?.broker || "manual",
          leakKey: lastManualProof?.leakKey || null,
          completed: Number(lastManualProof?.completed || 0),
          total: Number(lastManualProof?.total || 0),
          note: lastManualProof?.note || null,
          reference: lastManualProof?.reference || null,
          feesEur: lastManualProof?.feesEur ?? null,
          slippageBps: lastManualProof?.slippageBps ?? null,
          qualityScore: Number(lastManualProof?.qualityScore || 0),
          confirmedAt: lastManualProof?.confirmedAt || nowIso,
          source: lastManualProof?.source || "manual_checklist",
          acceptedForCloseDay: true,
        }
      : null;

    const metaFromClient =
      snapshot?.derived?.pricing ??
      snapshot?.portfolio?.valuation ??
      snapshot?.derived?.diagnostics?.pricing ??
      null;

    const { data: previousSnapshotRow, error: previousSnapshotError } = await supabase
      .from("daily_snapshots")
      .select("*")
      .eq("user_id", userId)
      .eq("mode", mode)
      .eq("day_key", dk)
      .maybeSingle();

    if (previousSnapshotError) {
      await writeEngineEvent({
        userId,
        mode,
        event: "daily_receipt_created",
        status: "error",
        source: "api.daily_close",
        executionId,
        details: {
          stage: "load_previous_snapshot",
          error: previousSnapshotError.message,
          duration_ms: Date.now() - startedAtMs,
        },
      });
      return NextResponse.json({ ok: false, error: previousSnapshotError.message }, { status: 500 });
    }

    const perfectLoopSnapshotMeta = buildPerfectLoopSnapshotMeta({
      snapshot,
      previousSnapshotRow: previousSnapshotRow ?? null,
      nowIso,
      dayKey: dk,
      executionId,
      proofPackId,
    });
    const snapshotRow: any = {
      user_id: userId,
      mode,
      day_key: dk,
      as_of: nowIso,
      total_eur: total,
      cash_eur: cash,
      holdings,
      meta: {
        source: "daily_close_v1",
        closeExecutionId: executionId,
        proofPackId,
        holdingsCount: holdings?.length ?? 0,
        pricing: metaFromClient ?? null,
        capitalStatus: (perfectLoopSnapshotMeta as any)?.capitalStatus ?? null,
        scores: (perfectLoopSnapshotMeta as any)?.scores ?? null,
        scoreAudit: (perfectLoopSnapshotMeta as any)?.scoreAudit ?? null,
        auditTrail: (perfectLoopSnapshotMeta as any)?.auditTrail ?? null,
        trends: (perfectLoopSnapshotMeta as any)?.trends ?? null,
        decisionTrace: (perfectLoopSnapshotMeta as any)?.decisionTrace ?? null,
        decisionIntent: (perfectLoopSnapshotMeta as any)?.decisionIntent ?? null,
        inputHash: (perfectLoopSnapshotMeta as any)?.inputHash ?? null,
        engineV4: {
          audit: (perfectLoopSnapshotMeta as any)?.engineV4Audit ?? null,
        },
        replayMeta: (perfectLoopSnapshotMeta as any)?.replayAudit ?? null,
        decisionLifecycle: (perfectLoopSnapshotMeta as any)?.decisionLifecycle ?? null,
        accountability: (perfectLoopSnapshotMeta as any)?.accountability ?? null,
        systemStatus: (perfectLoopSnapshotMeta as any)?.systemStatus ?? null,
        nextBestAction: (perfectLoopSnapshotMeta as any)?.nextBestAction ?? null,
        projectedOutcomes: null,
        last_daily_at: nowIso,
        first_daily_at: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.firstDailyAt ?? nowIso,
        streak_days: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.streakDays ?? 0,
      },
      snapshot,
      created_at: nowIso,
    };

    let snapshotWritten = false;
    let decisionReceiptId: string | null = null;
    let dailyDoneJournalId: string | null = null;

    const rollbackWrites = async (stage: string) => {
      const rollback: {
        ok: boolean;
        snapshot?: any;
        decisionReceipt?: any;
      } = { ok: true };

      if (decisionReceiptId) {
        const deleted = await deleteJournalEntry({ sb: supabase, userId, id: decisionReceiptId });
        rollback.decisionReceipt = deleted;
        if (!deleted.ok) rollback.ok = false;
      }

      if (snapshotWritten) {
        const restored = await restoreDailySnapshot({
          sb: supabase,
          userId,
          mode,
          dayKey: dk,
          previousRow: previousSnapshotRow ?? null,
        });
        rollback.snapshot = restored;
        if (!restored.ok) rollback.ok = false;
      }

      await writeEngineEvent({
        userId,
        mode,
        event: "daily_receipt_created",
        status: "error",
        source: "api.daily_close",
        executionId,
        details: {
          stage,
          rollbackOk: rollback.ok,
          rollback,
          duration_ms: Date.now() - startedAtMs,
        },
      });

      return rollback;
    };

    const snapshotWrite = await supabase.from("daily_snapshots").upsert(snapshotRow, {
      onConflict: "user_id,mode,day_key",
    } as any);
    if (snapshotWrite.error) {
      await writeEngineEvent({
        userId,
        mode,
        event: "daily_receipt_created",
        status: "error",
        source: "api.daily_close",
        executionId,
        details: {
          stage: "upsert_snapshot",
          dayKey: dk,
          error: snapshotWrite.error.message,
          duration_ms: Date.now() - startedAtMs,
        },
      });
      return NextResponse.json({ ok: false, error: snapshotWrite.error.message }, { status: 500 });
    }
    snapshotWritten = true;

    const decisionReceiptPayload = {
      user_id: userId,
      mode,
      type: "decision_receipt",
      title: "Decision receipt",
      details: {
        day_key: dk,
        close_execution_id: executionId,
        proofPackId,
        total_eur: total,
        cash_eur: cash,
        holdingsCount: holdings?.length ?? 0,
        pricing: metaFromClient ?? null,
      },
      created_at: nowIso,
    };

    const decisionInsert = await supabase.from("journal_entries").insert(decisionReceiptPayload).select("id").maybeSingle();
    if (decisionInsert.error) {
      const rollback = await rollbackWrites("insert_decision_receipt");
      return NextResponse.json(
        {
          ok: false,
          error: decisionInsert.error.message,
          stage: "insert_decision_receipt",
          rollback,
        },
        { status: 500 }
      );
    }
    decisionReceiptId = decisionInsert.data?.id ? String(decisionInsert.data.id) : null;

    const dailyDonePayload = {
      user_id: userId,
      mode,
      type: dailyDoneType,
      title: dailyDoneTitle,
      details: {
        ...dailyDoneDetailsInput,
        manualExecutionProof:
          serverManualExecutionProof ??
          ((dailyDoneDetailsInput as any)?.manualExecutionProof && typeof (dailyDoneDetailsInput as any).manualExecutionProof === "object"
            ? (dailyDoneDetailsInput as any).manualExecutionProof
            : null),
        dayKey: dk,
        closeExecutionId: executionId,
        proofPackId,
        decisionReceiptJournalId: decisionReceiptId,
        decisionLifecycle: (perfectLoopSnapshotMeta as any)?.decisionLifecycle ?? null,
        nextBestAction: (perfectLoopSnapshotMeta as any)?.nextBestAction ?? null,
        capitalStatus: (perfectLoopSnapshotMeta as any)?.capitalStatus ?? null,
        scores: (perfectLoopSnapshotMeta as any)?.scores ?? null,
        scoreAudit: (perfectLoopSnapshotMeta as any)?.scoreAudit ?? null,
        auditTrail: (perfectLoopSnapshotMeta as any)?.auditTrail ?? null,
        replayAudit: (perfectLoopSnapshotMeta as any)?.replayAudit ?? null,
      },
      created_at: nowIso,
    };

    const dailyDoneInsert = await supabase.from("journal_entries").insert(dailyDonePayload).select("id").maybeSingle();
    if (dailyDoneInsert.error) {
      const rollback = await rollbackWrites("insert_daily_done");
      return NextResponse.json(
        {
          ok: false,
          error: dailyDoneInsert.error.message,
          stage: "insert_daily_done",
          rollback,
        },
        { status: 500 }
      );
    }
    dailyDoneJournalId = dailyDoneInsert.data?.id ? String(dailyDoneInsert.data.id) : null;

    await writeEngineEvent({
      userId,
      mode,
      event: "daily_receipt_created",
      status: "ok",
      source: "api.daily_close",
      executionId,
      details: {
        dayKey: dk,
        totalEur: total,
        cashEur: cash,
        holdingsCount: holdings?.length ?? 0,
        decisionReceiptId,
        dailyDoneJournalId,
        proofPackId,
        duration_ms: Date.now() - startedAtMs,
      },
    });

    const exposurePct = total > 0 ? clampPct((holdingsValue / total) * 100, 0) : 0;
    const cashPct = total > 0 ? clampPct((cash / total) * 100, 0) : 100;
    const nextEvaluationAt = addHoursIso(nowIso, 12);

    await writeEngineEvent({
      userId,
      mode,
      event: "day_closed",
      status: "ok",
      source: "api.daily_close",
      executionId,
      details: {
        dayKey: dk,
        proofPackId,
        exposurePct,
        cashPct,
        totalEur: total,
        duration_ms: Date.now() - startedAtMs,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        mode,
        executionId,
        proofPackId,
        dayKey: dk,
        totalEUR: total,
        journal: {
          decisionReceiptId,
          dailyDoneId: dailyDoneJournalId,
        },
        receiptTicket: {
          id: proofPackId,
          executionId,
          dayKey: dk,
          stored: true,
          actionCompleted: true,
        },
        capitalStatus: {
          posture: cashPct >= 80 ? "SURVIVAL" : cashPct >= 50 ? "CAUTION" : "STABLE",
          planAlignment: "OK",
          riskPressure: 0,
          exposurePct,
          cashPct,
          nextEvaluationAt,
        },
        completionReward: {
          message: "Action completed. Receipt stored. Syntrake continues monitoring market conditions.",
          exposureAfterExecutionPct: exposurePct,
          cashLevelPct: cashPct,
          receiptStored: true,
        },
        systemContinuity: {
          state: "monitoring",
          tone: "institutional_calm",
          message: "Day closed. Syntrake continues monitoring market conditions.",
          nextEvaluationAt,
        },
        lifecycle: {
          sessionState: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.sessionState ?? null,
          stage: "DAY_CLOSED",
          decisionIntent: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.decisionIntent ?? null,
          firstDailyAt: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.firstDailyAt ?? nowIso,
          lastDailyAt: nowIso,
          streakDays: (perfectLoopSnapshotMeta as any)?.decisionLifecycle?.streakDays ?? 0,
          baselineSnapshotCreated: Boolean((perfectLoopSnapshotMeta as any)?.decisionLifecycle?.baselineSnapshotCreated),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    if (fallbackUserIdForError) {
      await writeEngineEvent({
        userId: fallbackUserIdForError,
        mode: fallbackModeForError,
        event: "daily_receipt_created",
        status: "error",
        source: "api.daily_close",
        executionId,
        details: { error: e?.message || "unknown_error", duration_ms: Date.now() - startedAtMs },
      });
    }
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

