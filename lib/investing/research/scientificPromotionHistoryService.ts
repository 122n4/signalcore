import "server-only";

import {
  resolveAuthorizedResearchPassportReadContext,
  isAuthorizedResearchPassportReadContext,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";

// The accepted RL-8 SQL reconstruction helper is SECURITY DEFINER with
// owner/tenant/Investigation checks. Its legacy operation setting has a MUTATE
// token although this service is STRICTLY READ-ONLY. This does not grant any
// mutation/decision authorization. No caller can supply a DB, context,
// scientific payload, outcome, or transition.
const reconstructionOperation = "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hex = /^[0-9A-F]{64}$/u;
const states = new Set([
  "DRAFT_RESEARCH","EXECUTED","INSUFFICIENT_EVIDENCE","VALIDATION_FAILED",
  "VALIDATION_PASSED","PROMOTION_ELIGIBLE","REJECTED","SUPERSEDED",
]);

export async function readScientificPromotionChainForCurrentUserV1(input: Readonly<{
  researchInvestigationId: string;
  rootTransitionIdentityId: string;
  correlationId: string;
}>) {
  const result=await resolveAuthorizedResearchPassportReadContext({
    researchInvestigationId:input.researchInvestigationId,
    correlationId:input.correlationId,
  });
  if (!result.ok) return result;
  const authority=result.context;
  if (!isAuthorizedResearchPassportReadContext(authority) ||
      authority.operationScope!=="TENANT_SCOPE" ||
      authority.sourceContext!=="PURE_RESEARCH" ||
      authority.researchInvestigationId!==input.researchInvestigationId ||
      !uuid.test(input.rootTransitionIdentityId)) {
    return {ok:false as const,code:"FORBIDDEN_OR_NOT_FOUND" as const};
  }
  let client:Awaited<ReturnType<ReturnType<typeof getInvestingAuthorityDatabase>["connect"]>>|null=null;
  let destroy=false;
  try {
    const database=getInvestingAuthorityDatabase();
    client=await database.connect();
    await client.query("begin");
    // Transaction-local, server-derived identifiers only.
    const values={
      operation:reconstructionOperation,
      capability:"RESEARCH_MUTATE",
      tenant_id:authority.tenantId,
      principal_id:authority.principalId,
      tenant_membership_id:authority.tenantMembershipId,
      research_investigation_id:authority.researchInvestigationId,
    };
    for (const [key,value] of Object.entries(values)) {
      await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
    }
    const rows=await client.query<{value:unknown}>(
      "select investing.reconstruct_research_scientific_promotion_chain_v1($1::uuid) as value",
      [input.rootTransitionIdentityId],
    );
    if (rows.rows.length!==1) throw Error("PROMOTION_RECONSTRUCTION_INVALID");
    const data=rows.rows[0]?.value;
    if (!data||typeof data!=="object"||Array.isArray(data)) throw Error("PROMOTION_RECONSTRUCTION_INVALID");
    const rec=data as Record<string,unknown>;
    if (rec.status!=="OK" || rec.rootTransitionIdentityId!==input.rootTransitionIdentityId ||
        typeof rec.activeLeafTransitionIdentityId!=="string" ||
        !uuid.test(rec.activeLeafTransitionIdentityId) ||
        typeof rec.activeLeafTransitionHashHex!=="string" ||
        !hex.test(rec.activeLeafTransitionHashHex) ||
        !states.has(String(rec.activeLeafState)) ||
        rec.activeLeafState==="VALIDATION_PASSED" || rec.activeLeafState==="VALIDATION_FAILED" ||
        !Array.isArray(rec.traversal) || rec.traversal.length===0 ||
        rec.traversal.length>128 || !Array.isArray(rec.crossChainHops)) {
      throw Error("PROMOTION_RECONSTRUCTION_INVALID");
    }
    const leaf=rec.traversal.at(-1) as Record<string,unknown>|undefined;
    if (!leaf || leaf.transitionIdentityId!==rec.activeLeafTransitionIdentityId ||
        leaf.transitionHashHex!==rec.activeLeafTransitionHashHex ||
        leaf.resultingState!==rec.activeLeafState) throw Error("PROMOTION_RECONSTRUCTION_INVALID");
    await client.query("commit");
    return {
      ok:true as const,
      chain:Object.freeze({
        schemaVersion:"RL10_PROMOTION_CHAIN_READ_V1" as const,
        researchInvestigationId:input.researchInvestigationId,
        rootTransitionIdentityId:input.rootTransitionIdentityId,
        activeLeafTransitionIdentityId:rec.activeLeafTransitionIdentityId,
        activeLeafTransitionHashHex:rec.activeLeafTransitionHashHex,
        scientificState:rec.activeLeafState,
        historicalTransitionCount:rec.traversal.length,
        crossChainHops:rec.crossChainHops.length,
        executionAuthority:"NONE" as const,
        newPromotionEvaluation:"NOT_PERFORMED" as const,
      }),
    };
  } catch (e) {
    if (client) {
      try { await client.query("rollback"); }
      catch { destroy=true; }
    }
    return {ok:false as const,code:
      e instanceof Error && e.message.includes("AUTHORITY_FAILURE")
        ? "FORBIDDEN_OR_NOT_FOUND" as const : "INTERNAL_ERROR" as const};
  } finally {
    if (client) await client.release(destroy);
  }
}
