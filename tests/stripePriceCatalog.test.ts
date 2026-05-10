import { describe, expect, it } from "vitest";
import {
  resolveStripePriceCatalog,
  selectStripeCheckoutPrice,
} from "@/lib/server/stripePriceCatalog";

describe("stripePriceCatalog", () => {
  it("normalizes configured monthly and annual price ids", () => {
    const catalog = resolveStripePriceCatalog({
      STRIPE_PRICE_ID_EARLY: ' "price_early_monthly" ',
      STRIPE_PRICE_ID_STANDARD: "price_standard_monthly",
      STRIPE_PRICE_ID_EARLY_ANNUAL: "price_early_annual",
      STRIPE_PRICE_ID_STANDARD_ANNUAL: "price_standard_annual",
    });

    expect(catalog.monthlyConfigured).toBe(true);
    expect(catalog.annualConfigured).toBe(true);
    expect(catalog.monthly.early).toBe("price_early_monthly");
    expect(catalog.annual.standard).toBe("price_standard_annual");
  });

  it("blocks annual checkout when annual Stripe prices are not configured", () => {
    const selected = selectStripeCheckoutPrice({
      billingCycle: "annual",
      displayTier: "early",
      env: {
        STRIPE_PRICE_ID_EARLY: "price_early_monthly",
        STRIPE_PRICE_ID_STANDARD: "price_standard_monthly",
      },
    });

    expect(selected.ok).toBe(false);
    if (selected.ok) throw new Error("expected annual selection to fail");
    expect(selected.error).toBe("annual_billing_unavailable");
    expect(selected.expectedEnvNames).toEqual([
      "STRIPE_PRICE_ID_EARLY_ANNUAL",
      "STRIPE_PRICE_ID_STANDARD_ANNUAL",
    ]);
  });

  it("selects the correct configured price id for the requested cycle and tier", () => {
    const selected = selectStripeCheckoutPrice({
      billingCycle: "annual",
      displayTier: "standard",
      env: {
        STRIPE_PRICE_ID_EARLY: "price_early_monthly",
        STRIPE_PRICE_ID_STANDARD: "price_standard_monthly",
        STRIPE_PRICE_ID_EARLY_ANNUAL: "price_early_annual",
        STRIPE_PRICE_ID_STANDARD_ANNUAL: "price_standard_annual",
      },
    });

    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error("expected annual selection to succeed");
    expect(selected.priceId).toBe("price_standard_annual");
    expect(selected.tier).toBe("standard");
  });
});
