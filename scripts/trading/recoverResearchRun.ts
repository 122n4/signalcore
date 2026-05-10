import { loadResearchConfig, recoverResearchRunner } from "../../lib/trading/research/index";

async function main() {
  const config = await loadResearchConfig();
  const result = await recoverResearchRunner(config);

  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
