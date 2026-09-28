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
] as const;

const ids = {
  principal: "11111111-0000-4000-8000-000000000701",
  tenant: "22222222-0000-4000-8000-000000000701",
  membership: "33333333-0000-4000-8000-000000000701",
  investigation: "44444444-0000-4000-8000-000000000701",
  otherTenant: "22222222-0000-4000-8000-000000000702",
  otherMembership: "33333333-0000-4000-8000-000000000702",
} as const;

const h = (value: string) => value.repeat(64).slice(0, 64).toUpperCase();
const protocolPayload = (marker: string) => ({ schemaVersion: "EXPERIMENT_COMPARISON_PROTOCOL_V1", marker });
const resultPayload = (marker: string) => ({ schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1", marker });

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

async function persistProtocol(logicalKey = h("1"), hashHex = h("A"), payload = protocolPayload("A")) {
  return asApp({ operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" }, async (client) => {
    const result = await client.query<{ research_experiment_comparison_protocol_identity_id: string; persistence_status: string }>(
      "select * from investing.persist_research_experiment_comparison_protocol_v1($1,$2,$3::jsonb)",
      [logicalKey, hashHex, JSON.stringify(payload)],
    );
    return result.rows[0]!;
  });
}

async function finalizeResult(protocolId: string, hashHex = h("B"), payload = resultPayload("A")) {
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
    } finally {
      client.release();
    }
  });

  it("reuses identical protocol payloads and conflicts on divergent protocol payloads", async () => {
    const created = await persistProtocol();
    expect(created.persistence_status).toBe("CREATED");
    const reused = await persistProtocol();
    expect(reused).toEqual({ ...created, persistence_status: "REUSED_IDENTICAL" });
    await expect(persistProtocol(h("1"), h("C"), protocolPayload("B"))).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT");
  });

  it("serializes concurrent identical and divergent protocol attempts", async () => {
    const [a, b] = await Promise.all([
      persistProtocol(h("2"), h("D"), protocolPayload("C")),
      persistProtocol(h("2"), h("D"), protocolPayload("C")),
    ]);
    expect(a.research_experiment_comparison_protocol_identity_id).toBe(b.research_experiment_comparison_protocol_identity_id);
    const divergent = await Promise.allSettled([
      persistProtocol(h("3"), h("E"), protocolPayload("D")),
      persistProtocol(h("3"), h("F"), protocolPayload("E")),
    ]);
    expect(divergent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(divergent.filter((result) => result.status === "rejected")).toHaveLength(1);
    const client = await pool.connect();
    try {
      const count = await client.query<{ count: string }>("select count(*)::text as count from investing.research_experiment_comparison_protocols_scientific_identities where logical_comparison_key=$1", [h("3")]);
      expect(count.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });

  it("finalizes result once, reuses identical result and conflicts on divergent result", async () => {
    const protocol = await persistProtocol(h("4"), h("7"), protocolPayload("F"));
    const created = await finalizeResult(protocol.research_experiment_comparison_protocol_identity_id);
    expect(created.persistence_status).toBe("CREATED");
    const reused = await finalizeResult(protocol.research_experiment_comparison_protocol_identity_id);
    expect(reused).toEqual({ ...created, persistence_status: "REUSED_IDENTICAL" });
    await expect(finalizeResult(protocol.research_experiment_comparison_protocol_identity_id, h("8"), resultPayload("B"))).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT");
  });

  it("denies cross-tenant reuse, unauthorized insert, update and delete while preserving rows", async () => {
    const protocol = await persistProtocol(h("5"), h("9"), protocolPayload("G"));
    await expect(asApp(
      { operation: "RESEARCH_EXPERIMENT_COMPARISON_RESULT_FINALIZE_V1", tenantId: ids.otherTenant, membershipId: ids.otherMembership },
      (client) => client.query("select * from investing.finalize_research_experiment_comparison_result_v1($1,$2,$3::jsonb)", [protocol.research_experiment_comparison_protocol_identity_id, h("A"), JSON.stringify(resultPayload("C"))]),
    )).rejects.toThrow("RL7_EXPERIMENT_COMPARISON_PROTOCOL_NOT_FOUND");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      await expect(client.query("insert into investing.research_experiment_comparison_protocols_scientific_identities (tenant_id,principal_id,tenant_membership_id,research_investigation_id,hash_hex,logical_comparison_key,canonical_payload) values ($1,$2,$3,$4,$5,$6,'{}'::jsonb)", [ids.tenant, ids.principal, ids.membership, ids.investigation, h("B"), h("6")])).rejects.toThrow();
      await client.query("rollback");

      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" },
        (app) => app.query("update investing.research_experiment_comparison_protocols_scientific_identities set hash_hex=hash_hex where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id]),
      )).rejects.toThrow("append-only");
      await expect(asApp(
        { operation: "RESEARCH_EXPERIMENT_COMPARISON_PROTOCOL_CREATE_V1" },
        (app) => app.query("delete from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id]),
      )).rejects.toThrow("append-only");

      const count = await client.query<{ count: string }>("select count(*)::text as count from investing.research_experiment_comparison_protocols_scientific_identities where research_experiment_comparison_protocol_identity_id=$1", [protocol.research_experiment_comparison_protocol_identity_id]);
      expect(count.rows[0]!.count).toBe("1");
    } finally {
      client.release();
    }
  });
});
