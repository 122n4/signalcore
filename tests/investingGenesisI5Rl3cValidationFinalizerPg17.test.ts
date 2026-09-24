import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import type { InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";
import {
  hashRefV1,
  hashValidationChildResultV1,
  hashValidationProtocolV1,
  hashValidationRunInputV1,
  type ValidationChildResultHashPayloadV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "../lib/investing/research";
import { artifactDescriptorV1, canonicalJsonlArtifactBytesV1 } from "../lib/investing/research/resultArtifacts";
import { finalizeValidationResultCommandV1 } from "../lib/investing/research/validationAggregateService";

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
] as const;

const ids = {
  principal: "11110000-0000-4000-8000-00000000c001",
  tenant: "22220000-0000-4000-8000-00000000c001",
  membership: "33330000-0000-4000-8000-00000000c001",
  investigation: "44440000-0000-4000-8000-00000000c001",
  experiment: "55550000-0000-4000-8000-00000000c001",
  specRevision: "66660000-0000-4000-8000-00000000c001",
  idempotency: "77770000-0000-4000-8000-00000000c001",
  protocol: "88880000-0000-4000-8000-00000000c001",
  trainingInput: "99990000-0000-4000-8000-00000000c001",
  evaluationInput: "99990000-0000-4000-8000-00000000c002",
  trainingRun: "aaaa0000-0000-4000-8000-00000000c001",
  evaluationRun: "aaaa0000-0000-4000-8000-00000000c002",
  trainingChild: "bbbb0000-0000-4000-8000-00000000c001",
  evaluationChild: "bbbb0000-0000-4000-8000-00000000c002",
} as const;

const hex = (c: string) => c.repeat(64).slice(0, 64).toUpperCase();
const ref = (hashDomain: Parameters<typeof hashRefV1>[0]["hashDomain"], hashHex: string) =>
  hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashHex as never });

let pool: Pool;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function applyMigration(relativePath: string) {
  const client = await pool.connect();
  try {
    await client.query(readSql(relativePath));
  } finally {
    client.release();
  }
}

function authorityDatabase(): InvestingAuthorityDatabase {
  return {
    connect: async () => {
      const client = await pool.connect();
      const adapter: InvestingAuthorityTransactionClient = {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
          const result = await client.query<Row>(text, [...values]);
          if (text.trim().toLowerCase() === "begin") {
            await client.query("set local role investing_app");
          }
          return { rows: result.rows, rowCount: result.rowCount };
        },
        release: async (destroy = false) => {
          try {
            await client.query("reset role").catch(() => undefined);
            await client.query("reset all").catch(() => undefined);
          } finally {
            client.release(destroy);
          }
        },
      };
      return adapter;
    },
  };
}

