import "server-only";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {validatePortfolioRiskInput} from "./runtimeValidation";
import {
  PORTFOLIO_RISK_ASSESSMENT_VERSION,
  type PortfolioRiskAssessment,type PortfolioRiskGate,type PortfolioRiskResult,
} from "./types";

const gate=(gateId:string,observed:number|null,limit:number,comparator:"lte"|"gte",
  missingIsInconclusive=false):PortfolioRiskGate=>{
  if(observed===null)return {gateId,outcome:missingIsInconclusive?"inconclusive":"blocked",
    observed,limit,comparator,reason:missingIsInconclusive
      ?"portfolio_risk_evidence_inconclusive":"portfolio_risk_evidence_missing"};
  const passed=comparator==="lte"?observed<=limit:observed>=limit;
  return {gateId,outcome:passed?"passed":"failed",observed,limit,comparator,
    reason:passed?null:`portfolio_risk_${gateId}_exceeded`};
};

export function assessPortfolioRisk(value:unknown):
PortfolioRiskResult<PortfolioRiskAssessment>{
  const parsed=validatePortfolioRiskInput(value);
  if("reason" in parsed)return {ok:false,reason:parsed.reason};
  const {decisions,profile,evidence}=parsed.value;
  const gates:PortfolioRiskGate[]=[
    gate("allocation",evidence.targetAllocationWeight,profile.maximumAllocationWeight,"lte"),
    gate("gross_exposure",evidence.grossExposure,profile.maximumGrossExposure,"lte"),
    gate("drawdown",evidence.maximumDrawdown,profile.maximumDrawdown,"lte"),
    gate("turnover",evidence.turnover,profile.maximumTurnover,"lte"),
    gate("transaction_cost",evidence.transactionCostRate,
      profile.maximumTransactionCostRate,"lte"),
    gate("liquidity",evidence.averageDailyDollarVolume,
      profile.minimumAverageDailyDollarVolume,"gte"),
    gate("capacity",evidence.capacityMultiple,profile.minimumCapacityMultiple,"gte"),
    gate("concentration",evidence.concentrationHhi,
      profile.maximumConcentrationHhi,"lte"),
    evidence.members.length===1?{gateId:"correlation",outcome:"passed",observed:null,
      limit:profile.maximumAbsoluteCorrelation,comparator:"lte",
      reason:"portfolio_risk_correlation_not_applicable"}
      :gate("correlation",evidence.maximumAbsoluteCorrelation,
        profile.maximumAbsoluteCorrelation,"lte",true),
  ];
  const outcome:PortfolioRiskAssessment["outcome"]=
    gates.some(item=>item.outcome==="blocked")?"blocked"
    :gates.some(item=>item.outcome==="failed")?"failed"
      :gates.some(item=>item.outcome==="inconclusive")?"inconclusive":"passed";
  const material={
    outcome,scope:decisions[0].scope,scientificScope:decisions[0].scientificScope,
    members:evidence.members,
    profile:{id:profile.profileId,version:profile.profileVersion},
    evidence,gates,evaluatedAt:parsed.value.evaluatedAt,
    evaluatedBy:parsed.value.evaluatedBy,
  };
  const hashed=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  if(!hashed.ok)return {ok:false,reason:"portfolio_risk_hash_failed"};
  const assessment:PortfolioRiskAssessment={
    contractVersion:PORTFOLIO_RISK_ASSESSMENT_VERSION,
    assessmentId:`irprc_v1_${hashed.value.digest}`,
    assessmentHash:hashed.value.digest,...material,
  };
  return {ok:true,value:assessment};
}
