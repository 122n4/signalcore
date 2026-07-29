import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {
  runScientificValidation,
} from "@/lib/investing/research/scientific-validation/engine.server";
import {
  SCIENTIFIC_VALIDATION_INPUT_VERSION,
  SCIENTIFIC_VALIDATION_PROFILE_VERSION,
  SCIENTIFIC_VALIDATION_REQUEST_VERSION,
  validateScientificValidationInput,
} from "@/lib/investing/research/scientific-validation";
import {
  validateScientificDecision,
  validateValidationReport,
} from "@/lib/investing/research/contracts";
import {ScientificValidationService} from
  "@/lib/investing/research/scientific-validation/service.server";
import type {ScientificValidationRepository} from
  "@/lib/investing/research/scientific-validation/repository.server";
import {ArtifactScientificValidationEvidenceCollector} from
  "@/lib/investing/research/scientific-validation/evidenceCollector.server";
import {hashCanonicalResearchMaterial} from
  "@/lib/investing/research/reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from
  "@/lib/investing/research/reproducibility/versions";

const range={from:"2026-01-01T00:00:00.000Z",to:"2026-12-31T00:00:00.000Z"};
const scope={contractVersion:"investing-research-scope/v1" as const,
  authenticatedUserId:"user",membershipId:"membership",tenantId:"tenant",
  ownerId:"owner",portfolioId:"portfolio",accountId:"account"};
const scientificScope={tenantId:"tenant",ownerId:"owner",portfolioId:"portfolio",
  accountId:"account"};
const portfolio={baseCurrency:"EUR",initialCapital:1000,allowLeverage:false,
  allowShorting:false,rebalanceFrequency:"monthly"};
const request={contractVersion:"investing-dataset-request/v1" as const,
  requestId:"request",instruments:["TEST"],timeframe:"1d",range,
  dataKinds:["price_bars" as const],quality:{minimumCoverageRatio:1,maximumGapCount:0,
    requireCorporateActionPolicy:false,timezone:"UTC" as const},scientificPurpose:"Validation."};
const dataset={contractVersion:"investing-dataset-version-ref/v1" as const,
  datasetVersionId:"dataset",datasetSchemaVersion:"v1",manifestHash:"a".repeat(64),
  aggregateContentHash:"b".repeat(64),
  coverage:{instruments:["TEST"],timeframe:"1d",range,coverageRatio:1,gapCount:0},
  quality:{status:"qualified" as const,warningCodes:[]},
  provenanceRef:{id:"provenance",version:"v1"},
  qualifiedAt:"2026-12-31T00:00:00.000Z"};
const candidate={contractVersion:"investing-strategy-candidate/v1" as const,
  candidateId:"candidate",candidateVersion:"v1",hypothesisId:"hypothesis",
  hypothesisVersion:"v1",state:"ready" as const,
  strategyContract:{id:"strategy",version:"v1"},parameters:[],
  portfolioAssumptions:portfolio,datasetRequirements:request,
  intendedEvaluationRange:range,generation:{generatorId:"manual",
    generatorVersion:"v1",generatedAt:range.from,parentCandidateId:null}};
const splits=[
  {name:"train",purpose:"training" as const,
    range:{from:range.from,to:"2026-06-01T00:00:00.000Z"}},
  {name:"holdout",purpose:"holdout" as const,
    range:{from:"2026-06-01T00:00:00.000Z",to:range.to}},
];
const identityMaterial={
  contractVersion:"investing-experiment-identity-material/v1" as const,
  scientificScope,candidateId:"candidate",candidateVersion:"v1",
  hypothesisId:"hypothesis",hypothesisVersion:"v1",
  strategyContract:candidate.strategyContract,canonicalParameters:[],
  datasetVersionId:"dataset",datasetManifestHash:dataset.manifestHash,
  datasetContentHash:dataset.aggregateContentHash,
  engineContract:{id:"engine",version:"v1"},
  validationProfile:{id:"strict-validation",version:"v1"},
  portfolioConfiguration:portfolio,costModel:{id:"cost",version:"v1"},
  benchmark:{id:"benchmark",version:"v1"},splits,randomSeed:null,
  configurationVersion:"v1"};
