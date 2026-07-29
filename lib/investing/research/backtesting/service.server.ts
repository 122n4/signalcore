import "server-only";
import {
  validateExperimentDefinition,
  type InvestingResearchScientificScope,
  type InvestingResearchScope,
} from "../contracts";
import {deriveReproducibleExecutionIdentity} from "../reproducibility/executionIdentity.server";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {deriveScientificExperimentIdentity} from "../reproducibility/scientificIdentity.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import type {BacktestCatalogRepository} from "./catalogRepository.server";

type Operation="create"|"queue"|"cancel"|"get_experiment"|"get_run"|"list";
export type BacktestAuthorization=Readonly<{
  authenticatedUserId:string;
  membershipId:string;
  scope:InvestingResearchScientificScope;
}>;
export interface BacktestAuthorizationPort{
  authorize(operation:Operation):Promise<
    {ok:true;value:BacktestAuthorization}|{ok:false;reason:string}>;
}
const plain=(value:unknown):value is Record<string,unknown>=>{
  if(typeof value!=="object"||value===null||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(key=>typeof key==="string"
    &&descriptors[key]?.enumerable===true&&!descriptors[key]?.get&&!descriptors[key]?.set);
};
const time=(value:unknown):value is string=>typeof value==="string"
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const id=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(value);
const sameScope=(left:InvestingResearchScientificScope,right:InvestingResearchScientificScope)=>
  left.tenantId===right.tenantId&&left.ownerId===right.ownerId
  &&left.portfolioId===right.portfolioId&&left.accountId===right.accountId;

export class BacktestApplicationService{
  constructor(private readonly repository:BacktestCatalogRepository,
    private readonly authorization:BacktestAuthorizationPort,
    private readonly emit:(event:Readonly<Record<string,unknown>>)=>Promise<void>){}
  async createOrReuse(input:unknown){
    const allowed=await this.authorization.authorize("create");
    if(!allowed.ok)return allowed;
    const queueAllowed=await this.authorization.authorize("queue");
    if(!queueAllowed.ok)return queueAllowed;
    if(queueAllowed.value.authenticatedUserId!==allowed.value.authenticatedUserId
      ||queueAllowed.value.membershipId!==allowed.value.membershipId
      ||!sameScope(queueAllowed.value.scope,allowed.value.scope)){
      return {ok:false as const,reason:"backtest_scope_not_authorized"};
    }
    if(!plain(input)||Reflect.ownKeys(input).length!==4
      ||!["experiment","executionMaterial","idempotencyKey","createdAt"]
        .every(key=>Object.prototype.hasOwnProperty.call(input,key))
      ||!id(input.idempotencyKey)||!time(input.createdAt)){
      return {ok:false as const,reason:"backtest_request_invalid"};
    }
    const idempotencyKey=input.idempotencyKey as string;
    const createdAt=input.createdAt as string;
    const candidate=input.experiment;
    if(!plain(candidate))return {ok:false as const,reason:"backtest_experiment_invalid"};
    const reconstructedScope:InvestingResearchScope={
      contractVersion:"investing-research-scope/v1",
      authenticatedUserId:allowed.value.authenticatedUserId,
      membershipId:allowed.value.membershipId,...allowed.value.scope,
    };
    const parsed=validateExperimentDefinition({...candidate,scope:reconstructedScope});
    if(!parsed.ok)return {ok:false as const,reason:"backtest_experiment_invalid"};
    if(!sameScope(parsed.value.identityMaterial.scientificScope,allowed.value.scope)){
      return {ok:false as const,reason:"backtest_scope_mismatch"};
    }
    const scientific=deriveScientificExperimentIdentity(parsed.value.identityMaterial);
    if(!scientific.ok||scientific.value.experimentId!==parsed.value.experimentId){
      return {ok:false as const,reason:"backtest_experiment_identity_mismatch"};
    }
    const execution=deriveReproducibleExecutionIdentity(input.executionMaterial);
    if(!execution.ok)return {ok:false as const,reason:"backtest_execution_identity_invalid"};
    let executionMaterial:unknown;
    try{executionMaterial=JSON.parse(execution.value.canonicalMaterial);}catch{
      return {ok:false as const,reason:"backtest_execution_identity_invalid"};
    }
    if(!plain(executionMaterial)
      ||executionMaterial.scientificExperimentId!==scientific.value.experimentId
      ||executionMaterial.scientificExperimentDigest!==scientific.value.digest){
      return {ok:false as const,reason:"backtest_execution_identity_mismatch"};
    }
    const runHash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
      kind:"experiment_run",experimentId:scientific.value.experimentId,
      executionId:execution.value.executionId,attempt:1,
    });
    const jobHash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
      kind:"scientific_job",scope:allowed.value.scope,idempotencyKey,
    });
    if(!runHash.ok||!jobHash.ok)return {ok:false as const,reason:"backtest_identity_invalid"};
    try{
      const stored=await this.repository.createOrReuse({
        scope:allowed.value.scope,experimentId:scientific.value.experimentId,
        scientificDigest:scientific.value.digest,identityVersion:scientific.value.contractVersion,
        canonicalizationVersion:scientific.value.canonicalizationVersion,
        hashAlgorithm:scientific.value.hashAlgorithm,
        candidateId:parsed.value.candidate.candidateId,
        candidateVersion:parsed.value.candidate.candidateVersion,
        datasetVersionId:parsed.value.dataset.datasetVersionId,
        canonicalMaterial:scientific.value.canonicalMaterial,
        executionId:execution.value.executionId,
        runId:`irrun_v1_${runHash.value.digest}`,jobId:`irjob_v1_${jobHash.value.digest}`,
        idempotencyKey,createdAt,
      });
      await this.emit({type:stored.reused?"backtest_request_reused":"backtest_requested",
        experimentId:stored.experimentId,runId:stored.runId,jobId:stored.jobId,
        occurredAt:createdAt});
      return {ok:true as const,value:stored};
    }catch(error){
      return {ok:false as const,reason:error instanceof Error
        &&error.message==="backtest_idempotency_mismatch"
        ?"backtest_idempotency_mismatch":"backtest_persistence_failed"};
    }
  }
  async getExperiment(idValue:string){
    const allowed=await this.authorization.authorize("get_experiment");
    if(!allowed.ok)return allowed;
    if(!id(idValue))return {ok:false as const,reason:"backtest_experiment_not_found"};
    const value=await this.repository.getExperiment(allowed.value.scope,idValue);
    return value?{ok:true as const,value}:{ok:false as const,reason:"backtest_experiment_not_found"};
  }
  async getRun(idValue:string){
    const allowed=await this.authorization.authorize("get_run");
    if(!allowed.ok)return allowed;
    if(!id(idValue))return {ok:false as const,reason:"backtest_run_not_found"};
    const value=await this.repository.getRun(allowed.value.scope,idValue);
    return value?{ok:true as const,value}:{ok:false as const,reason:"backtest_run_not_found"};
  }
  async listExperiments(){
    const allowed=await this.authorization.authorize("list");
    return allowed.ok?{ok:true as const,
      value:await this.repository.listExperiments(allowed.value.scope)}:allowed;
  }
  async cancel(jobId:string){
    const allowed=await this.authorization.authorize("cancel");
    if(!allowed.ok)return allowed;
    if(!id(jobId))return {ok:false as const,reason:"backtest_cancel_invalid"};
    const cancelled=await this.repository.cancel(allowed.value.scope,jobId);
    if(!cancelled)return {ok:false as const,reason:"backtest_cancel_conflict"};
    await this.emit({type:"backtest_cancelled",jobId});
    return {ok:true as const,value:{jobId,state:"cancelled" as const}};
  }
}
