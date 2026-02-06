// lib/core/types.ts

export type Confidence = "low" | "medium" | "high";

export type GuardrailStatus = "ok" | "near" | "breach";

export type CandidateAction = "Increase" | "Reduce" | "Replace" | "Hedge" | "Rebalance";

export type Candidate = {
  id: string;
  action: CandidateAction;
  label: string; // ex: "Increase US Growth exposure"
  asset?: string; // ex: "NVDA"
  sizePct?: number; // ex: 2.5
  rationale: string;

  impact?: {
    riskDown?: string;
    returnUp?: string;
    driftDown?: string;
    goalUp?: string;
    cost?: string;
  };

  confidence: Confidence;

  guardrailsCheck?: {
    pass: boolean;
    notes?: string[];
  };
};

export type JournalEventType =
  | "copilot_insight"
  | "candidate_created"
  | "candidate_applied"
  | "stress_test_run"
  | "guardrail_breach"
  | "note";

export type JournalEvent = {
  id: string;
  ts: number; // epoch ms
  type: JournalEventType;
  title: string;
  details?: string;
  meta?: Record<string, any>;
};

export type RiskSnapshot = {
  volAnnual: number; // 0..1
  var95: number; // 0..1
  maxDrawdownEst: number; // 0..1
  concentrationTop5: number; // 0..1
  fxExposurePct: number; // 0..1
};

export type RiskDriverRow = {
  name: string;
  weightPct: number; // 0..1
  volAnnual: number; // 0..1
  riskContributionPct: number; // 0..1
};

export type StressResult = {
  scenario: string;
  portfolioImpactPct: number; // negative = loss
  topContributors: { name: string; impactPct: number }[];
};

export type Guardrail = {
  label: string;
  value: string;
  status: GuardrailStatus;
  detail?: string;
};