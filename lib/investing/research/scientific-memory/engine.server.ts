import "server-only";
import {hashCanonicalResearchMaterial} from "../reproducibility/hashing.server";
import {ARTIFACT_IDENTITY_DOMAIN} from "../reproducibility/versions";
import {validateScientificMemoryInput} from "./runtimeValidation";
import {scientificMemoryFamilyId} from "./family";
import {SCIENTIFIC_MEMORY_EVENT_VERSION,type ScientificMemoryEvent,
  type ScientificMemoryResult} from "./types";
export function recordScientificMemory(value:unknown):ScientificMemoryResult<ScientificMemoryEvent>{
 const parsed=validateScientificMemoryInput(value);if("reason"in parsed)return parsed;
 const {decision,profile,prior}=parsed.value;
 const knowledge:ScientificMemoryEvent["knowledge"]=decision.outcome==="validated"
  ?"positive":decision.outcome==="rejected"?"negative":decision.outcome;
 const attempts=prior.length+1;const rejected=prior.filter(v=>v.outcome==="rejected").length+
  (decision.outcome==="rejected"?1:0);const inconclusive=prior.filter(v=>
    v.outcome==="inconclusive").length+(decision.outcome==="inconclusive"?1:0);
 const familyState:ScientificMemoryEvent["familyState"]=attempts>=profile.maximumAttemptsPerFamily
  ||rejected>=profile.maximumRejectedPerFamily
  ||inconclusive>=profile.maximumInconclusivePerFamily?"saturated":"active";
 const material={eventType:"scientific_result_recorded"as const,
  aggregateType:"hypothesis_family"as const,
  aggregateId:scientificMemoryFamilyId(decision.hypothesisId,decision.hypothesisVersion),
  scope:decision.scope,scientificScope:decision.scientificScope,
  decisionId:decision.decisionId,reportId:decision.validationReport.reportId,
  hypothesisId:decision.hypothesisId,hypothesisVersion:decision.hypothesisVersion,
  candidateId:decision.candidateId,candidateVersion:decision.candidateVersion,
  experimentId:decision.experimentId,runId:decision.runId,outcome:decision.outcome,
  knowledge,attemptOrdinal:attempts,familyState,repetitionPolicy:"avoid_exact_repeat"as const,
  priorDecisionIds:prior.map(v=>v.decisionId).sort(),evidenceIds:[...decision.evidenceIds],
  reasonCodes:[...decision.reasonCodes],profile:{id:profile.profileId,
    version:profile.profileVersion},recordedAt:parsed.value.recordedAt,
  recordedBy:parsed.value.recordedBy};
 const hash=hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
 if(!hash.ok)return{ok:false,reason:"scientific_memory_hash_failed"};
 return{ok:true,value:{contractVersion:SCIENTIFIC_MEMORY_EVENT_VERSION,
  eventId:`irmem_v1_${hash.value.digest}`,eventHash:hash.value.digest,...material}};
}
