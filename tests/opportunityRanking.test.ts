import { describe, expect, it } from "vitest";
import { rankOpportunities } from "@/lib/engine/opportunityRanking";

describe("opportunityRanking", () => {
  it("penalizes concentrated assets and reorders by adjusted expected value", () => {
    const ranked = rankOpportunities({
      probabilities: [
        {
          asset: "BTC",
          prob_up: 0.65,
          prob_down: 0.35,
          expected_move: 3.4,
          expected_value: 2.0,
          confidence: 0.8,
        },
        {
          asset: "NVDA",
          prob_up: 0.61,
          prob_down: 0.39,
          expected_move: 2.2,
          expected_value: 1.9,
          confidence: 0.85,
        },
      ],
      exposureByAssetPct: {
        BTC: 60,
        NVDA: 10,
      },
      maxSinglePositionPct: 22,
    });

    expect(ranked[0].asset).toBe("NVDA");
    expect(ranked[0].expected_value).toBeGreaterThan(ranked[1].expected_value);
    expect(ranked[1].asset).toBe("BTC");
  });

  it("uses deterministic tie-breaks (confidence then symbol)", () => {
    const ranked = rankOpportunities({
      probabilities: [
        {
          asset: "MSFT",
          prob_up: 0.55,
          prob_down: 0.45,
          expected_move: 1.2,
          expected_value: 1.0,
          confidence: 0.7,
        },
        {
          asset: "AAPL",
          prob_up: 0.55,
          prob_down: 0.45,
          expected_move: 1.2,
          expected_value: 1.0,
          confidence: 0.7,
        },
      ],
      exposureByAssetPct: {
        AAPL: 5,
        MSFT: 5,
      },
      maxSinglePositionPct: 22,
    });

    expect(ranked[0].asset).toBe("AAPL");
    expect(ranked[1].asset).toBe("MSFT");
  });

  it("keeps ranking stable regardless of input row order", () => {
    const rowsA = [
      {
        asset: "TSLA",
        prob_up: 0.58,
        prob_down: 0.42,
        expected_move: 1.7,
        expected_value: 1.1,
        confidence: 0.72,
      },
      {
        asset: "AAPL",
        prob_up: 0.58,
        prob_down: 0.42,
        expected_move: 1.7,
        expected_value: 1.1,
        confidence: 0.72,
      },
      {
        asset: "MSFT",
        prob_up: 0.62,
        prob_down: 0.38,
        expected_move: 1.5,
        expected_value: 1.05,
        confidence: 0.78,
      },
    ];
    const rowsB = [...rowsA].reverse();
    const exposure = { TSLA: 8, AAPL: 8, MSFT: 8 };

    const rankedA = rankOpportunities({
      probabilities: rowsA,
      exposureByAssetPct: exposure,
      maxSinglePositionPct: 22,
    }).map((x) => x.asset);
    const rankedB = rankOpportunities({
      probabilities: rowsB,
      exposureByAssetPct: exposure,
      maxSinglePositionPct: 22,
    }).map((x) => x.asset);

    expect(rankedA).toEqual(rankedB);
  });
});
