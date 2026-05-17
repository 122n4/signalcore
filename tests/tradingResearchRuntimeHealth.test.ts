import { describe, expect, it } from "vitest";

import { buildResearchRuntimeHealth, fileExists } from "@/lib/trading/research";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research runtime health", () => {
  it("does not create the research queue while rendering read-only health", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    expect(await fileExists(config.paths.queuePath)).toBe(false);

    const health = await buildResearchRuntimeHealth({
      config,
      now: new Date("2026-05-17T15:00:00.000Z"),
    });

    expect(health.queue.activeRunId).toBeNull();
    expect(health.queue.pending).toBe(0);
    expect(await fileExists(config.paths.queuePath)).toBe(false);
  });
});
