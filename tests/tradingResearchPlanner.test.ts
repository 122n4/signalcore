import { describe, expect, it } from "vitest";

import {
  autoEnqueueNextResearchTask,
  getSupportedPlannerTaskTypes,
  readResearchQueue,
} from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchTempDir,
  writeResearchCampaignLibrary,
  writeResearchCandidateLibrary,
} from "./helpers/tradingResearchFixtures";

describe("trading research planner", () => {
  it("does not enqueue templates that resolve to no effective instrument", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.instruments = [];

    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "invalid-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "invalid-template",
              enabled: true,
              priority: 100,
              type: "risk_shaping",
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: [],
                sessions: ["london_ny_overlap"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.65,
              },
            },
          ],
        },
      ],
    });

    await writeResearchCampaignLibrary(config, {
      version: 1,
      campaigns: [
        {
          id: "increase_expectancy",
          enabled: true,
          objective: "increase_expectancy",
          priority: 100,
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: getSupportedPlannerTaskTypes({
        risk_shaping: async () => {
          throw new Error("not executed");
        },
      }),
    });

    const queue = await readResearchQueue(config);
    expect(result.action).toBe("idle");
    expect(queue.tasks).toHaveLength(0);
  });
});
