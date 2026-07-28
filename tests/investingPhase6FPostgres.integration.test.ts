import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { assertDestructiveInvestingQaDatabase } from "@/scripts/qa/investingDestructiveQaGuard";
import { canonicalizeResearchContract } from "@/lib/investing/research/contracts/runtimeValidation";

const databaseUrl = process.env.INVESTING_6F_TEST_DATABASE_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;
const configured = databaseUrl ?? "postgresql://invalid/phase6f_not_configured";
if (databaseUrl) {
  assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  );
}
const forward = fs.readFileSync(path.join(process.cwd(),
  "supabase/migrations/20260728210000_investing_research_dataset_quality_phase6f.sql"), "utf8");
const rollback = fs.readFileSync(path.join(process.cwd(),
  "supabase/rollbacks/20260728210000_investing_research_dataset_quality_phase6f.down.sql"), "utf8");

pgDescribe("Phase 6F real PostgreSQL migration and rollback", () => {
  const pool = new pg.Pool({ connectionString: configured });
  afterAll(() => pool.end());

  it("applies additive schema with RLS, scoped references and bounded states", async () => {
    await pool.query(forward);
    const table = await pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity,relforcerowsecurity from pg_class
       where relname='investing_research_dataset_quality_reports'`,
    );
    expect(table.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    const columns = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='investing_research_dataset_versions'`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining([
      "quality_report_id", "source_dataset_version_id",
    ]));
    const definitions = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) definition from pg_constraint
       where conrelid in (
         'public.investing_research_dataset_quality_reports'::regclass,
         'public.investing_research_dataset_versions'::regclass
       )`,
    );
    const joined = definitions.rows.map((row) => row.definition).join("\n");
    expect(joined).toContain("research_ready");
    expect(joined).not.toContain("promotion_eligible");
    const grants = await pool.query<{ grantee: string; privilege_type: string }>(
      `select grantee,privilege_type from information_schema.role_table_grants
       where table_schema='public' and table_name='investing_research_dataset_quality_reports'
       order by grantee,privilege_type`,
    );
    expect(grants.rows.filter((row) => row.grantee === "authenticated").map((row) => row.privilege_type))
      .toEqual(["SELECT"]);
    expect(grants.rows.some((row) => row.grantee === "anon")).toBe(false);
    expect(grants.rows.filter((row) => row.grantee === "service_role").map((row) => row.privilege_type).sort())
      .toEqual(["INSERT", "SELECT"]);
  });

  it("rolls back an empty 6F schema and reapplies cleanly", async () => {
    await pool.query(rollback);
    const absent = await pool.query<{ exists: boolean }>(
      `select to_regclass('public.investing_research_dataset_quality_reports') is not null as exists`,
    );
    expect(absent.rows[0].exists).toBe(false);
    await pool.query(forward);
  });

  it("rejects a forged research_ready report before relational publication", async () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    const account = "22222222-2222-4222-8222-222222222222";
    const forgedGates = [
      "storage_integrity","coverage","calendar_session","gaps","duplicates","timezone",
      "stale_data","ohlcv_outliers","adjustment_policy","corporate_actions","look_ahead",
      "survivorship","provenance",
    ].map((gateId) => ({
      gateId, gateVersion: "v1", outcome: gateId === "provenance" ? "blocked" : "passed",
      reasonCode: gateId === "provenance" ? "quality_evidence_missing" : null,
      evidenceIds: [], metrics: {}, applicabilityRule: null,
    }));
    await expect(pool.query(
      `insert into public.investing_research_dataset_quality_reports
       (tenant_id,owner_id,portfolio_id,account_id,quality_report_id,source_dataset_version_id,
        request_id,policy_version,report_hash,canonical_material,outcome,evaluated_at,correlation_id,canonical_payload)
       values ($1,'owner-a','portfolio-a',$2,'report-a','source-a','request-a',
        'investing.dataset-quality-policy/v1',$3,'{}','research_ready',now(),'corr-a',$4::jsonb)`,
      [tenant, account, "a".repeat(64), JSON.stringify({
        sourceDatasetVersionId: "source-a", requirementId: "request-a",
        policyVersion: "investing.dataset-quality-policy/v1", outcome: "research_ready",
        gates: forgedGates,
      })],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("publishes a scoped report, derived version and lineage and rejects cross-scope publication", async () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    const account = "22222222-2222-4222-8222-222222222222";
    const otherTenant = "33333333-3333-4333-8333-333333333333";
    const otherAccount = "44444444-4444-4444-8444-444444444444";
    const h = "a".repeat(64), raw = "b".repeat(64), requestId = `irdsreq_v1_${h}`;
    const storage = { contractVersion: "investing-research-dataset-storage-reference/v1",
      key: `sha256/aa/${h}.ndjson`, rawContentHash: raw, normalizedContentHash: h,
      mediaType: "application/x-ndjson", schemaVersion: "ohlcv/v1", byteSize: 10, integrityState: "verified" };
    const coverage = { observedStart: "2026-01-01T00:00:00.000Z", observedEnd: "2026-01-03T00:00:00.000Z",
      recordCount: 2, firstTimestamp: "2026-01-01T00:00:00.000Z", lastTimestamp: "2026-01-02T00:00:00.000Z" };
    await pool.query(`insert into public.investing_tenants(id,owner_user_id) values ($1,'owner-a'),($2,'owner-b')`,
      [tenant, otherTenant]);
    await pool.query(
      `insert into public.investing_tenant_memberships(tenant_id,user_id,permissions)
       values ($1,'owner-a',array['investing:read','investing:create','investing:verify','investing:replay']),
              ($2,'owner-b',array['investing:read','investing:create','investing:verify','investing:replay'])`,
      [tenant, otherTenant]);
    await pool.query(
      `insert into public.investing_accounts(id,user_id,owner_user_id,tenant_id,portfolio_id)
       values ($3,'owner-a','owner-a',$1,'portfolio-a'),($4,'owner-b','owner-b',$2,'portfolio-b')`,
      [tenant, otherTenant, account, otherAccount]);
    const requirementMaterial = { contractVersion: "investing-research-dataset-requirement/v1",
      scientificScope: { tenantId: tenant, ownerId: "owner-a", portfolioId: "portfolio-a", accountId: account } };
    await pool.query(
      `insert into public.investing_research_dataset_requests
       (tenant_id,owner_id,portfolio_id,account_id,request_id,contract_version,request_hash,state,created_at,canonical_payload)
       values ($1,'owner-a','portfolio-a',$2,$3,'v1',$4,'requested',now(),$5::jsonb)`,
      [tenant, account, requestId, h, JSON.stringify({ requirementId: requestId, material: requirementMaterial })],
    );
    const outcome = { kind: "acquired", provider: "provider", providerVersion: "v1", providerSymbol: "BTC-USD",
      providerRequestId: "provider-request", sourceTimezone: "UTC", rawHash: raw, normalizedHash: h,
      recordCount: 2, observedCoverage: {
        observedStart: coverage.observedStart, observedEnd: coverage.observedEnd,
        firstTimestamp: coverage.firstTimestamp, lastTimestamp: coverage.lastTimestamp,
      }, storage };
    const outcomeValid = await pool.query<{ valid: boolean }>(
      `select public.investing_research_acquisition_outcome_valid_v1('awaiting_quality',$1::jsonb) valid`,
      [JSON.stringify(outcome)],
    );
    expect(outcomeValid.rows[0].valid).toBe(true);
    await pool.query(
      `insert into public.investing_research_acquisition_jobs
       (tenant_id,owner_id,portfolio_id,account_id,acquisition_job_id,request_id,attempt,
        acquisition_policy_version,idempotency_key,requested_by,correlation_id,priority,state,state_version,
        requested_at,started_at,completed_at,outcome)
       values ($1,'owner-a','portfolio-a',$2,'job-a',$3,1,'policy/v1','idem','owner-a','corr','normal',
        'awaiting_quality',4,now()-interval '2 minutes',now()-interval '1 minute',now(),$4::jsonb)`,
      [tenant, account, requestId, JSON.stringify(outcome)],
    );
    const sourcePayload = { contractVersion: "investing-research-dataset-version-material/v1", requirementId: requestId,
      acquisitionJobId: "job-a", acquisitionAttempt: 1,
      scope: { tenantId: tenant, ownerId: "owner-a", portfolioId: "portfolio-a", accountId: account },
      provider: { id: "provider", version: "v1", symbol: "BTC-USD", requestId: "provider-request" },
      storage, normalizationPolicyVersion: "investing-research-normalization-policy/v1", coverage,
      sourceTimezone: "UTC", canonicalTimezone: "UTC", acquiredAt: "2026-02-01T00:00:00.000Z",
      normalizedAt: "2026-02-01T00:01:00.000Z", state: "awaiting_quality", supersedes: null };
    await pool.query(
      `insert into public.investing_research_datasets
       (tenant_id,owner_id,portfolio_id,account_id,dataset_id,request_id,dataset_contract_version,state)
       values ($1,'owner-a','portfolio-a',$2,'dataset-a',$3,'v1','awaiting_quality')`,
      [tenant, account, requestId]);
    await pool.query(
      `insert into public.investing_research_dataset_versions
       (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id,dataset_id,request_id,acquisition_job_id,
        acquisition_attempt,manifest_hash,content_hash,schema_version,quality_state,canonical_payload)
       values ($1,'owner-a','portfolio-a',$2,'source-a','dataset-a',$3,'job-a',1,$4,$4,'ohlcv/v1','awaiting_quality',$5::jsonb)`,
      [tenant, account, requestId, h, JSON.stringify(sourcePayload)],
    );
    const gateIds = ["storage_integrity","coverage","calendar_session","gaps","duplicates","timezone",
      "stale_data","ohlcv_outliers","adjustment_policy","corporate_actions","look_ahead","survivorship","provenance"];
    const evidence = gateIds.filter((id) => !["corporate_actions","survivorship"].includes(id)).map((kind) => {
      const material = { verified: true, gate: kind };
      const canonical = canonicalizeResearchContract(material);
      if (!canonical.ok) throw new Error("fixture");
      const contentHash = createHash("sha256").update(
        `syntrake.investing.quality-evidence/v1\n${kind}\n${canonical.value}`,
      ).digest("hex");
      return { evidenceId: `irqev_v1_${contentHash}`, kind, contractVersion: "v1",
        contentHash, canonicalMaterial: canonical.value, state: "verified", material };
    });
    const gates = gateIds.map((gateId) => {
      const found = evidence.find((item) => item.kind === gateId);
      return { gateId, gateVersion: "v1", outcome: found ? "passed" : "not_applicable", reasonCode: null,
        evidenceIds: found ? [found.evidenceId] : [], metrics: {},
        applicabilityRule: gateId === "corporate_actions" ? "corporate_actions_non_equity/v1"
          : gateId === "survivorship" ? "survivorship_single_instrument/v1" : null };
    });
    const reportMaterial = { contractVersion: "investing.dataset-quality-report/v1",
      sourceDatasetVersionId: "source-a", requirementId: requestId, scope: sourcePayload.scope,
      policyVersion: "investing.dataset-quality-policy/v1", profile: { contractVersion: "investing.dataset-quality-policy/v1" },
      evidence, gates, outcome: "research_ready" };
    const reportCanonical = canonicalizeResearchContract(reportMaterial);
    if (!reportCanonical.ok) throw new Error("fixture");
    const reportHash = createHash("sha256").update(
      `syntrake.investing.dataset-quality-report/v1\n${reportCanonical.value}`,
    ).digest("hex");
    const reportId = `irqrep_v1_${reportHash}`;
    await pool.query(
      `insert into public.investing_research_dataset_quality_reports
       (tenant_id,owner_id,portfolio_id,account_id,quality_report_id,source_dataset_version_id,request_id,
        policy_version,report_hash,canonical_material,outcome,evaluated_at,correlation_id,canonical_payload)
       values ($1,'owner-a','portfolio-a',$2,$3,'source-a',$4,'investing.dataset-quality-policy/v1',
        $5,$6,'research_ready',now(),'corr',$7::jsonb)`,
      [tenant, account, reportId, requestId, reportHash, reportCanonical.value, JSON.stringify(reportMaterial)],
    );
    const derivedPayload = { ...sourcePayload, contractVersion: "investing.dataset-version/research-ready/v1",
      state: "research_ready", sourceDatasetVersionId: "source-a", qualityReportId: reportId,
      qualifiedAt: "2026-02-01T00:00:00.000Z" };
    await pool.query(
      `insert into public.investing_research_dataset_versions
       (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id,dataset_id,request_id,acquisition_job_id,
        acquisition_attempt,manifest_hash,content_hash,schema_version,quality_state,qualified_at,canonical_payload,
        quality_report_id,source_dataset_version_id)
       values ($1,'owner-a','portfolio-a',$2,'derived-a','dataset-a',$3,'job-a',1,$4,$5,'ohlcv/v1',
        'research_ready','2026-02-01T00:00:00.000Z',$6::jsonb,$7,'source-a')`,
      [tenant, account, requestId, "c".repeat(64), h, JSON.stringify(derivedPayload), reportId],
    );
    await pool.query(
      `insert into public.investing_research_dataset_lineage
       (tenant_id,owner_id,portfolio_id,account_id,lineage_event_id,parent_dataset_version_id,
        child_dataset_version_id,transformation_version,event_hash,canonical_payload)
       values ($1,'owner-a','portfolio-a',$2,'quality-lineage-a','source-a','derived-a',
        'investing.dataset-quality-policy/v1',$3,$4::jsonb)`,
      [tenant, account, "e".repeat(64), JSON.stringify({
        kind: "quality_qualification",
        sourceDatasetVersionId: "source-a",
        derivedDatasetVersionId: "derived-a",
        qualityReportId: reportId,
      })],
    );
    await expect(pool.query(
      `insert into public.investing_research_dataset_versions
       (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id,dataset_id,request_id,acquisition_job_id,
        acquisition_attempt,manifest_hash,content_hash,schema_version,quality_state,qualified_at,canonical_payload,
        quality_report_id,source_dataset_version_id)
       values ($1,'owner-b','portfolio-b',$2,'cross-scope','dataset-a',$3,'job-a',1,$4,$5,'ohlcv/v1',
        'research_ready',now(),$6::jsonb,$7,'source-a')`,
      [otherTenant, otherAccount, requestId, "d".repeat(64), h, JSON.stringify(derivedPayload), reportId],
    )).rejects.toMatchObject({ code: expect.stringMatching(/23503|23514/u) });
    const persisted = await pool.query(
      `select v.quality_state,l.parent_dataset_version_id,l.child_dataset_version_id
       from public.investing_research_dataset_versions v
       join public.investing_research_dataset_lineage l
         on l.tenant_id=v.tenant_id and l.owner_id=v.owner_id
        and l.portfolio_id=v.portfolio_id and l.account_id=v.account_id
        and l.child_dataset_version_id=v.dataset_version_id
       where v.dataset_version_id='derived-a'`,
    );
    expect(persisted.rows).toEqual([{
      quality_state: "research_ready",
      parent_dataset_version_id: "source-a",
      child_dataset_version_id: "derived-a",
    }]);
  });

  it("refuses fail-closed rollback when Phase 6F data exists", async () => {
    await expect(pool.query(rollback)).rejects.toMatchObject({ code: "55000" });
    const remains = await pool.query(`select count(*)::integer count from public.investing_research_dataset_quality_reports`);
    expect(remains.rows[0].count).toBe(1);
  });
});
