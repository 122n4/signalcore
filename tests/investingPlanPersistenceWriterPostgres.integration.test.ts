import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
  buildCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentInputV1,
} from "@/lib/investing/authority/planAuthoringIntent";
import {
  CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
  CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
  buildCanonicalInvestingPlanPersistenceCommandV1,
  type CanonicalInvestingPlanPersistenceCommandV1,
  type CanonicalInvestingPlanPersistenceExpectedHeadV1,
} from "@/lib/investing/authority/planPersistenceCommand";
import { canonicalSha256 } from "@/lib/investing/engine/v1/canonical";
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

type Scope = {
  ownerUserId: string;
  tenantId: string;
  membershipId: string;
  accountId: string;
  portfolioId: string;
  accountBaseCurrency: string;
  commandAccountBaseCurrency: string;
  accountEnvironment: "paper" | "simulation";
  commandEnvironment: "paper" | "simulation";
  tenantStatus: "active" | "inactive";
  membershipStatus: "active" | "inactive" | "revoked";
  accountStatus: "active" | "suspended" | "closed" | "legacy_unverified";
};

type PersistenceResult = {
  status: "NEW_COMMIT" | "IDEMPOTENT_REPLAY";
  revision: {
    id: string;
    revisionNumber: string;
    previousRevisionId: string | null;
    authoringFingerprint: string;
    persistedAt: string;
    persistenceTxid: string;
  };
};

function expectedHeadFingerprintInput(expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1) {
  if (expectedHead === null) return null;
  return {
    revisionId: expectedHead.revisionId,
    revisionNumber: String(expectedHead.revisionNumber),
    authoringFingerprint: expectedHead.authoringFingerprint,
  };
}

function rehashCommand(command: CanonicalInvestingPlanPersistenceCommandV1): CanonicalInvestingPlanPersistenceCommandV1 {
  const authoringFingerprint = canonicalSha256({
    contractVersion: CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
    authorityScope: {
      userId: command.scope.userId,
      tenantId: command.scope.tenantId,
      membershipId: command.authoringLineage.membershipId,
      portfolioId: command.scope.portfolioId,
      accountId: command.scope.accountId,
      environment: command.scope.environment,
      accountBaseCurrency: command.scope.accountBaseCurrency,
    },
    explicitIntent: command.explicitIntent,
    constraintAuthoring: command.authorityState.constraintAuthoring,
    financialMethodology: command.authorityState.financialMethodology,
    suitability: command.authorityState.suitability,
    mandateEligibility: command.authorityState.mandateEligibility,
    recommendationEligibility: command.authorityState.recommendationEligibility,
    runtimeActivationEligibility: command.authorityState.runtimeActivationEligibility,
    reasonCodes: command.authorityState.reasonCodes,
    authoredAt: command.authoringLineage.authoredAt,
  });
  const withAuthoringFingerprint = {
    ...command,
    authoringLineage: {
      ...command.authoringLineage,
      authoringFingerprint,
    },
  };
  const semanticRequestFingerprint = canonicalSha256({
    contractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
    operation: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
    authoringContractVersion: withAuthoringFingerprint.authoringLineage.authoringContractVersion,
    scope: withAuthoringFingerprint.scope,
    explicitIntent: withAuthoringFingerprint.explicitIntent,
    authorityState: withAuthoringFingerprint.authorityState,
    expectedHead: expectedHeadFingerprintInput(withAuthoringFingerprint.expectedHead),
  });
  const withSemanticFingerprint = {
    ...withAuthoringFingerprint,
    idempotency: {
      ...withAuthoringFingerprint.idempotency,
      semanticRequestFingerprint,
    },
  };
  const commandFingerprint = canonicalSha256({
    contractVersion: withSemanticFingerprint.contractVersion,
    operation: withSemanticFingerprint.operation,
    scope: withSemanticFingerprint.scope,
    authoringLineage: withSemanticFingerprint.authoringLineage,
    explicitIntent: withSemanticFingerprint.explicitIntent,
    authorityState: withSemanticFingerprint.authorityState,
    idempotency: withSemanticFingerprint.idempotency,
    expectedHead: expectedHeadFingerprintInput(withSemanticFingerprint.expectedHead),
    persistenceAuthority: withSemanticFingerprint.persistenceAuthority,
  });
  return { ...withSemanticFingerprint, commandFingerprint };
}

