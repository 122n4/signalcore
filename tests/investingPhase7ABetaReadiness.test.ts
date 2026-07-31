import { describe, expect, it } from "vitest";

import { evaluateBetaReadiness } from
  "@/lib/investing/research/readiness/evaluator.server";
import {
  BETA_READINESS_GATE_IDS,
  BETA_READINESS_MANIFEST_VERSION,
} from "@/lib/investing/research/readiness";

const checkpoint = "83e6518bc6cf3d95d0320ebe6f240e1e3c39222f";
const manifest = () => ({
  contractVersion: BETA_READINESS_MANIFEST_VERSION,
  checkpoint,
  evaluatedAt: "2026-07-31T12:00:00.000Z",
  profile: { id: "investing-beta-gate", version: "v1" },
  evidence: BETA_READINESS_GATE_IDS.map((gateId) => ({
    gateId,
    state: "passed" as "passed" | "failed" | "unavailable",
    checkpoint,
    observedAt: "2026-07-31T10:00:00.000Z",
    validUntil: "2026-08-01T10:00:00.000Z",
    reference: `audit:${gateId}`,
  })),
});

describe("Phase 7A beta readiness contract", () => {
  it("produces one deterministic content-addressed beta-ready report", () => {
    const first = evaluateBetaReadiness(manifest());
    const second = evaluateBetaReadiness({
      ...manifest(),
      evidence: [...manifest().evidence].reverse(),
    });
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(first.value.state).toBe("beta_ready");
    expect(first.value.gates).toHaveLength(BETA_READINESS_GATE_IDS.length);
    expect(first.value.reportHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    ["failed", "evidence_failed"],
    ["unavailable", "evidence_unavailable"],
  ] as const)("fails closed for %s required evidence", (state, reason) => {
    const input = manifest();
    input.evidence[2] = { ...input.evidence[2], state };
    const result = evaluateBetaReadiness(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe("blocked");
    expect(result.value.gates[2]).toMatchObject({ state: "blocked", reason });
  });

  it("blocks stale evidence and evidence from another checkpoint", () => {
    const stale = manifest();
    stale.evidence[0] = { ...stale.evidence[0], validUntil: "2026-07-31T11:00:00.000Z" };
    const staleResult = evaluateBetaReadiness(stale);
    expect(staleResult.ok && staleResult.value.gates[0].reason).toBe("evidence_stale");

    const mismatch = manifest();
    mismatch.evidence[1] = { ...mismatch.evidence[1], checkpoint: "a".repeat(40) };
    const mismatchResult = evaluateBetaReadiness(mismatch);
    expect(mismatchResult.ok && mismatchResult.value.gates[1].reason)
      .toBe("evidence_checkpoint_mismatch");
  });

  it("rejects missing, duplicate, unknown and accessor evidence", () => {
    const missing = manifest();
    missing.evidence.pop();
    expect(evaluateBetaReadiness(missing)).toEqual({
      ok: false,
      reason: "beta_readiness_manifest_invalid",
    });
    const duplicate = manifest();
    duplicate.evidence[1] = { ...duplicate.evidence[0] };
    expect(evaluateBetaReadiness(duplicate).ok).toBe(false);
    const unknown = { ...manifest(), surprise: true };
    expect(evaluateBetaReadiness(unknown).ok).toBe(false);
    const accessor = manifest() as Record<string, unknown>;
    Object.defineProperty(accessor, "checkpoint", { enumerable: true, get: () => checkpoint });
    expect(() => evaluateBetaReadiness(accessor)).not.toThrow();
    expect(evaluateBetaReadiness(accessor).ok).toBe(false);
  });

  it.each([null, undefined, 1, "x", [], new Date(), Symbol("x"), Object.create({ x: 1 })])
  ("rejects adversarial input without throwing", (value) => {
    expect(() => evaluateBetaReadiness(value)).not.toThrow();
    expect(evaluateBetaReadiness(value).ok).toBe(false);
  });
});
