// lib/signalcore/types.ts
export type { AutopilotMode } from "@/lib/signalcore/modes";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
export type Horizon = "Short" | "Medium" | "Long";
export type SetupStatus = "new" | "complete";

export type UserSettings = {
  user_id: string;
  active_mode: AutopilotMode;

  risk_profile: RiskProfile;
  horizon: Horizon;

  setup_status: SetupStatus;
  setup_mode: "offline" | "broker";

  created_at?: string;
  updated_at?: string;
};

export type Plan = {
  id: string;
  user_id: string;
  mode: AutopilotMode;

  goal?: string;
  risk_profile?: RiskProfile;
  horizon?: Horizon;

  is_active: boolean;

  created_at?: string;
  updated_at?: string;
};

export type PortfolioItem = {
  id: string;
  user_id: string;
  mode: AutopilotMode;

  symbol: string;
  name?: string;

  quantity: number;
  avg_cost?: number;
  currency?: string;

  created_at?: string;
  updated_at?: string;
};

export type StarterPackItem = {
  symbol: string;
  name: string;
  weight: number; // 0..1
  rationale: string;
};

export type DailyAction = {
  title: string;
  rationale: string;
  impact: string;
  confidence: number; // 0..1
  cta: {
    label: string;
    action:
      | "add_holdings"
      | "create_plan"
      | "review_plan"
      | "execute_candidate"
      | "mark_done";
    href?: string;
  };
  starterPack?: StarterPackItem[];
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

  plan: Plan | null;
  portfolio: {
    cash: number;
    items: PortfolioItem[];
  };

  daily: DailyAction;
  derived: DailyDerived;
};