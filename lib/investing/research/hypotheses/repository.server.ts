import "server-only";
import type { InvestingResearchScientificScope } from "../contracts";
import type {
  CandidateRecord,
  HypothesisRecord,
  Phase6HCandidateState,
  Phase6HHypothesisState,
} from "./types";

export interface HypothesisCandidateRepository {
  createOrReuseHypothesis(record: HypothesisRecord): Promise<Readonly<{
    value: HypothesisRecord; reused: boolean;
  }>>;
  transitionHypothesis(input: Readonly<{ scope: InvestingResearchScientificScope;
    hypothesisId: string; expectedVersion: string;
    nextState: Phase6HHypothesisState; createdAt: string }>): Promise<HypothesisRecord | null>;
  getHypothesis(scope: InvestingResearchScientificScope, id: string, version?: string):
    Promise<HypothesisRecord | null>;
  listHypotheses(scope: InvestingResearchScientificScope): Promise<readonly HypothesisRecord[]>;
  createOrReuseCandidate(record: CandidateRecord): Promise<Readonly<{
    value: CandidateRecord; reused: boolean;
  }>>;
  transitionCandidate(input: Readonly<{ scope: InvestingResearchScientificScope;
    candidateId: string; expectedVersion: string;
    nextState: Phase6HCandidateState; createdAt: string }>): Promise<CandidateRecord | null>;
  getCandidate(scope: InvestingResearchScientificScope, id: string, version?: string):
    Promise<CandidateRecord | null>;
  listCandidates(scope: InvestingResearchScientificScope): Promise<readonly CandidateRecord[]>;
}
