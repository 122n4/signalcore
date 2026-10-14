import "server-only";

import {
  isAuthorizedResearchPassportReadContext,
  resolveAuthorizedResearchPassportReadContext,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { readResearchPassportV1 } from "./researchPassportReader";
import { hashRefV1 } from "./canonical";
import {
  canonicalScientificPromotionProtocolV1,
  canonicalScientificPromotionTransitionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  type ScientificPromotionTransitionV1,
} from "./scientificPromotion";

// Root creation is NOT evaluation, gate passage, recommendation, Paper or Live.
// Caller identifiers only select an existing experiment and run input;
// ownership and the Result/Evidence binding come from the server read and
// owner-exact RL-8 SQL functions. No client-provided scientific proof, tenant,
// database, account, context or transition is accepted.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hex=/^[0-9A-F]{64}$/u;
const operationProtocol="RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1";
const operationRoot="RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1";

export async function createScientificPromotionRootForCurrentUserV1(input: Readonly<{
  researchInvestigationId:string;
  researchExperimentId:string;
  runInputIdentityId:string;
  correlationId:string;
}>) {
  const resolved=await resolveAuthorizedResearchPassportReadContext({
    researchInvestigationId:input.researchInvestigationId,
    correlationId:input.correlationId,
  });
  if (!resolved.ok) return resolved;
  const ctx=resolved.context;
  if (!isAuthorizedResearchPassportReadContext(ctx) ||
      ctx.operationScope!=="TENANT_SCOPE" || ctx.sourceContext!=="PURE_RESEARCH" ||
      ctx.researchInvestigationId!==input.researchInvestigationId ||
      !uuid.test(input.researchExperimentId) || !uuid.test(input.runInputIdentityId))
    return {ok:false as const,code:"FORBIDDEN_OR_NOT_FOUND" as const};

  let client:Awaited<ReturnType<ReturnType<typeof getInvestingAuthorityDatabase>["connect"]>>|null=null;
  let destroy=false;
  try {
    const db=getInvestingAuthorityDatabase();
    const read=await readResearchPassportV1({authorizedContext:ctx},db);
    if (!read.ok) return {ok:false as const,code:"INTERNAL_ERROR" as const};
    const passport=read.passport;
    if (passport.transportProof.currentUser!=="investing_app" ||
        passport.transportProof.currentRole!=="investing_app" ||
        passport.investigation.researchInvestigationId!==ctx.researchInvestigationId ||
        passport.investigation.tenantId!==ctx.tenantId ||
        passport.investigation.principalId!==ctx.principalId ||
        passport.investigation.tenantMembershipId!==ctx.tenantMembershipId ||
        passport.investigation.operationScope!=="TENANT_SCOPE" ||
        passport.investigation.sourceContext!=="PURE_RESEARCH")
      return {ok:false as const,code:"INTERNAL_ERROR" as const};

    const experiment=passport.experiments.filter(x=>x.researchExperimentId===input.researchExperimentId);
    const runs=passport.runInputs.filter(x=>x.runInputIdentityId===input.runInputIdentityId);
    if (experiment.length!==1 || runs.length!==1)
      return {ok:false as const,code:"FORBIDDEN_OR_NOT_FOUND" as const};
    const exp=experiment[0]!, run=runs[0]!;
    if (!exp.experiment || !exp.experimentParameters ||
        run.researchExperimentId!==exp.researchExperimentId ||
        run.experimentHashHex!==exp.experiment.hashHex ||
        run.researchIrHashHex!==exp.researchIr.hashHex)
      return {ok:false as const,code:"CONFLICT" as const};
    const terminal=passport.executionRuns.filter(x=>
      x.runInputIdentityId===run.runInputIdentityId && x.terminalState==="SUCCEEDED");
    const distinctResults=new Set(terminal.map(x=>x.resultIdentityId));
    if(distinctResults.size!==1 || terminal.length===0 || distinctResults.has(null))
      return {ok:false as const,code:"CONFLICT" as const};
    const result=passport.results.filter(x=>
      x.resultIdentityId===[...distinctResults][0] && x.runInputIdentityId===run.runInputIdentityId);
    if(result.length!==1 ||
      passport.evidence.filter(x=>x.resultIdentityId===result[0]!.resultIdentityId &&
        x.runInputIdentityId===run.runInputIdentityId).length!==1)
      return {ok:false as const,code:"CONFLICT" as const};
    const subject={
      subjectExperiment:hashRefV1(exp.experiment),
      subjectExperimentParameters:hashRefV1(exp.experimentParameters),
      subjectResearchIr:hashRefV1(exp.researchIr),
    };
    const payload:ScientificPromotionTransitionV1={
      schemaVersion:"SCIENTIFIC_PROMOTION_TRANSITION_V1",
      protocol:hashScientificPromotionProtocolV1(),subject,
      predecessorTransition:null,predecessorState:"DRAFT_RESEARCH",
      resultingState:"EXECUTED",
      evidenceSnapshot:{
        runInput:hashRefV1(run.runInput),result:hashRefV1(result[0]!.result),
        evidenceObject:null,validationProtocol:null,validationResult:null,
        validationAssessmentProtocol:null,validationAssessmentResult:null,
        robustnessComparisonProtocol:null,robustnessComparisonResult:null,
      },
      gateOutcomes:[],transitionReasons:[],supersedes:null,
      rejectedTransition:null,supersededByChain:null,
    };
    const canonical=canonicalScientificPromotionTransitionV1(payload);
    const rootRef=hashScientificPromotionTransitionV1(payload);
    const protocolRef=hashScientificPromotionProtocolV1();
    client=await db.connect();
    await client.query("begin");
    const set=async(key:string,value:string)=>{
      if(!client)throw Error("TRANSACTION_MISSING");
      await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
    };
    const proof={
      actor_kind:"USER_PRINCIPAL",actor_id:ctx.actorId,
      external_provider:"CLERK",external_subject:ctx.actorId,
      principal_id:ctx.principalId,tenant_id:ctx.tenantId,
      tenant_membership_id:ctx.tenantMembershipId,
      operation_scope:"TENANT_SCOPE",source_context:"PURE_RESEARCH",
      research_investigation_id:ctx.researchInvestigationId,
      correlation_id:input.correlationId,capability:"RESEARCH_MUTATE",
    };
    for(const [key,value] of Object.entries(proof)) await set(key,value);
    await set("operation",operationProtocol);
    const prot=await client.query<{result:unknown}>(
      "select investing.persist_research_scientific_promotion_protocol_v1($1,$2::jsonb) as result",
      [protocolRef.hashHex,JSON.stringify(canonicalScientificPromotionProtocolV1())],
    );
    const protocolResult=prot.rows[0]?.result as Record<string,unknown>|undefined;
    if(prot.rows.length!==1 || !protocolResult ||
       !["CREATED","REUSED_IDENTICAL"].includes(String(protocolResult.status)) ||
       typeof protocolResult.researchScientificPromotionProtocolIdentityId!=="string" ||
       !uuid.test(protocolResult.researchScientificPromotionProtocolIdentityId) ||
       protocolResult.hashHex!==protocolRef.hashHex)throw Error("PROMOTION_PROTOCOL_PERSISTENCE_INVALID");
    await set("operation",operationRoot);
    const resultRoot=await client.query<{result:unknown}>(
      "select investing.persist_research_scientific_promotion_root_v1($1,$2::jsonb) as result",
      [rootRef.hashHex,JSON.stringify(canonical)],
    );
    const rr=resultRoot.rows[0]?.result as Record<string,unknown>|undefined;
    if(resultRoot.rows.length!==1 || !rr ||
       !["CREATED","REUSED_IDENTICAL"].includes(String(rr.status)) ||
       typeof rr.researchScientificPromotionTransitionIdentityId!=="string" ||
       !uuid.test(rr.researchScientificPromotionTransitionIdentityId) ||
       typeof rr.transitionHashHex!=="string" || !hex.test(rr.transitionHashHex) ||
       rr.transitionHashHex!==rootRef.hashHex) {
      if(rr?.status==="DIVERGENT_EXISTING_IDENTITY") {
        await client.query("rollback");
        return {ok:false as const,code:"CONFLICT" as const};
      }
      throw Error("PROMOTION_ROOT_PERSISTENCE_INVALID");
    }
    await client.query("commit");
    return {ok:true as const,status:rr.status as "CREATED"|"REUSED_IDENTICAL",
      rootTransitionIdentityId:rr.researchScientificPromotionTransitionIdentityId,
      rootTransitionHashHex:rootRef.hashHex,scientificState:"EXECUTED" as const,
      promotionEligibility:"NOT_EVALUATED" as const,executionAuthority:"NONE" as const};
  } catch {
    if(client){try{await client.query("rollback");}catch{destroy=true;}}
    return {ok:false as const,code:"INTERNAL_ERROR" as const};
  } finally {if(client)await client.release(destroy);}
}
