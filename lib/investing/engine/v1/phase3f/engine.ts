import {
  FINAL_RESULT_VERSION,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEngineResultV1Final,
} from "@/lib/investing/engine/v1/phase3f/types";
import { freeze, sha256 } from "@/lib/investing/engine/v1/phase3f/primitives";
import { buildInvestingEngineDecisionV1, buildPhaseSummariesV1 } from "@/lib/investing/engine/v1/phase3f/orchestration";
import { buildInvestingEngineAuditBundleV1 } from "@/lib/investing/engine/v1/phase3f/auditBundle";
import { buildInvestingEngineShadowPackageV1 } from "@/lib/investing/engine/v1/phase3f/shadowPackage";
import { assertInvestingEngineResultV1Final } from "@/lib/investing/engine/v1/phase3f/validation";

export function runInvestingEngineV1Final(sources: InvestingEnginePhase3FSourcesV1): InvestingEngineResultV1Final {
  const decision = buildInvestingEngineDecisionV1(sources);
  const phaseSummaries = buildPhaseSummariesV1({
    sources,
    finalState: decision.state,
    finalOutputHash: decision.finalDecisionHash,
    reasonCodes: decision.reasonCodes,
  });
  const auditBundle = buildInvestingEngineAuditBundleV1({ sources, decision, phaseSummaries });
  const shadowPackage = buildInvestingEngineShadowPackageV1({ sources, decision, auditBundle });
  const draft: Omit<InvestingEngineResultV1Final, "finalResultHash"> = {
    contractVersion: FINAL_RESULT_VERSION,
    runId: sources.request.runId,
    requestedUserId: sources.request.requestedUserId,
    ownerId: sources.context.ownerId,
    accountId: sources.request.accountId,
    accountMode: "paper",
    asOf: sources.request.asOf,
    inputSnapshotId: sources.request.inputSnapshotId,
    marketSnapshotId: sources.request.marketSnapshotId,
    mandateSnapshotId: sources.request.mandateSnapshotId,
    constructionModelSnapshotId: sources.request.constructionModelSnapshotId,
    versions: sources.request.versions,
    hashes: {
      requestHash: sources.request.requestHash,
      canonicalInputHash: sources.canonicalInput.inputHash,
      portfolioStateDerivationHash: sources.request.sourceHashes.portfolioStateDerivationHash,
      riskAssessmentHash: sources.risk.assessmentHash,
      policyEvaluationHash: sources.policy.policyHash,
      constraintEvaluationHash: sources.request.sourceHashes.constraintEvaluationHash,
      feasibleDecisionEnvelopeHash: sources.envelope.envelopeHash,
      constructionModelHash: sources.constructionModel.snapshotHash,
      preliminaryProposalHash: sources.preliminaryProposal.proposalHash,
      finalDecisionHash: decision.finalDecisionHash,
      auditBundleHash: auditBundle.auditBundleHash,
      shadowPackageHash: shadowPackage.shadowPackageHash,
    },
    state: decision.state,
    quality: decision.quality,
    confidence: decision.confidence,
    executable: false,
    selectedCandidateId: decision.selectedCandidateId,
    selectedCandidateMode: decision.selectedCandidateMode,
    proposal: decision.proposal,
    actions: decision.actions,
    targetPortfolio: decision.targetPortfolio,
    residualCash: decision.residualCash,
    turnover: decision.turnover,
    riskBefore: decision.riskBefore,
    projectedRiskAfter: decision.projectedRiskAfter,
    hardConstraints: decision.hardConstraints,
    softConstraints: decision.softConstraints,
    costs: decision.costs,
    liquidity: decision.liquidity,
    taxAwareness: decision.taxAwareness,
    warnings: decision.warnings,
    blockers: decision.blockers,
    reasonCodes: decision.reasonCodes,
    explanation: decision.explanation,
    phaseSummaries,
    decision,
    auditBundle,
    shadowPackage,
  };
  const result = { ...draft, finalResultHash: sha256(draft) } satisfies InvestingEngineResultV1Final;
  assertInvestingEngineResultV1Final(result);
  return freeze(result) as InvestingEngineResultV1Final;
}
