import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGoldenFixture } from "./support/investingEngineV2GoldenFixture";
import { executeHistoricalBacktestV2 } from "../lib/investing/research/historicalExecutionEngineV2";
import { hashRefV1, hashRunInputV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { artifactDescriptorV1, canonicalJsonlArtifactBytesV1, hashResultV1 } from "../lib/investing/research/resultArtifacts";
import { metricRegistryV2Requests, assertMetricResultRecordV2 } from "../lib/investing/research/researchMetrics";
import { parseValuationArtifactV2 } from "../lib/investing/research/valuationArtifactV2";
import { hashMetricRequestSetV1 } from "../lib/investing/research/executionMaterials";
import { hashExperimentParametersV1 } from "../lib/investing/research/experimentParameters";
import { hashValidationRunInputV1, hashValidationChildResultV1 } from "../lib/investing/research/validationExecution";
import { hashValidationResultV1 } from "../lib/investing/research/validationAggregate";
import { hashExperimentComparisonProtocolV1 } from "../lib/investing/research/experimentComparison";
import { hashExperimentComparisonResultV1 } from "../lib/investing/research/experimentComparisonResult";
import { buildExperimentComparisonResultV1, prepareExperimentComparisonPersistenceV1 } from "../lib/investing/research/experimentComparisonBuilder";
import { readExperimentComparisonSourcesV1, isPersistenceComparisonEvidenceV1 } from "../lib/investing/research/experimentComparisonSourceReader";
import { writeExperimentComparisonV1 } from "../lib/investing/research/experimentComparisonWriter";
import { i5ExperimentParametersCandidateV1, i5ExperimentResolvedResearchIrV1 } from "./support/investingI5ExperimentScientificFixtures";

// Mock the existing accepted passport and authorization boundaries, never the
// new issuance gate or scientific derivation. SQL artifact reads/writes use the
// concrete adapter below; real RL-3 passport adversarial tests run separately.
const state = vi.hoisted(() => ({ passport: null as any, context: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/research/researchPassportReader", () => ({ readResearchPassportV1: async () => ({ ok: true, passport: state.passport }) }));
vi.mock("../lib/investing/authority/context", () => ({
  isAuthorizedResearchPassportReadContext: (value: unknown) => value === state.context,
  resolveAuthorizedResearchPassportReadContext: async () => ({ ok: true, context: state.context }),
}));

function ref(domain: HashRefV1["hashDomain"], hash: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hash.length === 64 ? hash : hash.repeat(64) });
}
function engine() {
  const f = buildGoldenFixture();
  const metricRequestSet = { ...f.metricRequestSet, metricRegistryVersion: "METRIC_REGISTRY_V20260927", requests: metricRegistryV2Requests };
  const runInput = { ...f.runInput, metricRegistryVersion: metricRequestSet.metricRegistryVersion, metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSet)) };
  const result = executeHistoricalBacktestV2({ ...f, metricRequestSet, runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)) });
  if (result.ok === false) throw new Error(JSON.stringify(result));
  return { result, runInput };
}