const experiment={contractVersion:"investing-experiment-definition/v1" as const,
  experimentId:"experiment",scope,candidate,dataset,evaluationRange:range,splits,
  portfolioConfiguration:portfolio,costModel:identityMaterial.costModel,
  validationProfile:identityMaterial.validationProfile,
  benchmark:identityMaterial.benchmark,engineContract:identityMaterial.engineContract,
  randomSeed:null,configurationVersion:"v1",identityMaterial};
const artifact={contractVersion:"investing-research-artifact-ref/v1" as const,
  artifactId:"artifact",kind:"backtest_result",contentHash:"c".repeat(64),
  mediaType:"application/json",schemaVersion:"v1",sizeBytes:100,
  logicalRole:"experiment_result_evidence",
  provenanceRef:{id:"execution",version:"v1"},retentionClass:"scientific_record" as const};
const result={contractVersion:"investing-experiment-result-envelope/v1" as const,
  experimentId:"experiment",runId:"run",candidateId:"candidate",candidateVersion:"v1",
  hypothesisId:"hypothesis",hypothesisVersion:"v1",scope,dataset,
  validationProfile:identityMaterial.validationProfile,benchmark:identityMaterial.benchmark,
  completionStatus:"completed" as const,summary:"Completed.",metrics:[],
  benchmarkComparison:[],warnings:[],qualityFlags:[],validationInputRefs:[],
  artifacts:[artifact]};
const input=()=>({
  contractVersion:SCIENTIFIC_VALIDATION_INPUT_VERSION,experiment,result,
  profile:{contractVersion:SCIENTIFIC_VALIDATION_PROFILE_VERSION,
    profileId:"strict-validation",profileVersion:"v1",
    minimumObservationsPerWindow:30,minimumOutOfSampleWindows:2,
    minimumPositiveWindowRatio:0.5,maximumDrawdown:0.25,maximumDegradation:0.2,
    minimumRobustnessPassRatio:0.75,costStressMultiplier:2,
    benchmarkPolicy:"buy_and_hold_same_instrument" as const,
    significance:{method:"bonferroni" as const,
      baseTest:"one_sided_normal_approximation" as const,alpha:0.05,familySize:2},
    requireTrainingSplit:true,requireHoldoutSplit:true},
  windows:[
    {windowId:"w1",purpose:"walk_forward" as const,observations:100,
      strategyReturn:0.12,benchmarkReturn:0.05,maximumDrawdown:0.1,stressedReturn:0.08},
    {windowId:"w2",purpose:"holdout" as const,observations:100,
      strategyReturn:0.1,benchmarkReturn:0.04,maximumDrawdown:0.12,stressedReturn:0.06},
  ],hypothesisPValue:0.01,robustnessPasses:9,robustnessTrials:10,
  evaluatedAt:"2027-01-01T00:00:00.000Z",
  evaluatedBy:{id:"scientific-validator",version:"v1"},
});

