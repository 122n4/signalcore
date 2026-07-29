import "server-only";
import type {
  BacktestBar,
  BacktestResult,
} from "../backtesting";
import type {
  DatasetVersionRef,
  ExperimentDefinition,
  ExperimentResultEnvelope,
  ResearchArtifactRef,
  InvestingResearchScientificScope,
} from "../contracts";
import type {
  ScientificValidationProfile,
  ScientificValidationResult,
  ValidationWindow,
} from "./types";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";

export interface ScientificArtifactReader{
  read(reference:ResearchArtifactRef):Promise<
    Readonly<{ok:true;value:Buffer}>|Readonly<{ok:false;reason:string}>>;
}
export interface ScientificDatasetBarsPort{
  load(scope:InvestingResearchScientificScope,dataset:DatasetVersionRef):Promise<unknown>;
}
export type CollectedScientificEvidence=Readonly<{
  windows:readonly ValidationWindow[];
  hypothesisPValue:number;
  robustnessPasses:number;
  robustnessTrials:number;
}>;
export interface ScientificValidationEvidencePort{
  collect(input:Readonly<{experiment:ExperimentDefinition;
    result:ExperimentResultEnvelope;profile:ScientificValidationProfile}>):
    Promise<ScientificValidationResult<CollectedScientificEvidence>>;
}

const plain=(value:unknown):value is Record<string,unknown>=>{
  if(typeof value!=="object"||value===null||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every(key=>typeof key==="string"
    &&descriptors[key]?.enumerable===true&&!descriptors[key]?.get&&!descriptors[key]?.set);
};
const exact=(value:Record<string,unknown>,keys:readonly string[])=>
  Reflect.ownKeys(value).length===keys.length
  &&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const timestamp=(value:unknown):value is string=>typeof value==="string"
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const bar=(value:unknown):BacktestBar|null=>{
  if(!plain(value)||!exact(value,["timestamp","open","high","low","close","volume"])
    ||!timestamp(value.timestamp)||!finite(value.open)||value.open<=0
    ||!finite(value.high)||value.high<=0||!finite(value.low)||value.low<=0
    ||!finite(value.close)||value.close<=0
    ||!(value.volume===null||(finite(value.volume)&&value.volume>=0))
    ||value.high<Math.max(value.open,value.close)
    ||value.low>Math.min(value.open,value.close)||value.low>value.high)return null;
  return {timestamp:value.timestamp,open:value.open,high:value.high,low:value.low,
    close:value.close,volume:value.volume===null?0:value.volume as number};
};
function result(value:unknown):BacktestResult|null{
  if(!plain(value)||!exact(value,["contractVersion","experimentId","executionId",
    "datasetVersionId","completionStatus","fills","equityCurve","metrics","resultHash"])
    ||value.contractVersion!=="investing-backtest-result/v1"
    ||typeof value.experimentId!=="string"||typeof value.executionId!=="string"
    ||typeof value.datasetVersionId!=="string"||value.completionStatus!=="completed"
    ||typeof value.resultHash!=="string"||!Array.isArray(value.fills)
    ||!Array.isArray(value.equityCurve)||!plain(value.metrics))return null;
  const fills=value.fills.map(item=>{
    if(!plain(item)||!exact(item,["timestamp","price","units","costs","targetWeight"])
      ||!timestamp(item.timestamp)||!finite(item.price)||!finite(item.units)
      ||!finite(item.costs)||!finite(item.targetWeight))return null;
    return {timestamp:item.timestamp,price:item.price,units:item.units,costs:item.costs,
      targetWeight:item.targetWeight};
  });
  const curve=value.equityCurve.map(item=>{
    if(!plain(item)||!exact(item,["timestamp","equity","cash","units"])
      ||!timestamp(item.timestamp)||!finite(item.equity)||item.equity<=0
      ||!finite(item.cash)||!finite(item.units))return null;
    return {timestamp:item.timestamp,equity:item.equity,cash:item.cash,units:item.units};
  });
  const metricKeys=["initialCapital","finalEquity","totalReturn","maximumDrawdown",
    "turnover","totalCosts"] as const;
  if(fills.some(item=>item===null)||curve.some(item=>item===null)
    ||!exact(value.metrics,metricKeys)
    ||metricKeys.some(key=>!finite(value.metrics[key])))return null;
  return {
    contractVersion:"investing-backtest-result/v1",
    experimentId:value.experimentId,
    executionId:value.executionId,
    datasetVersionId:value.datasetVersionId,
    completionStatus:"completed",
    fills:fills as NonNullable<(typeof fills)[number]>[],
    equityCurve:curve as NonNullable<(typeof curve)[number]>[],
    metrics:{
      initialCapital:value.metrics.initialCapital as number,
      finalEquity:value.metrics.finalEquity as number,
      totalReturn:value.metrics.totalReturn as number,
      maximumDrawdown:value.metrics.maximumDrawdown as number,
      turnover:value.metrics.turnover as number,
      totalCosts:value.metrics.totalCosts as number,
    },
    resultHash:value.resultHash,
  };
}
const normalCdf=(x:number)=>{
  const sign=x<0?-1:1;const z=Math.abs(x)/Math.sqrt(2);
  const t=1/(1+0.3275911*z);
  const erf=sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t
    -0.284496736)*t+0.254829592)*t*Math.exp(-z*z));
  return 0.5*(1+erf);
};

