import "server-only";

import type { AuthorizedResearchPassportReadContext, InvestingAuthorityTransactionClient } from "../authority/context";
import { hashRefV1, i5ResearchInternalCanonicalJsonBytesV1, type CanonicalJsonValue, type HashRefV1 } from "./canonical";
import {
  hashExperimentComparisonProtocolV1,
  type ExperimentComparisonProtocolV1,
} from "./experimentComparison";
import {
  canonicalExperimentComparisonResultV1,
  hashExperimentComparisonResultV1,
  type ExperimentComparisonResultV1,
} from "./experimentComparisonResult";
import type { ResearchPassportV1 } from "./researchPassportReader";
import type { ScientificPromotionResolvedEvidenceV1 } from "./scientificPromotionEngine";

type ComparisonRow = {
  protocol_hash_hex: string;
  protocol_payload: unknown;
  result_hash_hex: string | null;
  result_payload: unknown | null;
};

export type PromotionRobustnessBindingV1 = Readonly<{
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResult: HashRefV1;
  subjectValidationResult: HashRefV1;
}>;

const rl7ReadOperation = "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1";
const rl8EvaluationOperation = "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1";

function same(a: HashRefV1, b: HashRefV1): boolean {
  return a.hashAlgorithm === b.hashAlgorithm && a.hashDomain === b.hashDomain &&
    a.hashVersion === b.hashVersion && a.hashHex === b.hashHex;
}

function one<T>(items: readonly T[]): T {
  if (items.length !== 1 || items[0] === undefined) throw Error("RL7_EVIDENCE_AMBIGUOUS_OR_MISSING");
  return items[0];
}

function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value);
}

/**
 * Accepted RL-7 canonical JSON serializes orientedDeltaSign as an exact
 * string ("-1", "0", "1"), whereas the deterministic classification engine
 * consumes -1/0/1 numbers. Convert this known representation only; then
 * independently re-canonicalize and compare exact canonical JSON bytes.
 * Never trust a fabricated or lossy type conversion from stored JSONB.
 */
function decodeCanonicalRl7ResultV1(raw:unknown):ExperimentComparisonResultV1{
  if(!record(raw)||!Array.isArray(raw.metricDeltas))
    throw Error("RL7_CANONICAL_RESULT_INVALID");
  const deltas=raw.metricDeltas.map((item:unknown)=>{
    if(!record(item))throw Error("RL7_CANONICAL_RESULT_INVALID");
    const sign=item.orientedDeltaSign;
    if(sign!==null&&sign!=="-1"&&sign!=="0"&&sign!=="1")
      throw Error("RL7_CANONICAL_SIGN_INVALID");
    return {...item,orientedDeltaSign:sign===null?null:Number(sign)};
  });
  const decoded={...raw,metricDeltas:deltas} as unknown as ExperimentComparisonResultV1;
  const canonical=canonicalExperimentComparisonResultV1(decoded);
  const canonicalBytes=i5ResearchInternalCanonicalJsonBytesV1(canonical);
  const storedBytes=i5ResearchInternalCanonicalJsonBytesV1(raw as CanonicalJsonValue);
  if(!canonicalBytes.equals(storedBytes))
    throw Error("RL7_CANONICAL_RESULT_MISMATCH");
  return decoded;
}

/**
 * Read-only RL-7 -> RL-8 bridge. Caller supplies no comparison verdict,
 * proof, protocol selector, persisted hash or authority override.
 *
 * The only source is the accepted RL-7 immutable Protocol/Result pair, read
 * through the investing_app FORCE RLS policies with server-derived tenant and
 * Investigation settings. Exactly one matching pair is required if present.
 * Absence is not a fabricated stable classification.
 */
