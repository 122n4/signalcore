import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {runScientificValidation} from
  "@/lib/investing/research/scientific-validation/engine.server";
import {SCIENTIFIC_VALIDATION_INPUT_VERSION,SCIENTIFIC_VALIDATION_PROFILE_VERSION}
  from "@/lib/investing/research/scientific-validation";
import {assessPortfolioRisk} from
  "@/lib/investing/research/portfolio-risk/engine.server";
import {validatePortfolioRiskAssessment,validatePortfolioRiskInput} from
  "@/lib/investing/research/portfolio-risk/runtimeValidation";
import {PORTFOLIO_RISK_INPUT_VERSION,PORTFOLIO_RISK_PROFILE_VERSION} from
  "@/lib/investing/research/portfolio-risk";
import {ArtifactPortfolioRiskEvidenceCollector} from
  "@/lib/investing/research/portfolio-risk/evidenceCollector.server";
import {hashCanonicalResearchMaterial} from
  "@/lib/investing/research/reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from
  "@/lib/investing/research/reproducibility/versions";
import {PortfolioRiskService} from
  "@/lib/investing/research/portfolio-risk/service.server";

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
    requireCorporateActionPolicy:false,timezone:"UTC" as const},scientificPurpose:"Risk."};
const dataset={contractVersion:"investing-dataset-version-ref/v1" as const,
  datasetVersionId:"dataset",datasetSchemaVersion:"v1",manifestHash:"a".repeat(64),
  aggregateContentHash:"b".repeat(64),
  coverage:{instruments:["TEST"],timeframe:"1d",range,coverageRatio:1,gapCount:0},
  quality:{status:"qualified" as const,warningCodes:[]},
  provenanceRef:{id:"provenance",version:"v1"},qualifiedAt:range.to};
const candidate={contractVersion:"investing-strategy-candidate/v1" as const,
  candidateId:"candidate",candidateVersion:"v1",hypothesisId:"hypothesis",
  hypothesisVersion:"v1",state:"ready" as const,
  strategyContract:{id:"strategy",version:"v1"},parameters:[],
  portfolioAssumptions:portfolio,datasetRequirements:request,
  intendedEvaluationRange:range,generation:{generatorId:"manual",
    generatorVersion:"v1",generatedAt:range.from,parentCandidateId:null}};
const splits=[{name:"train",purpose:"training" as const,
  range:{from:range.from,to:"2026-06-01T00:00:00.000Z"}},
{name:"holdout",purpose:"holdout" as const,
  range:{from:"2026-06-01T00:00:00.000Z",to:range.to}}];
const identityMaterial={contractVersion:"investing-experiment-identity-material/v1" as const,
  scientificScope,candidateId:"candidate",candidateVersion:"v1",
  hypothesisId:"hypothesis",hypothesisVersion:"v1",
  strategyContract:candidate.strategyContract,canonicalParameters:[],
  datasetVersionId:"dataset",datasetManifestHash:dataset.manifestHash,
  datasetContentHash:dataset.aggregateContentHash,
  engineContract:{id:"engine",version:"v1"},validationProfile:{id:"risk",version:"v1"},
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
  logicalRole:"experiment_result_evidence",provenanceRef:{id:"execution",version:"v1"},
  retentionClass:"scientific_record" as const};
const result={contractVersion:"investing-experiment-result-envelope/v1" as const,
  experimentId:"experiment",runId:"run",candidateId:"candidate",candidateVersion:"v1",
  hypothesisId:"hypothesis",hypothesisVersion:"v1",scope,dataset,
  validationProfile:identityMaterial.validationProfile,benchmark:identityMaterial.benchmark,
  completionStatus:"completed" as const,summary:"Completed.",metrics:[],
  benchmarkComparison:[],warnings:[],qualityFlags:[],validationInputRefs:[],
  artifacts:[artifact]};
