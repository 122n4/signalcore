import type {
  InvestingResearchScientificScope,
  ScientificDecision,
  ValidationReport,
} from "../contracts";

export type PersistedScientificValidation=Readonly<{
  report:ValidationReport;
  decision:ScientificDecision;
  reused:boolean;
}>;

export interface ScientificValidationRepository{
  persist(input:Readonly<{scope:InvestingResearchScientificScope;
    report:ValidationReport;reportHash:string;
    decision:ScientificDecision;decisionHash:string}>):
    Promise<PersistedScientificValidation>;
  getReport(scope:InvestingResearchScientificScope,id:string):
    Promise<ValidationReport|null>;
  getDecision(scope:InvestingResearchScientificScope,id:string):
    Promise<ScientificDecision|null>;
  listReports(scope:InvestingResearchScientificScope):Promise<readonly ValidationReport[]>;
  listDecisions(scope:InvestingResearchScientificScope):Promise<readonly ScientificDecision[]>;
}
