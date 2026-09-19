import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  type AuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  canonicalRunInputHashPayloadV1,
  type CanonicalJsonValue,
  type HashRefV1,
} from "./canonical";
import {
  canonicalDatasetSeriesHashPayloadV1,
  canonicalDatasetSnapshotHashPayloadV1,
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
} from "./executionMaterials";
import { hashExperimentV1 } from "./experiment";
import { admitScientificRunInputV1, admittedDatasetSeriesRefsV1, type ScientificRunInputCandidateV1 } from "./runInputScientific";
import { canonicalResearchSpecCandidatePayloadV1, canonicalResearchSpecHashPayloadV1, hashResearchSpecV1 } from "./semantic";

const operation = "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1";
const capability = "RESEARCH_MUTATE";

export type CreateScientificRunInputV1Input = Readonly<{
  authorizedContext: AuthorizedResearchMaterialRevisionCreateContext & { operation: typeof operation };
  researchExperimentId: string;
  candidate: ScientificRunInputCandidateV1;
}>;

export type ScientificRunInputCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  researchInvestigationId: string;
  researchExperimentId: string;
  researchSpecRevisionId: string;
  runInputHashHex: string;
}>;

export type ScientificRunInputCreateFailureCode =
  | "VALIDATION_ERROR"
  | "UNAVAILABLE"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ScientificRunInputCreateFailure = Readonly<{ ok: false; code: ScientificRunInputCreateFailureCode }>;
export type ScientificRunInputCreateResult = ScientificRunInputCreateSuccess | ScientificRunInputCreateFailure;

type Prepared = {
  admittedRunInput: HashRefV1;
  datasetSeriesRefs: readonly HashRefV1[];
  hashes: {
    researchSpec: string;
    researchIr: string;
    experiment: string;
    datasetSnapshot: string;
    metricRequestSet: string;
    executionConfig: string;
    runInput: string;
  };
  metricRegistryVersion: string;
  engineVersion: string;
  payloadJson: {
    datasetSeries: readonly string[];
    datasetSnapshot: string;
    metricRequestSet: string;
    executionConfig: string;
    researchSpec: string;
    runInput: string;
  };
};

type ExperimentRow = {
  research_experiment_id: string;
  research_investigation_id: string;
  research_spec_revision_id: string;
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  operation_scope: "TENANT_SCOPE";
  source_context: "PURE_RESEARCH";
  research_ir_hash_hex: string;
  experiment_hash_hex: string;
};

type SpecRow = {
  research_spec_revision_id: string;
};

const transactionContextKeys = [
  "syntrake.investing.operation",
  "syntrake.investing.capability",
  "syntrake.investing.operation_scope",
  "syntrake.investing.source_context",
  "syntrake.investing.tenant_id",
  "syntrake.investing.principal_id",
  "syntrake.investing.tenant_membership_id",
  "syntrake.investing.account_id",
  "syntrake.investing.account_access_id",
  "syntrake.investing.research_ir_hash_hex",
  "syntrake.investing.experiment_hash_hex",
  "syntrake.investing.dataset_series_hash_hex",
  "syntrake.investing.dataset_snapshot_hash_hex",
  "syntrake.investing.metric_registry_version",
  "syntrake.investing.metric_request_set_hash_hex",
  "syntrake.investing.engine_version",
  "syntrake.investing.execution_config_hash_hex",
  "syntrake.investing.research_spec_hash_hex",
  "syntrake.investing.run_input_hash_hex",
] as const;

