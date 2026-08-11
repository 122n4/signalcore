import pg from "pg";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InvestingEnginePersistenceError,
  InvestingEnginePersistenceServiceV1,
  InvestingEngineReplayServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 as Adapter } from "@/lib/investing/engine/v1/persistence/postgres";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import { buildPhase4BInput, PHASE4B_ACCOUNT_ID, purePhase3FRunnerForPersistence } from "@/tests/fixtures/investingEnginePhase4BFixture";
import { constraint, d } from "@/tests/fixtures/investingEnginePhase3FFixture";

const databaseUrl = process.env.INVESTING_4B_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase4b_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const OWNER = "user_phase3f_1";
const OTHER_OWNER = "user_phase4b_cross_tenant_2";
const OTHER_ACCOUNT = "77777777-7777-4777-8777-777777777777";
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(databaseUrl, process.env.ALLOW_DESTRUCTIVE_INVESTING_QA)
  : null;

if (destructiveQaTarget) {
  console.info(`[FASE 4B-R4 QA] destructive PostgreSQL target host=${destructiveQaTarget.host} port=${destructiveQaTarget.port} database=${destructiveQaTarget.database}`);
}

function deterministicUuid(seed: string): string {
  const digest = createHash("md5").update(seed, "utf8").digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function personalTenantId(owner: string): string {
  return deterministicUuid(`phase4b-postgres-tenant:${owner}`);
}

function personalMembershipId(owner: string): string {
  return deterministicUuid(`phase4b-postgres-membership:${owner}`);
}

function processPersist(runId: string, idempotencyKey: string): Promise<{ status: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "-r", "./scripts/register-alias.cjs", "./node_modules/jiti/bin/jiti.js",
      "tests/fixtures/investingEnginePhase4BProcessWorker.ts",
    ], {
      cwd: process.cwd(),
      env: { ...process.env, INVESTING_4B_TEST_DATABASE_URL: configuredDatabaseUrl, INVESTING_4B_PROCESS_RUN_ID: runId, INVESTING_4B_PROCESS_IDEMPOTENCY_KEY: idempotencyKey },
      windowsHide: true,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      if (exitCode !== 0) { reject(new Error(`phase4b_process_failed:${exitCode}:${stderr}`)); return; }
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) ?? "")); } catch (error) { reject(error); }
    });
  });
}