const validation=runScientificValidation({
  contractVersion:SCIENTIFIC_VALIDATION_INPUT_VERSION,experiment,result,
  profile:{contractVersion:SCIENTIFIC_VALIDATION_PROFILE_VERSION,profileId:"risk",
    profileVersion:"v1",minimumObservationsPerWindow:2,minimumOutOfSampleWindows:1,
    minimumPositiveWindowRatio:0.5,maximumDrawdown:0.3,maximumDegradation:0.3,
    minimumRobustnessPassRatio:0.5,costStressMultiplier:2,
    benchmarkPolicy:"buy_and_hold_same_instrument",
    significance:{method:"bonferroni",baseTest:"one_sided_normal_approximation",
      alpha:0.05,familySize:1},requireTrainingSplit:true,requireHoldoutSplit:true},
  windows:[{windowId:"holdout",purpose:"holdout",observations:100,
    strategyReturn:0.2,benchmarkReturn:0.05,maximumDrawdown:0.1,stressedReturn:0.15}],
  hypothesisPValue:0.01,robustnessPasses:1,robustnessTrials:1,
  evaluatedAt:"2027-01-01T00:00:00.000Z",evaluatedBy:{id:"validator",version:"v1"}});
if(!validation.ok)throw new Error("phase6j_fixture_invalid");
const profile={contractVersion:PORTFOLIO_RISK_PROFILE_VERSION,profileId:"risk",
  profileVersion:"v1",maximumAllocationWeight:1,maximumGrossExposure:1,
  maximumDrawdown:0.25,maximumTurnover:2,maximumTransactionCostRate:0.05,
  maximumParticipationRate:0.1,maximumConcentrationHhi:1,
  maximumAbsoluteCorrelation:0.8,minimumAverageDailyDollarVolume:1000,
  minimumCapacityMultiple:10,allocationPolicy:"equal_weight" as const,
  minimumCorrelationObservations:2};
const member={decisionId:validation.value.decision.decisionId,
  reportId:validation.value.decision.validationReport.reportId,
  experimentId:"experiment",runId:"run",candidateId:"candidate",candidateVersion:"v1",
  datasetVersionId:"dataset",allocationWeight:1,grossExposure:0.8,netExposure:0.8,
  maximumDrawdown:0.1,turnover:1,transactionCostRate:0.01,
  averageDailyDollarVolume:200000,estimatedCapacity:20000,capacityMultiple:20,
  intendedCapital:1000,observations:100,artifactId:"artifact"};
const evidence={targetAllocationWeight:1,grossExposure:0.8,netExposure:0.8,
  maximumDrawdown:0.1,turnover:1,transactionCostRate:0.01,
  averageDailyDollarVolume:200000,estimatedCapacity:20000,intendedCapital:1000,
  capacityMultiple:20,concentrationHhi:0.64,maximumAbsoluteCorrelation:0,
  observations:100,artifactIds:["artifact"],members:[member],correlations:[]};
const input=()=>({contractVersion:PORTFOLIO_RISK_INPUT_VERSION,
  decisions:[validation.value.decision],profile:{...profile},
  evidence:{...evidence,artifactIds:[...evidence.artifactIds],
    members:evidence.members.map(item=>({...item})),
    correlations:evidence.correlations.map(item=>({...item}))},
  evaluatedAt:"2027-01-02T00:00:00.000Z",evaluatedBy:{id:"risk-engine",version:"v1"}});

