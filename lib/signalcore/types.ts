// lib/signalcore/types.ts
export type { AutopilotMode } from "@/lib/signalcore/modes";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type DailyAction = {
  title: string;
  rationale: string;
  impact: string;
  confidence: number; // 0..1
  cta: {
    label: string;
    action:
      | "execute_candidate"
      | "mark_done";
    href?: string;
  };
};

export type DailyDerived = {
  regime: string;
  odds: number;
  pressure: number;
  opportunitiesSorted: Array<{
    symbol: string;
    score: number;
    note: string;
  }>;
  moneyConfirmed: {
    today: number;
    week: number;
  };
  topRiskLeak?: string;
};

export type DailyBundle = {
  ok: true;
  mode: AutopilotMode;
  asOf: string;

  daily: DailyAction | Record<string, any> | null;
  derived: DailyDerived;
};
