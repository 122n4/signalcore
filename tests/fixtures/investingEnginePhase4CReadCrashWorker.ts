import { runInvestingEngineV1Final, type InvestingEnginePhase3FSourcesV1 } from "@/lib/investing/engine/v1/phase3f";
import {
  InvestingEnginePersistenceReaderV1,
  InvestingEnginePersistenceVerifierV1,
  InvestingEngineReplayServiceV1,
  type CanonicalObjectV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 as Adapter } from "@/lib/investing/engine/v1/persistence/postgres";

const databaseUrl = process.env.INVESTING_4C_READ_CRASH_DATABASE_URL;
const phase = process.env.INVESTING_4C_READ_CRASH_PHASE;
if (!databaseUrl || !["load", "verify", "replay"].includes(phase ?? "")) {
  throw new Error("phase4c_read_crash_configuration_invalid");
}

const adapter = new Adapter({ connectionString: databaseUrl, max: 2 });
const reader = new InvestingEnginePersistenceReaderV1(adapter);
const replay = new InvestingEngineReplayServiceV1(
  reader,
  (sources: Readonly<Record<string, unknown>>) =>
    runInvestingEngineV1Final(
      sources as unknown as InvestingEnginePhase3FSourcesV1,
    ) as unknown as CanonicalObjectV1,
);
const selector = {
  ownerId: "user_phase3f_1",
  accountId: "44444444-4444-4444-8444-444444444444",
  runId: "phase4c_canonical_restart",
};

async function operation(): Promise<void> {
  if (phase === "load") {
    await reader.loadByRunId(selector);
    return;
  }
  if (phase === "verify") {
    const loaded = await reader.loadByRunId(selector);
    new InvestingEnginePersistenceVerifierV1().verifyLoaded(loaded.loaded);
    return;
  }
  const result = await replay.replay(selector);
  if (result.status !== "replay_match") {
    throw new Error(`phase4c_read_crash_replay_failed:${result.status}`);
  }
}

async function main(): Promise<void> {
  await operation();
  process.stdout.write(`${JSON.stringify({ event: "phase_active", phase })}\n`);
  while (true) {
    await operation();
  }
}

void main().catch(async (error) => {
  console.error(error);
  await adapter.close().catch(() => undefined);
  process.exitCode = 1;
});
