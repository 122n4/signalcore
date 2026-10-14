import {beforeEach,describe,expect,it,vi} from "vitest";
import {hashRefV1,type HashDomainV1,type HashRefV1} from "../lib/investing/research/canonical";
import {
  hashExperimentComparisonProtocolV1, type ExperimentComparisonProtocolV1,
} from "../lib/investing/research/experimentComparison";
import {
  canonicalExperimentComparisonResultV1,
  hashExperimentComparisonResultV1,type ExperimentComparisonResultV1,
} from "../lib/investing/research/experimentComparisonResult";
import {compareExactMetricObservationV1} from "../lib/investing/research/experimentComparisonEvidence";
import {
  readPersistedPromotionRobustnessV1,type PromotionRobustnessBindingV1,
} from "../lib/investing/research/scientificPromotionRobustnessReader";
import type {ResearchPassportV1} from "../lib/investing/research/researchPassportReader";
import type {
  AuthorizedResearchPassportReadContext,InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";

vi.mock("server-only",()=>({}));
const uuid={
  investigation:"11111111-1111-4111-8111-111111111111",
  tenant:"22222222-2222-4222-8222-222222222222",
  principal:"33333333-3333-4333-8333-333333333333",
  membership:"44444444-4444-4444-8444-444444444444",
};
const ref=(d:HashDomainV1,c:string):HashRefV1=>hashRefV1({
  hashAlgorithm:"SHA-256",hashDomain:d,hashVersion:"SYNTRAKE_SHA256_V1",hashHex:c.repeat(64).slice(0,64),
});
const q=(n:string,d="1")=>({numerator:n,denominator:d});
const subj=ref("SYNTRAKE:EXPERIMENT:V1","B");
const base=ref("SYNTRAKE:EXPERIMENT:V1","A");
const member=ref("SYNTRAKE:EXPERIMENT:V1","C");
const bParams=ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1","D");
const sParams=ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1","E");
const bResult=ref("SYNTRAKE:RESULT:V1","F");
const sResult=ref("SYNTRAKE:RESULT:V1","1");
const bValidation=ref("SYNTRAKE:VALIDATION_RESULT:V1","2");
const sValidation=ref("SYNTRAKE:VALIDATION_RESULT:V1","3");

function fixture(){
  const protocol:ExperimentComparisonProtocolV1={
    schemaVersion:"EXPERIMENT_COMPARISON_PROTOCOL_V1",
    policyId:"ROBUSTNESS_COMPARISON_POLICY_V20260927",
    referenceExperiment:base,subjectExperiment:subj,
    referenceExperimentParameters:bParams,subjectExperimentParameters:sParams,
    referenceResult:bResult,subjectResult:sResult,
    referenceValidationResult:bValidation,subjectValidationResult:sValidation,
    metricRegistryVersion:"METRIC_REGISTRY_V20260927",
    primaryMetricId:"TOTAL_RETURN",
    comparisonMetricIds:["TOTAL_RETURN","TRADE_COUNT","REBALANCE_COUNT"],
    neighborhoodExperimentRefs:[base,subj,member],
  };
  const protocolHash=hashExperimentComparisonProtocolV1(protocol);
  const protocolRef=ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",protocolHash);
  const result:ExperimentComparisonResultV1={
    schemaVersion:"EXPERIMENT_COMPARISON_RESULT_V1",
    protocol:protocolRef as ExperimentComparisonResultV1["protocol"],
    parameterDeltas:[],scientificInputDelta:[],metricDeltas:[],
    validationEvidence:{completeFoldCount:"3",degradedFoldCount:"0",nonDegradedFoldCount:"3",
      aggregateOosOrientedDeltaSign:"1",foldMin:q("0"),foldMax:q("3","100"),foldRange:q("3","100")},
    costEvidence:{state:"UNAVAILABLE",reason:"MISSING_EXACT_COST_EVIDENCE"},
    neighborhoodEvidence:{state:"AVAILABLE",neighborhoodMemberCount:"3",availableMemberCount:"3",
      unavailableMemberCount:"0",unavailableReasons:[],
      neighborhoodMembers:[
        {experiment:base,state:"AVAILABLE",delta:q("0"),reason:null},
        {experiment:subj,state:"AVAILABLE",delta:q("1","20"),reason:null},
        {experiment:member,state:"AVAILABLE",delta:q("1","50"),reason:null},
      ],degradedMemberCount:"0",improvedOrEqualMemberCount:"3",
      neighborhoodMin:q("0"),neighborhoodMax:q("1","20"),neighborhoodSpread:q("1","20")},
    concentrationEvidence:{state:"AVAILABLE",tradeCount:"20",rebalanceCount:"5",foldDirectionConcentration:false},
    diagnostics:[],classification:"ROBUSTNESS_STABLE",failure:null,
  };
  const resultHash=hashExperimentComparisonResultV1(result);
  const binding:PromotionRobustnessBindingV1={
    subjectExperiment:subj,subjectExperimentParameters:sParams,
    subjectResult:sResult,subjectValidationResult:sValidation,
  };
  const authority={
    actorKind:"USER_PRINCIPAL",actorId:"owner",tenantId:uuid.tenant,
    principalId:uuid.principal,tenantMembershipId:uuid.membership,
    researchInvestigationId:uuid.investigation,
    operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH",
  } as AuthorizedResearchPassportReadContext;
  const passport={
    investigation:{
      researchInvestigationId:uuid.investigation,tenantId:uuid.tenant,
      principalId:uuid.principal,tenantMembershipId:uuid.membership,
      operationScope:"TENANT_SCOPE",sourceContext:"PURE_RESEARCH",
    },
    experiments:[
      {researchExperimentId:"ref",experiment:base,experimentParameters:bParams,parentExperimentId:null},
      {researchExperimentId:"sub",experiment:subj,experimentParameters:sParams,parentExperimentId:"ref"},
      {researchExperimentId:"third",experiment:member,experimentParameters:bParams,parentExperimentId:"ref"},
    ],
    runInputs:[{runInputIdentityId:"ref-run",researchExperimentId:"ref",experimentHashHex:base.hashHex}],
    results:[{resultIdentityId:"ref-result",runInputIdentityId:"ref-run",result:bResult}],
    executionRuns:[{runInputIdentityId:"ref-run",resultIdentityId:"ref-result",terminalState:"SUCCEEDED"}],
    validation:{availability:"AVAILABLE_RL3",episodes:[
      {researchExperimentId:"ref",state:"AGGREGATE_AVAILABLE",
        aggregate:{validationResult:bValidation}},
    ]},
  } as unknown as ResearchPassportV1;
  const rows: {protocol_hash_hex:string;protocol_payload:unknown;result_hash_hex:string|null;result_payload:unknown|null}[]=[{
    protocol_hash_hex:protocolHash,protocol_payload:protocol,
    result_hash_hex:resultHash,result_payload:canonicalExperimentComparisonResultV1(result),
  }];
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const queryState={throwRead:false};
  const db={query:vi.fn(async(sql:string,params:readonly unknown[]=[])=>{
    calls.push({sql,params});
    if(queryState.throwRead && sql.includes("from investing.research_experiment_comparison_protocols_scientific_identities")) throw Error("PG_DENIAL");
    return {rows:sql.includes("from investing.research_experiment_comparison_protocols_scientific_identities")
      ?rows:[]};
  })} as unknown as InvestingAuthorityTransactionClient;
  return {protocol,result,protocolHash,resultHash,binding,authority,passport,rows,calls,db,queryState};
}

describe("RL-10 RL-7 persisted robustness bridge",()=>{
  let f:ReturnType<typeof fixture>;
  beforeEach(()=>{f=fixture();});
  const read=()=>readPersistedPromotionRobustnessV1(f.db,f.authority,f.passport,f.binding);
  it("proves both canonical hashes, reference Result, Validation and owner binding",async()=>{
    const result=await read();
    expect(result).not.toBeNull();
    expect(result?.protocolRef.hashHex).toBe(f.protocolHash);
    expect(result?.resultRef.hashHex).toBe(f.resultHash);
    expect(result?.result.classification).toBe("ROBUSTNESS_STABLE");
    expect(f.calls.filter(x=>x.sql.includes("set_config")).map(x=>x.params[1])).toEqual([
      "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1",
    ]);
    const select=f.calls.find(x=>x.sql.includes("from investing.research_experiment_comparison_protocols_scientific_identities"));
    expect(select?.params).toEqual([uuid.tenant,uuid.principal,uuid.membership,uuid.investigation,
      subj.hashHex,sResult.hashHex,sValidation.hashHex]);
    expect(f.calls.some(x=>/^\s*(insert|update|delete|alter|drop|create)\b/iu.test(x.sql))).toBe(false);
  });
  it("decodes accepted JSONB exact-number signs without changing the scientific hash",async()=>{
    const observation=(value:string)=>({
      metricId:"CAGR" as const,metricVersion:"METRIC_V2" as const,
      registryVersion:"METRIC_REGISTRY_V20260927" as const,
      artifactSchemaVersion:"METRIC_RESULT_SET_V2" as const,
      state:"VALUE" as const,canonicalDecimal:value,
    });
    const compared=compareExactMetricObservationV1(observation("0.05"),observation("0.1"));
    if(compared.state!=="AVAILABLE")throw Error("FIXTURE_METRIC_MISSING");
    const result:ExperimentComparisonResultV1={...f.result,metricDeltas:[compared.delta]};
    const newHash=hashExperimentComparisonResultV1(result);
    const canonical=canonicalExperimentComparisonResultV1(result) as unknown as Record<string,unknown>;
    expect((canonical.metricDeltas as {orientedDeltaSign:string}[])[0]?.orientedDeltaSign).toBe("1");
    f.rows[0]={...f.rows[0]!,result_hash_hex:newHash,result_payload:canonical};
    const readResult=await read();
    expect(readResult?.result.metricDeltas[0]?.orientedDeltaSign).toBe(1);
    expect(readResult&&hashExperimentComparisonResultV1(readResult.result)).toBe(newHash);
    f.rows[0]={...f.rows[0]!,result_payload:{
      ...canonical,metricDeltas:[{...(canonical.metricDeltas as Record<string,unknown>[])[0],orientedDeltaSign:1}],
    }};
    await expect(read()).rejects.toThrow("RL7_CANONICAL_SIGN_INVALID");
  });
  it("reports no comparison as unavailable evidence, never fabricated STABLE",async()=>{
    f.rows.splice(0);
    expect(await read()).toBeNull();
  });
  it("rejects ambiguous or unfinished persisted comparison",async()=>{
    f.rows.push({...f.rows[0]!});
    await expect(read()).rejects.toThrow("RL7_EVIDENCE_AMBIGUOUS_OR_MISSING");
    f.rows.splice(1);
    f.rows[0]!.result_hash_hex=null;
    await expect(read()).rejects.toThrow("RL7_COMPARISON_INCOMPLETE");
  });
  it("rejects tampered protocol, Result and invalid subject/ref lineage",async()=>{
    const correct={...f.rows[0]!};
    f.rows[0]!.protocol_hash_hex="A".repeat(64);
    await expect(read()).rejects.toThrow();
    f.rows[0]={...correct,result_hash_hex:"B".repeat(64)};
    await expect(read()).rejects.toThrow();
    f.rows[0]={...correct,protocol_payload:{...(correct.protocol_payload as ExperimentComparisonProtocolV1),subjectExperiment:base}};
    await expect(read()).rejects.toThrow();
  });
  it("rejects foreign Investigation, reference Experiment, missing owner Result and failed run",async()=>{
    f.authority= {...f.authority,tenantId:"77777777-7777-4777-8777-777777777777"};
    await expect(read()).rejects.toThrow("RL7_PROMOTION_AUTHORITY_INVALID");
    f=fixture();
    (f.passport.experiments as unknown[]).splice(0,1);
    await expect(read()).rejects.toThrow("RL7_EVIDENCE_AMBIGUOUS_OR_MISSING");
    f=fixture();
    (f.passport.experiments as unknown as {parentExperimentId:string|null}[])[1]!.parentExperimentId=null;
    await expect(read()).rejects.toThrow("RL7_REFERENCE_NOT_ANCESTOR");
    f=fixture();
    (f.passport.executionRuns as unknown as {terminalState:string}[])[0]!.terminalState="FAILED";
    await expect(read()).rejects.toThrow("RL7_REFERENCE_RESULT_INVALID");
  });
  it("restores the RL-8 operation even when SQL SELECT throws",async()=>{
    f.queryState.throwRead=true;
    await expect(read()).rejects.toThrow("PG_DENIAL");
    expect(f.calls.filter(x=>x.sql.includes("set_config")).map(x=>x.params[1])).toEqual([
      "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1",
    ]);
  });
});
