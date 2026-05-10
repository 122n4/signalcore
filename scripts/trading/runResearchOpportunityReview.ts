import {
  buildAndWriteResearchOpportunityReviewReport,
  loadResearchConfig,
} from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const { report, outputs } = await buildAndWriteResearchOpportunityReviewReport(config);

  console.log(
    JSON.stringify(
      {
        ok: true,
        report_id: report.report_id,
        live_baseline_id: report.live_baseline_id,
        reviewed_item_count: report.summary.reviewed_item_count,
        isolated_promote_count: report.summary.isolated_promote_count,
        isolated_candidate_count: report.summary.isolated_candidate_count,
        isolated_reject_count: report.summary.isolated_reject_count,
        bundle_status: report.summary.bundle_status,
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
