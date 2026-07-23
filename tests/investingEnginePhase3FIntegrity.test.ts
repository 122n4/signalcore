import { describe, expect, it } from "vitest";

import {
  FINAL_RUN_CONTEXT_VERSION,
  assertInvestingEngineResultV1Final,
  runInvestingEngineV1Final,
  sealInvestingEngineRunContextV1,
  sealInvestingEngineRunRequestV1,
  sha256,
} from "@/lib/investing/engine/v1/phase3f";
import {
  PHASE3F_AS_OF,
  buildPhase3FSources,
  resealPhase3FRequest,
  withResealedRequest,
} from "@/tests/fixtures/investingEnginePhase3FFixture";

describe("FASE 3F integrity and cross-phase coherence", () => {
  it("rejects a tampered phase hash", () => {
    const sources = buildPhase3FSources();
    expect(() => runInvestingEngineV1Final({
      ...sources,
      risk: { ...sources.risk, assessmentHash: "0".repeat(64) },
    })).toThrow("cross_phase_hash_mismatch");
  });

  it("rejects a valid request hash with incompatible ACTUAL content", () => {
    const sources = buildPhase3FSources();
    const changed = withResealedRequest(sources, {
      portfolioState: {
        ...sources.portfolioState,
        actual: {
          ...sources.portfolioState.actual,
          canonical: { ...sources.portfolioState.actual.canonical, stateVersion: "incompatible-state/v1" },
        },
      },
    });
    expect(() => runInvestingEngineV1Final(changed)).toThrow("cross_phase_actual_mismatch");
  });

  it("rejects version mismatch", () => {
    const sources = buildPhase3FSources();
    const request = resealPhase3FRequest(sources, {
      versions: { ...sources.request.versions, engineVersion: "incompatible-engine/v9" },
    });
    expect(() => runInvestingEngineV1Final({ ...sources, request })).toThrow("cross_phase_version_mismatch");
  });

  it.each([
    ["ownership", { ownerId: "other_user", expectedUserId: "user_phase3f_1", expectedAccountId: "account_phase3f_1" }, "cross_phase_identity_mismatch"],
    ["account", { ownerId: "user_phase3f_1", expectedUserId: "user_phase3f_1", expectedAccountId: "other_account" }, "cross_phase_account_mismatch"],
  ])("rejects %s divergence", (_name, identity, expected) => {
    const sources = buildPhase3FSources();
    const context = sealInvestingEngineRunContextV1({
      contractVersion: FINAL_RUN_CONTEXT_VERSION,
      accountMode: "paper",
      ...identity,
    });
    const request = resealPhase3FRequest({ ...sources, context });
    expect(() => runInvestingEngineV1Final({ ...sources, context, request })).toThrow(expected);
  });

  it("rejects non-Paper and Live contexts at the sealing boundary", () => {
    expect(() => sealInvestingEngineRunContextV1({
      contractVersion: FINAL_RUN_CONTEXT_VERSION,
      ownerId: "user_phase3f_1",
      expectedUserId: "user_phase3f_1",
      expectedAccountId: "account_phase3f_1",
      accountMode: "live" as never,
    })).toThrow("final_context_invalid");
    expect(() => sealInvestingEngineRunContextV1({
      contractVersion: FINAL_RUN_CONTEXT_VERSION,
      ownerId: "user_phase3f_1",
      expectedUserId: "user_phase3f_1",
      expectedAccountId: "account_phase3f_1",
      accountMode: "simulation" as never,
    })).toThrow("final_context_invalid");
  });

  it.each([
    ["run", { runId: "other_run" }, "cross_run_snapshot_mismatch"],
    ["input", { inputSnapshotId: "other_input" }, "cross_phase_input_snapshot_mismatch"],
    ["market", { marketSnapshotId: "other_market" }, "cross_phase_market_snapshot_mismatch"],
    ["mandate", { mandateSnapshotId: "other_mandate" }, "cross_phase_mandate_snapshot_mismatch"],
    ["asOf", { asOf: "2026-07-21T10:00:00.000Z" }, "cross_phase_asof_mismatch"],
  ])("rejects %s snapshot/run mismatch", (_name, overrides, expected) => {
    const sources = buildPhase3FSources();
    const request = resealPhase3FRequest(sources, overrides);
    expect(() => runInvestingEngineV1Final({ ...sources, request })).toThrow(expected);
  });

  it("rejects a construction-model hash mismatch", () => {
    const sources = buildPhase3FSources();
    const { requestHash: _requestHash, ...requestDraft } = sources.request;
    void _requestHash;
    const request = sealInvestingEngineRunRequestV1({
      ...requestDraft,
      sourceHashes: { ...requestDraft.sourceHashes, constructionModelHash: "f".repeat(64) },
    });
    expect(() => runInvestingEngineV1Final({ ...sources, request })).toThrow("cross_phase_hash_mismatch");
  });

  it("rejects mixed selected-candidate content even with a recomputed proposal hash", () => {
    const sources = buildPhase3FSources();
    const proposalDraft = { ...sources.preliminaryProposal, selectedCandidateId: "candidate:other-run" };
    const { proposalHash: _proposalHash, ...withoutHash } = proposalDraft;
    void _proposalHash;
    const preliminaryProposal = { ...withoutHash, proposalHash: sha256(withoutHash) };
    const changed = withResealedRequest(sources, { preliminaryProposal });
    expect(() => runInvestingEngineV1Final(changed)).toThrow("selected_candidate_integrity_failed");
  });

  it("detects final-result and evidence tampering", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    expect(() => assertInvestingEngineResultV1Final({ ...result, finalResultHash: "0".repeat(64) })).toThrow("final_result_integrity_failed");
    expect(result.decision.reasons.every((reason) => reason.evidenceHash === sha256({
      code: reason.code,
      phaseSource: reason.phaseSource,
      severity: reason.severity,
      consequence: reason.consequence,
    }))).toBe(true);
  });

  it("rejects invalid and ambiguous timestamps", () => {
    const sources = buildPhase3FSources();
    const { requestHash: _requestHash, ...draft } = sources.request;
    void _requestHash;
    expect(() => sealInvestingEngineRunRequestV1({ ...draft, asOf: "2026-07-20 10:00:00" })).toThrow("final_timestamp_invalid");
    expect(sources.request.asOf).toBe(PHASE3F_AS_OF);
  });
});
