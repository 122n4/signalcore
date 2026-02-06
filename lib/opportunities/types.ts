export type OpportunityAction = "buy" | "sell" | "hold" | "rebalance";

export type Opportunity = {
  id: string;
  title: string;
  action: OpportunityAction;
  symbol?: string;
  rationale: string;
  why_now: string;
  confidence: number; // 0-100
  impact_hint: string; // plain language (no promises)
  risk_note: string;
  horizon: "days" | "weeks" | "months";
  tags: string[];
  pro_note?: string;
};

export type PortfolioMini = {
  items: Array<{ symbol: string; name?: string; weightPct?: number }>;
  cashPct?: number;
};