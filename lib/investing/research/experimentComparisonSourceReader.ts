import type { AuthorizedResearchPassportReadContext, InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../authority/context";
import { hashRefV1, hashRunInputV1, sha256HexV1, type HashRefV1, type RunInputHashPayloadV1, type CanonicalJsonValue } from "./canonical";
import type { VerifiedComparisonEvidenceV1, VerifiedMetricResultSetProofV1, VerifiedComparisonExperimentNodeV1, MetricResultSetV2ArtifactRecordV1, VerifiedFoldMetricEvidenceV1 } from "./experimentComparisonBuilder";
import { hashExperimentComparisonProtocolV1, type ExperimentComparisonProtocolV1 } from "./experimentComparison";
import { hashExperimentParametersV1, type ExperimentParametersCandidateV1 } from "./experimentParameters";
import { canonicalJsonlArtifactBytesV1, hashResultV1, type ResultHashPayloadV1, type ResearchArtifactDescriptorV1 } from "./resultArtifacts";
import { assertMetricResultRecordV2 } from "./researchMetrics";
import { parseValuationArtifactV2 } from "./valuationArtifactV2";
import type { ExperimentPassportRowV1 } from "./researchPassportReader";
import type { ValidationEpisodePassportV1, ValidationPhasePassportV1 } from "./validationPassport";
import { hashValidationResultV1, type ValidationResultHashPayloadV1 } from "./validationAggregate";
import { hashValidationChildResultV1, hashValidationRunInputV1, type ValidationChildResultHashPayloadV1, type ValidationRunInputHashPayloadV1 } from "./validationExecution";

// Only this persistence reader can issue authority. Serializing, spreading, or
// mutating its output loses authority, including mutation of Buffer contents.
const issued = new WeakMap<object, string>();
function fingerprint(value: unknown): string { return sha256HexV1(Buffer.from(JSON.stringify(value), "utf8")); }
export function isPersistenceComparisonEvidenceV1(value: VerifiedComparisonEvidenceV1): boolean {
  return issued.has(value) && issued.get(value) === fingerprint(value);
}

export type ComparisonSourceRequestV1 = Readonly<{
  protocol: ExperimentComparisonProtocolV1;
  referenceParameters: ExperimentParametersCandidateV1;
  subjectParameters: ExperimentParametersCandidateV1;
  neighborhoodResults: readonly Readonly<{ experiment: HashRefV1; result: HashRefV1 }>[];
}>;

export async function readExperimentComparisonSourcesV1(
  request: ComparisonSourceRequestV1,
  context: AuthorizedResearchPassportReadContext,
  database?: InvestingAuthorityDatabase,
): Promise<VerifiedComparisonEvidenceV1> {
  const { isAuthorizedResearchPassportReadContext } = await import("../authority/context");
  if (!isAuthorizedResearchPassportReadContext(context) || context.operationScope !== "TENANT_SCOPE" || context.sourceContext !== "PURE_RESEARCH") throw new Error("COMPARISON_AUTHORITY_REQUIRED");
  const { getInvestingAuthorityDatabase } = await import("../authority/transport");
  const { readResearchPassportV1 } = await import("./researchPassportReader");
  const db = database ?? getInvestingAuthorityDatabase();
  const read = await readResearchPassportV1({ authorizedContext: context }, db);
  if (read.ok === false) throw new Error(read.code);
  const passport = read.passport;
  const authority = passport.investigation;
  if (authority.tenantId !== context.tenantId || authority.principalId !== context.principalId || authority.tenantMembershipId !== context.tenantMembershipId || authority.researchInvestigationId !== context.researchInvestigationId || authority.operationScope !== "TENANT_SCOPE" || authority.sourceContext !== "PURE_RESEARCH") throw new Error("COMPARISON_AUTHORITY_REQUIRED");
  const client = await db.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await setComparisonReadContextV1(client, context);
    const p = request.protocol;
    const referenceRow = experiment(p.referenceExperiment);
    const subjectRow = experiment(p.subjectExperiment);
    for (const [row, parameters, expected] of [[referenceRow, request.referenceParameters, p.referenceExperimentParameters], [subjectRow, request.subjectParameters, p.subjectExperimentParameters]] as const) {
      if (!row.experimentParameters || !same(row.experimentParameters, expected) || hashExperimentParametersV1(parameters) !== expected.hashHex || !same(row.researchIr, parameters.resolvedResearchIr.ref)) throw new Error("EXPERIMENT_PARAMETERS_BINDING_INVALID");
    }
    const referenceEpisode = episode(p.referenceValidationResult, p.referenceExperiment);
    const subjectEpisode = episode(p.subjectValidationResult, p.subjectExperiment);
    const reference = await result(p.referenceResult, referenceRow);
    const subject = await result(p.subjectResult, subjectRow);
    const lineage: VerifiedComparisonExperimentNodeV1[] = [];
    let current: ExperimentPassportRowV1 = subjectRow;
    const seen = new Set<string>();
    while (true) {
      if (seen.has(current.researchExperimentId)) throw new Error("EXPERIMENT_PARENT_LINEAGE_INVALID");
      seen.add(current.researchExperimentId);
      lineage.push(node(current));
      if (current.researchExperimentId === referenceRow.researchExperimentId) break;
      current = one(passport.experiments.filter((row) => row.researchExperimentId === current.parentExperimentId));
    }
    const folds: VerifiedFoldMetricEvidenceV1[] = [];
    const aggregate = subjectEpisode.aggregate!.canonicalPayload as ValidationResultHashPayloadV1;
    for (const [index, fold] of subjectEpisode.folds.entries()) {
      const binding = aggregate.folds[index];
      if (!binding || binding.ordinal !== fold.ordinal) throw new Error("VALIDATION_FOLD_BINDING_INVALID");
      folds.push({ foldId: fold.ordinal, validationResult: p.subjectValidationResult,
        trainingMetricRecords: await phase(fold.training, "TRAINING", fold.ordinal, binding.trainingChildResult, binding.trainingRunInput),
        evaluationMetricRecords: await phase(fold.evaluation, "EVALUATION", fold.ordinal, binding.evaluationChildResult, binding.evaluationRunInput) });
    }
    if (aggregate.folds.length !== folds.length) throw new Error("VALIDATION_FOLD_BINDING_INVALID");
    const neighborhood = [];
    for (const ref of p.neighborhoodExperimentRefs) {
      const choice = one(request.neighborhoodResults.filter((member) => same(member.experiment, ref)));
      neighborhood.push({ experiment: ref, resultProof: (await result(choice.result, experiment(ref))).proof });
    }
    if (neighborhood.length !== request.neighborhoodResults.length) throw new Error("NEIGHBORHOOD_BINDING_INVALID");
    const proof = {
      protocol: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashExperimentComparisonProtocolV1(p) },
      protocolPayload: p, reference: node(referenceRow), subject: node(subjectRow), lineageNodes: lineage,
      referenceScientificInputs: scientific(reference, referenceEpisode), subjectScientificInputs: scientific(subject, subjectEpisode),
      referenceResultProof: reference.proof, subjectResultProof: subject.proof,
      referenceExperimentParameters: request.referenceParameters, subjectExperimentParameters: request.subjectParameters,
      foldEvidence: folds, neighborhoodEvidence: neighborhood,
      costEvidence: { referenceResult: reference.proof.result, subjectResult: subject.proof.result,
        referenceValuationSeriesBytes: reference.costBytes, subjectValuationSeriesBytes: subject.costBytes,
        referenceCostRecords: parseValuationArtifactV2(reference.costBytes, reference.proof.resultPayload.valuationSeries), subjectCostRecords: parseValuationArtifactV2(subject.costBytes, subject.proof.resultPayload.valuationSeries) },
      eventMetricEvidence: { result: subject.proof.result, tradeCount: observation(subject.proof.metricRecords, "TRADE_COUNT"), rebalanceCount: observation(subject.proof.metricRecords, "REBALANCE_COUNT") },
    } as const satisfies VerifiedComparisonEvidenceV1;
    // Own all nested input objects; callers retain no alias into the authority.
    const owned = clone(proof) as VerifiedComparisonEvidenceV1;
    await client.query("commit");
    issued.set(owned, fingerprint(owned));
    return owned;

    function experiment(ref: HashRefV1) { return one(passport.experiments.filter((row) => row.experiment && same(row.experiment, ref))); }
    function node(row: ExperimentPassportRowV1): VerifiedComparisonExperimentNodeV1 {
      const parent = row.parentExperimentId === null ? null : one(passport.experiments.filter((item) => item.researchExperimentId === row.parentExperimentId));
      if (!row.experiment || (parent && !parent.experiment)) throw new Error("EXPERIMENT_NOT_MATERIALIZED");
      return { acceptedExperiment: { source: "ACCEPTED_EXPERIMENT_PERSISTENCE_V1", experiment: hashRefV1(row.experiment as HashRefV1), parentExperiment: parent ? hashRefV1(parent.experiment as HashRefV1) : null,
        tenantAuthority: [authority.tenantId, authority.principalId, authority.tenantMembershipId, authority.operationScope, authority.sourceContext].join(":"), investigationId: authority.researchInvestigationId,
        researchIrFamily: row.researchSpecRevisionId, relation: row.relation } };
    }
    function episode(ref: HashRefV1, owner: HashRefV1): ValidationEpisodePassportV1 {
      if (passport.validation.availability !== "AVAILABLE_RL3") throw new Error("VALIDATION_UNAVAILABLE");
      const ep = one(passport.validation.episodes.filter((item) => item.aggregate && same(item.aggregate.validationResult, ref)));
      const payload = ep.aggregate!.canonicalPayload as ValidationResultHashPayloadV1;
      if (ep.state !== "AGGREGATE_AVAILABLE" || !same(ep.subjectExperiment, owner) || !same(payload.subjectExperiment, owner) || !same(payload.validationProtocol, ep.validationProtocol) || hashValidationResultV1(payload) !== ref.hashHex) throw new Error("VALIDATION_RESULT_BINDING_INVALID");
      return ep;
    }
    async function result(ref: HashRefV1, owner: ExperimentPassportRowV1) {
      const row = one(passport.results.filter((item) => same(item.result, ref)));
      const run = one(passport.runInputs.filter((item) => item.runInputIdentityId === row.runInputIdentityId));
      const payload = row.canonicalPayload as ResultHashPayloadV1;
      const runPayload = run.canonicalPayload as RunInputHashPayloadV1;
      if (!owner.experiment || run.researchExperimentId !== owner.researchExperimentId || !same(runPayload.experiment, owner.experiment) || !same(runPayload.researchIr, owner.researchIr) || run.experimentHashHex !== owner.experiment.hashHex || hashRunInputV1(runPayload) !== run.runInput.hashHex || !same(payload.runInput, run.runInput) || hashResultV1(payload) !== ref.hashHex) throw new Error("RESULT_RUN_INPUT_BINDING_INVALID");
      if (!passport.executionRuns.some((item) => item.runInputIdentityId === run.runInputIdentityId && item.terminalState === "SUCCEEDED" && item.resultIdentityId === row.resultIdentityId && item.failureReasonCode === null)) throw new Error("RESULT_NOT_SUCCEEDED");
      const metricBytes = await artifact("METRIC_RESULT_SET", payload.metricResultSet);
      const costBytes = await artifact("VALUATION_SERIES", payload.valuationSeries);
      const proof: VerifiedMetricResultSetProofV1 = { result: ref, resultPayload: payload, acceptedResult: { source: "ACCEPTED_RESULT_PERSISTENCE_V1", result: ref, experiment: owner.experiment as HashRefV1, runInput: run.runInput as HashRefV1 }, metricArtifactBytes: metricBytes, metricRecords: parseMetrics(metricBytes, payload.metricResultSet) };
      return { proof, runPayload, costBytes };
      async function artifact(kind: string, descriptor: ResearchArtifactDescriptorV1) {
        const identity = one(row.artifacts.filter((item) => item.artifactKind === kind));
        if (identity.contentSha256 !== descriptor.contentSha256 || identity.artifactSchemaVersion !== descriptor.artifactSchemaVersion || identity.format !== descriptor.format || identity.contentByteLength !== descriptor.contentByteLength || identity.recordCount !== descriptor.recordCount) throw new Error("RESULT_ARTIFACT_BINDING_INVALID");
        const artifact = one((await client.query<{ content: Buffer }>("select content from investing.research_result_artifacts where artifact_id = $1 and tenant_id = $2 and principal_id = $3 and tenant_membership_id = $4", [identity.artifactId, context.tenantId, context.principalId, context.tenantMembershipId])).rows);
        const bytes = Buffer.from(artifact.content);
        if (sha256HexV1(bytes) !== descriptor.contentSha256 || String(bytes.length) !== descriptor.contentByteLength) throw new Error("RESULT_ARTIFACT_BINDING_INVALID");
        return bytes;
      }
    }
    async function phase(part: ValidationPhasePassportV1, expected: "TRAINING" | "EVALUATION", ordinal: string, childRef: HashRefV1, inputRef: HashRefV1) {
      if (!part.childResult || !part.runInput || part.phase !== expected || !same(part.childResult.validationChildResult, childRef) || !same(part.runInput.validationRunInput, inputRef)) throw new Error("VALIDATION_CHILD_BINDING_INVALID");
      const child = part.childResult.canonicalPayload as ValidationChildResultHashPayloadV1;
      const run = part.runInput.canonicalPayload as ValidationRunInputHashPayloadV1;
      if (hashValidationChildResultV1(child) !== childRef.hashHex || hashValidationRunInputV1(run) !== inputRef.hashHex || !same(child.validationRunInput, inputRef) || run.phase !== expected || run.foldOrdinal !== ordinal || !same(run.validationProtocol, subjectEpisode.validationProtocol) || !same(run.subjectExperiment, p.subjectExperiment)) throw new Error("VALIDATION_CHILD_BINDING_INVALID");
      if (!part.runs.some((item) => item.researchValidationExecutionRunId === part.childResult!.researchValidationExecutionRunId && item.terminalState === "SUCCEEDED")) throw new Error("VALIDATION_CHILD_NOT_SUCCEEDED");
      const artifact = one((await client.query<{ content_bytes: Buffer }>(
        "select a.content_bytes from investing.research_validation_result_artifacts a join investing.research_validation_child_results_scientific_identities c on c.metric_result_set_artifact_id = a.research_validation_result_artifact_id and c.research_validation_execution_run_id = a.research_validation_execution_run_id where c.research_validation_child_result_identity_id = $1 and c.tenant_id = $2 and c.principal_id = $3 and c.tenant_membership_id = $4 and c.research_investigation_id = $5 and a.artifact_kind = 'METRIC_RESULT_SET'",
        [part.childResult.researchValidationChildResultIdentityId, context.tenantId, context.principalId, context.tenantMembershipId, context.researchInvestigationId])).rows);
      return parseMetrics(Buffer.from(artifact.content_bytes), child.metricResultSet);
    }
    function scientific(value: Awaited<ReturnType<typeof result>>, ep: ValidationEpisodePassportV1): VerifiedComparisonEvidenceV1["referenceScientificInputs"] {
      const run = value.runPayload, payload = value.proof.resultPayload;
      if (run.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
      return { datasetSnapshot: run.datasetSnapshot, executionConfig: run.executionConfig, metricRequestSet: run.metricRequestSet, engine: run.engineVersion, metricRegistry: run.metricRegistryVersion,
        benchmark: payload.benchmark === null ? "NONE" : payload.benchmark.contentSha256, evaluationPeriod: `${payload.testPeriod.startDate}/${payload.testPeriod.endDate}`, validationProtocol: hashRefV1(ep.validationProtocol as HashRefV1), validationResult: hashRefV1(ep.aggregate!.validationResult as HashRefV1) };
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.release(); }
}

function parseMetrics(bytes: Buffer, descriptor: ResearchArtifactDescriptorV1): readonly MetricResultSetV2ArtifactRecordV1[] {
  if (descriptor.artifactSchemaVersion !== "METRIC_RESULT_SET_V2" || descriptor.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1" || sha256HexV1(bytes) !== descriptor.contentSha256 || String(bytes.length) !== descriptor.contentByteLength) throw new Error("METRIC_ARTIFACT_INVALID");
  const records: MetricResultSetV2ArtifactRecordV1[] = bytes.toString("utf8").split("\n").slice(0, -1).map((line) => JSON.parse(line));
  if (String(records.length) !== descriptor.recordCount || !canonicalJsonlArtifactBytesV1(records as unknown as CanonicalJsonValue[]).equals(bytes)) throw new Error("METRIC_ARTIFACT_INVALID");
  let previous = "";
  for (const record of records) {
    assertMetricResultRecordV2(record);
    if (previous >= record.metricId) throw new Error("METRIC_RECORD_ORDER_INVALID");
    previous = record.metricId;
  }
  return records;
}
function observation(records: readonly MetricResultSetV2ArtifactRecordV1[], metricId: "TRADE_COUNT" | "REBALANCE_COUNT") {
  const record = records.find((item) => item.metricId === metricId);
  return { metricId, metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", artifactSchemaVersion: "METRIC_RESULT_SET_V2", state: record?.status === "AVAILABLE" ? "VALUE" : "MISSING", canonicalDecimal: record?.status === "AVAILABLE" ? record.value! : null } as const;
}
function same(a: { hashHex: string; hashDomain: string }, b: { hashHex: string; hashDomain: string }): boolean { return a.hashHex === b.hashHex && a.hashDomain === b.hashDomain; }
function one<T>(values: readonly T[]): T { if (values.length !== 1) throw new Error("PERSISTED_SOURCE_NOT_UNIQUE_OR_MISSING"); return values[0]!; }
function clone(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return Object.freeze(value.map(clone));
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])));
  return value;
}
export async function setComparisonReadContextV1(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchPassportReadContext): Promise<void> {
  const values = { external_provider: "CLERK", external_subject: context.actorId, actor_kind: context.actorKind, actor_id: context.actorId, principal_id: context.principalId, tenant_id: context.tenantId, tenant_membership_id: context.tenantMembershipId, account_id: "", account_access_id: "", operation: context.operation, capability: context.capability, operation_scope: context.operationScope, source_context: context.sourceContext, correlation_id: context.correlationId, research_investigation_id: context.researchInvestigationId };
  for (const [key, value] of Object.entries(values)) await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}
