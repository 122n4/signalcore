import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InvestingAuthorityDatabase,
  InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import {
  resolveAuthorizedResearchValidationAssessmentProtocolCreateContext,
  resolveAuthorizedResearchValidationAssessmentResultFinalizeContext,
} from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import {
  canonicalJsonlArtifactBytesV1,
  artifactDescriptorV1,
  hashResultV1,
  type ResultHashPayloadV1,
  type ResearchArtifactDescriptorV1,
} from "../lib/investing/research/resultArtifacts";
import {
  hashRefV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";
import {
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "../lib/investing/research/validationProtocol";
import {
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "../lib/investing/research/validationAggregate";
import {
  hashValidationChildResultV1,
  hashValidationRunInputV1,
  type ValidationChildResultHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "../lib/investing/research/validationExecution";
import {
  hashValidationAssessmentProtocolV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../lib/investing/research/validationAssessment";
import {
  createValidationAssessmentProtocolV1,
  finalizeValidationAssessmentResultV1,
} from "../lib/investing/research/validationAssessmentWriter";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const ids = {
  principal: "11111111-1111-4111-8111-11111111a3d1",
  tenant: "22222222-2222-4222-8222-22222222a3d1",
  membership: "33333333-3333-4333-8333-33333333a3d1",
  investigation: "44444444-4444-4444-8444-44444444a3d1",
  experiment: "55555555-5555-4555-8555-55555555a3d1",
  validationProtocol: "66666666-6666-4666-8666-66666666a3d1",
  validationResult: "77777777-7777-4777-8777-77777777a3d1",
  assessmentProtocol: "88888888-8888-4888-8888-88888888a3d1",
  assessmentResult: "99999999-9999-4999-8999-99999999a3d1",
} as const;

function ref(domain: HashRefV1["hashDomain"], char: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: char.repeat(64).slice(0, 64).toUpperCase(),
  });
}

const subjectExperiment = ref("SYNTRAKE:EXPERIMENT:V1", "A");
const subjectResearchIr = ref("SYNTRAKE:RESEARCH_IR:V1", "B");
const sourceSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "C");
const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "D");
const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", "E");

const validationProtocol: ValidationProtocolHashPayloadV1 = {
  schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
  methodology: "VALIDATION_METHODOLOGY_V1",
  boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V2",
  missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
  sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
  subjectExperiment,
  subjectResearchIr,
  sourceDatasetSnapshot: sourceSnapshot,
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260926",
  metricRegistryVersion: "METRIC_REGISTRY_V20260927",
  metricRequestSet,
  executionConfig,
  validationMode: "IS_OOS_SPLIT",
  folds: [{
    ordinal: "0",
    trainingWindow: { startDate: "2026-01-02", endDate: "2026-01-30" },
    evaluationWindow: { startDate: "2026-02-02", endDate: "2026-02-27" },
  }],
};
const validationProtocolHash = hashValidationProtocolV1(validationProtocol);
const validationProtocolRef = hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: validationProtocolHash,
});

function metricRecord(value = "0.1") {
  return {
    metricId: "TOTAL_RETURN",
    metricVersion: "METRIC_V2",
    registryVersion: "METRIC_REGISTRY_V20260927",
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252",
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
    status: "AVAILABLE",
    value,
  } as const;
}

const aggregateMetricBytes = canonicalJsonlArtifactBytesV1([metricRecord()]);
const aggregateMetricDescriptor = artifactDescriptorV1("METRIC_RESULT_SET_V2", aggregateMetricBytes, 1);

function genericDescriptor(schema: string): ResearchArtifactDescriptorV1 {
  return artifactDescriptorV1(schema, canonicalJsonlArtifactBytesV1([{ ok: true }]), 1);
}

const traceDescriptor = genericDescriptor("RESEARCH_EXECUTION_TRACE_V2");
const valuationDescriptor = genericDescriptor("RESEARCH_VALUATION_SERIES_V2");
const benchmarkDescriptor = genericDescriptor("RESEARCH_BENCHMARK_SERIES_V2");

function runInput(phase: "TRAINING" | "EVALUATION"): ValidationRunInputHashPayloadV1 {
  const window = phase === "TRAINING"
    ? validationProtocol.folds[0]!.trainingWindow
    : validationProtocol.folds[0]!.evaluationWindow;
  return {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: validationProtocolRef,
    subjectExperiment,
    subjectResearchIr,
    phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", phase === "TRAINING" ? "F" : "1"),
    sourceDatasetSnapshot: sourceSnapshot,
    phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", phase === "TRAINING" ? "2" : "3"),
    foldOrdinal: "0",
    phase,
    phaseWindow: window,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    metricRequestSet,
    executionConfig,
  };
}

