import { ensureResearchBaselineSnapshot, loadResearchConfig } from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const baseline = await ensureResearchBaselineSnapshot(config);

  console.log(
    JSON.stringify(
      {
        baselineId: baseline.manifest.baseline_id,
        liveSummary: baseline.manifest.live_summary,
        crisisSummary: baseline.manifest.crisis_summary,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
