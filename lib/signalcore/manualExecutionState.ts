import { type AutopilotMode } from "@/lib/signalcore/modes";
import { dayKeyUTCFromIso, evaluateExecutionProofForCloseDay, type ExecutionProofPayload } from "@/lib/signalcore/executionProof";

const MANUAL_EXECUTION_STATE_TYPE = "manual_execution_state";

type ManualExecutionStateStatus = "idle" | "pending" | "resolved";
type ManualExecutionReminderStage = "none" | "due_2h" | "due_6h";

export type ManualExecutionPendingStateServer = {
  id: string;
  mode: AutopilotMode;
  leakKey: string | null;
  rows: number;
  createdAt: string;
  context: string | null;
  orders: ExecutionProofPayload["orders"];
  reminderStage: ManualExecutionReminderStage;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
};

export type ManualExecutionProofStateServer = {
  broker: string;
  leakKey: string | null;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  qualityScore: number;
  source: string;
  confirmedAt: string;
  acceptedForCloseDay: boolean;
  gateReason: string | null;
  pendingRowsRequired: number;
};

export type ManualExecutionStateSnapshot = {
  version: 1;
  status: ManualExecutionStateStatus;
  pending: ManualExecutionPendingStateServer | null;
  lastProof: ManualExecutionProofStateServer | null;
  updatedAt: string;
};

type StateRow = {
  id: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

type SupabaseLike = {
  from: (table: string) => any;
};

function asText(value: unknown, maxLen = 240) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function asFloat(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeObj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeOrders(raw: unknown): ExecutionProofPayload["orders"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      symbol: asText(x?.symbol, 24).toUpperCase(),
      action: asText(x?.action, 16).toUpperCase(),
      targetValueEur: asFloat(x?.targetValueEur),
      qtyTarget: asFloat(x?.qtyTarget),
      referencePrice: asFloat(x?.referencePrice),
      limitPrice: asFloat(x?.limitPrice),
      stopLossPrice: asFloat(x?.stopLossPrice),
      orderNotionalEur: asFloat(x?.orderNotionalEur),
      filledPrice: asFloat(x?.filledPrice),
      filledQty: asFloat(x?.filledQty),
      brokerOrderId: asText(x?.brokerOrderId, 120),
      executedAt: asText(x?.executedAt, 64) || null,
      reason: asText(x?.reason, 280),
    }))
    .filter((x) => x.symbol.length > 0)
    .slice(0, 60);
}

function validIsoOrNull(value: unknown, maxLen = 64) {
  const raw = asText(value, maxLen);
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeReminderStage(raw: unknown): ManualExecutionReminderStage {
  const v = asText(raw, 20).toLowerCase();
  if (v === "due_2h" || v === "due_6h") return v;
  return "none";
}

function deriveReminderFromPending(args: {
  createdAt: string;
  nowIso?: string | null;
  currentStage?: ManualExecutionReminderStage;
}) {
  const nowIso = args.nowIso || new Date().toISOString();
  const createdMs = new Date(args.createdAt).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) {
    return {
      stage: args.currentStage || "none",
      nextReminderAt: null as string | null,
    };
  }
  const due2Ms = createdMs + 2 * 60 * 60 * 1000;
  const due6Ms = createdMs + 6 * 60 * 60 * 1000;

  let stage: ManualExecutionReminderStage = "none";
  if (nowMs >= due6Ms) stage = "due_6h";
  else if (nowMs >= due2Ms) stage = "due_2h";

  const nextReminderAt = stage === "none" ? new Date(due2Ms).toISOString() : stage === "due_2h" ? new Date(due6Ms).toISOString() : null;
  return { stage, nextReminderAt };
}