describe("Phase 6J scientific validation",()=>{
  it("produces deterministic accepted 6B report and decision contracts",()=>{
    const first=runScientificValidation(input());
    const second=runScientificValidation(input());
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if(!first.ok)return;
    expect(first.value.decision.outcome).toBe("validated");
    expect(validateValidationReport(first.value.report).ok).toBe(true);
    expect(validateScientificDecision(first.value.decision).ok).toBe(true);
    expect(first.value.report.evidence[0].artifactRefs).toEqual([artifact]);
  });
  it("rejects after multiple-testing correction",()=>{
    const value=input();
    value.hypothesisPValue=0.04;
    const outcome=runScientificValidation(value);
    expect(outcome.ok&&outcome.value.decision.outcome).toBe("rejected");
  });
  it("returns inconclusive for insufficient out-of-sample evidence",()=>{
    const value=input();
    value.windows=[value.windows[0]];
    const outcome=runScientificValidation(value);
    expect(outcome.ok&&outcome.value.decision.outcome).toBe("inconclusive");
  });
  it("rejects robustness, drawdown, cost stress and degradation failures",()=>{
    const value=input();
    value.robustnessPasses=1;
    value.windows[1]={...value.windows[1],strategyReturn:-0.3,
      stressedReturn:-0.4,maximumDrawdown:0.5};
    const outcome=runScientificValidation(value);
    expect(outcome.ok&&outcome.value.decision.outcome).toBe("rejected");
  });
  it("rejects profile identity mismatch",()=>{
    const value=input();
    value.profile={...value.profile,profileVersion:"v2"};
    expect(validateScientificValidationInput(value)).toEqual({
      ok:false,reason:"scientific_validation_reference_mismatch"});
  });
  it.each([null,undefined,1,[],Symbol("x"),new Date(),Object.create({polluted:true})])
  ("rejects adversarial input %# without throwing",(value)=>{
    expect(()=>validateScientificValidationInput(value)).not.toThrow();
    expect(validateScientificValidationInput(value).ok).toBe(false);
  });
  it("does not execute getters and reconstructs outputs",()=>{
    let calls=0;
    const malicious={...input(),get windows(){calls+=1;return [];}};
    expect(validateScientificValidationInput(malicious).ok).toBe(false);
    expect(calls).toBe(0);
    const value=input();
    const parsed=validateScientificValidationInput(value);
    expect(parsed.ok).toBe(true);
    if(parsed.ok){
      value.windows[0].strategyReturn=-99;
      expect(parsed.value.windows[0].strategyReturn).toBe(0.12);
    }
  });
});

describe("Phase 6J application boundary",()=>{
  const authorization={authorize:vi.fn().mockResolvedValue({ok:true,value:{
    authenticatedUserId:"user",membershipId:"membership",scope:scientificScope}})};
  const profile=input().profile;
  const profiles={load:vi.fn().mockResolvedValue(profile)};
  const evidence={collect:vi.fn().mockResolvedValue({ok:true,value:{
    windows:input().windows,hypothesisPValue:input().hypothesisPValue,
    robustnessPasses:input().robustnessPasses,robustnessTrials:input().robustnessTrials,
  }})};
  const repository:ScientificValidationRepository={
    persist:vi.fn(async value=>({report:value.report,decision:value.decision,reused:false})),
    getReport:vi.fn().mockResolvedValue(null),getDecision:vi.fn().mockResolvedValue(null),
    listReports:vi.fn().mockResolvedValue([]),listDecisions:vi.fn().mockResolvedValue([]),
  };
  const request=()=>{
    const value=input();
    return {contractVersion:SCIENTIFIC_VALIDATION_REQUEST_VERSION,
      experiment:value.experiment,result:value.result,
      evaluatedAt:value.evaluatedAt,evaluatedBy:value.evaluatedBy};
  };
  it("resolves the authoritative server-side profile and persists atomically",async()=>{
    const service=new ScientificValidationService(
      repository,authorization,profiles,evidence,async()=>{});
    const result=await service.validate(request());
    expect(result.ok).toBe(true);
    expect(profiles.load).toHaveBeenCalledWith(experiment.validationProfile);
    expect(evidence.collect).toHaveBeenCalledWith(expect.objectContaining({
      experiment:expect.objectContaining({experimentId:"experiment"}),
      result:expect.objectContaining({runId:"run"}),profile}));
    expect(repository.persist).toHaveBeenCalledWith(expect.objectContaining({
      scope:scientificScope,report:expect.any(Object),decision:expect.any(Object),
    }));
  });
  it("rejects caller-supplied profile thresholds",async()=>{
    const service=new ScientificValidationService(
      repository,authorization,profiles,evidence,async()=>{});
    expect(await service.validate({...request(),profile})).toEqual({
      ok:false,reason:"scientific_validation_input_invalid"});
  });
  it("fails closed when the authoritative profile is unavailable",async()=>{
    const service=new ScientificValidationService(repository,authorization,
      {load:vi.fn().mockResolvedValue(null)},evidence,async()=>{});
    expect(await service.validate(request())).toEqual({
      ok:false,reason:"scientific_validation_profile_unavailable"});
  });
  it("rejects cross-scope input before profile or evidence I/O",async()=>{
    const service=new ScientificValidationService(
      repository,authorization,profiles,evidence,async()=>{});
    profiles.load.mockClear();
    evidence.collect.mockClear();
    const value=request();
    const crossIdentity={...value,experiment:{...value.experiment,
      scope:{...value.experiment.scope,authenticatedUserId:"other-user"}}};
    await expect(service.validate(crossIdentity)).resolves.toEqual({
      ok:false,reason:"scientific_validation_scope_mismatch"});
    expect(profiles.load).not.toHaveBeenCalled();
    expect(evidence.collect).not.toHaveBeenCalled();
  });
});

