import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type MarketingCreativeKind,
  type MarketingCreativeStatus,
  type MarketingExternalStatus,
  publishViaBuffer,
  refreshCreativeAsset,
  requestCreativeAsset,
} from "@/lib/marketing/marketingIntegrations";

export const MARKETING_CONTENT_TABLE = "marketing_content_items";
export const MARKETING_LEADS_TABLE = "marketing_leads";

export type MarketingChannel = "reddit" | "facebook" | "linkedin" | "x" | "email" | "video";
export type MarketingContentStatus = "draft" | "review" | "approved" | "scheduled" | "published" | "rejected";

export type MarketingSafetyCheck = {
  ok: boolean;
  severity: "ok" | "warn" | "block";
  flags: Array<{
    code: string;
    message: string;
  }>;
};

export type MarketingContentItem = {
  id: string;
  owner_user_id: string;
  title: string;
  campaign: string;
  channel: MarketingChannel;
  status: MarketingContentStatus;
  audience: string | null;
  objective: string | null;
  body: string;
  safety: MarketingSafetyCheck;
  utm_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  metrics: Record<string, unknown>;
  notes: string | null;
  creative_kind: MarketingCreativeKind;
  creative_status: MarketingCreativeStatus;
  creative_provider: string | null;
  creative_prompt: string | null;
  creative_render_id: string | null;
  asset_url: string | null;
  asset_thumbnail_url: string | null;
  external_provider: string | null;
  external_status: MarketingExternalStatus;
  external_id: string | null;
  external_url: string | null;
  last_external_error: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingLead = {
  id: string;
  owner_user_id: string;
  name: string | null;
  email: string | null;
  source: string | null;
  status: "new" | "contacted" | "trial" | "paid" | "closed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const BLOCKED_PATTERNS = [
  { code: "guaranteed_profit", pattern: /\b(guaranteed|garantido|garantida|lucro certo|profit guaranteed|rendimento garantido)\b/i },
  { code: "fake_performance", pattern: /\b(100%\s*(win|wins|acerto)|risk[- ]?free|sem risco|win rate garantido)\b/i },
  { code: "aggressive_claim", pattern: /\b(get rich|fica rico|dinheiro facil|easy money|millionaire|milionario)\b/i },
  { code: "auto_dm", pattern: /\b(auto[- ]?dm|dm automatico|mensagem privada automatica)\b/i },
];

const WARN_PATTERNS = [
  { code: "financial_outcome", pattern: /\b(profit|lucro|ganhos|returns|retornos|performance|win rate)\b/i },
  { code: "urgent_pressure", pattern: /\b(now|agora|before it is too late|antes que seja tarde|last chance)\b/i },
  { code: "broker_action", pattern: /\b(buy now|sell now|compra agora|vende agora|open trade|abre trade)\b/i },
];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeChannel(input: unknown): MarketingChannel {
  const value = normalizeText(input).toLowerCase();
  if (value === "reddit" || value === "facebook" || value === "linkedin" || value === "x" || value === "email" || value === "video") {
    return value;
  }
  return "linkedin";
}

function safeStatus(input: unknown): MarketingContentStatus {
  const value = normalizeText(input).toLowerCase();
  if (
    value === "draft" ||
    value === "review" ||
    value === "approved" ||
    value === "scheduled" ||
    value === "published" ||
    value === "rejected"
  ) {
    return value;
  }
  return "draft";
}

function safeCreativeKind(input: unknown): Exclude<MarketingCreativeKind, "copy"> {
  const value = normalizeText(input).toLowerCase();
  return value === "video" ? "video" : "image";
}

async function getOwnedMarketingContent(ownerUserId: string, id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error) throw new Error(error.message ?? "marketing_content_read_failed");
  return data as MarketingContentItem;
}

export function runMarketingSafetyCheck(body: string): MarketingSafetyCheck {
  const flags: MarketingSafetyCheck["flags"] = [];

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(body)) {
      flags.push({
        code: rule.code,
        message: "Blocked: this sounds like a financial promise, fake performance claim, or automated outreach.",
      });
    }
  }

  for (const rule of WARN_PATTERNS) {
    if (rule.pattern.test(body)) {
      flags.push({
        code: rule.code,
        message: "Review carefully: keep wording educational, process-based, and non-promissory.",
      });
    }
  }

  const blocked = flags.some((flag) => flag.message.startsWith("Blocked"));
  return {
    ok: !blocked,
    severity: blocked ? "block" : flags.length > 0 ? "warn" : "ok",
    flags,
  };
}

function channelOpening(channel: MarketingChannel) {
  if (channel === "reddit") return "A practical trading question:";
  if (channel === "email") return "Subject: Stop letting stale data decide your next trade";
  if (channel === "video") return "Hook: Your broker should not be the first place you make the decision.";
  if (channel === "x") return "Most trading mistakes do not start at the broker.";
  if (channel === "facebook") return "If you trade manually, this is worth checking before the next setup.";
  return "Trading discipline is not only about finding entries.";
}

