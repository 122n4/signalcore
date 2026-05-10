import { buildResearchBundleValidationReport, loadResearchConfig, writeResearchBundleValidationReport } from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const report = await buildResearchBundleValidationReport({ config });
  const outputs = await writeResearchBundleValidationReport({ config, report });

  console.log(
    JSON.stringify(
      {
        ok: true,
        report_id: report.report_id,
        candidate_count: report.candidate_count,
        keepable_bundles: report.keepable_bundles.length,
        jsonPath: outputs.jsonPath,
        markdownPath: outputs.markdownPath,
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
