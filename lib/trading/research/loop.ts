import { loadResearchConfig } from "./config";
import { processResearchQueue } from "./runner";
import { readResearchQueue } from "./queue";
import type {
  ResearchAutomationLoopResult,
  ResearchConfig,
  ResearchTaskRunnerDependencies,
} from "./types";

type ResearchAutomationLoopDependencies = {
  loadConfig?: () => Promise<ResearchConfig>;
  processQueue?: typeof processResearchQueue;
  readQueue?: typeof readResearchQueue;
  sleep?: (ms: number) => Promise<void>;
  maxCycles?: number | null;
  signal?: AbortSignal;
} & ResearchTaskRunnerDependencies;

function hasActiveResearchWork(configQueue: Awaited<ReturnType<typeof readResearchQueue>>): boolean {
  return (
    configQueue.active_run_id !== null ||
    configQueue.tasks.some(
      (task) =>
        task.status === "pending" ||
        task.status === "running" ||
        task.status === "awaiting_decision",
    )
  );
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runResearchAutomationLoop(
  dependencies: ResearchAutomationLoopDependencies = {},
): Promise<ResearchAutomationLoopResult> {
  const loadConfigFn = dependencies.loadConfig ?? (() => loadResearchConfig());
  const processQueueFn = dependencies.processQueue ?? processResearchQueue;
  const readQueueFn = dependencies.readQueue ?? readResearchQueue;
  const sleep = dependencies.sleep ?? sleepDefault;

  let cycles = 0;
  let idleCycles = 0;
  const processedRunIds: string[] = [];
  const autoEnqueuedTaskIds: string[] = [];
  let lastIdleReason: ResearchAutomationLoopResult["lastIdleReason"] = null;
  let lastReportOutputs: ResearchAutomationLoopResult["lastReportOutputs"] = null;

  while (true) {
    if (dependencies.signal?.aborted) {
      return {
        cycles,
        idleCycles,
        processedRunIds,
        autoEnqueuedTaskIds,
        lastIdleReason,
        stopReason: "aborted",
        lastReportOutputs,
      };
    }

    const config = await loadConfigFn();

    try {
      const cycleResult = await processQueueFn(config, {
        executors: dependencies.executors,
        now: dependencies.now,
        pid: dependencies.pid,
      });

      cycles += 1;
      processedRunIds.push(...cycleResult.processedRunIds);
      autoEnqueuedTaskIds.push(...cycleResult.autoEnqueuedTaskIds);
      lastReportOutputs = cycleResult.reportOutputs;

      const queue = await readQueueFn(config);
      lastIdleReason = queue.idle_reason;

      if (!hasActiveResearchWork(queue) && queue.idle_reason) {
        idleCycles += 1;
      }

      if (dependencies.maxCycles !== undefined && dependencies.maxCycles !== null && cycles >= dependencies.maxCycles) {
        return {
          cycles,
          idleCycles,
          processedRunIds,
          autoEnqueuedTaskIds,
          lastIdleReason,
          stopReason: "max_cycles_reached",
          lastReportOutputs,
        };
      }

      const delayMs =
        !hasActiveResearchWork(queue) && queue.idle_reason
          ? config.automation.idleIntervalMs
          : config.automation.pollIntervalMs;

      await sleep(delayMs);
    } catch {
      const configAfterError = await loadConfigFn();
      await sleep(configAfterError.automation.errorBackoffMs);
    }
  }
}
