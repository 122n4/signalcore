import "server-only";
import type {ScientificArtifactReader,ScientificDatasetBarsPort} from
  "../scientific-validation/evidenceCollector.server";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import type {PortfolioRiskEvidencePort} from "./service.server";
import type {PortfolioRiskCorrelation,PortfolioRiskMemberEvidence} from "./types";

const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null
  &&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const timestamp=(v:unknown):v is string=>typeof v==="string"
  &&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
type Series=Readonly<{decisionId:string;returns:ReadonlyMap<string,number>}>;
const correlation=(left:Series,right:Series,minimum:number):PortfolioRiskCorrelation|null=>{
  const timestamps=[...left.returns.keys()].filter(key=>right.returns.has(key)).sort();
  if(timestamps.length<minimum)return null;
  const x=timestamps.map(key=>left.returns.get(key) as number);
  const y=timestamps.map(key=>right.returns.get(key) as number);
  const mx=x.reduce((a,b)=>a+b,0)/x.length;const my=y.reduce((a,b)=>a+b,0)/y.length;
  const numerator=x.reduce((sum,v,i)=>sum+(v-mx)*(y[i]-my),0);
  const dx=Math.sqrt(x.reduce((sum,v)=>sum+(v-mx)**2,0));
  const dy=Math.sqrt(y.reduce((sum,v)=>sum+(v-my)**2,0));
  if(dx===0||dy===0)return null;
  const coefficient=numerator/(dx*dy);
  const [leftDecisionId,rightDecisionId]=
    [left.decisionId,right.decisionId].sort((a,b)=>a.localeCompare(b));
  return {leftDecisionId,rightDecisionId,
    coefficient:Math.max(-1,Math.min(1,coefficient)),observations:x.length};
};

