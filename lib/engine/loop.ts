import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";
import { loadBrokerConnection, saveBrokerConnection } from "@/lib/broker/store";
import { hasConnectionEvidence, normalizeBrokerConnection, type BrokerConnection } from "@/lib/broker/shared";
import { createExecutionId, writeEngineEvent } from "@/lib/engine/events";

type EngineTarget = {
  userId: string;
  mode: AutopilotMode;
  connection: BrokerConnection | null;
  due: boolean;
};

export type EngineLoopOptions = {
  limit?: number;
  userId?: string | null;
  mode?: string | null;
  dryRun?: boolean;
  force?: boolean;
  now?: Date;
};

export type EngineLoopResult = {
  ok: boolean;
  at: string;
  dryRun: boolean;
  force: boolean;
  scanned: number;
  due: number;
  synced: number;
  failed: number;
  skipped: number;
  rows: Array<{
    userId: string;
    mode: AutopilotMode;
    status: "synced" | "failed" | "skipped";
    reason?: string;
    sync?: {
      positions: number;
      totalEur: number;
      source: string;
      asOf: string;
    };
  }>;
};

function safeNum(x: unknown, fallback = NaN) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function parseMaybeJSON(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isMissingSchemaError(msg: string) {
  const m = String(msg || "").toLowerCase();
  return m.includes("does not exist") || m.includes("unknown column") || m.includes("column");
}

function minutesSince(iso: string | null, now: Date) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return Number.POSITIVE_INFINITY;
  return (now.getTime() - d.getTime()) / 60000;
}

function isConnectionDue(conn: BrokerConnection, now: Date, force: boolean) {
  if (force) return true;
  if (!conn.connected) return false;
  if (!conn.autoSync) return false;
  const proofOk = hasConnectionEvidence({
    connectionMethod: conn.connectionMethod,
    connectionReference: conn.connectionReference,
    csvImported: conn.csvImported,
  });
  if (!proofOk) return false;
  const elapsed = minutesSince(conn.lastSyncAt, now);
  return elapsed >= Math.max(5, Number(conn.syncEveryMinutes || 15));
}

function normalizeLimit(limit: unknown) {
  const n = safeNum(limit, 25);
  return Math.max(1, Math.min(100, Math.round(n || 25)));
}

async function listTargetsFromJournal(args: { limit: number; now: Date; force: boolean }) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("journal_entries")
    .select("user_id,mode,details,created_at")
    .eq("type", "broker_connection_state")
    .order("created_at", { ascending: false })
    .limit(Math.max(20, args.limit * 10));

  if (error) {
    if (isMissingSchemaError(String(error.message || ""))) return [] as EngineTarget[];
    throw new Error(error.message || "journal_entries_read_failed");
  }

  const rows = (data || []) as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const out: EngineTarget[] = [];

  for (const row of rows) {
    const userId = String(row.user_id || "").trim();
    if (!userId || seen.has(userId)) continue;

    const details = parseMaybeJSON(row.details);
    const connRaw = (details?.connection as Record<string, unknown> | undefined) || details;
    if (!connRaw || typeof connRaw !== "object") continue;

    const conn = normalizeBrokerConnection(connRaw, userId, "journal");
    const mode = normalizeMode(row.mode || conn.snapshot?.mode || "trading");
    const due = isConnectionDue(conn, args.now, args.force);
    out.push({ userId, mode, connection: conn, due });
    seen.add(userId);

    if (out.length >= args.limit) break;
  }
  return out;
}

async function listTargets(args: { limit: number; now: Date; force: boolean; userId?: string | null; mode?: string | null }) {
  if (args.userId) {
    const userId = String(args.userId).trim();
    const mode = normalizeMode(args.mode || "trading");
    const conn = await loadBrokerConnection(userId);
    return [
      {
        userId,
        mode,
        connection: conn,
        due: isConnectionDue(conn, args.now, true),
      },
    ] as EngineTarget[];
  }

  const fallback = await listTargetsFromJournal({ limit: args.limit, now: args.now, force: args.force });
  return fallback.slice(0, args.limit);
}

async function writeLoopJournal(args: {
  userId: string;
  mode: AutopilotMode;
  title: string;
  details: Record<string, unknown>;
}) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("journal_entries").insert({
      user_id: args.userId,
      mode: args.mode,
      type: "engine_loop_tick",
      title: args.title,
      details: args.details,
      created_at: new Date().toISOString(),
    } as Record<string, unknown>);
  } catch {
    // non-blocking
  }
}

