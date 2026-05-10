import { buildDailyResearchReport, loadResearchConfig, writeDailyResearchReport } from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const report = await buildDailyResearchReport(config);
  const outputs = await writeDailyResearchReport(config, report);

  console.log(
    JSON.stringify(
      {
        reportId: report.report_id,
        jsonPath: outputs.jsonPath,
        markdownPath: outputs.markdownPath,
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
