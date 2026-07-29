import "server-only";

import {
  SCIENTIFIC_DECISION_VERSION,
  VALIDATION_REPORT_VERSION,
  toInvestingResearchScientificScope,
  validateScientificDecision,
  validateValidationReport,
  type InvestingResearchReasonCode,
  type ScientificDecisionOutcome,
  type ValidationGateResult,
} from "../contracts";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {validateScientificValidationInput} from "./runtimeValidation";
import type {ScientificValidationOutput,ScientificValidationResult} from "./types";

const gate=(gateId:string,outcome:ValidationGateResult["outcome"],
  evidenceId:string,reasonCodes:readonly InvestingResearchReasonCode[]=[]):
ValidationGateResult=>({gateId,gateVersion:"v1",outcome,reasonCodes,evidenceIds:[evidenceId]});

export function runScientificValidation(value:unknown):
ScientificValidationResult<ScientificValidationOutput>{
  const parsed=validateScientificValidationInput(value);
  if("reason" in parsed)return {ok:false,reason:parsed.reason};
  const input=parsed.value;
  const evidenceHash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,{
    experimentId:input.experiment.experimentId,runId:input.result.runId,
    profile:input.profile,windows:input.windows,
    hypothesisPValue:input.hypothesisPValue,
    robustnessPasses:input.robustnessPasses,robustnessTrials:input.robustnessTrials,
  });
  if(!evidenceHash.ok)return {ok:false,reason:"scientific_validation_hash_failed"};
  const evidenceId=`irevd_v1_${evidenceHash.value.digest}`;
  const hasTraining=input.experiment.splits.some(split=>split.purpose==="training");
  const hasHoldout=input.experiment.splits.some(split=>
    split.purpose==="holdout"||split.purpose==="final_holdout");
  const separationPassed=(!input.profile.requireTrainingSplit||hasTraining)
    &&(!input.profile.requireHoldoutSplit||hasHoldout);
  const enoughWindows=input.windows.length>=input.profile.minimumOutOfSampleWindows
    &&input.windows.every(window=>
      window.observations>=input.profile.minimumObservationsPerWindow);
  const positiveRatio=input.windows.filter(window=>
    window.strategyReturn>window.benchmarkReturn).length/input.windows.length;
  const adjustedP=Math.min(1,input.hypothesisPValue
    *input.profile.significance.familySize);
  const robustRatio=input.robustnessPasses/input.robustnessTrials;
  const peakReturn=Math.max(...input.windows.map(window=>window.strategyReturn));
  const finalReturn=input.windows[input.windows.length-1].strategyReturn;
  const degradation=Math.max(0,peakReturn-finalReturn);
  const gates:ValidationGateResult[]=[
    gate("train_validation_test_separation",separationPassed?"passed":"invalid",
      evidenceId,separationPassed?[]:["research.validation.blocked"]),
    gate("out_of_sample_coverage",enoughWindows?"passed":"inconclusive",evidenceId,
      enoughWindows?[]:["research.validation.inconclusive"]),
    gate("multiple_testing_corrected_significance",
      adjustedP<=input.profile.significance.alpha?"passed":"failed",evidenceId,
      adjustedP<=input.profile.significance.alpha?[]:["research.validation.rejected"]),
    gate("walk_forward_consistency",
      positiveRatio>=input.profile.minimumPositiveWindowRatio?"passed":"failed",evidenceId,
      positiveRatio>=input.profile.minimumPositiveWindowRatio
        ?[]:["research.validation.rejected"]),
    gate("drawdown_limit",
      input.windows.every(window=>window.maximumDrawdown<=input.profile.maximumDrawdown)
        ?"passed":"failed",evidenceId,
      input.windows.every(window=>window.maximumDrawdown<=input.profile.maximumDrawdown)
        ?[]:["research.validation.rejected"]),
    gate("cost_stress_robustness",
      input.windows.every(window=>window.stressedReturn>=window.benchmarkReturn)
        ?"passed":"failed",evidenceId,
      input.windows.every(window=>window.stressedReturn>=window.benchmarkReturn)
        ?[]:["research.validation.rejected"]),
    gate("robustness_ratio",robustRatio>=input.profile.minimumRobustnessPassRatio
      ?"passed":"failed",evidenceId,robustRatio>=input.profile.minimumRobustnessPassRatio
      ?[]:["research.validation.rejected"]),
    gate("degradation_limit",degradation<=input.profile.maximumDegradation
      ?"passed":"failed",evidenceId,degradation<=input.profile.maximumDegradation
      ?[]:["research.validation.rejected"]),
  ];
  const blockers=[...new Set(gates.flatMap(item=>
    item.outcome==="invalid"||item.outcome==="blocked"?item.reasonCodes:[]))];
  const warnings=[...new Set(gates.flatMap(item=>
    item.outcome==="inconclusive"?item.reasonCodes:[]))];
  const reportMaterial={
    candidateId:input.result.candidateId,candidateVersion:input.result.candidateVersion,
    hypothesisId:input.result.hypothesisId,hypothesisVersion:input.result.hypothesisVersion,
    experimentId:input.result.experimentId,runId:input.result.runId,
    scope:input.result.scope,dataset:input.result.dataset,
    validationProfile:input.result.validationProfile,benchmark:input.result.benchmark,
    result:input.result,gates,evidence:[{
      evidenceId,kind:"statistical_validation",
      description:"Closed Phase 6J out-of-sample, robustness and degradation evidence.",
      artifactRefs:input.result.artifacts,reasonCodes:[] as InvestingResearchReasonCode[],
    }],warnings,blockers,evaluatedAt:input.evaluatedAt,evaluatedBy:input.evaluatedBy,
  };
  const reportIdentity=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,reportMaterial);
  if(!reportIdentity.ok)return {ok:false,reason:"scientific_validation_hash_failed"};
  const report={
    contractVersion:VALIDATION_REPORT_VERSION,
    reportId:`irval_v1_${reportIdentity.value.digest}`,...reportMaterial,
  };
  const validReport=validateValidationReport(report);
  if(!validReport.ok)return {ok:false,reason:"scientific_validation_report_invalid"};
  const outcome:ScientificDecisionOutcome=gates.some(item=>item.outcome==="invalid")
    ?"invalid":gates.some(item=>item.outcome==="blocked")
      ?"blocked":gates.some(item=>item.outcome==="failed")
        ?"rejected":gates.some(item=>item.outcome==="inconclusive")
          ?"inconclusive":"validated";
  const reasonCodes=[...new Set(gates.flatMap(item=>item.reasonCodes))];
  const decisionMaterial={
    outcome,candidateId:input.result.candidateId,candidateVersion:input.result.candidateVersion,
    hypothesisId:input.result.hypothesisId,hypothesisVersion:input.result.hypothesisVersion,
    experimentId:input.result.experimentId,runId:input.result.runId,
    datasetVersionId:input.result.dataset.datasetVersionId,
    datasetManifestHash:input.result.dataset.manifestHash,
    datasetContentHash:input.result.dataset.aggregateContentHash,
    scope:input.result.scope,scientificScope:toInvestingResearchScientificScope(input.result.scope),
    validationReport:validReport.value,validationProfile:input.result.validationProfile,
    reasonCodes,evidenceIds:[evidenceId],warnings,blockers,
    decidedAt:input.evaluatedAt,decidedBy:input.evaluatedBy,
  };
  const decisionIdentity=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,decisionMaterial);
  if(!decisionIdentity.ok)return {ok:false,reason:"scientific_validation_hash_failed"};
  const decision={contractVersion:SCIENTIFIC_DECISION_VERSION,
    decisionId:`irdec_v1_${decisionIdentity.value.digest}`,...decisionMaterial};
  const validDecision=validateScientificDecision(decision);
  if(!validDecision.ok)return {ok:false,reason:"scientific_validation_decision_invalid"};
  return {ok:true,value:{report:validReport.value,reportHash:reportIdentity.value.digest,
    decision:validDecision.value,decisionHash:decisionIdentity.value.digest}};
}
