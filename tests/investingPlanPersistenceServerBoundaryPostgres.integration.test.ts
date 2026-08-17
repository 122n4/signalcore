import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  assertEffectiveDestructiveInvestingQaDatabase,
  assertLocalSupabaseDestructiveInvestingQaTarget,
} from "@/scripts/qa/investingDestructiveQaGuard";

const databaseUrl = process.env.INVESTING_A3E_TEST_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const integrationDescribe = databaseUrl && supabaseUrl && serviceRoleKey ? describe : describe.skip;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/a3e_not_configured";
const destructiveQaTarget = databaseUrl && supabaseUrl && serviceRoleKey
  ? assertLocalSupabaseDestructiveInvestingQaTarget({
    databaseUrl,
    supabaseUrl,
    destructiveConfirmation: process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  })
  : null;

const runId = `a3e_pg_${randomUUID().replaceAll("-", "")}`;
const authState = vi.hoisted(() => ({
  userId: `a3e_pending_user`,
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
}));

const { persistCanonicalInvestingPlanForRequestV1 } = await import("@/lib/investing/server/planPersistence");

type Scope = {
  userId: string;
  tenantId: string;
  membershipId: string;
  accountId: string;
  portfolioId: string;
  baseCurrency: string;
  environment: "paper" | "simulation";
};

const request = new Request("http://localhost/internal/a3e-plan-persistence", { method: "POST" });

function makeScope(label: string, overrides: Partial<Pick<Scope, "userId" | "baseCurrency" | "environment">> = {}): Scope {
  const userId = overrides.userId ?? `${runId}_${label}_owner`;
  return {
    userId,
    tenantId: randomUUID(),
    membershipId: randomUUID(),
    accountId: randomUUID(),
    portfolioId: `${runId}_${label}_portfolio`,
    baseCurrency: overrides.baseCurrency ?? "USD",
    environment: overrides.environment ?? "paper",
  };
}

function rawInput(scope: Scope, overrides: Record<string, unknown> = {}) {
  return {
    accountId: scope.accountId,
    explicitIntent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    idempotencyKey: `${runId}_${scope.portfolioId.slice(-10)}_idem1`,
    expectedHead: null,
    ...overrides,
  };
}

