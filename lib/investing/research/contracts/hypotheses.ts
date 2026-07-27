import type {
  CanonicalParameter,
  TimeRange,
  VersionedReference,
} from "./primitives";
import type { DatasetRequest } from "./datasets";
import type { ResearchHypothesisState, StrategyCandidateState } from "./states";

export const RESEARCH_HYPOTHESIS_VERSION =
  "investing-research-hypothesis/v1" as const;
export const STRATEGY_CANDIDATE_VERSION =
  "investing-strategy-candidate/v1" as const;

export type ResearchHypothesis = Readonly<{
  contractVersion: typeof RESEARCH_HYPOTHESIS_VERSION;
  hypothesisId: string;
  hypothesisVersion: string;
  state: ResearchHypothesisState;
  statement: string;
  family: string;
  rationale: string;
  universe: readonly string[];
  horizon: string;
  variables: readonly CanonicalParameter[];
  expectedBenchmark: VersionedReference;
  falsificationCriteria: readonly string[];
}>;

export type PortfolioAssumptions = Readonly<{
  baseCurrency: string;
  initialCapital: number;
  allowLeverage: boolean;
  allowShorting: boolean;
  rebalanceFrequency: string;
}>;

export type CandidateGenerationProvenance = Readonly<{
  generatorId: string;
  generatorVersion: string;
  generatedAt: string;
  parentCandidateId: string | null;
}>;

export type StrategyCandidate = Readonly<{
  contractVersion: typeof STRATEGY_CANDIDATE_VERSION;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  state: StrategyCandidateState;
  strategyContract: VersionedReference;
  parameters: readonly CanonicalParameter[];
  portfolioAssumptions: PortfolioAssumptions;
  datasetRequirements: DatasetRequest;
  intendedEvaluationRange: TimeRange;
  generation: CandidateGenerationProvenance;
}>;