pgDescribe("FASE 4B real PostgreSQL persistence", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  const adapter = new Adapter({ connectionString: configuredDatabaseUrl, max: 12 });
  const service = new InvestingEnginePersistenceServiceV1(adapter);

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const connectionParameters = (effective as unknown as { connectionParameters: {
        host: string;
        port: number;
        database: string;
      } }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, {
        host: connectionParameters.host,
        port: connectionParameters.port,
        database: connectionParameters.database,
      });
      const server = await effective.query("select current_database() database");
      expect(server.rows[0]).toMatchObject({ database: destructiveQaTarget!.database });
    } finally {
      effective.release();
    }
    for (const [accountId, owner, portfolio] of [
      [PHASE4B_ACCOUNT_ID, OWNER, "phase4b"],
      [OTHER_ACCOUNT, OTHER_OWNER, "phase4b-cross-tenant"],
    ] as const) {
      const tenant = personalTenantId(owner);
      await admin.query(`insert into public.investing_tenants(id,owner_user_id,kind,status)
        values($1,$2,'personal','active') on conflict(owner_user_id) do nothing`, [tenant, owner]);
      await admin.query(`insert into public.investing_tenant_memberships(id,tenant_id,user_id,role,permissions,status)
        values(
          $1,$2,$3,'owner',
          array['investing:read','investing:create','investing:verify','investing:replay']::text[],
          'active'
        ) on conflict(tenant_id,user_id) do nothing`, [personalMembershipId(owner), tenant, owner]);
      await admin.query(`insert into public.investing_accounts(id,tenant_id,owner_user_id,user_id,portfolio_id,base_currency,environment,status)
        values($1,$2,$3,$3,$4,'EUR','paper','active') on conflict(id) do nothing`, [accountId, tenant, owner, portfolio]);
    }
  });
  afterAll(async () => { await adapter.close(); await admin.end(); });

  it("atomically persists, loads by every key and deterministically replays", async () => {
    const input = buildPhase4BInput({ runId: "phase4b_pg_basic", idempotencyKey: "phase4b_pg_basic" }).input;
    const first = await service.persist(input); const retry = await service.persist(input);
    expect(first.status).toBe("inserted"); expect(retry.status).toBe("idempotent_existing");
    const scope = { ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, runId: "phase4b_pg_basic" };
    const byRun = await service.reader.loadByRunId(scope);
    expect((await service.reader.loadByIdempotency({ ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, scope: byRun.manifest.idempotency.scope, key: byRun.manifest.idempotency.key })).manifest.manifestHash).toBe(byRun.manifest.manifestHash);
    expect((await service.reader.loadByFinalHash({ ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, finalResultHash: byRun.manifest.finalResultHash })).manifest.manifestHash).toBe(byRun.manifest.manifestHash);
    expect((await service.reader.loadLatest({ ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID })).loaded.run.identity.runId).toBe(scope.runId);
    const replay = await new InvestingEngineReplayServiceV1(service.reader, purePhase3FRunnerForPersistence).replay(scope);
    expect(replay.status).toBe("replay_match"); expect(replay.writes).toBe("none");
    const counts = await admin.query(`select
      (select count(*)::int from public.investing_engine_runs where run_id=$1) runs,
      (select count(*)::int from public.investing_engine_artifacts where run_id=$1) artifacts,
      (select count(*)::int from public.investing_engine_phase_summaries where run_id=$1) summaries,
      (select count(*)::int from public.investing_engine_reason_evidence where run_id=$1) reasons,
      (select count(*)::int from public.investing_engine_shadow_packages where run_id=$1) shadows,
      (select count(*)::int from public.investing_engine_idempotency_keys where run_id=$1) claims`, [scope.runId]);
    expect(counts.rows[0]).toEqual({ runs: 1, artifacts: 12, summaries: 4, reasons: input.reasonEvidence.length, shadows: 1, claims: 13 });
    expect(byRun.loaded.run.manifestVersion).toBe("investing-engine-persistence-manifest/v3");
  }, 15_000);

  it("rejects every authorization casing and percent-encoded alias in real PostgreSQL", async () => {
    const variants = [
      "Authorization", "AUTHORIZATION", "authoriZation",
      "%61uthorization", "author%69zation", "%41uthorization",
      "%2561uthorization", "author%2569zation", "%61uthori%7Aation",
      "author%ization", "authorization%", "%GGauthorization",
    ];
    for (const variant of variants) {
      const base = { environment: "paper", expectedAccountId: "account", expectedUserId: "user" };
      const payloads = [
        base,
        { ...base, credential: "secret" }, { ...base, cookie: "secret" },
        { ...base, headers: { xCustomAuth: "secret" } }, { ...base, client_secret: "secret" },
        { ...base, environment: "live" }, { ...base, environment: "real" },
      ];
      for (const payload of payloads) {
        const result = await admin.query(
          "select public.investing_engine_authorization_shape_valid_v1(jsonb_build_object('nested',jsonb_build_array(jsonb_build_object($1::text,$2::jsonb)))) valid",
          [variant, JSON.stringify(payload)],
        );
        expect(result.rows[0].valid, `${variant}:${JSON.stringify(payload)}`).toBe(false);
      }
    }
    const canonical = await admin.query(
      "select public.investing_engine_authorization_shape_valid_v1($1::jsonb) valid",
      [JSON.stringify({ authorization: { environment: "paper", expectedAccountId: "account", expectedUserId: "user" } })],
    );
    expect(canonical.rows[0].valid).toBe(true);
  });

  it("rejects duplicate raw JSON before persistence and blocks direct INSERT bypass", async () => {
    const sourceRunId = "phase4b_pg_r3_raw_source";
    await service.persist(buildPhase4BInput({ runId: sourceRunId, idempotencyKey: sourceRunId }).input);
    const rawPayloads = [
      '{"a":"first","a":"second"}',
      '{"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"environment":"live","expectedAccountId":"a","expectedUserId":"u"}}',
      '{"Authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"}}',
      '{"nested":{"a":"first","a":"second"}}',
      '{"nested":[{"a":"first","a":"second"}]}',
      '{"a":"\\u0078"}',
      '{"%61uthorization":{"credential":"first"},"%61uthorization":{"credential":"second"}}',
      '{"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"},"authorization":{"credential":"danger"}}',
      '{"authorization":{"credential":"danger"},"authorization":{"environment":"paper","expectedAccountId":"a","expectedUserId":"u"}}',
    ];
    for (const rawPayload of rawPayloads) {
      const validation = await admin.query(
        `select public.investing_engine_canonical_raw_valid_v1($1::text) canonical,
                public.investing_engine_authorization_shape_valid_v1($1::jsonb) authorization_valid`,
        [rawPayload],
      );
      expect(
        validation.rows[0].canonical && validation.rows[0].authorization_valid,
        rawPayload,
      ).toBe(false);
    }

    const direct = await admin.connect();
    try {
      await direct.query("begin");
      await direct.query("set local role service_role");
      await direct.query(`insert into public.investing_engine_runs
        select (jsonb_populate_record(null::public.investing_engine_runs,
          to_jsonb(source_run) || jsonb_build_object(
            'run_id','phase4b_pg_r3_direct_probe',
            'idempotency_key','phase4b_pg_r3_direct_probe',
            'final_result_hash',repeat('d',64)
          ))).*
        from public.investing_engine_runs source_run where run_id=$1`, [sourceRunId]);
      for (const [index, rawPayload] of rawPayloads.entries()) {
        await direct.query(`savepoint r3_raw_${index}`);
        await expect(direct.query(`insert into public.investing_engine_artifacts(
          run_id,owner_id,account_id,final_result_hash,artifact_type,source_phase,state,quality,
          confidence,content_hash,contract_version,schema_version,canonical_payload,sealed,executable
        ) select
          'phase4b_pg_r3_direct_probe',owner_id,account_id,repeat('d',64),artifact_type,source_phase,
          state,quality,confidence,content_hash,contract_version,schema_version,$2,true,false
        from public.investing_engine_artifacts where run_id=$1 and artifact_type='canonical_input'`, [sourceRunId, rawPayload]), rawPayload)
          .rejects.toMatchObject({ code: "23514" });
        await direct.query(`rollback to savepoint r3_raw_${index}`);
      }
      expect((await direct.query(
        "select count(*)::int count from public.investing_engine_artifacts where run_id='phase4b_pg_r3_direct_probe'",
      )).rows[0].count).toBe(0);
    } finally {
      await direct.query("rollback");
      direct.release();
    }
  });

  it("serializes concurrent exact retries and rejects concurrent conflicts", async () => {
    const a = new InvestingEnginePersistenceServiceV1(new Adapter({ connectionString: configuredDatabaseUrl, max: 4 }));
    const bAdapter = new Adapter({ connectionString: configuredDatabaseUrl, max: 4 }); const b = new InvestingEnginePersistenceServiceV1(bAdapter);
    const aAdapter = a.repository as Adapter;
    try {
      const exact = buildPhase4BInput({ runId: "phase4b_pg_concurrent_exact", idempotencyKey: "phase4b_pg_concurrent_exact" }).input;
      const exactResults = await Promise.all([a.persist(exact), b.persist(exact)]);
      expect(exactResults.map((result) => result.status).sort()).toEqual(["idempotent_existing", "inserted"]);

      const differentKey = "phase4b_pg_concurrent_key_conflict";
      const conflict = await Promise.allSettled([
        a.persist(buildPhase4BInput({ runId: "phase4b_pg_key_a", cash: "901", idempotencyKey: differentKey }).input),
        b.persist(buildPhase4BInput({ runId: "phase4b_pg_key_b", cash: "902", idempotencyKey: differentKey }).input),
      ]);
      expect(conflict.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      expect(conflict.filter((entry) => entry.status === "rejected")).toHaveLength(1);

      const sameRun = await Promise.allSettled([
        a.persist(buildPhase4BInput({ runId: "phase4b_pg_same_run", cash: "903", idempotencyKey: "phase4b_pg_same_run_a" }).input),
        b.persist(buildPhase4BInput({ runId: "phase4b_pg_same_run", cash: "904", idempotencyKey: "phase4b_pg_same_run_b" }).input),
      ]);
      expect(sameRun.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      expect(sameRun.filter((entry) => entry.status === "rejected")).toHaveLength(1);
      const rows = await admin.query("select run_id,count(*)::int count from public.investing_engine_runs where run_id in ('phase4b_pg_concurrent_exact','phase4b_pg_key_a','phase4b_pg_key_b','phase4b_pg_same_run') group by run_id");
      expect(rows.rows.every((row) => row.count === 1)).toBe(true);

      const processResults = await Promise.all([
        processPersist("phase4b_pg_process_exact", "phase4b_pg_process_exact"),
        processPersist("phase4b_pg_process_exact", "phase4b_pg_process_exact"),
      ]);
      expect(processResults.map((result) => result.status).sort()).toEqual(["idempotent_existing", "inserted"]);
      expect((await admin.query("select count(*)::int count from public.investing_engine_runs where run_id='phase4b_pg_process_exact'")).rows[0].count).toBe(1);
    } finally { await aAdapter.close(); await bAdapter.close(); }
  }, 30_000);

  it("rolls back a mid-transaction failure and recovers an unknown post-commit response", async () => {
    await admin.query(`create or replace function public.phase4b_qa_fail_artifact() returns trigger language plpgsql as $$ begin if new.run_id='phase4b_pg_forced_rollback' then raise exception 'phase4b_forced_failure'; end if; return new; end $$`);
    await admin.query("create trigger phase4b_qa_fail_artifact before insert on public.investing_engine_artifacts for each row execute function public.phase4b_qa_fail_artifact()");
    try {
      await expect(service.persist(buildPhase4BInput({ runId: "phase4b_pg_forced_rollback", idempotencyKey: "phase4b_pg_forced_rollback" }).input)).rejects.toBeInstanceOf(InvestingEnginePersistenceError);
      const partial = await admin.query("select (select count(*) from public.investing_engine_runs where run_id=$1)::int runs,(select count(*) from public.investing_engine_artifacts where run_id=$1)::int artifacts", ["phase4b_pg_forced_rollback"]);
      expect(partial.rows[0]).toEqual({ runs: 0, artifacts: 0 });
    } finally {
      await admin.query("drop trigger phase4b_qa_fail_artifact on public.investing_engine_artifacts");
      await admin.query("drop function public.phase4b_qa_fail_artifact()");
    }
    let once = true;
    const ambiguousAdapter = new Adapter({ connectionString: configuredDatabaseUrl, onCommit: () => { if (once) { once = false; throw new Error("response_unknown_after_commit"); } } });
    try {
      const result = await new InvestingEnginePersistenceServiceV1(ambiguousAdapter).persist(buildPhase4BInput({ runId: "phase4b_pg_ambiguous", idempotencyKey: "phase4b_pg_ambiguous" }).input);
      expect(result.status).toBe("recovered_after_ambiguous_commit");
      expect((await admin.query("select count(*)::int count from public.investing_engine_runs where run_id='phase4b_pg_ambiguous'")).rows[0].count).toBe(1);
    } finally { await ambiguousAdapter.close(); }
  });

  it("enforces the service/RLS boundary", async () => {
    const own = await admin.connect();
    try {
      await own.query("begin"); await own.query("set local role authenticated");
      await own.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: OWNER, role: "authenticated" })]);
      expect((await own.query("select count(*)::int count from public.investing_engine_runs")).rows[0].count).toBeGreaterThan(0);
      await expect(own.query("update public.investing_engine_runs set state='blocked' where run_id='phase4b_pg_basic'")).rejects.toThrow();
      await own.query("rollback");
      await own.query("begin"); await own.query("set local role authenticated");
      await own.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: "other_user", role: "authenticated" })]);
      expect((await own.query("select count(*)::int count from public.investing_engine_runs")).rows[0].count).toBe(0);
      await own.query("rollback");
      await own.query("begin"); await own.query("set local role anon");
      try {
        expect((await own.query("select count(*)::int count from public.investing_engine_runs")).rows[0].count).toBe(0);
      } catch (error) {
        expect(error).toMatchObject({ code: "42501" });
      }
      await own.query("rollback");
    } finally { own.release(); }

    for (const role of ["anon", "authenticated"] as const) {
      const browser = await admin.connect();
      try {
        await browser.query("begin");
        await browser.query(`set local role ${role}`);
        await expect(browser.query("select public.investing_engine_historical_gate_v1()"))
          .rejects.toMatchObject({ code: "42501" });
      } finally {
        await browser.query("rollback");
        browser.release();
      }
    }

    const serviceRole = await admin.connect();
    try {
      await serviceRole.query("begin");
      await serviceRole.query("set local role service_role");
      expect((await serviceRole.query(
        "select public.investing_engine_historical_gate_v1() report",
      )).rows[0].report.decision).toBe("historical_set_blocked");
    } finally {
      await serviceRole.query("rollback");
      serviceRole.release();
    }

    const blockedBefore = (await admin.query(
      "select public.investing_engine_historical_gate_v1() report",
    )).rows[0].report;
    expect(blockedBefore.decision).toBe("historical_set_blocked");
    expect(blockedBefore.policy).toBe("empty_only");
    expect(blockedBefore.counts.runs).toBeGreaterThan(0);
    expect(blockedBefore.counts.totalRelevantRows).toBeGreaterThan(0);
    expect(blockedBefore.counts.historicalRuns).toBe(0);
    expect(blockedBefore.readOnly).toBe(true);

    await admin.query("begin");
    try {
      await admin.query("alter table public.investing_engine_runs drop constraint investing_engine_runs_manifest_v3_check");
      await admin.query("set local session_replication_role=replica");
      await admin.query("update public.investing_engine_runs set manifest_version=null where run_id='phase4b_pg_basic'");
      const blocked = (await admin.query(
        "select public.investing_engine_historical_gate_v1() report",
      )).rows[0].report;
      expect(blocked.decision).toBe("historical_set_blocked");
      expect(blocked.counts.historicalRuns).toBe(1);
      expect(blocked.versions).toContainEqual({ manifestVersion: "<null>", count: 1 });
      expect((await admin.query(
        "select manifest_version from public.investing_engine_runs where run_id='phase4b_pg_basic'",
      )).rows[0].manifest_version).toBeNull();
    } finally {
      await admin.query("rollback");
    }

    const blockedAfter = (await admin.query(
      "select public.investing_engine_historical_gate_v1() report",
    )).rows[0].report;
    expect(blockedAfter).toEqual(blockedBefore);
  }, 30_000);

  it("fails closed for every isolated material metadata corruption", async () => {
    const cases = [
      ["summary_warning", "persistence_summary_metadata_mismatch"],
      ["summary_blocking", "persistence_summary_metadata_mismatch"],
      ["reason_phase", "persistence_reason_metadata_mismatch"],
      ["reason_severity", "persistence_reason_metadata_mismatch"],
      ["reason_consequence", "persistence_reason_metadata_mismatch"],
      ["reason_symbol", "persistence_reason_metadata_mismatch"],
      ["reason_order", "persistence_reason_metadata_mismatch"],
      ["reason_constraint", "persistence_reason_metadata_mismatch"],
      ["claim_scope", "persistence_claim_metadata_mismatch"],
      ["claim_key", "persistence_claim_metadata_mismatch"],
      ["artifact_state", "persistence_artifact_metadata_mismatch"],
      ["artifact_quality", "persistence_artifact_metadata_mismatch"],
      ["artifact_confidence", "persistence_artifact_metadata_mismatch"],
      ["artifact_phase", "persistence_artifact_metadata_mismatch"],
      ["artifact_schema", "persistence_version_mismatch"],
      ["artifact_contract", "persistence_version_mismatch"],
      ["shadow_metadata", "persistence_shadow_metadata_mismatch"],
      ["root_confidence", "persistence_root_confidence_mismatch"],
      ["root_selected", "persistence_root_selected_candidate_mismatch"],
      ["root_both", "persistence_root_confidence_mismatch"],
      ["root_rejected", "persistence_root_selected_candidate_mismatch"],
      ["root_terminal_selected", "persistence_root_selected_candidate_mismatch"],
    ] as const;
    const persistedInputs = new Map<string, ReturnType<typeof buildPhase4BInput>["input"]>();
    for (const [name] of cases) {
      const runId = `phase4b_pg_metadata_${name}`;
      const input = buildPhase4BInput({
        runId,
        idempotencyKey: runId,
        ...(name === "root_terminal_selected" ? { cash: "0" } : {}),
      }).input;
      persistedInputs.set(name, input);
      await service.persist(input);
    }
    await admin.query("alter table public.investing_engine_artifacts drop constraint investing_engine_artifacts_phase_check");
    await admin.query("alter table public.investing_engine_shadow_packages drop constraint investing_engine_shadow_packages_status_check");
    await admin.query("set session_replication_role=replica");
    try {
      await admin.query("update public.investing_engine_phase_summaries set warning_codes='[\"tampered_warning\"]'::jsonb where run_id='phase4b_pg_metadata_summary_warning' and phase='phase3c'");
      await admin.query("update public.investing_engine_phase_summaries set blocking_reasons='[\"tampered_block\"]'::jsonb where run_id='phase4b_pg_metadata_summary_blocking' and phase='phase3d'");
      await admin.query("update public.investing_engine_reason_evidence set phase_source=case phase_source when 'phase3c' then 'phase3d' else 'phase3c' end where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_phase')");
      await admin.query("update public.investing_engine_reason_evidence set severity=case severity when 'info' then 'warning' else 'info' end where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_severity')");
      await admin.query("update public.investing_engine_reason_evidence set consequence=case consequence when 'inform' then 'degrade' else 'inform' end where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_consequence')");
      await admin.query("update public.investing_engine_reason_evidence set related_symbol='ZZZ' where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_symbol')");
      await admin.query("update public.investing_engine_reason_evidence set related_order='tampered-order' where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_order')");
      await admin.query("update public.investing_engine_reason_evidence set related_constraint='tampered-constraint' where evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_pg_metadata_reason_constraint')");
      await admin.query("update public.investing_engine_idempotency_keys set scope='tampered_scope' where run_id='phase4b_pg_metadata_claim_scope' and artifact_type='engine_run'");
      await admin.query("update public.investing_engine_idempotency_keys set idempotency_key='tampered_key' where run_id='phase4b_pg_metadata_claim_key' and artifact_type='engine_run'");
      await admin.query("update public.investing_engine_artifacts set state=case state when 'blocked' then 'ready' else 'blocked' end where run_id='phase4b_pg_metadata_artifact_state' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set quality=case quality when 'good' then 'degraded' else 'good' end where run_id='phase4b_pg_metadata_artifact_quality' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set confidence='{\"value\":\"0\",\"basis\":[\"tampered\"]}'::jsonb where run_id='phase4b_pg_metadata_artifact_confidence' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set source_phase='phase3f' where run_id='phase4b_pg_metadata_artifact_phase' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set schema_version='other/v2' where run_id='phase4b_pg_metadata_artifact_schema' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set contract_version='other/v1' where run_id='phase4b_pg_metadata_artifact_contract' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_shadow_packages set status='tampered' where run_id='phase4b_pg_metadata_shadow_metadata'");
      await admin.query("update public.investing_engine_runs set confidence='{\"value\":\"0\",\"basis\":[\"tampered\"]}'::jsonb where run_id='phase4b_pg_metadata_root_confidence'");
      await admin.query("update public.investing_engine_runs set selected_candidate_id='candidate:rejected' where run_id='phase4b_pg_metadata_root_selected'");
      await admin.query("update public.investing_engine_runs set confidence='{\"value\":\"0\",\"basis\":[\"tampered\"]}'::jsonb, selected_candidate_id='candidate:rejected' where run_id='phase4b_pg_metadata_root_both'");
      await admin.query("update public.investing_engine_runs set selected_candidate_id='candidate:hold:rejected' where run_id='phase4b_pg_metadata_root_rejected'");
      await admin.query("update public.investing_engine_runs set selected_candidate_id='candidate:forbidden_terminal' where run_id='phase4b_pg_metadata_root_terminal_selected'");
    } finally {
      await admin.query("set session_replication_role=origin");
    }
    for (const [name, expectedCode] of cases) {
      const runId = `phase4b_pg_metadata_${name}`;
      const scope = { ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, runId };
      await expect(service.reader.loadByRunId(scope), name).rejects.toMatchObject({ code: expectedCode });
      const replay = await new InvestingEngineReplayServiceV1(service.reader, purePhase3FRunnerForPersistence).replay(scope);
      expect(replay.status, name).toBe("replay_blocked_by_integrity_error");
      expect(replay.errorCode, name).toBe(expectedCode);
      await expect(service.persist(persistedInputs.get(name)!), `${name}:exact_retry`).rejects.toMatchObject({ code: expectedCode });
    }
  }, 120_000);

  it("blocks real cross-tenant row swaps and hides tenant B identifiers from tenant A", async () => {
    const cases = ["artifact", "content_hash", "owner", "account", "run_ref", "summary", "reason", "claim", "shadow", "foreign_final_hash"] as const;
    for (let index = 0; index < cases.length; index += 1) {
      const name = cases[index];
      await service.persist(buildPhase4BInput({ runId: `phase4b_cross_a_${name}`, idempotencyKey: `phase4b_cross_a_${name}`, cash: `${2100 + index}` }).input);
      await service.persist(buildPhase4BInput({
        userId: OTHER_OWNER,
        accountId: OTHER_ACCOUNT,
        runId: `phase4b_cross_b_${name}`,
        idempotencyKey: `phase4b_cross_b_${name}`,
        cash: `${3100 + index}`,
        constraints: [constraint({ id: `cross_tenant_${name}`, status: "fail" })],
        modelOverrides: { VWCE: { commissionBps: d(`${20 + index}`) } },
      }).input);
      await service.reader.loadByRunId({ ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, runId: `phase4b_cross_a_${name}` });
      await service.reader.loadByRunId({ ownerId: OTHER_OWNER, accountId: OTHER_ACCOUNT, runId: `phase4b_cross_b_${name}` });
    }
    const tenantA = await admin.connect();
    try {
      await tenantA.query("begin");
      await tenantA.query("set local role authenticated");
      await tenantA.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: OWNER, role: "authenticated" })]);
      for (const table of ["runs", "artifacts", "phase_summaries", "reason_evidence", "shadow_packages", "idempotency_keys"]) {
        const result = await tenantA.query(`select count(*)::int count from public.investing_engine_${table} where owner_id=$1 or run_id like 'phase4b_cross_b_%'`, [OTHER_OWNER]);
        expect(result.rows[0].count, table).toBe(0);
      }
      await tenantA.query("rollback");
    } finally {
      tenantA.release();
    }
    await admin.query("alter table public.investing_engine_shadow_packages drop constraint investing_engine_shadow_packages_hashes_check");
    await admin.query("set session_replication_role=replica");
    try {
      await admin.query(`update public.investing_engine_artifacts a set
        source_phase=b.source_phase,state=b.state,quality=b.quality,confidence=b.confidence,content_hash=b.content_hash,
        contract_version=b.contract_version,schema_version=b.schema_version,canonical_payload=b.canonical_payload
        from public.investing_engine_artifacts b
        where a.run_id='phase4b_cross_a_artifact' and b.run_id='phase4b_cross_b_artifact'
          and a.artifact_type='canonical_input' and b.artifact_type='canonical_input'`);
      await admin.query(`update public.investing_engine_artifacts a set content_hash=b.content_hash from public.investing_engine_artifacts b
        where a.run_id='phase4b_cross_a_content_hash' and b.run_id='phase4b_cross_b_content_hash'
          and a.artifact_type='canonical_input' and b.artifact_type='canonical_input'`);
      await admin.query("update public.investing_engine_artifacts set owner_id=$1 where run_id='phase4b_cross_a_owner' and artifact_type='canonical_input'", [OTHER_OWNER]);
      await admin.query("update public.investing_engine_artifacts set account_id=$1 where run_id='phase4b_cross_a_account' and artifact_type='canonical_input'", [OTHER_ACCOUNT]);
      await admin.query("delete from public.investing_engine_artifacts where run_id='phase4b_cross_b_run_ref' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set run_id='phase4b_cross_b_run_ref' where run_id='phase4b_cross_a_run_ref' and artifact_type='canonical_input'");
      await admin.query(`update public.investing_engine_phase_summaries a set
        phase_state=b.phase_state,quality=b.quality,input_hash=b.input_hash,output_hash=b.output_hash,
        warning_codes=b.warning_codes,blocking_reasons=b.blocking_reasons,reason_codes=b.reason_codes
        from public.investing_engine_phase_summaries b
        where a.run_id='phase4b_cross_a_summary' and b.run_id='phase4b_cross_b_summary' and a.phase='phase3c' and b.phase='phase3c'`);
      await admin.query(`update public.investing_engine_reason_evidence a set
        reason_code=b.reason_code,phase_source=b.phase_source,severity=b.severity,consequence=b.consequence,
        evidence_hash=b.evidence_hash,related_symbol=b.related_symbol,related_order=b.related_order,related_constraint=b.related_constraint
        from public.investing_engine_reason_evidence b
        where a.evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_cross_a_reason')
          and b.evidence_id=(select min(evidence_id) from public.investing_engine_reason_evidence where run_id='phase4b_cross_b_reason' and severity='error')`);
      await admin.query(`update public.investing_engine_idempotency_keys a set
        scope=b.scope,idempotency_key=b.idempotency_key,expected_content_hash=b.expected_content_hash
        from public.investing_engine_idempotency_keys b
        where a.run_id='phase4b_cross_a_claim' and b.run_id='phase4b_cross_b_claim'
          and a.artifact_type='engine_run' and b.artifact_type='engine_run'`);
      await admin.query("delete from public.investing_engine_shadow_packages where run_id='phase4b_cross_b_shadow'");
      await admin.query(`update public.investing_engine_shadow_packages set
        shadow_package_hash=(select content_hash from public.investing_engine_artifacts where run_id='phase4b_cross_b_shadow' and artifact_type='shadow_package'),
        engine_new_result_hash=(select content_hash from public.investing_engine_artifacts where run_id='phase4b_cross_b_shadow' and artifact_type='final_result')
        where run_id='phase4b_cross_a_shadow'`);
      await admin.query(`update public.investing_engine_artifacts a set final_result_hash=b.final_result_hash
        from public.investing_engine_runs b where a.run_id='phase4b_cross_a_foreign_final_hash'
          and a.artifact_type='canonical_input' and b.run_id='phase4b_cross_b_foreign_final_hash'`);
    } finally {
      await admin.query("set session_replication_role=origin");
    }
    for (const name of cases) {
      const scope = { ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, runId: `phase4b_cross_a_${name}` };
      await expect(service.reader.loadByRunId(scope), name).rejects.toBeInstanceOf(InvestingEnginePersistenceError);
      expect((await new InvestingEngineReplayServiceV1(service.reader, purePhase3FRunnerForPersistence).replay(scope)).status, name).toBe("replay_blocked_by_integrity_error");
    }
  }, 120_000);

  it("detects controlled PostgreSQL corruption without repair or fallback", async () => {
    const specs: Array<[string, string]> = [
      ["payload", "phase4b_corrupt_payload"], ["hash", "phase4b_corrupt_hash"], ["missing", "phase4b_corrupt_missing"],
      ["extra", "phase4b_corrupt_extra"], ["owner", "phase4b_corrupt_owner"], ["account", "phase4b_corrupt_account"],
      ["run", "phase4b_corrupt_run"], ["version", "phase4b_corrupt_version"],
      ["summary", "phase4b_corrupt_summary"], ["reason", "phase4b_corrupt_reason"], ["shadow", "phase4b_corrupt_shadow"],
      ["snapshot", "phase4b_corrupt_snapshot"], ["final", "phase4b_corrupt_final"], ["executable", "phase4b_corrupt_executable"], ["live", "phase4b_corrupt_live"],
    ];
    for (const [, runId] of specs) await service.persist(buildPhase4BInput({ runId, idempotencyKey: runId }).input);
    await admin.query("alter table public.investing_engine_artifacts drop constraint investing_engine_artifacts_run_type_unique");
    await admin.query("alter table public.investing_engine_artifacts drop constraint investing_engine_artifacts_canonical_raw_check");
    await admin.query("alter table public.investing_engine_runs drop constraint investing_engine_runs_executable_check");
    await admin.query("alter table public.investing_engine_runs drop constraint investing_engine_runs_environment_check");
    await admin.query("set session_replication_role=replica");
    try {
      await admin.query(`update public.investing_engine_artifacts set canonical_payload=jsonb_set(canonical_payload::jsonb,'{userId}','\"other\"'::jsonb)::text where run_id='phase4b_corrupt_payload' and artifact_type='canonical_input'`);
      await admin.query("update public.investing_engine_artifacts set content_hash=$1 where run_id='phase4b_corrupt_hash' and artifact_type='canonical_input'", ["0".repeat(64)]);
      await admin.query("delete from public.investing_engine_artifacts where run_id='phase4b_corrupt_missing' and artifact_type='risk_assessment'");
      await admin.query(`insert into public.investing_engine_artifacts(run_id,owner_id,account_id,final_result_hash,artifact_type,source_phase,state,quality,confidence,content_hash,contract_version,schema_version,canonical_payload,sealed,executable,persistence_txid)
        select run_id,owner_id,account_id,final_result_hash,artifact_type,source_phase,state,quality,confidence,content_hash,contract_version,schema_version,canonical_payload,sealed,executable,persistence_txid from public.investing_engine_artifacts where run_id='phase4b_corrupt_extra' and artifact_type='canonical_input'`);
      await admin.query("update public.investing_engine_artifacts set owner_id='other_user' where run_id='phase4b_corrupt_owner' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set account_id='55555555-5555-4555-8555-555555555555' where run_id='phase4b_corrupt_account' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set run_id='phase4b_corrupt_run_swapped' where run_id='phase4b_corrupt_run' and artifact_type='canonical_input'");
      await admin.query("update public.investing_engine_artifacts set schema_version='other/v1' where run_id='phase4b_corrupt_version' and artifact_type='canonical_input'");
      await admin.query("delete from public.investing_engine_phase_summaries where run_id='phase4b_corrupt_summary' and phase='phase3d'");
      await admin.query("delete from public.investing_engine_reason_evidence where run_id='phase4b_corrupt_reason'");
      await admin.query("update public.investing_engine_shadow_packages set shadow_package_hash=$1 where run_id='phase4b_corrupt_shadow'", ["0".repeat(64)]);
      await admin.query("update public.investing_engine_runs set market_snapshot_id='swapped_snapshot' where run_id='phase4b_corrupt_snapshot'");
      await admin.query("update public.investing_engine_runs set final_result_hash=$1 where run_id='phase4b_corrupt_final'", ["f".repeat(64)]);
      await admin.query("update public.investing_engine_runs set executable=true where run_id='phase4b_corrupt_executable'");
      await admin.query("update public.investing_engine_runs set environment='live' where run_id='phase4b_corrupt_live'");
    } finally { await admin.query("set session_replication_role=origin"); }
    for (const [name, runId] of specs) {
      const scope = { ownerId: OWNER, accountId: PHASE4B_ACCOUNT_ID, runId };
      await expect(service.reader.loadByRunId(scope), name).rejects.toBeInstanceOf(InvestingEnginePersistenceError);
      expect((await new InvestingEngineReplayServiceV1(service.reader, purePhase3FRunnerForPersistence).replay(scope)).status, name).toBe("replay_blocked_by_integrity_error");
    }
  }, 120_000);
});
