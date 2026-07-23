import pg from "pg";

import { runInvestingEngineV1Final, type InvestingEnginePhase3FSourcesV1 } from "@/lib/investing/engine/v1/phase3f";
import {
  InvestingEnginePersistenceReaderV1,
  InvestingEngineReplayServiceV1,
  type CanonicalObjectV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from "@/lib/investing/engine/v1/persistence/postgres";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import { InvestingEnginePhase4CIntegrityScanner } from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";

async function main(): Promise<void> {
  const databaseUrl = process.env.INVESTING_4C_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("INVESTING_4C_TEST_DATABASE_URL_required");
  }
  const target = assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  );
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({ pool });
  try {
    const effective = await pool.connect();
    try {
      const parameters = (effective as unknown as {
        connectionParameters: { host: string; port: number; database: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(target, parameters);
    } finally {
      effective.release();
    }
    const reader = new InvestingEnginePersistenceReaderV1(adapter);
    const replay = new InvestingEngineReplayServiceV1(
      reader,
      (sources: Readonly<Record<string, unknown>>) =>
        runInvestingEngineV1Final(
          sources as unknown as InvestingEnginePhase3FSourcesV1,
        ) as unknown as CanonicalObjectV1,
    );
    const report = await new InvestingEnginePhase4CIntegrityScanner({
      pool,
      reader,
      replay,
    }).scan();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== "clean") {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