describe("Phase 6K portfolio risk and capacity",()=>{
  it("creates deterministic passed evidence without promotion eligibility",()=>{
    const first=assessPortfolioRisk(input());
    expect(first).toEqual(assessPortfolioRisk(input()));
    expect(first.ok&&first.value.outcome).toBe("passed");
    if(first.ok)expect(JSON.stringify(first.value)).not.toContain("promotion_eligible");
  });
  it("fails closed on liquidity, capacity, drawdown and concentration",()=>{
    const value=input();
    value.evidence={...value.evidence,averageDailyDollarVolume:1,capacityMultiple:0.1,
      maximumDrawdown:0.8,concentrationHhi:2};
    const assessed=assessPortfolioRisk(value);
    expect(assessed.ok&&assessed.value.outcome).toBe("failed");
  });
  it("rejects missing capacity and a non-validated decision",()=>{
    const missing=input();missing.evidence={...missing.evidence,capacityMultiple:null};
    expect(assessPortfolioRisk(missing).ok).toBe(false);
    const rejected=input();rejected.decisions=[{...rejected.decisions[0],
      outcome:"rejected"}];
    expect(validatePortfolioRiskInput(rejected)).toEqual({
      ok:false,reason:"portfolio_risk_decision_not_validated"});
  });
  it.each([null,undefined,1,[],Symbol("x"),new Date(),Object.create({polluted:true})])
  ("rejects adversarial input %# without throwing",(value)=>{
    expect(()=>validatePortfolioRiskInput(value)).not.toThrow();
    expect(validatePortfolioRiskInput(value).ok).toBe(false);
  });
  it("does not execute getters and reconstructs evidence",()=>{
    let calls=0;
    const malicious={...input(),get evidence(){calls+=1;return evidence;}};
    expect(validatePortfolioRiskInput(malicious).ok).toBe(false);
    expect(calls).toBe(0);
    const value=input();const parsed=validatePortfolioRiskInput(value);
    expect(parsed.ok).toBe(true);
    if(parsed.ok){value.evidence.artifactIds[0]="mutated";
      expect(parsed.value.evidence.artifactIds[0]).toBe("artifact");}
  });
  it("revalidates the full persisted assessment and its hash",()=>{
    const assessed=assessPortfolioRisk(input());
    expect(assessed.ok).toBe(true);if(!assessed.ok)return;
    const revalidated=validatePortfolioRiskAssessment(assessed.value);
    if("reason" in revalidated)throw new Error(revalidated.reason);
    expect(validatePortfolioRiskAssessment({...assessed.value,
      outcome:"failed"})).toEqual({ok:false,
      reason:"portfolio_risk_assessment_invalid"});
  });
});

describe("Phase 6K verified evidence",()=>{
  const material={contractVersion:"investing-backtest-result/v1",
    experimentId:"experiment",executionId:"execution",datasetVersionId:"dataset",
    completionStatus:"completed",fills:[
      {timestamp:"2026-07-02T00:00:00.000Z",price:100,units:8,costs:2,
        targetWeight:0.8}],
    equityCurve:[{timestamp:"2026-07-01T00:00:00.000Z",equity:1000,cash:1000,units:0},
      {timestamp:"2026-07-02T00:00:00.000Z",equity:1050,cash:250,units:8}],
    metrics:{initialCapital:1000,finalEquity:1050,totalReturn:0.05,
      maximumDrawdown:0.1,turnover:800,totalCosts:2}};
  it("derives liquidity, capacity, exposure and costs from verified sources",async()=>{
    const hash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
    expect(hash.ok).toBe(true);if(!hash.ok)return;
    const collector=new ArtifactPortfolioRiskEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,
        value:Buffer.from(JSON.stringify({...material,resultHash:hash.value.digest}))})},
      {load:vi.fn().mockResolvedValue([
        {timestamp:"2026-07-01T00:00:00.000Z",open:100,high:101,low:99,
          close:100,volume:2000},
        {timestamp:"2026-07-02T00:00:00.000Z",open:100,high:101,low:99,
          close:100,volume:2000},
      ])});
    const collected=await collector.collect({decisions:[validation.value.decision],
      scope:scientificScope,profile});
    expect(collected).toMatchObject({ok:true,value:{targetAllocationWeight:1,
      averageDailyDollarVolume:200000,intendedCapital:1000,
      maximumAbsoluteCorrelation:null}});
  });
  it("rejects a forged internal result hash",async()=>{
    const collector=new ArtifactPortfolioRiskEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,value:Buffer.from(
        JSON.stringify({...material,resultHash:"0".repeat(64)}))})},
      {load:vi.fn()});
    await expect(collector.collect({decisions:[validation.value.decision],
      scope:scientificScope,profile})).resolves.toEqual({
      ok:false,reason:"portfolio_risk_artifact_invalid"});
  });
  it("constructs equal allocations and computes aligned pairwise correlation",async()=>{
    const multiMaterial={...material,equityCurve:[...material.equityCurve,
      {timestamp:"2026-07-03T00:00:00.000Z",equity:1100,cash:300,units:8}]};
    const hash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,multiMaterial);
    expect(hash.ok).toBe(true);if(!hash.ok)return;
    const collector=new ArtifactPortfolioRiskEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,
        value:Buffer.from(JSON.stringify({...multiMaterial,
          resultHash:hash.value.digest}))})},
      {load:vi.fn().mockResolvedValue([{timestamp:"2026-07-01T00:00:00.000Z",
        open:100,high:101,low:99,close:100,volume:2000},
      {timestamp:"2026-07-02T00:00:00.000Z",
        open:100,high:101,low:99,close:100,volume:2000},
      {timestamp:"2026-07-03T00:00:00.000Z",
        open:100,high:101,low:99,close:100,volume:2000}])});
    const second={...validation.value.decision,decisionId:"second-decision"};
    const collected=await collector.collect({decisions:[validation.value.decision,second],
      scope:scientificScope,profile});
    expect(collected).toMatchObject({ok:true,value:{targetAllocationWeight:0.5,
      concentrationHhi:0.5,maximumAbsoluteCorrelation:1,
      correlations:[{observations:2}]}});
  });
  it("rejects fills without an equity point at the same timestamp",async()=>{
    const bad={...material,fills:[{...material.fills[0],
      timestamp:"2026-07-03T00:00:00.000Z"}]};
    const hash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,bad);
    expect(hash.ok).toBe(true);if(!hash.ok)return;
    const collector=new ArtifactPortfolioRiskEvidenceCollector(
      {read:vi.fn().mockResolvedValue({ok:true,
        value:Buffer.from(JSON.stringify({...bad,resultHash:hash.value.digest}))})},
      {load:vi.fn()});
    await expect(collector.collect({decisions:[validation.value.decision],
      scope:scientificScope,profile})).resolves.toEqual({
      ok:false,reason:"portfolio_risk_exposure_alignment_missing"});
  });
});

