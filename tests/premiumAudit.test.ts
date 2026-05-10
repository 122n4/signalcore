import { describe, expect, it } from "vitest";

import { auditPremiumSubject, summarizePremiumAudit } from "@/lib/billing/premiumAudit";

describe("premium billing audit", () => {
  it("warns when Clerk metadata grants premium without a Stripe source", () => {
    const result = auditPremiumSubject({
      userId: "user_1",
      email: "customer@example.com",
      publicMetadata: {
        isPaid: true,
      },
    });

    expect(result.access.source).toBe("manual_metadata");
    expect(result.issues.map((issue) => issue.code)).toContain("metadata_paid_without_stripe_source");
  });

  it("fails when Stripe metadata says paid but the subscription is inactive", () => {
    const result = auditPremiumSubject({
      userId: "user_2",
      email: "customer@example.com",
      publicMetadata: {
        isPaid: true,
        paidSource: "stripe",
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_123",
      },
      stripeSubscription: {
        id: "sub_123",
        customerId: "cus_123",
        status: "canceled",
      },
    });

    expect(result.issues.some((issue) => issue.severity === "fail")).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("metadata_paid_but_stripe_inactive");
  });

  it("summarizes premium sources for the QA report", () => {
    const results = [
      auditPremiumSubject({
        userId: "owner",
        email: "owner@example.com",
        isOwnerOverride: true,
        publicMetadata: {},
      }),
      auditPremiumSubject({
        userId: "stripe",
        email: "stripe@example.com",
        publicMetadata: {
          isPaid: true,
          paidSource: "stripe",
          stripeSubscriptionId: "sub_1",
          stripeCustomerId: "cus_1",
        },
        stripeSubscription: {
          id: "sub_1",
          customerId: "cus_1",
          status: "active",
        },
      }),
    ];

    expect(summarizePremiumAudit(results)).toMatchObject({
      checked: 2,
      premium: 2,
      fail: 0,
      stripePremium: 1,
      ownerOverridePremium: 1,
    });
  });
});