export class ArtifactPortfolioRiskEvidenceCollector implements PortfolioRiskEvidencePort{
  constructor(private readonly artifacts:ScientificArtifactReader,
    private readonly datasets:ScientificDatasetBarsPort){}
  async collect(input:Parameters<PortfolioRiskEvidencePort["collect"]>[0]){
    try{
      const allocation=1/input.decisions.length;
      const members:PortfolioRiskMemberEvidence[]=[];const series:Series[]=[];
      for(const decision of [...input.decisions].sort((a,b)=>
        a.decisionId.localeCompare(b.decisionId))){
        const refs=decision.validationReport.result.artifacts
          .filter(item=>item.kind==="backtest_result");
        if(refs.length!==1)return {ok:false as const,
          reason:"portfolio_risk_artifact_missing"};
        const artifact=await this.artifacts.read(refs[0]);
        if(!artifact.ok)return {ok:false as const,reason:"portfolio_risk_artifact_invalid"};
        const decoded:unknown=JSON.parse(artifact.value.toString("utf8"));
        if(!record(decoded)||decoded.experimentId!==decision.experimentId
          ||decoded.datasetVersionId!==decision.datasetVersionId
          ||!Array.isArray(decoded.fills)||!Array.isArray(decoded.equityCurve)
          ||!record(decoded.metrics)||decoded.completionStatus!=="completed"){
          return {ok:false as const,reason:"portfolio_risk_artifact_invalid"};
        }
        const {resultHash,...resultMaterial}=decoded;
        const verified=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,resultMaterial);
        if(typeof resultHash!=="string"||!verified.ok||verified.value.digest!==resultHash){
          return {ok:false as const,reason:"portfolio_risk_artifact_invalid"};
        }
        const curve=decoded.equityCurve.map(item=>record(item)&&timestamp(item.timestamp)
          &&finite(item.equity)&&item.equity>0&&finite(item.units)
          ?{timestamp:item.timestamp,equity:item.equity,units:item.units}:null);
        const fills=decoded.fills.map(item=>record(item)&&timestamp(item.timestamp)
          &&finite(item.price)&&finite(item.units)&&finite(item.costs)
          &&finite(item.targetWeight)?{timestamp:item.timestamp,price:item.price,
            units:item.units,costs:item.costs,targetWeight:item.targetWeight}:null);
        if(curve.some(v=>v===null)||fills.some(v=>v===null)||curve.length<2
          ||!finite(decoded.metrics.initialCapital)||decoded.metrics.initialCapital<=0
          ||!finite(decoded.metrics.maximumDrawdown)||!finite(decoded.metrics.turnover)
          ||!finite(decoded.metrics.totalCosts)){
          return {ok:false as const,reason:"portfolio_risk_artifact_invalid"};
        }
        const validCurve=curve as NonNullable<(typeof curve)[number]>[];
        const validFills=fills as NonNullable<(typeof fills)[number]>[];
        const equityByTime=new Map(validCurve.map(point=>[point.timestamp,point.equity]));
        if(validFills.some(fill=>!equityByTime.has(fill.timestamp))){
          return {ok:false as const,reason:"portfolio_risk_exposure_alignment_missing"};
        }
        const bars=await this.datasets.load(input.scope,decision.validationReport.dataset);
        if(!Array.isArray(bars)||bars.length===0)return {ok:false as const,
          reason:"portfolio_risk_liquidity_missing"};
        const parsedBars=bars.map(item=>record(item)&&timestamp(item.timestamp)
          &&finite(item.close)&&finite(item.volume)&&item.close>0&&item.volume>=0
          ?{timestamp:item.timestamp,close:item.close,volume:item.volume}:null);
        const dollarVolumes=parsedBars.map(item=>item?item.close*item.volume:null);
        if(dollarVolumes.some(v=>v===null))return {ok:false as const,
          reason:"portfolio_risk_liquidity_invalid"};
        const adv=(dollarVolumes as number[]).reduce((a,b)=>a+b,0)/dollarVolumes.length;
        const closeByTime=new Map((parsedBars as NonNullable<
          (typeof parsedBars)[number]>[]).map(item=>[item.timestamp,item.close]));
        if(validCurve.some(point=>!closeByTime.has(point.timestamp))){
          return {ok:false as const,reason:"portfolio_risk_exposure_alignment_missing"};
        }
        const signedExposures=validCurve.map(point=>
          point.units*(closeByTime.get(point.timestamp) as number)/point.equity);
        const grossExposure=Math.max(0,...signedExposures.map(Math.abs));
        const netExposure=signedExposures[signedExposures.length-1]??0;
        const capital=decoded.metrics.initialCapital as number;
        const turnover=Math.abs((decoded.metrics.turnover as number)/capital);
        const estimatedCapacity=turnover===0?adv:
          adv*input.profile.maximumParticipationRate/turnover;
        members.push({decisionId:decision.decisionId,
          reportId:decision.validationReport.reportId,experimentId:decision.experimentId,
          runId:decision.runId,candidateId:decision.candidateId,
          candidateVersion:decision.candidateVersion,datasetVersionId:decision.datasetVersionId,
          allocationWeight:allocation,grossExposure,netExposure,
          maximumDrawdown:decoded.metrics.maximumDrawdown as number,turnover,
          transactionCostRate:Math.abs((decoded.metrics.totalCosts as number)/capital),
          averageDailyDollarVolume:adv,estimatedCapacity,
          capacityMultiple:estimatedCapacity/(capital*allocation),
          intendedCapital:capital,observations:validCurve.length,
          artifactId:refs[0].artifactId});
        const returns=new Map<string,number>();
        for(let i=1;i<validCurve.length;i+=1)returns.set(validCurve[i].timestamp,
          Math.log(validCurve[i].equity/validCurve[i-1].equity));
        series.push({decisionId:decision.decisionId,returns});
      }
      const correlations:PortfolioRiskCorrelation[]=[];
      for(let i=0;i<series.length;i+=1)for(let j=i+1;j<series.length;j+=1){
        const value=correlation(series[i],series[j],
          input.profile.minimumCorrelationObservations);
        if(!value)return {ok:false as const,reason:"portfolio_risk_correlation_incomplete"};
        correlations.push(value);
      }
      const maximumAbsoluteCorrelation=correlations.length===0?null:
        Math.max(...correlations.map(item=>Math.abs(item.coefficient)));
      const capital=members[0].intendedCapital;
      if(members.some(item=>Math.abs(item.intendedCapital-capital)>1e-9)){
        return {ok:false as const,reason:"portfolio_risk_capital_basis_mismatch"};
      }
      const commonTimestamps=series.length===1?[...series[0].returns.keys()].sort():
        [...series[0].returns.keys()].filter(key=>
          series.every(item=>item.returns.has(key))).sort();
      if(commonTimestamps.length<1)return {ok:false as const,
        reason:"portfolio_risk_portfolio_curve_incomplete"};
      let portfolioEquity=1;let peak=1;let portfolioMaximumDrawdown=0;
      for(const key of commonTimestamps){
        const combined=series.reduce((total,item)=>total+
          (item.returns.get(key) as number)/series.length,0);
        portfolioEquity*=Math.exp(combined);peak=Math.max(peak,portfolioEquity);
        portfolioMaximumDrawdown=Math.max(portfolioMaximumDrawdown,
          (peak-portfolioEquity)/peak);
      }
      const sum=(key:keyof PortfolioRiskMemberEvidence)=>members.reduce((total,item)=>
        total+(typeof item[key]==="number"?item[key] as number:0)*item.allocationWeight,0);
      const estimatedCapacity=Math.min(...members.map(item=>
        item.estimatedCapacity/item.allocationWeight));
      return {ok:true as const,value:{targetAllocationWeight:Math.max(
        ...members.map(m=>m.allocationWeight)),grossExposure:sum("grossExposure"),
      netExposure:sum("netExposure"),maximumDrawdown:portfolioMaximumDrawdown,
      turnover:sum("turnover"),transactionCostRate:sum("transactionCostRate"),
      averageDailyDollarVolume:sum("averageDailyDollarVolume"),
      estimatedCapacity,intendedCapital:capital,
      capacityMultiple:estimatedCapacity/capital,
      concentrationHhi:members.reduce((s,m)=>s+m.allocationWeight**2,0),
      maximumAbsoluteCorrelation,observations:commonTimestamps.length+1,
      artifactIds:members.map(m=>m.artifactId),members,correlations}};
    }catch{return {ok:false as const,reason:"portfolio_risk_evidence_invalid"};}
  }
}
