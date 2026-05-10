import { describe, expect, it } from "vitest";

import { buildWorkspaceIdentityRailModel } from "@/app/app/workspaceIdentity";

describe("workspace identity rail", () => {
  it("builds a calm investing identity with free-first positioning", () => {
    const model = buildWorkspaceIdentityRailModel({
      mode: "investing",
      view: "daily",
      tier: "free",
      lang: "en",
    });

    expect(model.tone).toBe("investing");
    expect(model.headline).toContain("Calmer capital decisions");
    expect(model.stats.map((stat) => stat.value)).toEqual(
      expect.arrayContaining(["Goal-led", "Daily loop", "Visible first", "Free forever"]),
    );
    expect(model.primaryLabel).toBe("Open Plan");
  });

  it("builds a trading identity that separates radar from execution", () => {
    const model = buildWorkspaceIdentityRailModel({
      mode: "trading",
      view: "trading",
      tier: "free",
      lang: "en",
    });

    expect(model.tone).toBe("trading");
    expect(model.headline).toContain("Read broad market flow");
    expect(model.summary).toContain("market radar");
    expect(model.stats.map((stat) => stat.value)).toEqual(
      expect.arrayContaining(["8 live", "Radar -> Execution", "External", "Discovery"]),
    );
    expect(model.secondaryLabel).toBe("Compare Trading Pro");
  });

  it("switches the trading depth CTA once the user has deeper access", () => {
    const model = buildWorkspaceIdentityRailModel({
      mode: "trading",
      view: "opportunities",
      tier: "pro",
      lang: "en",
    });

    expect(model.primaryLabel).toBe("Open Desk");
    expect(model.secondaryLabel).toBe("Open Execution");
    expect(model.stats.find((stat) => stat.label === "Depth")?.value).toBe("Full stack");
  });
});
