export type BillingCycle = "monthly" | "annual";
export type PricingTier = "early" | "standard";

type EnvLike = Record<string, string | undefined>;

function cleanEnv(raw?: string | null) {
  if (!raw) return "";
  return String(raw).trim().replace(/^["']+|["']+$/g, "").trim();
}

export function resolveStripePriceCatalog(env: EnvLike = process.env) {
  const monthly = {
    early: cleanEnv(env.STRIPE_PRICE_ID_EARLY),
    standard: cleanEnv(env.STRIPE_PRICE_ID_STANDARD),
  };

  const annual = {
    early: cleanEnv(env.STRIPE_PRICE_ID_EARLY_ANNUAL),
    standard: cleanEnv(env.STRIPE_PRICE_ID_STANDARD_ANNUAL),
  };

  return {
    monthly,
    annual,
    monthlyConfigured: Boolean(monthly.early && monthly.standard),
    annualConfigured: Boolean(annual.early && annual.standard),
  };
}

export function selectStripeCheckoutPrice(args: {
  billingCycle: BillingCycle;
  displayTier: PricingTier;
  env?: EnvLike;
}) {
  const catalog = resolveStripePriceCatalog(args.env);
  const requestedCatalog = args.billingCycle === "annual" ? catalog.annual : catalog.monthly;
  const expectedEnvNames =
    args.billingCycle === "annual"
      ? ["STRIPE_PRICE_ID_EARLY_ANNUAL", "STRIPE_PRICE_ID_STANDARD_ANNUAL"]
      : ["STRIPE_PRICE_ID_EARLY", "STRIPE_PRICE_ID_STANDARD"];

  if (!requestedCatalog.early || !requestedCatalog.standard) {
    return {
      ok: false as const,
      error:
        args.billingCycle === "annual"
          ? ("annual_billing_unavailable" as const)
          : ("monthly_billing_unavailable" as const),
      expectedEnvNames,
    };
  }

  return {
    ok: true as const,
    priceId: requestedCatalog[args.displayTier],
    tier: args.displayTier,
    expectedEnvNames,
  };
}
