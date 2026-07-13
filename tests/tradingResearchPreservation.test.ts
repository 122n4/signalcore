import { describe, expect, it } from "vitest";

import {
  appendJsonLine,
  buildResearchNegativeKnowledgeReport,
  buildResearchPreservationReport,
  verifyResearchPreservationReport,
  writeResearchPreservationReport,
} from "@/lib/trading/research";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research preservation", () => {
  it("produces a verifiable preservation manifest and reusable negative-knowledge summary", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-1",
      timestamp: "2026-03-20T10:00:00.000Z",
      run_id: "run-1",
      task_id: "task-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-1",
      decision: "reject",
      reason: "Synthetic rejection pattern.",
      planner_template_id: "template-alpha",
      planner_family_id: "family-alpha",
    });

    const preservation = await buildResearchPreservationReport(config);
    const outputs = await writeResearchPreservationReport({
      config,
      report: preservation,
    });
    const verification = await verifyResearchPreservationReport({ config });
    const knowledge = await buildResearchNegativeKnowledgeReport(config);

    expect(outputs.jsonPath).toContain("preservation-latest.json");
    expect(verification.ok).toBe(true);
    expect(knowledge.summary.reusable_patterns).toBeGreaterThanOrEqual(1);
    expect(knowledge.items[0]?.representative_reason).toContain("Synthetic rejection pattern");
  });
});
