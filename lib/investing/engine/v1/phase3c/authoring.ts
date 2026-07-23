import { canonicalDecimalFromString } from "@/lib/investing/engine/v1/canonical";
import type { InvestingQualityIssueV1 } from "@/lib/investing/engine/v1/contracts";
import type {
  InvestingAuthoringSourceV1,
  NormalizedInvestingAuthoringV1,
} from "@/lib/investing/engine/v1/phase3c/types";

const OBJECTIVES = ["preservation", "growth", "income", "balanced"] as const;
const RISK_PROFILES = ["Conservative", "Balanced", "Aggressive"] as const;
const HORIZONS = ["Short", "Medium", "Long"] as const;

function issue(code: string, message: string, asOf: string): InvestingQualityIssueV1 {
  return {
    code,
    severity: "warning",
    domain: "authoring",
    message,
    observedAt: asOf,
  };
}

function allowEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
  asOf: string,
  issues: InvestingQualityIssueV1[],
): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && allowed.includes(value as T)) return value as T;
  issues.push(issue(code, "Known authoring field has an unsupported value and was ignored", asOf));
  return null;
}

function allowNonNegativeIntegerDecimal(
  value: unknown,
  fallback: string,
  code: string,
  asOf: string,
  issues: InvestingQualityIssueV1[],
) {
  if (value === undefined || value === null || value === "") return canonicalDecimalFromString(fallback);
  try {
    if (typeof value !== "string") throw new Error("string_required");
    const normalized = canonicalDecimalFromString(value);
    if (normalized.startsWith("-") || normalized.includes(".")) throw new Error("integer_required");
    return normalized;
  } catch {
    issues.push(issue(code, "Known timing setting is invalid; the versioned safe default was used", asOf));
    return canonicalDecimalFromString(fallback);
  }
}

/**
 * Typed allowlist. Every non-listed plan/settings field is intentionally ignored,
 * so authoring data can never inject cash, positions, orders or valuations.
 */
export function normalizeInvestingAuthoringV1(
  source: InvestingAuthoringSourceV1,
  asOf: string,
): { normalized: NormalizedInvestingAuthoringV1; issues: readonly InvestingQualityIssueV1[] } {
  const issues: InvestingQualityIssueV1[] = [];
  const normalized: NormalizedInvestingAuthoringV1 = {
    plan: {
      objective: allowEnum(source.plan.objective, OBJECTIVES, "plan_objective_invalid", asOf, issues),
      riskProfile: allowEnum(source.plan.riskProfile, RISK_PROFILES, "plan_risk_profile_invalid", asOf, issues),
      horizon: allowEnum(source.plan.horizon, HORIZONS, "plan_horizon_invalid", asOf, issues),
    },
    settings: {
      marketDataMaxAgeSeconds: allowNonNegativeIntegerDecimal(
        source.settings.marketDataMaxAgeSeconds,
        "900",
        "market_staleness_setting_invalid",
        asOf,
        issues,
      ),
      orderStaleAfterSeconds: allowNonNegativeIntegerDecimal(
        source.settings.orderStaleAfterSeconds,
        "86400",
        "order_staleness_setting_invalid",
        asOf,
        issues,
      ),
    },
  };
  return { normalized, issues };
}
