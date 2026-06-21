import { syncResearchLabToSupabase } from "../../lib/trading/research/index";

function readArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number) {
  const value = Number(readArg(name));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce() {
  const result = await syncResearchLabToSupabase({
    runLimit: numberArg("runLimit", 80),
    decisionLimit: numberArg("decisionLimit", 300),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && hasFlag("fail-on-error")) {
    process.exitCode = 1;
  }
}

async function main() {
  if (!hasFlag("loop")) {
    await runOnce();
    return;
  }

  const intervalSeconds = numberArg(
    "intervalSeconds",
    Number(process.env.RESEARCH_SUPABASE_SYNC_INTERVAL_SECONDS ?? 60),
  );
  const maxCycles = numberArg("maxCycles", Number(process.env.RESEARCH_SUPABASE_SYNC_MAX_CYCLES ?? 0));
  let cycle = 0;

  while (true) {
    cycle += 1;
    await runOnce();
    if (maxCycles > 0 && cycle >= maxCycles) return;
    await sleep(intervalSeconds * 1000);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