function childResult(
  input: ValidationRunInputHashPayloadV1,
  metricDescriptor: ResearchArtifactDescriptorV1,
): ValidationChildResultHashPayloadV1 {
  const runInputHash = hashValidationRunInputV1(input);
  return {
    schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1",
    validationRunInput: hashRefV1({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: runInputHash,
    }),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
    valuationCurrency: "USD",
    testPeriod: input.phaseWindow,
    startingNav: "100000.000000000000000000000000",
    endingNav: "110000.000000000000000000000000",
    terminalCash: "110000.000000000000000000000000",
    executionTrace: traceDescriptor,
    valuationSeries: valuationDescriptor,
    metricResultSet: metricDescriptor,
    benchmark: benchmarkDescriptor,
  };
}

const trainingRunInput = runInput("TRAINING");
const evaluationRunInput = runInput("EVALUATION");
const trainingMetricBytes = canonicalJsonlArtifactBytesV1([metricRecord("0.07")]);
const evaluationMetricBytes = canonicalJsonlArtifactBytesV1([metricRecord("0.08")]);
const trainingMetricDescriptor = artifactDescriptorV1("METRIC_RESULT_SET_V2", trainingMetricBytes, 1);
const evaluationMetricDescriptor = artifactDescriptorV1("METRIC_RESULT_SET_V2", evaluationMetricBytes, 1);
const trainingChild = childResult(trainingRunInput, trainingMetricDescriptor);
const evaluationChild = childResult(evaluationRunInput, evaluationMetricDescriptor);

const trainingRunInputHash = hashValidationRunInputV1(trainingRunInput);
const evaluationRunInputHash = hashValidationRunInputV1(evaluationRunInput);
const trainingChildHash = hashValidationChildResultV1(trainingChild);
const evaluationChildHash = hashValidationChildResultV1(evaluationChild);

const validationResult: ValidationResultHashPayloadV1 = {
  schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
  methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
  validationProtocol: validationProtocolRef,
  subjectExperiment,
  validationMode: validationProtocol.validationMode,
  folds: [{
    ordinal: "0",
    trainingRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", trainingRunInputHash),
    trainingChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", trainingChildHash),
    evaluationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", evaluationRunInputHash),
    evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", evaluationChildHash),
  }],
};
const validationResultHash = hashValidationResultV1(validationResult);

const baseResultPayload: ResultHashPayloadV1 = {
  schemaVersion: "RESULT_HASH_PAYLOAD_V1",
  runInput: ref("SYNTRAKE:RUN_INPUT:V1", "4"),
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "ENGINE_V20260926",
  executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
  valuationCurrency: "USD",
  testPeriod: { startDate: "2026-01-02", endDate: "2026-02-27" },
  startingNav: "100000.000000000000000000000000",
  endingNav: "110000.000000000000000000000000",
  terminalCash: "110000.000000000000000000000000",
  executionTrace: traceDescriptor,
  valuationSeries: valuationDescriptor,
  metricResultSet: aggregateMetricDescriptor,
  benchmark: benchmarkDescriptor,
};
const baseResultHash = hashResultV1(baseResultPayload);

