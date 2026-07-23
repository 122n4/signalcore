import { describe, expect, it } from "vitest";

import {
  canonicalStringify,
  runInvestingEngineV1Final,
} from "@/lib/investing/engine/v1/phase3f";
import {
  buildPhase3FSources,
  phase3fPosition,
  withResealedRequest,
} from "@/tests/fixtures/investingEnginePhase3FFixture";

describe("FASE 3F determinism, replay and stable hashes", () => {
  it("produces byte-equivalent output for the same sealed sources", () => {
    const sources = buildPhase3FSources();
    const first = runInvestingEngineV1Final(sources);
    const second = runInvestingEngineV1Final(sources);
    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(first.finalResultHash).toBe(second.finalResultHash);
    expect(first.explanation.explanationHash).toBe(second.explanation.explanationHash);
  });

  it("produces stable audit and shadow hashes on replay", () => {
    const first = runInvestingEngineV1Final(buildPhase3FSources());
    const second = runInvestingEngineV1Final(buildPhase3FSources());
    expect(first.auditBundle.auditBundleHash).toBe(second.auditBundle.auditBundleHash);
    expect(first.shadowPackage.shadowPackageHash).toBe(second.shadowPackage.shadowPackageHash);
    expect(first.shadowPackage.status).toBe("awaiting_legacy_result");
  });

  it("changes final hashes after a material financial change", () => {
    const first = runInvestingEngineV1Final(buildPhase3FSources({ cash: "1000" }));
    const changed = runInvestingEngineV1Final(buildPhase3FSources({ cash: "2000" }));
    expect(changed.hashes.canonicalInputHash).not.toBe(first.hashes.canonicalInputHash);
    expect(changed.finalResultHash).not.toBe(first.finalResultHash);
    expect(changed.hashes.finalDecisionHash).not.toBe(first.hashes.finalDecisionHash);
  });

  it("is invariant to raw financial row order", () => {
    const positions = [
      phase3fPosition({ symbol: "VWCE", currency: "USD", quantity: "1" }),
      phase3fPosition({ symbol: "AGGH", currency: "EUR", quantity: "2" }),
    ];
    const first = runInvestingEngineV1Final(buildPhase3FSources({ cash: "800", positions }));
    const second = runInvestingEngineV1Final(buildPhase3FSources({ cash: "800", positions: [...positions].reverse() }));
    expect(second.finalResultHash).toBe(first.finalResultHash);
    expect(canonicalStringify(second)).toBe(canonicalStringify(first));
  });

  it("is invariant to set-semantic RESERVED and constraint row order", () => {
    const sources = buildPhase3FSources();
    const changed = withResealedRequest(sources, {
      portfolioState: {
        ...sources.portfolioState,
        reserved: {
          ...sources.portfolioState.reserved,
          cash: [...sources.portfolioState.reserved.cash].reverse(),
          positions: [...sources.portfolioState.reserved.positions].reverse(),
          orders: [...sources.portfolioState.reserved.orders].reverse(),
        },
      },
      constraints: [...sources.constraints].reverse(),
    });
    const first = runInvestingEngineV1Final(sources);
    const second = runInvestingEngineV1Final(changed);
    expect(second.finalResultHash).toBe(first.finalResultHash);
  });

  it("is invariant to object key insertion order", () => {
    const sources = buildPhase3FSources();
    const reversedRequest = Object.fromEntries(Object.entries(sources.request).reverse()) as typeof sources.request;
    const result = runInvestingEngineV1Final({ ...sources, request: reversedRequest });
    expect(result.finalResultHash).toBe(runInvestingEngineV1Final(sources).finalResultHash);
  });

  it("supports extreme canonical decimals without Number financial math", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({ cash: "1000.123456789123456789" }));
    expect(result.residualCash).toMatch(/^\d+/);
    expect(result.finalResultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds every public hash to the final result", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    expect(Object.values(result.hashes).every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(result.hashes.finalDecisionHash).toBe(result.decision.finalDecisionHash);
    expect(result.hashes.auditBundleHash).toBe(result.auditBundle.auditBundleHash);
    expect(result.hashes.shadowPackageHash).toBe(result.shadowPackage.shadowPackageHash);
  });
});
