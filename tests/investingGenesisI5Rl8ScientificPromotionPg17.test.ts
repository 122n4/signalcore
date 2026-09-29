import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationPath = "supabase/migrations/20260928195500_investing_i5_rl8_scientific_promotion_v1.sql";
const h = (char: string) => char.repeat(64).slice(0, 64).toUpperCase();

let pool: Pool;
let client: PoolClient;

const ids = {
  tenant: "20000000-0000-4000-8000-0000000008a1",
  tenantB: "20000000-0000-4000-8000-0000000008b1",
  principal: "10000000-0000-4000-8000-0000000008a1",
  principalB: "10000000-0000-4000-8000-0000000008b1",
  membership: "30000000-0000-4000-8000-0000000008a1",
  membershipB: "30000000-0000-4000-8000-0000000008b1",
  investigationA: "60000000-0000-4000-8000-0000000008a1",
  investigationB: "60000000-0000-4000-8000-0000000008a2",
  investigationForeign: "60000000-0000-4000-8000-0000000008b1",
};

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function resetDatabase() {
  await client.query("drop schema if exists investing cascade");
  await client.query("drop role if exists investing_app");
  await client.query("drop role if exists investing_owner");
  await client.query("create role investing_owner nologin");
  await client.query("create role investing_app nologin");
  await client.query("grant investing_owner to postgres");
  await client.query("create extension if not exists pgcrypto");
  await client.query("create schema investing authorization investing_owner");
  await client.query("set role investing_owner");
  await client.query(`
    create table investing.tenant_memberships (
      tenant_membership_id uuid not null,
      tenant_id uuid not null,
      principal_id uuid not null,
      primary key (tenant_membership_id, tenant_id, principal_id)
    );
    create table investing.research_experiment_comparison_results_scientific_identities (
      experiment_comparison_result_identity_id uuid primary key default gen_random_uuid()
    );
  `);
  await client.query("reset role");
  await client.query("insert into investing.tenant_memberships values ($1,$2,$3),($4,$5,$6)", [
    ids.membership,
    ids.tenant,
    ids.principal,
    ids.membershipB,
    ids.tenantB,
    ids.principalB,
  ]);
}