export class ArtifactScientificValidationEvidenceCollector
implements ScientificValidationEvidencePort{
  constructor(private readonly artifacts:ScientificArtifactReader,
    private readonly datasets:ScientificDatasetBarsPort){}
  async collect(input:Parameters<ScientificValidationEvidencePort["collect"]>[0]):
  Promise<ScientificValidationResult<CollectedScientificEvidence>>{
    const references=input.result.artifacts.filter(item=>item.kind==="backtest_result");
    if(references.length!==1)return {ok:false,reason:"scientific_validation_artifact_missing"};
    let loaded:Awaited<ReturnType<ScientificArtifactReader["read"]>>;
    try{loaded=await this.artifacts.read(references[0]);}catch{
      return {ok:false,reason:"scientific_validation_artifact_invalid"};
    }
    if(!loaded.ok)return {ok:false,reason:"scientific_validation_artifact_invalid"};
    let decoded:unknown;
    try{decoded=JSON.parse(loaded.value.toString("utf8"));}catch{
      return {ok:false,reason:"scientific_validation_artifact_invalid"};
    }
    const backtest=result(decoded);
    if(backtest===null||backtest.experimentId!==input.experiment.experimentId
      ||backtest.datasetVersionId!==input.experiment.dataset.datasetVersionId){
      return {ok:false,reason:"scientific_validation_artifact_mismatch"};
    }
    const {resultHash,...resultMaterial}=backtest;
    const verified=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,resultMaterial);
    if(!verified.ok||verified.value.digest!==resultHash){
      return {ok:false,reason:"scientific_validation_artifact_invalid"};
    }
    let rawBars:unknown;
    try{
      rawBars=await this.datasets.load(input.experiment.identityMaterial.scientificScope,
        input.experiment.dataset);
    }catch{return {ok:false,reason:"scientific_validation_dataset_invalid"};}
    if(!Array.isArray(rawBars))return {ok:false,reason:"scientific_validation_dataset_invalid"};
    const bars=rawBars.map(bar);
    if(bars.some(item=>item===null))return {ok:false,reason:"scientific_validation_dataset_invalid"};
    const validBars=bars as BacktestBar[];
    const windows:ValidationWindow[]=[];
    const excessReturns:number[]=[];
    for(const split of input.experiment.splits.filter(item=>item.purpose!=="training")){
      const curve=backtest.equityCurve.filter(point=>
        point.timestamp>=split.range.from&&point.timestamp<split.range.to);
      const splitBars=validBars.filter(item=>
        item.timestamp>=split.range.from&&item.timestamp<split.range.to);
      if(curve.length<2||splitBars.length<2)return {
        ok:false,reason:"scientific_validation_window_evidence_incomplete"};
      const strategyReturn=curve[curve.length-1].equity/curve[0].equity-1;
      const benchmarkReturn=splitBars[splitBars.length-1].close/splitBars[0].open-1;
      let peak=curve[0].equity;let maximumDrawdown=0;
      for(const point of curve){peak=Math.max(peak,point.equity);
        maximumDrawdown=Math.max(maximumDrawdown,(peak-point.equity)/peak);}
      const costs=backtest.fills.filter(fill=>
        fill.timestamp>=split.range.from&&fill.timestamp<split.range.to)
        .reduce((sum,fill)=>sum+fill.costs,0);
      const stressedReturn=strategyReturn
        -(costs*(input.profile.costStressMultiplier-1)/curve[0].equity);
      windows.push({windowId:split.name,purpose:split.purpose==="final_holdout"
        ?"holdout":split.purpose as ValidationWindow["purpose"],
        observations:curve.length,strategyReturn,benchmarkReturn,maximumDrawdown,
        stressedReturn});
      const barsByTime=new Map(splitBars.map(item=>[item.timestamp,item]));
      for(let index=1;index<curve.length;index+=1){
        const currentBar=barsByTime.get(curve[index].timestamp);
        const priorBar=barsByTime.get(curve[index-1].timestamp);
        if(!currentBar||!priorBar)return {
          ok:false,reason:"scientific_validation_window_evidence_incomplete"};
        const strategy=Math.log(curve[index].equity/curve[index-1].equity);
        const benchmark=Math.log(currentBar.close/priorBar.close);
        excessReturns.push(strategy-benchmark);
      }
    }
    if(windows.length===0||excessReturns.length<2)return {
      ok:false,reason:"scientific_validation_window_evidence_incomplete"};
    const mean=excessReturns.reduce((sum,value)=>sum+value,0)/excessReturns.length;
    const variance=excessReturns.reduce((sum,value)=>sum+(value-mean)**2,0)
      /(excessReturns.length-1);
    const standardError=Math.sqrt(variance/excessReturns.length);
    const pValue=standardError===0?(mean>0?0:1):1-normalCdf(mean/standardError);
    return {ok:true,value:{windows,hypothesisPValue:Math.max(0,Math.min(1,pValue)),
      robustnessPasses:windows.filter(item=>item.stressedReturn>item.benchmarkReturn).length,
      robustnessTrials:windows.length}};
  }
}