export async function readPersistedPromotionRobustnessV1(
  client: InvestingAuthorityTransactionClient,
  authority: AuthorizedResearchPassportReadContext,
  passport: ResearchPassportV1,
  binding: PromotionRobustnessBindingV1,
): Promise<ScientificPromotionResolvedEvidenceV1["robustness"]> {
  if (authority.operationScope !== "TENANT_SCOPE" || authority.sourceContext !== "PURE_RESEARCH" ||
      passport.investigation.researchInvestigationId !== authority.researchInvestigationId ||
      passport.investigation.tenantId !== authority.tenantId ||
      passport.investigation.principalId !== authority.principalId ||
      passport.investigation.tenantMembershipId !== authority.tenantMembershipId ||
      passport.investigation.operationScope !== "TENANT_SCOPE" ||
      passport.investigation.sourceContext !== "PURE_RESEARCH")
    throw Error("RL7_PROMOTION_AUTHORITY_INVALID");

  // RL-7's accepted RLS SELECT policies admit its FINALIZE operation, while
  // RL-8's reconstruction admits its own operation. Both values are fixed by
  // this server module and are transaction-local, never caller-controlled.
  await client.query("select set_config($1,$2,true)", [
    "syntrake.investing.operation", rl7ReadOperation,
  ]);
  let rows: ComparisonRow[];
  try {
    rows = (await client.query<ComparisonRow>(
      `select p.hash_hex as protocol_hash_hex, p.canonical_payload as protocol_payload,
              r.hash_hex as result_hash_hex, r.canonical_payload as result_payload
       from investing.research_experiment_comparison_protocols_scientific_identities p
       left join investing.research_experiment_comparison_results_scientific_identities r
         on r.research_experiment_comparison_protocol_identity_id =
            p.research_experiment_comparison_protocol_identity_id
        and r.tenant_id = p.tenant_id
        and r.principal_id = p.principal_id
        and r.tenant_membership_id = p.tenant_membership_id
        and r.research_investigation_id = p.research_investigation_id
       where p.tenant_id = $1 and p.principal_id = $2
         and p.tenant_membership_id = $3 and p.research_investigation_id = $4
         and p.operation_scope = 'TENANT_SCOPE' and p.source_context = 'PURE_RESEARCH'
         and p.canonical_payload->'subjectExperiment'->>'hashHex' = $5
         and p.canonical_payload->'subjectResult'->>'hashHex' = $6
         and p.canonical_payload->'subjectValidationResult'->>'hashHex' = $7`,
      [
        authority.tenantId, authority.principalId, authority.tenantMembershipId,
        authority.researchInvestigationId, binding.subjectExperiment.hashHex,
        binding.subjectResult.hashHex, binding.subjectValidationResult.hashHex,
      ],
    )).rows;
  } finally {
    await client.query("select set_config($1,$2,true)", [
      "syntrake.investing.operation", rl8EvaluationOperation,
    ]);
  }

  if (rows.length === 0) return null;
  const row = one(rows);
  // A Protocol without its completed Result is an incomplete persisted
  // evidence chain, not evidence of robustness or absence of comparison.
  if (row.result_hash_hex === null || row.result_payload === null)
    throw Error("RL7_COMPARISON_INCOMPLETE");

  const protocol = row.protocol_payload as ExperimentComparisonProtocolV1;
  const result = decodeCanonicalRl7ResultV1(row.result_payload);
  if (hashExperimentComparisonProtocolV1(protocol) !== row.protocol_hash_hex ||
      hashExperimentComparisonResultV1(result) !== row.result_hash_hex)
    throw Error("RL7_COMPARISON_HASH_INVALID");

  const protocolRef = hashRefV1({
    hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
    hashVersion: "SYNTRAKE_SHA256_V1", hashHex: row.protocol_hash_hex,
  });
  const resultRef = hashRefV1({
    hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1",
    hashVersion: "SYNTRAKE_SHA256_V1", hashHex: row.result_hash_hex,
  });

  if (!same(hashRefV1(result.protocol), protocolRef) ||
      !same(hashRefV1(protocol.subjectExperiment), binding.subjectExperiment) ||
      !same(hashRefV1(protocol.subjectExperimentParameters), binding.subjectExperimentParameters) ||
      !same(hashRefV1(protocol.subjectResult), binding.subjectResult) ||
      !same(hashRefV1(protocol.subjectValidationResult), binding.subjectValidationResult))
    throw Error("RL7_COMPARISON_SUBJECT_MISMATCH");

  // The accepted RL-7 writer independently proves this reference lineage.
  // Additionally anchor every referenced scientific identity in the currently
  // owner-verified Research Passport; UUIDs alone are never ownership proof.
  const referenceExperiment = one(passport.experiments.filter(x =>
    x.experiment && same(hashRefV1(x.experiment), hashRefV1(protocol.referenceExperiment))));
  const subjectExperiment = one(passport.experiments.filter(x =>
    x.experiment && same(hashRefV1(x.experiment), binding.subjectExperiment)));
  const visited=new Set<string>();
  let cursor=subjectExperiment;
  while(cursor.researchExperimentId!==referenceExperiment.researchExperimentId){
    if(visited.has(cursor.researchExperimentId)||visited.size>=passport.experiments.length||
       cursor.parentExperimentId===null)
      throw Error("RL7_REFERENCE_NOT_ANCESTOR");
    visited.add(cursor.researchExperimentId);
    cursor=one(passport.experiments.filter(x=>x.researchExperimentId===cursor.parentExperimentId));
  }
  if (!referenceExperiment.experimentParameters ||
      !same(hashRefV1(referenceExperiment.experimentParameters),
        hashRefV1(protocol.referenceExperimentParameters)))
    throw Error("RL7_REFERENCE_PARAMETERS_INVALID");

  const referenceResult = one(passport.results.filter(x =>
    same(hashRefV1(x.result), hashRefV1(protocol.referenceResult))));
  const referenceRun = one(passport.runInputs.filter(x =>
    x.runInputIdentityId === referenceResult.runInputIdentityId &&
    x.researchExperimentId === referenceExperiment.researchExperimentId));
  if (referenceRun.experimentHashHex !== referenceExperiment.experiment?.hashHex ||
      !passport.executionRuns.some(x => x.runInputIdentityId === referenceRun.runInputIdentityId &&
        x.resultIdentityId === referenceResult.resultIdentityId &&
        x.terminalState === "SUCCEEDED"))
    throw Error("RL7_REFERENCE_RESULT_INVALID");

  if (passport.validation.availability !== "AVAILABLE_RL3") throw Error("RL7_VALIDATION_UNAVAILABLE");
  const referenceValidation = one(passport.validation.episodes.filter(x =>
    x.researchExperimentId === referenceExperiment.researchExperimentId &&
    x.aggregate && x.state === "AGGREGATE_AVAILABLE" &&
    same(hashRefV1(x.aggregate.validationResult), hashRefV1(protocol.referenceValidationResult))));
  if (!referenceValidation.aggregate)
    throw Error("RL7_REFERENCE_VALIDATION_INVALID");

  for (const member of protocol.neighborhoodExperimentRefs) {
    one(passport.experiments.filter(x => x.experiment &&
      same(hashRefV1(x.experiment), hashRefV1(member))));
  }

  return { protocolRef, protocol, resultRef, result };
}
