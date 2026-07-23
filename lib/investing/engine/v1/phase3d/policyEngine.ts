import {
  canonicalDecimalFromString,
  canonicalSha256,
  deepFreezeCanonical,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";
import type { CanonicalInvestingInputV1 } from "@/lib/investing/engine/v1/contracts";
import { DECIMAL_ONE, DECIMAL_ZERO, decimalCompare, decimalEquals } from "@/lib/investing/engine/v1/phase3d/decimalMath";
import {
  POLICY_EVALUATION_CONTRACT_VERSION,
  type PolicyEvaluationV1,
  type PolicyInstrumentRuleV1,
  type PolicyLimitScopeV1,
  type PolicyLimitV1,
} from "@/lib/investing/engine/v1/phase3d/types";

type LimitDefinition = Omit<PolicyLimitV1, "source"> & { source: string };

const LIMIT_PREFIXES: Readonly<Record<string, { scope: PolicyLimitScopeV1; code: string }>> = {
  max_instrument_weight: { scope: "instrument", code: "maximum_instrument_weight" },
  max_asset_class_weight: { scope: "asset_class", code: "maximum_asset_class_weight" },
  max_currency_weight: { scope: "currency", code: "maximum_currency_weight" },
  minimum_cash_weight: { scope: "cash", code: "minimum_cash_weight" },
  maximum_total_exposure: { scope: "total_exposure", code: "maximum_total_exposure" },
  maximum_risk_score: { scope: "risk_score", code: "maximum_risk_score" },
};

function d(value: string) {
  return canonicalDecimalFromString(value);
}

function defaultLimits(input: CanonicalInvestingInputV1): LimitDefinition[] {
  const source = `policy_defaults:${input.mandate.riskProfile}:v1`;
  const values = input.mandate.riskProfile === "Conservative"
    ? ["0.25", "0.6", "0.4", "0.1", "0.9", "0.35"]
    : input.mandate.riskProfile === "Balanced"
      ? ["0.35", "0.75", "0.6", "0.05", "0.95", "0.5"]
      : ["0.5", "0.9", "0.8", "0.02", "0.98", "0.7"];
  return [
    { code: "maximum_instrument_weight", scope: "instrument", subject: null, kind: "hard", value: d(values[0]), source },
    { code: "maximum_asset_class_weight", scope: "asset_class", subject: null, kind: "hard", value: d(values[1]), source },
    { code: "maximum_currency_weight", scope: "currency", subject: null, kind: "soft", value: d(values[2]), source },
    { code: "minimum_cash_weight", scope: "cash", subject: null, kind: "hard", value: d(values[3]), source },
    { code: "maximum_total_exposure", scope: "total_exposure", subject: null, kind: "hard", value: d(values[4]), source },
    { code: "maximum_risk_score", scope: "risk_score", subject: null, kind: "soft", value: d(values[5]), source },
  ];
}

function limitKey(limit: Pick<PolicyLimitV1, "scope" | "subject">) {
  return `${limit.scope}:${limit.subject ?? "*"}`;
}

function isRatio(value: CanonicalDecimal) {
  return decimalCompare(value, DECIMAL_ZERO) >= 0 && decimalCompare(value, DECIMAL_ONE) <= 0;
}

export function evaluateInvestingPolicyV1(input: CanonicalInvestingInputV1): PolicyEvaluationV1 {
  const conflicts = new Set<string>();
  const catalogSymbols = new Set(input.instrumentCatalog.instruments.filter((item) => item.enabled).map((item) => item.symbol));
  const explicitAllowed = new Set<string>();
  const prohibited = new Set<string>();
  const unsuitable = new Set<string>();
  const allowSources = new Map<string, string>();
  const prohibitSources = new Map<string, string>();
  const unsuitableSources = new Map<string, string>();
  const limits = new Map(defaultLimits(input).map((limit) => [limitKey(limit), limit]));
  const mandateLimitDefinitions = new Map<string, LimitDefinition>();

  for (const constraint of [...input.mandate.constraints].sort((a, b) => a.id.localeCompare(b.id))) {
    const [prefix, subject] = constraint.id.split(":");
    if (prefix === "allow_instrument" || prefix === "allowed_instrument") {
      if (!subject || !catalogSymbols.has(subject)) {
        conflicts.add(`allowed_instrument_not_in_catalog:${subject ?? "missing"}`);
      } else {
        explicitAllowed.add(subject);
        allowSources.set(subject, `mandate:${input.mandate.mandateSnapshotId}:${constraint.id}`);
      }
      continue;
    }
    if (prefix === "prohibit_instrument" || prefix === "prohibited_instrument") {
      if (!subject) conflicts.add("prohibited_instrument_subject_missing");
      else {
        prohibited.add(subject);
        prohibitSources.set(subject, `mandate:${input.mandate.mandateSnapshotId}:${constraint.id}`);
      }
      continue;
    }
    if (prefix === "suitability_instrument") {
      if (!subject) conflicts.add("suitability_instrument_subject_missing");
      else if (constraint.status !== "pass") {
        unsuitable.add(subject);
        unsuitableSources.set(subject, `mandate:${input.mandate.mandateSnapshotId}:${constraint.id}`);
      }
      continue;
    }
    if (prefix === "suitability_asset_class") {
      if (!subject) {
        conflicts.add("suitability_asset_class_subject_missing");
      } else if (constraint.status !== "pass") {
        for (const instrument of input.instrumentCatalog.instruments) {
          if (instrument.assetClass === subject) {
            unsuitable.add(instrument.symbol);
            unsuitableSources.set(instrument.symbol, `mandate:${input.mandate.mandateSnapshotId}:${constraint.id}`);
          }
        }
      }
      continue;
    }
    const definition = LIMIT_PREFIXES[prefix];
    if (!definition) continue;
    if (constraint.limit === null || !isRatio(constraint.limit)) {
      conflicts.add(`policy_limit_invalid:${constraint.id}`);
      continue;
    }
    const normalizedSubject = definition.scope === "cash"
      || definition.scope === "total_exposure"
      || definition.scope === "risk_score"
      ? null
      : subject ?? null;
    const candidate: LimitDefinition = {
      code: definition.code,
      scope: definition.scope,
      subject: normalizedSubject,
      kind: constraint.kind,
      value: constraint.limit,
      source: `mandate:${input.mandate.mandateSnapshotId}:${constraint.id}`,
    };
    const key = limitKey(candidate);
    const previousMandate = mandateLimitDefinitions.get(key);
    if (previousMandate && (!decimalEquals(previousMandate.value, candidate.value) || previousMandate.kind !== candidate.kind)) {
      conflicts.add(`policy_limit_conflict:${key}`);
      continue;
    }
    mandateLimitDefinitions.set(key, candidate);
    limits.set(key, candidate);
  }

  for (const symbol of explicitAllowed) {
    if (prohibited.has(symbol)) conflicts.add(`instrument_allowed_and_prohibited:${symbol}`);
  }
  const startingUniverse = explicitAllowed.size > 0 ? explicitAllowed : catalogSymbols;
  const allowedUniverse = [...startingUniverse]
    .filter((symbol) => !prohibited.has(symbol) && !unsuitable.has(symbol))
    .sort();
  const allRuleSymbols = new Set([...catalogSymbols, ...explicitAllowed, ...prohibited, ...unsuitable]);
  const instrumentRules = [...allRuleSymbols].sort().map((symbol): PolicyInstrumentRuleV1 => {
    if (prohibited.has(symbol)) {
      return {
        symbol,
        disposition: "prohibited",
        source: prohibitSources.get(symbol) ?? `mandate:${input.mandate.mandateSnapshotId}`,
        explanation: `${symbol} is explicitly prohibited and cannot enter a feasible decision`,
      };
    }
    if (unsuitable.has(symbol)) {
      return {
        symbol,
        disposition: "unsuitable",
        source: unsuitableSources.get(symbol) ?? `mandate:${input.mandate.mandateSnapshotId}`,
        explanation: `${symbol} fails an authoritative suitability rule`,
      };
    }
    if (explicitAllowed.size > 0 && !explicitAllowed.has(symbol)) {
      return {
        symbol,
        disposition: "outside_explicit_universe",
        source: `mandate:${input.mandate.mandateSnapshotId}:explicit_universe`,
        explanation: `${symbol} is not present in the mandate allowlist`,
      };
    }
    return {
      symbol,
      disposition: "allowed",
      source: allowSources.get(symbol) ?? `catalog:${input.instrumentCatalog.version}`,
      explanation: `${symbol} is enabled and passes universe and suitability filters`,
    };
  });
  const resolvedLimits = [...limits.values()].sort((left, right) => {
    const a = `${left.scope}:${left.subject ?? "*"}:${left.code}`;
    const b = `${right.scope}:${right.subject ?? "*"}:${right.code}`;
    return a.localeCompare(b);
  });
  const sortedConflicts = [...conflicts].sort();
  const draft: Omit<PolicyEvaluationV1, "policyHash"> = {
    contractVersion: POLICY_EVALUATION_CONTRACT_VERSION,
    inputHash: input.inputHash,
    asOf: input.asOf,
    mandateSnapshotId: input.mandate.mandateSnapshotId,
    policyVersion: input.versions.policyVersion,
    objective: input.mandate.objective,
    horizon: input.mandate.horizon,
    riskProfile: input.mandate.riskProfile,
    status: sortedConflicts.length > 0 ? "conflict" : "resolved",
    allowedUniverse,
    prohibitedInstruments: [...prohibited].sort(),
    unsuitableInstruments: [...unsuitable].sort(),
    instrumentRules,
    limits: resolvedLimits,
    conflicts: sortedConflicts,
  };
  const result = { ...draft, policyHash: canonicalSha256(draft) } satisfies PolicyEvaluationV1;
  return deepFreezeCanonical(result) as PolicyEvaluationV1;
}

export function findPolicyLimitV1(
  policy: PolicyEvaluationV1,
  scope: PolicyLimitScopeV1,
  subject: string | null,
): PolicyLimitV1 | null {
  return policy.limits.find((limit) => limit.scope === scope && limit.subject === subject)
    ?? policy.limits.find((limit) => limit.scope === scope && limit.subject === null)
    ?? null;
}
