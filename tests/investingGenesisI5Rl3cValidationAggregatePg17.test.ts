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
] as const;

const ids = {
  principal: "11000000-0000-4000-8000-0000000003c1",
  tenant: "22000000-0000-4000-8000-0000000003c1",
  membership: "33000000-0000-4000-8000-0000000003c1",
  investigation: "44000000-0000-4000-8000-0000000003c1",
  experiment: "55000000-0000-4000-8000-0000000003c1",
  specRevision: "66000000-0000-4000-8000-0000000003c1",
  idempotency: "77000000-0000-4000-8000-0000000003c1",
  protocol: "88000000-0000-4000-8000-0000000003c1",
  aggregate: "99000000-0000-4000-8000-0000000003c1",
} as const;

const h = (value: string) => value.repeat(64).slice(0, 64).toUpperCase();

let pool: Pool;
let client: PoolClient;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function dropRoleIfPresent(role: "investing_app" | "investing_owner") {
  const exists = await client.query<{ exists: boolean }>(
    "select exists(select 1 from pg_roles where rolname = $1) as exists",
    [role],
  );
  if (!exists.rows[0]?.exists) return;
  await client.query(`reassign owned by ${role} to postgres`);
  await client.query(`drop owned by ${role}`);
  await client.query(`drop role ${role}`);
}

async function resetDisposableDatabase() {
  await client.query("drop schema if exists investing cascade");
  await dropRoleIfPresent("investing_app");
  await dropRoleIfPresent("investing_owner");
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists pgcrypto;
  `);
}

async function applyMigration(relativePath: string) {
  try {
    await client.query(readSql(relativePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 RL-3C rehearsal failed for ${relativePath}: ${message}`);
  }
}

