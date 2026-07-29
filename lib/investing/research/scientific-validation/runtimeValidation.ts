import {
  validateExperimentDefinition,
  validateExperimentResultEnvelope,
} from "../contracts";
import {
  SCIENTIFIC_VALIDATION_INPUT_VERSION,
  SCIENTIFIC_VALIDATION_PROFILE_VERSION,
  type ScientificValidationInput,
  type ScientificValidationResult,
  type ValidationWindow,
} from "./types";

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
const finite=(value:unknown):value is number=>
  typeof value==="number"&&Number.isFinite(value);
const id=(value:unknown)=>typeof value==="string"
  &&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(value);
const timestamp=(value:unknown):value is string=>typeof value==="string"
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

function window(value:unknown):ValidationWindow|null{
  if(!plain(value)||!exact(value,["windowId","purpose","observations","strategyReturn",
    "benchmarkReturn","maximumDrawdown","stressedReturn"])
    ||!id(value.windowId)
    ||!["validation","holdout","walk_forward"].includes(String(value.purpose))
    ||!finite(value.observations)||!Number.isInteger(value.observations)||value.observations<1
    ||!finite(value.strategyReturn)||!finite(value.benchmarkReturn)
    ||!finite(value.maximumDrawdown)||value.maximumDrawdown<0||value.maximumDrawdown>1
    ||!finite(value.stressedReturn))return null;
  return {windowId:value.windowId as string,purpose:value.purpose as ValidationWindow["purpose"],
    observations:value.observations,strategyReturn:value.strategyReturn,
    benchmarkReturn:value.benchmarkReturn,maximumDrawdown:value.maximumDrawdown,
    stressedReturn:value.stressedReturn};
}

