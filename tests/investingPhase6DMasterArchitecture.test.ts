import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENTS,
  CANONICAL_FLOWS,
  FUTURE_TOPOLOGY,
  PHASE6_IMPLEMENTATION_ORDER,
  RESEARCH_DATA_STRATEGY,
  TRUST_BOUNDARIES,
  validateArchitectureFlows,
  validateArchitectureGraph,
  validateTrustBoundaries,
} from "@/lib/investing/research/architecture";

describe("Investing Phase 6D master architecture", () => {
  it("declares unique, owned, acyclic contexts with no Trading", () => {
    expect(validateArchitectureGraph(ARCHITECTURE_COMPONENTS).ok).toBe(true);
    expect(new Set(ARCHITECTURE_COMPONENTS.map(({ id }) => id))).toHaveLength(ARCHITECTURE_COMPONENTS.length);
    expect(JSON.stringify(ARCHITECTURE_COMPONENTS).toLowerCase()).not.toContain("lib/trading");
    expect(ARCHITECTURE_COMPONENTS.every(({ responsibility, runtimeOwner }) => responsibility && runtimeOwner)).toBe(true);
    expect(ARCHITECTURE_COMPONENTS.find(({ id }) => id === "trading-external-forbidden")?.status).toBe("forbidden");
  });

  it("rejects missing, cyclic and forbidden dependencies", () => {
    const base = ARCHITECTURE_COMPONENTS[0];
    expect(validateArchitectureGraph([{ ...base, dependencies: ["missing"] }]).ok).toBe(false);
    expect(validateArchitectureGraph([
      { ...base, id: "a", dependencies: ["b"] },
      { ...base, id: "b", dependencies: ["a"] },
    ]).ok).toBe(false);
    const runtime = ARCHITECTURE_COMPONENTS.find(({ id }) => id === "research-runtime")!;
    expect(validateArchitectureGraph([
      ...ARCHITECTURE_COMPONENTS.filter(({ id }) => id !== runtime.id),
      { ...runtime, dependencies: [...runtime.dependencies, "investing-engine"] },
    ]).ok).toBe(false);
    expect(() => validateArchitectureGraph(null)).not.toThrow();
    expect(validateArchitectureGraph(null).ok).toBe(false);
    const trading = ARCHITECTURE_COMPONENTS.find(({ id }) =>
      id === "trading-external-forbidden")!;
    expect(validateArchitectureGraph(ARCHITECTURE_COMPONENTS.map((item) =>
      item.id === runtime.id
        ? { ...item, dependencies: [...item.dependencies, trading.id] }
        : item)).ok).toBe(false);
    const broker = {
      ...runtime, id: "future-broker-adversarial", context: "broker",
      dependencies: [], status: "planned" as const,
    };
    expect(validateArchitectureGraph([
      ...ARCHITECTURE_COMPONENTS.map((item) => item.id === runtime.id
        ? { ...item, dependencies: [...item.dependencies, broker.id] } : item),
      broker,
    ]).ok).toBe(false);
    let invoked = 0;
    const getter = Object.defineProperty({ ...runtime }, "dependencies", {
      enumerable: true, get() { invoked += 1; return []; },
    });
    expect(validateArchitectureGraph([getter]).ok).toBe(false);
    expect(invoked).toBe(0);
  });

  it("keeps data, runtime, OPS and UI/control-plane writes isolated", () => {
    const byId = new Map(ARCHITECTURE_COMPONENTS.map((item) => [item.id, item]));
    expect(byId.get("data-acquisition-agent")?.dependencies).not.toContain("promotion-boundary");
    expect(byId.get("data-acquisition-agent")?.writesForbidden).toEqual(expect.arrayContaining(["orders", "positions", "accounting"]));
    expect(byId.get("ops-observability")?.writesForbidden).toContain("scientific-decisions");
    expect(byId.get("product-control-plane")?.dependencies).not.toContain("data-acquisition-agent");
  });

  it("models selective acquisition and research-ready as a distinct state", () => {
    expect(RESEARCH_DATA_STRATEGY.fullUniverseMirror).toBe(false);
    expect(RESEARCH_DATA_STRATEGY.mode).toBe("selective_on_demand");
    expect(RESEARCH_DATA_STRATEGY.requestSeparation).toEqual([
      "research_request", "dataset_requirement", "acquisition_request",
    ]);
    expect(RESEARCH_DATA_STRATEGY.lifecycle).toEqual(expect.arrayContaining([
      "provider_unavailable", "invalid", "valid_not_research_ready", "research_ready",
    ]));
  });

  it("declares complete canonical flows and trust boundaries", () => {
    expect(CANONICAL_FLOWS).toHaveLength(19);
    expect(validateArchitectureFlows(CANONICAL_FLOWS).ok).toBe(true);
    expect(validateTrustBoundaries(TRUST_BOUNDARIES).ok).toBe(true);
    expect(CANONICAL_FLOWS.every(({ steps, terminalState }) => steps.length > 0 && terminalState)).toBe(true);
    const provider = TRUST_BOUNDARIES.find(({ id }) => id === "provider-adapters");
    expect(provider?.allowedSecret).toBe("delegated-provider-auth");
    expect(TRUST_BOUNDARIES.filter(({ allowedSecret }) => allowedSecret === "provider-credentials")).toHaveLength(1);
    const badFlow = {
      ...CANONICAL_FLOWS[0], trigger: "", input: "", output: "",
      preconditions: [], failureStates: [], retryBoundary: "",
      idempotencyBoundary: "", futureTransactionBoundary: "", artifacts: [],
      forbiddenOperations: ["safe", "safe2", "safe3", "safe4", "safe5", "safe6"],
    };
    expect(validateArchitectureFlows([badFlow])).toMatchObject({ ok: false });
    const browserWithSecret = TRUST_BOUNDARIES.map((boundary) =>
      boundary.id === "browser-client"
        ? { ...boundary, allowedSecret: "provider-credentials" } : boundary);
    expect(validateTrustBoundaries(browserWithSecret).ok).toBe(false);
    const runtimeWithSecret = TRUST_BOUNDARIES.map((boundary) =>
      boundary.id === "investing-research-runtime"
        ? { ...boundary, allowedSecret: "provider-credentials" } : boundary);
    expect(validateTrustBoundaries(runtimeWithSecret).ok).toBe(false);
    expect(validateTrustBoundaries(TRUST_BOUNDARIES).ok).toBe(true);
  });

  it("freezes topology and Phase 6 order without creating processes", () => {
    expect(FUTURE_TOPOLOGY.map(({ process }) => process)).toEqual([
      "syntrake-control-plane", "investing-research-runtime", "investing-data-agent",
    ]);
    expect(PHASE6_IMPLEMENTATION_ORDER).toEqual([
      "6E", "6F", "6G", "6H", "6I", "6J", "6K", "6L", "6M", "6N",
    ]);
  });
});
