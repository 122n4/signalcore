import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { canonicalBlindTruthProtocolV1, hashBlindTruthProtocolV1 } from "../lib/investing/research/blindTruth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationName = "20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql";
const migrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort()
  .map((name) => path.join(repoRoot, "supabase", "migrations", name));

let pool: Pool | null = null;

const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  investigationId: "44444444-4444-4444-8444-444444444444",
  idempotencyRecordId: "55555555-5555-4555-8555-555555555555",
};
const protocolPayload = canonicalBlindTruthProtocolV1();
const protocolHash = hashBlindTruthProtocolV1().hashHex;

async function resetDatabase(): Promise<void> {
  if (!pool) return;
  for (const migration of migrations) {
    await pool.query(fs.readFileSync(migration, "utf8"));
  }
  await seedAuthorityScope(pool);
}

async function seedAuthorityScope(client: Pool): Promise<void> {
  await client.query(
    `insert into investing.principals (principal_id, external_provider, external_subject) values ($1::uuid, 'CLERK', 'rl9b-pg17-principal') on conflict do nothing`,
    [authority.principalId],
  );
  await client.query(`insert into investing.tenants (tenant_id) values ($1::uuid) on conflict do nothing`, [authority.tenantId]);
  await client.query(
    `insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1::uuid, $2::uuid, $3::uuid, 'OWNER', 'ACTIVE') on conflict do nothing`,
    [authority.membershipId, authority.tenantId, authority.principalId],
  );
  await client.query(
    `insert into investing.idempotency_records (idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id)
     values ($1::uuid, 'rl9b-pg17-idempotency-key', repeat('A',64), 'rl9b-pg17-correlation', 'USER_PRINCIPAL', ($2::uuid)::text, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', $2::uuid, $3::uuid)
     on conflict do nothing`,
    [authority.idempotencyRecordId, authority.principalId, authority.tenantId],
  );
  await client.query(
    `insert into investing.research_investigations (research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id)
     values ($1::uuid, $2::uuid, $3::uuid, 'USER_PRINCIPAL', ($3::uuid)::text, $4::uuid, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', repeat('B',64), $5::uuid, 'rl9b-pg17-idempotency-key', 'rl9b-pg17-correlation')
     on conflict do nothing`,
    [authority.investigationId, authority.tenantId, authority.principalId, authority.membershipId, authority.idempotencyRecordId],
  );
}

async function setAppAuthority(client: PoolClient, operation: string): Promise<void> {
  await client.query("set local role investing_app");
  await client.query(
    `select set_config('syntrake.investing.operation', $1, true),
            set_config('syntrake.investing.capability', 'RESEARCH_MUTATE', true),
            set_config('syntrake.investing.operation_scope', 'TENANT_SCOPE', true),
            set_config('syntrake.investing.source_context', 'PURE_RESEARCH', true),
            set_config('syntrake.investing.tenant_id', $2, true),
            set_config('syntrake.investing.principal_id', $3, true),
            set_config('syntrake.investing.tenant_membership_id', $4, true),
            set_config('syntrake.investing.research_investigation_id', $5, true)`,
    [operation, authority.tenantId, authority.principalId, authority.membershipId, authority.investigationId],
  );
}

