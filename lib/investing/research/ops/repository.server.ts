import "server-only";
import type {InvestingResearchScientificScope} from "../contracts";
import type {ResearchOpsCount,ResearchOpsRecent} from "./types";
export interface ResearchOpsRepository{
 read(scope:InvestingResearchScientificScope,authenticatedUserId:string):Promise<Readonly<{
  counts:readonly ResearchOpsCount[];recent:readonly ResearchOpsRecent[]}>>;
}
