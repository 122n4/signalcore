import { runInvestingEngineV1Final, type InvestingEnginePhase3FSourcesV1 } from "@/lib/investing/engine/v1/phase3f";
import type {
  CanonicalObjectV1,
  InvestingEngineLoadedPersistenceV1,
  InvestingEnginePersistenceInputV1,
  InvestingEnginePersistencePreparedV1,
  InvestingEnginePersistedRunRowV1,
} from "@/lib/investing/engine/v1/persistence";
import { buildPhase3FSources, type Phase3FFixtureArgs } from "@/tests/fixtures/investingEnginePhase3FFixture";

export const PHASE4B_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

export function buildPhase4BInput(args: Phase3FFixtureArgs & { idempotencyKey?: string } = {}) {
  const sources = buildPhase3FSources({ accountId: PHASE4B_ACCOUNT_ID, ...args });
  const finalResult = runInvestingEngineV1Final(sources);
  const input: InvestingEnginePersistenceInputV1 = {
    idempotencyKey: args.idempotencyKey ?? "phase4b-idempotency-1",
    request: sources.request as unknown as CanonicalObjectV1,
    context: sources.context as unknown as CanonicalObjectV1,
    canonicalInput: sources.canonicalInput as unknown as CanonicalObjectV1,
    portfolioStateDerivation: sources.portfolioState as unknown as CanonicalObjectV1,
    riskAssessment: sources.risk as unknown as CanonicalObjectV1,
    policyEvaluation: sources.policy as unknown as CanonicalObjectV1,
    constraintEvaluations: sources.constraints as unknown as readonly CanonicalObjectV1[],
    feasibleDecisionEnvelope: sources.envelope as unknown as CanonicalObjectV1,
    constructionModel: sources.constructionModel as unknown as CanonicalObjectV1,
    preliminaryProposal: sources.preliminaryProposal as unknown as CanonicalObjectV1,
    finalDecision: finalResult.decision as unknown as CanonicalObjectV1,
    explanation: finalResult.explanation as unknown as CanonicalObjectV1,
    auditBundle: finalResult.auditBundle as unknown as CanonicalObjectV1,
    shadowPackage: finalResult.shadowPackage as unknown as CanonicalObjectV1,
    finalResult: finalResult as unknown as CanonicalObjectV1,
    phaseSummaries: finalResult.phaseSummaries as unknown as readonly CanonicalObjectV1[],
    reasonEvidence: finalResult.decision.reasons as unknown as readonly CanonicalObjectV1[],
  };
  return { sources, finalResult, input };
}

export function loadedFromPrepared(prepared: InvestingEnginePersistencePreparedV1, txid = "7001"): InvestingEngineLoadedPersistenceV1 {
  const m = prepared.manifest;
  const final = prepared.source.finalResult;
  const hashes = Object.fromEntries(m.artifactHashes.map((entry) => [entry.artifactType, entry.contentHash])) as InvestingEnginePersistedRunRowV1["hashes"];
  const run: InvestingEnginePersistedRunRowV1 = {
    identity: m.identity, versions: m.versions, state: m.state, quality: m.quality,
    confidence: final.confidence as InvestingEnginePersistedRunRowV1["confidence"],
    executable: false, source: "investing_engine_v1_phase3f", idempotencyScope: m.idempotency.scope,
    idempotencyKey: m.idempotency.key, requestHash: m.requestHash, hashes,
    selectedCandidateId: final.selectedCandidateId as string | null,
    manifestVersion: m.contractVersion,
    persistenceTxid: txid,
  };
  return {
    run,
    artifacts: prepared.artifacts.map((artifact) => ({ ...artifact, persistenceTxid: txid })),
    phaseSummaries: prepared.phaseSummaries.map((summary) => ({ ...summary, persistenceTxid: txid })),
    reasonEvidence: prepared.reasonEvidence.map((reason) => ({ ...reason, persistenceTxid: txid })),
    shadowPackage: {
      ...prepared.shadowMetadata, persistenceTxid: txid,
    },
    claims: prepared.claims.map((claim) => ({ ...claim, persistenceTxid: txid })),
  };
}

export const purePhase3FRunnerForPersistence = (sources: Readonly<Record<string, unknown>>) =>
  runInvestingEngineV1Final(sources as unknown as InvestingEnginePhase3FSourcesV1) as unknown as CanonicalObjectV1;
