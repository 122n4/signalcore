// lib/signalcore/engine/types.ts
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type Tone = "good" | "warn" | "danger" | "neutral";

export type ProofLine = {
  label: string;
  tone: Tone;
};

export type Diagnostic = {
  key:
    | "plan_missing"
    | "holdings_missing"
    | "concentration"
    | "cash_drag"
    | "missing_values"
    | "mode_placeholder"
    | "quiet_day"
    | "setup_ok";
  title: string;
  detail: string;
  tone: Tone;
  severity: 1 | 2 | 3; // 3 = blocking / urgent
};

export type Candidate = {
  id: string;
  type:
    | "setup"
    | "risk_fix"
    | "diversify"
    | "reduce_cash"
    | "update_values"
    | "review";
  title: string;
  rationale: string;
  impact: string;
  confidence: number; // 0..1
  action?: {
    label: string;
    href: string;
    action: string;
  };
};

export type NBA = {
  title: string;
  desc: string;
  confidence: number;
  kind: "primary" | "ghost";
  cta: { label: string; action: string; href: string };
};

export type ScoreMove = {
  label: string;
  delta: number; // -99..+99
};

export type MoneyConfirmed = {
  today: number;
  week: number;
  total: number;
};

export type EngineInput = {
  userId: string;
  mode: AutopilotMode;
  asOfISO: string;

  plan: any | null;

  portfolio: {
    cashEur?: number | null;
    items: Array<{
      id?: string;
      symbol: string;
      name?: string | null;
      qty?: number | null;
      valueEur?: number | null;
    }>;
  };

  doneToday: boolean;
  streak: number;

  lastSnapshotAt: string | null;

  starterPack: Array<any>;

  recentSnapshots?: Array<{
    day_key: string;
    as_of?: string;
    total_eur: number;
    cash_eur?: number | null;
  }>;
};

export type EngineOutput = {
  daily: {
    proof: ProofLine[];
    meaning: string;
    nba: NBA;
    opportunities: Candidate[];
    starterPack: any[];
    lastSnapshotAt: string | null;
  };

  derived: {
    regime: string;
    pressure: number;
    odds: number;

    autopilotScore: number;
    scoreMoves: ScoreMove[];

    diagnostics: Diagnostic[];
    topRiskLeak: string;

    moneyConfirmed: MoneyConfirmed;

    doneToday: boolean;
    streak: number;
    lastSnapshotAt: string | null;
  };
};