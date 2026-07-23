import {
  FINAL_AUDIT_BUNDLE_VERSION,
  type InvestingEngineAuditBundleV1,
  type InvestingEngineDecisionV1,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEnginePhaseSummaryV1,
} from "@/lib/investing/engine/v1/phase3f/types";
import { canonicalStringify, freeze, hashSetSemanticSnapshot, sha256 } from "@/lib/investing/engine/v1/phase3f/primitives";

export function buildInvestingEngineAuditBundleV1(args: {
  sources: InvestingEnginePhase3FSourcesV1;
  decision: InvestingEngineDecisionV1;
  phaseSummaries: readonly InvestingEnginePhaseSummaryV1[];
}): InvestingEngineAuditBundleV1 {
  const selected = args.decision.selectedCandidateId === null
    ? null
    : args.sources.preliminaryProposal.candidates.find(
      (candidate) => candidate.candidateId === args.decision.selectedCandidateId,
    ) ?? null;
  const rejected = args.sources.preliminaryProposal.candidates.filter(
    (candidate) => candidate.candidateId !== selected?.candidateId,
  );
  const ranking = [
    ...(selected ? [selected.candidateId] : []),
    ...rejected.map((candidate) => candidate.candidateId),
  ];
  const draft: Omit<InvestingEngineAuditBundleV1, "auditBundleHash"> = {
    contractVersion: FINAL_AUDIT_BUNDLE_VERSION,
    request: args.sources.request,
    requestHash: args.sources.request.requestHash,
    versions: args.sources.request.versions,
    identitySummary: {
      requestedUserId: args.sources.request.requestedUserId,
      ownerId: args.sources.context.ownerId,
      accountId: args.sources.request.accountId,
    },
    accountSummary: { accountMode: "paper", executable: false },
    snapshotHashes: args.sources.request.sourceHashes,
    canonicalInputSummary: {
      inputHash: args.sources.canonicalInput.inputHash,
      quality: args.sources.canonicalInput.quality.status,
      confidence: args.sources.canonicalInput.confidence,
    },
    portfolioStateSummary: {
      derivationHash: args.sources.request.sourceHashes.portfolioStateDerivationHash,
      actualHash: hashSetSemanticSnapshot(args.sources.portfolioState.actual),
      reservedHash: hashSetSemanticSnapshot(args.sources.portfolioState.reserved),
      projectedHash: hashSetSemanticSnapshot(args.sources.portfolioState.projected),
    },
    riskSummary: args.sources.risk,
    policySummary: args.sources.policy,
    constraintsSummary: [...args.sources.constraints]
      .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right))),
    feasibleEnvelopeSummary: args.sources.envelope,
    constructionCandidates: args.sources.preliminaryProposal.candidates,
    candidateRanking: ranking,
    selectedCandidate: selected,
    rejectedCandidates: rejected,
    targetPortfolio: args.decision.targetPortfolio,
    finalActions: args.decision.actions,
    costSummary: args.decision.costs,
    liquiditySummary: args.decision.liquidity,
    taxAwarenessSummary: args.decision.taxAwareness,
    phaseSummaries: args.phaseSummaries,
    explanation: args.decision.explanation,
    finalState: args.decision.state,
    warnings: args.decision.warnings,
    blockers: args.decision.blockers,
    reasonCodes: args.decision.reasonCodes,
    finalDecisionHash: args.decision.finalDecisionHash,
    executable: false,
  };
  const result = { ...draft, auditBundleHash: sha256(draft) } satisfies InvestingEngineAuditBundleV1;
  return freeze(result) as InvestingEngineAuditBundleV1;
}
