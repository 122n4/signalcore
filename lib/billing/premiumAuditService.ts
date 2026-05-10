import Stripe from "stripe";

import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { auditPremiumSubject, summarizePremiumAudit, type PremiumAuditResult, type PremiumAuditStripeSubscription } from "@/lib/billing/premiumAudit";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export type ClerkBillingUser = {
  id: string;
  email_addresses?: Array<{ email_address?: string; id?: string }>;
  primary_email_address_id?: string | null;
  public_metadata?: Record<string, unknown>;
};

export type PremiumAuditReport = {
  ok: boolean;
  generatedAt: string;
  filteredByEmails: string[] | null;
  summary: ReturnType<typeof summarizePremiumAudit>;
  users: Array<{
    userId: string;
    email: string | null;
    source: PremiumAuditResult["access"]["source"];
    effectivePremium: boolean;
    metadataIsPaid: boolean;
    stripeStatus: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    issues: PremiumAuditResult["issues"];
  }>;
};

export function normalizeEmailFilter(raw: string | null | undefined): Set<string> | null {
  const emails = String(raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return emails.length ? new Set(emails) : null;
}

export function primaryBillingEmail(user: ClerkBillingUser): string | null {
  const primary = user.email_addresses?.find((email) => email.id === user.primary_email_address_id);
  return primary?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
}

export async function fetchClerkBillingUsers(options: { limit?: number } = {}): Promise<ClerkBillingUser[]> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error("Missing CLERK_SECRET_KEY.");
  }

  const out: ClerkBillingUser[] = [];
  const pageSize = 100;
  const maxUsers = Math.max(1, Math.min(5000, Math.round(options.limit ?? 1000)));

  for (let offset = 0; offset < maxUsers; offset += pageSize) {
    const url = new URL("https://api.clerk.com/v1/users");
    url.searchParams.set("limit", String(Math.min(pageSize, maxUsers - offset)));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order_by", "-created_at");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Clerk users request failed (${response.status}).`);
    }

    const json = await response.json() as ClerkBillingUser[] | { data?: ClerkBillingUser[] };
    const users = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
    out.push(...users);
    if (users.length < pageSize) break;
  }

  return out;
}

async function fetchStripeSubscription(
  stripe: Stripe | null,
  metadata: Record<string, unknown> | null | undefined,
): Promise<PremiumAuditStripeSubscription | null> {
  if (!stripe || !metadata || typeof metadata !== "object") {
    return null;
  }

  const subId = String(metadata.stripeSubscriptionId ?? "").trim();
  const customerId = String(metadata.stripeCustomerId ?? "").trim();

  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId).catch(() => null);
    if (!sub) return null;
    return {
      id: sub.id,
      status: sub.status,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    };
  }

  if (customerId) {
    const list = await stripe.subscriptions.list({
      customer: customerId,
      limit: 3,
      status: "all",
    }).catch(() => null);
    const sub = list?.data?.[0] ?? null;
    if (!sub) return null;
    return {
      id: sub.id,
      status: sub.status,
      customerId,
    };
  }

  return null;
}

export async function buildPremiumAuditReport(options: {
  emails?: Set<string> | null;
  limit?: number;
} = {}): Promise<PremiumAuditReport> {
  const users = (await fetchClerkBillingUsers({ limit: options.limit })).filter((user) => {
    if (!options.emails) return true;
    const email = primaryBillingEmail(user);
    return email ? options.emails.has(email.toLowerCase()) : false;
  });
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  const results: PremiumAuditResult[] = [];

  for (const user of users) {
    const publicMetadata = user.public_metadata ?? {};
    const stripeSubscription = await fetchStripeSubscription(stripe, publicMetadata);
    results.push(
      auditPremiumSubject({
        userId: user.id,
        email: primaryBillingEmail(user),
        publicMetadata,
        isOwnerOverride: isOwnerUserId(user.id),
        isLocalQa: isLocalQaUserId(user.id),
        stripeSubscription,
      }),
    );
  }

  const summary = summarizePremiumAudit(results);
  return {
    ok: summary.fail === 0,
    generatedAt: new Date().toISOString(),
    filteredByEmails: options.emails ? Array.from(options.emails) : null,
    summary,
    users: results.map((result) => ({
      userId: result.userId,
      email: result.email,
      source: result.access.source,
      effectivePremium: result.access.effectivePremium,
      metadataIsPaid: result.access.metadataIsPaid,
      stripeStatus: result.stripe?.status ?? null,
      stripeCustomerId: result.stripe?.customerId ?? null,
      stripeSubscriptionId: result.stripe?.id ?? null,
      issues: result.issues,
    })),
  };
}
