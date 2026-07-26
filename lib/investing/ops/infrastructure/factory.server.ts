import "server-only";

import { performance } from "node:perf_hooks";

import type { Pool } from "pg";

import {
  ClerkInvestingAuthenticatedSessionAdapterV1,
  type InvestingRequestUserReaderV1,
} from "@/lib/investing/identity/infrastructure/clerkSession.server";
import {
  createInvestingIdentityDirectoryPoolV1,
  PostgresInvestingScopeDirectoryAdapterV1,
} from "@/lib/investing/identity/infrastructure/postgresDirectory.server";
import { InvestingIdentityScopeResolverV1 } from
  "@/lib/investing/identity/resolver.server";
import {
  InvestingOpsOfficialServicesAdapterV1,
} from "@/lib/investing/ops/adapter.server";
import { InvestingOpsServiceV1 } from "@/lib/investing/ops/service.server";
import type {
  InvestingOpsClockPortV1,
  InvestingOpsLogPortV1,
} from "@/lib/investing/ops/ports";
import {
  type PureInvestingEngineRunnerV1,
} from "@/lib/investing/engine/v1/persistence";
import { runInvestingEngineV1Final } from "@/lib/investing/engine/v1/phase3f/engine";
import type { InvestingEnginePhase3FSourcesV1 } from "@/lib/investing/engine/v1/phase3f/types";
import { PostgresInvestingOpsReadModelV1 } from
  "@/lib/investing/ops/infrastructure/postgresReadModel.server";
import {
  OfficialInvestingOpsReplayProjectionV1,
  OfficialInvestingOpsVerifierProjectionV1,
  INVESTING_OPS_INTEGRITY_TIMEOUT_MS_V1,
  ScopedInvestingOpsIntegrityProjectionV1,
} from "@/lib/investing/ops/infrastructure/projections.server";
import { createInvestingOpsSoftBudgetV1 } from
  "@/lib/investing/ops/infrastructure/softBudget.server";

const defaultClock: InvestingOpsClockPortV1 = {
  now: () => ({ iso: new Date().toISOString(), monotonicMs: performance.now() }),
};
const noOpLogger: InvestingOpsLogPortV1 = { write: () => undefined };
const officialPureRunner: PureInvestingEngineRunnerV1 = (sources) =>
  runInvestingEngineV1Final(sources as unknown as InvestingEnginePhase3FSourcesV1);

export type ProductionInvestingOpsRuntimeOptionsV1 = Readonly<{
  connectionString?: string;
  readUser?: InvestingRequestUserReaderV1;
  clock?: InvestingOpsClockPortV1;
  logger?: InvestingOpsLogPortV1;
  pureRunner?: PureInvestingEngineRunnerV1;
  budgetNowMs?: () => number;
}>;

export type ProductionInvestingOpsRuntimeV1 = Readonly<{
  service: InvestingOpsServiceV1;
  close(): Promise<void>;
}>;

export function createProductionInvestingOpsRuntimeV1(
  options: ProductionInvestingOpsRuntimeOptionsV1 = {},
): ProductionInvestingOpsRuntimeV1 {
  const connectionString =
    options.connectionString ?? process.env.SUPABASE_DB_URL ?? "";
  const pool: Pool = createInvestingIdentityDirectoryPoolV1(connectionString);
  const pureRunner = options.pureRunner ?? officialPureRunner;
  const session = new ClerkInvestingAuthenticatedSessionAdapterV1(options.readUser);
  const service = new InvestingOpsServiceV1(
    () => {
      const budget = createInvestingOpsSoftBudgetV1(
        INVESTING_OPS_INTEGRITY_TIMEOUT_MS_V1,
        options.budgetNowMs,
      );
      const dependencies = {
        readModel: new PostgresInvestingOpsReadModelV1(pool, budget),
        integrity: new ScopedInvestingOpsIntegrityProjectionV1({
          pool,
          pureRunner,
          budget,
        }),
        verifier: new OfficialInvestingOpsVerifierProjectionV1(pool, budget),
        replay: new OfficialInvestingOpsReplayProjectionV1(
          pool,
          pureRunner,
          budget,
        ),
      };
      return {
        budget,
        resolver: new InvestingIdentityScopeResolverV1(
          session,
          new PostgresInvestingScopeDirectoryAdapterV1(pool, budget),
        ),
        adapter: new InvestingOpsOfficialServicesAdapterV1(
          dependencies,
          budget,
        ),
      };
    },
    options.clock ?? defaultClock,
    options.logger ?? noOpLogger,
  );
  let closed = false;
  return {
    service,
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}
