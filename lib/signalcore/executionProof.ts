export type ExecutionProofOrder = {
  symbol: string;
  action: string;
  targetValueEur: number | null;
  qtyTarget: number | null;
  referencePrice: number | null;
  limitPrice: number | null;
  stopLossPrice: number | null;
  orderNotionalEur: number | null;
  filledPrice: number | null;
  filledQty: number | null;
  brokerOrderId: string;
  executedAt: string | null;
  reason: string;
};

export type ExecutionProofPayload = {
  broker: string;
  leakKey: string | null;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  source: string;
  qualityScore: number;
  orders: ExecutionProofOrder[];
};

export type ExecutionProofGate = {
  minQuality: number;
  requireReference: boolean;
};

export type ExecutionProofGateResult = {
  ok: boolean;
  qualityScore: number;
  gate: ExecutionProofGate;
  reason: string;
};

export type JournalExecutionProof = {
  id: string;
  at: string | null;
  mode: string;
  broker: string;
  leakKey: string | null;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  source: string;
  qualityScore: number;
  orders: ExecutionProofOrder[];
};

export type JournalExecutionProofWithCompletion = JournalExecutionProof & {
  completionPct: number;
};

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function asText(v: unknown, maxLen = 200) {
  return String(v || "")
    .trim()
    .slice(0, maxLen);
}

export function dayKeyUTCFromIso(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeExecutionProofQuality(input: {
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  qualityScore?: number | null;
}) {
  if (typeof input.qualityScore === "number" && Number.isFinite(input.qualityScore)) {
    return Math.max(0, Math.min(100, Math.round(input.qualityScore)));
  }

  let s = 0;
  if (input.total > 0 && input.completed >= input.total) s += 60;
  else if (input.completed > 0) s += 35;
  if (String(input.reference || "").trim().length >= 4) s += 20;
  const note = String(input.note || "").trim();
  if (note.length >= 16) s += 10;
  else if (note.length >= 6) s += 6;
  if (input.feesEur != null) s += 5;
  if (input.slippageBps != null) s += 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function normalizeOrders(raw: unknown): ExecutionProofOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      symbol: asText(x?.symbol, 24).toUpperCase(),
      action: asText(x?.action, 16).toUpperCase(),
      targetValueEur: clampFloat(x?.targetValueEur, -1_000_000_000, 1_000_000_000),
      qtyTarget: clampFloat(x?.qtyTarget, -1_000_000_000, 1_000_000_000),
      referencePrice: clampFloat(x?.referencePrice, 0, 1_000_000_000),
      limitPrice: clampFloat(x?.limitPrice, 0, 1_000_000_000),
      stopLossPrice: clampFloat(x?.stopLossPrice, 0, 1_000_000_000),
      orderNotionalEur: clampFloat(x?.orderNotionalEur, 0, 1_000_000_000),
      filledPrice: clampFloat(x?.filledPrice, 0, 1_000_000_000),
      filledQty: clampFloat(x?.filledQty, 0, 1_000_000_000),
      brokerOrderId: asText(x?.brokerOrderId, 120),
      executedAt: asText(x?.executedAt, 64) || null,
      reason: asText(x?.reason, 280),
    }))
    .filter((x) => x.symbol.length > 0)
    .slice(0, 40);
}

export function normalizeExecutionProofPayload(raw: any): ExecutionProofPayload {
  const broker = asText(raw?.broker || "manual", 80) || "manual";
  const leakKey = asText(raw?.leakKey || "", 80) || null;
  const completed = Math.max(0, clampInt(raw?.completed, 0, 100000, 0));
  const total = Math.max(completed, clampInt(raw?.total, 0, 100000, completed));
  const note = asText(raw?.note, 800);
  const reference = asText(raw?.reference, 120);
  const feesEur = clampFloat(raw?.feesEur, 0, 1_000_000_000);
  const slippageBps = clampFloat(raw?.slippageBps, -10000, 10000);
  const source = asText(raw?.source || "manual_checklist", 40) || "manual_checklist";
  const orders = normalizeOrders(raw?.orders);
  const rawQualityScore = clampInt(raw?.qualityScore, 0, 100, -1);
  const qualityScore = computeExecutionProofQuality({
    completed,
    total,
    note,
    reference,
    feesEur,
    slippageBps,
    qualityScore: rawQualityScore >= 0 ? rawQualityScore : null,
  });

  return {
    broker,
    leakKey,
    completed,
    total,
    note,
    reference,
    feesEur,
    slippageBps,
    source,
    qualityScore,
    orders,
  };
}

