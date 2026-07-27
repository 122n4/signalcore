import type { DatasetVersionRef } from "./datasets";
import type { InvestingResearchReasonCode } from "./reasonCodes";
import type { UtcIsoTimestamp, VersionedReference } from "./primitives";
import type {
  InvestingResearchScope,
  InvestingResearchScientificScope,
} from "./scope";
import type { ScientificDecision } from "./validation";

export const PROMOTION_ELIGIBILITY_ENVELOPE_VERSION =
  "investing-promotion-eligibility-envelope/v1" as const;

export type PromotionEligibilityState =
  | "validated"
  | "promotion_eligible"
  | "promoted";

/**
 * Evidence only. This deliberately has no execution handle, SQL command,
 * application-boundary port, order, position or accounting payload.
 */
export type PromotionEligibilityEnvelope = Readonly<{
  contractVersion: typeof PROMOTION_ELIGIBILITY_ENVELOPE_VERSION;
  eligibilityId: string;
  state: "promotion_eligible";
  scope: InvestingResearchScope;
  scientificScope: InvestingResearchScientificScope;
  candidateId: string;
  candidateVersion: string;
  hypothesisId: string;
  hypothesisVersion: string;
  experimentId: string;
  runId: string;
  dataset: DatasetVersionRef;
  validationDecision: ScientificDecision & Readonly<{ outcome: "validated" }>;
  evidenceIds: readonly string[];
  reasonCodes: readonly InvestingResearchReasonCode[];
  eligibilityProfile: VersionedReference;
  evaluatedAt: UtcIsoTimestamp;
  evaluatedBy: VersionedReference;
}>;
