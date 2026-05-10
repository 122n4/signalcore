import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDayKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayBoundsUtc(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function asObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function readProofPackIdFromRow(row: any) {
  const details = asObject(row.details);
  const meta = asObject(row.meta);
  const id =
    details.proofPackId ??
    details.proof_pack_id ??
    meta.proofPackId ??
    meta.proof_pack_id ??
    null;
  return id ? String(id) : null;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dayKey = String(url.searchParams.get("dayKey") || "").trim();
  const requestedProofPackId = String(url.searchParams.get("proofPackId") || "").trim() || null;

  if (!isDayKey(dayKey)) {
    return NextResponse.json({ ok: false, error: "invalid_day_key" }, { status: 400 });
  }

  const { startIso, endIso } = dayBoundsUtc(dayKey);
  const sb = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase: sb,
    userId,
    requestedMode: url.searchParams.get("mode"),
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;

  const [{ data: snapshotRow, error: snapErr }, { data: journalRows, error: journalErr }] = await Promise.all([
    sb
      .from("daily_snapshots")
      .select("user_id,mode,day_key,as_of,total_eur,cash_eur,holdings,meta,snapshot,created_at")
      .eq("user_id", userId)
      .eq("mode", mode)
      .eq("day_key", dayKey)
      .maybeSingle(),
    sb
      .from("journal_entries")
      .select("id,type,title,details,created_at,mode")
      .eq("user_id", userId)
      .eq("mode", mode)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .in("type", ["decision_receipt", "daily_done", "execution_proof", "fix_now_run", "engine_event"])
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  if (snapErr) return NextResponse.json({ ok: false, error: snapErr.message }, { status: 500 });
  if (journalErr) return NextResponse.json({ ok: false, error: journalErr.message }, { status: 500 });

  const snapshotMeta = asObject(snapshotRow.meta);
  const snapshotProofPackId = readProofPackIdFromRow(snapshotRow);
  const allJournal = Array.isArray(journalRows) ? journalRows : [];

  const matchingJournal = requestedProofPackId
    ? allJournal.filter((row) => readProofPackIdFromRow(row) === requestedProofPackId || row.type === "execution_proof")
    : allJournal;

  const decisionReceipt = matchingJournal.find((row: any) => String(row.type || "") === "decision_receipt") || null;
  const dailyDone = matchingJournal.find((row: any) => String(row.type || "") === "daily_done") || null;
  const executionProofs = matchingJournal.filter((row: any) => String(row.type || "") === "execution_proof");
  const fixRuns = matchingJournal.filter((row: any) => String(row.type || "") === "fix_now_run");
  const engineEvents = matchingJournal.filter((row: any) => String(row.type || "") === "engine_event");

  const proofPackId =
    requestedProofPackId ||
    readProofPackIdFromRow(dailyDone) ||
    readProofPackIdFromRow(decisionReceipt) ||
    snapshotProofPackId;

  if (!snapshotRow && !dailyDone && !decisionReceipt) {
    return NextResponse.json({ ok: false, error: "proof_pack_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      dayKey,
      proofPackId,
      pack: {
        snapshot: snapshotRow
          ? {
              dayKey: String(snapshotRow.day_key || dayKey),
              asOf: snapshotRow.as_of ? String(snapshotRow.as_of) : null,
              totalEur: Number.isFinite(Number(snapshotRow.total_eur)) ? Number(snapshotRow.total_eur) : null,
              cashEur: Number.isFinite(Number(snapshotRow.cash_eur)) ? Number(snapshotRow.cash_eur) : null,
              holdingsCount: Array.isArray(snapshotRow.holdings) ? snapshotRow.holdings.length : 0,
              meta: snapshotMeta,
              snapshot: snapshotRow.snapshot ?? null,
            }
          : null,
        journal: {
          decisionReceipt,
          dailyDone,
          executionProofs,
          fixRuns,
          engineEvents,
          count: matchingJournal.length,
        },
      },
      replay: {
        closeStatus: dailyDone ? "closed" : snapshotRow ? "snapshot_only" : "missing",
        hasExecutionProof: executionProofs.length > 0 || Boolean(asObject(dailyDone.details).manualExecutionProof),
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