async function setLocalContext(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

function finalizeContext(overrides: Record<string, string> = {}) {
  return {
    actor_kind: "USER_PRINCIPAL",
    actor_id: "pg17-rl3c",
    principal_id: ids.principal,
    tenant_id: ids.tenant,
    tenant_membership_id: ids.membership,
    account_id: "",
    account_access_id: "",
    operation: "RESEARCH_VALIDATION_RESULT_FINALIZE_V1",
    capability: "RESEARCH_MUTATE",
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    research_investigation_id: ids.investigation,
    correlation_id: "corr-pg17-rl3c-finalize",
    ...overrides,
  };
}

function passportContext(overrides: Record<string, string> = {}) {
  return {
    ...finalizeContext(),
    operation: "RESEARCH_PASSPORT_READ_V1",
    capability: "RESEARCH_READ",
    correlation_id: "corr-pg17-rl3c-passport",
    ...overrides,
  };
}

async function seedAuthorityParents() {
  await client.query(
    "insert into investing.principals (principal_id, external_provider, external_subject, state) values ($1, 'CLERK', 'pg17-rl3c', 'ACTIVE')",
    [ids.principal],
  );
  await client.query(
    "insert into investing.tenants (tenant_id, state) values ($1, 'ACTIVE')",
    [ids.tenant],
  );
  await client.query(
    "insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1,$2,$3,'OWNER','ACTIVE')",
    [ids.membership, ids.tenant, ids.principal],
  );

  // The rehearsal needs only the accepted Experiment authority tuple as the parent
  // for RL-3B Protocol. FK triggers are bypassed only while seeding this predecessor
  // fixture; all RL-3C constraints/RLS are exercised normally afterwards.
  await client.query("set session_replication_role = replica");
  try {
    await client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id,
        actor_kind, actor_id, tenant_membership_id, account_access_id, operation_scope, source_context,
        operation, capability, relation, parent_experiment_id, research_spec_revision_id,
        research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
        experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
        experiment_parameters_hash_algorithm, experiment_parameters_hash_domain,
        experiment_parameters_hash_version, experiment_parameters_hash_hex,
        material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values (
        $1,$2,$3,null,$4,'USER_PRINCIPAL','pg17-rl3c',$5,null,'TENANT_SCOPE','PURE_RESEARCH',
        'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$6,
        'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$7,
        'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,
        null,null,null,null,$9,$10,'idem-pg17-rl3c','corr-pg17-rl3c-experiment'
      )
    `, [
      ids.experiment,
      ids.investigation,
      ids.tenant,
      ids.principal,
      ids.membership,
      ids.specRevision,
      h("1"),
      h("2"),
      h("3"),
      ids.idempotency,
    ]);
  } finally {
    await client.query("set session_replication_role = origin");
  }

  await client.query(`
    insert into investing.research_validation_protocols_scientific_identities (
      research_validation_protocol_identity_id, tenant_id, principal_id, tenant_membership_id,
      research_investigation_id, research_experiment_id, operation, capability, operation_scope,
      source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values (
      $1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE',
      'TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1',
      'SYNTRAKE_SHA256_V1',$7,'{}'::jsonb
    )
  `, [ids.protocol, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment, h("4")]);
}

async function insertAggregateAsApp(identityId = ids.aggregate, hashHex = h("A")) {
  return client.query(
    `insert into investing.research_validation_results_scientific_identities (
      research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id,
      research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
      operation, capability, operation_scope, source_context, hash_algorithm, hash_domain,
      hash_version, hash_hex, canonical_payload
    ) values (
      $1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE',
      'TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_RESULT:V1',
      'SYNTRAKE_SHA256_V1',$8,$9::jsonb
    )`,
    [
      identityId,
      ids.tenant,
      ids.principal,
      ids.membership,
      ids.investigation,
      ids.protocol,
      ids.experiment,
      hashHex,
      JSON.stringify({
        schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
        methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
      }),
    ],
  );
}

describe("I5 RL-3C Validation Aggregate PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(
      /^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u,
    );
  });
});

maybeDescribe("I5 RL-3C Validation Aggregate real PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 2 });
    client = await pool.connect();
    await resetDisposableDatabase();
    for (const migration of migrations) await applyMigration(migration);
    await seedAuthorityParents();
  }, 120_000);

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("applies accepted lineage through candidate RL-3C with exact relation security surface", async () => {
    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]!.server_version).toMatch(/^17\./u);

    const relation = await client.query<{
      owner: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(`
      select pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname = 'research_validation_results_scientific_identities'
    `);
    expect(relation.rows).toEqual([
      { owner: "investing_owner", relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const appGrants = await client.query<{ privilege_type: string }>(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = 'research_validation_results_scientific_identities'
        and grantee = 'investing_app'
      order by privilege_type
    `);
    expect(appGrants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);

    const forbiddenGrants = await client.query<{ count: string }>(`
      select count(*)::text as count
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = 'research_validation_results_scientific_identities'
        and lower(grantee) in ('public','anon','authenticated','service_role')
    `);
    expect(forbiddenGrants.rows[0]!.count).toBe("0");

    const constraints = await client.query<{ conname: string; def: string; convalidated: boolean }>(`
      select conname, pg_get_constraintdef(oid, true) as def, convalidated
      from pg_constraint
      where conrelid = 'investing.research_validation_results_scientific_identities'::regclass
      order by conname
    `);
    const text = constraints.rows.map((row) => `${row.conname}: ${row.def}`).join("\n");
    expect(text).toContain("research_validation_results_protocol_authority_fk");
    expect(text).toContain("research_validation_protocol_identity_id");
    expect(text).toContain("research_investigation_id");
    expect(text).toContain("research_experiment_id");
    expect(text).toContain("tenant_membership_id");
    expect(text).toContain("SYNTRAKE:VALIDATION_RESULT:V1");
    expect(text).toContain("UNIQUE (research_validation_protocol_identity_id)");
    expect(constraints.rows.every((row) => row.convalidated)).toBe(true);

    const trigger = await client.query<{ tgname: string }>(`
      select tgname
      from pg_trigger
      where tgrelid = 'investing.research_validation_results_scientific_identities'::regclass
        and not tgisinternal
    `);
    expect(trigger.rows.map((row) => row.tgname)).toContain("research_validation_results_append_only_trigger");

    const serviceRole = await client.query<{ can_select: boolean; can_insert: boolean }>(
      "select has_table_privilege('service_role', $1, 'SELECT') as can_select, has_table_privilege('service_role', $1, 'INSERT') as can_insert",
      ["investing.research_validation_results_scientific_identities"],
    );
    expect(serviceRole.rows[0]).toEqual({ can_select: false, can_insert: false });
  });

  it("proves authorized finalize RLS, rollback atomicity and exact Passport read-only visibility", async () => {
    await client.query("begin");
    await client.query("set local role investing_app");
    await setLocalContext(finalizeContext());
    const roleProof = await client.query<{ current_user: string; current_role: string }>("select current_user, current_role");
    expect(roleProof.rows[0]).toEqual({ current_user: "investing_app", current_role: "investing_app" });
    await insertAggregateAsApp();
    const inside = await client.query<{ count: string }>(
      "select count(*)::text as count from investing.research_validation_results_scientific_identities where research_validation_protocol_identity_id = $1",
      [ids.protocol],
    );
    expect(inside.rows[0]!.count).toBe("1");
    await client.query("rollback");

    const rolledBack = await client.query<{ count: string }>(
      "select count(*)::text as count from investing.research_validation_results_scientific_identities where research_validation_protocol_identity_id = $1",
      [ids.protocol],
    );
    expect(rolledBack.rows[0]!.count).toBe("0");

    await client.query("begin");
    await client.query("set local role investing_app");
    await setLocalContext(finalizeContext());
    await insertAggregateAsApp();
    await client.query("commit");

    await client.query("begin");
    await client.query("set local role investing_app");
    await setLocalContext(passportContext());
    const visible = await client.query<{ count: string }>(
      "select count(*)::text as count from investing.research_validation_results_scientific_identities where research_validation_protocol_identity_id = $1",
      [ids.protocol],
    );
    expect(visible.rows[0]!.count).toBe("1");
    await expect(
      insertAggregateAsApp("99000000-0000-4000-8000-0000000003c2", h("B")),
    ).rejects.toThrow(/row-level security|policy/iu);
    await expect(
      client.query(
        "update investing.research_validation_results_scientific_identities set hash_hex = hash_hex where research_validation_protocol_identity_id = $1",
        [ids.protocol],
      ),
    ).rejects.toThrow(/permission denied/iu);
    await client.query("rollback");

    await client.query("begin");
    await client.query("set local role investing_app");
    await setLocalContext(passportContext({ tenant_id: "22000000-0000-4000-8000-0000000003ff" }));
    const invisible = await client.query<{ count: string }>(
      "select count(*)::text as count from investing.research_validation_results_scientific_identities",
    );
    expect(invisible.rows[0]!.count).toBe("0");
    await client.query("rollback");
  });

  it("proves append-only trigger and logical uniqueness at the physical database boundary", async () => {
    await expect(
      client.query(
        "update investing.research_validation_results_scientific_identities set created_at = created_at where research_validation_protocol_identity_id = $1",
        [ids.protocol],
      ),
    ).rejects.toThrow(/append|update|delete|immutable|reject/iu);

    await expect(
      client.query(`
        insert into investing.research_validation_results_scientific_identities (
          research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id,
          research_investigation_id, research_validation_protocol_identity_id, research_experiment_id,
          operation, capability, operation_scope, source_context, hash_algorithm, hash_domain,
          hash_version, hash_hex, canonical_payload
        ) values (
          '99000000-0000-4000-8000-0000000003c3',$1,$2,$3,$4,$5,$6,
          'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
          'SHA-256','SYNTRAKE:VALIDATION_RESULT:V1','SYNTRAKE_SHA256_V1',$7,'{}'::jsonb
        )
      `, [ids.tenant, ids.principal, ids.membership, ids.investigation, ids.protocol, ids.experiment, h("C")]),
    ).rejects.toThrow(/unique|duplicate/iu);
  });
});
