import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  "supabase/migrations/20260929193000_investing_i5_rl3d_validation_assessment_v1.sql",
  "supabase/migrations/20260930175542_investing_i5_rl3d_preproduction_policy_consolidation.sql",
] as const;

const ids = {
  principal: "11111111-0000-4000-8000-0000000003d1",
  tenant: "22222222-0000-4000-8000-0000000003d1",
  membership: "33333333-0000-4000-8000-0000000003d1",
  investigation: "44444444-0000-4000-8000-0000000003d1",
  experiment: "55555555-0000-4000-8000-0000000003d1",
  protocolV1: "66666666-0000-4000-8000-0000000003d1",
  protocolV2: "66666666-0000-4000-8000-0000000003d2",
  protocolV2Late: "66666666-0000-4000-8000-0000000003d3",
  runInputV1: "77777777-0000-4000-8000-0000000003d1",
  runInputV2: "77777777-0000-4000-8000-0000000003d2",
  runInputV2Late: "77777777-0000-4000-8000-0000000003d3",
  runV1: "88888888-0000-4000-8000-0000000003d1",
  runV2: "88888888-0000-4000-8000-0000000003d2",
  runV2Late: "88888888-0000-4000-8000-0000000003d3",
  assessmentProtocol: "99999999-0000-4000-8000-0000000003d1",
  validationResult: "aaaaaaaa-0000-4000-8000-0000000003d1",
  assessmentResult: "bbbbbbbb-0000-4000-8000-0000000003d1",
} as const;

const h = (value: string) => value.repeat(64).slice(0, 64).toUpperCase();

