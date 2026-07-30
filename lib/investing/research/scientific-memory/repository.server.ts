import "server-only";
import type {InvestingResearchScientificScope,ScientificDecision} from "../contracts";
import type {ScientificMemoryEvent,ScientificMemoryProfile} from "./types";

export interface ScientificMemoryRepository{
  getDecision(scope:InvestingResearchScientificScope,id:string):Promise<ScientificDecision|null>;
  getByDecision(scope:InvestingResearchScientificScope,id:string):
    Promise<ScientificMemoryEvent|null>;
  listFamily(scope:InvestingResearchScientificScope,aggregateId:string):
    Promise<readonly ScientificMemoryEvent[]>;
  recordAtomic(scope:InvestingResearchScientificScope,input:Readonly<{
    decision:ScientificDecision;profile:ScientificMemoryProfile;recordedAt:string;
    recordedBy:Readonly<{id:string;version:string}>}>):
    Promise<Readonly<{event:ScientificMemoryEvent;reused:boolean}>>;
  get(scope:InvestingResearchScientificScope,id:string):Promise<ScientificMemoryEvent|null>;
  list(scope:InvestingResearchScientificScope):Promise<readonly ScientificMemoryEvent[]>;
}
