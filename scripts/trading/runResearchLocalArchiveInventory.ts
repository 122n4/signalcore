import {
  buildResearchLocalArchiveInventoryReport,
  loadResearchConfig,
  writeResearchLocalArchiveInventoryReport,
} from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const report = await buildResearchLocalArchiveInventoryReport(config);
  const outputs = await writeResearchLocalArchiveInventoryReport({
    config,
    report,
  });

  console.log(
    JSON.stringify(
      {
        reportId: report.report_id,
        summary: report.summary,
        jsonPath: outputs.latestJsonPath,
        markdownPath: outputs.latestMarkdownPath,
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