let pool: Pool;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function dropRoleIfPresent(client: PoolClient, role: "investing_app" | "investing_owner") {
  const exists = await client.query<{ exists: boolean }>(
    "select exists(select 1 from pg_roles where rolname=$1) as exists",
    [role],
  );
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

  for (const migration of migrations) {
    const migrationClient = await pool.connect();
    try {
      await migrationClient.query(readSql(migration));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PG17 RL-3D rehearsal failed for ${migration}: ${message}`);
    } finally {
      migrationClient.release();
    }
  }
}

function validationProtocolPayload(metricRegistryVersion: "METRIC_REGISTRY_V20260918" | "METRIC_REGISTRY_V20260927") {
  return {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: metricRegistryVersion === "METRIC_REGISTRY_V20260927"
      ? "EXACT_XNYS_SESSION_BOUNDARIES_V2"
      : "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EXPERIMENT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("E"),
    },
    subjectResearchIr: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("C"),
    },
    sourceDatasetSnapshot: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:DATASET_SNAPSHOT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("D"),
    },
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: metricRegistryVersion === "METRIC_REGISTRY_V20260927" ? "ENGINE_V20260926" : "ENGINE_V20260918",
    metricRegistryVersion,
    metricRequestSet: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:METRIC_REQUEST_SET:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("M"),
    },
    executionConfig: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EXECUTION_CONFIG:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("C"),
    },
    validationMode: "IS_OOS_SPLIT",
    folds: [{
      ordinal: "0",
      trainingWindow: { startDate: "2026-01-02", endDate: "2026-01-30" },
      evaluationWindow: { startDate: "2026-02-02", endDate: "2026-02-27" },
    }],
  };
}

function assessmentProtocolPayload(validationProtocolHashHex: string) {
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: validationProtocolHashHex,
    },
    subjectExperiment: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EXPERIMENT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("E"),
    },
    subjectResearchIr: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("C"),
    },
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria: [],
    requiredEvidenceRequirements: [],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
}

function assessmentResultPayload(
  assessmentProtocolHashHex: string,
  validationProtocolHashHex: string,
  validationResultHashHex: string,
) {
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_RESULT_V1",
    assessmentProtocol: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: assessmentProtocolHashHex,
    },
    validationProtocol: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: validationProtocolHashHex,
    },
    validationResult: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_RESULT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: validationResultHashHex,
    },
    subjectExperiment: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EXPERIMENT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("E"),
    },
    subjectResearchIr: {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: h("C"),
    },
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    consumedEvidence: [],
    criterionOutcomes: [],
    outcome: "PASS",
  };
}

async function seedPredecessorRows() {
  const client = await pool.connect();
  try {
    await client.query(
      "insert into investing.principals (principal_id, external_provider, external_subject, state) values ($1,'CLERK','pg17-rl3d','ACTIVE')",
      [ids.principal],
    );
    await client.query("insert into investing.tenants (tenant_id,state) values ($1,'ACTIVE')", [ids.tenant]);
    await client.query(
      "insert into investing.tenant_memberships (tenant_membership_id,tenant_id,principal_id,role,state) values ($1,$2,$3,'OWNER','ACTIVE')",
      [ids.membership, ids.tenant, ids.principal],
    );

    await client.query("set session_replication_role = replica");
    try {
      for (const [id, hashHex, metricRegistryVersion] of [
        [ids.protocolV1, h("1"), "METRIC_REGISTRY_V20260918"],
        [ids.protocolV2, h("2"), "METRIC_REGISTRY_V20260927"],
        [ids.protocolV2Late, h("3"), "METRIC_REGISTRY_V20260927"],
      ] as const) {
        await client.query(
          `insert into investing.research_validation_protocols_scientific_identities (
            research_validation_protocol_identity_id, tenant_id, principal_id, tenant_membership_id,
            research_investigation_id, research_experiment_id, operation, capability, operation_scope,
            source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
          ) values (
            $1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE',
            'TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1',
            'SYNTRAKE_SHA256_V1',$7,$8::jsonb
          )`,
          [
            id, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment,
            hashHex, JSON.stringify(validationProtocolPayload(metricRegistryVersion)),
          ],
        );
      }

      for (const [runInputId, protocolId, runId, engineVersion, hashHex] of [
        [ids.runInputV1, ids.protocolV1, ids.runV1, "ENGINE_V20260918", h("4")],
        [ids.runInputV2, ids.protocolV2, ids.runV2, "ENGINE_V20260926", h("5")],
        [ids.runInputV2Late, ids.protocolV2Late, ids.runV2Late, "ENGINE_V20260926", h("6")],
      ] as const) {
        await client.query(
          `insert into investing.research_validation_run_inputs_scientific_identities (
            research_validation_run_input_identity_id, tenant_id, principal_id, tenant_membership_id,
            research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
            operation, capability, operation_scope, source_context, fold_ordinal, phase,
            phase_research_ir_hash_hex, source_dataset_snapshot_hash_hex, phase_dataset_snapshot_hash_hex,
            engine_id, engine_version, metric_request_set_hash_hex, execution_config_hash_hex,
            hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
          ) values (
            $1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE',
            'TENANT_SCOPE','PURE_RESEARCH',0,'TRAINING',$8,$9,$10,'HISTORICAL_EXECUTION_ADAPTER',$11,
            $12,$13,'SHA-256','SYNTRAKE:VALIDATION_RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$14,'{}'::jsonb
          )`,
          [
            runInputId, ids.tenant, ids.principal, ids.membership, ids.investigation, protocolId, ids.experiment,
            h("A"), h("B"), h("C"), engineVersion, h("D"), h("E"), hashHex,
          ],
        );
        await client.query(
          `insert into investing.research_validation_execution_runs (
            research_validation_execution_run_id, tenant_id, principal_id, tenant_membership_id,
            research_investigation_id, research_validation_protocol_identity_id,
            research_validation_run_input_identity_id, fold_ordinal, phase, engine_id, engine_version,
            operation, capability, operation_scope, source_context, correlation_id
          ) values (
            $1,$2,$3,$4,$5,$6,$7,0,'TRAINING','HISTORICAL_EXECUTION_ADAPTER',$8,
            'RESEARCH_VALIDATION_CHILD_EXECUTE_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$9
          )`,
          [runId, ids.tenant, ids.principal, ids.membership, ids.investigation, protocolId, runInputId, engineVersion, `corr-${runId}`],
        );
      }

      await client.query(
        `insert into investing.research_validation_results_scientific_identities (
          research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id,
          research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
          operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version,
          hash_hex, canonical_payload
        ) values (
          $1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE',
          'TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_RESULT:V1','SYNTRAKE_SHA256_V1',$8,'{}'::jsonb
        )`,
        [
          ids.validationResult, ids.tenant, ids.principal, ids.membership, ids.investigation,
          ids.protocolV2, ids.experiment, h("7"),
        ],
      );
    } finally {
      await client.query("set session_replication_role = origin");
    }
  } finally {
    client.release();
  }
}

async function asApp<T>(operation: string, capability: "RESEARCH_MUTATE" | "RESEARCH_EXECUTE", fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role investing_app");
    const settings = {
      actor_kind: "USER_PRINCIPAL",
      actor_id: "pg17-rl3d",
      external_subject: "pg17-rl3d",
      principal_id: ids.principal,
      tenant_id: ids.tenant,
      account_id: "",
      tenant_membership_id: ids.membership,
      account_access_id: "",
      operation,
      capability,
      operation_scope: "TENANT_SCOPE",
      source_context: "PURE_RESEARCH",
      correlation_id: "corr-pg17-rl3d",
      research_investigation_id: ids.investigation,
    };
    for (const [key, value] of Object.entries(settings)) {
      await client.query("select set_config($1,$2,true)", [`syntrake.investing.${key}`, value]);
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertAssessmentProtocol(
  protocolId: string,
  validationProtocolHashHex: string,
  assessmentId: string = ids.assessmentProtocol,
  assessmentHashHex: string = h("8"),
) {
  return asApp("RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1", "RESEARCH_MUTATE", (client) =>
    client.query(
      `insert into investing.research_validation_assessment_protocols_scientific_identities (
        research_validation_assessment_protocol_identity_id, tenant_id, principal_id, tenant_membership_id,
        research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
        validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex,
        metric_registry_version, assessment_methodology, operation, capability, operation_scope, source_context,
        hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'METRIC_REGISTRY_V20260927',
        'VALIDATION_ASSESSMENT_METHODOLOGY_V20260929','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1',
        'RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256',
        'SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$11,$12::jsonb
      )`,
      [
        assessmentId, ids.tenant, ids.principal, ids.membership, ids.investigation, protocolId, ids.experiment,
        validationProtocolHashHex, h("E"), h("C"), assessmentHashHex,
        JSON.stringify(assessmentProtocolPayload(validationProtocolHashHex)),
      ],
    ));
}

describe("I5 RL-3D Validation Assessment PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED")
      .toMatch(/^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u);
  });
});

maybeDescribe("I5 RL-3D Validation Assessment real PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 6 });
    await resetAndMigrate();
    await seedPredecessorRows();
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("applies cumulative lineage through RL-3D with exact owner/RLS/grant surface", async () => {
    const client = await pool.connect();
    try {
      const version = await client.query<{ server_version: string }>("show server_version");
      expect(version.rows[0]!.server_version).toMatch(/^17\./u);

      const relations = await client.query<{
        relname: string;
        owner: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(`
        select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='investing'
          and c.relname in (
            'research_validation_assessment_protocols_scientific_identities',
            'research_validation_assessment_results_scientific_identities'
          )
        order by c.relname
      `);
      expect(relations.rows).toEqual([
        {
          relname: "research_validation_assessment_protocols_scientific_identities",
          owner: "investing_owner",
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: "research_validation_assessment_results_scientific_identities",
          owner: "investing_owner",
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
      ]);

      const forbidden = await client.query<{ count: string }>(`
        select count(*)::text as count
        from information_schema.role_table_grants
        where table_schema='investing'
          and table_name in (
            'research_validation_assessment_protocols_scientific_identities',
            'research_validation_assessment_results_scientific_identities'
          )
          and lower(grantee) in ('public','anon','authenticated','service_role')
      `);
      expect(forbidden.rows[0]!.count).toBe("0");

      const appGrants = await client.query<{ table_name: string; privilege_type: string }>(`
        select table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema='investing'
          and table_name in (
            'research_validation_assessment_protocols_scientific_identities',
            'research_validation_assessment_results_scientific_identities'
          )
          and grantee='investing_app'
        order by table_name, privilege_type
      `);
      expect(appGrants.rows).toEqual([
        { table_name: "research_validation_assessment_protocols_scientific_identities", privilege_type: "INSERT" },
        { table_name: "research_validation_assessment_protocols_scientific_identities", privilege_type: "SELECT" },
        { table_name: "research_validation_assessment_results_scientific_identities", privilege_type: "INSERT" },
        { table_name: "research_validation_assessment_results_scientific_identities", privilege_type: "SELECT" },
      ]);
    } finally {
      client.release();
    }
  });

  it("keeps exactly one permissive investing_app SELECT policy on each Validation relation after RL-3D consolidation", async () => {
    const client = await pool.connect();
    try {
      const policyCounts = await client.query<{ tablename: string; policy_count: string }>(`
        select t.tablename,
               count(p.policyname) filter (
                 where p.permissive='PERMISSIVE'
                   and p.cmd='SELECT'
                   and 'investing_app'=any(p.roles)
               )::text as policy_count
        from (
          values
            ('research_validation_protocols_scientific_identities'),
            ('research_validation_execution_runs'),
            ('research_validation_execution_run_events'),
            ('research_validation_results_scientific_identities'),
            ('research_validation_run_inputs_scientific_identities'),
            ('research_validation_child_results_scientific_identities'),
            ('research_validation_result_artifacts')
        ) as t(tablename)
        left join pg_policies p
          on p.schemaname='investing'
         and p.tablename=t.tablename
        group by t.tablename
        order by t.tablename
      `);

      expect(policyCounts.rows).toEqual([
        { tablename: "research_validation_child_results_scientific_identities", policy_count: "1" },
        { tablename: "research_validation_execution_run_events", policy_count: "1" },
        { tablename: "research_validation_execution_runs", policy_count: "1" },
        { tablename: "research_validation_protocols_scientific_identities", policy_count: "1" },
        { tablename: "research_validation_result_artifacts", policy_count: "1" },
        { tablename: "research_validation_results_scientific_identities", policy_count: "1" },
        { tablename: "research_validation_run_inputs_scientific_identities", policy_count: "1" },
      ]);

      const stale = await client.query<{ count: string }>(`
        select count(*)::text as count
        from pg_policies
        where schemaname='investing'
          and policyname in (
            'research_validation_protocols_rl3d_assessment_selector_read',
            'research_validation_runs_rl3d_protocol_create_read',
            'research_validation_events_rl3d_protocol_create_read',
            'research_validation_results_rl3d_assessment_read',
            'research_validation_run_inputs_rl3d_assessment_read',
            'research_validation_child_results_rl3d_assessment_read',
            'research_validation_artifacts_rl3d_assessment_read'
          )
      `);
      expect(stale.rows[0]!.count).toBe("0");

      const consolidated = await client.query<{ policyname: string; qual: string }>(`
        select policyname, qual
        from pg_policies
        where schemaname='investing'
          and policyname in (
            'research_validation_protocols_select',
            'research_validation_execution_runs_select',
            'research_validation_execution_run_events_select',
            'research_validation_results_select',
            'research_validation_run_inputs_select',
            'research_validation_child_results_select',
            'research_validation_result_artifacts_select'
          )
        order by policyname
      `);
      expect(consolidated.rows).toHaveLength(7);
      expect(consolidated.rows.find((row) => row.policyname === "research_validation_protocols_select")!.qual)
        .toContain("RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1");
      for (const policy of [
        "research_validation_results_select",
        "research_validation_run_inputs_select",
        "research_validation_child_results_select",
        "research_validation_result_artifacts_select",
      ]) {
        expect(consolidated.rows.find((row) => row.policyname === policy)!.qual)
          .toContain("RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1");
      }
    } finally {
      client.release();
    }
  });
  it("bootstraps Assessment authority from principal + Investigation before tenant context is known", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_app");
      const settings = {
        operation: "RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        operation_scope: "TENANT_SCOPE",
        source_context: "PURE_RESEARCH",
        account_id: "",
        account_access_id: "",
        principal_id: ids.principal,
        research_investigation_id: ids.investigation,
      };
      for (const [key, value] of Object.entries(settings)) {
        await client.query("select set_config($1,$2,true)", [`syntrake.investing.${key}`, value]);
      }

      const visible = await client.query<{
        tenant_id: string;
        tenant_membership_id: string;
        research_validation_protocol_identity_id: string;
      }>(
        [
          "select tenant_id::text, tenant_membership_id::text, research_validation_protocol_identity_id::text",
          "from investing.research_validation_protocols_scientific_identities",
          "where research_validation_protocol_identity_id=$1 and research_investigation_id=$2 and principal_id=$3",
        ].join(" "),
        [ids.protocolV2, ids.investigation, ids.principal],
      );
      expect(visible.rows).toEqual([{
        tenant_id: ids.tenant,
        tenant_membership_id: ids.membership,
        research_validation_protocol_identity_id: ids.protocolV2,
      }]);

      await client.query("select set_config($1,$2,true)", [
        "syntrake.investing.principal_id",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ]);
      const denied = await client.query(
        "select 1 from investing.research_validation_protocols_scientific_identities where research_validation_protocol_identity_id=$1",
        [ids.protocolV2],
      );
      expect(denied.rowCount).toBe(0);
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  it("rejects a V2 Assessment Protocol bound to historical V1 Validation lineage", async () => {
    await expect(insertAssessmentProtocol(
      ids.protocolV1,
      h("1"),
      "99999999-0000-4000-8000-0000000003d3",
      h("C"),
    )).rejects.toThrow("RL-3D Assessment Protocol parent scientific lineage mismatch");
  });

  it("preserves V1 Validation registration but requires Assessment Protocol before V2 registration", async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(
        "insert into investing.research_validation_execution_run_events (research_validation_execution_run_id,sequence,event_type,previous_event_type,failure_code) values ($1,1,'REGISTERED',null,null)",
        [ids.runV1],
      )).resolves.toBeDefined();

      await expect(client.query(
        "insert into investing.research_validation_execution_run_events (research_validation_execution_run_id,sequence,event_type,previous_event_type,failure_code) values ($1,1,'REGISTERED',null,null)",
        [ids.runV2],
      )).rejects.toThrow("RL-3D authoritative Assessment Protocol required before V2 VALIDATION_RUN_REGISTERED");
    } finally {
      client.release();
    }
  });

  it("accepts a unique V2 Assessment Protocol before registration and then permits REGISTERED", async () => {
    await insertAssessmentProtocol(ids.protocolV2, h("2"));

    const client = await pool.connect();
    try {
      await expect(client.query(
        "insert into investing.research_validation_execution_run_events (research_validation_execution_run_id,sequence,event_type,previous_event_type,failure_code) values ($1,1,'REGISTERED',null,null)",
        [ids.runV2],
      )).resolves.toBeDefined();

      const count = await client.query<{ count: string }>(
        "select count(*)::text as count from investing.research_validation_assessment_protocols_scientific_identities where research_validation_protocol_identity_id=$1",
        [ids.protocolV2],
      );
      expect(count.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });

  it("rejects first Assessment Protocol creation after the first V2 REGISTERED event", async () => {
    const client = await pool.connect();
    try {
      await client.query("set session_replication_role = replica");
      await client.query(
        "insert into investing.research_validation_execution_run_events (research_validation_execution_run_id,sequence,event_type,previous_event_type,failure_code) values ($1,1,'REGISTERED',null,null)",
        [ids.runV2Late],
      );
      await client.query("set session_replication_role = origin");
    } finally {
      client.release();
    }

    await expect(insertAssessmentProtocol(
      ids.protocolV2Late,
      h("3"),
      "99999999-0000-4000-8000-0000000003d2",
      h("9"),
    )).rejects.toThrow("RL-3D Assessment Protocol must exist before first VALIDATION_RUN_REGISTERED");
  });

  it("persists Assessment Result under exact lineage and keeps both assessment relations append-only", async () => {
    await expect(
      asApp("RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1", "RESEARCH_MUTATE", async (client) => {
        const wrongValidationResultHash = h("D");
        await client.query(
          `insert into investing.research_validation_assessment_results_scientific_identities (
            research_validation_assessment_result_identity_id, tenant_id, principal_id, tenant_membership_id,
            research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
            research_validation_assessment_protocol_identity_id, research_validation_result_identity_id,
            assessment_protocol_hash_hex, validation_protocol_hash_hex, validation_result_hash_hex,
            subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, outcome,
            operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version,
            hash_hex, canonical_payload
          ) values (
            'bbbbbbbb-0000-4000-8000-0000000003d2',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
            'METRIC_REGISTRY_V20260927','PASS',
            'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
            'SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1','SYNTRAKE_SHA256_V1',$14,$15::jsonb
          )`,
          [
            ids.tenant, ids.principal, ids.membership, ids.investigation, ids.protocolV2, ids.experiment,
            ids.assessmentProtocol, ids.validationResult, h("8"), h("2"), wrongValidationResultHash,
            h("E"), h("C"), h("B"),
            JSON.stringify(assessmentResultPayload(h("8"), h("2"), wrongValidationResultHash)),
          ],
        );
      }),
    ).rejects.toThrow("RL-3D Assessment Result parent scientific lineage mismatch");

    await asApp("RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1", "RESEARCH_MUTATE", async (client) => {
      await client.query(
        `insert into investing.research_validation_assessment_results_scientific_identities (
          research_validation_assessment_result_identity_id, tenant_id, principal_id, tenant_membership_id,
          research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
          research_validation_assessment_protocol_identity_id, research_validation_result_identity_id,
          assessment_protocol_hash_hex, validation_protocol_hash_hex, validation_result_hash_hex,
          subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, outcome,
          operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version,
          hash_hex, canonical_payload
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'METRIC_REGISTRY_V20260927','PASS',
          'RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
          'SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1','SYNTRAKE_SHA256_V1',$15,$16::jsonb
        )`,
        [
          ids.assessmentResult, ids.tenant, ids.principal, ids.membership, ids.investigation,
          ids.protocolV2, ids.experiment, ids.assessmentProtocol, ids.validationResult,
          h("8"), h("2"), h("7"), h("E"), h("C"), h("A"),
          JSON.stringify(assessmentResultPayload(h("8"), h("2"), h("7"))),
        ],
      );
    });

    const client = await pool.connect();
    try {
      await expect(client.query(
        "update investing.research_validation_assessment_protocols_scientific_identities set hash_hex=$1 where research_validation_assessment_protocol_identity_id=$2",
        [h("B"), ids.assessmentProtocol],
      )).rejects.toThrow("research validation records are append-only");

      await expect(client.query(
        "delete from investing.research_validation_assessment_results_scientific_identities where research_validation_assessment_result_identity_id=$1",
        [ids.assessmentResult],
      )).rejects.toThrow("research validation records are append-only");
    } finally {
      client.release();
    }
  });
});
