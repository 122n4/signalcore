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
  hashDatasetSeriesV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  type DatasetSeriesHashPayloadV1,
} from "./executionMaterials";
import { hashExperimentV1 } from "./experiment";
import { admitScientificRunInputV1, type ScientificRunInputCandidateV1 } from "./runInputScientific";
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
  datasetSeries: readonly DatasetSeriesPair[];
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
    datasetSnapshot: string;
    metricRequestSet: string;
    executionConfig: string;
    researchSpec: string;
    runInput: string;
  };
};

type DatasetSeriesPair = Readonly<{
  ref: HashRefV1;
  canonicalPayload: CanonicalJsonValue;
  canonicalPayloadJson: string;
}>;

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

type ExistingIdentityRow = {
  tenant_id: string;
  principal_id: string;
  tenant_membership_id: string;
  hash_algorithm: string;
  hash_domain: string;
  hash_version: string;
  hash_hex: string;
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

      const datasetSeries = await persistDatasetSeries(client, input, prepared);
      if (datasetSeries.ok === false) return datasetSeries;
      const datasetSnapshot = await persistIdentity(client, "dataset_snapshots_scientific_identities", "dataset_snapshot_identity_id", input, {
        domain: "SYNTRAKE:DATASET_SNAPSHOT:V1",
        hashHex: prepared.hashes.datasetSnapshot,
        payloadJson: prepared.payloadJson.datasetSnapshot,
      });
      if (datasetSnapshot.ok === false) return datasetSnapshot;
      const metricRequestSet = await persistIdentity(client, "metric_request_sets_scientific_identities", "metric_request_set_identity_id", input, {
        domain: "SYNTRAKE:METRIC_REQUEST_SET:V1",
        hashHex: prepared.hashes.metricRequestSet,
        payloadJson: prepared.payloadJson.metricRequestSet,
        metricRegistryVersion: prepared.metricRegistryVersion,
      });
      if (metricRequestSet.ok === false) return metricRequestSet;
      const executionConfig = await persistIdentity(client, "execution_configs_scientific_identities", "execution_config_identity_id", input, {
        domain: "SYNTRAKE:EXECUTION_CONFIG:V1",
        hashHex: prepared.hashes.executionConfig,
        payloadJson: prepared.payloadJson.executionConfig,
        engineVersion: prepared.engineVersion,
      });
      if (executionConfig.ok === false) return executionConfig;
      const researchSpec = await persistResearchSpec(client, input, prepared, experiment.row.research_spec_revision_id);
      if (researchSpec.ok === false) return researchSpec;
      const runInput = await persistRunInput(client, input, prepared, experiment.row.research_spec_revision_id);
      if (runInput.ok === false) return runInput;
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
    const datasetSeries = canonicalDatasetSeriesPairs(candidate.datasetSeries);
    return {
      admittedRunInput: admitted,
      datasetSeries,
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
  for (const pair of prepared.datasetSeries) {
    const ref = pair.ref;
    await setConfig(client, "dataset_series_hash_hex", ref.hashHex);
    const result = await persistIdentity(client, "dataset_series_scientific_identities", "dataset_series_identity_id", input, {
      domain: "SYNTRAKE:DATASET_SERIES:V1",
      hashHex: ref.hashHex,
      payloadJson: pair.canonicalPayloadJson,
    });
    if (result.ok === false) return result;
  }
  return { ok: true } as const;
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
  return verifyExistingIdentity(client, "research_specs_scientific_identities", input, {
    domain: "SYNTRAKE:RESEARCH_SPEC:V1",
    hashHex: prepared.hashes.researchSpec,
    payloadJson: prepared.payloadJson.researchSpec,
    researchSpecRevisionId,
  });
}

async function persistRunInput(
  client: InvestingAuthorityTransactionClient,
  input: CreateScientificRunInputV1Input,
  prepared: Prepared,
  researchSpecRevisionId: string,
) {
  const result = await client.query<{ run_input_identity_id: string }>(
    [
      "insert into investing.run_inputs_scientific_identities (",
      "run_input_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,",
      "operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,",
      "metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload",
      ") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'TENANT_SCOPE','PURE_RESEARCH',$10,$11,$12,$13,$14,$15,$16,$17,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$18,$19::jsonb)",
      "on conflict do nothing returning run_input_identity_id",
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
  if ((result.rowCount ?? result.rows.length) !== 1) return fail("CONFLICT");
  return { ok: true } as const;
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
  return verifyExistingIdentity(client, table, input, identity);
}

async function verifyExistingIdentity(
  client: InvestingAuthorityTransactionClient,
  table: string,
  input: CreateScientificRunInputV1Input,
  identity: { domain: string; hashHex: string; payloadJson: string; metricRegistryVersion?: string; engineVersion?: string; researchSpecRevisionId?: string },
) {
  const extraPredicates: string[] = [];
  const values = [input.authorizedContext.tenantId, identity.domain, identity.hashHex, identity.payloadJson];
  if (identity.metricRegistryVersion !== undefined) {
    values.push(identity.metricRegistryVersion);
    extraPredicates.push(`metric_registry_version = $${values.length}`);
  }
  if (identity.engineVersion !== undefined) {
    values.push(identity.engineVersion);
    extraPredicates.push(`engine_compatibility_version = $${values.length}`);
  }
  if (identity.researchSpecRevisionId !== undefined) {
    values.push(identity.researchSpecRevisionId);
    extraPredicates.push(`research_spec_revision_id = $${values.length}`);
  }
  const result = await client.query<ExistingIdentityRow>(
    [
      "select tenant_id, principal_id, tenant_membership_id, hash_algorithm, hash_domain, hash_version, hash_hex",
      `from investing.${table}`,
      "where tenant_id = $1 and hash_algorithm = 'SHA-256' and hash_domain = $2 and hash_version = 'SYNTRAKE_SHA256_V1' and hash_hex = $3",
      "and canonical_payload = $4::jsonb",
      ...extraPredicates.map((predicate) => `and ${predicate}`),
    ].join(" "),
    values,
  );
  if (result.rows.length !== 1) return fail("CONFLICT");
  const row = result.rows[0]!;
  if (
    row.tenant_id !== input.authorizedContext.tenantId ||
    row.principal_id !== input.authorizedContext.principalId ||
    row.tenant_membership_id !== input.authorizedContext.tenantMembershipId ||
    row.hash_algorithm !== "SHA-256" ||
    row.hash_domain !== identity.domain ||
    row.hash_version !== "SYNTRAKE_SHA256_V1" ||
    row.hash_hex !== identity.hashHex
  ) {
    return fail("CONFLICT");
  }
  return { ok: true } as const;
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

function canonicalDatasetSeriesPairs(series: readonly DatasetSeriesHashPayloadV1[]) {
  if (!Array.isArray(series) || series.length < 1) throw new Error("DatasetSeries payloads required");
  const pairs = series.map((payload) => {
    const canonicalPayload = canonicalDatasetSeriesHashPayloadV1(payload);
    const ref = {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:DATASET_SERIES:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: hashDatasetSeriesV1(payload),
    } as const;
    return { ref, canonicalPayload, canonicalPayloadJson: canonicalJson(canonicalPayload) };
  }).sort((left, right) => left.ref.hashHex < right.ref.hashHex ? -1 : left.ref.hashHex > right.ref.hashHex ? 1 : 0);
  for (let index = 1; index < pairs.length; index += 1) {
    if (pairs[index - 1]!.ref.hashHex === pairs[index]!.ref.hashHex) throw new Error("duplicate DatasetSeries payload");
  }
  return pairs;
}

function fail(code: ScientificRunInputCreateFailureCode): ScientificRunInputCreateFailure {
  return { ok: false, code };
}
