import "server-only";
import { isAuthorizedResearchPassportReadContext, resolveAuthorizedResearchPassportReadContext, type InvestingAuthorityDatabase } from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { readExperimentComparisonSourcesV1, setComparisonReadContextV1, type ComparisonSourceRequestV1 } from "./experimentComparisonSourceReader";
import { prepareExperimentComparisonPersistenceV1 } from "./experimentComparisonBuilder";
import { i5ResearchInternalCanonicalJsonBytesV1, sha256HexV1 } from "./canonical";

/** Internal only. No prepared hashes, JSONB, sink, or self-declared authority input. */
export async function writeExperimentComparisonV1(
  input: Readonly<{ researchInvestigationId: string; correlationId: string; sources: ComparisonSourceRequestV1 }>,
  database: InvestingAuthorityDatabase = getInvestingAuthorityDatabase(),
) {
  const resolved = await resolveAuthorizedResearchPassportReadContext({ researchInvestigationId: input.researchInvestigationId, correlationId: input.correlationId });
  if (!resolved.ok || !("context" in resolved) || !isAuthorizedResearchPassportReadContext(resolved.context)) throw new Error("COMPARISON_AUTHORITY_REQUIRED");
  const context = resolved.context;
  if (context.operationScope !== "TENANT_SCOPE" || context.sourceContext !== "PURE_RESEARCH") throw new Error("COMPARISON_AUTHORITY_REQUIRED");
  const evidence = await readExperimentComparisonSourcesV1(input.sources, context, database);
  const prepared = prepareExperimentComparisonPersistenceV1(evidence);
  const client = await database.connect();
  try {
    await client.query("begin");
    await setComparisonReadContextV1(client, context);
    // The passport resolver establishes active OWNER authority. Recheck it in
    // the write transaction; a read context alone is never a mutation grant.
    const owner = await client.query<{ tenant_membership_id: string }>(
      "select m.tenant_membership_id from investing.tenant_memberships m join investing.principals p on p.principal_id = m.principal_id join investing.tenants t on t.tenant_id = m.tenant_id where m.tenant_membership_id = $1 and m.tenant_id = $2 and m.principal_id = $3 and m.role = 'OWNER' and m.state = 'ACTIVE' and p.state = 'ACTIVE' and t.state = 'ACTIVE'",
      [context.tenantMembershipId, context.tenantId, context.principalId]);
    if (owner.rows.length !== 1) throw new Error("COMPARISON_MUTATION_AUTHORITY_REQUIRED");
    const role = await client.query<{ current_user: string; current_role: string }>("select current_user, current_role");
    if (role.rows[0]?.current_user !== "investing_app" || role.rows[0]?.current_role !== "investing_app") throw new Error("COMPARISON_TRANSPORT_INVALID");
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.capability", "RESEARCH_MUTATE"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation", "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1"]);
    const p = evidence.protocolPayload;
    const logicalKey = sha256HexV1(i5ResearchInternalCanonicalJsonBytesV1({ referenceExperiment: p.referenceExperiment, subjectExperiment: p.subjectExperiment, referenceResult: p.referenceResult, subjectResult: p.subjectResult, policyId: p.policyId, primaryMetricId: p.primaryMetricId }));
    const protocol = await client.query<{ research_experiment_comparison_protocol_identity_id: string; persistence_status: string }>(
      "select * from investing.persist_research_experiment_comparison_protocol_v1($1, $2, $3::jsonb)",
      [logicalKey, prepared.protocolHash, prepared.protocolPayloadBytes]);
    if (protocol.rows.length !== 1 || !protocol.rows[0]!.research_experiment_comparison_protocol_identity_id) throw new Error("COMPARISON_PROTOCOL_PERSISTENCE_FAILURE");
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation", "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1"]);
    const result = await client.query<{ research_experiment_comparison_result_identity_id: string; persistence_status: string }>(
      "select * from investing.finalize_research_experiment_comparison_result_v1($1, $2, $3::jsonb)",
      [protocol.rows[0]!.research_experiment_comparison_protocol_identity_id, prepared.resultHash, prepared.resultPayloadBytes]);
    if (result.rows.length !== 1 || !result.rows[0]!.research_experiment_comparison_result_identity_id) throw new Error("COMPARISON_RESULT_PERSISTENCE_FAILURE");
    await client.query("commit");
    return { ...prepared, protocolIdentityId: protocol.rows[0]!.research_experiment_comparison_protocol_identity_id, resultIdentityId: result.rows[0]!.research_experiment_comparison_result_identity_id };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.release(); }
}
