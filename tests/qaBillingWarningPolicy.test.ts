import { describe, expect, it } from "vitest";

import {
  auditPremiumSubject,
  summarizePremiumAudit,
  type PremiumAuditResult,
} from "@/lib/billing/premiumAudit";
import type { PremiumAuditReport } from "@/lib/billing/premiumAuditService";
import { classifyBillingWarnings } from "@/scripts/qa/billingWarningPolicy";

function reportFrom(results: PremiumAuditResult[]): PremiumAuditReport {
  return {
    ok: results.every(
      (result) => !result.issues.some((issue) => issue.severity === "fail"),
    ),
    generatedAt: "2026-09-13T00:00:00.000Z",
    filteredByEmails: null,
    summary: summarizePremiumAudit(results),
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

function manualMetadataPremium(userId: string): PremiumAuditResult {
  return auditPremiumSubject({
    userId,
    email: `${userId}@example.test`,
    publicMetadata: { isPaid: true },
  });
}

describe("billing QA warning policy", () => {
  it("keeps manual-metadata premium warnings blocking outside Clerk TEST", () => {
    const classification = classifyBillingWarnings(
      reportFrom([manualMetadataPremium("user_live")]),
      "sk_live_example",
    );

    expect(classification.environment).toBe("NON_TEST");
    expect(classification.ignoredExpectedTestWarnings).toHaveLength(0);
    expect(classification.blockingWarnings.map((entry) => entry.issue.code)).toEqual([
      "metadata_paid_without_stripe_source",
    ]);
  });

  it("ignores exactly one structurally expected manual-metadata warning in Clerk TEST", () => {
    const classification = classifyBillingWarnings(
      reportFrom([manualMetadataPremium("user_test")]),
      "sk_test_example",
    );

    expect(classification.environment).toBe("CLERK_TEST");
    expect(classification.ignoredExpectedTestWarnings).toHaveLength(1);
    expect(classification.blockingWarnings).toHaveLength(0);
  });

  it("fails closed when Clerk TEST contains multiple manual-metadata premium users", () => {
    const classification = classifyBillingWarnings(
      reportFrom([
        manualMetadataPremium("user_test_1"),
        manualMetadataPremium("user_test_2"),
      ]),
      "sk_test_example",
    );

    expect(classification.ignoredExpectedTestWarnings).toHaveLength(0);
    expect(classification.blockingWarnings).toHaveLength(2);
  });

  it("keeps unrelated warnings blocking in Clerk TEST", () => {
    const report: PremiumAuditReport = {
      ok: true,
      generatedAt: "2026-09-13T00:00:00.000Z",
      filteredByEmails: null,
      summary: {
        checked: 1,
        premium: 1,
        fail: 0,
        warn: 1,
        manualMetadataPremium: 0,
        stripePremium: 1,
        ownerOverridePremium: 0,
      },
      users: [
        {
          userId: "user_test",
          email: "user_test@example.test",
          source: "stripe",
          effectivePremium: true,
          metadataIsPaid: true,
          stripeStatus: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          issues: [
            {
              severity: "warn",
              code: "stripe_paid_unverified",
              message: "Stripe-paid metadata could not be verified.",
            },
          ],
        },
      ],
    };

    const classification = classifyBillingWarnings(report, "sk_test_example");

    expect(classification.ignoredExpectedTestWarnings).toHaveLength(0);
    expect(classification.blockingWarnings.map((entry) => entry.issue.code)).toEqual([
      "stripe_paid_unverified",
    ]);
  });
});