function mergePendingReminder(pending: ManualExecutionPendingStateServer, nowIso?: string | null) {
  const now = nowIso || new Date().toISOString();
  const derived = deriveReminderFromPending({
    createdAt: pending.createdAt,
    nowIso: now,
    currentStage: pending.reminderStage,
  });
  const currentRank = pending.reminderStage === "due_6h" ? 2 : pending.reminderStage === "due_2h" ? 1 : 0;
  const derivedRank = derived.stage === "due_6h" ? 2 : derived.stage === "due_2h" ? 1 : 0;
  const escalated = derivedRank > currentRank;
  const stage = escalated ? derived.stage : pending.reminderStage;
  const createdMs = new Date(pending.createdAt).getTime();
  const due6At = Number.isFinite(createdMs) ? new Date(createdMs + 6 * 60 * 60 * 1000).toISOString() : null;
  const nextReminderAt =
    stage === "none"
      ? derived.nextReminderAt
      : stage === "due_2h"
      ? due6At
      : null;
  const changed = escalated || nextReminderAt !== pending.nextReminderAt;
  return {
    changed,
    pending: {
      ...pending,
      reminderStage: stage,
      lastReminderAt: escalated ? now : pending.lastReminderAt,
      nextReminderAt,
    },
  };
}

export function isManualExecutionPendingForCurrentUtcDay(args: {
  createdAt: string | null | undefined;
  nowIso?: string | null;
}) {
  const today = dayKeyUTCFromIso(args.nowIso || new Date().toISOString());
  const pendingDay = dayKeyUTCFromIso(args.createdAt || null);
  if (!today || !pendingDay) return false;
  return today === pendingDay;
}

