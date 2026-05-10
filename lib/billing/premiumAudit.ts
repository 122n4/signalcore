export type PremiumAuditMetadata = Record<string, unknown> | null | undefined;

export type PremiumAuditStripeSubscription = {
  id: string | null;
  status: string | null;
  customerId: string | null;
};

export type PremiumAuditSubject = {
  userId: string;
  email: string | null;
  publicMetadata: PremiumAuditMetadata;
  isOwnerOverride?: boolean;
  isLocalQa?: boolean;
  stripeSubscription?: PremiumAuditStripeSubscription | null;
};

export type PremiumAuditIssueSeverity = "info" | "warn" | "fail";

export type PremiumAuditIssue = {
  severity: PremiumAuditIssueSeverity;
  code: string;
  message: string;
};

export type PremiumAuditResult = {
  userId: string;
  email: string | null;
  access: {
    metadataIsPaid: boolean;
    metadataHasTrial: boolean;
    ownerOverride: boolean;
    localQa: boolean;
    effectivePremium: boolean;
    source: "stripe" | "owner_override" | "local_qa" | "manual_metadata" | "trial" | "free";
  };
  stripe: PremiumAuditStripeSubscription | null;
  issues: PremiumAuditIssue[];
};

const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing", "past_due"]);
const INACTIVE_STRIPE_STATUSES = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

function cleanString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function metadataValue(meta: PremiumAuditMetadata, key: string): unknown {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>)[key] : undefined;
}

function parseTrialActive(meta: PremiumAuditMetadata, nowMs = Date.now()): boolean {
  const startedAt = cleanString(metadataValue(meta, "trialStartedAt"));
  const endsAt = cleanString(metadataValue(meta, "trialEndsAt"));
  if (!startedAt || !endsAt) return false;

  const endMs = new Date(endsAt).getTime();
  return Number.isFinite(endMs) && nowMs < endMs;
}

export function isStripePaidStatus(status: string | null | undefined): boolean {
  return ACTIVE_STRIPE_STATUSES.has(String(status ?? "").toLowerCase().trim());
}

export function isStripeInactiveStatus(status: string | null | undefined): boolean {
  return INACTIVE_STRIPE_STATUSES.has(String(status ?? "").toLowerCase().trim());
}

export function auditPremiumSubject(subject: PremiumAuditSubject, nowMs = Date.now()): PremiumAuditResult {
  const meta = subject.publicMetadata && typeof subject.publicMetadata === "object"
    ? subject.publicMetadata
    : {};
  const metadataIsPaid = Boolean((meta as Record<string, unknown>).isPaid);
  const paidSource = cleanString((meta as Record<string, unknown>).paidSource);
  const paidStatus = cleanString((meta as Record<string, unknown>).paidStatus);
  const metadataSubId = cleanString((meta as Record<string, unknown>).stripeSubscriptionId);
  const metadataCustomerId = cleanString((meta as Record<string, unknown>).stripeCustomerId);
  const metadataHasTrial = parseTrialActive(meta, nowMs);
  const stripe = subject.stripeSubscription ?? null;
  const stripeActive = isStripePaidStatus(stripe?.status);
  const stripeInactive = isStripeInactiveStatus(stripe?.status);
  const ownerOverride = Boolean(subject.isOwnerOverride);
  const localQa = Boolean(subject.isLocalQa);
  const issues: PremiumAuditIssue[] = [];

  let source: PremiumAuditResult["access"]["source"] = "free";
  if (localQa) source = "local_qa";
  else if (ownerOverride) source = "owner_override";
  else if (metadataIsPaid && paidSource === "stripe") source = "stripe";
  else if (metadataIsPaid) source = "manual_metadata";
  else if (metadataHasTrial) source = "trial";

  if (metadataIsPaid && paidSource !== "stripe" && !ownerOverride && !localQa) {
    issues.push({
      severity: "warn",
      code: "metadata_paid_without_stripe_source",
      message: "User is premium through Clerk publicMetadata without paidSource=stripe.",
    });
  }

  if (metadataIsPaid && paidSource === "stripe" && !metadataSubId && !metadataCustomerId) {
    issues.push({
      severity: "fail",
      code: "stripe_paid_missing_ids",
      message: "User is marked paid by Stripe but has no Stripe customer or subscription id in metadata.",
    });
  }

  if (metadataIsPaid && paidSource === "stripe" && stripeInactive) {
    issues.push({
      severity: "fail",
      code: "metadata_paid_but_stripe_inactive",
      message: `User is marked paid, but Stripe subscription status is ${stripe?.status}.`,
    });
  }

  if (!metadataIsPaid && stripeActive && !ownerOverride && !localQa) {
    issues.push({
      severity: "fail",
      code: "stripe_active_but_metadata_free",
      message: "Stripe subscription is active but Clerk publicMetadata is not paid.",
    });
  }

  if (metadataSubId && stripe?.id && metadataSubId !== stripe.id) {
    issues.push({
      severity: "fail",
      code: "stripe_subscription_id_mismatch",
      message: "Clerk metadata subscription id does not match the Stripe subscription returned by audit.",
    });
  }

  if (metadataCustomerId && stripe?.customerId && metadataCustomerId !== stripe.customerId) {
    issues.push({
      severity: "fail",
      code: "stripe_customer_id_mismatch",
      message: "Clerk metadata customer id does not match the Stripe subscription customer.",
    });
  }

  if (metadataIsPaid && paidSource === "stripe" && !stripe && !metadataSubId) {
    issues.push({
      severity: "warn",
      code: "stripe_paid_unverified",
      message: "Stripe-paid metadata could not be verified because no subscription id was available.",
    });
  }

  if (paidStatus && paidSource === "stripe" && isStripeInactiveStatus(paidStatus) && metadataIsPaid) {
    issues.push({
      severity: "fail",
      code: "metadata_paid_status_inactive",
      message: `Clerk metadata paidStatus is ${paidStatus} while isPaid remains true.`,
    });
  }

  return {
    userId: subject.userId,
    email: subject.email,
    access: {
      metadataIsPaid,
      metadataHasTrial,
      ownerOverride,
      localQa,
      effectivePremium: localQa || ownerOverride || metadataIsPaid || metadataHasTrial || stripeActive,
      source,
    },
    stripe,
    issues,
  };
}

export function summarizePremiumAudit(results: PremiumAuditResult[]) {
  return {
    checked: results.length,
    premium: results.filter((result) => result.access.effectivePremium).length,
    fail: results.filter((result) => result.issues.some((issue) => issue.severity === "fail")).length,
    warn: results.filter((result) => result.issues.some((issue) => issue.severity === "warn")).length,
    manualMetadataPremium: results.filter((result) => result.access.source === "manual_metadata").length,
    stripePremium: results.filter((result) => result.access.source === "stripe").length,
    ownerOverridePremium: results.filter((result) => result.access.source === "owner_override").length,
  };
}
