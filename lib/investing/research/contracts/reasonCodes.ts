export const INVESTING_RESEARCH_REASON_CODE_DEFINITIONS = {
  "research.contract.invalid": { category: "contract", severity: "error" },
  "research.contract.unexpected_property": { category: "contract", severity: "error" },
  "research.contract.canonical_value_invalid": { category: "contract", severity: "error" },
  "research.contract.version_missing": { category: "contract", severity: "error" },
  "research.identity.scope_incomplete": { category: "identity_scope", severity: "error" },
  "research.identity.scope_mismatch": { category: "identity_scope", severity: "error" },
  "research.dataset.not_versioned": { category: "dataset", severity: "error" },
  "research.dataset.hash_missing": { category: "dataset", severity: "error" },
  "research.dataset.coverage_invalid": { category: "dataset", severity: "error" },
  "research.experiment.identity_incomplete": { category: "experiment", severity: "error" },
  "research.experiment.definition_invalid": { category: "experiment", severity: "error" },
  "research.execution.transition_not_allowed": { category: "execution", severity: "error" },
  "research.execution.failed": { category: "execution", severity: "error" },
  "research.execution.run_inconsistent": { category: "execution", severity: "error" },
  "research.execution.cancelled": { category: "execution", severity: "warning" },
  "research.validation.metric_unavailable": { category: "validation", severity: "warning" },
  "research.validation.inconclusive": { category: "validation", severity: "warning" },
  "research.validation.rejected": { category: "validation", severity: "error" },
  "research.validation.blocked": { category: "validation", severity: "error" },
  "research.promotion.not_eligible": { category: "promotion", severity: "error" },
  "research.promotion.evidence_incomplete": { category: "promotion", severity: "error" },
  "research.integrity.reason_code_unknown": { category: "internal_integrity", severity: "error" },
  "research.integrity.duplicate_value": { category: "internal_integrity", severity: "error" },
  "research.integrity.reference_mismatch": { category: "internal_integrity", severity: "error" },
} as const;

export type InvestingResearchReasonCode =
  keyof typeof INVESTING_RESEARCH_REASON_CODE_DEFINITIONS;
export type InvestingResearchReasonCategory =
  (typeof INVESTING_RESEARCH_REASON_CODE_DEFINITIONS)[InvestingResearchReasonCode]["category"];
export type InvestingResearchReasonSeverity =
  (typeof INVESTING_RESEARCH_REASON_CODE_DEFINITIONS)[InvestingResearchReasonCode]["severity"];

export const INVESTING_RESEARCH_REASON_CODES =
  Object.freeze(Object.keys(INVESTING_RESEARCH_REASON_CODE_DEFINITIONS)
    .sort()) as readonly InvestingResearchReasonCode[];

export function isInvestingResearchReasonCode(
  value: unknown,
): value is InvestingResearchReasonCode {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(
      INVESTING_RESEARCH_REASON_CODE_DEFINITIONS,
      value,
    );
}
