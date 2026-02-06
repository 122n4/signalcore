// lib/copilot/types.ts
// Contracts for Copilot API + UI.

export type UserTier = "free" | "paid";

export type CopilotTab =
  | "overview"
  | "portfolio"
  | "planning"
  | "advisor"
  | "screener"
  | "research"
  | "risk"
  | "alerts"
  | "journal";

export type CopilotInsightKind = "info" | "success" | "warning" | "danger";

export type CopilotInsight = {
  id: string;
  kind: CopilotInsightKind;
  title: string;
  detail: string;
};

export type CopilotCTAAction =
  | "open_overview"
  | "open_portfolio"
  | "open_planning"
  | "open_advisor"
  | "open_pricing"
  | "open_manage_subscription";

export type CopilotCTA = {
  label: string;
  action: CopilotCTAAction;
  targetTab?: CopilotTab;
  anchorId?: string;
};

export type CopilotContext = {
  tab: CopilotTab;
  tier: UserTier;

  // Minimal signals the Copilot uses
  hasGoal?: boolean;
  hasPortfolio?: boolean;
  regime?: string | null;

  // Optional: pass lightweight snapshots
  coherenceOverall?: number | null;
  driftLabel?: "stable" | "mild" | "high" | null;
};

export type CopilotResponse = {
  title: string;
  summary: string;
  insights: CopilotInsight[];
  ctas: CopilotCTA[];
  payload?: Record<string, any>;
};