import type { InvestingResearchScientificScope } from "../contracts";

export type ExperimentRunJobRecord=Readonly<{
  scope:InvestingResearchScientificScope;
  experimentId:string;
  scientificDigest:string;
  executionId:string;
  runId:string;
  jobId:string;
  attempt:number;
  state:string;
  reused:boolean;
}>;

export interface BacktestCatalogRepository{
  createOrReuse(input:Readonly<{
    scope:InvestingResearchScientificScope;
    experimentId:string;
    scientificDigest:string;
    identityVersion:string;
    canonicalizationVersion:string;
    hashAlgorithm:string;
    candidateId:string;
    candidateVersion:string;
    datasetVersionId:string;
    canonicalMaterial:string;
    executionId:string;
    runId:string;
    jobId:string;
    idempotencyKey:string;
    createdAt:string;
  }>):Promise<ExperimentRunJobRecord>;
  getExperiment(scope:InvestingResearchScientificScope,experimentId:string):
    Promise<Readonly<Record<string,unknown>>|null>;
  getRun(scope:InvestingResearchScientificScope,runId:string):
    Promise<Readonly<Record<string,unknown>>|null>;
  listExperiments(scope:InvestingResearchScientificScope):
    Promise<readonly Readonly<Record<string,unknown>>[]>;
  cancel(scope:InvestingResearchScientificScope,jobId:string):Promise<boolean>;
}