function makeScope(
  label: string,
  overrides: Partial<Pick<
    Scope,
    | "accountBaseCurrency"
    | "commandAccountBaseCurrency"
    | "accountEnvironment"
    | "commandEnvironment"
    | "tenantStatus"
    | "membershipStatus"
    | "accountStatus"
  >> = {},
): Scope {
  const ownerUserId = `${runId}_${label}_owner`;
  const accountBaseCurrency = overrides.accountBaseCurrency ?? "USD";
  return {
    ownerUserId,
    tenantId: randomUUID(),
    membershipId: randomUUID(),
    accountId: randomUUID(),
    portfolioId: `${runId}_${label}_portfolio`,
    accountBaseCurrency,
    commandAccountBaseCurrency: overrides.commandAccountBaseCurrency ?? accountBaseCurrency,
    accountEnvironment: overrides.accountEnvironment ?? "paper",
    commandEnvironment: overrides.commandEnvironment ?? overrides.accountEnvironment ?? "paper",
    tenantStatus: overrides.tenantStatus ?? "active",
    membershipStatus: overrides.membershipStatus ?? "active",
    accountStatus: overrides.accountStatus ?? "active",
  };
}

function command(scope: Scope, args: {
  idempotencyKey: string;
  expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1;
  objective?: CanonicalInvestingPlanAuthoringIntentInputV1["explicitIntent"]["objective"];
  authoredAt?: string;
}) {
  const authoringIntent = buildCanonicalInvestingPlanAuthoringIntentV1({
    authorityScope: {
      userId: scope.ownerUserId,
      tenantId: scope.tenantId,
      membershipId: scope.membershipId,
      portfolioId: scope.portfolioId,
      accountId: scope.accountId,
      environment: scope.commandEnvironment,
      accountBaseCurrency: scope.commandAccountBaseCurrency,
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
  const pool = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 12 });

  afterAll(async () => {
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
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, {
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
       values ($1, $2, 'personal', $3)`,
      [scope.tenantId, scope.ownerUserId, scope.tenantStatus],
    );
    await pool.query(
      `insert into public.investing_tenant_memberships(id, tenant_id, user_id, role, permissions, status, revoked_at)
       values (
         $1,
         $2,
         $3,
         'owner',
         array['investing:read','investing:create','investing:verify','investing:replay'],
         $4,
         case when $4 = 'revoked' then '2026-08-17T03:00:00.000Z'::timestamptz else null end
       )`,
      [scope.membershipId, scope.tenantId, scope.ownerUserId, scope.membershipStatus],
    );
    await pool.query(
      `insert into public.investing_accounts(id, user_id, owner_user_id, tenant_id, portfolio_id, base_currency, environment, status)
       values ($1, $2, $2, $3, $4, $5, $6, $7)`,
      [
        scope.accountId,
        scope.ownerUserId,
        scope.tenantId,
        scope.portfolioId,
        scope.accountBaseCurrency,
        scope.accountEnvironment,
        scope.accountStatus,
      ],
    );
  }

  async function persist(scope: Scope, canonicalCommand: unknown) {
    return await withClient(async (client) => {
      try {
        await client.query("begin");
        await client.query("set local role service_role");
        const result = await client.query(
          "select public.investing_persist_canonical_plan_v1($1, $2::jsonb) result",
          [scope.ownerUserId, JSON.stringify(canonicalCommand)],
        );
        await client.query("commit");
        return result.rows[0].result as PersistenceResult;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async function expectReject(
    scope: Scope,
    canonicalCommand: unknown,
    expectedMessage: string,
  ) {
    await expect(persist(scope, canonicalCommand)).rejects.toThrow(expectedMessage);
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

  async function expectZeroRows(scope: Scope) {
    expect(await rowCounts(scope)).toEqual({ revisions: 0, heads: 0, idempotency: 0 });
  }

  async function waitForMembershipUpdateLock(scope: Scope) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const observed = await withClient(async (client) => {
        try {
          await client.query("begin");
          await client.query("set local lock_timeout = '100ms'");
          await client.query(
            `update public.investing_tenant_memberships
             set status = 'revoked', revoked_at = '2026-08-17T03:04:00.000Z'::timestamptz
             where id = $1`,
            [scope.membershipId],
          );
          await client.query("rollback");
          return false;
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          return String(error).includes("lock timeout");
        }
      });
      if (observed) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("a3d_writer_membership_lock_not_observed");
  }

  it("serializes concurrent exact retries with one physical revision", async () => {
    const scope = makeScope("retry");
    await createScope(scope);
    const canonicalCommand = command(scope, { idempotencyKey: `${runId}_idem_01`, expectedHead: null });
    const [first, second] = await Promise.all([
      persist(scope, canonicalCommand),
      persist(scope, canonicalCommand),
    ]);

    expect([first.status, second.status].sort()).toEqual(["IDEMPOTENT_REPLAY", "NEW_COMMIT"]);
    expect(first.revision.id).toBe(second.revision.id);
    expect(first.revision.persistenceTxid).toBe(second.revision.persistenceTxid);
    expect(await rowCounts(scope)).toEqual({ revisions: 1, heads: 1, idempotency: 1 });
  });

  it("serializes same-account competing expected-head writes without revision collisions or skips", async () => {
    const scope = makeScope("expected_head");
    await createScope(scope);
    const first = await persist(scope, command(scope, { idempotencyKey: `${runId}_idem_02a`, expectedHead: null }));
    const expectedHead = {
      revisionId: first.revision.id,
      revisionNumber: Number(first.revision.revisionNumber),
      authoringFingerprint: first.revision.authoringFingerprint,
    };

    const [left, right] = await Promise.allSettled([
      persist(scope, command(scope, {
        idempotencyKey: `${runId}_idem_02b`,
        expectedHead,
        objective: "income",
        authoredAt: "2026-08-17T03:01:00.000Z",
      })),
      persist(scope, command(scope, {
        idempotencyKey: `${runId}_idem_02c`,
        expectedHead,
        objective: "balanced",
        authoredAt: "2026-08-17T03:02:00.000Z",
      })),
    ]);

    const fulfilled = [left, right].filter((entry): entry is PromiseFulfilledResult<PersistenceResult> => entry.status === "fulfilled");
    const rejected = [left, right].filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("investing_plan_expected_head_conflict");
    expect(fulfilled[0].value.revision.revisionNumber).toBe("2");

    const numbers = await pool.query(
      "select array_agg(revision_number order by revision_number) revisions from public.investing_plan_revisions where account_id = $1",
      [scope.accountId],
    );
    expect(numbers.rows[0].revisions.map(String)).toEqual(["1", "2"]);
  });

  it("rejects inactive accounts before writing any canonical Plan rows", async () => {
    const scope = makeScope("inactive_account", { accountStatus: "suspended" });
    await createScope(scope);

    await expectReject(
      scope,
      command(scope, { idempotencyKey: `${runId}_idem_03`, expectedHead: null }),
      "investing_plan_persistence_account_status_invalid",
    );
    await expectZeroRows(scope);
  });

  it("classifies parent account environment mismatch as account-scope mismatch", async () => {
    const scope = makeScope("environment_mismatch", {
      accountEnvironment: "simulation",
      commandEnvironment: "paper",
    });
    await createScope(scope);

    await expectReject(
      scope,
      command(scope, { idempotencyKey: `${runId}_idem_04`, expectedHead: null }),
      "investing_plan_persistence_account_scope_mismatch",
    );
    await expectZeroRows(scope);
  });

  it("rejects fully rehashed semantic forgery through the real writer", async () => {
    const scope = makeScope("forgery");
    await createScope(scope);
    const canonicalCommand = command(scope, { idempotencyKey: `${runId}_idem_05`, expectedHead: null });
    const forged = rehashCommand({
      ...canonicalCommand,
      authorityState: {
        ...canonicalCommand.authorityState,
        suitability: { authority: "ACCEPTED" as never },
      },
    });

    await expectReject(
      scope,
      forged,
      "investing_plan_persistence_canonical_command_invalid",
    );
    await expectZeroRows(scope);
  });

  it("rejects when membership revocation commits before the writer locks authorization", async () => {
    const scope = makeScope("revoked_first");
    await createScope(scope);
    await pool.query(
      `update public.investing_tenant_memberships
       set status = 'revoked', revoked_at = '2026-08-17T03:03:00.000Z'::timestamptz
       where id = $1`,
      [scope.membershipId],
    );

    await expectReject(
      scope,
      command(scope, { idempotencyKey: `${runId}_idem_06`, expectedHead: null }),
      "investing_plan_persistence_revoked_membership",
    );
    await expectZeroRows(scope);
  });

  it("locks fresh membership authorization before waiting on account serialization", async () => {
    const scope = makeScope("writer_locks_auth_first");
    await createScope(scope);
    const accountBlocker = await pool.connect();
    try {
      await accountBlocker.query("begin");
      await accountBlocker.query("select 1 from public.investing_accounts where id = $1 for update", [scope.accountId]);

      const writer = persist(scope, command(scope, { idempotencyKey: `${runId}_idem_07`, expectedHead: null }));
      await waitForMembershipUpdateLock(scope);

      await accountBlocker.query("commit");
      const result = await writer;
      expect(result.status).toBe("NEW_COMMIT");
      expect(await rowCounts(scope)).toEqual({ revisions: 1, heads: 1, idempotency: 1 });

      await pool.query(
        `update public.investing_tenant_memberships
         set status = 'revoked', revoked_at = '2026-08-17T03:05:00.000Z'::timestamptz
         where id = $1`,
        [scope.membershipId],
      );
    } finally {
      await accountBlocker.query("rollback").catch(() => undefined);
      accountBlocker.release();
    }
  });
});
