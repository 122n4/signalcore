import { runMarketDataHarvester } from "../../lib/trading/research/index";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function compact(report: Awaited<ReturnType<typeof runMarketDataHarvester>>) {
  return {
    ok: report.ok,
    generatedAt: report.generatedAt,
    dryRun: report.dryRun,
    updateStaging: report.updateStaging,
    summary: report.plan.summary,
    stagingUpdate: report.stagingUpdate,
    outputs: report.outputs,
    topCandidates: report.plan.candidates
      .filter((candidate) => candidate.action === "stage_candidate")
      .slice(0, 10)
      .map((candidate) => ({
        instrument: candidate.instrument,
        provider: candidate.provider,
        access: candidate.access,
        priority: candidate.priority,
        localFormat: candidate.localFormat,
        qualityGate: candidate.qualityGate,
      })),
  };
}

async function main() {
  const report = await runMarketDataHarvester({
    dryRun: hasFlag("dry-run"),
    updateStaging: hasFlag("update-staging"),
    reportsDir: readArg("reportsDir"),
    sourceCatalogPath: readArg("sourceCatalogPath") ?? undefined,
    stagingCatalogPath: readArg("stagingCatalogPath") ?? undefined,
  });

  console.log(JSON.stringify(compact(report), null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