function fixture() {
  const { result: actual, runInput } = engine();
  const artifacts = new Map<string, Buffer>();
  const validationBytes = new Map<string, Buffer>();
  state.context = { actorKind: "USER_PRINCIPAL", actorId: "actor", tenantId: "tenant", principalId: "principal", tenantMembershipId: "membership", researchInvestigationId: "investigation", operationScope: "TENANT_SCOPE", sourceContext: "PURE_RESEARCH", correlationId: "test", operation: "RESEARCH_PASSPORT_READ_V1", capability: "RESEARCH_READ" };
  const parameters = [i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.10", "20", "0.6", "0.4")), i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.15", "10", "0.7", "0.3"))];
  const experiments = parameters.map((param, i) => ({ researchExperimentId: `experiment-${i}`, experiment: ref("SYNTRAKE:EXPERIMENT:V1", String(i + 1)), parentExperimentId: i === 0 ? null : "experiment-0", relation: i === 0 ? "BASELINE" : "VARIANT", researchSpecRevisionId: "spec", researchIr: param.resolvedResearchIr.ref, experimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(param)) }));
  const inputs = experiments.map((experiment, i) => {
    const payload = { ...runInput, experiment: experiment.experiment, researchIr: experiment.researchIr };
    return { runInputIdentityId: `input-${i}`, researchExperimentId: experiment.researchExperimentId, experimentHashHex: experiment.experiment.hashHex, runInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(payload)), canonicalPayload: payload };
  });
  const results = inputs.map((input, i) => {
    const payload = { ...actual.resultPayload, runInput: input.runInput };
    const descriptors = [["METRIC_RESULT_SET", payload.metricResultSet, actual.artifacts.metricResultSetBytes], ["VALUATION_SERIES", payload.valuationSeries, actual.artifacts.valuationSeriesBytes]] as const;
    return { resultIdentityId: `result-${i}`, runInputIdentityId: input.runInputIdentityId, result: ref("SYNTRAKE:RESULT:V1", hashResultV1(payload)), canonicalPayload: payload,
      artifacts: descriptors.map(([kind, descriptor, bytes]) => { const id = `${i}-${kind}`; artifacts.set(id, bytes); return { artifactId: id, artifactKind: kind, ...descriptor }; }) };
  });
  const episodes = experiments.map((experiment, index) => {
    const validationProtocol = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
    const phase = (phase: "TRAINING" | "EVALUATION") => {
      const run = { schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1" as const, validationProtocol, subjectExperiment: experiment.experiment, subjectResearchIr: experiment.researchIr, phaseResearchIr: experiment.researchIr, sourceDatasetSnapshot: runInput.datasetSnapshot, phaseDatasetSnapshot: runInput.datasetSnapshot, foldOrdinal: "0", phase, phaseWindow: actual.resultPayload.testPeriod, engineId: runInput.engineId, engineVersion: runInput.engineVersion, metricRegistryVersion: runInput.metricRegistryVersion, metricRequestSet: runInput.metricRequestSet, executionConfig: runInput.executionConfig };
      const inputRef = ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", hashValidationRunInputV1(run));
      const { runInput: ignored, ...body } = actual.resultPayload;
      void ignored;
      const child = { ...body, schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1" as const, validationRunInput: inputRef };
      const id = `child-${index}-${phase}`;
      validationBytes.set(id, actual.artifacts.metricResultSetBytes);
      return { phase, runInput: { validationRunInput: inputRef, canonicalPayload: run }, childResult: { researchValidationChildResultIdentityId: id, researchValidationExecutionRunId: id, validationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", hashValidationChildResultV1(child)), canonicalPayload: child }, runs: [{ researchValidationExecutionRunId: id, terminalState: "SUCCEEDED" }] };
    };
    const training = phase("TRAINING"), evaluation = phase("EVALUATION");
    const aggregate = { schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1" as const, methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1" as const, validationProtocol, subjectExperiment: experiment.experiment, validationMode: "IS_OOS_SPLIT" as const,
      folds: [{ ordinal: "0", trainingRunInput: training.runInput.validationRunInput, evaluationRunInput: evaluation.runInput.validationRunInput, trainingChildResult: training.childResult.validationChildResult, evaluationChildResult: evaluation.childResult.validationChildResult }] };
    return { validationProtocol, subjectExperiment: experiment.experiment, state: "AGGREGATE_AVAILABLE", folds: [{ ordinal: "0", training, evaluation }], aggregate: { validationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", hashValidationResultV1(aggregate)), canonicalPayload: aggregate } };
  });
  state.passport = { investigation: { ...state.context }, experiments, runInputs: inputs, results, executionRuns: results.map((row) => ({ runInputIdentityId: row.runInputIdentityId, resultIdentityId: row.resultIdentityId, terminalState: "SUCCEEDED", failureReasonCode: null })), validation: { availability: "AVAILABLE_RL3", episodes } };
  const protocol = { schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1" as const, policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927" as const, referenceExperiment: experiments[0]!.experiment, subjectExperiment: experiments[1]!.experiment, referenceExperimentParameters: experiments[0]!.experimentParameters, subjectExperimentParameters: experiments[1]!.experimentParameters, referenceResult: results[0]!.result, subjectResult: results[1]!.result, referenceValidationResult: episodes[0]!.aggregate.validationResult, subjectValidationResult: episodes[1]!.aggregate.validationResult, metricRegistryVersion: "METRIC_REGISTRY_V20260927" as const, primaryMetricId: "CAGR" as const, comparisonMetricIds: ["CAGR", "TRADE_COUNT", "REBALANCE_COUNT"] as const, neighborhoodExperimentRefs: [experiments[1]!.experiment] };
  const sources = { protocol, referenceParameters: parameters[0]!, subjectParameters: parameters[1]!, neighborhoodResults: [{ experiment: experiments[1]!.experiment, result: results[1]!.result }] };
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []): Promise<{ rows: any[] }> => {
    if (sql.startsWith("select content from")) return { rows: artifacts.has(String(values[0])) ? [{ content: artifacts.get(String(values[0])) }] : [] };
    if (sql.startsWith("select a.content_bytes")) return { rows: validationBytes.has(String(values[0])) ? [{ content_bytes: validationBytes.get(String(values[0])) }] : [] };
    if (sql.startsWith("select m.tenant_membership_id")) return { rows: [{ tenant_membership_id: "membership" }] };
    if (sql === "select current_user, current_role") return { rows: [{ current_user: "investing_app", current_role: "investing_app" }] };
    if (sql.includes("persist_research_experiment_comparison_protocol_v1")) return { rows: [{ research_experiment_comparison_protocol_identity_id: "protocol-id", persistence_status: "CREATED" }] };
    if (sql.includes("finalize_research_experiment_comparison_result_v1")) return { rows: [{ research_experiment_comparison_result_identity_id: "result-id", persistence_status: "CREATED" }] };
    return { rows: [] };
  });
  const database = { connect: async () => ({ query, release: async () => undefined }) } as any;
  return { actual, sources, database, query, artifacts, validationBytes, episodes, results, experiments, inputs };
}

describe("RL-7 real Engine V2 artifacts", () => {
  it("uses actual valuation bytes and final cumulative fee/slippage, rejecting trace masquerading", () => {
    const { result } = engine();
    const records = parseValuationArtifactV2(result.artifacts.valuationSeriesBytes, result.resultPayload.valuationSeries);
    const last = JSON.parse(result.artifacts.valuationSeriesBytes.toString("utf8").trim().split("\n").at(-1)!);
    expect(records.at(-1)!.cumulativeExplicitFees).toBe(last.cumulativeExplicitFees);
    expect(records.at(-1)!.cumulativeSlippageCost).toBe(last.cumulativeSlippageCost);
    expect(Number(last.cumulativeExplicitFees)).toBeGreaterThan(0);
    expect(Number(last.cumulativeSlippageCost)).toBeGreaterThan(0);
    expect(() => parseValuationArtifactV2(result.artifacts.executionTraceBytes, result.resultPayload.executionTrace)).toThrow();
    expect(() => parseValuationArtifactV2(result.artifacts.executionTraceBytes, artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", result.artifacts.executionTraceBytes, Number(result.resultPayload.executionTrace.recordCount)))).toThrow();
  });
  it.each(["cumulativeExplicitFees", "cumulativeSlippageCost"])("rejects non-monotonic %s with valid new descriptor", (field) => {
    const { result } = engine();
    const records = JSON.parse(`[${result.artifacts.valuationSeriesBytes.toString().trim().split("\n").join(",")}]`);
    records[0][field] = "999999";
    const bytes = canonicalJsonlArtifactBytesV1(records);
    expect(() => parseValuationArtifactV2(bytes, artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", bytes, records.length))).toThrow("NON_MONOTONIC_COST");
  });
  it.each(["annualizationBasis", "riskFreeSessionReturn", "minimumAcceptableSessionReturn", "arithmetic", "rounding", "extra", "reason"])("rejects malformed metric %s", (field) => {
    const { result } = engine();
    const record = result.artifacts.metricResultSetBytes.toString().trim().split("\n").map((line) => JSON.parse(line)).find((item) => item.status === "AVAILABLE");
    expect(() => assertMetricResultRecordV2({ ...record, [field]: "invalid" })).toThrow();
  });
});

describe("RL-7 persisted authority and concrete writer", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });
  const read = () => readExperimentComparisonSourcesV1(f.sources, state.context, f.database);
  it("derives accepted source, fold, and cost evidence from persisted lineage", async () => {
    const evidence = await read();
    expect(isPersistenceComparisonEvidenceV1(evidence)).toBe(true);
    const built = buildExperimentComparisonResultV1(evidence);
    expect(built.failure).toBeNull();
    const last = evidence.costEvidence!.referenceCostRecords.at(-1)!;
    expect(built.costEvidence).toMatchObject({ explicitFeeTotalReference: last.cumulativeExplicitFees, slippageCostTotalReference: last.cumulativeSlippageCost, costDelta: "0" });
    expect(built.validationEvidence.completeFoldCount).toBe("1");
  });
  it.each(["acceptedResult", "acceptedExperiment", "detached folds", "mutated bytes"])("caller-created %s cannot acquire authority", async (kind) => {
    const evidence = await read();
    const untrusted = kind === "mutated bytes" ? evidence : { ...evidence };
    if (kind === "mutated bytes") evidence.subjectResultProof.metricArtifactBytes[0] = 0;
    if (kind === "detached folds") Object.assign(untrusted, { foldEvidence: [{ inSample: {}, outOfSample: {}, subjectOos: {} }] });
    expect(buildExperimentComparisonResultV1(untrusted).failure).toBe("CORRUPTED_EVIDENCE");
    expect(() => prepareExperimentComparisonPersistenceV1(untrusted)).toThrow("CORRUPTED_EVIDENCE");
  });
  it("rejects unaccepted Result", async () => { state.passport.results = []; await expect(read()).rejects.toThrow(); });
  it("rejects unsuccessful Result", async () => { state.passport.executionRuns[1].terminalState = "FAILED"; await expect(read()).rejects.toThrow("RESULT_NOT_SUCCEEDED"); });
  it("rejects Result owned by another Experiment", async () => { f.inputs[1]!.researchExperimentId = "experiment-0"; await expect(read()).rejects.toThrow("RESULT_RUN_INPUT_BINDING_INVALID"); });
  it("checks neighborhood Result ownership independently", async () => {
    f.sources.protocol.neighborhoodExperimentRefs.push(f.experiments[0]!.experiment);
    f.sources.neighborhoodResults.push({ experiment: f.experiments[0]!.experiment, result: f.results[1]!.result });
    await expect(read()).rejects.toThrow("RESULT_RUN_INPUT_BINDING_INVALID");
  });
  it("does not issue authority for an unmaterialized Experiment", async () => {
    state.passport.experiments[1].experiment = null;
    await expect(read()).rejects.toThrow();
  });
  it("rejects a self-declared read context before persistence reads", async () => {
    await expect(readExperimentComparisonSourcesV1(f.sources, { ...state.context }, f.database)).rejects.toThrow("COMPARISON_AUTHORITY_REQUIRED");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("cannot write after owner authority is revoked", async () => {
    const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => sql.startsWith("select m.tenant_membership_id") ? { rows: [] } : base(sql, values));
    await expect(writeExperimentComparisonV1({ researchInvestigationId: "investigation", correlationId: "test", sources: f.sources }, f.database)).rejects.toThrow("COMPARISON_MUTATION_AUTHORITY_REQUIRED");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("persist_research_experiment_comparison_protocol_v1"))).toBe(false);
  });
  it.each(["child", "ordinal", "phase", "artifact", "validation result"])("rejects wrong Validation %s", async (kind) => {
    const ep = f.episodes[1]!;
    if (kind === "child") ep.folds[0]!.training.childResult.validationChildResult = ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "F");
    if (kind === "ordinal") ep.folds[0]!.ordinal = "1";
    if (kind === "phase") [ep.folds[0]!.training, ep.folds[0]!.evaluation] = [ep.folds[0]!.evaluation, ep.folds[0]!.training];
    if (kind === "artifact") f.validationBytes.set(ep.folds[0]!.training.childResult.researchValidationChildResultIdentityId, Buffer.from("corrupt\n"));
    if (kind === "validation result") f.sources.protocol.subjectValidationResult = ref("SYNTRAKE:VALIDATION_RESULT:V1", "F");
    await expect(read()).rejects.toThrow();
  });
  it("concrete writer recomputes hashes and invokes both persistence functions transactionally", async () => {
    const written = await writeExperimentComparisonV1({ researchInvestigationId: "investigation", correlationId: "test", sources: f.sources, ...{ prepared: { protocolHash: "F".repeat(64), resultHash: "E".repeat(64), resultPayloadBytes: "{}" } } }, f.database);
    expect(written.protocolHash).toBe(hashExperimentComparisonProtocolV1(f.sources.protocol));
    expect(written.resultHash).toBe(hashExperimentComparisonResultV1(buildExperimentComparisonResultV1(await read())));
    const calls = f.query.mock.calls;
    const protocol = calls.find(([sql]) => sql.includes("persist_research_experiment_comparison_protocol_v1"))!;
    const result = calls.find(([sql]) => sql.includes("finalize_research_experiment_comparison_result_v1"))!;
    expect(protocol[1]?.slice(1)).toEqual([written.protocolHash, written.protocolPayloadBytes]);
    expect(result[1]).toEqual(["protocol-id", written.resultHash, written.resultPayloadBytes]);
    expect(calls.at(-1)![0]).toBe("commit");
  });
  it("rolls back when the concrete persistence adapter fails", async () => {
    const base = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => { if (sql.includes("finalize_research_experiment_comparison_result_v1")) throw new Error("write failed"); return base(sql, values); });
    await expect(writeExperimentComparisonV1({ researchInvestigationId: "investigation", correlationId: "test", sources: f.sources }, f.database)).rejects.toThrow("write failed");
    expect(f.query.mock.calls.at(-1)![0]).toBe("rollback");
  });
});
