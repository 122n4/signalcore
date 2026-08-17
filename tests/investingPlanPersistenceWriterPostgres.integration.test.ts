import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentInputV1,
} from "@/lib/investing/authority/planAuthoringIntent";
import {
  buildCanonicalInvestingPlanPersistenceCommandV1,
  type CanonicalInvestingPlanPersistenceExpectedHeadV1,
} from "@/lib/investing/authority/planPersistenceCommand";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";

const databaseUrl = process.env.INVESTING_A3D_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/a3d_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(databaseUrl, process.env.ALLOW_DESTRUCTIVE_INVESTING_QA)
  : null;

const runId = `a3d_pg_${randomUUID().replaceAll("-", "")}`;
const ownerUserId = `${runId}_owner`;
const tenantId = randomUUID();
const membershipId = randomUUID();
const accountId = randomUUID();
const portfolioId = `${runId}_portfolio`;

function command(args: {
  idempotencyKey: string;
  expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1;
  objective?: CanonicalInvestingPlanAuthoringIntentInputV1["explicitIntent"]["objective"];
  authoredAt?: string;
}) {
  const authoringIntent = buildCanonicalInvestingPlanAuthoringIntentV1({
    authorityScope: {
      userId: ownerUserId,
      tenantId,
      membershipId,
      portfolioId,
      accountId,
      environment: "paper",
      accountBaseCurrency: "USD",
    },
    explicitIntent: {
      objective: args.objective ?? "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    authoredAt: args.authoredAt ?? "2026-08-17T03:00:00.000Z",
  });
  return buildCanonicalInvestingPlanPersistenceCommandV1({
    authoringIntent,
    idempotencyKey: args.idempotencyKey,
    expectedHead: args.expectedHead,
  });
}

pgDescribe("R6-A3D real PostgreSQL canonical Plan writer", () => {
  const pool = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      const connectionParameters = (client as unknown as { connectionParameters: {
        host: string;
        port: number;
        database: string;
      } }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, {
        host: connectionParameters.host,
        port: connectionParameters.port,
        database: connectionParameters.database,
      });
      await client.query("select 'public.investing_persist_canonical_plan_v1(text,jsonb)'::regprocedure");
      await client.query(`
        insert into public.investing_tenants(id, owner_user_id, kind, status)
        values ($1, $2, 'personal', 'active')
      `, [tenantId, ownerUserId]);
      await client.query(`
        insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status)
        values ($1, $2, $3, 'owner', array['investing:read','investing:create','investing:verify','investing:replay'], 'active')
      `, [membershipId, tenantId, ownerUserId]);
      await client.query(`
        insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
        values ($1, $2, $2, $3, $4, 'USD', 'paper', 'active')
      `, [accountId, ownerUserId, tenantId, portfolioId]);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table public.investing_plan_revisions disable trigger user");
      await client.query("alter table public.investing_plan_heads disable trigger user");
      await client.query("alter table public.investing_plan_idempotency_keys disable trigger user");
      await client.query("delete from public.investing_plan_idempotency_keys where account_id = $1", [accountId]);
      await client.query("delete from public.investing_plan_heads where account_id = $1", [accountId]);
      await client.query("delete from public.investing_plan_revisions where account_id = $1", [accountId]);
      await client.query("delete from public.investing_accounts where id = $1", [accountId]);
      await client.query("delete from public.investing_tenant_memberships where id = $1", [membershipId]);
      await client.query("delete from public.investing_tenants where id = $1", [tenantId]);
      await client.query("alter table public.investing_plan_revisions enable trigger user");
      await client.query("alter table public.investing_plan_heads enable trigger user");
      await client.query("alter table public.investing_plan_idempotency_keys enable trigger user");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  });

  async function persist(canonicalCommand: unknown) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      const result = await client.query(
        "select public.investing_persist_canonical_plan_v1($1, $2::jsonb) result",
        [ownerUserId, JSON.stringify(canonicalCommand)],
      );
      await client.query("commit");
      return result.rows[0].result as any;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  it("serializes concurrent exact retries with one physical revision", async () => {
    const canonicalCommand = command({ idempotencyKey: `${runId}_idem_01`, expectedHead: null });
    const [first, second] = await Promise.all([
      persist(canonicalCommand),
      persist(canonicalCommand),
    ]);

    expect([first.status, second.status].sort()).toEqual(["IDEMPOTENT_REPLAY", "NEW_COMMIT"]);
    expect(first.revision.id).toBe(second.revision.id);

    const rows = await pool.query(
      `select
        (select count(*)::int from public.investing_plan_revisions where account_id = $1) revisions,
        (select count(*)::int from public.investing_plan_heads where account_id = $1) heads,
        (select count(*)::int from public.investing_plan_idempotency_keys where account_id = $1) idempotency`,
      [accountId],
    );
    expect(rows.rows[0]).toEqual({ revisions: 1, heads: 1, idempotency: 1 });
  });

  it("serializes same-account competing expected-head writes without revision collisions or skips", async () => {
    const current = await pool.query(
      `select r.id::text revision_id, r.revision_number::int revision_number, r.authoring_fingerprint
       from public.investing_plan_heads h
       join public.investing_plan_revisions r on r.id = h.current_revision_id
       where h.account_id = $1`,
      [accountId],
    );
    const expectedHead = {
      revisionId: current.rows[0].revision_id,
      revisionNumber: current.rows[0].revision_number,
      authoringFingerprint: current.rows[0].authoring_fingerprint,
    };
    const [left, right] = await Promise.allSettled([
      persist(command({
        idempotencyKey: `${runId}_idem_02`,
        expectedHead,
        objective: "income",
        authoredAt: "2026-08-17T03:01:00.000Z",
      })),
      persist(command({
        idempotencyKey: `${runId}_idem_03`,
        expectedHead,
        objective: "balanced",
        authoredAt: "2026-08-17T03:02:00.000Z",
      })),
    ]);

    const fulfilled = [left, right].filter((entry): entry is PromiseFulfilledResult<any> => entry.status === "fulfilled");
    const rejected = [left, right].filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("investing_plan_expected_head_conflict");
    expect(fulfilled[0].value.revision.revisionNumber).toBe("2");

    const numbers = await pool.query(
      "select array_agg(revision_number order by revision_number) revisions from public.investing_plan_revisions where account_id = $1",
      [accountId],
    );
    expect(numbers.rows[0].revisions.map(String)).toEqual(["1", "2"]);
  });
});
