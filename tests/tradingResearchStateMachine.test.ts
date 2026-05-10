import { describe, expect, it } from "vitest";

import { assertResearchTaskStatusTransition, canTransitionResearchTaskStatus } from "@/lib/trading/research";

describe("trading research state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransitionResearchTaskStatus("pending", "running")).toBe(true);
    expect(() => assertResearchTaskStatusTransition("running", "awaiting_decision")).not.toThrow();
    expect(() => assertResearchTaskStatusTransition("awaiting_decision", "completed")).not.toThrow();
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionResearchTaskStatus("pending", "completed")).toBe(false);
    expect(() => assertResearchTaskStatusTransition("running", "completed")).toThrow(
      "Invalid research task transition",
    );
  });
});
