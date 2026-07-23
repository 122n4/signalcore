import type {
  CanonicalObjectV1,
  InvestingEngineReplayResultV1,
  PureInvestingEngineRunnerV1,
} from "@/lib/investing/engine/v1/persistence/contracts";
import { canonicalEqualV1, canonicalPersistenceSha256V1 } from "@/lib/investing/engine/v1/persistence/canonical";
import { errorCodeOf } from "@/lib/investing/engine/v1/persistence/errors";
import { InvestingEnginePersistenceReaderV1 } from "@/lib/investing/engine/v1/persistence/reader";
import type { InvestingEngineRunScopeV1 } from "@/lib/investing/engine/v1/persistence/repositoryPort";

function object(value: unknown): CanonicalObjectV1 {
  return value as CanonicalObjectV1;
}

function mismatchPaths(left: unknown, right: unknown, path = "$", result: string[] = []): readonly string[] {
  if (canonicalEqualV1(left, right)) return result;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) result.push(`${path}.length`);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) mismatchPaths(left[index], right[index], `${path}[${index}]`, result);
    return result;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left as object), ...Object.keys(right as object)])].sort();
    for (const key of keys) mismatchPaths((left as CanonicalObjectV1)[key], (right as CanonicalObjectV1)[key], `${path}.${key}`, result);
    return result;
  }
  result.push(path);
  return result;
}

export class InvestingEngineReplayServiceV1 {
  constructor(
    private readonly reader: InvestingEnginePersistenceReaderV1,
    private readonly pureRunner: PureInvestingEngineRunnerV1,
  ) {}

  async replay(selector: InvestingEngineRunScopeV1): Promise<InvestingEngineReplayResultV1> {
    try {
      const verified = await this.reader.loadByRunId(selector);
      const artifacts = verified.parsedArtifacts;
      const audit = artifacts.audit_bundle;
      const request = object(audit.request);
      const contextDraft = {
        contractVersion: "investing-engine-run-context/v1",
        ownerId: verified.loaded.run.identity.ownerId,
        expectedUserId: verified.loaded.run.identity.requestedUserId,
        expectedAccountId: verified.loaded.run.identity.accountId,
        accountMode: "paper",
      } as const;
      const context = { ...contextDraft, contextHash: canonicalPersistenceSha256V1(contextDraft) };
      const constraints = artifacts.constraint_evaluation.items as readonly CanonicalObjectV1[];
      const sources = {
        request, context,
        canonicalInput: artifacts.canonical_input,
        portfolioState: artifacts.portfolio_state_derivation,
        risk: artifacts.risk_assessment,
        policy: artifacts.policy_evaluation,
        constraints,
        envelope: artifacts.feasible_decision_envelope,
        constructionModel: artifacts.construction_model,
        preliminaryProposal: artifacts.preliminary_proposal,
      };
      const replayed = this.pureRunner(sources);
      const persisted = artifacts.final_result;
      const paths = mismatchPaths(persisted, replayed);
      const matches = paths.length === 0;
      return {
        status: matches ? "replay_match" : "replay_mismatch",
        runId: selector.runId, ownerId: selector.ownerId, accountId: selector.accountId, manifestHash: verified.manifest.manifestHash,
        persistedFinalResultHash: String(persisted.finalResultHash),
        replayedFinalResultHash: typeof replayed.finalResultHash === "string" ? replayed.finalResultHash : null,
        mismatchPaths: paths, errorCode: matches ? null : "persistence_replay_mismatch", writes: "none",
      };
    } catch (error) {
      return {
        status: "replay_blocked_by_integrity_error", runId: selector.runId, ownerId: selector.ownerId, accountId: selector.accountId, manifestHash: null,
        persistedFinalResultHash: null, replayedFinalResultHash: null, mismatchPaths: [], errorCode: errorCodeOf(error), writes: "none",
      };
    }
  }
}
