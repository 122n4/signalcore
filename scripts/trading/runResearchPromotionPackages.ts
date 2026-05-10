import {
  buildResearchPromotionBoard,
  buildResearchPromotionPackageReport,
  loadResearchConfig,
  writeResearchPromotionBoard,
  writeResearchPromotionPackageReport,
} from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const boardReport = await buildResearchPromotionBoard(config);
  const boardOutputs = await writeResearchPromotionBoard({ config, report: boardReport });
  const packageReport = await buildResearchPromotionPackageReport({
    config,
    boardReport,
  });
  const packageOutputs = await writeResearchPromotionPackageReport({
    config,
    report: packageReport,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        report_id: packageReport.report_id,
        live_baseline_id: packageReport.live_baseline_id,
        package_count: packageReport.summary.package_count,
        ready_for_live_review_count: packageReport.summary.ready_for_live_review_count,
        blocked_count: packageReport.summary.blocked_count,
        boardJsonPath: boardOutputs.latestJsonPath,
        jsonPath: packageOutputs.jsonPath,
        markdownPath: packageOutputs.markdownPath,
        latestJsonPath: packageOutputs.latestJsonPath,
        latestMarkdownPath: packageOutputs.latestMarkdownPath,
        itemCount: packageOutputs.itemCount,
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
