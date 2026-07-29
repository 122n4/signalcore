import "server-only";
import { randomUUID } from "node:crypto";
import type { InvestingResearchScientificScope } from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import { runDeterministicBacktestCooperatively } from "./engine.server";
import { validateBacktestInput } from "./runtimeValidation";
import { buildExperimentResultEnvelope } from "./resultEnvelope.server";
import type { ScientificJobRepository } from "./repository.server";
import type { BacktestStrategy } from "./types";
import type { BacktestArtifactPublisher } from "./artifactStorage.server";

export class OneShotBacktestWorker {
  constructor(private readonly repository:ScientificJobRepository,
    private readonly artifacts:BacktestArtifactPublisher,
    private readonly emit:(event:Readonly<Record<string,unknown>>)=>void=()=>undefined){}
  async run(input:Readonly<{ scope:InvestingResearchScientificScope;
    jobId:string;leaseOwner:string;leaseSeconds:number;
    maximumAttempts:number;executionTimeoutSeconds:number;signal:AbortSignal;
    experiment:unknown;backtest:unknown;strategy:BacktestStrategy;
    classifyFailure?:(reason:string)=>"transient"|"permanent" }>) {
    if(!Number.isInteger(input.executionTimeoutSeconds)
      ||input.executionTimeoutSeconds<1||input.executionTimeoutSeconds>3_600){
      throw new Error("backtest_execution_timeout_invalid");
    }
    const claimed=await this.repository.claim({
      scope:input.scope,jobId:input.jobId,leaseOwner:input.leaseOwner,
      leaseToken:`lease_${randomUUID()}`,leaseSeconds:input.leaseSeconds,
    });
    if(claimed===null)return { claimed:false as const };
    this.emit({type:"backtest_job_claimed",jobId:claimed.jobId,
      fencingToken:claimed.fencingToken,attempt:claimed.attempt});
    let started=await this.repository.start(claimed);
    if(started===null)throw new Error("backtest_stale_worker");
    const validatedInput=validateBacktestInput(input.backtest);
    if(validatedInput.ok
      &&(validatedInput.value.experimentId!==started.experimentId
      ||validatedInput.value.executionId!==started.executionId)){
      const finalized=await this.repository.finalize(started,{
        state:"failed",reason:"backtest_execution_reference_mismatch"});
      if(!finalized)throw new Error("backtest_stale_worker");
      return {claimed:true as const,completed:false,retryScheduled:false};
    }
    const deadline=Date.now()+input.executionTimeoutSeconds*1_000;
    let executionReason:string|null=null;
    let result:Awaited<ReturnType<typeof runDeterministicBacktestCooperatively>>;
    try{
      result=await runDeterministicBacktestCooperatively(
        validatedInput.ok?validatedInput.value:input.backtest,input.strategy,async()=>{
          if(input.signal.aborted)throw new Error("backtest_execution_aborted");
          if(Date.now()>=deadline)throw new Error("backtest_execution_timeout");
          const renewed=await this.repository.heartbeat(started!,input.leaseSeconds);
          if(renewed===null)throw new Error("backtest_stale_worker");
          started=renewed;
          this.emit({type:"backtest_heartbeat",jobId:started.jobId,
            fencingToken:started.fencingToken,stateVersion:started.stateVersion});
        },()=>input.signal.aborted?"backtest_execution_aborted"
          :Date.now()>=deadline?"backtest_execution_timeout":null);
    }catch(error){
      executionReason=error instanceof Error?error.message:"backtest_execution_failed";
      if(executionReason==="backtest_stale_worker")throw error;
      result={ok:false,reason:executionReason};
    }
    const artifact=result.ok?await this.artifacts.publish({
      scope:started.scope,experimentId:started.experimentId,
      executionId:started.executionId,runId:started.runId,result:result.value,
    }):null;
    if(artifact!==null&&artifact.ok===false){
      executionReason=artifact.reason;
      result={ok:false,reason:artifact.reason};
    }
    const envelope=result.ok&&artifact?.ok?buildExperimentResultEnvelope({
      experiment:input.experiment,leaseScope:started.scope,
      experimentId:started.experimentId,runId:started.runId,backtest:result.value,
      artifact:artifact.value,
    }):null;
    if(envelope!==null&&envelope.ok===false){
      executionReason=envelope.reason;
      result={ok:false,reason:envelope.reason};
    }
    if("reason" in result&&executionReason===null)executionReason=result.reason;
    const cancelled=executionReason==="backtest_execution_aborted";
    const finalized=await this.repository.finalize(started,
      result.ok&&envelope?.ok
        ?{state:"completed",resultHash:envelope.resultHash,result:envelope.envelope}
        :{state:cancelled?"cancelled":"failed",
          reason:"reason" in result?result.reason:"backtest_failed"});
    if(!finalized){
      this.emit({type:"backtest_stale_worker_rejected",jobId:started.jobId,
        fencingToken:started.fencingToken});
      throw new Error("backtest_stale_worker");
    }
    let retryScheduled=false;
    const retryClass="reason" in result
      ?(result.reason==="backtest_execution_timeout"?"transient"
        :(input.classifyFailure?.(result.reason)??"permanent"))
      :"permanent";
    if(!cancelled&&"reason" in result&&retryClass==="transient"
      &&started.attempt<input.maximumAttempts){
      const nextAttempt=started.attempt+1;
      const runHash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
        kind:"experiment_run",experimentId:started.experimentId,
        runId:started.runId,attempt:nextAttempt});
      const jobHash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
        kind:"scientific_retry",jobId:started.jobId,attempt:nextAttempt});
      if(runHash.ok&&jobHash.ok){
        const retry=await this.repository.scheduleRetry(started,{
          nextRunId:`irrun_v1_${runHash.value.digest}`,
          nextJobId:`irjob_v1_${jobHash.value.digest}`,
          maximumAttempts:input.maximumAttempts});
        retryScheduled=retry.scheduled;
        this.emit({type:retryScheduled?"backtest_retry_scheduled":"backtest_retry_exhausted",
          jobId:started.jobId,nextJobId:retry.jobId,attempt:retry.attempt});
      }
    }
    this.emit({type:result.ok?"backtest_completed":"backtest_failed",
      jobId:started.jobId,runId:started.runId,experimentId:started.experimentId,
      fencingToken:started.fencingToken,
      resultHash:result.ok&&envelope?.ok?envelope.resultHash:undefined});
    return {claimed:true as const,completed:result.ok,retryScheduled};
  }
}