function requirement(): ValidationAssessmentEvidenceRequirementV1 {
  return {
    requirementId: "PRIMARY_METRIC_EVIDENCE",
    artifactClass: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    sourceLineage: {
      validationProtocol: validationProtocolRef,
      subjectExperiment,
      subjectResearchIr,
      observationScope: { kind: "AGGREGATE" },
      artifactOwnerClass: "EXECUTION_RESULT",
    },
    metricIdentity: { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" },
    cardinality: "EXACTLY_ONE",
    missingEvidencePolicy: "MISSING_IS_INSUFFICIENT_EVIDENCE",
  };
}

function assessmentProtocol(threshold = "0.05"): ValidationAssessmentProtocolV1 {
  const req = requirement();
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol: validationProtocolRef,
    subjectExperiment,
    subjectResearchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria: [{
      criterionId: "TOTAL_RETURN_MINIMUM",
      criterionVersion: "CRITERION_V1",
      required: true,
      metricId: "TOTAL_RETURN",
      metricVersion: "METRIC_V2",
      evidenceSource: "METRIC_RESULT_SET_DESCRIPTOR_V2",
      observationScope: { kind: "AGGREGATE" },
      observationAggregation: "SINGLE_OBSERVATION",
      operator: "GTE",
      threshold: { kind: "SCALAR", value: { kind: "RATIO", value: threshold } },
      unavailablePolicy: "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE",
      evidenceRequirements: [req],
    }],
    requiredEvidenceRequirements: [req],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
}

class AuthorityClient implements InvestingAuthorityTransactionClient {
  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql === "begin" || sql === "commit" || sql === "rollback" || sql.startsWith("select set_config(")) {
      return { rows: [] as Row[], rowCount: null };
    }
    if (sql.startsWith("select current_setting(")) return { rows: [{} as Row], rowCount: 1 };
    if (sql.includes("from investing.principals")) {
      return { rows: [{ principal_id: ids.principal, state: "ACTIVE" } as Row], rowCount: 1 };
    }
    if (sql.includes("from investing.research_validation_protocols_scientific_identities")) {
      return {
        rows: [{
          research_investigation_id: ids.investigation,
          research_validation_protocol_identity_id: ids.validationProtocol,
          research_experiment_id: ids.experiment,
          tenant_id: ids.tenant,
          principal_id: ids.principal,
          tenant_membership_id: ids.membership,
          operation_scope: "TENANT_SCOPE",
          source_context: "PURE_RESEARCH",
        } as Row],
        rowCount: 1,
      };
    }
    if (sql.includes("from investing.tenants")) {
      return { rows: [{ tenant_id: ids.tenant, state: "ACTIVE" } as Row], rowCount: 1 };
    }
    if (sql.includes("from investing.tenant_memberships")) {
      return {
        rows: [{
          tenant_membership_id: ids.membership,
          tenant_id: ids.tenant,
          principal_id: ids.principal,
          state: "ACTIVE",
        } as Row],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected authority query: ${text} / ${JSON.stringify(values)}`);
  }
  release() {}
}

type AssessmentProtocolRow = {
  research_validation_assessment_protocol_identity_id: string;
  research_validation_protocol_identity_id: string;
  research_investigation_id: string;
  research_experiment_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  validation_protocol_hash_hex: string;
  subject_experiment_hash_hex: string;
  subject_research_ir_hash_hex: string;
  metric_registry_version: string;
  assessment_methodology: string;
  hash_hex: string;
  canonical_payload: unknown;
};

type AssessmentResultRow = {
  research_validation_assessment_result_identity_id: string;
  hash_hex: string;
  outcome: "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
  canonical_payload: unknown;
};

class WriterClient implements InvestingAuthorityTransactionClient {
  assessmentProtocolRow: AssessmentProtocolRow | null = null;
  assessmentResultRow: AssessmentResultRow | null = null;
  registered = false;
  tamperBaseMetricDescriptor = false;

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      sql === "begin" ||
      sql === "commit" ||
      sql === "rollback" ||
      sql.startsWith("select set_config(") ||
      sql.startsWith("select pg_advisory_xact_lock(")
    ) {
      return { rows: [] as Row[], rowCount: null };
    }

    if (
      sql.includes("from investing.research_validation_protocols_scientific_identities") &&
      sql.includes("where research_validation_protocol_identity_id = $1")
    ) {
      return {
        rows: [{
          research_validation_protocol_identity_id: ids.validationProtocol,
          research_investigation_id: ids.investigation,
          research_experiment_id: ids.experiment,
          tenant_id: ids.tenant,
          principal_id: ids.principal,
          tenant_membership_id: ids.membership,
          hash_hex: validationProtocolHash,
          canonical_payload: validationProtocol,
        } as Row],
        rowCount: 1,
      };
    }

    if (
      sql.includes("from investing.research_validation_assessment_protocols_scientific_identities") &&
      sql.includes("where research_validation_protocol_identity_id = $1")
    ) {
      return {
        rows: this.assessmentProtocolRow ? [this.assessmentProtocolRow as Row] : [],
        rowCount: this.assessmentProtocolRow ? 1 : 0,
      };
    }

    if (sql.startsWith("select exists (") && sql.includes("event_type = 'registered'")) {
      return { rows: [{ exists: this.registered } as Row], rowCount: 1 };
    }

    if (sql.startsWith("insert into investing.research_validation_assessment_protocols_scientific_identities")) {
      if (!this.assessmentProtocolRow) {
        this.assessmentProtocolRow = {
          research_validation_assessment_protocol_identity_id: values[0] as string,
          tenant_id: values[1] as string,
          principal_id: values[2] as string,
          tenant_membership_id: values[3] as string,
          research_investigation_id: values[4] as string,
          research_validation_protocol_identity_id: values[5] as string,
          research_experiment_id: values[6] as string,
          validation_protocol_hash_hex: values[7] as string,
          subject_experiment_hash_hex: values[8] as string,
          subject_research_ir_hash_hex: values[9] as string,
          metric_registry_version: values[10] as string,
          assessment_methodology: values[11] as string,
          hash_hex: values[12] as string,
          canonical_payload: JSON.parse(values[13] as string),
        };
      }
      return { rows: [] as Row[], rowCount: 1 };
    }

    if (sql.includes("from investing.research_validation_results_scientific_identities")) {
      return {
        rows: [{
          research_validation_result_identity_id: ids.validationResult,
          research_validation_protocol_identity_id: ids.validationProtocol,
          research_investigation_id: ids.investigation,
          research_experiment_id: ids.experiment,
          tenant_id: ids.tenant,
          principal_id: ids.principal,
          tenant_membership_id: ids.membership,
          hash_hex: validationResultHash,
          canonical_payload: validationResult,
        } as Row],
        rowCount: 1,
      };
    }

    if (
      sql.includes("from investing.research_validation_child_results_scientific_identities c") &&
      sql.includes("join investing.research_validation_run_inputs_scientific_identities ri")
    ) {
      return {
        rows: [
          childMetricRow(trainingRunInput, trainingChild, trainingMetricDescriptor, trainingMetricBytes),
          childMetricRow(evaluationRunInput, evaluationChild, evaluationMetricDescriptor, evaluationMetricBytes),
        ] as Row[],
        rowCount: 2,
      };
    }

    if (
      sql.includes("from investing.research_results_scientific_identities res") &&
      sql.includes("join investing.run_inputs_scientific_identities ri")
    ) {
      const descriptor = this.tamperBaseMetricDescriptor
        ? { ...aggregateMetricDescriptor, contentSha256: "F".repeat(64) }
        : aggregateMetricDescriptor;
      return {
        rows: [{
          result_identity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa3d1",
          result_hash_hex: baseResultHash,
          result_payload: baseResultPayload,
          artifact_schema_version: descriptor.artifactSchemaVersion,
          artifact_format: descriptor.format,
          content_sha256: descriptor.contentSha256,
          content_byte_length: descriptor.contentByteLength,
          record_count: descriptor.recordCount,
          content: aggregateMetricBytes,
        } as Row],
        rowCount: 1,
      };
    }

    if (sql.includes("from investing.research_evidence_objects_scientific_identities")) {
      return { rows: [] as Row[], rowCount: 0 };
    }

    if (
      sql.includes("from investing.research_validation_assessment_results_scientific_identities") &&
      sql.includes("where research_validation_assessment_protocol_identity_id = $1")
    ) {
      return {
        rows: this.assessmentResultRow ? [this.assessmentResultRow as Row] : [],
        rowCount: this.assessmentResultRow ? 1 : 0,
      };
    }

    if (sql.startsWith("insert into investing.research_validation_assessment_results_scientific_identities")) {
      if (!this.assessmentResultRow) {
        this.assessmentResultRow = {
          research_validation_assessment_result_identity_id: values[0] as string,
          hash_hex: values[16] as string,
          canonical_payload: JSON.parse(values[17] as string),
          outcome: values[15] as AssessmentResultRow["outcome"],
        };
      }
      return { rows: [] as Row[], rowCount: 1 };
    }

    throw new Error(`Unexpected writer query: ${text} / ${JSON.stringify(values)}`);
  }

  release() {}
}

function childMetricRow(
  runInputPayload: ValidationRunInputHashPayloadV1,
  childPayload: ValidationChildResultHashPayloadV1,
  descriptor: ResearchArtifactDescriptorV1,
  bytes: Buffer,
) {
  return {
    fold_ordinal: 0,
    phase: runInputPayload.phase,
    run_input_hash_hex: hashValidationRunInputV1(runInputPayload),
    run_input_payload: runInputPayload,
    child_result_hash_hex: hashValidationChildResultV1(childPayload),
    child_result_payload: childPayload,
    artifact_schema_version: descriptor.artifactSchemaVersion,
    artifact_format: descriptor.format,
    content_sha256: descriptor.contentSha256,
    content_byte_length: descriptor.contentByteLength,
    record_count: descriptor.recordCount,
    content_bytes: bytes,
  };
}

function databaseFor(client: InvestingAuthorityTransactionClient): InvestingAuthorityDatabase {
  return { connect: async () => client };
}

async function brandedContexts() {
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(new AuthorityClient()));
  const create = await resolveAuthorizedResearchValidationAssessmentProtocolCreateContext({
    researchInvestigationId: ids.investigation,
    researchValidationProtocolIdentityId: ids.validationProtocol,
    correlationId: "corr-rl3d-writer-create-0001",
  });
  expect(create.ok).toBe(true);
  if (!create.ok) throw new Error("create context unavailable");

  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(databaseFor(new AuthorityClient()));
  const finalize = await resolveAuthorizedResearchValidationAssessmentResultFinalizeContext({
    researchInvestigationId: ids.investigation,
    researchValidationProtocolIdentityId: ids.validationProtocol,
    correlationId: "corr-rl3d-writer-finalize-0001",
  });
  expect(finalize.ok).toBe(true);
  if (!finalize.ok) throw new Error("finalize context unavailable");

  return { create: create.context, finalize: finalize.context };
}

describe("I5 RL-3D Validation Assessment writer integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
      ok: true,
      externalProvider: "CLERK",
      externalSubject: "user_rl3d_writer",
    });
  });

  it("creates/replays the precommitted Assessment Protocol and rejects divergent retry", async () => {
    const contexts = await brandedContexts();
    const client = new WriterClient();
    const database = databaseFor(client);
    const protocol = assessmentProtocol();

    const created = await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol },
      database,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.replayed).toBe(false);
    expect(created.validationAssessmentProtocolHashHex).toBe(hashValidationAssessmentProtocolV1(protocol));

    const replayed = await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol },
      database,
    );
    expect(replayed).toMatchObject({
      ok: true,
      replayed: true,
      researchValidationAssessmentProtocolIdentityId: created.researchValidationAssessmentProtocolIdentityId,
    });

    const divergent = await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol: assessmentProtocol("0.06") },
      database,
    );
    expect(divergent).toEqual({ ok: false, code: "DIVERGENT_ASSESSMENT_PROTOCOL" });
  });

  it("rejects first Assessment Protocol after Validation registration", async () => {
    const contexts = await brandedContexts();
    const client = new WriterClient();
    client.registered = true;
    const result = await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol: assessmentProtocol() },
      databaseFor(client),
    );
    expect(result).toEqual({ ok: false, code: "ASSESSMENT_PROTOCOL_TOO_LATE" });
  });

  it("finalizes/replays PASS only from persisted predecessor evidence and fails on descriptor drift", async () => {
    const contexts = await brandedContexts();
    const client = new WriterClient();
    const database = databaseFor(client);
    const protocol = assessmentProtocol();

    const created = await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol },
      database,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const finalized = await finalizeValidationAssessmentResultV1(
      { authorizedContext: contexts.finalize },
      database,
    );
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.replayed).toBe(false);
    expect(finalized.outcome).toBe("PASS");

    const replayed = await finalizeValidationAssessmentResultV1(
      { authorizedContext: contexts.finalize },
      database,
    );
    expect(replayed).toMatchObject({
      ok: true,
      replayed: true,
      researchValidationAssessmentResultIdentityId: finalized.researchValidationAssessmentResultIdentityId,
      validationAssessmentResultHashHex: finalized.validationAssessmentResultHashHex,
      outcome: "PASS",
    });

    const driftClient = new WriterClient();
    await createValidationAssessmentProtocolV1(
      { authorizedContext: contexts.create, protocol },
      databaseFor(driftClient),
    );
    driftClient.tamperBaseMetricDescriptor = true;
    const drifted = await finalizeValidationAssessmentResultV1(
      { authorizedContext: contexts.finalize },
      databaseFor(driftClient),
    );
    expect(drifted).toEqual({ ok: false, code: "ASSESSMENT_EVIDENCE_INVALID" });
  });
});