describe("Phase 6J verified evidence collection",()=>{
  it("derives windows, benchmark, significance and stress only from artifacts",async()=>{
    const material={
      contractVersion:"investing-backtest-result/v1" as const,
      experimentId:"experiment",executionId:"execution",datasetVersionId:"dataset",
      completionStatus:"completed" as const,fills:[
        {timestamp:"2026-07-02T00:00:00.000Z",price:101,units:1,costs:1,targetWeight:1},
      ],equityCurve:[
        {timestamp:"2026-07-01T00:00:00.000Z",equity:100,cash:100,units:0},
        {timestamp:"2026-07-02T00:00:00.000Z",equity:103,cash:0,units:1},
        {timestamp:"2026-07-03T00:00:00.000Z",equity:106,cash:0,units:1},
      ],metrics:{initialCapital:100,finalEquity:106,totalReturn:0.06,
        maximumDrawdown:0,turnover:101,totalCosts:1},
    };
    const hashed=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
    expect(hashed.ok).toBe(true);
    if(!hashed.ok)return;
    const detailed={...material,resultHash:hashed.value.digest};
    const collector=new ArtifactScientificValidationEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,
        value:Buffer.from(JSON.stringify(detailed),"utf8")})},
      {load:vi.fn().mockResolvedValue([
        {timestamp:"2026-07-01T00:00:00.000Z",open:100,high:101,low:99,close:100,volume:1},
        {timestamp:"2026-07-02T00:00:00.000Z",open:100,high:102,low:99,close:101,volume:1},
        {timestamp:"2026-07-03T00:00:00.000Z",open:101,high:103,low:100,close:102,volume:1},
      ])},
    );
    const collected=await collector.collect({experiment,result,profile:input().profile});
    expect(collected.ok).toBe(true);
    if(collected.ok){
      expect(collected.value.windows).toHaveLength(1);
      expect(collected.value.windows[0]).toMatchObject({
        purpose:"holdout",observations:3,
      });
      expect(collected.value.windows[0].benchmarkReturn).toBeCloseTo(0.02,12);
      expect(collected.value.windows[0].stressedReturn)
        .toBeLessThan(collected.value.windows[0].strategyReturn);
      expect(collected.value.hypothesisPValue).toBeGreaterThanOrEqual(0);
      expect(collected.value.hypothesisPValue).toBeLessThanOrEqual(1);
    }
  });
  it("rejects an artifact whose internal result hash is forged",async()=>{
    const forged={contractVersion:"investing-backtest-result/v1",
      experimentId:"experiment",executionId:"execution",datasetVersionId:"dataset",
      completionStatus:"completed",fills:[],equityCurve:[
        {timestamp:"2026-07-01T00:00:00.000Z",equity:1,cash:1,units:0},
        {timestamp:"2026-07-02T00:00:00.000Z",equity:1,cash:1,units:0},
      ],
      metrics:{initialCapital:1,finalEquity:1,totalReturn:0,maximumDrawdown:0,
        turnover:0,totalCosts:0},resultHash:"0".repeat(64)};
    const collector=new ArtifactScientificValidationEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,
        value:Buffer.from(JSON.stringify(forged),"utf8")})},
      {load:vi.fn()},
    );
    await expect(collector.collect({experiment,result,profile:input().profile}))
      .resolves.toEqual({ok:false,reason:"scientific_validation_artifact_invalid"});
  });
  it("fails closed when an evidence dependency throws",async()=>{
    const collector=new ArtifactScientificValidationEvidenceCollector(
      {read:vi.fn().mockRejectedValue(new Error("secret transport detail"))},
      {load:vi.fn()},
    );
    await expect(collector.collect({experiment,result,profile:input().profile}))
      .resolves.toEqual({ok:false,reason:"scientific_validation_artifact_invalid"});
  });
});
