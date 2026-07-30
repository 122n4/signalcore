import {validateInvestingResearchScope,validateScientificDecision} from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {
  PORTFOLIO_RISK_ASSESSMENT_VERSION,PORTFOLIO_RISK_INPUT_VERSION,
  PORTFOLIO_RISK_PROFILE_VERSION,type PortfolioRiskAssessment,
  type PortfolioRiskCorrelation,type PortfolioRiskEvidence,type PortfolioRiskGate,
  type PortfolioRiskInput,type PortfolioRiskMemberEvidence,type PortfolioRiskResult,
} from "./types";

const plain=(value:unknown):value is Record<string,unknown>=>{
  if(typeof value!=="object"||value===null||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const d=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(key=>typeof key==="string"
    &&d[key]?.enumerable===true&&!d[key]?.get&&!d[key]?.set);
};
const exact=(v:Record<string,unknown>,keys:readonly string[])=>
  Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const nonnegative=(v:unknown):v is number=>finite(v)&&v>=0;
const identifier=(v:unknown):v is string=>typeof v==="string"
  &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(v);
const timestamp=(v:unknown):v is string=>typeof v==="string"
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const memberKeys=["decisionId","reportId","experimentId","runId","candidateId",
  "candidateVersion","datasetVersionId","allocationWeight","grossExposure",
  "netExposure","maximumDrawdown","turnover","transactionCostRate",
  "averageDailyDollarVolume","estimatedCapacity","capacityMultiple","observations",
  "intendedCapital","artifactId"] as const;
function member(value:unknown):PortfolioRiskMemberEvidence|null{
  if(!plain(value)||!exact(value,memberKeys)
    ||memberKeys.slice(0,7).some(k=>!identifier(value[k]))
    ||!identifier(value.artifactId)||!nonnegative(value.allocationWeight)
    ||!nonnegative(value.grossExposure)||!finite(value.netExposure)
    ||!nonnegative(value.maximumDrawdown)||!nonnegative(value.turnover)
    ||!nonnegative(value.transactionCostRate)
    ||!nonnegative(value.averageDailyDollarVolume)
    ||!nonnegative(value.estimatedCapacity)||!nonnegative(value.capacityMultiple)
    ||!finite(value.intendedCapital)||value.intendedCapital<=0
    ||!finite(value.observations)||!Number.isInteger(value.observations)
    ||value.observations<2)return null;
  return Object.fromEntries(memberKeys.map(k=>[k,value[k]])) as PortfolioRiskMemberEvidence;
}
function correlation(value:unknown):PortfolioRiskCorrelation|null{
  if(!plain(value)||!exact(value,["leftDecisionId","rightDecisionId","coefficient",
    "observations"])||!identifier(value.leftDecisionId)
    ||!identifier(value.rightDecisionId)||value.leftDecisionId>=value.rightDecisionId
    ||!finite(value.coefficient)||Math.abs(value.coefficient)>1
    ||!finite(value.observations)||!Number.isInteger(value.observations)
    ||value.observations<2)return null;
  return {leftDecisionId:value.leftDecisionId,rightDecisionId:value.rightDecisionId,
    coefficient:value.coefficient,observations:value.observations};
}
const evidenceKeys=["targetAllocationWeight","grossExposure","netExposure",
  "maximumDrawdown","turnover","transactionCostRate","averageDailyDollarVolume",
  "estimatedCapacity","intendedCapital","capacityMultiple","concentrationHhi",
  "maximumAbsoluteCorrelation","observations","artifactIds","members",
  "correlations"] as const;
function evidence(value:unknown):PortfolioRiskEvidence|null{
  if(!plain(value)||!exact(value,evidenceKeys)
    ||!nonnegative(value.targetAllocationWeight)||!nonnegative(value.grossExposure)
    ||!finite(value.netExposure)||!nonnegative(value.maximumDrawdown)
    ||!nonnegative(value.turnover)||!nonnegative(value.transactionCostRate)
    ||!nonnegative(value.averageDailyDollarVolume)
    ||!nonnegative(value.estimatedCapacity)||!finite(value.intendedCapital)
    ||value.intendedCapital<=0||!nonnegative(value.capacityMultiple)
    ||!nonnegative(value.concentrationHhi)
    ||!(value.maximumAbsoluteCorrelation===null
      ||nonnegative(value.maximumAbsoluteCorrelation)
        &&value.maximumAbsoluteCorrelation<=1)
    ||!finite(value.observations)||!Number.isInteger(value.observations)
    ||value.observations<2||!Array.isArray(value.artifactIds)
    ||!Array.isArray(value.members)||value.members.length===0
    ||!Array.isArray(value.correlations))return null;
  const members=value.members.map(member);const correlations=value.correlations.map(correlation);
  if(members.some(v=>v===null)||correlations.some(v=>v===null)
    ||value.artifactIds.some(v=>!identifier(v))
    ||new Set(value.artifactIds).size!==value.artifactIds.length
    ||new Set(members.map(v=>v?.decisionId)).size!==members.length)return null;
  return {targetAllocationWeight:value.targetAllocationWeight,
    grossExposure:value.grossExposure,netExposure:value.netExposure,
    maximumDrawdown:value.maximumDrawdown,turnover:value.turnover,
    transactionCostRate:value.transactionCostRate,
    averageDailyDollarVolume:value.averageDailyDollarVolume,
    estimatedCapacity:value.estimatedCapacity,intendedCapital:value.intendedCapital,
    capacityMultiple:value.capacityMultiple,concentrationHhi:value.concentrationHhi,
    maximumAbsoluteCorrelation:value.maximumAbsoluteCorrelation as number|null,
    observations:value.observations,artifactIds:[...value.artifactIds] as string[],
    members:members as PortfolioRiskMemberEvidence[],
    correlations:correlations as PortfolioRiskCorrelation[]};
}
const profileKeys=["contractVersion","profileId","profileVersion",
  "maximumAllocationWeight","maximumGrossExposure","maximumDrawdown",
  "maximumTurnover","maximumTransactionCostRate","maximumParticipationRate",
  "maximumConcentrationHhi","maximumAbsoluteCorrelation",
  "minimumAverageDailyDollarVolume","minimumCapacityMultiple","allocationPolicy",
  "minimumCorrelationObservations"] as const;
function profile(value:unknown){
  if(!plain(value)||!exact(value,profileKeys)
    ||value.contractVersion!==PORTFOLIO_RISK_PROFILE_VERSION
    ||!identifier(value.profileId)||!identifier(value.profileVersion)
    ||profileKeys.slice(3,13).some(k=>!nonnegative(value[k]))
    ||value.maximumParticipationRate as number>1
    ||value.maximumAbsoluteCorrelation as number>1
    ||value.allocationPolicy!=="equal_weight"
    ||!finite(value.minimumCorrelationObservations)
    ||!Number.isInteger(value.minimumCorrelationObservations)
    ||value.minimumCorrelationObservations<2)return null;
  return Object.fromEntries(profileKeys.map(k=>[k,value[k]])) as PortfolioRiskInput["profile"];
}
export function validatePortfolioRiskInput(value:unknown):PortfolioRiskResult<PortfolioRiskInput>{
  try{
    if(!plain(value)||!exact(value,["contractVersion","decisions","profile","evidence",
      "evaluatedAt","evaluatedBy"])||value.contractVersion!==PORTFOLIO_RISK_INPUT_VERSION
      ||!Array.isArray(value.decisions)||value.decisions.length===0
      ||!timestamp(value.evaluatedAt)||!plain(value.evaluatedBy)
      ||!exact(value.evaluatedBy,["id","version"])||!identifier(value.evaluatedBy.id)
      ||!identifier(value.evaluatedBy.version))return {ok:false,
        reason:"portfolio_risk_input_invalid"};
    const decisions=value.decisions.map(validateScientificDecision);
    const parsedProfile=profile(value.profile);const parsedEvidence=evidence(value.evidence);
    if(decisions.some(d=>!d.ok)||!parsedProfile||!parsedEvidence
      ||decisions.some(d=>d.ok&&d.value.outcome!=="validated")){
      return {ok:false,reason:"portfolio_risk_decision_not_validated"};
    }
    const valid=decisions.map(d=>{if(!d.ok)throw new Error();return d.value;});
    const first=valid[0].scientificScope;
    if(valid.some(d=>Object.keys(first).some(k=>
      d.scientificScope[k as keyof typeof first]!==first[k as keyof typeof first]))
      ||new Set(valid.map(d=>d.decisionId)).size!==valid.length
      ||valid.length!==parsedEvidence.members.length
      ||valid.some(d=>{
        const m=parsedEvidence.members.find(item=>item.decisionId===d.decisionId);
        return !m||m.reportId!==d.validationReport.reportId
          ||m.experimentId!==d.experimentId||m.runId!==d.runId
          ||m.candidateId!==d.candidateId||m.candidateVersion!==d.candidateVersion
          ||m.datasetVersionId!==d.datasetVersionId;
      })){
      return {ok:false,reason:"portfolio_risk_reference_mismatch"};
    }
    return {ok:true,value:{contractVersion:PORTFOLIO_RISK_INPUT_VERSION,
      decisions:valid,profile:parsedProfile,evidence:parsedEvidence,
      evaluatedAt:value.evaluatedAt,evaluatedBy:{id:value.evaluatedBy.id,
        version:value.evaluatedBy.version}}};
  }catch{return {ok:false,reason:"portfolio_risk_input_invalid"};}
}
export function validatePortfolioRiskAssessment(value:unknown):
PortfolioRiskResult<PortfolioRiskAssessment>{
  try{
    const keys=["contractVersion","assessmentId","assessmentHash","outcome","scope",
      "scientificScope","members","profile","evidence","gates","evaluatedAt",
      "evaluatedBy"] as const;
    if(!plain(value)||!exact(value,keys)
      ||value.contractVersion!==PORTFOLIO_RISK_ASSESSMENT_VERSION
      ||!identifier(value.assessmentId)||typeof value.assessmentHash!=="string"
      ||value.assessmentId!==`irprc_v1_${value.assessmentHash}`
      ||!["passed","failed","inconclusive","blocked"].includes(String(value.outcome))
      ||!Array.isArray(value.members)||!Array.isArray(value.gates)
      ||!plain(value.profile)||!exact(value.profile,["id","version"])
      ||!identifier(value.profile.id)||!identifier(value.profile.version)
      ||!timestamp(value.evaluatedAt)||!plain(value.evaluatedBy)
      ||!exact(value.evaluatedBy,["id","version"])
      ||!identifier(value.evaluatedBy.id)||!identifier(value.evaluatedBy.version)){
      return {ok:false,reason:"portfolio_risk_assessment_invalid"};
    }
    const scope=validateInvestingResearchScope(value.scope);
    const parsedEvidence=evidence(value.evidence);const members=value.members.map(member);
    if(!scope.ok||!plain(value.scientificScope)
      ||!exact(value.scientificScope,["tenantId","ownerId","portfolioId","accountId"])
      ||["tenantId","ownerId","portfolioId","accountId"].some(k=>
        !identifier(value.scientificScope[k]))
      ||!parsedEvidence
      ||members.some(v=>v===null)||members.length!==parsedEvidence.members.length
      ||JSON.stringify(members)!==JSON.stringify(parsedEvidence.members)){
      return {ok:false,reason:"portfolio_risk_assessment_invalid"};
    }
    const gates=value.gates.map(item=>{
      if(!plain(item)||!exact(item,["gateId","outcome","observed","limit","comparator",
        "reason"])||!identifier(item.gateId)
        ||!["passed","failed","inconclusive","blocked"].includes(String(item.outcome))
        ||!(item.observed===null||finite(item.observed))||!finite(item.limit)
        ||!["lte","gte"].includes(String(item.comparator))
        ||!(item.reason===null||identifier(item.reason)))return null;
      return {gateId:item.gateId,outcome:item.outcome,observed:item.observed,
        limit:item.limit,comparator:item.comparator,reason:item.reason} as PortfolioRiskGate;
    });
    if(gates.some(v=>v===null))return {ok:false,reason:"portfolio_risk_assessment_invalid"};
    const validGates=gates as PortfolioRiskGate[];
    const derivedOutcome:PortfolioRiskAssessment["outcome"]=
      validGates.some(g=>g.outcome==="blocked")?"blocked"
        :validGates.some(g=>g.outcome==="failed")?"failed"
          :validGates.some(g=>g.outcome==="inconclusive")?"inconclusive":"passed";
    const memberIds=new Set((members as PortfolioRiskMemberEvidence[])
      .map(item=>item.decisionId));
    const expectedCorrelations=members.length*(members.length-1)/2;
    if(derivedOutcome!==value.outcome
      ||scope.value.tenantId!==value.scientificScope.tenantId
      ||scope.value.ownerId!==value.scientificScope.ownerId
      ||scope.value.portfolioId!==value.scientificScope.portfolioId
      ||scope.value.accountId!==value.scientificScope.accountId
      ||new Set(validGates.map(g=>g.gateId)).size!==validGates.length
      ||parsedEvidence.correlations.length!==expectedCorrelations
      ||parsedEvidence.correlations.some(c=>!memberIds.has(c.leftDecisionId)
        ||!memberIds.has(c.rightDecisionId))
      ||new Set(parsedEvidence.artifactIds).size!==members.length
      ||(members as PortfolioRiskMemberEvidence[]).some(m=>
        !parsedEvidence.artifactIds.includes(m.artifactId))){
      return {ok:false,reason:"portfolio_risk_assessment_invalid"};
    }
    const material={outcome:value.outcome as PortfolioRiskAssessment["outcome"],
      scope:scope.value,scientificScope:{
        tenantId:value.scientificScope.tenantId as string,
        ownerId:value.scientificScope.ownerId as string,
        portfolioId:value.scientificScope.portfolioId as string,
        accountId:value.scientificScope.accountId as string},
      members:members as PortfolioRiskMemberEvidence[],
      profile:{id:value.profile.id,version:value.profile.version},
      evidence:parsedEvidence,gates:validGates,
      evaluatedAt:value.evaluatedAt,evaluatedBy:{id:value.evaluatedBy.id,
        version:value.evaluatedBy.version}};
    const hash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
    if(!hash.ok||hash.value.digest!==value.assessmentHash)return {ok:false,
      reason:"portfolio_risk_assessment_integrity_failed"};
    return {ok:true,value:{contractVersion:PORTFOLIO_RISK_ASSESSMENT_VERSION,
      assessmentId:value.assessmentId,assessmentHash:value.assessmentHash,
      ...material}};
  }catch{return {ok:false,reason:"portfolio_risk_assessment_invalid"};}
}
