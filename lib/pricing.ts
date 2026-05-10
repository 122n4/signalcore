import "server-only";

import Stripe from "stripe";
import { resolveStripePriceCatalog } from "@/lib/server/stripePriceCatalog";

export const EARLY_ACCESS_LIMIT = 500;

type PriceSnapshot = {
  priceId: string | null;
  amount: number | null;
  amountMinor: number | null;
  currency: string;
  active: boolean;
  interval: string | null;
};

export type PublicPricingResolverOutput = {
  early: PriceSnapshot & {
    remaining: number | null;
    subscriberCount: number | null;
  };
  standard: PriceSnapshot;
  display: {
    amount: number;
    amountMinor: number;
    currency: string;
    tier: "early" | "standard";
    earlyActive: boolean;
    priceId: string | null;
    annualAvailable: boolean;
    annualAmount: number | null;
    annualAmountMinor: number | null;
    annualCurrency: string | null;
    annualPriceId: string | null;
  };
  meta: {
    source: "stripe" | "fallback";
    countMethod: "stripe_list" | "env_placeholder" | "unknown";
    updatedAt: string;
    cacheTtlSec: number;
  };
};

type ResolverCache = {
  expiresAt: number;
  value: PublicPricingResolverOutput;
};

const CACHE_TTL_MS = 60_000;
let pricingCache: ResolverCache | null = null;

