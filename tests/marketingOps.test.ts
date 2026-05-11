import { describe, expect, it } from "vitest";

import {
  generateMarketingDraft,
  runMarketingSafetyCheck,
} from "@/lib/marketing/marketingOps";

describe("marketing ops safety", () => {
  it("blocks fake performance and guaranteed profit claims", () => {
    const result = runMarketingSafetyCheck(
      "Get guaranteed profit with 100% win rate. This is risk-free trading.",
    );

    expect(result.ok).toBe(false);
    expect(result.severity).toBe("block");
    expect(result.flags.map((flag) => flag.code)).toContain("guaranteed_profit");
    expect(result.flags.map((flag) => flag.code)).toContain("fake_performance");
  });

  it("generates pragmatic non-promissory Syntrake drafts", () => {
    const draft = generateMarketingDraft({
      channel: "linkedin",
      campaign: "broker checklist discipline",
      audience: "manual traders",
      objective: "start trial without hype",
    });

    expect(draft.title).toContain("broker checklist discipline");
    expect(draft.body).toContain("No financial promises");
    expect(draft.body).toContain("broker");
    expect(draft.safety.severity).not.toBe("block");
  });
});

