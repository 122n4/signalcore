import type { TradingOperationalInput } from "@/lib/trading/playbook";
import type { BehaviorGuardOutput, PlaybookCheckOutput } from "@/lib/trading/playbook";

export type EntryZoneOutput = {
  triggerType: "break" | "reclaim" | "touch" | "close_confirm";
  triggerLevel?: number | null;
  entryZoneLow?: number | null;
  entryZoneHigh?: number | null;
};

export type InvalidationOutput = {
  invalidationLevel?: number | null;
  invalidationType: "hard" | "structural" | "time_based";
  confidence: number;
};

export type TradePathOutput = {
  targetZone?: string | null;
  primaryPath?: string | null;
  secondaryPath?: string | null;
  riskRewardEstimate?: number | null;
};

export type RiskFramingOutput = {
  riskPct?: number | null;
  sizeAdjustment?: number | null;
  riskMode: "reduced" | "normal" | "aggressive";
};

export type ExecutionStatusOutput = {
  executionStatus: "allowed" | "restricted" | "caution";
  reasons: string[];
  nextDisciplineStep?: string | null;
};

export type ExecutionPlanningInput = TradingOperationalInput & {
  playbookCheck: PlaybookCheckOutput;
  behaviorGuard: BehaviorGuardOutput;
};

export type ExecutionPlanOutput = {
  entryZone: EntryZoneOutput;
  invalidation: InvalidationOutput;
  tradePath: TradePathOutput;
  riskFraming: RiskFramingOutput;
  executionStatus: ExecutionStatusOutput;
};
