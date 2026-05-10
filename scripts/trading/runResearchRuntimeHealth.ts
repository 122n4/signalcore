import { buildResearchRuntimeHealth } from "../../lib/trading/research/index";

async function main() {
  const health = await buildResearchRuntimeHealth();
  console.log(JSON.stringify(health, null, 2));
  if (process.argv.includes("--fail-on-error") && !health.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
