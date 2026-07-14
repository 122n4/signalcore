import {
  buildResearchLocalArchiveInventoryReport,
  loadResearchConfig,
  type ResearchLocalArchiveInventoryScope,
  writeResearchLocalArchiveInventoryReport,
} from "../../lib/trading/research/index";

function parseScope(argv: string[]): ResearchLocalArchiveInventoryScope {
  if (argv.includes("--canonical-only")) return "canonical";
  if (argv.includes("--staging-only")) return "staging";
  return "all";
}

async function main() {
  const config = await loadResearchConfig();
  const scope = parseScope(process.argv.slice(2));
  const report = await buildResearchLocalArchiveInventoryReport(config, scope);
  const outputs = await writeResearchLocalArchiveInventoryReport({
    config,
    report,
  });

  console.log(
    JSON.stringify(
      {
        reportId: report.report_id,
        scope: report.scope,
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
