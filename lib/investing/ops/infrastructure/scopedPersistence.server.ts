import "server-only";

import type { Pool, PoolClient } from "pg";

import type {
  InvestingEngineFinalHashSelectorV1,
  InvestingEngineIdempotencySelectorV1,
  InvestingEngineLatestSelectorV1,
  InvestingEnginePersistenceReadPortV1,
  InvestingEngineRunScopeV1,
} from "@/lib/investing/engine/v1/persistence";
import type {
  InvestingEngineLoadedPersistenceV1,
  InvestingEnginePersistedRunRowV1,
} from "@/lib/investing/engine/v1/persistence";
import {
  findByFinalHashV1,
  findByIdempotencyV1,
  findByScopeV1,
  findLatestV1,
  loadCompleteWithQueryableV1,
} from "@/lib/investing/engine/v1/persistence/postgres/adapter";
import type { InvestingOpsSoftBudgetV1 } from
  "@/lib/investing/ops/infrastructure/softBudget.server";

async function authenticatedRead<T>(
  pool: Pick<Pool, "connect">,
  authenticatedUserId: string,
  budget: InvestingOpsSoftBudgetV1,
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
      [JSON.stringify({ sub: authenticatedUserId })],
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

export class AuthenticatedInvestingPersistenceReadPortV1
implements InvestingEnginePersistenceReadPortV1 {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly authenticatedUserId: string,
    private readonly budget: InvestingOpsSoftBudgetV1,
  ) {}

  findRunByScope(selector: InvestingEngineRunScopeV1) {
    return authenticatedRead(this.pool, this.authenticatedUserId, this.budget, (client) =>
      findByScopeV1(client, selector));
  }

  findRunByIdempotency(selector: InvestingEngineIdempotencySelectorV1) {
    return authenticatedRead(this.pool, this.authenticatedUserId, this.budget, (client) =>
      findByIdempotencyV1(client, selector));
  }

  findRunByFinalHash(selector: InvestingEngineFinalHashSelectorV1) {
    return authenticatedRead(this.pool, this.authenticatedUserId, this.budget, (client) =>
      findByFinalHashV1(client, selector));
  }

  findLatestRun(selector: InvestingEngineLatestSelectorV1) {
    return authenticatedRead(this.pool, this.authenticatedUserId, this.budget, (client) =>
      findLatestV1(client, selector));
  }

  loadCompleteRun(
    run: InvestingEnginePersistedRunRowV1,
  ): Promise<InvestingEngineLoadedPersistenceV1> {
    return authenticatedRead(this.pool, this.authenticatedUserId, this.budget, (client) =>
      loadCompleteWithQueryableV1(client, run));
  }
}
