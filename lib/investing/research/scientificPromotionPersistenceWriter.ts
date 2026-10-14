import "server-only";

import type { InvestingAuthorityTransactionClient } from "../authority/context";
import {
  assertScientificPromotionPredecessorRelationV1,
  canonicalScientificPromotionTransitionV1,
  hashScientificPromotionTransitionV1,
  type ScientificPromotionTransitionV1,
} from "./scientificPromotion";
import type { ScientificPromotionEvaluationPlanV1 } from "./scientificPromotionEngine";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type PromotionPersistReceiptV1=Readonly<{
  status:"CREATED"|"REUSED_IDENTICAL";
  stageATransitionIdentityId:string;
  closureTransitionIdentityId:string|null;
  scientificState:"INSUFFICIENT_EVIDENCE"|"REJECTED"|"PROMOTION_ELIGIBLE";
  stageAHashHex:string;
  closureHashHex:string|null;
}>;

/**
 * Same-transaction RL-8C2 writer. All authority, material and canonical
 * transition proofs must be derived by the service, never a headless caller.
 * SQL revalidates tenant/Investigation membership, hashes, foreign evidence,
 * predecessor, serializes concurrent writes and rejects divergence.
 *
 * A successful SQL receipt alone is insufficient. Reconstruct the exact
 * committed-intent chain under RL-8C3 before the calling service commits.
 */
export async function persistScientificPromotionPlanV1(
  client:InvestingAuthorityTransactionClient,
  rootTransitionIdentityId:string,
  predecessor:ScientificPromotionTransitionV1,
  plan:ScientificPromotionEvaluationPlanV1,
):Promise<PromotionPersistReceiptV1>{
  if(!uuid.test(rootTransitionIdentityId)||plan.kind!=="AUTHORITATIVE_PLAN")
    throw Error("PROMOTION_PLAN_NOT_WRITABLE");
  const stage=plan.stageA.transition;
  const closure=plan.closure?.transition??null;
  const predecessorRef=hashScientificPromotionTransitionV1(predecessor);
  // The first Stage-A successor is immutable. Do not commit a missing-
  // evidence verdict that would prevent a later evaluation with newly
  // completed RL-3/RL-7 material under the same accepted protocol.
  // Read-only EVALUATE_PROMOTION may still report INSUFFICIENT_EVIDENCE.
  if(stage.resultingState==="INSUFFICIENT_EVIDENCE")
    throw Error("PROMOTION_EVIDENCE_UNAVAILABLE");
  if(predecessor.resultingState!=="EXECUTED"||
     stage.predecessorTransition?.hashHex!==predecessorRef.hashHex||
     stage.predecessorState!=="EXECUTED"||
     !["INSUFFICIENT_EVIDENCE","VALIDATION_FAILED","VALIDATION_PASSED"].includes(stage.resultingState)||
     plan.stageA.transitionRef.hashHex!==hashScientificPromotionTransitionV1(stage).hashHex)
    throw Error("PROMOTION_PLAN_LINEAGE_INVALID");
  assertScientificPromotionPredecessorRelationV1({predecessor,transition:stage});
  if(closure===null)
    throw Error("PROMOTION_CLOSURE_MISMATCH");
  if(closure){
    if(!plan.closure||plan.closure.transitionRef.hashHex!==hashScientificPromotionTransitionV1(closure).hashHex)
      throw Error("PROMOTION_CLOSURE_HASH_INVALID");
    assertScientificPromotionPredecessorRelationV1({predecessor:stage,transition:closure});
  }
  const expectedLeaf=closure??stage;
  const leafRef=hashScientificPromotionTransitionV1(expectedLeaf);
  const stageBody=canonicalScientificPromotionTransitionV1(stage);
  const closureBody=closure===null?null:canonicalScientificPromotionTransitionV1(closure);
  const result=await client.query<{result:unknown}>(
    "select investing.persist_research_scientific_promotion_evaluation_plan_v1($1::uuid,$2,$3::jsonb,$4,$5::jsonb) as result",
    [
      rootTransitionIdentityId,plan.stageA.transitionRef.hashHex,JSON.stringify(stageBody),
      plan.closure?.transitionRef.hashHex??null,
      closureBody===null?null:JSON.stringify(closureBody),
    ]);
  if(result.rows.length!==1||!result.rows[0]||!result.rows[0].result||
     typeof result.rows[0].result!=="object"||Array.isArray(result.rows[0].result))
    throw Error("PROMOTION_WRITER_RECEIPT_INVALID");
  const receipt=result.rows[0].result as Record<string,unknown>;
  if(receipt.status==="DIVERGENT_EXISTING_IDENTITY")
    throw Error("PROMOTION_WRITER_CONFLICT");
  if((receipt.status!=="CREATED"&&receipt.status!=="REUSED_IDENTICAL")||
     typeof receipt.stageATransitionIdentityId!=="string"||
     !uuid.test(receipt.stageATransitionIdentityId)||
     (closure===null?receipt.closureTransitionIdentityId!==null:
      typeof receipt.closureTransitionIdentityId!=="string"||
      !uuid.test(receipt.closureTransitionIdentityId)))
    throw Error("PROMOTION_WRITER_RECEIPT_INVALID");

  const chainRows=await client.query<{result:unknown}>(
    "select investing.reconstruct_research_scientific_promotion_chain_v1($1::uuid) as result",
    [rootTransitionIdentityId]);
  if(chainRows.rows.length!==1||!chainRows.rows[0]||
     !chainRows.rows[0].result||typeof chainRows.rows[0].result!=="object"||
     Array.isArray(chainRows.rows[0].result))
    throw Error("PROMOTION_POSTWRITE_CHAIN_INVALID");
  const chain=chainRows.rows[0].result as Record<string,unknown>;
  const expectedLeafId=closure===null?receipt.stageATransitionIdentityId:receipt.closureTransitionIdentityId;
  const traversal=chain.traversal;
  if(chain.status!=="OK"||chain.rootTransitionIdentityId!==rootTransitionIdentityId||
     chain.activeLeafTransitionIdentityId!==expectedLeafId||
     chain.activeLeafTransitionHashHex!==leafRef.hashHex||
     chain.activeLeafState!==expectedLeaf.resultingState||
     !Array.isArray(traversal)||traversal.length!==(closure===null?2:3)||
     traversal[0]?.transitionHashHex!==predecessorRef.hashHex||
     traversal[1]?.transitionHashHex!==plan.stageA.transitionRef.hashHex||
     traversal[1]?.transitionIdentityId!==receipt.stageATransitionIdentityId||
     (closure!==null&&(traversal[2]?.transitionHashHex!==plan.closure?.transitionRef.hashHex||
                        traversal[2]?.transitionIdentityId!==receipt.closureTransitionIdentityId))||
     !Array.isArray(chain.crossChainHops)||chain.crossChainHops.length!==0)
    throw Error("PROMOTION_POSTWRITE_CHAIN_INVALID");

  return {
    status:receipt.status as PromotionPersistReceiptV1["status"],
    stageATransitionIdentityId:receipt.stageATransitionIdentityId,
    closureTransitionIdentityId:receipt.closureTransitionIdentityId as string|null,
    scientificState:expectedLeaf.resultingState as PromotionPersistReceiptV1["scientificState"],
    stageAHashHex:plan.stageA.transitionRef.hashHex,
    closureHashHex:plan.closure?.transitionRef.hashHex??null,
  };
}