function cleanEnv(raw?: string | null) {
  if (!raw) return "";
  return String(raw).trim().replace(/^["']+|["']+$/g, "").trim();
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toMajorAmount(amountMinor: number | null) {
  if (!Number.isFinite(Number(amountMinor))) return null;
  const minor = Number(amountMinor);
  return Math.round((minor / 100) * 100) / 100;
}

function envFoundingLeftPlaceholder() {
  const a = process.env.FOUNDING_LEFT;
  const b = process.env.NEXT_PUBLIC_FOUNDING_LEFT;
  const raw = cleanEnv(a) || cleanEnv(b);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return clampInt(n, 0, EARLY_ACCESS_LIMIT);
}

function makeFallbackPrice(priceId: string | null, amount: number, currency = "eur", active = true): PriceSnapshot {
  return {
    priceId,
    amount,
    amountMinor: Math.round(amount * 100),
    currency,
    active,
    interval: "month",
  };
}

async function getStripeClient() {
  const key = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!key) return null;
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
}

async function fetchStripePrice(stripe: Stripe, priceId: string): Promise<PriceSnapshot> {
  const price = await stripe.prices.retrieve(priceId);
  const amountMinor = typeof price.unit_amount === "number" ? price.unit_amount : null;
  const interval = price.recurring?.interval ? String(price.recurring.interval) : null;
  return {
    priceId,
    amount: toMajorAmount(amountMinor),
    amountMinor,
    currency: String(price.currency || "eur").toLowerCase(),
    active: Boolean(price.active),
    interval,
  };
}

async function countEarlySubscribers(stripe: Stripe, priceId: string): Promise<number | null> {
  try {
    const qualifying = new Set<Stripe.Subscription.Status>(["active", "trialing"]);
    let count = 0;
    let startingAfter: string | undefined;

    while (count <= EARLY_ACCESS_LIMIT) {
      const page = await stripe.subscriptions.list({
        status: "all",
        price: priceId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of page.data) {
        if (qualifying.has(sub.status)) count += 1;
        if (count > EARLY_ACCESS_LIMIT) break;
      }

      if (!page.has_more || page.data.length === 0 || count > EARLY_ACCESS_LIMIT) break;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return count;
  } catch {
    return null;
  }
}

function buildOutput(args: {
  early: PriceSnapshot;
  standard: PriceSnapshot;
  annualEarly: PriceSnapshot | null;
  annualStandard: PriceSnapshot | null;
  annualConfigured: boolean;
  earlyCount: number | null;
  countMethod: "stripe_list" | "env_placeholder" | "unknown";
  source: "stripe" | "fallback";
}): PublicPricingResolverOutput {
  const earlyRemaining = args.earlyCount == null ? null : Math.max(0, EARLY_ACCESS_LIMIT - args.earlyCount);
  const earlyPriceReady = Boolean(args.early.active && args.early.amountMinor != null);
  const earlyActive = earlyPriceReady && (earlyRemaining == null ? true : earlyRemaining > 0);

  const displayTier: "early" | "standard" = earlyActive ? "early" : "standard";
  const displaySource = displayTier === "early" ? args.early : args.standard;
  const displayFallback = displayTier === "early" ? makeFallbackPrice(args.early.priceId, 19) : makeFallbackPrice(args.standard.priceId, 29);
  const effectiveDisplay = displaySource.amountMinor != null ? displaySource : displayFallback;
  const annualSource = displayTier === "early" ? args.annualEarly : args.annualStandard;
  const effectiveAnnual =
    args.annualConfigured && annualSource && annualSource.active && annualSource.amountMinor != null
      ? annualSource
      : null;

  return {
    early: {
      ...args.early,
      remaining: earlyRemaining,
      subscriberCount: args.earlyCount,
    },
    standard: args.standard,
    display: {
      amount: Number(effectiveDisplay.amount ?? (displayTier === "early" ? 19 : 29)),
      amountMinor: Number(effectiveDisplay.amountMinor ?? (displayTier === "early" ? 1900 : 2900)),
      currency: String(effectiveDisplay.currency || "eur").toLowerCase(),
      tier: displayTier,
      earlyActive,
      priceId: effectiveDisplay.priceId,
      annualAvailable: Boolean(effectiveAnnual),
      annualAmount: effectiveAnnual?.amount ?? null,
      annualAmountMinor: effectiveAnnual?.amountMinor ?? null,
      annualCurrency: effectiveAnnual?.currency ?? null,
      annualPriceId: effectiveAnnual?.priceId ?? null,
    },
    meta: {
      source: args.source,
      countMethod: args.countMethod,
      updatedAt: new Date().toISOString(),
      cacheTtlSec: Math.round(CACHE_TTL_MS / 1000),
    },
  };
}

export async function resolvePublicPricing(forceRefresh = false): Promise<PublicPricingResolverOutput> {
  const now = Date.now();
  if (!forceRefresh && pricingCache && pricingCache.expiresAt > now) {
    return pricingCache.value;
  }

  const catalog = resolveStripePriceCatalog(process.env);
  const earlyPriceId = catalog.monthly.early;
  const standardPriceId = catalog.monthly.standard;
  const annualEarlyPriceId = catalog.annual.early;
  const annualStandardPriceId = catalog.annual.standard;

  const fallbackEarly = makeFallbackPrice(earlyPriceId || null, 19);
  const fallbackStandard = makeFallbackPrice(standardPriceId || null, 29);

  let output = buildOutput({
    early: fallbackEarly,
    standard: fallbackStandard,
    annualEarly: null,
    annualStandard: null,
    annualConfigured: catalog.annualConfigured,
    earlyCount: (() => {
      const left = envFoundingLeftPlaceholder();
      return left == null ? null : EARLY_ACCESS_LIMIT - left;
    })(),
    countMethod: envFoundingLeftPlaceholder() == null ? "unknown" : "env_placeholder",
    source: "fallback",
  });

  const stripe = await getStripeClient();
  if (!stripe || !catalog.monthlyConfigured) {
    pricingCache = { expiresAt: now + CACHE_TTL_MS, value: output };
    return output;
  }

  try {
    const [early, standard, counted, annualEarly, annualStandard] = await Promise.all([
      fetchStripePrice(stripe, earlyPriceId).catch(() => fallbackEarly),
      fetchStripePrice(stripe, standardPriceId).catch(() => fallbackStandard),
      countEarlySubscribers(stripe, earlyPriceId),
      catalog.annualConfigured && annualEarlyPriceId
        ? fetchStripePrice(stripe, annualEarlyPriceId).catch(() => null)
        : Promise.resolve(null),
      catalog.annualConfigured && annualStandardPriceId
        ? fetchStripePrice(stripe, annualStandardPriceId).catch(() => null)
        : Promise.resolve(null),
    ]);

    let earlyCount = counted;
    let countMethod: "stripe_list" | "env_placeholder" | "unknown" = counted == null ? "unknown" : "stripe_list";
    if (earlyCount == null) {
      const left = envFoundingLeftPlaceholder();
      if (left != null) {
        earlyCount = EARLY_ACCESS_LIMIT - left;
        countMethod = "env_placeholder";
      }
    }

    output = buildOutput({
      early,
      standard,
      annualEarly,
      annualStandard,
      annualConfigured: catalog.annualConfigured,
      earlyCount,
      countMethod,
      source: "stripe",
    });
  } catch {
    // keep fallback output
  }

  pricingCache = { expiresAt: now + CACHE_TTL_MS, value: output };
  return output;
}
