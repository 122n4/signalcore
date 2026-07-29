import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("node:crypto",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("node:crypto")>();
  return {...actual,randomUUID:()=>"00000000-0000-4000-8000-000000000000"};
});
import {OneShotBacktestWorker} from "@/lib/investing/research/backtesting/worker.server";
import type {ScientificJobLease,ScientificJobRepository} from
  "@/lib/investing/research/backtesting/repository.server";
import {BACKTEST_INPUT_VERSION} from "@/lib/investing/research/backtesting";

const scope={tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",accountId:"account"};
const fullScope={contractVersion:"investing-research-scope/v1" as const,
  authenticatedUserId:"user",membershipId:"membership",...scope};
const lease:ScientificJobLease={scope,jobId:"job",experimentId:`irexp_v1_${"a".repeat(64)}`,
  executionId:`irexec_v1_${"b".repeat(64)}`,runId:"run",attempt:1,
  leaseToken:"lease",leaseOwner:"worker",
  fencingToken:1,stateVersion:1,expiresAt:"2026-01-01T00:01:00.000Z"};
const backtest={
  contractVersion:BACKTEST_INPUT_VERSION,experimentId:lease.experimentId,
  executionId:`irexec_v1_${"b".repeat(64)}`,datasetVersionId:"dataset",
  bars:[
    {timestamp:"2026-01-01T00:00:00.000Z",open:1,high:1,low:1,close:1,volume:1},
    {timestamp:"2026-01-02T00:00:00.000Z",open:1,high:1,low:1,close:1,volume:1},
  ],configuration:{initialCapital:100,transactionCostBps:0,slippageBps:0,
    maximumPositionWeight:1},
};
const range={from:"2026-01-01T00:00:00.000Z",to:"2026-12-31T00:00:00.000Z"};
const portfolio={baseCurrency:"EUR",initialCapital:100,allowLeverage:false,
  allowShorting:false,rebalanceFrequency:"daily"};
const dataset={contractVersion:"investing-dataset-version-ref/v1" as const,
  datasetVersionId:"dataset",datasetSchemaVersion:"schema/v1",
  manifestHash:"c".repeat(64),aggregateContentHash:"d".repeat(64),
  coverage:{instruments:["TEST"],timeframe:"1d",range,coverageRatio:1,gapCount:0},
  quality:{status:"qualified" as const,warningCodes:[]},
  provenanceRef:{id:"provenance",version:"v1"},
  qualifiedAt:"2026-12-31T00:00:00.000Z"};
const request={contractVersion:"investing-dataset-request/v1" as const,
  requestId:"request",instruments:["TEST"],timeframe:"1d",range,
  dataKinds:["price_bars" as const],quality:{minimumCoverageRatio:1,maximumGapCount:0,
    requireCorporateActionPolicy:false,timezone:"UTC"},scientificPurpose:"Backtest."};
const candidate={contractVersion:"investing-strategy-candidate/v1" as const,
  candidateId:"candidate",candidateVersion:"v1",hypothesisId:"hypothesis",
  hypothesisVersion:"v1",state:"ready" as const,
  strategyContract:{id:"strategy",version:"v1"},parameters:[],portfolioAssumptions:portfolio,
  datasetRequirements:request,intendedEvaluationRange:range,
  generation:{generatorId:"manual",generatorVersion:"v1",
    generatedAt:"2026-01-01T00:00:00.000Z",parentCandidateId:null}};
const splits=[{name:"holdout",purpose:"holdout" as const,range}];
const identityMaterial={contractVersion:"investing-experiment-identity-material/v1" as const,
  scientificScope:scope,candidateId:"candidate",candidateVersion:"v1",
  hypothesisId:"hypothesis",hypothesisVersion:"v1",
  strategyContract:candidate.strategyContract,canonicalParameters:[],
  datasetVersionId:"dataset",datasetManifestHash:dataset.manifestHash,
  datasetContentHash:dataset.aggregateContentHash,
  engineContract:{id:"engine",version:"v1"},
  validationProfile:{id:"validation",version:"v1"},portfolioConfiguration:portfolio,
  costModel:{id:"cost",version:"v1"},benchmark:{id:"benchmark",version:"v1"},
  splits,randomSeed:null,configurationVersion:"v1"};
const experiment={contractVersion:"investing-experiment-definition/v1" as const,
  experimentId:lease.experimentId,scope:fullScope,candidate,dataset,evaluationRange:range,
  splits,portfolioConfiguration:portfolio,costModel:identityMaterial.costModel,
  validationProfile:identityMaterial.validationProfile,benchmark:identityMaterial.benchmark,
  engineContract:identityMaterial.engineContract,randomSeed:null,configurationVersion:"v1",
  identityMaterial};
const control=()=>({signal:new AbortController().signal,executionTimeoutSeconds:60,experiment});
const artifact={publish:vi.fn().mockResolvedValue({ok:true,value:{
  contractVersion:"investing-research-artifact-ref/v1",artifactId:`irart_v1_${"e".repeat(64)}`,
  kind:"backtest_result",contentHash:"f".repeat(64),mediaType:"application/json",
  schemaVersion:"investing-backtest-result/v1",sizeBytes:100,
  logicalRole:"experiment_result_evidence",
  provenanceRef:{id:lease.executionId,version:"v1"},retentionClass:"scientific_record",
}})};
const worker=(repo:ScientificJobRepository)=>new OneShotBacktestWorker(repo,artifact);
const repository=(overrides:Partial<ScientificJobRepository>={}):ScientificJobRepository=>({
  claim:vi.fn().mockResolvedValue(lease),
  start:vi.fn().mockResolvedValue({...lease,stateVersion:2}),
  heartbeat:vi.fn().mockResolvedValue({...lease,stateVersion:3}),
  finalize:vi.fn().mockResolvedValue(true),
  scheduleRetry:vi.fn().mockResolvedValue({scheduled:false,attempt:null,jobId:null}),
  ...overrides,
});

describe("Phase 6I fenced one-shot worker",()=>{
  it("claims, starts and finalizes a deterministic result",async()=>{
    const repo=repository();
    await expect(worker(repo).run({scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      ...control(),backtest,strategy:{contractVersion:"strategy/v1",decide:()=>0}}))
      .resolves.toEqual({claimed:true,completed:true,retryScheduled:false});
    expect(repo.heartbeat).toHaveBeenCalled();
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({stateVersion:3}),
      expect.objectContaining({state:"completed"}));
  });
  it("rejects a stale start without executing the strategy",async()=>{
    const decide=vi.fn();
    const repo=repository({start:vi.fn().mockResolvedValue(null)});
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,backtest,
      ...control(),
      strategy:{contractVersion:"strategy/v1",decide},
    })).rejects.toThrow("backtest_stale_worker");
    expect(decide).not.toHaveBeenCalled();
  });
  it("rejects stale finalization",async()=>{
    const repo=repository({finalize:vi.fn().mockResolvedValue(false)});
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,backtest,
      ...control(),
      strategy:{contractVersion:"strategy/v1",decide:()=>0},
    })).rejects.toThrow("backtest_stale_worker");
  });
  it("schedules a bounded transient retry",async()=>{
    const scheduleRetry=vi.fn().mockResolvedValue({scheduled:true,attempt:2,jobId:"retry"});
    const repo=repository({
      scheduleRetry,
    });
    const invalid={...backtest,bars:[]};
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      ...control(),backtest:invalid,strategy:{contractVersion:"strategy/v1",decide:()=>0},
      classifyFailure:()=> "transient",
    })).resolves.toEqual({claimed:true,completed:false,retryScheduled:true});
    expect(scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({stateVersion:2}),
      expect.objectContaining({maximumAttempts:3}));
  });
  it("persists the accepted Phase 6B result envelope",async()=>{
    const repo=repository();
    await worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      ...control(),backtest,strategy:{contractVersion:"strategy/v1",decide:()=>0},
    });
    expect(repo.finalize).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      state:"completed",resultHash:expect.stringMatching(/^[a-f0-9]{64}$/),
      result:expect.objectContaining({
        contractVersion:"investing-experiment-result-envelope/v1",
        experimentId:lease.experimentId,runId:lease.runId,completionStatus:"completed",
        artifacts:[expect.objectContaining({kind:"backtest_result",
          provenanceRef:{id:lease.executionId,version:"v1"}})],
      }),
    }));
  });
  it("honours an explicit abort signal and persists cancellation",async()=>{
    const controller=new AbortController();
    controller.abort();
    const decide=vi.fn();
    const repo=repository();
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      experiment,signal:controller.signal,executionTimeoutSeconds:60,
      backtest,strategy:{contractVersion:"strategy/v1",decide},
    })).resolves.toEqual({claimed:true,completed:false,retryScheduled:false});
    expect(decide).not.toHaveBeenCalled();
    expect(repo.finalize).toHaveBeenCalledWith(expect.anything(),
      {state:"cancelled",reason:"backtest_execution_aborted"});
  });
  it("enforces the closed execution timeout and classifies it as retryable",async()=>{
    const now=vi.spyOn(Date,"now").mockReturnValueOnce(0).mockReturnValue(1_000);
    const scheduleRetry=vi.fn().mockResolvedValue({scheduled:true,attempt:2,jobId:"retry"});
    const repo=repository({scheduleRetry});
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      experiment,signal:new AbortController().signal,executionTimeoutSeconds:1,
      backtest,strategy:{contractVersion:"strategy/v1",decide:()=>0},
    })).resolves.toEqual({claimed:true,completed:false,retryScheduled:true});
    expect(repo.finalize).toHaveBeenCalledWith(expect.anything(),
      {state:"failed",reason:"backtest_execution_timeout"});
    expect(scheduleRetry).toHaveBeenCalled();
    now.mockRestore();
  });
  it("rejects a backtest whose execution identity differs from the leased run",async()=>{
    const repo=repository();
    artifact.publish.mockClear();
    const mismatched={...backtest,executionId:`irexec_v1_${"9".repeat(64)}`};
    await expect(worker(repo).run({
      scope,jobId:"job",leaseOwner:"worker",leaseSeconds:60,maximumAttempts:3,
      ...control(),backtest:mismatched,strategy:{contractVersion:"strategy/v1",decide:()=>0},
    })).resolves.toEqual({claimed:true,completed:false,retryScheduled:false});
    expect(artifact.publish).not.toHaveBeenCalled();
    expect(repo.finalize).toHaveBeenCalledWith(expect.anything(),
      {state:"failed",reason:"backtest_execution_reference_mismatch"});
  });
});