async function setAppContext(overrides: Partial<typeof ids> & { operation?: string; capability?: string; investigation?: string } = {}) {
  await client.query("set local role investing_app");
  const values = {
    operation: overrides.operation ?? "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1",
    capability: overrides.capability ?? "RESEARCH_MUTATE",
    tenant_id: overrides.tenant ?? ids.tenant,
    principal_id: overrides.principal ?? ids.principal,
    tenant_membership_id: overrides.membership ?? ids.membership,
    research_investigation_id: overrides.investigation ?? ids.investigationA,
  };
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

async function inAppTx<T>(fn: () => Promise<T>, overrides: Parameters<typeof setAppContext>[0] = {}) {
  await client.query("begin");
  try {
    await setAppContext(overrides);
    const result = await fn();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function persistProtocol(investigation = ids.investigationA) {
  return inAppTx(async () => {
    const result = await client.query<{ scientific_promotion_protocol_identity_id: string; persistence_status: string }>(
      "select * from investing.persist_research_scientific_promotion_protocol_v1($1,$2::jsonb)",
      [h("A"), JSON.stringify({ schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1" })],
    );
    return result.rows[0]!;
  }, { investigation });
}

async function recordTransition(input: {
  protocolId: string;
  hash: string;
  chain: string;
  root?: string | null;
  predecessor?: string | null;
  predecessorState?: string | null;
  state?: string;
  successorRoot?: string | null;
  successorHash?: string | null;
}) {
  return inAppTx(async () => {
    const result = await client.query<{ scientific_promotion_transition_id: string; persistence_status: string }>(
      "select * from investing.record_research_scientific_promotion_transition_v1($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15::jsonb)",
      [
        input.protocolId,
        input.hash,
        h("A"),
        input.chain,
        input.root ?? null,
        input.predecessor ?? null,
        input.predecessorState ?? null,
        input.state ?? "PROMOTION_ELIGIBLE",
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        input.successorRoot ? h("A") : null,
        input.successorRoot ?? null,
        input.successorHash ?? null,
        JSON.stringify({ hash: input.hash, chain: input.chain }),
      ],
    );
    return result.rows[0]!;
  }, { operation: "RESEARCH_SCIENTIFIC_PROMOTION_TRANSITION_RECORD_V1" });
}

maybeDescribe("I5 RL-8 Scientific Promotion PG17 physical closure", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
    await resetDatabase();
    await client.query(readSql(migrationPath));
  }, 120_000);

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("applies on PostgreSQL 17 with owner, RLS, FORCE RLS and exact forbidden grants", async () => {
    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]?.server_version).toMatch(/^17\./);
    const tables = await client.query<{ relname: string; owner: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select c.relname, r.rolname as owner, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
      where n.nspname='investing' and c.relname in ('research_scientific_promotion_protocols','research_scientific_promotion_transitions')
      order by c.relname
    `);
    expect(tables.rows).toHaveLength(2);
    expect(tables.rows.every((row) => row.owner === "investing_owner" && row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const forbidden = await client.query<{ count: string }>(`
      select count(*)::text as count from information_schema.role_table_grants
      where table_schema='investing'
        and table_name in ('research_scientific_promotion_protocols','research_scientific_promotion_transitions')
        and grantee in ('PUBLIC','anon','authenticated','service_role')
    `);
    expect(forbidden.rows[0]?.count).toBe("0");
  });

  it("physically proves protocol reuse, roots, retries, successors, supersession and negative probes", async () => {
    const protocolA = await persistProtocol(ids.investigationA);
    const protocolAReplay = await persistProtocol(ids.investigationA);
    const protocolB = await persistProtocol(ids.investigationB);
    expect(protocolAReplay).toEqual({ ...protocolA, persistence_status: "REUSED_IDENTICAL" });
    expect(protocolB.scientific_promotion_protocol_identity_id).not.toBe(protocolA.scientific_promotion_protocol_identity_id);

    const root = await recordTransition({ protocolId: protocolA.scientific_promotion_protocol_identity_id, hash: h("B"), chain: h("1") });
    await expect(recordTransition({ protocolId: protocolA.scientific_promotion_protocol_identity_id, hash: h("C"), chain: h("1") })).rejects.toThrow(/DIVERGENT_EXISTING_IDENTITY/);
    const retry = await recordTransition({ protocolId: protocolA.scientific_promotion_protocol_identity_id, hash: h("B"), chain: h("1") });
    expect(retry).toEqual({ ...root, persistence_status: "REUSED_IDENTICAL" });

    const successor = await recordTransition({
      protocolId: protocolA.scientific_promotion_protocol_identity_id,
      hash: h("D"),
      chain: h("1"),
      root: root.scientific_promotion_transition_id,
      predecessor: root.scientific_promotion_transition_id,
      predecessorState: "PROMOTION_ELIGIBLE",
      state: "INVALIDATED",
    });
    await expect(recordTransition({
      protocolId: protocolA.scientific_promotion_protocol_identity_id,
      hash: h("E"),
      chain: h("1"),
      root: root.scientific_promotion_transition_id,
      predecessor: root.scientific_promotion_transition_id,
      predecessorState: "PROMOTION_ELIGIBLE",
      state: "INVALIDATED",
    })).rejects.toThrow(/DIVERGENT_EXISTING_IDENTITY/);

    const newRoot = await recordTransition({ protocolId: protocolA.scientific_promotion_protocol_identity_id, hash: h("F"), chain: h("2") });
    await recordTransition({
      protocolId: protocolA.scientific_promotion_protocol_identity_id,
      hash: h("7"),
      chain: h("1"),
      root: root.scientific_promotion_transition_id,
      predecessor: successor.scientific_promotion_transition_id,
      predecessorState: "INVALIDATED",
      state: "SUPERSEDED",
      successorRoot: newRoot.scientific_promotion_transition_id,
      successorHash: h("F"),
    });
    await expect(recordTransition({
      protocolId: protocolA.scientific_promotion_protocol_identity_id,
      hash: h("8"),
      chain: h("2"),
      successorRoot: newRoot.scientific_promotion_transition_id,
      successorHash: h("F"),
      state: "SUPERSEDED",
    })).rejects.toThrow(/RL8_SCIENTIFIC_PROMOTION_SUPERSESSION_CYCLE|RL8_SCIENTIFIC_PROMOTION_SUPERSESSION_INVALID/);
  }, 120_000);
});
