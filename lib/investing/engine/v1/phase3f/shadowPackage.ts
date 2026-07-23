import {
  FINAL_SHADOW_PACKAGE_VERSION,
  type InvestingEngineAuditBundleV1,
  type InvestingEngineDecisionV1,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEngineShadowPackageV1,
} from "@/lib/investing/engine/v1/phase3f/types";
import { freeze, sha256 } from "@/lib/investing/engine/v1/phase3f/primitives";

const EXPECTED_COMPARISON_DIMENSIONS = [
  "actionSetDifference",
  "blockedDifference",
  "degradedDifference",
  "estimatedCostDifference",
  "explainabilityCoverageDifference",
  "finalStateDifference",
  "liquidityDifference",
  "missingLegacyFields",
  "notionalDifference",
  "reasonCodeDifference",
  "residualCashDifference",
  "riskAfterDifference",
  "riskBeforeDifference",
  "sideDifference",
  "targetQuantityDifference",
  "targetWeightDifference",
  "taxAwarenessDifference",
  "turnoverDifference",
] as const;

export function buildInvestingEngineShadowPackageV1(args: {
  sources: InvestingEnginePhase3FSourcesV1;
  decision: InvestingEngineDecisionV1;
  auditBundle: InvestingEngineAuditBundleV1;
}): InvestingEngineShadowPackageV1 {
  const draft: Omit<InvestingEngineShadowPackageV1, "shadowPackageHash"> = {
    contractVersion: FINAL_SHADOW_PACKAGE_VERSION,
    runIdentity: { runId: args.sources.request.runId, asOf: args.sources.request.asOf },
    identity: {
      requestedUserId: args.sources.request.requestedUserId,
      ownerId: args.sources.context.ownerId,
      accountId: args.sources.request.accountId,
    },
    inputRefs: {
      inputSnapshotId: args.sources.request.inputSnapshotId,
      marketSnapshotId: args.sources.request.marketSnapshotId,
      mandateSnapshotId: args.sources.request.mandateSnapshotId,
      constructionModelSnapshotId: args.sources.request.constructionModelSnapshotId,
    },
    versions: args.sources.request.versions,
    hashes: {
      requestHash: args.sources.request.requestHash,
      finalDecisionHash: args.decision.finalDecisionHash,
      auditBundleHash: args.auditBundle.auditBundleHash,
    },
    newEngineDecision: args.decision,
    expectedComparisonDimensions: EXPECTED_COMPARISON_DIMENSIONS,
    legacyResult: null,
    comparison: {
      finalStateDifference: null,
      actionSetDifference: null,
      sideDifference: null,
      targetWeightDifference: null,
      targetQuantityDifference: null,
      notionalDifference: null,
      residualCashDifference: null,
      turnoverDifference: null,
      riskBeforeDifference: null,
      riskAfterDifference: null,
      estimatedCostDifference: null,
      liquidityDifference: null,
      taxAwarenessDifference: null,
      blockedDifference: null,
      degradedDifference: null,
      reasonCodeDifference: null,
      explainabilityCoverageDifference: null,
      missingLegacyFields: [],
      comparisonStatus: "awaiting_legacy_result",
    },
    status: "awaiting_legacy_result",
  };
  const result = { ...draft, shadowPackageHash: sha256(draft) } satisfies InvestingEngineShadowPackageV1;
  return freeze(result) as InvestingEngineShadowPackageV1;
}
