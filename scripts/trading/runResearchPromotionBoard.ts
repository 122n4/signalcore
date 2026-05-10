import {
  buildResearchPromotionBoard,
  loadResearchConfig,
  writeResearchPromotionBoard,
} from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const report = await buildResearchPromotionBoard(config);
  const outputs = await writeResearchPromotionBoard({ config, report });

  console.log(
    JSON.stringify(
      {
        ok: true,
        report_id: report.report_id,
        live_baseline_id: report.live_baseline_id,
        entry_count: report.entries.length,
        review_ready_count: report.summary.review_ready_count,
        bundle_confirmed_count: report.summary.bundle_confirmed_count,
        jsonPath: outputs.jsonPath,
        markdownPath: outputs.markdownPath,
        latestJsonPath: outputs.latestJsonPath,
        latestMarkdownPath: outputs.latestMarkdownPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