export async function createScientificRunInputV1(
  input: CreateScientificRunInputV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ScientificRunInputCreateResult> {
  if (!isAuthorizedResearchMaterialRevisionCreateContext(input.authorizedContext)) return fail("VALIDATION_ERROR");
  if (input.authorizedContext.operation !== operation) return fail("VALIDATION_ERROR");
  if (input.authorizedContext.operationScope !== "TENANT_SCOPE" || input.authorizedContext.sourceContext !== "PURE_RESEARCH") {
    return fail("VALIDATION_ERROR");
  }
  const prepared = prepare(input.candidate);
  if (!prepared) return fail("VALIDATION_ERROR");

  try {
    const database = getInvestingAuthorityDatabase(env);
    return await withTransaction(database.connect(), async (client) => {
      if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
      await setTransactionContext(client, input.authorizedContext, prepared);
      const experiment = await loadExperiment(client, input);
      if (experiment.ok === false) return experiment;
      const lineage = await verifyOperationalLineage(client, input, prepared, experiment.row);
      if (lineage.ok === false) return lineage;

      await persistDatasetSeries(client, input, prepared);
      await persistIdentity(client, "dataset_snapshots_scientific_identities", "dataset_snapshot_identity_id", input, {
        domain: "SYNTRAKE:DATASET_SNAPSHOT:V1",
        hashHex: prepared.hashes.datasetSnapshot,
        payloadJson: prepared.payloadJson.datasetSnapshot,
      });
      await persistIdentity(client, "metric_request_sets_scientific_identities", "metric_request_set_identity_id", input, {
        domain: "SYNTRAKE:METRIC_REQUEST_SET:V1",
        hashHex: prepared.hashes.metricRequestSet,
        payloadJson: prepared.payloadJson.metricRequestSet,
        metricRegistryVersion: input.candidate.metricRequestSet.metricRegistryVersion,
      });
      await persistIdentity(client, "execution_configs_scientific_identities", "execution_config_identity_id", input, {
        domain: "SYNTRAKE:EXECUTION_CONFIG:V1",
        hashHex: prepared.hashes.executionConfig,
        payloadJson: prepared.payloadJson.executionConfig,
        engineVersion: input.candidate.executionConfig.engineCompatibilityVersion,
      });
      await persistResearchSpec(client, input, prepared, experiment.row.research_spec_revision_id);
      await persistRunInput(client, input, prepared, experiment.row.research_spec_revision_id);
      return {
        ok: true,
        replayed: false,
        researchInvestigationId: input.authorizedContext.researchInvestigationId,
        researchExperimentId: input.researchExperimentId,
        researchSpecRevisionId: experiment.row.research_spec_revision_id,
        runInputHashHex: prepared.admittedRunInput.hashHex,
      };
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepare(candidate: ScientificRunInputCandidateV1): Prepared | null {
  try {
    const admitted = admitScientificRunInputV1(candidate).runInputHash;
    const datasetSeriesRefs = admittedDatasetSeriesRefsV1(candidate);
    return {
      admittedRunInput: admitted,
      datasetSeriesRefs,
      hashes: {
        researchSpec: hashResearchSpecV1(candidate.researchSpec),
        researchIr: candidate.runInput.researchIr.hashHex,
        experiment: hashExperimentV1(candidate.experiment),
        datasetSnapshot: hashDatasetSnapshotV1(candidate.datasetSnapshot),
        metricRequestSet: hashMetricRequestSetV1(candidate.metricRequestSet),
        executionConfig: hashExecutionConfigV1(candidate.executionConfig),
        runInput: admitted.hashHex,
      },
      payloadJson: {
        datasetSeries: candidate.datasetSeries.map((payload) => canonicalJson(canonicalDatasetSeriesHashPayloadV1(payload))),
        datasetSnapshot: canonicalJson(canonicalDatasetSnapshotHashPayloadV1(candidate.datasetSnapshot)),
        metricRequestSet: canonicalJson(canonicalMetricRequestSetHashPayloadV1(candidate.metricRequestSet)),
        executionConfig: canonicalJson(canonicalExecutionConfigHashPayloadV1(candidate.executionConfig)),
        researchSpec: canonicalJson(canonicalResearchSpecHashPayloadV1(candidate.researchSpec) as CanonicalJsonValue),
        runInput: canonicalJson(canonicalRunInputHashPayloadV1(candidate.runInput)),
      },
      metricRegistryVersion: candidate.metricRequestSet.metricRegistryVersion,
      engineVersion: candidate.executionConfig.engineCompatibilityVersion,
    };
  } catch {
    return null;
  }
}

async function loadExperiment(client: InvestingAuthorityTransactionClient, input: CreateScientificRunInputV1Input) {
  return exactlyOne(
    client.query<ExperimentRow>(
      [
        "select research_experiment_id, research_investigation_id, research_spec_revision_id, tenant_id, principal_id,",
        "tenant_membership_id, operation_scope, source_context, research_ir_hash_hex, experiment_hash_hex",
        "from investing.research_experiments",
        "where research_experiment_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        "and principal_id = $4 and tenant_membership_id = $5 and account_id is null",
      ].join(" "),
      [
        input.researchExperimentId,
        input.authorizedContext.researchInvestigationId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
      ],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
}

async function verifyOperationalLineage(
  client: InvestingAuthorityTransactionClient,
  input: CreateScientificRunInputV1Input,
  prepared: Prepared,
  experiment: ExperimentRow,
) {
  if (experiment.operation_scope !== "TENANT_SCOPE" || experiment.source_context !== "PURE_RESEARCH") return fail("CONFLICT");
  if (experiment.research_ir_hash_hex !== prepared.hashes.researchIr) return fail("CONFLICT");
  if (experiment.experiment_hash_hex !== prepared.hashes.experiment) return fail("CONFLICT");
  if (experiment.research_spec_revision_id !== input.candidate.experiment.researchSpecRevisionId) return fail("CONFLICT");
  return exactlyOne(
    client.query<SpecRow>(
      [
        "select research_spec_revision_id from investing.research_spec_revisions",
        "where research_spec_revision_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        "and principal_id = $4 and tenant_membership_id = $5 and account_id is null",
        "and canonical_candidate = $6::jsonb",
      ].join(" "),
      [
        experiment.research_spec_revision_id,
        input.authorizedContext.researchInvestigationId,
        input.authorizedContext.tenantId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
        canonicalJson(canonicalResearchSpecCandidatePayloadV1(input.candidate.researchSpec)),
      ],
    ),
    "CONFLICT",
  );
}

async function persistDatasetSeries(client: InvestingAuthorityTransactionClient, input: CreateScientificRunInputV1Input, prepared: Prepared) {
  for (let index = 0; index < prepared.datasetSeriesRefs.length; index += 1) {
    const ref = prepared.datasetSeriesRefs[index]!;
    await setConfig(client, "dataset_series_hash_hex", ref.hashHex);
    await persistIdentity(client, "dataset_series_scientific_identities", "dataset_series_identity_id", input, {
      domain: "SYNTRAKE:DATASET_SERIES:V1",
      hashHex: ref.hashHex,
      payloadJson: prepared.payloadJson.datasetSeries[index]!,
    });
  }
}

async function persistResearchSpec(
  client: InvestingAuthorityTransactionClient,
  input: CreateScientificRunInputV1Input,
  prepared: Prepared,
  researchSpecRevisionId: string,
) {
  await client.query(
    [
      "insert into investing.research_specs_scientific_identities (",
      "research_spec_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,",
      "research_spec_revision_id, source_draft_hash_hex, hypothesis_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
      ") values ($1,$2,$3,$4,$5,$6,'TENANT_SCOPE','PURE_RESEARCH',$7,$8,$9,'SHA-256','SYNTRAKE:RESEARCH_SPEC:V1','SYNTRAKE_SHA256_V1',$10,$11::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [
      randomUUID(),
      input.authorizedContext.tenantId,
      input.authorizedContext.principalId,
      input.authorizedContext.tenantMembershipId,
      operation,
      capability,
      researchSpecRevisionId,
      input.candidate.researchSpec.sourceDraft.ref.hashHex,
      input.candidate.researchSpec.hypothesisBinding.kind === "EXPLICIT_HYPOTHESIS" ? input.candidate.researchSpec.hypothesisBinding.hypothesis.ref.hashHex : null,
      prepared.hashes.researchSpec,
      prepared.payloadJson.researchSpec,
    ],
  );
}

async function persistRunInput(
  client: InvestingAuthorityTransactionClient,
  input: CreateScientificRunInputV1Input,
  prepared: Prepared,
  researchSpecRevisionId: string,
) {
  await client.query(
    [
      "insert into investing.run_inputs_scientific_identities (",
      "run_input_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,",
      "operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,",
      "metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
      ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'TENANT_SCOPE','PURE_RESEARCH',$10,$11,$12,$13,$14,$15,$16,$17,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$18,$19::jsonb)",
      "on conflict do nothing",
    ].join(" "),
    [
      randomUUID(),
      input.authorizedContext.tenantId,
      input.authorizedContext.principalId,
      input.authorizedContext.tenantMembershipId,
      input.authorizedContext.researchInvestigationId,
      input.researchExperimentId,
      researchSpecRevisionId,
      operation,
      capability,
      prepared.hashes.researchSpec,
      prepared.hashes.researchIr,
      prepared.hashes.experiment,
      prepared.hashes.datasetSnapshot,
      prepared.metricRegistryVersion,
      prepared.hashes.metricRequestSet,
      prepared.engineVersion,
      prepared.hashes.executionConfig,
      prepared.hashes.runInput,
      prepared.payloadJson.runInput,
    ],
  );
}

async function persistIdentity(
  client: InvestingAuthorityTransactionClient,
  table: string,
  idColumn: string,
  input: CreateScientificRunInputV1Input,
  identity: { domain: string; hashHex: string; payloadJson: string; metricRegistryVersion?: string; engineVersion?: string },
) {
  const extraColumns = identity.metricRegistryVersion ? ", metric_registry_version" : identity.engineVersion ? ", engine_compatibility_version" : "";
  const extraValues = identity.metricRegistryVersion ? ", $10" : identity.engineVersion ? ", $10" : "";
  await client.query(
    [
      `insert into investing.${table} (`,
      `${idColumn}, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,`,
      `hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload${extraColumns}`,
      `) values ($1,$2,$3,$4,$5,$6,'TENANT_SCOPE','PURE_RESEARCH','SHA-256',$7,'SYNTRAKE_SHA256_V1',$8,$9::jsonb${extraValues})`,
      "on conflict do nothing",
    ].join(" "),
    [
      randomUUID(),
      input.authorizedContext.tenantId,
      input.authorizedContext.principalId,
      input.authorizedContext.tenantMembershipId,
      operation,
      capability,
      identity.domain,
      identity.hashHex,
      identity.payloadJson,
      identity.metricRegistryVersion ?? identity.engineVersion,
    ],
  );
}

async function withTransaction(
  connection: Promise<InvestingAuthorityTransactionClient>,
  work: (client: InvestingAuthorityTransactionClient) => Promise<ScientificRunInputCreateResult & { destroyClient?: boolean }>,
): Promise<ScientificRunInputCreateResult> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;
  try {
    client = await connection;
    await client.query("begin");
    const result = await work(client);
    destroyClient = result.ok === false && result.destroyClient === true;
    if (result.ok) await client.query("commit");
    else await client.query("rollback");
    return result;
  } catch {
    if (client) await client.query("rollback").catch(() => { destroyClient = true; });
    return fail("INTERNAL_ERROR");
  } finally {
    if (client) await client.release(destroyClient);
  }
}

async function setTransactionContext(client: InvestingAuthorityTransactionClient, context: AuthorizedResearchMaterialRevisionCreateContext, prepared: Prepared) {
  const values: Record<string, string> = {
    operation,
    capability,
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    tenant_id: context.tenantId,
    principal_id: context.principalId,
    tenant_membership_id: context.tenantMembershipId,
    research_ir_hash_hex: prepared.hashes.researchIr,
    experiment_hash_hex: prepared.hashes.experiment,
    dataset_snapshot_hash_hex: prepared.hashes.datasetSnapshot,
    metric_registry_version: prepared.metricRegistryVersion,
    metric_request_set_hash_hex: prepared.hashes.metricRequestSet,
    engine_version: prepared.engineVersion,
    execution_config_hash_hex: prepared.hashes.executionConfig,
    research_spec_hash_hex: prepared.hashes.researchSpec,
    run_input_hash_hex: prepared.hashes.runInput,
  };
  for (const [key, value] of Object.entries(values)) await setConfig(client, key, value);
}

async function setConfig(client: InvestingAuthorityTransactionClient, key: string, value: string) {
  await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function hasStaleTransactionContext(client: InvestingAuthorityTransactionClient) {
  const result = await client.query<Record<string, string | null>>(
    `select ${transactionContextKeys.map((key, index) => `current_setting('${key}', true) as c${index}`).join(", ")}`,
  );
  return Object.values(result.rows[0] ?? {}).some((value) => value !== null && value !== "");
}

async function exactlyOne<Row>(
  query: Promise<{ rows: Row[] }>,
  emptyCode: ScientificRunInputCreateFailureCode,
): Promise<{ ok: true; row: Row } | ScientificRunInputCreateFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function canonicalJson(value: CanonicalJsonValue) {
  return JSON.stringify(value);
}

function fail(code: ScientificRunInputCreateFailureCode): ScientificRunInputCreateFailure {
  return { ok: false, code };
}