export function getExecutionProofQualityGate(mode: string): ExecutionProofGate {
  void mode;
  return { minQuality: 65, requireReference: false };
}

export function evaluateExecutionProofForCloseDay(args: {
  mode: string;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  qualityScore?: number | null;
}): ExecutionProofGateResult {
  const gate = getExecutionProofQualityGate(args.mode);
  const total = Math.max(0, Math.round(Number(args.total || 0)));
  const completed = Math.max(0, Math.round(Number(args.completed || 0)));
  const reference = String(args.reference || "").trim();
  const qualityScore = computeExecutionProofQuality({
    completed,
    total,
    note: String(args.note || ""),
    reference,
    feesEur: args.feesEur,
    slippageBps: args.slippageBps,
    qualityScore: args.qualityScore,
  });

  if (total <= 0) return { ok: false, qualityScore, gate, reason: "No manual orders were confirmed." };
  if (completed < total) return { ok: false, qualityScore, gate, reason: "Checklist is not fully completed." };
  if (gate.requireReference && reference.length < 4) {
    return { ok: false, qualityScore, gate, reason: "Execution reference is required for this mode." };
  }
  if (qualityScore < gate.minQuality) {
    return { ok: false, qualityScore, gate, reason: `Evidence quality must be at least ${gate.minQuality}/100.` };
  }
  return { ok: true, qualityScore, gate, reason: "" };
}

export function getExecutionProofRawFromJournalRow(row: any) {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const type = String(row?.type || "").toLowerCase().trim();
  if (type === "daily_done") {
    return details?.manualExecutionProof && typeof details.manualExecutionProof === "object" ? details.manualExecutionProof : null;
  }
  return details;
}

export function mapJournalRowToExecutionProof(row: any): JournalExecutionProof | null {
  const raw = getExecutionProofRawFromJournalRow(row);
  if (!raw) return null;
  const normalized = normalizeExecutionProofPayload(raw);
  if (normalized.total <= 0 && normalized.completed <= 0) return null;

  return {
    id: String(row?.id || ""),
    at: row?.created_at ? String(row.created_at) : null,
    mode: String(row?.mode || ""),
    broker: normalized.broker,
    leakKey: normalized.leakKey,
    completed: normalized.completed,
    total: normalized.total,
    note: normalized.note,
    reference: normalized.reference,
    feesEur: normalized.feesEur,
    slippageBps: normalized.slippageBps,
    source: normalized.source,
    qualityScore: normalized.qualityScore,
    orders: normalized.orders,
  };
}

export function mapJournalRowToExecutionProofWithCompletion(row: any): JournalExecutionProofWithCompletion | null {
  const proof = mapJournalRowToExecutionProof(row);
  if (!proof) return null;
  const completionPct = proof.total > 0 ? Math.round((Math.min(proof.completed, proof.total) / proof.total) * 100) : 0;
  return { ...proof, completionPct };
}

export function mapJournalRowToExecutionProofMetrics(row: any): null | {
  dayKey: string | null;
  total: number;
  completed: number;
  feesEur: number | null;
  slippageBps: number | null;
  qualityScore: number | null;
} {
  const proof = mapJournalRowToExecutionProof(row);
  if (!proof) return null;
  return {
    dayKey: dayKeyUTCFromIso(proof.at),
    total: proof.total,
    completed: proof.completed,
    feesEur: proof.feesEur,
    slippageBps: proof.slippageBps,
    qualityScore: proof.qualityScore,
  };
}
