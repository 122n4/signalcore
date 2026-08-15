import {
  canonicalDecimalFromString,
  canonicalSha256,
  deepFreezeCanonical,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";
import type { CanonicalMandateV1 } from "@/lib/investing/engine/v1/contracts";

export const TECHNICAL_INVESTING_POLICY_DEFINITION_CONTRACT_VERSION_V1 =
  "technical-investing-policy-definition/v1" as const;

export const TECHNICAL_INVESTING_POLICY_VERSION_V1 = "risk-policy/v1" as const;

export type TechnicalInvestingPolicyMetricV1 =
  | "maximum_instrument_weight"
  | "maximum_asset_class_weight"
  | "maximum_currency_weight"
  | "minimum_cash_weight"
  | "maximum_total_exposure"
  | "maximum_risk_score";

export type TechnicalInvestingPolicyLimitScopeV1 =
  | "instrument"
  | "asset_class"
  | "currency"
  | "cash"
  | "total_exposure"
  | "risk_score";

export type TechnicalInvestingPolicyDeclarationV1 = {
  readonly code: TechnicalInvestingPolicyMetricV1;
  readonly scope: TechnicalInvestingPolicyLimitScopeV1;
  readonly subject: string | null;
  readonly kind: "hard" | "soft";
  readonly value: CanonicalDecimal;
};

export type TechnicalInvestingPolicyDefinitionV1 = {
  readonly contractVersion: typeof TECHNICAL_INVESTING_POLICY_DEFINITION_CONTRACT_VERSION_V1;
  readonly policyVersion: typeof TECHNICAL_INVESTING_POLICY_VERSION_V1;
  readonly riskProfiles: readonly {
    readonly riskProfile: CanonicalMandateV1["riskProfile"];
    readonly declarations: readonly TechnicalInvestingPolicyDeclarationV1[];
  }[];
};

const d = canonicalDecimalFromString;

function declaration(
  code: TechnicalInvestingPolicyMetricV1,
  scope: TechnicalInvestingPolicyLimitScopeV1,
  kind: "hard" | "soft",
  value: string,
): TechnicalInvestingPolicyDeclarationV1 {
  return { code, scope, subject: null, kind, value: d(value) };
}

export const TECHNICAL_INVESTING_POLICY_DEFINITION_V1 = deepFreezeCanonical({
  contractVersion: TECHNICAL_INVESTING_POLICY_DEFINITION_CONTRACT_VERSION_V1,
  policyVersion: TECHNICAL_INVESTING_POLICY_VERSION_V1,
  riskProfiles: [
    {
      riskProfile: "Conservative",
      declarations: [
        declaration("maximum_instrument_weight", "instrument", "hard", "0.25"),
        declaration("maximum_asset_class_weight", "asset_class", "hard", "0.60"),
        declaration("maximum_currency_weight", "currency", "soft", "0.40"),
        declaration("minimum_cash_weight", "cash", "hard", "0.10"),
        declaration("maximum_total_exposure", "total_exposure", "hard", "0.90"),
        declaration("maximum_risk_score", "risk_score", "soft", "0.35"),
      ],
    },
    {
      riskProfile: "Balanced",
      declarations: [
        declaration("maximum_instrument_weight", "instrument", "hard", "0.35"),
        declaration("maximum_asset_class_weight", "asset_class", "hard", "0.75"),
        declaration("maximum_currency_weight", "currency", "soft", "0.60"),
        declaration("minimum_cash_weight", "cash", "hard", "0.05"),
        declaration("maximum_total_exposure", "total_exposure", "hard", "0.95"),
        declaration("maximum_risk_score", "risk_score", "soft", "0.50"),
      ],
    },
    {
      riskProfile: "Aggressive",
      declarations: [
        declaration("maximum_instrument_weight", "instrument", "hard", "0.50"),
        declaration("maximum_asset_class_weight", "asset_class", "hard", "0.90"),
        declaration("maximum_currency_weight", "currency", "soft", "0.80"),
        declaration("minimum_cash_weight", "cash", "hard", "0.02"),
        declaration("maximum_total_exposure", "total_exposure", "hard", "0.98"),
        declaration("maximum_risk_score", "risk_score", "soft", "0.70"),
      ],
    },
  ],
} satisfies TechnicalInvestingPolicyDefinitionV1) as TechnicalInvestingPolicyDefinitionV1;

export function hashInvestingTechnicalPolicyDefinitionV1(
  definition: TechnicalInvestingPolicyDefinitionV1 = TECHNICAL_INVESTING_POLICY_DEFINITION_V1,
) {
  return canonicalSha256(definition);
}

export const INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1 =
  hashInvestingTechnicalPolicyDefinitionV1(TECHNICAL_INVESTING_POLICY_DEFINITION_V1);

export function assertSupportedInvestingTechnicalPolicyVersionV1(policyVersion: string) {
  if (policyVersion !== TECHNICAL_INVESTING_POLICY_VERSION_V1) {
    throw new Error("investing_policy_version_unsupported");
  }
}

export function getTechnicalInvestingPolicyDeclarationsForRiskProfileV1(
  riskProfile: CanonicalMandateV1["riskProfile"],
) {
  const entry = TECHNICAL_INVESTING_POLICY_DEFINITION_V1.riskProfiles.find((item) =>
    item.riskProfile === riskProfile,
  );
  if (!entry) throw new Error("investing_policy_risk_profile_unsupported");
  return entry.declarations;
}