function tinyId() {
  return `mep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyState(nowIso = new Date().toISOString()): ManualExecutionStateSnapshot {
  return {
    version: 1,
    status: "idle",
    pending: null,
    lastProof: null,
    updatedAt: nowIso,
  };
}

function normalizePending(raw: unknown, mode: AutopilotMode): ManualExecutionPendingStateServer | null {
  const obj = safeObj(raw);
  if (!Object.keys(obj).length) return null;
  const pendingModeRaw = asText(obj.mode || mode, 24).toLowerCase();
  if (pendingModeRaw && pendingModeRaw !== mode) return null;
  const rows = Math.max(0, asInt(obj.rows, 0));
  return {
    id: asText(obj.id, 80) || tinyId(),
    mode,
    leakKey: asText(obj.leakKey, 80) || null,
    rows,
    createdAt: asText(obj.createdAt, 64) || new Date().toISOString(),
    context: asText(obj.context, 40) || null,
    orders: normalizeOrders(obj.orders),
    reminderStage: normalizeReminderStage(obj.reminderStage),
    lastReminderAt: validIsoOrNull(obj.lastReminderAt),
    nextReminderAt: validIsoOrNull(obj.nextReminderAt),
  };
}

function normalizeProof(raw: unknown): ManualExecutionProofStateServer | null {
  const obj = safeObj(raw);
  if (!Object.keys(obj).length) return null;
  const completed = Math.max(0, asInt(obj.completed, 0));
  const total = Math.max(completed, asInt(obj.total, completed));
  if (total <= 0 && completed <= 0) return null;
  return {
    broker: asText(obj.broker || "manual", 80) || "manual",
    leakKey: asText(obj.leakKey, 80) || null,
    completed,
    total,
    note: asText(obj.note, 800),
    reference: asText(obj.reference, 120),
    feesEur: asFloat(obj.feesEur),
    slippageBps: asFloat(obj.slippageBps),
    qualityScore: Math.max(0, Math.min(100, asInt(obj.qualityScore, 0))),
    source: asText(obj.source || "manual_checklist", 40) || "manual_checklist",
    confirmedAt: asText(obj.confirmedAt, 64) || new Date().toISOString(),
    acceptedForCloseDay: Boolean(obj.acceptedForCloseDay),
    gateReason: asText(obj.gateReason, 240) || null,
    pendingRowsRequired: Math.max(0, asInt(obj.pendingRowsRequired, 0)),
  };
}

function normalizeState(raw: unknown, mode: AutopilotMode): ManualExecutionStateSnapshot {
  const obj = safeObj(raw);
  const statusRaw = asText(obj.status, 24).toLowerCase();
  const status: ManualExecutionStateStatus =
    statusRaw === "pending" || statusRaw === "resolved" ? (statusRaw as ManualExecutionStateStatus) : "idle";
  const pending = normalizePending(obj.pending, mode);
  const lastProof = normalizeProof(obj.lastProof);
  const updatedAt = asText(obj.updatedAt, 64) || new Date().toISOString();

  if (status === "pending" && !pending) {
    return { version: 1, status: "idle", pending: null, lastProof, updatedAt };
  }

  return {
    version: 1,
    status,
    pending: status === "pending" ? pending : null,
    lastProof,
    updatedAt,
  };
}

async function readLatestStateRow(args: { sb: SupabaseLike; userId: string; mode: AutopilotMode }) {
  const { sb, userId, mode } = args;
  const { data, error } = await sb
    .from("journal_entries")
    .select("id,details,created_at")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("type", MANUAL_EXECUTION_STATE_TYPE)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message || "manual_execution_state_read_failed");
  const row = ((data ?? [])[0] ?? null) as StateRow | null;
  return row;
}

async function insertStateSnapshot(args: {
  sb: SupabaseLike;
  userId: string;
  mode: AutopilotMode;
  snapshot: ManualExecutionStateSnapshot;
}) {
  const { sb, userId, mode, snapshot } = args;
  const createdAt = new Date().toISOString();
  const payload = {
    user_id: userId,
    mode,
    type: MANUAL_EXECUTION_STATE_TYPE,
    title: "Manual execution state",
    details: snapshot,
    created_at: createdAt,
  };
  const { error } = await sb.from("journal_entries").insert(payload);
  if (error) throw new Error(error.message || "manual_execution_state_write_failed");
  return { createdAt };
}

export async function readManualExecutionState(args: { sb: SupabaseLike; userId: string; mode: AutopilotMode }) {
  const row = await readLatestStateRow(args);
  if (!row) {
    return {
      rowId: null,
      createdAt: null,
      snapshot: emptyState(),
    };
  }
  return {
    rowId: row.id,
    createdAt: row.created_at ?? null,
    snapshot: normalizeState(row.details, args.mode),
  };
}

export async function setManualExecutionPending(args: {
  sb: SupabaseLike;
  userId: string;
  mode: AutopilotMode;
  leakKey: string | null;
  rows: number;
  context?: string | null;
  orders?: ExecutionProofPayload["orders"];
}) {
  const nowIso = new Date().toISOString();
  const current = await readManualExecutionState(args);
  const pending: ManualExecutionPendingStateServer = {
    id: tinyId(),
    mode: args.mode,
    leakKey: asText(args.leakKey, 80) || null,
    rows: Math.max(0, asInt(args.rows, 0)),
    createdAt: nowIso,
    context: asText(args.context, 40) || null,
    orders: normalizeOrders(args.orders),
    reminderStage: "none",
    lastReminderAt: null,
    nextReminderAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
  const snapshot: ManualExecutionStateSnapshot = {
    version: 1,
    status: "pending",
    pending,
    lastProof: current.snapshot.lastProof,
    updatedAt: nowIso,
  };
  await insertStateSnapshot({ ...args, snapshot });
  return snapshot;
}

export async function clearManualExecutionPending(args: {
  sb: SupabaseLike;
  userId: string;
  mode: AutopilotMode;
  reason?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const current = await readManualExecutionState(args);
  const snapshot: ManualExecutionStateSnapshot = {
    version: 1,
    status: "idle",
    pending: null,
    lastProof: current.snapshot.lastProof
      ? {
          ...current.snapshot.lastProof,
          gateReason: asText(args.reason, 240) || current.snapshot.lastProof.gateReason,
        }
      : null,
    updatedAt: nowIso,
  };
  await insertStateSnapshot({ ...args, snapshot });
  return snapshot;
}

export function evaluateManualExecutionProofAgainstPending(args: {
  mode: AutopilotMode;
  proof: ExecutionProofPayload;
  pendingRowsRequired: number;
}) {
  const gate = evaluateExecutionProofForCloseDay({
    mode: args.mode,
    completed: args.proof.completed,
    total: args.proof.total,
    note: args.proof.note,
    reference: args.proof.reference,
    feesEur: args.proof.feesEur,
    slippageBps: args.proof.slippageBps,
    qualityScore: args.proof.qualityScore,
  });
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (args.pendingRowsRequired > 0 && args.proof.total < args.pendingRowsRequired) {
    return {
      ok: false,
      reason: `Checklist requires ${args.pendingRowsRequired} orders before close day.`,
    };
  }
  if (args.pendingRowsRequired > 0 && (args.proof.orders?.length || 0) < args.pendingRowsRequired) {
    return {
      ok: false,
      reason: `Attach all ${args.pendingRowsRequired} executed order rows before close day.`,
    };
  }
  return { ok: true, reason: "" };
}

export async function applyManualExecutionProof(args: {
  sb: SupabaseLike;
  userId: string;
  mode: AutopilotMode;
  proof: ExecutionProofPayload;
  confirmedAt?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const current = await readManualExecutionState(args);
  const pending = current.snapshot.pending;
  const pendingIsCurrentDay = isManualExecutionPendingForCurrentUtcDay({
    createdAt: pending?.createdAt || null,
    nowIso,
  });
  const pendingRowsRequired = pendingIsCurrentDay ? Math.max(0, Number(pending?.rows || 0)) : 0;
  const proofEvaluation = evaluateManualExecutionProofAgainstPending({
    mode: args.mode,
    proof: args.proof,
    pendingRowsRequired,
  });
  const acceptedForCloseDay = proofEvaluation.ok;
  const confirmedAt = asText(args.confirmedAt, 64) || nowIso;
  const nextProof: ManualExecutionProofStateServer = {
    broker: args.proof.broker,
    leakKey: args.proof.leakKey,
    completed: args.proof.completed,
    total: args.proof.total,
    note: args.proof.note,
    reference: args.proof.reference,
    feesEur: args.proof.feesEur,
    slippageBps: args.proof.slippageBps,
    qualityScore: args.proof.qualityScore,
    source: args.proof.source,
    confirmedAt,
    acceptedForCloseDay,
    gateReason: proofEvaluation.reason || null,
    pendingRowsRequired,
  };

  const snapshot: ManualExecutionStateSnapshot = {
    version: 1,
    status: acceptedForCloseDay ? "resolved" : pendingIsCurrentDay && pending ? "pending" : "idle",
    pending: acceptedForCloseDay ? null : pendingIsCurrentDay ? pending : null,
    lastProof: nextProof,
    updatedAt: nowIso,
  };
  await insertStateSnapshot({ ...args, snapshot });
  return {
    snapshot,
    acceptedForCloseDay,
    gateReason: nextProof.gateReason,
  };
}

export async function refreshManualExecutionReminder(args: {
  sb: SupabaseLike;
  userId: string;
  mode: AutopilotMode;
  nowIso?: string | null;
}) {
  const nowIso = asText(args.nowIso, 64) || new Date().toISOString();
  const current = await readManualExecutionState(args);
  const pending = current.snapshot.pending;
  if (!pending) return { snapshot: current.snapshot, changed: false };

  const pendingIsCurrentDay = isManualExecutionPendingForCurrentUtcDay({
    createdAt: pending.createdAt,
    nowIso,
  });
  if (!pendingIsCurrentDay) {
    const snapshot: ManualExecutionStateSnapshot = {
      ...current.snapshot,
      status: "idle",
      pending: null,
      updatedAt: nowIso,
    };
    await insertStateSnapshot({ ...args, snapshot });
    return { snapshot, changed: true };
  }

  const merged = mergePendingReminder(pending, nowIso);
  if (!merged.changed) return { snapshot: current.snapshot, changed: false };

  const snapshot: ManualExecutionStateSnapshot = {
    ...current.snapshot,
    pending: merged.pending,
    updatedAt: nowIso,
  };
  await insertStateSnapshot({ ...args, snapshot });
  return { snapshot, changed: true };
}

export function hasBlockingManualExecutionPendingForToday(args: {
  snapshot: ManualExecutionStateSnapshot;
  nowIso?: string;
}) {
  const nowIso = args.nowIso || new Date().toISOString();
  const today = dayKeyUTCFromIso(nowIso);
  const pending = args.snapshot.pending;
  if (!pending) return false;
  if (!today) return false;
  return isManualExecutionPendingForCurrentUtcDay({
    createdAt: pending.createdAt,
    nowIso,
  });
}