describe("Phase 6K application boundary",()=>{
  it("rejects malformed audit metadata before repository I/O",async()=>{
    const repository={getDecision:vi.fn(),persist:vi.fn(),get:vi.fn(),list:vi.fn()};
    const service=new PortfolioRiskService(repository,{
      authorize:vi.fn().mockResolvedValue({ok:true,value:{
        authenticatedUserId:"user",membershipId:"membership",scope:scientificScope}})},
    {load:vi.fn()},{collect:vi.fn()},async()=>{});
    await expect(service.assess({contractVersion:"investing-portfolio-risk-request/v1",
      decisionIds:[validation.value.decision.decisionId],evaluatedAt:"invalid",
      evaluatedBy:{id:"risk",version:"v1"}})).resolves.toEqual({
      ok:false,reason:"portfolio_risk_request_invalid"});
    expect(repository.getDecision).not.toHaveBeenCalled();
  });
  it("rejects identity mismatch before profile and evidence I/O",async()=>{
    const profiles={load:vi.fn()};const collector={collect:vi.fn()};
    const repository={getDecision:vi.fn().mockResolvedValue({
      ...validation.value.decision,scope:{...validation.value.decision.scope,
        authenticatedUserId:"other"}}),persist:vi.fn(),get:vi.fn(),list:vi.fn()};
    const service=new PortfolioRiskService(repository,{
      authorize:vi.fn().mockResolvedValue({ok:true,value:{
        authenticatedUserId:"user",membershipId:"membership",scope:scientificScope}})},
    profiles,collector,async()=>{});
    await expect(service.assess({contractVersion:"investing-portfolio-risk-request/v1",
      decisionIds:[validation.value.decision.decisionId],
      evaluatedAt:"2027-01-02T00:00:00.000Z",
      evaluatedBy:{id:"risk",version:"v1"}})).resolves.toEqual({
      ok:false,reason:"portfolio_risk_scope_mismatch"});
    expect(profiles.load).not.toHaveBeenCalled();
    expect(collector.collect).not.toHaveBeenCalled();
  });
});
