import { describe, expect, it } from "vitest";

import {
  generateMarketingDraft,
  runMarketingSafetyCheck,
} from "@/lib/marketing/marketingOps";
import { buildCreativePrompt } from "@/lib/marketing/marketingIntegrations";

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

  it("creates compliant image and video creative prompts", () => {
    const draft = generateMarketingDraft({
      channel: "linkedin",
      campaign: "snapshot freshness",
      audience: "manual traders",
      objective: "start trial without hype",
    });
    const item = {
      id: "content_1",
      owner_user_id: "owner_1",
      title: draft.title,
      campaign: "snapshot freshness",
      channel: "linkedin",
      status: "approved",
      audience: "manual traders",
      objective: "start trial without hype",
      body: draft.body,
      safety: draft.safety,
      utm_url: null,
      scheduled_for: null,
      published_at: null,
      metrics: {},
      notes: null,
      creative_kind: "copy",
      creative_status: "not_requested",
      creative_provider: null,
      creative_prompt: null,
      creative_render_id: null,
      asset_url: null,
      asset_thumbnail_url: null,
      external_provider: null,
      external_status: "not_sent",
      external_id: null,
      external_url: null,
      last_external_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as const;

    const imagePrompt = buildCreativePrompt(item, "image");
    const videoPrompt = buildCreativePrompt(item, "video");

    expect(imagePrompt).toContain("no hype");
    expect(imagePrompt).toContain("exact financial promises");
    expect(videoPrompt).toContain("no profit promises");
    expect(runMarketingSafetyCheck(`${imagePrompt}\n${videoPrompt}`).severity).not.toBe("block");
  });
});
