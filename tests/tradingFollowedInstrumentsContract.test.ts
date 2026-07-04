import { describe, expect, it } from "vitest";

import { resolvePlanRecommendation } from "@/app/api/trading/followed-instruments/route";

const liveBaseline = {
  valid: true,
  baseline_id: "baseline-live-current-xau-btc-breakout-risk-shaped",
  engine_hash: "engine-hash-abc123",
};

const signal = {
  signal_id: "sig_followed_btcusd",
  baseline_id: liveBaseline.baseline_id,
  engine_hash: liveBaseline.engine_hash,
};

describe("trading followed instruments contract", () => {
  it("does not derive ENTER from TRADE_VALID / allowed without Current Live Baseline signal pedigree", () => {
    expect(
      resolvePlanRecommendation({
        currentState: "TRADE_VALID",
        executionStatus: "allowed",
      }),
    ).toBe("WAIT");

    expect(
      resolvePlanRecommendation({
        currentState: "TRADE_VALID",
        executionStatus: "allowed",
        liveBaseline,
        signal,
      }),
    ).toBe("ENTER");
  });
});
