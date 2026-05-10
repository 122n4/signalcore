import { runResearchAutomationLoop } from "../../lib/trading/research/index";

async function main() {
  const maxCyclesRaw = process.env.RESEARCH_MAX_CYCLES;
  const maxCycles =
    typeof maxCyclesRaw === "string" && maxCyclesRaw.trim().length > 0
      ? Number.parseInt(maxCyclesRaw, 10)
      : null;

  const controller = new AbortController();
  const stop = () => controller.abort();

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    const result = await runResearchAutomationLoop({
      maxCycles: Number.isFinite(maxCycles) ? maxCycles : null,
      signal: controller.signal,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