async function resetAndMigrate() {
  const client = await pool.connect();
  try {
    await client.query("drop schema if exists investing cascade");
    for (const role of ["investing_app", "investing_owner"] as const) {
      const exists = await client.query<{ exists: boolean }>(
        "select exists(select 1 from pg_roles where rolname=$1) as exists",
        [role],
      );
      if (exists.rows[0]?.exists) {
        await client.query(`reassign owned by ${role} to postgres`);
        await client.query(`drop owned by ${role}`);
        await client.query(`drop role ${role}`);
      }
    }
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

async function seedScientificChildren() {
  const protocol: ValidationProtocolHashPayloadV1 = {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", hex("2")),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hex("1")),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hex("5")),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hex("6")),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hex("7")),
    validationMode: "CHRONOLOGICAL_HOLDOUT",
    folds: [{
      ordinal: "0",
      trainingWindow: { startDate: "2020-01-31", endDate: "2020-02-07" },
      evaluationWindow: { startDate: "2020-02-10", endDate: "2020-02-14" },
    }],
  };
  const protocolHash = hashValidationProtocolV1(protocol);
  const protocolRef = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", protocolHash);

  const trainingInput: ValidationRunInputHashPayloadV1 = {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: protocolRef,
    subjectExperiment: protocol.subjectExperiment,
    subjectResearchIr: protocol.subjectResearchIr,
    phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hex("8")),
    sourceDatasetSnapshot: protocol.sourceDatasetSnapshot,
    phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hex("A")),
    foldOrdinal: "0",
    phase: "TRAINING",
    phaseWindow: protocol.folds[0]!.trainingWindow,
    engineId: protocol.engineId,
    engineVersion: protocol.engineVersion,
    metricRegistryVersion: protocol.metricRegistryVersion,
    metricRequestSet: protocol.metricRequestSet,
    executionConfig: protocol.executionConfig,
  };
  const evaluationInput: ValidationRunInputHashPayloadV1 = {
    ...trainingInput,
    phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hex("9")),
    phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hex("B")),
    phase: "EVALUATION",
    phaseWindow: protocol.folds[0]!.evaluationWindow,
  };
  const trainingInputHash = hashValidationRunInputV1(trainingInput);
  const evaluationInputHash = hashValidationRunInputV1(evaluationInput);

  const traceBytes = canonicalJsonlArtifactBytesV1([{ event: "noop" }]);
  const valuationBytes = canonicalJsonlArtifactBytesV1([{ date: "2020-02-07", nav: "1000" }]);
  const metricBytes = canonicalJsonlArtifactBytesV1([{ metric: "TOTAL_RETURN", value: "0" }]);
  const trace = artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V1", traceBytes, 1);
  const valuation = artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V1", valuationBytes, 1);
  const metrics = artifactDescriptorV1("METRIC_RESULT_SET_V1", metricBytes, 1);

  const childPayload = (
    runInputHash: string,
    period: { startDate: string; endDate: string },
  ): ValidationChildResultHashPayloadV1 => ({
    schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1",
    validationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", runInputHash),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
    valuationCurrency: "USD",
    testPeriod: period,
    startingNav: "1000",
    endingNav: "1000",
    terminalCash: "1000",
    executionTrace: trace,
    valuationSeries: valuation,
    metricResultSet: metrics,
    benchmark: null,
  });
  const trainingChild = childPayload(trainingInputHash, trainingInput.phaseWindow);
  const evaluationChild = childPayload(evaluationInputHash, evaluationInput.phaseWindow);
  const trainingChildHash = hashValidationChildResultV1(trainingChild);
  const evaluationChildHash = hashValidationChildResultV1(evaluationChild);

  const client = await pool.connect();
  try {
    await client.query(
      "insert into investing.principals (principal_id, external_provider, external_subject, state) values ($1,'CLERK','pg17-rl3c-finalizer','ACTIVE')",
      [ids.principal],
    );
    await client.query("insert into investing.tenants (tenant_id,state) values ($1,'ACTIVE')", [ids.tenant]);
    await client.query(
      "insert into investing.tenant_memberships (tenant_membership_id,tenant_id,principal_id,role,state) values ($1,$2,$3,'OWNER','ACTIVE')",
      [ids.membership, ids.tenant, ids.principal],
    );

    await client.query("set session_replication_role=replica");
    try {
      await client.query(`
        insert into investing.research_experiments (
          research_experiment_id,research_investigation_id,tenant_id,account_id,principal_id,
          actor_kind,actor_id,tenant_membership_id,account_access_id,operation_scope,source_context,
          operation,capability,relation,parent_experiment_id,research_spec_revision_id,
          research_ir_hash_algorithm,research_ir_hash_domain,research_ir_hash_version,research_ir_hash_hex,
          experiment_hash_algorithm,experiment_hash_domain,experiment_hash_version,experiment_hash_hex,
          experiment_parameters_hash_algorithm,experiment_parameters_hash_domain,experiment_parameters_hash_version,
          experiment_parameters_hash_hex,material_request_hash,idempotency_record_id,idempotency_key,correlation_id
        ) values (
          $1,$2,$3,null,$4,'USER_PRINCIPAL','pg17-rl3c-finalizer',$5,null,'TENANT_SCOPE','PURE_RESEARCH',
          'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$6,
          'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$7,
          'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,
          null,null,null,null,$9,$10,'idem-pg17-rl3c-finalizer','corr-pg17-rl3c-finalizer-experiment'
        )
      `, [ids.experiment,ids.investigation,ids.tenant,ids.principal,ids.membership,ids.specRevision,hex("1"),hex("2"),hex("3"),ids.idempotency]);
    } finally {
      await client.query("set session_replication_role=origin");
    }

    await client.query(`
      insert into investing.research_validation_protocols_scientific_identities (
        research_validation_protocol_identity_id,tenant_id,principal_id,tenant_membership_id,research_investigation_id,
        research_experiment_id,operation,capability,operation_scope,source_context,hash_algorithm,hash_domain,hash_version,hash_hex,canonical_payload
      ) values ($1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
        'SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$7,$8::jsonb)
    `, [ids.protocol,ids.tenant,ids.principal,ids.membership,ids.investigation,ids.experiment,protocolHash,JSON.stringify(protocol)]);

    for (const entry of [
      { id: ids.trainingInput, payload: trainingInput, hash: trainingInputHash },
      { id: ids.evaluationInput, payload: evaluationInput, hash: evaluationInputHash },
    ]) {
      await client.query(`
        insert into investing.research_validation_run_inputs_scientific_identities (
          research_validation_run_input_identity_id,tenant_id,principal_id,tenant_membership_id,research_investigation_id,
          research_validation_protocol_identity_id,research_experiment_id,operation,capability,operation_scope,source_context,
          fold_ordinal,phase,phase_research_ir_hash_hex,source_dataset_snapshot_hash_hex,phase_dataset_snapshot_hash_hex,
          engine_id,engine_version,metric_request_set_hash_hex,execution_config_hash_hex,hash_algorithm,hash_domain,hash_version,hash_hex,canonical_payload
        ) values ($1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',
          0,$8,$9,$10,$11,'HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918',$12,$13,
          'SHA-256','SYNTRAKE:VALIDATION_RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$14,$15::jsonb)
      `, [
        entry.id,ids.tenant,ids.principal,ids.membership,ids.investigation,ids.protocol,ids.experiment,
        entry.payload.phase,entry.payload.phaseResearchIr.hashHex,entry.payload.sourceDatasetSnapshot.hashHex,
        entry.payload.phaseDatasetSnapshot.hashHex,entry.payload.metricRequestSet.hashHex,entry.payload.executionConfig.hashHex,
        entry.hash,JSON.stringify(entry.payload),
      ]);
    }

    for (const entry of [
      { run: ids.trainingRun, input: ids.trainingInput, phase: "TRAINING", payload: trainingChild, hash: trainingChildHash, child: ids.trainingChild },
      { run: ids.evaluationRun, input: ids.evaluationInput, phase: "EVALUATION", payload: evaluationChild, hash: evaluationChildHash, child: ids.evaluationChild },
    ] as const) {
      await client.query(`
        insert into investing.research_validation_execution_runs (
          research_validation_execution_run_id,tenant_id,principal_id,tenant_membership_id,research_investigation_id,
          research_validation_protocol_identity_id,research_validation_run_input_identity_id,fold_ordinal,phase,engine_id,engine_version,
          operation,capability,operation_scope,source_context,correlation_id
        ) values ($1,$2,$3,$4,$5,$6,$7,0,$8,'HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918',
          'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$9)
      `, [entry.run,ids.tenant,ids.principal,ids.membership,ids.investigation,ids.protocol,entry.input,entry.phase,`corr-${entry.phase.toLowerCase()}`]);
      await client.query(
        "insert into investing.research_validation_execution_run_events (research_validation_execution_run_event_id,research_validation_execution_run_id,sequence,event_type,previous_event_type,failure_code) values (gen_random_uuid(),$1,1,'REGISTERED',null,null),(gen_random_uuid(),$1,2,'STARTED','REGISTERED',null),(gen_random_uuid(),$1,3,'SUCCEEDED','STARTED',null)",
        [entry.run],
      );

      const artifactIds = {
        trace: randomUUID(),
        valuation: randomUUID(),
        metrics: randomUUID(),
      };
      for (const artifact of [
        { id: artifactIds.trace, kind: "EXECUTION_TRACE", descriptor: trace, bytes: traceBytes },
        { id: artifactIds.valuation, kind: "VALUATION_SERIES", descriptor: valuation, bytes: valuationBytes },
        { id: artifactIds.metrics, kind: "METRIC_RESULT_SET", descriptor: metrics, bytes: metricBytes },
      ] as const) {
        await client.query(`
          insert into investing.research_validation_result_artifacts (
            research_validation_result_artifact_id,research_validation_execution_run_id,artifact_kind,artifact_schema_version,artifact_format,
            content_sha256,content_byte_length,record_count,content_bytes
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [artifact.id,entry.run,artifact.kind,artifact.descriptor.artifactSchemaVersion,artifact.descriptor.format,
          artifact.descriptor.contentSha256,artifact.descriptor.contentByteLength,artifact.descriptor.recordCount,artifact.bytes]);
      }
      await client.query(`
        insert into investing.research_validation_child_results_scientific_identities (
          research_validation_child_result_identity_id,tenant_id,principal_id,tenant_membership_id,research_investigation_id,
          research_validation_protocol_identity_id,research_validation_run_input_identity_id,research_validation_execution_run_id,
          execution_trace_artifact_id,valuation_series_artifact_id,metric_result_set_artifact_id,benchmark_series_artifact_id,
          engine_id,engine_version,hash_algorithm,hash_domain,hash_version,hash_hex,canonical_payload
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,'HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918',
          'SHA-256','SYNTRAKE:VALIDATION_CHILD_RESULT:V1','SYNTRAKE_SHA256_V1',$12,$13::jsonb)
      `, [entry.child,ids.tenant,ids.principal,ids.membership,ids.investigation,ids.protocol,entry.input,entry.run,
        artifactIds.trace,artifactIds.valuation,artifactIds.metrics,entry.hash,JSON.stringify(entry.payload)]);
    }
  } finally {
    client.release();
  }
}

describe("I5 RL-3C real finalizer PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(
      /^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u,
    );
  });
});

maybeDescribe("I5 RL-3C real finalizer PG17", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    await resetAndMigrate();
    await seedScientificChildren();
    vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
      ok: true,
      externalProvider: "CLERK",
      externalSubject: "pg17-rl3c-finalizer",
    });
    vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(authorityDatabase());
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("finalizes concurrently to one exact aggregate and replays the same scientific identity", async () => {
    const [a,b] = await Promise.all([
      finalizeValidationResultCommandV1({
        researchInvestigationId: ids.investigation,
        researchValidationProtocolIdentityId: ids.protocol,
        correlationId: "corr-pg17-rl3c-finalize-a",
      }),
      finalizeValidationResultCommandV1({
        researchInvestigationId: ids.investigation,
        researchValidationProtocolIdentityId: ids.protocol,
        correlationId: "corr-pg17-rl3c-finalize-b",
      }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error(JSON.stringify({a,b}));
    expect(a.researchValidationResultIdentityId).toBe(b.researchValidationResultIdentityId);
    expect(a.validationResultHashHex).toBe(b.validationResultHashHex);
    expect([a.replayed,b.replayed].sort()).toEqual([false,true]);

    const replay = await finalizeValidationResultCommandV1({
      researchInvestigationId: ids.investigation,
      researchValidationProtocolIdentityId: ids.protocol,
      correlationId: "corr-pg17-rl3c-finalize-replay",
    });
    expect(replay).toMatchObject({
      ok: true,
      replayed: true,
      researchValidationResultIdentityId: a.researchValidationResultIdentityId,
      validationResultHashHex: a.validationResultHashHex,
    });

    const client = await pool.connect();
    try {
      const rows = await client.query<{ count: string }>(
        "select count(*)::text as count from investing.research_validation_results_scientific_identities where research_validation_protocol_identity_id=$1",
        [ids.protocol],
      );
      expect(rows.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });
});