integrationDescribe("R6-A3E real Supabase RPC canonical Plan persistence boundary", () => {
  const pool = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  let destructiveQaVerified = false;

  beforeAll(async () => {
    await verifyTarget();
    destructiveQaVerified = true;
    console.info(JSON.stringify({
      event: "investing_a3e_local_supabase_destructive_qa_target_verified",
      database: destructiveQaTarget!.database,
      api: destructiveQaTarget!.api,
    }));
  });

  afterAll(async () => {
    if (!destructiveQaVerified) {
      await pool.end();
      return;
    }
    await verifyTarget();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table public.investing_plan_revisions disable trigger user");
      await client.query("alter table public.investing_plan_heads disable trigger user");
      await client.query("alter table public.investing_plan_idempotency_keys disable trigger user");
      await client.query("delete from public.investing_plan_idempotency_keys where owner_user_id like $1", [`${runId}_%`]);
      await client.query("delete from public.investing_plan_heads where owner_user_id like $1", [`${runId}_%`]);
      await client.query("delete from public.investing_plan_revisions where owner_user_id like $1", [`${runId}_%`]);
      await client.query("delete from public.investing_accounts where owner_user_id like $1", [`${runId}_%`]);
      await client.query("delete from public.investing_tenant_memberships where user_id like $1", [`${runId}_%`]);
      await client.query("delete from public.investing_tenants where owner_user_id like $1", [`${runId}_%`]);
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

  async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async function verifyTarget() {
    await withClient(async (client) => {
      const connectionParameters = (client as unknown as { connectionParameters: {
        host: string;
        port: number;
        database: string;
      } }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!.database, {
        host: connectionParameters.host,
        port: connectionParameters.port,
        database: connectionParameters.database,
      });
      await client.query("select 'public.investing_persist_canonical_plan_v1(text,jsonb)'::regprocedure");
    });
  }

  async function createScope(scope: Scope) {
    await verifyTarget();
    await pool.query(
      `insert into public.investing_tenants(id, owner_user_id, kind, status)
       values ($1, $2, 'personal', 'active')`,
      [scope.tenantId, scope.userId],
    );
    await pool.query(
      `insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status, revoked_at)
       values (
         $1,
         $2,
         $3,
         'owner',
         array['investing:read','investing:create','investing:verify','investing:replay'],
         'active',
         null
       )`,
      [scope.membershipId, scope.tenantId, scope.userId],
    );
    await pool.query(
      `insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
       values ($1, $2, $2, $3, $4, $5, $6, 'active')`,
      [scope.accountId, scope.userId, scope.tenantId, scope.portfolioId, scope.baseCurrency, scope.environment],
    );
  }

  async function rowCounts(scope: Scope) {
    const result = await pool.query(
      `select
        (select count(*)::int from public.investing_plan_revisions where account_id = $1) revisions,
        (select count(*)::int from public.investing_plan_heads where account_id = $1) heads,
        (select count(*)::int from public.investing_plan_idempotency_keys where account_id = $1) idempotency`,
      [scope.accountId],
    );
    return result.rows[0] as { revisions: number; heads: number; idempotency: number };
  }

  async function persist(scope: Scope, input: unknown) {
    authState.userId = scope.userId;
    return persistCanonicalInvestingPlanForRequestV1(request, input);
  }

  it("creates one revision through the real server boundary and replays exact retries through A3D", async () => {
    const scope = makeScope("first", { environment: "paper" });
    await createScope(scope);
    const input = rawInput(scope);

    const first = await persist(scope, input);
    expect(first.status).toBe("NEW_COMMIT");
    expect(first.scope).toEqual({
      tenantId: scope.tenantId,
      ownerUserId: scope.userId,
      portfolioId: scope.portfolioId,
      accountId: scope.accountId,
      environment: "paper",
    });
    expect(await rowCounts(scope)).toEqual({ revisions: 1, heads: 1, idempotency: 1 });

    const replay = await persist(scope, input);
    expect(replay.status).toBe("IDEMPOTENT_REPLAY");
    expect(replay.revision.id).toBe(first.revision.id);
    expect(replay.revision.persistenceTxid).toBe(first.revision.persistenceTxid);
    expect(replay.idempotency.createdAt).toBe(first.idempotency.createdAt);
    expect(await rowCounts(scope)).toEqual({ revisions: 1, heads: 1, idempotency: 1 });
  });

  it("rejects same idempotency key with changed intent before adding rows", async () => {
    const scope = makeScope("mismatch");
    await createScope(scope);
    const input = rawInput(scope);

    await persist(scope, input);
    await expect(
      persist(scope, rawInput(scope, {
        explicitIntent: {
          objective: "income",
          riskProfile: "Balanced",
          horizon: "Medium",
        },
      })),
    ).rejects.toMatchObject({ code: "investing_plan_idempotency_payload_mismatch", status: 409 });
    expect(await rowCounts(scope)).toEqual({ revisions: 1, heads: 1, idempotency: 1 });
  });

  it("rejects stale expectedHead after the head has advanced without adding rows", async () => {
    const scope = makeScope("stale_head", { environment: "simulation", baseCurrency: "GBP" });
    await createScope(scope);
    const first = await persist(scope, rawInput(scope, { idempotencyKey: `${runId}_stale_01` }));
    const staleHead = {
      revisionId: first.revision.id,
      revisionNumber: Number(first.revision.revisionNumber),
      authoringFingerprint: first.revision.authoringFingerprint,
    };

    const second = await persist(scope, rawInput(scope, {
      idempotencyKey: `${runId}_stale_02`,
      expectedHead: staleHead,
      explicitIntent: {
        objective: "income",
        riskProfile: "Balanced",
        horizon: "Medium",
      },
    }));
    expect(second.status).toBe("NEW_COMMIT");

    await expect(
      persist(scope, rawInput(scope, {
        idempotencyKey: `${runId}_stale_03`,
        expectedHead: staleHead,
        explicitIntent: {
          objective: "balanced",
          riskProfile: "Balanced",
          horizon: "Medium",
        },
      })),
    ).rejects.toMatchObject({ code: "investing_plan_expected_head_conflict", status: 409 });
    expect(await rowCounts(scope)).toEqual({ revisions: 2, heads: 1, idempotency: 2 });
  });

  it("rejects cross-user account selectors before canonical writer persistence", async () => {
    const owner = makeScope("selector_owner");
    const attacker = makeScope("selector_attacker");
    await createScope(owner);
    await createScope(attacker);

    await expect(persist(attacker, rawInput(owner))).rejects.toMatchObject({
      code: "investing_plan_persistence_account_not_found_or_forbidden",
      status: 404,
    });
    expect(await rowCounts(owner)).toEqual({ revisions: 0, heads: 0, idempotency: 0 });
    expect(await rowCounts(attacker)).toEqual({ revisions: 0, heads: 0, idempotency: 0 });
  });
});