export async function runEngineLoop(options?: EngineLoopOptions): Promise<EngineLoopResult> {
  const now = options?.now || new Date();
  const at = now.toISOString();
  const limit = normalizeLimit(options?.limit);
  const dryRun = options?.dryRun === true;
  const force = options?.force === true;

  const targets = await listTargets({
    limit,
    now,
    force,
    userId: options?.userId || null,
    mode: options?.mode || null,
  });

  const rows: EngineLoopResult["rows"] = [];
  let due = 0;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of targets) {
    if (!t.connection) {
      skipped += 1;
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "skipped",
        reason: "broker_connection_missing",
      });
      continue;
    }

    const executionId = createExecutionId("loop");
    const targetStartedAtMs = Date.now();
    if (!t.due) {
      skipped += 1;
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "skipped",
        reason: "not_due",
      });
      continue;
    }
    due += 1;

    const proofOk = hasConnectionEvidence({
      connectionMethod: t.connection.connectionMethod,
      connectionReference: t.connection.connectionReference,
      csvImported: t.connection.csvImported,
    });
    if (!t.connection.connected || !proofOk) {
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "risk_blocked",
        status: "warn",
        source: "engine.loop",
        executionId,
        details: {
          reason: "not_connected_or_invalid_proof",
          connectionMethod: t.connection.connectionMethod,
          duration_ms: Date.now() - targetStartedAtMs,
        },
      });
      skipped += 1;
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "skipped",
        reason: "not_connected_or_invalid_proof",
      });
      continue;
    }

    if (dryRun) {
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "skipped",
        reason: "dry_run",
      });
      continue;
    }

    try {
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "order_sent",
        status: "ok",
        source: "engine.loop",
        executionId,
        details: {
          broker: t.connection.broker,
          connectionMethod: t.connection.connectionMethod,
        },
      });

      const snapshot = t.connection.snapshot ?? {
        mode: t.mode,
        source: "broker_connection",
        asOf: new Date().toISOString(),
        positions: [],
        cashEur: 0,
        totalEur: 0,
      };

      const syncedConn = normalizeBrokerConnection(
        {
          ...t.connection,
          connected: true,
          lastSyncAt: snapshot.asOf,
          lastSyncStatus: "ok",
          lastError: null,
          snapshot,
          proofCheckedAt: new Date().toISOString(),
        },
        t.userId,
        t.connection.source || "memory"
      );

      const saved = await saveBrokerConnection(t.userId, syncedConn, "engine_loop_connection_ok");

      await writeLoopJournal({
        userId: t.userId,
        mode: t.mode,
        title: "Engine loop connection check",
        details: {
          ok: true,
          sync: {
            positions: saved.snapshot.positions.length,
            totalEur: saved.snapshot.totalEur,
            source: saved.snapshot.source,
            asOf: saved.snapshot.asOf,
          },
        },
      });
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "order_filled",
        status: "ok",
        source: "engine.loop",
        executionId,
        details: {
          positions: saved.snapshot.positions.length,
          totalEur: saved.snapshot.totalEur,
          duration_ms: Date.now() - targetStartedAtMs,
        },
      });
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "engine_loop_tick",
        status: "ok",
        source: "engine.loop",
        executionId,
        details: {
          positions: saved.snapshot.positions.length,
          totalEur: saved.snapshot.totalEur,
          duration_ms: Date.now() - targetStartedAtMs,
        },
      });

      synced += 1;
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "synced",
        sync: {
          positions: saved.snapshot.positions.length,
          totalEur: saved.snapshot.totalEur,
          source: saved.snapshot.source,
          asOf: saved.snapshot.asOf,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "engine_loop_sync_failed";
      const failedConn = normalizeBrokerConnection(
        {
          ...t.connection,
          connected: true,
          lastSyncStatus: "error",
          lastError: message,
          proofCheckedAt: new Date().toISOString(),
        },
        t.userId,
        t.connection.source || "memory"
      );
      try {
        await saveBrokerConnection(t.userId, failedConn, "engine_loop_sync_error");
      } catch {
        // non-blocking
      }
      await writeLoopJournal({
        userId: t.userId,
        mode: t.mode,
        title: "Engine loop sync failed",
        details: {
          ok: false,
          error: message,
        },
      });
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "order_failed",
        status: "error",
        source: "engine.loop",
        executionId,
        details: {
          error: message,
          broker: t.connection.broker,
          connectionMethod: t.connection.connectionMethod,
          duration_ms: Date.now() - targetStartedAtMs,
        },
      });
      await writeEngineEvent({
        userId: t.userId,
        mode: t.mode,
        event: "engine_loop_tick",
        status: "error",
        source: "engine.loop",
        executionId,
        details: {
          error: message,
          duration_ms: Date.now() - targetStartedAtMs,
        },
      });
      failed += 1;
      rows.push({
        userId: t.userId,
        mode: t.mode,
        status: "failed",
        reason: message,
      });
    }
  }

  return {
    ok: true,
    at,
    dryRun,
    force,
    scanned: targets.length,
    due,
    synced,
    failed,
    skipped,
    rows,
  };
}
