import { buildResearchDataHunterReport } from "@/lib/trading/research/dataHunter";

type Args = {
  loop: boolean;
  intervalMinutes: number;
  maxCycles: number | null;
  download: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    loop: false,
    intervalMinutes: 180,
    maxCycles: null,
    download: true,
  };

  for (const arg of argv) {
    if (arg === "--loop") args.loop = true;
    else if (arg === "--no-download") args.download = false;
    else if (arg.startsWith("--intervalMinutes=")) {
      args.intervalMinutes = Math.max(1, Number(arg.split("=", 2)[1]) || args.intervalMinutes);
    } else if (arg.startsWith("--maxCycles=")) {
      args.maxCycles = Math.max(1, Number(arg.split("=", 2)[1]) || 1);
    }
  }

  return args;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(args: Args) {
  const report = await buildResearchDataHunterReport({
    download: args.download,
  });
  console.log(JSON.stringify({
    ok: report.ok,
    status: report.status,
    generatedAt: report.generatedAt,
    coverage: report.coverage,
    nextAction: report.nextAction,
    outputs: report.outputs,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let cycles = 0;

  do {
    cycles += 1;
    try {
      await runCycle(args);
    } catch (error: any) {
      console.error(JSON.stringify({
        ok: false,
        status: "error",
        generatedAt: new Date().toISOString(),
        error: error?.message || "research_data_hunter_failed",
      }, null, 2));
      if (!args.loop) process.exitCode = 1;
    }

    if (!args.loop) break;
    if (args.maxCycles !== null && cycles >= args.maxCycles) break;
    await sleep(args.intervalMinutes * 60_000);
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
