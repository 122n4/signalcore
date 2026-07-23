import { InvestingEnginePersistenceServiceV1 } from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from "@/lib/investing/engine/v1/persistence/postgres";
import { buildPhase4BInput } from "@/tests/fixtures/investingEnginePhase4BFixture";

const databaseUrl = process.env.INVESTING_4B_TEST_DATABASE_URL;
const runId = process.env.INVESTING_4B_PROCESS_RUN_ID;
const idempotencyKey = process.env.INVESTING_4B_PROCESS_IDEMPOTENCY_KEY;
if (!databaseUrl || !runId || !idempotencyKey) throw new Error("phase4b_process_worker_configuration_missing");

async function main() {
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await new InvestingEnginePersistenceServiceV1(adapter).persist(buildPhase4BInput({ runId: runId!, idempotencyKey: idempotencyKey! }).input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await adapter.close();
  }
}

void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; });
