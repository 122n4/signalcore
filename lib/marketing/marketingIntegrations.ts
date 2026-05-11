import type { MarketingChannel, MarketingContentItem } from "@/lib/marketing/marketingOps";

export type MarketingCreativeKind = "copy" | "image" | "video";
export type MarketingCreativeStatus = "not_requested" | "brief_ready" | "rendering" | "ready" | "failed";
export type MarketingExternalStatus = "not_sent" | "queued" | "scheduled" | "published" | "failed";
export type MarketingPublishProvider = "buffer";

export type CreativeResult = {
  creative_kind: MarketingCreativeKind;
  creative_status: MarketingCreativeStatus;
  creative_provider: string;
  creative_prompt: string;
  creative_render_id: string | null;
  asset_url: string | null;
  asset_thumbnail_url: string | null;
  last_external_error?: string | null;
};

export type PublishResult = {
  external_provider: MarketingPublishProvider;
  external_status: MarketingExternalStatus;
  external_id: string | null;
  external_url: string | null;
  last_external_error: string | null;
  published_at?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function firstLine(value: string) {
  return clean(value).split(/\r?\n/).find(Boolean) ?? "";
}

function channelLabel(channel: MarketingChannel) {
  if (channel === "x") return "X / Twitter";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function buildCreativePrompt(item: MarketingContentItem, kind: Exclude<MarketingCreativeKind, "copy">) {
  const title = firstLine(item.title) || "Syntrake trading discipline";
  const campaign = clean(item.campaign) || "decision discipline before the broker";
  const hook = firstLine(item.body) || "Plan first. Broker second.";
  const body = truncate(item.body.replace(/\s+/g, " "), 520);

  if (kind === "image") {
    return [
      "Create a premium square social ad image for Syntrake.",
      "Visual direction: dark institutional trading desk, clean chart lines, calm execution, no luxury flex, no hype.",
      `Campaign: ${campaign}.`,
      `Channel: ${channelLabel(item.channel)}.`,
      `Main headline: ${truncate(title, 90)}.`,
      `Overlay hook: ${truncate(hook, 120)}.`,
      "Small footer copy: Plan first. Broker second. Syntrake.",
      "Compliance: do not show PnL, cash piles, luxury flex, or exact financial promises.",
      `Context copy for designer/template: ${body}`,
    ].join("\n");
  }

  return [
    "Create a 15-25 second vertical short-form video ad for Syntrake.",
    "Tone: experienced trader, pragmatic, helpful, not guru, not salesman.",
    `Campaign: ${campaign}.`,
    `Channel: ${channelLabel(item.channel)}.`,
    "Scene 1: broker app hesitation, caption: Your broker should not be where the decision starts.",
    `Scene 2: Syntrake decision desk, caption: ${truncate(title, 80)}.`,
    "Scene 3: trigger, invalidation, risk, stale-data check, caption: Check the plan before execution.",
    "Scene 4: stand aside state, caption: Sometimes the best trade is no trade.",
    "CTA: Plan first. Broker second. Syntrake.",
    "Compliance: no profit promises, no fake win-rate, no exact financial promises, no aggressive urgency.",
    `Reference copy: ${body}`,
  ].join("\n");
}

function getCreatomateTemplateId(kind: Exclude<MarketingCreativeKind, "copy">) {
  if (kind === "video") {
    return clean(process.env.CREATOMATE_VIDEO_TEMPLATE_ID || process.env.CREATOMATE_TEMPLATE_ID);
  }
  return clean(process.env.CREATOMATE_IMAGE_TEMPLATE_ID || process.env.CREATOMATE_TEMPLATE_ID);
}

function firstRender(payload: any) {
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (Array.isArray(payload?.renders)) return payload.renders[0] ?? null;
  return payload ?? null;
}

export async function requestCreativeAsset(args: {
  item: MarketingContentItem;
  kind: Exclude<MarketingCreativeKind, "copy">;
}): Promise<CreativeResult> {
  const prompt = buildCreativePrompt(args.item, args.kind);
  const apiKey = clean(process.env.CREATOMATE_API_KEY);
  const templateId = getCreatomateTemplateId(args.kind);

  if (!apiKey || !templateId) {
    return {
      creative_kind: args.kind,
      creative_status: "brief_ready",
      creative_provider: "manual",
      creative_prompt: prompt,
      creative_render_id: null,
      asset_url: null,
      asset_thumbnail_url: null,
      last_external_error: "Creatomate not configured. Add CREATOMATE_API_KEY and a template id to render automatically.",
    };
  }

  const response = await fetch("https://api.creatomate.com/v2/renders", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: templateId,
      modifications: {
        "Primary-Text": truncate(firstLine(args.item.title) || "Plan first. Broker second.", 120),
        "Secondary-Text": truncate(firstLine(args.item.body) || "Check the decision before the broker.", 160),
        "CTA-Text": "Plan first. Broker second. Syntrake.",
        "Compliance-Text": "No profit promises. Decision workflow only.",
      },
      metadata: JSON.stringify({
        content_id: args.item.id,
        campaign: args.item.campaign,
        kind: args.kind,
      }),
    }),
  });

  const payload = await response.json().catch(() => null);
  const render = firstRender(payload);

  if (!response.ok) {
    return {
      creative_kind: args.kind,
      creative_status: "failed",
      creative_provider: "creatomate",
      creative_prompt: prompt,
      creative_render_id: render?.id ? String(render.id) : null,
      asset_url: null,
      asset_thumbnail_url: null,
      last_external_error: clean(render?.error_message || payload?.message || payload?.error) || `Creatomate HTTP ${response.status}`,
    };
  }

  const status = clean(render?.status).toLowerCase();
  const assetUrl = clean(render?.url) || null;
  const thumbnailUrl = clean(render?.snapshot_url) || null;

  return {
    creative_kind: args.kind,
    creative_status: assetUrl || status === "succeeded" ? "ready" : "rendering",
    creative_provider: "creatomate",
    creative_prompt: prompt,
    creative_render_id: render?.id ? String(render.id) : null,
    asset_url: assetUrl,
    asset_thumbnail_url: thumbnailUrl,
    last_external_error: null,
  };
}

