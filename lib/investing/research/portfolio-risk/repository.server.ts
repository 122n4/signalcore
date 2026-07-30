import "server-only";
import type {InvestingResearchScientificScope,ScientificDecision} from "../contracts";
import type {PortfolioRiskAssessment} from "./types";

export interface PortfolioRiskRepository{
  getDecision(scope:InvestingResearchScientificScope,id:string):Promise<ScientificDecision|null>;
  persist(scope:InvestingResearchScientificScope,assessment:PortfolioRiskAssessment):
    Promise<Readonly<{assessment:PortfolioRiskAssessment;reused:boolean}>>;
  get(scope:InvestingResearchScientificScope,id:string):Promise<PortfolioRiskAssessment|null>;
  list(scope:InvestingResearchScientificScope):Promise<readonly PortfolioRiskAssessment[]>;
}
