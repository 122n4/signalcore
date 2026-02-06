// lib/execution/types.ts

export type Side = "buy" | "sell" | "hold";

export type ExecutionMode = "investing" | "trading" | "forex" | "crypto";

export type ExecutionCandidate = {
  id: string;
  side: Side;
  symbol: string;
  name?: string | null;

  // sizing
  qty?: number | null;
  notional?: number | null; // cash amount
  weightDeltaPct?: number | null;

  // rationale
  reason?: string | null;
  tags?: string[];

  // constraints flags
  blocked?: boolean;
  blockReason?: string | null;

  meta?: Record<string, any>;
};

export type ExecutionIntent = {
  id: string;
  side: Side;
  symbol: string;

  qty?: number | null;
  notional?: number | null;

  rationale: string;
  riskNotes?: string[];
  meta?: Record<string, any>;
};

export type ExecutionBatch = {
  id: string;
  createdAt: number;
  updatedAt: number;

  // ✅ required by ExecutionTab / initBatch()
  mode: ExecutionMode;

  title?: string;
  notes?: string;

  candidates: ExecutionCandidate[];
  intents?: ExecutionIntent[];

  status?: "draft" | "ready" | "executed" | "cancelled";

  meta?: Record<string, any>;
};

export type SimulationResult = {
  ok: boolean;

  estImpact?: {
    turnoverPct?: number;
    riskDelta?: number;
    expectedReturnDelta?: number;
    drawdownDelta?: number;
    fees?: number;
  };

  items?: Array<{
    candidateId: string;
    ok: boolean;
    note?: string;
    meta?: Record<string, any>;
  }>;

  warnings?: string[];
  errors?: string[];
};