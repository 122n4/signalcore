import "server-only";

import type { Pool, PoolClient } from "pg";

import type { ResolvedInvestingIdentityContextV1 } from "@/lib/investing/identity";
import type {
  InvestingOpsReadDatasetV1,
  InvestingOpsReadModelPortV1,
  InvestingOpsReadRowV1,
} from "@/lib/investing/ops/ports";
import type { InvestingOpsOperationBudgetV1 } from
  "@/lib/investing/ops/adapter.server";

const MAX_SCOPE_RUNS = 100;
type RunRow = Readonly<{
  run_id: string;
  owner_id: string;
  account_id: string;
  as_of: Date | string;
  state: string;
  quality: string;
}>;

async function authenticatedRead<T>(
  pool: Pick<Pool, "connect">,
  userId: string,
  budget: InvestingOpsOperationBudgetV1,
  read: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const remainingMs = budget.remainingMs();
    if (remainingMs === 0) throw new Error("investing_ops_budget_expired");
    await client.query("set local role authenticated");
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: userId })],
    );
    await client.query(
      "select set_config('statement_timeout', $1, true)",
      [`${remainingMs}ms`],
    );
    const result = await read(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertRowScope(
  scope: ResolvedInvestingIdentityContextV1,
  row: RunRow,
): void {
  if (row.owner_id !== scope.ownerId || row.account_id !== scope.accountId) {
    throw new Error("ops_scope_projection_mismatch");
  }
}

export class PostgresInvestingOpsReadModelV1
implements InvestingOpsReadModelPortV1 {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly budget: InvestingOpsOperationBudgetV1,
  ) {}

  readScope(
    scope: ResolvedInvestingIdentityContextV1,
  ): Promise<InvestingOpsReadDatasetV1> {
    return authenticatedRead(
      this.pool,
      scope.authenticatedUserId,
      this.budget,
      async (client) => {
        const result = await client.query<RunRow>(
          `select run_id, owner_id, account_id::text, as_of, state, quality
             from public.investing_engine_runs
            where owner_id = $1 and account_id = $2::uuid
            order by as_of desc, created_at desc, run_id asc
            limit $3`,
          [scope.ownerId, scope.accountId, MAX_SCOPE_RUNS + 1],
        );
        if (result.rows.length > MAX_SCOPE_RUNS) {
          throw new Error("ops_scope_budget_exceeded");
        }
        result.rows.forEach((row) => assertRowScope(scope, row));
        const runs: InvestingOpsReadRowV1[] = result.rows.map((row) => ({
          runId: row.run_id,
          ownerId: row.owner_id,
          tenantId: scope.tenantId,
          portfolioId: scope.portfolioId,
          accountId: row.account_id,
          asOf: new Date(row.as_of).toISOString(),
          state: row.state,
          quality: row.quality,
          requestOutcome: null,
          reasonCode: null,
          idempotencyConflict: null,
          ambiguousCommitRecovery: null,
        }));
        return {
          runs,
          failures: null,
          telemetryComplete: false,
        };
      },
    );
  }
}

export { MAX_SCOPE_RUNS as INVESTING_OPS_MAX_SCOPE_RUNS_V1 };