maybeDescribe("I5 RL-9B2 Blind Truth PG17 writer ACLs", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 2 });
    await resetDatabase();
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
  });

  it("allows investing_app only the RL-9B public protocol and registration writers", async () => {
    const { rows } = await pool!.query(`
      select p.proname, has_function_privilege('investing_app', p.oid, 'EXECUTE') as app_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             p.prosecdef,
             pg_get_userbyid(p.proowner) as owner,
             p.proconfig,
             pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'investing' and p.proname like 'persist_research_blind_truth_%_v1'
      order by p.proname
    `);
    expect(rows.map((row) => row.proname)).toEqual([
      "persist_research_blind_truth_evaluation_v1",
      "persist_research_blind_truth_final_event_v1",
      "persist_research_blind_truth_protocol_v1",
      "persist_research_blind_truth_registration_v1",
      "persist_research_blind_truth_reveal_started_v1",
      "persist_research_blind_truth_vault_seal_v1",
    ]);
    expect(rows.filter((row) => row.app_execute).map((row) => row.proname).sort()).toEqual([
      "persist_research_blind_truth_protocol_v1",
      "persist_research_blind_truth_registration_v1",
    ]);
    expect(rows.every((row) => !row.service_execute && !row.anon_execute && row.prosecdef && row.owner === "investing_rl9_writer" && String(row.proconfig).includes("search_path=pg_catalog"))).toBe(true);
  });

  it("keeps investing_rl9_writer hardened and outside forbidden memberships", async () => {
    const role = await pool!.query(`
      select rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles where rolname = 'investing_rl9_writer'
    `);
    expect(role.rows).toEqual([{ rolcanlogin: false, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
    const memberships = await pool!.query(`
      select pg_has_role('investing_app','investing_rl9_writer','member') as app_member,
             pg_has_role('service_role','investing_rl9_writer','member') as service_member,
             pg_has_role('investing_rl9_writer','investing_owner','member') as owner_member,
             pg_has_role('postgres','investing_rl9_writer','member') as postgres_member,
             has_schema_privilege('investing_rl9_writer','investing','CREATE') as writer_can_create
    `);
    expect(memberships.rows[0]).toEqual({ app_member: false, service_member: false, owner_member: false, postgres_member: false, writer_can_create: false });
  });


  it("persists current protocol through investing_app and reuses identical protocol deterministically", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await setAppAuthority(client, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1");
      const created = await client.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      expect(created.rows[0].result.status).toBe("CREATED");
      const reused = await client.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      expect(reused.rows[0].result.status).toBe("REUSED_IDENTICAL");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  it("uses real separate database connections for concurrent identical protocol replay", async () => {
    const [first, second] = await Promise.all([pool!.connect(), pool!.connect()]);
    try {
      await Promise.all([first.query("begin"), second.query("begin")]);
      await Promise.all([
        setAppAuthority(first, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1"),
        setAppAuthority(second, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1"),
      ]);
      const [left, right] = await Promise.all([
        first.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]),
        second.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]),
      ]);
      expect([left.rows[0].result.status, right.rows[0].result.status].sort()).toEqual(["REUSED_IDENTICAL", "REUSED_IDENTICAL"]);
      await Promise.all([first.query("commit"), second.query("commit")]);
      const count = await pool!.query(`select count(*)::int as count from investing.research_blind_truth_protocols_scientific_identities where hash_hex = $1`, [protocolHash]);
      expect(count.rows[0].count).toBe(1);
    } catch (error) {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("proves RL-9 writer can execute exact RL-8 canonical helpers without widening app/service execution", async () => {
    const grants = await pool!.query(`
      select
        has_function_privilege('investing_rl9_writer','investing.rl8c_jsonb_has_number_v1(jsonb)','EXECUTE') as number_execute,
        has_function_privilege('investing_rl9_writer','investing.rl8c_canonical_jsonb_v1(jsonb)','EXECUTE') as canonical_execute,
        has_function_privilege('investing_rl9_writer','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as hash_execute,
        has_function_privilege('investing_app','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as app_hash_execute,
        has_function_privilege('service_role','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as service_hash_execute,
        has_function_privilege('anon','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as anon_hash_execute,
        has_function_privilege('authenticated','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as authenticated_hash_execute
    `);
    expect(grants.rows[0]).toEqual({
      number_execute: true,
      canonical_execute: true,
      hash_execute: true,
      app_hash_execute: false,
      service_hash_execute: false,
      anon_hash_execute: false,
      authenticated_hash_execute: false,
    });
  });

  it("keeps RL-9 public validation helpers executable only by the internal RL-9 writer", async () => {
    const { rows } = await pool!.query(`
      select p.proname, has_function_privilege('investing_rl9_writer', p.oid, 'EXECUTE') as writer_execute,
             has_function_privilege('investing_app', p.oid, 'EXECUTE') as app_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'investing' and p.proname in (
        'rl9b_protocol_payload_valid_v1',
        'rl9b_registration_payload_valid_v1',
        'rl9b_seal_payload_valid_v1',
        'rl9b_evaluation_payload_valid_v1',
        'rl9b_event_payload_valid_v1'
      )
      order by p.proname
    `);
    expect(rows.map((row) => row.proname)).toEqual([
      "rl9b_evaluation_payload_valid_v1",
      "rl9b_event_payload_valid_v1",
      "rl9b_protocol_payload_valid_v1",
      "rl9b_registration_payload_valid_v1",
      "rl9b_seal_payload_valid_v1",
    ]);
    expect(rows.every((row) => row.writer_execute && !row.app_execute && !row.service_execute && !row.anon_execute && !row.authenticated_execute)).toBe(true);
  });


  it("returns false, not null, for malformed null-bearing public metadata validators", async () => {
    const checks = await pool!.query(`
      select
        investing.rl9b_hashref_matches_v1('{"hashAlgorithm":null,"hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"}'::jsonb, 'SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1', 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C') is false as hashref_null_field_rejected,
        investing.rl9b_evaluator_profile_valid_v1('{"blindTruthEvaluatorBehaviorVersion":"BLIND_TRUTH_EVALUATOR_V1","engineId":null,"engineVersion":"ENGINE_V20260926","metricRegistryVersion":"METRIC_REGISTRY_V20260927","metricResultArtifactSchemaVersion":"METRIC_RESULT_SET_V2"}'::jsonb) is false as evaluator_null_field_rejected,
        investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":null,"providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) is false as holdout_provider_null_rejected,
        investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"PROVIDER_V1","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":null}'::jsonb) is false as holdout_timezone_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":null,"criterionVersion":"CRITERION_V1","metricId":"TOTAL_RETURN","metricVersion":"METRIC_V2","operator":"GTE","required":true,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as criterion_id_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":"TOTAL_RETURN_PASS","criterionVersion":"CRITERION_V1","metricId":null,"metricVersion":"METRIC_V2","operator":"GTE","required":true,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as metric_id_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":"TOTAL_RETURN_PASS","criterionVersion":"CRITERION_V1","metricId":"TOTAL_RETURN","metricVersion":"METRIC_V2","operator":"GTE","required":null,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as required_null_rejected,
        investing.rl9b_numeric_value_valid_v1('{"kind":"RATIO","value":null}'::jsonb, 'TOTAL_RETURN') is false as threshold_value_null_rejected,
        investing.rl9b_seal_payload_valid_v1('{"schemaVersion":"BLIND_TRUTH_VAULT_SEAL_V1","protocol":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"},"registration":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},"holdoutScopeDigest":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","commitmentAlgorithm":"SHA256_DOMAIN_SEPARATED_SALTED_V1","commitmentHash":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC","declaredPlaintextByteLength":null,"vaultFormatVersion":"BLIND_TRUTH_VAULT_FORMAT_V1"}'::jsonb, 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') is false as seal_length_null_rejected,
        investing.rl9b_event_payload_valid_v1('{"schemaVersion":"BLIND_TRUTH_REVEAL_RESULT_EVENT_V1","protocol":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"},"registration":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},"vaultSeal":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},"evaluation":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_EVALUATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"},"predecessorEvent":null,"eventState":null,"reason":null,"result":null}'::jsonb, 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', null, null, null) is false as event_state_null_rejected
    `);
    expect(Object.values(checks.rows[0]).every(Boolean)).toBe(true);
  });

  it("executes the final nested validator, numeric, holdout and seal rejection surface in PostgreSQL", async () => {
    const checks = await pool!.query(`
      select
        investing.rl9b_metric_numeric_kind_v1('TRADE_COUNT') = 'INTEGER' as trade_integer,
        investing.rl9b_metric_numeric_kind_v1('TOTAL_RETURN') = 'RATIO' as total_ratio,
        investing.rl9b_metric_numeric_kind_v1('VOLATILITY') is null as pseudo_metric_rejected,
        investing.rl9b_decimal_canonical_v1('0.1') as ratio_valid,
        not investing.rl9b_decimal_canonical_v1('0.10') as trailing_zero_rejected,
        not investing.rl9b_decimal_canonical_v1('1.0000000000000000001') as scale_rejected,
        not investing.rl9b_decimal_canonical_v1('-0') as negative_zero_rejected,
        investing.rl9b_immutable_behavior_token_v1('PROVIDER_V1') as behavior_token_valid,
        not investing.rl9b_immutable_behavior_token_v1('current') as mutable_alias_rejected,
        investing.rl9b_text_array_sorted_unique_nonempty_v1('["A","B"]'::jsonb, 256) as sorted_array_valid,
        not investing.rl9b_text_array_sorted_unique_nonempty_v1('["B","A"]'::jsonb, 256) as unsorted_array_rejected,
        not investing.rl9b_text_array_sorted_unique_nonempty_v1('["A","A"]'::jsonb, 256) as duplicate_array_rejected,
        not investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"CURRENT","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) as mutable_provider_rejected,
        not investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"PROVIDER_V1","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-02-31","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) as invalid_date_rejected,
        not investing.rl9b_numeric_value_valid_v1('{"kind":"RATIO","value":"0.10"}'::jsonb, 'TOTAL_RETURN') as nested_noncanonical_ratio_rejected,
        not investing.rl9b_threshold_valid_v1('{"kind":"RANGE","lower":{"kind":"RATIO","value":"10"},"upper":{"kind":"RATIO","value":"2"}}'::jsonb, 'TOTAL_RETURN', 'BETWEEN_INCLUSIVE') as invalid_range_rejected
    `);
    expect(Object.values(checks.rows[0]).every(Boolean)).toBe(true);
  });
});