export async function refreshCreativeAsset(item: MarketingContentItem): Promise<CreativeResult> {
  const apiKey = clean(process.env.CREATOMATE_API_KEY);
  const renderId = clean(item.creative_render_id);
  const prompt = clean(item.creative_prompt) || buildCreativePrompt(item, item.creative_kind === "video" ? "video" : "image");
  const kind = item.creative_kind === "video" ? "video" : "image";

  if (!apiKey || !renderId) {
    return {
      creative_kind: kind,
      creative_status: item.creative_status === "ready" ? "ready" : "brief_ready",
      creative_provider: item.creative_provider || "manual",
      creative_prompt: prompt,
      creative_render_id: renderId || null,
      asset_url: item.asset_url,
      asset_thumbnail_url: item.asset_thumbnail_url,
      last_external_error: "Creatomate render status requires CREATOMATE_API_KEY and a creative_render_id.",
    };
  }

  const response = await fetch(`https://api.creatomate.com/v2/renders/${encodeURIComponent(renderId)}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  const render = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      creative_kind: kind,
      creative_status: "failed",
      creative_provider: "creatomate",
      creative_prompt: prompt,
      creative_render_id: renderId,
      asset_url: item.asset_url,
      asset_thumbnail_url: item.asset_thumbnail_url,
      last_external_error: clean(render?.error_message || render?.message || render?.error) || `Creatomate HTTP ${response.status}`,
    };
  }

  const status = clean(render?.status).toLowerCase();
  const assetUrl = clean(render?.url) || item.asset_url;
  const thumbnailUrl = clean(render?.snapshot_url) || item.asset_thumbnail_url;

  return {
    creative_kind: kind,
    creative_status: status === "failed" ? "failed" : assetUrl && status === "succeeded" ? "ready" : "rendering",
    creative_provider: "creatomate",
    creative_prompt: prompt,
    creative_render_id: renderId,
    asset_url: assetUrl,
    asset_thumbnail_url: thumbnailUrl,
    last_external_error: status === "failed" ? clean(render?.error_message) || "Creatomate render failed." : null,
  };
}

function bufferProfileId(channel: MarketingChannel) {
  const envNameByChannel: Partial<Record<MarketingChannel, string>> = {
    facebook: "BUFFER_PROFILE_ID_FACEBOOK",
    linkedin: "BUFFER_PROFILE_ID_LINKEDIN",
    x: "BUFFER_PROFILE_ID_X",
  };
  const direct = envNameByChannel[channel] ? clean(process.env[envNameByChannel[channel] as string]) : "";
  if (direct) return direct;

  const raw = clean(process.env.BUFFER_PROFILE_IDS_JSON);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Partial<Record<MarketingChannel, string>>;
    return clean(parsed[channel]);
  } catch {
    return "";
  }
}

function parseBufferResponse(payload: any) {
  const update = payload?.updates?.[0] ?? payload?.update ?? payload;
  const id = clean(update?.id || payload?.id) || null;
  const url = clean(update?.url || update?.statistics || payload?.url) || null;
  return { id, url };
}

export async function publishViaBuffer(args: {
  item: MarketingContentItem;
  publishNow?: boolean;
}): Promise<PublishResult> {
  const accessToken = clean(process.env.BUFFER_ACCESS_TOKEN);
  const profileId = bufferProfileId(args.item.channel);

  if (!accessToken) {
    return {
      external_provider: "buffer",
      external_status: "failed",
      external_id: null,
      external_url: null,
      last_external_error: "Buffer not configured. Add BUFFER_ACCESS_TOKEN in production env.",
    };
  }

  if (!profileId) {
    return {
      external_provider: "buffer",
      external_status: "failed",
      external_id: null,
      external_url: null,
      last_external_error: `No Buffer profile id configured for ${args.item.channel}.`,
    };
  }

  if (args.item.channel === "reddit" || args.item.channel === "email" || args.item.channel === "video") {
    return {
      external_provider: "buffer",
      external_status: "failed",
      external_id: null,
      external_url: null,
      last_external_error: `${args.item.channel} is not supported by the Buffer gateway in this Syntrake flow.`,
    };
  }

  const body = new URLSearchParams();
  body.append("profile_ids[]", profileId);
  body.append("text", args.item.body);
  body.append("shorten", "false");
  body.append("now", args.publishNow ? "true" : "false");
  if (!args.publishNow) body.append("top", "false");

  if (args.item.asset_url) {
    body.append("media[link]", args.item.asset_url);
    body.append("media[photo]", args.item.asset_url);
    if (args.item.asset_thumbnail_url) body.append("media[thumbnail]", args.item.asset_thumbnail_url);
  }

  const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  const parsed = parseBufferResponse(payload);

  if (!response.ok || payload?.success === false) {
    return {
      external_provider: "buffer",
      external_status: "failed",
      external_id: parsed.id,
      external_url: parsed.url,
      last_external_error: clean(payload?.message || payload?.error) || `Buffer HTTP ${response.status}`,
    };
  }

  return {
    external_provider: "buffer",
    external_status: args.publishNow ? "published" : args.item.scheduled_for ? "scheduled" : "queued",
    external_id: parsed.id,
    external_url: parsed.url,
    last_external_error: null,
    published_at: args.publishNow ? new Date().toISOString() : null,
  };
}
