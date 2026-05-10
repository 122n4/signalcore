import { processResearchQueueFromDefaultConfig } from "../../lib/trading/research/index";

async function main() {
  const result = await processResearchQueueFromDefaultConfig();

  console.log(
    JSON.stringify(
      {
        queueId: result.config.queueId,
        liveBaselineId: result.config.liveBaselineSource.baselineId,
        processedRunIds: result.processedRunIds,
        autoEnqueuedTaskIds: result.autoEnqueuedTaskIds,
        reportOutputs: result.reportOutputs,
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
