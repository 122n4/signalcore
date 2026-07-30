import "server-only";
import type {InvestingResearchScientificScope,ScientificDecision} from "../contracts";
import type {PortfolioRiskAssessment} from "../portfolio-risk";
import type {ScientificMemoryEvent} from "../scientific-memory";
import type {ControlledPromotionRecord,ControlledPromotionRevocation,
 PromotionEligibilityEvidence} from "./types";
export interface ControlledPromotionRepository{
 getDecision(scope:InvestingResearchScientificScope,id:string):Promise<ScientificDecision|null>;
 getRisk(scope:InvestingResearchScientificScope,id:string):Promise<PortfolioRiskAssessment|null>;
 getMemory(scope:InvestingResearchScientificScope,id:string):Promise<ScientificMemoryEvent|null>;
 persistEligibility(scope:InvestingResearchScientificScope,value:PromotionEligibilityEvidence):
  Promise<Readonly<{value:PromotionEligibilityEvidence;reused:boolean}>>;
 getEligibility(scope:InvestingResearchScientificScope,id:string):
  Promise<PromotionEligibilityEvidence|null>;
 persistRequest(scope:InvestingResearchScientificScope,value:ControlledPromotionRecord):
  Promise<Readonly<{value:ControlledPromotionRecord;reused:boolean}>>;
 getRequest(scope:InvestingResearchScientificScope,id:string):
  Promise<ControlledPromotionRecord|null>;
 persistRevocation(scope:InvestingResearchScientificScope,value:ControlledPromotionRevocation):
  Promise<Readonly<{value:ControlledPromotionRevocation;reused:boolean}>>;
 getRevocation(scope:InvestingResearchScientificScope,requestId:string):
  Promise<ControlledPromotionRevocation|null>;
 list(scope:InvestingResearchScientificScope):Promise<readonly ControlledPromotionRecord[]>;
}
