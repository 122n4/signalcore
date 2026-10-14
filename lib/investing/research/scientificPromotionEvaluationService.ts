import "server-only";

import {
  isAuthorizedResearchPassportReadContext,
  resolveAuthorizedResearchPassportReadContext,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { readResearchPassportV1 } from "./researchPassportReader";
import { hashRefV1, type HashRefV1 } from "./canonical";
import { hashScientificPromotionTransitionV1, type ScientificPromotionTransitionV1 } from "./scientificPromotion";
import { evaluateScientificPromotionV1, type ScientificPromotionResolvedEvidenceV1 } from "./scientificPromotionEngine";
import type { ResearchExecutionEvidenceObjectV1 } from "./evidenceObject";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hex=/^[0-9A-F]{64}$/u;
const operation="RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1";
const ref=(domain:HashRefV1["hashDomain"],hashHex:string):HashRefV1=>
  hashRefV1({hashAlgorithm:"SHA-256",hashDomain:domain,hashVersion:"SYNTRAKE_SHA256_V1",hashHex});
type DbRow={hash_hex:string;canonical_payload:unknown};
function exactlyOne<T>(rows:readonly T[]):T{
  if(rows.length!==1||!rows[0])throw Error("PROMOTION_SOURCE_NOT_UNIQUE_OR_MISSING");
  return rows[0];
}
function refOf(value:unknown,domain:HashRefV1["hashDomain"]):HashRefV1{
  const r=hashRefV1(value as HashRefV1);
  if(r.hashDomain!==domain||!hex.test(r.hashHex))throw Error("PROMOTION_SOURCE_REF_INVALID");
  return r;
}
function singleEvidenceRow(row:{
  hash_hex:string;content:Buffer;content_sha256:string;content_byte_length:string;
  descriptor_schema_version:string;descriptor_kind:string;
  descriptor_artifact_schema_version:string;descriptor_format:string;
}, expected:string):{ref:HashRefV1;object:ResearchExecutionEvidenceObjectV1}{
  if(!row||row.hash_hex!==expected||!Buffer.isBuffer(row.content)||
     String(row.content.length)!==String(row.content_byte_length))throw Error("PROMOTION_EVIDENCE_INVALID");
  const bytes=Buffer.from(row.content);
  // The deterministic RL-8 engine independently verifies content, hash,
  // canonical JSON encoding, descriptor, and exact Result/RunInput lineage.
  const content=JSON.parse(bytes.toString("utf8")) as ResearchExecutionEvidenceObjectV1["content"];
  const descriptor={
    schemaVersion:row.descriptor_schema_version,
    kind:row.descriptor_kind,
    artifactSchemaVersion:row.descriptor_artifact_schema_version,
    format:row.descriptor_format,
    contentByteLength:String(row.content_byte_length),
  } as ResearchExecutionEvidenceObjectV1["descriptor"];
  const evidenceHash=ref("SYNTRAKE:EVIDENCE_OBJECT:V1",row.hash_hex);
  return {ref:evidenceHash,object:{
    descriptor,content,contentBytes:bytes,contentSha256:row.content_sha256 as ResearchExecutionEvidenceObjectV1["contentSha256"],evidenceHash,
  }};
}

/**
 * Owner-resolved scientific evaluation from persisted evidence only.
 * Read-only: no stage A or closure SQL writer is called, no eligibility claim
 * is promoted to financial recommendation, Paper, or Live authority.
 * Missing/ambiguous evidence returns BLOCKED instead of fabricated gates.
 */
export async function evaluateScientificPromotionForCurrentUserV1(input:Readonly<{
  researchInvestigationId:string;
  rootTransitionIdentityId:string;
  researchValidationProtocolIdentityId:string;
  correlationId:string;
}>) {
  if(!uuid.test(input.researchInvestigationId)||!uuid.test(input.rootTransitionIdentityId)||
     !uuid.test(input.researchValidationProtocolIdentityId))
    return {ok:false as const,code:"VALIDATION_ERROR" as const};
  const resolved=await resolveAuthorizedResearchPassportReadContext({
    researchInvestigationId:input.researchInvestigationId,correlationId:input.correlationId,
  });
  if(!resolved.ok)return resolved;
  const ctx=resolved.context;
  if(!isAuthorizedResearchPassportReadContext(ctx)||
     ctx.operationScope!=="TENANT_SCOPE"||ctx.sourceContext!=="PURE_RESEARCH"||
     ctx.researchInvestigationId!==input.researchInvestigationId)
    return {ok:false as const,code:"FORBIDDEN_OR_NOT_FOUND" as const};

  let client:Awaited<ReturnType<ReturnType<typeof getInvestingAuthorityDatabase>["connect"]>>|null=null;
  let destroy=false;
  try {
    const db=getInvestingAuthorityDatabase();
    const read=await readResearchPassportV1({authorizedContext:ctx},db);
    if(!read.ok)return {ok:false as const,code:"INTERNAL_ERROR" as const};
    const passport=read.passport;
    if(passport.transportProof.currentUser!=="investing_app"||
       passport.transportProof.currentRole!=="investing_app"||
       passport.investigation.researchInvestigationId!==ctx.researchInvestigationId||
       passport.investigation.tenantId!==ctx.tenantId||
       passport.investigation.principalId!==ctx.principalId||
       passport.investigation.tenantMembershipId!==ctx.tenantMembershipId||
       passport.investigation.sourceContext!=="PURE_RESEARCH"||
       passport.investigation.operationScope!=="TENANT_SCOPE")
      throw Error("PROMOTION_PASSPORT_AUTHORITY_INVALID");
    if(passport.validation.availability!=="AVAILABLE_RL3")
      return {ok:false as const,code:"CAPABILITY_UNAVAILABLE" as const};

    client=await db.connect();
    await client.query("begin");
    const settings={
      actor_kind:"USER_PRINCIPAL",actor_id:ctx.actorId,
      external_provider:"CLERK",external_subject:ctx.actorId,
      operation,capability:"RESEARCH_MUTATE",operation_scope:"TENANT_SCOPE",
      source_context:"PURE_RESEARCH",tenant_id:ctx.tenantId,
      principal_id:ctx.principalId,tenant_membership_id:ctx.tenantMembershipId,
      research_investigation_id:ctx.researchInvestigationId,correlation_id:input.correlationId,
    };
    for(const [key,value] of Object.entries(settings))
      await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
    const transport=exactlyOne((await client.query<{current_user:string;current_role:string}>(
      "select current_user,current_role")).rows);
    if(transport.current_user!=="investing_app"||transport.current_role!=="investing_app")
      throw Error("PROMOTION_TRANSPORT_INVALID");
    const membership=await client.query<{tenant_membership_id:string}>(
      "select m.tenant_membership_id from investing.tenant_memberships m join investing.principals p on p.principal_id=m.principal_id join investing.tenants t on t.tenant_id=m.tenant_id where m.tenant_membership_id=$1 and m.tenant_id=$2 and m.principal_id=$3 and m.role='OWNER' and m.state='ACTIVE' and p.state='ACTIVE' and t.state='ACTIVE'",
      [ctx.tenantMembershipId,ctx.tenantId,ctx.principalId]);
    if(membership.rows.length!==1)throw Error("PROMOTION_AUTHORITY_REVOKED");

    const chain=exactlyOne((await client.query<{result:unknown}>(
      "select investing.reconstruct_research_scientific_promotion_chain_v1($1::uuid) as result",
      [input.rootTransitionIdentityId])).rows).result as Record<string,unknown>;
    if(!chain||chain.status!=="OK"||chain.rootTransitionIdentityId!==input.rootTransitionIdentityId||
       typeof chain.activeLeafTransitionIdentityId!=="string"||
       !uuid.test(chain.activeLeafTransitionIdentityId)||!hex.test(String(chain.activeLeafTransitionHashHex)))
      throw Error("PROMOTION_CHAIN_INVALID");
    const prev=exactlyOne((await client.query<{hash_hex:string;canonical_payload:unknown}>(
      "select transition_hash_hex as hash_hex,canonical_payload from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id=$1 and research_investigation_id=$2 and tenant_id=$3 and principal_id=$4 and tenant_membership_id=$5",
      [chain.activeLeafTransitionIdentityId,ctx.researchInvestigationId,ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);
    const predecessor=prev.canonical_payload as ScientificPromotionTransitionV1;
    if(prev.hash_hex!==chain.activeLeafTransitionHashHex||
       hashScientificPromotionTransitionV1(predecessor).hashHex!==prev.hash_hex)
      throw Error("PROMOTION_PREDECESSOR_TAMPERED");
    const runRef=refOf(predecessor.evidenceSnapshot.runInput,"SYNTRAKE:RUN_INPUT:V1");
    const resultRef=refOf(predecessor.evidenceSnapshot.result,"SYNTRAKE:RESULT:V1");
    const run=exactlyOne(passport.runInputs.filter(x=>x.runInput.hashHex===runRef.hashHex));
    const result=exactlyOne(passport.results.filter(x=>x.result.hashHex===resultRef.hashHex&&
      x.runInputIdentityId===run.runInputIdentityId));
    const exp=exactlyOne(passport.experiments.filter(x=>x.researchExperimentId===run.researchExperimentId));
    if(exp.experiment?.hashHex!==predecessor.subject.subjectExperiment.hashHex||
       exp.experimentParameters?.hashHex!==predecessor.subject.subjectExperimentParameters.hashHex||
       exp.researchIr.hashHex!==predecessor.subject.subjectResearchIr.hashHex||
       !passport.executionRuns.some(x=>x.terminalState==="SUCCEEDED"&&
         x.resultIdentityId===result.resultIdentityId&&x.runInputIdentityId===run.runInputIdentityId))
      throw Error("PROMOTION_SUBJECT_LINEAGE_INVALID");
    const evidence=exactlyOne(passport.evidence.filter(x=>
      x.resultIdentityId===result.resultIdentityId&&x.runInputIdentityId===run.runInputIdentityId));
    const evidenceRow=exactlyOne((await client.query<{
      hash_hex:string;content:Buffer;content_sha256:string;content_byte_length:string;
      descriptor_schema_version:string;descriptor_kind:string;descriptor_artifact_schema_version:string;descriptor_format:string;
    }>(
      "select hash_hex,content,content_sha256,content_byte_length::text,descriptor_schema_version,descriptor_kind,descriptor_artifact_schema_version,descriptor_format from investing.research_evidence_objects_scientific_identities where evidence_identity_id=$1 and result_identity_id=$2 and run_input_identity_id=$3 and tenant_id=$4 and principal_id=$5 and tenant_membership_id=$6",
      [evidence.evidenceIdentityId,result.resultIdentityId,run.runInputIdentityId,
       ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);
    if(evidenceRow.hash_hex!==evidence.evidence.hashHex)
      throw Error("PROMOTION_EVIDENCE_IDENTITY_MISMATCH");
    const validatedEvidence=singleEvidenceRow(evidenceRow,evidence.evidence.hashHex);

    const ep=exactlyOne(passport.validation.episodes.filter(x=>
      x.researchValidationProtocolIdentityId===input.researchValidationProtocolIdentityId &&
      x.researchExperimentId===exp.researchExperimentId));
    if(ep.state!=="AGGREGATE_AVAILABLE"||!ep.aggregate)
      return {ok:false as const,code:"CAPABILITY_UNAVAILABLE" as const};

    const validationProtocol=exactlyOne((await client.query<DbRow>(
      "select hash_hex,canonical_payload from investing.research_validation_protocols_scientific_identities where research_validation_protocol_identity_id=$1 and research_investigation_id=$2 and tenant_id=$3 and principal_id=$4 and tenant_membership_id=$5",
      [ep.researchValidationProtocolIdentityId,ctx.researchInvestigationId,ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);
    const validationResult=exactlyOne((await client.query<DbRow>(
      "select hash_hex,canonical_payload from investing.research_validation_results_scientific_identities where research_validation_result_identity_id=$1 and research_validation_protocol_identity_id=$2 and research_investigation_id=$3 and tenant_id=$4 and principal_id=$5 and tenant_membership_id=$6",
      [ep.aggregate.researchValidationResultIdentityId,ep.researchValidationProtocolIdentityId,
       ctx.researchInvestigationId,ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);
    if(validationProtocol.hash_hex!==ep.validationProtocol.hashHex||
       validationResult.hash_hex!==ep.aggregate.validationResult.hashHex)
      throw Error("PROMOTION_VALIDATION_IDENTITY_MISMATCH");
    const assessment=exactlyOne((await client.query<DbRow>(
      "select hash_hex,canonical_payload from investing.research_validation_assessment_protocols_scientific_identities where research_validation_protocol_identity_id=$1 and research_investigation_id=$2 and research_experiment_id=$3 and tenant_id=$4 and principal_id=$5 and tenant_membership_id=$6",
      [ep.researchValidationProtocolIdentityId,ctx.researchInvestigationId,exp.researchExperimentId,
       ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);
    const ar=exactlyOne((await client.query<DbRow>(
      "select ar.hash_hex,ar.canonical_payload from investing.research_validation_assessment_results_scientific_identities ar join investing.research_validation_assessment_protocols_scientific_identities ap on ap.research_validation_assessment_protocol_identity_id=ar.research_validation_assessment_protocol_identity_id where ap.research_validation_protocol_identity_id=$1 and ar.research_validation_result_identity_id=$2 and ar.research_investigation_id=$3 and ar.tenant_id=$4 and ar.principal_id=$5 and ar.tenant_membership_id=$6",
      [ep.researchValidationProtocolIdentityId,ep.aggregate.researchValidationResultIdentityId,
       ctx.researchInvestigationId,ctx.tenantId,ctx.principalId,ctx.tenantMembershipId])).rows);

    const sources:ScientificPromotionResolvedEvidenceV1={
      predecessor,authority:{status:"VERIFIED"},
      subject:predecessor.subject,
      runInput:{ref:runRef,payload:run.canonicalPayload as ScientificPromotionResolvedEvidenceV1["runInput"]["payload"]},
      result:{ref:resultRef,payload:result.canonicalPayload as ScientificPromotionResolvedEvidenceV1["result"]["payload"]},
      evidenceObject:validatedEvidence,
      validationProtocol:{ref:ref("SYNTRAKE:VALIDATION_PROTOCOL:V1",validationProtocol.hash_hex),
        payload:validationProtocol.canonical_payload as ScientificPromotionResolvedEvidenceV1["validationProtocol"]["payload"]},
      validationResult:{ref:ref("SYNTRAKE:VALIDATION_RESULT:V1",validationResult.hash_hex),
        payload:validationResult.canonical_payload as ScientificPromotionResolvedEvidenceV1["validationResult"]["payload"]},
      validationAssessmentProtocol:{ref:ref("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",assessment.hash_hex),
        payload:assessment.canonical_payload as NonNullable<ScientificPromotionResolvedEvidenceV1["validationAssessmentProtocol"]>["payload"]},
      validationAssessmentResult:{ref:ref("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",ar.hash_hex),
        payload:ar.canonical_payload as NonNullable<ScientificPromotionResolvedEvidenceV1["validationAssessmentResult"]>["payload"]},
      robustness:null,
    };
    const plan=evaluateScientificPromotionV1(sources);
    await client.query("commit");
    if(plan.kind==="FAIL_CLOSED")
      return {ok:true as const,evaluation:"FAIL_CLOSED" as const,reason:plan.reason,
        persisted:false as const,executionAuthority:"NONE" as const};
    return {ok:true as const,evaluation:"SCIENTIFIC_PLAN_ONLY" as const,
      proposedState:plan.closure?.transition.resultingState??plan.stageA.transition.resultingState,
      stageAHashHex:plan.stageA.transitionRef.hashHex,
      closureHashHex:plan.closure?.transitionRef.hashHex??null,
      persisted:false as const,executionAuthority:"NONE" as const};
  } catch {
    if(client){try{await client.query("rollback");}catch{destroy=true;}}
    return {ok:false as const,code:"INTERNAL_ERROR" as const};
  } finally {if(client)await client.release(destroy);}
}