function channelCta(channel: MarketingChannel) {
  if (channel === "email") return "Open Syntrake and check whether the current setup is actionable or should be left alone.";
  if (channel === "video") return "CTA on screen: Plan first. Broker second. Syntrake.";
  if (channel === "reddit") return "Curious how others separate a valid setup from a broker impulse.";
  return "Try Syntrake when you want a cleaner decision process before opening the broker.";
}

export function generateMarketingDraft(args: {
  channel: MarketingChannel;
  campaign: string;
  audience?: string | null;
  objective?: string | null;
}) {
  const campaign = normalizeText(args.campaign) || "trading discipline";
  const audience = normalizeText(args.audience) || "manual traders";
  const objective = normalizeText(args.objective) || "turn curiosity into a trial";
  const opening = channelOpening(args.channel);
  const cta = channelCta(args.channel);

  const body =
    args.channel === "email"
      ? [
          opening,
          "",
          `A lot of ${audience} do not lose control because they lack ideas. They lose control because the decision gets made too late, inside the broker.`,
          "",
          `Syntrake is built around ${campaign}: live snapshot, trigger, invalidation, risk, and a clear stand-aside path when the setup is not clean.`,
          "",
          "No profit promises. No guru calls. Just a stricter process before execution.",
          "",
          cta,
        ].join("\n")
      : [
          opening,
          "",
          `For ${audience}, the hard part is often not finding a setup. It is knowing whether the setup is still valid, stale, too risky, or simply not worth touching.`,
          "",
          `Syntrake focuses on ${campaign}: trigger, invalidation, risk, snapshot freshness, and the discipline to stand aside.`,
          "",
          `Goal: ${objective}.`,
          "",
          "No financial promises. Just a better decision workflow before the broker.",
          "",
          cta,
        ].join("\n");

  return {
    title: `${campaign} - ${args.channel}`,
    body,
    safety: runMarketingSafetyCheck(body),
  };
}

function isMissingSchemaError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("unknown column") ||
    message.includes("could not find the table")
  );
}