export function validateScientificValidationInput(value:unknown):
ScientificValidationResult<ScientificValidationInput>{
  try{
    if(!plain(value)||!exact(value,["contractVersion","experiment","result","profile",
      "windows","hypothesisPValue","robustnessPasses","robustnessTrials",
      "evaluatedAt","evaluatedBy"])
      ||value.contractVersion!==SCIENTIFIC_VALIDATION_INPUT_VERSION
      ||!plain(value.profile)||!exact(value.profile,["contractVersion","profileId",
        "profileVersion","minimumObservationsPerWindow","minimumOutOfSampleWindows",
        "minimumPositiveWindowRatio","maximumDrawdown","maximumDegradation",
        "minimumRobustnessPassRatio","costStressMultiplier","benchmarkPolicy",
        "significance","requireTrainingSplit",
        "requireHoldoutSplit"])
      ||value.profile.contractVersion!==SCIENTIFIC_VALIDATION_PROFILE_VERSION
      ||!id(value.profile.profileId)||!id(value.profile.profileVersion)
      ||!finite(value.profile.minimumObservationsPerWindow)
      ||!Number.isInteger(value.profile.minimumObservationsPerWindow)
      ||value.profile.minimumObservationsPerWindow<2
      ||!finite(value.profile.minimumOutOfSampleWindows)
      ||!Number.isInteger(value.profile.minimumOutOfSampleWindows)
      ||value.profile.minimumOutOfSampleWindows<1
      ||!finite(value.profile.minimumPositiveWindowRatio)
      ||value.profile.minimumPositiveWindowRatio<0||value.profile.minimumPositiveWindowRatio>1
      ||!finite(value.profile.maximumDrawdown)
      ||value.profile.maximumDrawdown<0||value.profile.maximumDrawdown>1
      ||!finite(value.profile.maximumDegradation)
      ||value.profile.maximumDegradation<0||value.profile.maximumDegradation>1
      ||!finite(value.profile.minimumRobustnessPassRatio)
      ||value.profile.minimumRobustnessPassRatio<0
      ||value.profile.minimumRobustnessPassRatio>1
      ||!finite(value.profile.costStressMultiplier)||value.profile.costStressMultiplier<1
      ||value.profile.costStressMultiplier>100
      ||value.profile.benchmarkPolicy!=="buy_and_hold_same_instrument"
      ||typeof value.profile.requireTrainingSplit!=="boolean"
      ||typeof value.profile.requireHoldoutSplit!=="boolean"
      ||!plain(value.profile.significance)
      ||!exact(value.profile.significance,["method","baseTest","alpha","familySize"])
      ||value.profile.significance.method!=="bonferroni"
      ||value.profile.significance.baseTest!=="one_sided_normal_approximation"
      ||!finite(value.profile.significance.alpha)||value.profile.significance.alpha<=0
      ||value.profile.significance.alpha>=1
      ||!finite(value.profile.significance.familySize)
      ||!Number.isInteger(value.profile.significance.familySize)
      ||value.profile.significance.familySize<1
      ||!Array.isArray(value.windows)||value.windows.length===0
      ||!finite(value.hypothesisPValue)||value.hypothesisPValue<0
      ||value.hypothesisPValue>1
      ||!finite(value.robustnessPasses)||!Number.isInteger(value.robustnessPasses)
      ||value.robustnessPasses<0
      ||!finite(value.robustnessTrials)||!Number.isInteger(value.robustnessTrials)
      ||value.robustnessTrials<1||value.robustnessPasses>value.robustnessTrials
      ||!timestamp(value.evaluatedAt)||!plain(value.evaluatedBy)
      ||!exact(value.evaluatedBy,["id","version"])
      ||!id(value.evaluatedBy.id)||!id(value.evaluatedBy.version)){
      return {ok:false,reason:"scientific_validation_input_invalid"};
    }
    const experiment=validateExperimentDefinition(value.experiment);
    const result=validateExperimentResultEnvelope(value.result);
    if(!experiment.ok||!result.ok)return {ok:false,reason:"scientific_validation_input_invalid"};
    const windows=value.windows.map(window);
    if(windows.some(item=>item===null)
      ||new Set(windows.map(item=>item?.windowId)).size!==windows.length){
      return {ok:false,reason:"scientific_validation_windows_invalid"};
    }
    if(experiment.value.experimentId!==result.value.experimentId
      ||result.value.completionStatus!=="completed"
      ||experiment.value.dataset.datasetVersionId!==result.value.dataset.datasetVersionId
      ||value.profile.profileId!==experiment.value.validationProfile.id
      ||value.profile.profileVersion!==experiment.value.validationProfile.version){
      return {ok:false,reason:"scientific_validation_reference_mismatch"};
    }
    return {ok:true,value:{
      contractVersion:SCIENTIFIC_VALIDATION_INPUT_VERSION,
      experiment:experiment.value,result:result.value,
      profile:{
        contractVersion:SCIENTIFIC_VALIDATION_PROFILE_VERSION,
        profileId:value.profile.profileId as string,
        profileVersion:value.profile.profileVersion as string,
        minimumObservationsPerWindow:value.profile.minimumObservationsPerWindow,
        minimumOutOfSampleWindows:value.profile.minimumOutOfSampleWindows,
        minimumPositiveWindowRatio:value.profile.minimumPositiveWindowRatio,
        maximumDrawdown:value.profile.maximumDrawdown,
        maximumDegradation:value.profile.maximumDegradation,
        minimumRobustnessPassRatio:value.profile.minimumRobustnessPassRatio,
        costStressMultiplier:value.profile.costStressMultiplier,
        benchmarkPolicy:"buy_and_hold_same_instrument",
        significance:{
          method:"bonferroni",baseTest:"one_sided_normal_approximation",
          alpha:value.profile.significance.alpha,
          familySize:value.profile.significance.familySize,
        },
        requireTrainingSplit:value.profile.requireTrainingSplit,
        requireHoldoutSplit:value.profile.requireHoldoutSplit,
      },
      windows:windows as ValidationWindow[],hypothesisPValue:value.hypothesisPValue,
      robustnessPasses:value.robustnessPasses,robustnessTrials:value.robustnessTrials,
      evaluatedAt:value.evaluatedAt,evaluatedBy:{
        id:value.evaluatedBy.id as string,version:value.evaluatedBy.version as string,
      },
    }};
  }catch{return {ok:false,reason:"scientific_validation_input_invalid"};}
}
