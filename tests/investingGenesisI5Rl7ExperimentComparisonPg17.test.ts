import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildGoldenFixture } from "./support/investingEngineV2GoldenFixture";
import { executeHistoricalBacktestV2 } from "../lib/investing/research/historicalExecutionEngineV2";
import { hashRefV1, hashRunInputV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { hashResultV1 } from "../lib/investing/research/resultArtifacts";
import { metricRegistryV2Requests } from "../lib/investing/research/researchMetrics";
import { hashMetricRequestSetV1 } from "../lib/investing/research/executionMaterials";
import { hashExperimentParametersV1 } from "../lib/investing/research/experimentParameters";
import { hashValidationRunInputV1, hashValidationChildResultV1 } from "../lib/investing/research/validationExecution";
import { hashValidationResultV1 } from "../lib/investing/research/validationAggregate";
import { hashExperimentComparisonProtocolV1 } from "../lib/investing/research/experimentComparison";
import { writeExperimentComparisonV1 } from "../lib/investing/research/experimentComparisonWriter";
import { i5ExperimentParametersCandidateV1, i5ExperimentResolvedResearchIrV1 } from "./support/investingI5ExperimentScientificFixtures";

const writerState = vi.hoisted(() => ({
  passport: null as any,
  context: null as any,
  artifacts: new Map<string, Buffer>(),
  validationBytes: new Map<string, Buffer>(),
  passportReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/research/researchPassportReader", () => ({
  readResearchPassportV1: async () => {
    writerState.passportReads += 1;
    return { ok: true, passport: writerState.passport };
  },
}));
vi.mock("../lib/investing/authority/context", () => ({
  isAuthorizedResearchPassportReadContext: (value: unknown) => value === writerState.context,
  resolveAuthorizedResearchPassportReadContext: async () => ({ ok: true, context: writerState.context }),
}));

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const migrations = [
  "supabase/migrations/20260825120000_investing_genesis_i2_authority_materialization.sql",
  "supabase/migrations/20260825123000_investing_genesis_i2_authorized_context.sql",
  "supabase/migrations/20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql",
  "supabase/migrations/20260831221500_investing_genesis_i2_ledger_schema.sql",
  "supabase/migrations/20260909100000_investing_i5_research_authority_audit_contract.sql",
  "supabase/migrations/20260910120000_investing_i5_a1_research_investigation_persistence.sql",
  "supabase/migrations/20260910130000_investing_i5_a2_research_draft_persistence.sql",
  "supabase/migrations/20260911110000_investing_i5_research_runtime_lock_contract_repair.sql",
  "supabase/migrations/20260912050000_investing_i5_a3_research_material_revisions.sql",
  "supabase/migrations/20260912070000_investing_i5_a4_research_spec_persistence.sql",
  "supabase/migrations/20260915150000_investing_i5_experiment_baseline_persistence.sql",
  "supabase/migrations/20260916194400_investing_i5_experiment_variant_persistence.sql",
  "supabase/migrations/20260917183000_investing_i5_experiment_scientific_closure.sql",
  "supabase/migrations/20260918170000_investing_i5_dataset_run_scientific_closure.sql",
  "supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql",
  "supabase/migrations/20260920090000_investing_i5_rl1_evidence_object_scientific_closure.sql",
  "supabase/migrations/20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql",
  "supabase/migrations/20260922192229_investing_i5_rl2_evidence_ledger_passport_read.sql",
  "supabase/migrations/20260923090000_investing_i5_rl3b_validation_child_execution.sql",
  "supabase/migrations/20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql",
  "supabase/migrations/20260925044248_investing_i5_rl3c_postapply_advisor_remediation.sql",
  "supabase/migrations/20260926201750_investing_i5_rl5_engine_v2_admission.sql",
  "supabase/migrations/20260928080318_investing_i5_rl7_experiment_comparison_v1.sql",
  "supabase/migrations/20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql",
  "supabase/migrations/20261001090000_investing_i5_rl7_remove_redundant_row_locks.sql",
] as const;

const ids = {
  principal: "11111111-0000-4000-8000-000000000701",
  tenant: "22222222-0000-4000-8000-000000000701",
  membership: "33333333-0000-4000-8000-000000000701",
  investigation: "44444444-0000-4000-8000-000000000701",
  otherTenant: "22222222-0000-4000-8000-000000000702",
  otherMembership: "33333333-0000-4000-8000-000000000702",
} as const;

const h = (value: string) => {
  const normalized = value.toUpperCase();
  if (!/^[0-9A-F]+$/u.test(normalized)) {
    throw new Error(`Invalid PG17 RL-7 fixture identity seed: ${value}`);
  }
  return normalized.repeat(64).slice(0, 64);
};
const protocolPayload = (marker: string) => ({ schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1", marker });
const resultPayload = (marker: string) => ({ schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1", marker });

const protocolIdentities = {
  replay: { logicalKey: h("1"), hashHex: h("A") },
  concurrentIdentical: { logicalKey: h("2"), hashHex: h("D") },
  concurrentDivergent: { logicalKey: h("3"), firstHashHex: h("E"), secondHashHex: h("F") },
  resultReplay: { logicalKey: h("4"), hashHex: h("7") },
  resultConcurrentIdentical: { logicalKey: h("61"), hashHex: h("62") },
  resultConcurrentDivergent: { logicalKey: h("63"), hashHex: h("64") },
  appendOnly: { logicalKey: h("5"), hashHex: h("9") },
} as const;

const resultHashes = {
  replay: h("B"),
  replayConflict: h("8"),
  concurrentIdentical: h("65"),
  concurrentDivergentFirst: h("66"),
  concurrentDivergentSecond: h("67"),
  appendOnly: h("6B"),
} as const;

const testOnlyIdentityInputs = {
  protocolReplayConflictHash: h("C"),
  unauthorizedInsertHash: h("6C"),
  unauthorizedInsertLogicalKey: h("6E"),
  privilegedProtocolMutationHash: h("68"),
  privilegedResultMutationHash: h("69"),
} as const;

const pg17FixtureIdentities = [
  protocolIdentities.replay.logicalKey,
  protocolIdentities.replay.hashHex,
  protocolIdentities.concurrentIdentical.logicalKey,
  protocolIdentities.concurrentIdentical.hashHex,
  protocolIdentities.concurrentDivergent.logicalKey,
  protocolIdentities.concurrentDivergent.firstHashHex,
  protocolIdentities.concurrentDivergent.secondHashHex,
  protocolIdentities.resultReplay.logicalKey,
  protocolIdentities.resultReplay.hashHex,
  protocolIdentities.resultConcurrentIdentical.logicalKey,
  protocolIdentities.resultConcurrentIdentical.hashHex,
  protocolIdentities.resultConcurrentDivergent.logicalKey,
  protocolIdentities.resultConcurrentDivergent.hashHex,
  protocolIdentities.appendOnly.logicalKey,
  protocolIdentities.appendOnly.hashHex,
  resultHashes.replay,
  resultHashes.replayConflict,
  resultHashes.concurrentIdentical,
  resultHashes.concurrentDivergentFirst,
  resultHashes.concurrentDivergentSecond,
  resultHashes.appendOnly,
  ...Object.values(testOnlyIdentityInputs),
] as const;


function writerRef(domain: HashRefV1["hashDomain"], hash: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hash.length === 64 ? hash : hash.repeat(64),
  });
}

function writerEngineFixture() {
  const fixture = buildGoldenFixture();
  const metricRequestSet = {
    ...fixture.metricRequestSet,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    requests: metricRegistryV2Requests,
  };
  const runInput = {
    ...fixture.runInput,
    metricRegistryVersion: metricRequestSet.metricRegistryVersion,
    metricRequestSet: writerRef("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSet)),
  };
  const result = executeHistoricalBacktestV2({
    ...fixture,
    metricRequestSet,
    runInput,
    runInputHash: writerRef("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)),
  });
  if (result.ok === false) throw new Error(JSON.stringify(result));
  return { result, runInput };
}

function concreteWriterFixture() {
  const { result: actual, runInput } = writerEngineFixture();
  writerState.artifacts.clear();
  writerState.validationBytes.clear();
  writerState.passportReads = 0;
  writerState.context = {
    actorKind: "USER_PRINCIPAL",
    actorId: "pg17-rl7",
    tenantId: ids.tenant,
    principalId: ids.principal,
    tenantMembershipId: ids.membership,
    researchInvestigationId: ids.investigation,
    operationScope: "TENANT_SCOPE",
    sourceContext: "PURE_RESEARCH",
    correlationId: "pg17-rl7-concrete-writer",
    operation: "RESEARCH_PASSPORT_READ_V1",
    capability: "RESEARCH_READ",
  };

  const parameters = [
    i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.10", "20", "0.6", "0.4")),
    i5ExperimentParametersCandidateV1(i5ExperimentResolvedResearchIrV1("0.15", "10", "0.7", "0.3")),
  ];
  const experiments = parameters.map((param, index) => ({
    researchExperimentId: `writer-experiment-${index}`,
    experiment: writerRef("SYNTRAKE:EXPERIMENT:V1", String(index + 1)),
    parentExperimentId: index === 0 ? null : "writer-experiment-0",
    relation: index === 0 ? "BASELINE" : "VARIANT",
    researchSpecRevisionId: "writer-spec",
    researchIr: param.resolvedResearchIr.ref,
    experimentParameters: writerRef("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(param)),
  }));
  const inputs = experiments.map((experiment, index) => {
    const payload = { ...runInput, experiment: experiment.experiment, researchIr: experiment.researchIr };
    return {
      runInputIdentityId: `writer-input-${index}`,
      researchExperimentId: experiment.researchExperimentId,
      experimentHashHex: experiment.experiment.hashHex,
      runInput: writerRef("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(payload)),
      canonicalPayload: payload,
    };
  });
  const results = inputs.map((input, index) => {
    const payload = { ...actual.resultPayload, runInput: input.runInput };
    const descriptors = [
      ["METRIC_RESULT_SET", payload.metricResultSet, actual.artifacts.metricResultSetBytes],
      ["VALUATION_SERIES", payload.valuationSeries, actual.artifacts.valuationSeriesBytes],
    ] as const;
    return {
      resultIdentityId: `writer-result-${index}`,
      runInputIdentityId: input.runInputIdentityId,
      result: writerRef("SYNTRAKE:RESULT:V1", hashResultV1(payload)),
      canonicalPayload: payload,
      artifacts: descriptors.map(([kind, descriptor, bytes]) => {
        const artifactId = `writer-${index}-${kind}`;
        writerState.artifacts.set(artifactId, bytes);
        return { artifactId, artifactKind: kind, ...descriptor };
      }),
    };
  });

  const episodes = experiments.map((experiment, index) => {
    const validationProtocol = writerRef("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
    const phase = (phaseName: "TRAINING" | "EVALUATION") => {
      const run = {
        schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1" as const,
        validationProtocol,
        subjectExperiment: experiment.experiment,
        subjectResearchIr: experiment.researchIr,
        phaseResearchIr: experiment.researchIr,
        sourceDatasetSnapshot: runInput.datasetSnapshot,
        phaseDatasetSnapshot: runInput.datasetSnapshot,
        foldOrdinal: "0",
        phase: phaseName,
        phaseWindow: actual.resultPayload.testPeriod,
        engineId: runInput.engineId,
        engineVersion: runInput.engineVersion,
        metricRegistryVersion: runInput.metricRegistryVersion,
        metricRequestSet: runInput.metricRequestSet,
        executionConfig: runInput.executionConfig,
      };
      const inputRef = writerRef("SYNTRAKE:VALIDATION_RUN_INPUT:V1", hashValidationRunInputV1(run));
      const { runInput: ignored, ...body } = actual.resultPayload;
      void ignored;
      const child = {
        ...body,
        schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1" as const,
        validationRunInput: inputRef,
      };
      const identityId = `writer-child-${index}-${phaseName}`;
      writerState.validationBytes.set(identityId, actual.artifacts.metricResultSetBytes);
      return {
        phase: phaseName,
        runInput: { validationRunInput: inputRef, canonicalPayload: run },
        childResult: {
          researchValidationChildResultIdentityId: identityId,
          researchValidationExecutionRunId: identityId,
          validationChildResult: writerRef("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", hashValidationChildResultV1(child)),
          canonicalPayload: child,
        },
        runs: [{ researchValidationExecutionRunId: identityId, terminalState: "SUCCEEDED" }],
      };
    };
    const training = phase("TRAINING");
    const evaluation = phase("EVALUATION");
    const aggregate = {
      schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1" as const,
      methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1" as const,
      validationProtocol,
      subjectExperiment: experiment.experiment,
      validationMode: "IS_OOS_SPLIT" as const,
      folds: [{
        ordinal: "0",
        trainingRunInput: training.runInput.validationRunInput,
        evaluationRunInput: evaluation.runInput.validationRunInput,
        trainingChildResult: training.childResult.validationChildResult,
        evaluationChildResult: evaluation.childResult.validationChildResult,
      }],
    };
    return {
      validationProtocol,
      subjectExperiment: experiment.experiment,
      state: "AGGREGATE_AVAILABLE",
      folds: [{ ordinal: "0", training, evaluation }],
      aggregate: {
        validationResult: writerRef("SYNTRAKE:VALIDATION_RESULT:V1", hashValidationResultV1(aggregate)),
        canonicalPayload: aggregate,
      },
    };
  });

  writerState.passport = {
    investigation: { ...writerState.context },
    experiments,
    runInputs: inputs,
    results,
    executionRuns: results.map((row) => ({
      runInputIdentityId: row.runInputIdentityId,
      resultIdentityId: row.resultIdentityId,
      terminalState: "SUCCEEDED",
      failureReasonCode: null,
    })),
    validation: { availability: "AVAILABLE_RL3", episodes },
  };

  const protocol = {
    schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1" as const,
    policyId: "ROBUSTNESS_COMPARISON_POLICY_V20260927" as const,
    referenceExperiment: experiments[0]!.experiment,
    subjectExperiment: experiments[1]!.experiment,
    referenceExperimentParameters: experiments[0]!.experimentParameters,
    subjectExperimentParameters: experiments[1]!.experimentParameters,
    referenceResult: results[0]!.result,
    subjectResult: results[1]!.result,
    referenceValidationResult: episodes[0]!.aggregate.validationResult,
    subjectValidationResult: episodes[1]!.aggregate.validationResult,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927" as const,
    primaryMetricId: "CAGR" as const,
    comparisonMetricIds: ["CAGR", "TRADE_COUNT", "REBALANCE_COUNT"] as const,
    neighborhoodExperimentRefs: [experiments[1]!.experiment],
  };
  const sources = {
    protocol,
    referenceParameters: parameters[0]!,
    subjectParameters: parameters[1]!,
    neighborhoodResults: [{ experiment: experiments[1]!.experiment, result: results[1]!.result }],
  };
  return { sources };
}

function concreteWriterDatabase() {
  return {
    connect: async () => {
      const client = await pool.connect();
      await client.query("set role investing_app");
      let released = false;
      return {
        query: async (sql: string, values: readonly unknown[] = []) => {
          if (sql.startsWith("select content from investing.research_result_artifacts")) {
            const bytes = writerState.artifacts.get(String(values[0]));
            return { rows: bytes ? [{ content: bytes }] : [] };
          }
          if (sql.startsWith("select a.content_bytes from investing.research_validation_result_artifacts")) {
            const bytes = writerState.validationBytes.get(String(values[0]));
            return { rows: bytes ? [{ content_bytes: bytes }] : [] };
          }
          return client.query(sql, values as any[]);
        },
        release: async () => {
          if (released) return;
          released = true;
          await client.query("reset role").catch(() => undefined);
          client.release();
        },
      };
    },
  } as any;
}

let pool: Pool;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function applyMigration(relativePath: string) {
  const client = await pool.connect();
  try {
    await client.query(readSql(relativePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 RL-7 rehearsal failed for ${relativePath}: ${message}`);
  } finally {
    client.release();
  }
}

async function dropRoleIfPresent(client: PoolClient, role: "investing_app" | "investing_owner") {
  const exists = await client.query<{ exists: boolean }>("select exists(select 1 from pg_roles where rolname=$1) as exists", [role]);
  if (!exists.rows[0]?.exists) return;
  await client.query(`reassign owned by ${role} to postgres`);
  await client.query(`drop owned by ${role}`);
  await client.query(`drop role ${role}`);
}

async function resetAndMigrate() {
  const client = await pool.connect();
  try {
    await client.query("drop schema if exists investing cascade");
    await dropRoleIfPresent(client, "investing_app");
    await dropRoleIfPresent(client, "investing_owner");
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
      end $$;
      create schema if not exists extensions;
      create extension if not exists pgcrypto with schema extensions;
      create extension if not exists pgcrypto;
    `);
  } finally {
    client.release();
  }
  for (const migration of migrations) await applyMigration(migration);
}

async function seedAuthority() {
  const client = await pool.connect();
  try {
    await client.query("insert into investing.principals (principal_id, external_provider, external_subject, state) values ($1,'CLERK','pg17-rl7','ACTIVE')", [ids.principal]);
    await client.query("insert into investing.tenants (tenant_id,state) values ($1,'ACTIVE'),($2,'ACTIVE')", [ids.tenant, ids.otherTenant]);
    await client.query(
      "insert into investing.tenant_memberships (tenant_membership_id,tenant_id,principal_id,role,state) values ($1,$2,$3,'OWNER','ACTIVE'),($4,$5,$3,'OWNER','ACTIVE')",
      [ids.membership, ids.tenant, ids.principal, ids.otherMembership, ids.otherTenant],
    );
  } finally {
    client.release();
  }
}

async function asApp<T>(
  context: { operation: string; tenantId?: string; membershipId?: string },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role investing_app");
    const settings = {
      operation: context.operation,
      capability: "RESEARCH_MUTATE",
      operation_scope: "TENANT_SCOPE",
      source_context: "PURE_RESEARCH",
      tenant_id: context.tenantId ?? ids.tenant,
      principal_id: ids.principal,
      tenant_membership_id: context.membershipId ?? ids.membership,
      research_investigation_id: ids.investigation,
    };
    for (const [key, value] of Object.entries(settings)) {
      await client.query("select set_config($1,$2,true)", [`syntrake.investing.${key}`, value]);
    }
    const output = await fn(client);
    await client.query("commit");
    return output;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function persistProtocol(logicalKey = protocolIdentities.replay.logicalKey, hashHex = protocolIdentities.replay.hashHex, payload = protocolPayload("A")) {
  return asApp({ operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" }, async (client) => {
    const result = await client.query<{ research_experiment_comparison_protocol_identity_id: string; persistence_status: string }>(
      "select * from investing.persist_research_experiment_comparison_protocol_v1($1,$2,$3::jsonb)",
      [logicalKey, hashHex, JSON.stringify(payload)],
    );
    return result.rows[0]!;
  });
}

async function finalizeResult(protocolId: string, hashHex = resultHashes.replay, payload = resultPayload("A")) {
  return asApp({ operation: "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1" }, async (client) => {
    const result = await client.query<{ research_experiment_comparison_result_identity_id: string; persistence_status: string }>(
      "select * from investing.finalize_research_experiment_comparison_result_v1($1,$2,$3::jsonb)",
      [protocolId, hashHex, JSON.stringify(payload)],
    );
    return result.rows[0]!;
  });
}

describe("I5 RL-7 Experiment Comparison PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(/^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u);
  });

  it("keeps every PG17 fixture identity hexadecimal and cross-test unique", () => {
    expect(pg17FixtureIdentities.every((identity) => /^[0-9A-F]{64}$/u.test(identity))).toBe(true);
    expect(new Set(pg17FixtureIdentities).size).toBe(pg17FixtureIdentities.length);
  });
});

maybeDescribe("I5 RL-7 Experiment Comparison real PG17 persistence rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    await resetAndMigrate();
    await seedAuthority();
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("applies cumulative lineage through RL-7 with exact security surface", async () => {
    const client = await pool.connect();
    try {
      const version = await client.query<{ server_version: string }>("show server_version");
      expect(version.rows[0]!.server_version).toMatch(/^17\./u);
      const relations = await client.query<{ relname: string; owner: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='investing'
          and c.relname in (
            'research_experiment_comparison_protocols_scientific_identities',
            'research_experiment_comparison_results_scientific_identities'
          )
        order by c.relname
      `);
      expect(relations.rows).toEqual([
        { relname: "research_experiment_comparison_protocols_scientific_identities", owner: "investing_owner", relrowsecurity: true, relforcerowsecurity: true },
        { relname: "research_experiment_comparison_results_scientific_identities", owner: "investing_owner", relrowsecurity: true, relforcerowsecurity: true },
      ]);
      const forbidden = await client.query<{ count: string }>(`
        select count(*)::text as count from information_schema.role_table_grants
        where table_schema='investing'
          and table_name in (
            'research_experiment_comparison_protocols_scientific_identities',
            'research_experiment_comparison_results_scientific_identities'
          )
          and grantee in ('PUBLIC','anon','authenticated','service_role')
          and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
      `);
      expect(forbidden.rows[0]!.count).toBe("0");
      const appMutation = await client.query<{ count: string }>(`
        select count(*)::text as count from information_schema.role_table_grants
        where table_schema='investing'
          and table_name in (
            'research_experiment_comparison_protocols_scientific_identities',
            'research_experiment_comparison_results_scientific_identities'
          )
          and grantee = 'investing_app'
          and privilege_type in ('UPDATE','DELETE','TRUNCATE')
      `);
      expect(appMutation.rows[0]!.count).toBe("0");
      const functionSecurity = await client.query<{ proname: string; prosecdef: boolean; app_execute: boolean; service_execute: boolean }>(`
        select p.proname, p.prosecdef,
          has_function_privilege('investing_app', p.oid, 'EXECUTE') as app_execute,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='investing'
          and p.proname in (
            'persist_research_experiment_comparison_protocol_v1',
            'finalize_research_experiment_comparison_result_v1'
          )
        order by p.proname
      `);
      expect(functionSecurity.rows).toEqual([
        { proname: "finalize_research_experiment_comparison_result_v1", prosecdef: false, app_execute: true, service_execute: false },
        { proname: "persist_research_experiment_comparison_protocol_v1", prosecdef: false, app_execute: true, service_execute: false },
      ]);
    } finally {
      client.release();
    }
  });

  it("reuses identical protocol payloads and conflicts on divergent protocol payloads", async () => {
    const created = await persistProtocol();
    expect(created.persistence_status).toBe("CREATED");
    const reused = await persistProtocol();
    expect(reused).toEqual({ ...created, persistence_status: "REUSED_IDENTICAL" });
    await expect(persistProtocol(protocolIdentities.replay.logicalKey, testOnlyIdentityInputs.protocolReplayConflictHash, protocolPayload("B"))).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT");
  });

  it("serializes concurrent identical and divergent protocol attempts", async () => {
    const [a, b] = await Promise.all([
      persistProtocol(protocolIdentities.concurrentIdentical.logicalKey, protocolIdentities.concurrentIdentical.hashHex, protocolPayload("C")),
      persistProtocol(protocolIdentities.concurrentIdentical.logicalKey, protocolIdentities.concurrentIdentical.hashHex, protocolPayload("C")),
    ]);
    expect(a.research_experiment_comparison_protocol_identity_id).toBe(b.research_experiment_comparison_protocol_identity_id);
    const divergent = await Promise.allSettled([
      persistProtocol(protocolIdentities.concurrentDivergent.logicalKey, protocolIdentities.concurrentDivergent.firstHashHex, protocolPayload("D")),
      persistProtocol(protocolIdentities.concurrentDivergent.logicalKey, protocolIdentities.concurrentDivergent.secondHashHex, protocolPayload("E")),
    ]);
    expect(divergent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(divergent.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = divergent.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ message: expect.stringContaining("RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT") });
    const client = await pool.connect();
    try {
      const count = await client.query<{ count: string }>("select count(*)::text as count from investing.research_experiment_comparison_protocols_scientific_identities where logical_comparison_key=$1", [protocolIdentities.concurrentDivergent.logicalKey]);
      expect(count.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });

  it("finalizes result once, reuses identical result and conflicts on divergent result", async () => {
    const protocol = await persistProtocol(protocolIdentities.resultReplay.logicalKey, protocolIdentities.resultReplay.hashHex, protocolPayload("F"));
    const created = await finalizeResult(protocol.research_experiment_comparison_protocol_identity_id);
    expect(created.persistence_status).toBe("CREATED");
    const reused = await finalizeResult(protocol.research_experiment_comparison_protocol_identity_id);
    expect(reused).toEqual({ ...created, persistence_status: "REUSED_IDENTICAL" });
    await expect(finalizeResult(protocol.research_experiment_comparison_protocol_identity_id, resultHashes.replayConflict, resultPayload("B"))).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT");
  });

  it("serializes concurrent identical and divergent result finalization", async () => {
    const identicalProtocol = await persistProtocol(protocolIdentities.resultConcurrentIdentical.logicalKey, protocolIdentities.resultConcurrentIdentical.hashHex, protocolPayload("RESULT_CONCURRENT_IDENTICAL_PROTOCOL"));
    const identical = await Promise.all([
      finalizeResult(identicalProtocol.research_experiment_comparison_protocol_identity_id, resultHashes.concurrentIdentical, resultPayload("RESULT_CONCURRENT_IDENTICAL")),
      finalizeResult(identicalProtocol.research_experiment_comparison_protocol_identity_id, resultHashes.concurrentIdentical, resultPayload("RESULT_CONCURRENT_IDENTICAL")),
    ]);
    expect(identical[0]!.research_experiment_comparison_result_identity_id).toBe(identical[1]!.research_experiment_comparison_result_identity_id);
    const divergentProtocol = await persistProtocol(protocolIdentities.resultConcurrentDivergent.logicalKey, protocolIdentities.resultConcurrentDivergent.hashHex, protocolPayload("RESULT_CONCURRENT_DIVERGENT_PROTOCOL"));
    const divergent = await Promise.allSettled([
      finalizeResult(divergentProtocol.research_experiment_comparison_protocol_identity_id, resultHashes.concurrentDivergentFirst, resultPayload("RESULT_CONCURRENT_DIVERGENT_A")),
      finalizeResult(divergentProtocol.research_experiment_comparison_protocol_identity_id, resultHashes.concurrentDivergentSecond, resultPayload("RESULT_CONCURRENT_DIVERGENT_B")),
    ]);
    expect(divergent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(divergent.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = divergent.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ message: expect.stringContaining("RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT") });
    const client = await pool.connect();
    try {
      const count = await client.query<{ count: string }>("select count(*)::text as count from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_protocol_identity_id=$1", [divergentProtocol.research_experiment_comparison_protocol_identity_id]);
      expect(count.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });

  it("denies cross-tenant reuse, unauthorized insert, update and delete while preserving rows", async () => {
    const protocol = await persistProtocol(protocolIdentities.appendOnly.logicalKey, protocolIdentities.appendOnly.hashHex, protocolPayload("G"));
    const result = await finalizeResult(protocol.research_experiment_comparison_protocol_identity_id, resultHashes.appendOnly, resultPayload("C"));
    await expect(asApp(
      { operation: "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1", tenantId: ids.otherTenant, membershipId: ids.otherMembership },
      (client) => client.query("select * from investing.finalize_research_experiment_comparison_result_v1($1,$2,$3::jsonb)", [protocol.research_experiment_comparison_protocol_identity_id, resultHashes.appendOnly, JSON.stringify(resultPayload("C"))]),
    )).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_PROTOCOL_NOT_FOUND");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      await expect(client.query("insert into investing.research_experiment_comparison_protocols_scientific_identities (tenant_id,principal_id,tenant_membership_id,research_investigation_id,hash_hex,logical_comparison_key,canonical_payload) values ($1,$2,$3,$4,$5,$6,'{}'::jsonb)", [ids.tenant, ids.principal, ids.membership, ids.investigation, testOnlyIdentityInputs.unauthorizedInsertHash, testOnlyIdentityInputs.unauthorizedInsertLogicalKey])).rejects.toThrow();
      await client.query("rollback");

      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" },
        (app) => app.query("update investing.research_experiment_comparison_protocols_scientific_identities set hash_hex=hash_hex where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id]),
      )).rejects.toThrow(/permission denied for table/iu);
      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" },
        (app) => app.query("delete from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id]),
      )).rejects.toThrow(/permission denied for table/iu);
      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1" },
        (app) => app.query("update investing.research_experiment_comparison_results_scientific_identities set hash_hex=hash_hex where research_experiment_comparison_result_identity_id=$1", [result.research_experiment_comparison_result_identity_id]),
      )).rejects.toThrow(/permission denied for table/iu);
      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1" },
        (app) => app.query("delete from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$1", [result.research_experiment_comparison_result_identity_id]),
      )).rejects.toThrow(/permission denied for table/iu);

      // The admin pool connection is the privileged PostgreSQL trigger-path caller.
      await expect(client.query("update investing.research_experiment_comparison_protocols_scientific_identities set hash_hex=$2 where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id, testOnlyIdentityInputs.privilegedProtocolMutationHash])).rejects.toThrow("append-only");
      await expect(client.query("delete from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id])).rejects.toThrow("append-only");
      await expect(client.query("update investing.research_experiment_comparison_results_scientific_identities set hash_hex=$2 where research_experiment_comparison_result_identity_id=$1", [result.research_experiment_comparison_result_identity_id, testOnlyIdentityInputs.privilegedResultMutationHash])).rejects.toThrow("append-only");
      await expect(client.query("delete from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$1", [result.research_experiment_comparison_result_identity_id])).rejects.toThrow("append-only");

      const persisted = await client.query<{ protocol_count: string; protocol_hash: string | null; result_count: string; result_hash: string | null }>(`
        select
          (select count(*)::text from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1) as protocol_count,
          (select hash_hex from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1) as protocol_hash,
          (select count(*)::text from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$2) as result_count,
          (select hash_hex from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$2) as result_hash
      `, [protocol.research_experiment_comparison_protocol_identity_id, result.research_experiment_comparison_result_identity_id]);
      expect(persisted.rows[0]).toEqual({ protocol_count: "1", protocol_hash: protocolIdentities.appendOnly.hashHex, result_count: "1", result_hash: resultHashes.appendOnly });
    } finally {
      client.release();
    }
  });
  it("runs the concrete writeExperimentComparisonV1 adapter end-to-end through real PostgreSQL 17 persistence", async () => {
    const fixture = concreteWriterFixture();
    const database = concreteWriterDatabase();
    const first = await writeExperimentComparisonV1(
      {
        researchInvestigationId: ids.investigation,
        correlationId: "pg17-rl7-concrete-writer",
        sources: fixture.sources,
      },
      database,
    );

    expect(first.protocolHash).toBe(hashExperimentComparisonProtocolV1(fixture.sources.protocol));
    expect(first.protocolHash).toMatch(/^[0-9A-F]{64}$/u);
    expect(first.resultHash).toMatch(/^[0-9A-F]{64}$/u);
    expect(first.protocolIdentityId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first.resultIdentityId).toMatch(/^[0-9a-f-]{36}$/u);

    const second = await writeExperimentComparisonV1(
      {
        researchInvestigationId: ids.investigation,
        correlationId: "pg17-rl7-concrete-writer-replay",
        sources: fixture.sources,
      },
      database,
    );

    expect(second.protocolIdentityId).toBe(first.protocolIdentityId);
    expect(second.resultIdentityId).toBe(first.resultIdentityId);
    expect(second.protocolHash).toBe(first.protocolHash);
    expect(second.resultHash).toBe(first.resultHash);
    expect(writerState.passportReads).toBeGreaterThanOrEqual(2);

    const client = await pool.connect();
    try {
      const persisted = await client.query<{
        protocol_count: string;
        result_count: string;
        protocol_hash: string | null;
        result_hash: string | null;
      }>(`
        select
          (select count(*)::text from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1) as protocol_count,
          (select count(*)::text from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$2) as result_count,
          (select hash_hex from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1) as protocol_hash,
          (select hash_hex from investing.research_experiment_comparison_results_scientific_identities where research_experiment_comparison_result_identity_id=$2) as result_hash
      `, [first.protocolIdentityId, first.resultIdentityId]);
      expect(persisted.rows[0]).toEqual({
        protocol_count: "1",
        result_count: "1",
        protocol_hash: first.protocolHash,
        result_hash: first.resultHash,
      });
    } finally {
      client.release();
    }
  });

});
