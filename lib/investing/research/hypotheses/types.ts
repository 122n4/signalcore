import type {
  InvestingResearchScientificScope,
  ResearchHypothesis,
  ResearchHypothesisState,
  StrategyCandidate,
  StrategyCandidateState,
} from "../contracts";

export type HypothesisRecord = Readonly<{
  scope: InvestingResearchScientificScope;
  value: ResearchHypothesis;
  materialHash: string;
  createdAt: string;
}>;

export type CandidateRecord = Readonly<{
  scope: InvestingResearchScientificScope;
  value: StrategyCandidate;
  materialHash: string;
  createdAt: string;
}>;

export type Phase6HHypothesisState = Extract<
  ResearchHypothesisState,
  "draft" | "active" | "retired"
>;
export type Phase6HCandidateState = Extract<
  StrategyCandidateState,
  "draft" | "ready" | "retired"
>;

export type HypothesisResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: string }>;