export async function listMarketingOps(ownerUserId: string) {
  const sb = getSupabaseAdmin();
  const [contentRes, leadRes] = await Promise.all([
    sb
      .from(MARKETING_CONTENT_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(80),
    sb
      .from(MARKETING_LEADS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (contentRes.error && isMissingSchemaError(contentRes.error)) {
    return {
      schemaReady: false,
      content: [] as MarketingContentItem[],
      leads: [] as MarketingLead[],
      error: contentRes.error.message ?? "missing_marketing_ops_schema",
    };
  }

  if (contentRes.error) throw new Error(contentRes.error.message ?? "marketing_content_read_failed");
  if (leadRes.error && isMissingSchemaError(leadRes.error)) {
    return {
      schemaReady: false,
      content: [] as MarketingContentItem[],
      leads: [] as MarketingLead[],
      error: leadRes.error.message ?? "missing_marketing_leads_schema",
    };
  }
  if (leadRes.error) throw new Error(leadRes.error.message ?? "marketing_leads_read_failed");

  return {
    schemaReady: true,
    content: (contentRes.data ?? []) as MarketingContentItem[],
    leads: (leadRes.data ?? []) as MarketingLead[],
    error: null,
  };
}

export async function createMarketingContent(args: {
  ownerUserId: string;
  title?: unknown;
  campaign?: unknown;
  channel?: unknown;
  audience?: unknown;
  objective?: unknown;
  body?: unknown;
  notes?: unknown;
}) {
  const channel = safeChannel(args.channel);
  const bodyInput = normalizeText(args.body);
  const generated = bodyInput
    ? {
        title: normalizeText(args.title) || `${normalizeText(args.campaign) || "Syntrake campaign"} - ${channel}`,
        body: bodyInput,
        safety: runMarketingSafetyCheck(bodyInput),
      }
    : generateMarketingDraft({
        channel,
        campaign: normalizeText(args.campaign),
        audience: normalizeText(args.audience),
        objective: normalizeText(args.objective),
      });

  const row = {
    owner_user_id: args.ownerUserId,
    title: generated.title,
    campaign: normalizeText(args.campaign) || "Syntrake decision discipline",
    channel,
    status: "draft",
    audience: normalizeText(args.audience) || null,
    objective: normalizeText(args.objective) || null,
    body: generated.body,
    safety: generated.safety,
    notes: normalizeText(args.notes) || null,
    metrics: {},
  };

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_content_create_failed");
  return data as MarketingContentItem;
}

export async function updateMarketingContent(args: {
  ownerUserId: string;
  id: unknown;
  status?: unknown;
  scheduledFor?: unknown;
  notes?: unknown;
  body?: unknown;
  metrics?: unknown;
}) {
  const id = normalizeText(args.id);
  if (!id) throw new Error("missing_content_id");

  const patch: Record<string, unknown> = {};
  const requestedStatus = args.status != null ? safeStatus(args.status) : null;
  if (requestedStatus) patch.status = requestedStatus;
  if (args.scheduledFor != null) patch.scheduled_for = normalizeText(args.scheduledFor) || null;
  if (args.notes != null) patch.notes = normalizeText(args.notes) || null;
  if (args.body != null) {
    const body = normalizeText(args.body);
    const safety = runMarketingSafetyCheck(body);
    patch.body = body;
    patch.safety = safety;
    if (safety.severity === "block") {
      patch.status = "review";
    }
  }
  if (args.metrics && typeof args.metrics === "object") patch.metrics = args.metrics;

  patch.updated_at = new Date().toISOString();

  if (requestedStatus === "approved" || requestedStatus === "scheduled" || requestedStatus === "published") {
    const { data: existing, error: existingError } = await getSupabaseAdmin()
      .from(MARKETING_CONTENT_TABLE)
      .select("safety")
      .eq("id", id)
      .eq("owner_user_id", args.ownerUserId)
      .single();

    if (existingError) throw new Error(existingError.message ?? "marketing_content_read_failed");
    const safety = (patch.safety ?? existing?.safety) as MarketingSafetyCheck | null;
    if (safety?.severity === "block" || safety?.ok === false) {
      throw new Error("blocked_content_requires_revision");
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .update(patch)
    .eq("id", id)
    .eq("owner_user_id", args.ownerUserId)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_content_update_failed");
  return data as MarketingContentItem;
}

export async function requestMarketingCreative(args: {
  ownerUserId: string;
  id: unknown;
  kind?: unknown;
}) {
  const id = normalizeText(args.id);
  if (!id) throw new Error("missing_content_id");

  const existing = await getOwnedMarketingContent(args.ownerUserId, id);
  if (existing.safety?.severity === "block" || existing.safety?.ok === false) {
    throw new Error("blocked_content_requires_revision");
  }

  const result = await requestCreativeAsset({
    item: existing,
    kind: safeCreativeKind(args.kind),
  });

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .update({
      ...result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_user_id", args.ownerUserId)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_creative_update_failed");
  return data as MarketingContentItem;
}

export async function refreshMarketingCreative(args: {
  ownerUserId: string;
  id: unknown;
}) {
  const id = normalizeText(args.id);
  if (!id) throw new Error("missing_content_id");

  const existing = await getOwnedMarketingContent(args.ownerUserId, id);
  const result = await refreshCreativeAsset(existing);

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .update({
      ...result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_user_id", args.ownerUserId)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_creative_refresh_failed");
  return data as MarketingContentItem;
}

export async function attachMarketingAsset(args: {
  ownerUserId: string;
  id: unknown;
  assetUrl?: unknown;
  thumbnailUrl?: unknown;
  kind?: unknown;
}) {
  const id = normalizeText(args.id);
  if (!id) throw new Error("missing_content_id");

  const assetUrl = normalizeText(args.assetUrl);
  if (!assetUrl || !/^https:\/\//i.test(assetUrl)) {
    throw new Error("asset_url_must_be_https");
  }

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .update({
      creative_kind: safeCreativeKind(args.kind),
      creative_status: "ready",
      creative_provider: "manual",
      asset_url: assetUrl,
      asset_thumbnail_url: normalizeText(args.thumbnailUrl) || null,
      last_external_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_user_id", args.ownerUserId)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_asset_attach_failed");
  return data as MarketingContentItem;
}

export async function publishMarketingContent(args: {
  ownerUserId: string;
  id: unknown;
  provider?: unknown;
  publishNow?: unknown;
}) {
  const id = normalizeText(args.id);
  if (!id) throw new Error("missing_content_id");

  const existing = await getOwnedMarketingContent(args.ownerUserId, id);
  if (existing.safety?.severity === "block" || existing.safety?.ok === false) {
    throw new Error("blocked_content_requires_revision");
  }
  if (existing.status !== "approved" && existing.status !== "scheduled") {
    throw new Error("content_must_be_approved_before_external_publish");
  }

  const provider = normalizeText(args.provider).toLowerCase() || "buffer";
  if (provider !== "buffer") throw new Error("unsupported_marketing_publish_provider");

  const result = await publishViaBuffer({
    item: existing,
    publishNow: args.publishNow === true || normalizeText(args.publishNow).toLowerCase() === "true",
  });

  const patch: Record<string, unknown> = {
    ...result,
    updated_at: new Date().toISOString(),
  };
  if (result.external_status === "published") {
    patch.status = "published";
    patch.published_at = result.published_at ?? new Date().toISOString();
  } else if (result.external_status === "scheduled" || result.external_status === "queued") {
    patch.status = existing.status === "approved" ? "scheduled" : existing.status;
  }

  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_CONTENT_TABLE)
    .update(patch)
    .eq("id", id)
    .eq("owner_user_id", args.ownerUserId)
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_publish_update_failed");
  return data as MarketingContentItem;
}

export async function createMarketingLead(args: {
  ownerUserId: string;
  name?: unknown;
  email?: unknown;
  source?: unknown;
  notes?: unknown;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from(MARKETING_LEADS_TABLE)
    .insert({
      owner_user_id: args.ownerUserId,
      name: normalizeText(args.name) || null,
      email: normalizeText(args.email) || null,
      source: normalizeText(args.source) || null,
      status: "new",
      notes: normalizeText(args.notes) || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message ?? "marketing_lead_create_failed");
  return data as MarketingLead;
}
