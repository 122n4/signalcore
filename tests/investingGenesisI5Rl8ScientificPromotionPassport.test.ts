import { describe, expect, it } from "vitest";
import { reconstructScientificPromotionProjectionV1 } from "../lib/investing/research/scientificPromotionPassport";

const ref = (domain: string, hashHex: string) => ({ hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
const gateOutcomes = [{ gateId: "GATE_RL7_ROBUSTNESS_COMPARISON", status: "PASS", reasons: [], evidence: [] }] as any;

function row(id: string, fields: Record<string, unknown> = {}) {
  return {
    scientific_promotion_transition_id: id,
    scientific_promotion_protocol_identity_id: "p",
    tenant_id: "tenant",
    research_investigation_id: "investigation",
    hash_algorithm: "SHA-256",
    hash_domain: "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
    hash_version: "SYNTRAKE_SHA256_V1",
    hash_hex: id.padStart(64, "A").slice(0, 64),
    protocol_hash_hex: "B".repeat(64),
    chain_key: "C".repeat(64),
    root_transition_id: "root",
    predecessor_transition_id: null,
    predecessor_state: null,
    resulting_state: "PROMOTION_ELIGIBLE",
    gate_outcomes: gateOutcomes,
    evidence_hash_refs: [ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "D".repeat(64))],
    transition_reasons: [],
    superseded_by_successor_protocol_hash_hex: null,
    superseded_by_successor_root_transition_id: null,
    superseded_by_successor_root_hash_hex: null,
    created_at: `2026-09-28T00:00:0${id.length}Z`,
    ...fields,
  } as any;
}

describe("I5 RL-8 Scientific Promotion Passport projection", () => {
  it("reconstructs deterministic root to leaf state", () => {
    const projection = reconstructScientificPromotionProjectionV1([
      row("root", { resulting_state: "VALIDATION_PASSED" }),
      row("leaf", { predecessor_transition_id: "root", predecessor_state: "VALIDATION_PASSED", resulting_state: "PROMOTION_ELIGIBLE", root_transition_id: "root", hash_hex: "E".repeat(64) }),
    ]);
    expect(projection.availability).toBe("MATERIALIZED");
    if (projection.availability === "MATERIALIZED") {
      expect(projection.currentState).toBe("PROMOTION_ELIGIBLE");
      expect(projection.latestTransition.hashHex).toBe("E".repeat(64));
      expect(projection.transitions.map((transition) => transition.scientificPromotionTransitionId)).toEqual(["root", "leaf"]);
    }
  });

  it("fails closed when one predecessor has divergent successors", () => {
    expect(() => reconstructScientificPromotionProjectionV1([
      row("root"),
      row("a", { predecessor_transition_id: "root", predecessor_state: "PROMOTION_ELIGIBLE" }),
      row("b", { predecessor_transition_id: "root", predecessor_state: "PROMOTION_ELIGIBLE" }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");
  });

  it("follows explicit cross-chain supersession and rejects cycles/self-supersession", () => {
    const projection = reconstructScientificPromotionProjectionV1([
      row("oldroot", { chain_key: "1".repeat(64), root_transition_id: "oldroot", resulting_state: "PROMOTION_ELIGIBLE" }),
      row("oldleaf", {
        chain_key: "1".repeat(64),
        root_transition_id: "oldroot",
        predecessor_transition_id: "oldroot",
        predecessor_state: "PROMOTION_ELIGIBLE",
        resulting_state: "SUPERSEDED",
        superseded_by_successor_protocol_hash_hex: "2".repeat(64),
        superseded_by_successor_root_transition_id: "newroot",
        superseded_by_successor_root_hash_hex: "3".repeat(64),
      }),
      row("newroot", { chain_key: "2".repeat(64), root_transition_id: "newroot", protocol_hash_hex: "2".repeat(64), resulting_state: "PROMOTION_ELIGIBLE", hash_hex: "3".repeat(64) }),
    ]);
    expect(projection.availability).toBe("MATERIALIZED");
    if (projection.availability === "MATERIALIZED") expect(projection.transitions.map((transition) => transition.scientificPromotionTransitionId)).toEqual(["oldroot", "oldleaf", "newroot"]);

    expect(() => reconstructScientificPromotionProjectionV1([
      row("oldroot", { chain_key: "1".repeat(64), resulting_state: "SUPERSEDED", superseded_by_successor_root_transition_id: "oldroot" }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");
  });

  it("fails closed on multiple unlinked valid chains because Passport has no caller-selected chain preference", () => {
    expect(() => reconstructScientificPromotionProjectionV1([
      row("root-a", { chain_key: "1".repeat(64), root_transition_id: "root-a" }),
      row("root-b", { chain_key: "2".repeat(64), root_transition_id: "root-b", hash_hex: "2".repeat(64) }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");
  });

  it("validates predecessor state, root membership and cross-chain successor protocol/hash", () => {
    expect(() => reconstructScientificPromotionProjectionV1([
      row("root", { resulting_state: "VALIDATION_PASSED" }),
      row("leaf", { predecessor_transition_id: "root", predecessor_state: "EXECUTED", resulting_state: "PROMOTION_ELIGIBLE", root_transition_id: "root" }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");

    expect(() => reconstructScientificPromotionProjectionV1([
      row("root", { chain_key: "1".repeat(64), root_transition_id: "root" }),
      row("leaf", { chain_key: "1".repeat(64), predecessor_transition_id: "root", predecessor_state: "PROMOTION_ELIGIBLE", root_transition_id: "missing" }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");

    expect(() => reconstructScientificPromotionProjectionV1([
      row("oldroot", { chain_key: "1".repeat(64), root_transition_id: "oldroot", resulting_state: "PROMOTION_ELIGIBLE" }),
      row("oldleaf", {
        chain_key: "1".repeat(64),
        root_transition_id: "oldroot",
        predecessor_transition_id: "oldroot",
        predecessor_state: "PROMOTION_ELIGIBLE",
        resulting_state: "SUPERSEDED",
        superseded_by_successor_protocol_hash_hex: "9".repeat(64),
        superseded_by_successor_root_transition_id: "newroot",
        superseded_by_successor_root_hash_hex: "3".repeat(64),
      }),
      row("newroot", { chain_key: "2".repeat(64), root_transition_id: "newroot", resulting_state: "PROMOTION_ELIGIBLE", hash_hex: "3".repeat(64) }),
    ])).toThrow("DIVERGENT_EXISTING_IDENTITY");
  });
});
