import { describe, expect, it } from "vitest";

import { detectSetup } from "@/lib/trading/setups";
import type { TradingCandleInput } from "@/lib/trading/data";

import { buildSequenceCandles } from "./helpers/tradingMarketFixtures";
import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading setup detection engine", () => {
  it("detects breakout continuation in a clean breakout trend", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 100.2, 99.9, 100.1, 100.05, 100.12, 100.08, 100.1, 100.15, 100.2, 100.18, 103.3],
            ranges: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 1.7],
          }),
        },
      },
      marketOverrides: {
        structure: { state: "breakout_structure", direction: "long", score: 82, confidence: 80 },
        regime: { state: "trending", score: 74, confidence: 72 },
        momentum: { state: "accelerating", direction: "long", score: 78, confidence: 76 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("breakout_continuation");
    expect(result.direction).toBe("long");
    expect(result.triggerLevel).not.toBeNull();
    expect(result.invalidationLevel).not.toBeNull();
  });

  it("detects trend pullback without confusing it with breakout", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 108.6, 108.1],
            ranges: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.9],
          }),
        },
      },
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 78, confidence: 76 },
        regime: { state: "trending", score: 72, confidence: 70 },
        momentum: { state: "weakening", direction: "long", score: 55, confidence: 58 },
        liquidity: { state: "healthy_participation", score: 66, confidence: 64 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("trend_pullback");
    expect(result.direction).toBe("long");
  });

  it("detects a directional pullback even when momentum is neutral but structure stays strong", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 100.8, 101.4, 102.1, 102.8, 103.5, 104.2, 104.8, 105.4, 106, 105.8, 105.6],
            ranges: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.8],
          }),
        },
      },
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 78, confidence: 78 },
        regime: { state: "expansion", score: 72, confidence: 70 },
        momentum: { state: "neutral", direction: "neutral", score: 50, confidence: 56 },
        liquidity: { state: "neutral", score: 48, confidence: 52 },
        volatility: { state: "normal", score: 58, confidence: 58 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("trend_pullback");
    expect(result.direction).toBe("long");
  });

  it("detects compression-edge continuation when momentum leads before structure fully resolves", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 100.02, 100.01, 100.03, 100.04, 100.05, 100.06, 100.07, 100.08, 100.09, 100.1, 100.15],
            opens: [99.99, 100, 100, 100.01, 100.01, 100.02, 100.03, 100.04, 100.05, 100.06, 100.07, 100.08],
            ranges: [0.12, 0.12, 0.11, 0.11, 0.1, 0.1, 0.09, 0.09, 0.08, 0.08, 0.08, 0.07],
          }),
        },
      },
      marketOverrides: {
        structure: { state: "transition", direction: "neutral", score: 48, confidence: 44 },
        regime: { state: "compression", score: 84, confidence: 76 },
        momentum: { state: "rising", direction: "long", score: 64, confidence: 68 },
        liquidity: { state: "neutral", score: 48, confidence: 50 },
        volatility: { state: "normal", score: 52, confidence: 54 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("breakout_continuation");
    expect(result.direction).toBe("long");
  });

  it("uses higher-timeframe direction when the primary timeframe is neutral but compression still points one way", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 100.01, 100.0, 100.02, 100.01, 100.02, 100.03, 100.02, 100.03, 100.04, 100.03, 100.04],
            ranges: [0.08, 0.08, 0.08, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06, 0.05, 0.05, 0.05],
          }),
          "1h": buildSequenceCandles({
            closes: [100, 100.02, 100.01, 100.03, 100.04, 100.05, 100.06, 100.08, 100.1, 100.12, 100.13, 100.16],
            opens: [99.99, 100, 100.01, 100.01, 100.02, 100.03, 100.04, 100.05, 100.07, 100.09, 100.1, 100.12],
            ranges: [0.18, 0.18, 0.17, 0.17, 0.16, 0.16, 0.15, 0.15, 0.14, 0.14, 0.13, 0.13],
            stepMinutes: 60,
            start: "2026-03-24T18:00:00.000Z",
          }),
        },
      },
      marketOverrides: {
        structure: { state: "transition", direction: "neutral", score: 44, confidence: 42 },
        regime: { state: "compression", score: 82, confidence: 74 },
        momentum: { state: "neutral", direction: "neutral", score: 38, confidence: 24 },
        liquidity: { state: "neutral", score: 40, confidence: 24 },
        volatility: { state: "normal", score: 52, confidence: 54 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("range_reclaim");
    expect(result.direction).toBe("long");
  });

  it("stays neutral when higher timeframes disagree on direction", () => {
    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: {
          "15m": buildSequenceCandles({
            closes: [100, 100.01, 100.0, 100.02, 100.01, 100.02, 100.03, 100.02, 100.03, 100.04, 100.03, 100.04],
            ranges: [0.08, 0.08, 0.08, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06, 0.05, 0.05, 0.05],
          }),
          "1h": buildSequenceCandles({
            closes: [100.2, 100.18, 100.16, 100.14, 100.12, 100.1, 100.08, 100.06, 100.04, 100.02, 100, 99.98],
            opens: [100.22, 100.2, 100.18, 100.16, 100.14, 100.12, 100.1, 100.08, 100.06, 100.04, 100.02, 100],
            ranges: [0.18, 0.18, 0.17, 0.17, 0.16, 0.16, 0.15, 0.15, 0.14, 0.14, 0.13, 0.13],
            stepMinutes: 60,
            start: "2026-03-24T18:00:00.000Z",
          }),
          "4h": buildSequenceCandles({
            closes: [100, 100.02, 100.01, 100.03, 100.04, 100.05, 100.06, 100.08, 100.1, 100.12, 100.13, 100.16],
            opens: [99.99, 100, 100.01, 100.01, 100.02, 100.03, 100.04, 100.05, 100.07, 100.09, 100.1, 100.12],
            ranges: [0.22, 0.22, 0.2, 0.2, 0.18, 0.18, 0.16, 0.16, 0.14, 0.14, 0.12, 0.12],
            stepMinutes: 240,
            start: "2026-03-23T06:00:00.000Z",
          }),
        },
      },
      marketOverrides: {
        structure: { state: "transition", direction: "neutral", score: 44, confidence: 42 },
        regime: { state: "compression", score: 82, confidence: 74 },
        momentum: { state: "neutral", direction: "neutral", score: 38, confidence: 24 },
        liquidity: { state: "neutral", score: 40, confidence: 24 },
        volatility: { state: "normal", score: 52, confidence: 54 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("none");
    expect(result.direction).toBe("neutral");
  });

  it("detects sweep plus reclaim as liquidity sweep reversal", () => {
    const candles = buildSequenceCandles({
      closes: [100, 100.2, 100.1, 100.3, 100.25, 100.35, 100.3, 100.4, 100.35, 100.3, 100.25, 100.4],
      ranges: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
      stepMinutes: 5,
    });
    const lastIndex = candles.length - 1;

    candles[lastIndex] = {
      ...candles[lastIndex],
      open: 100.1,
      low: 98.5,
      high: 100.8,
      close: 100.55,
      volume: 1600,
    } satisfies TradingCandleInput;

    const input = createSetupInput({
      snapshotOverrides: {
        timeframes: { "15m": candles },
      },
      marketOverrides: {
        structure: { state: "reclaim_structure", direction: "long", score: 74, confidence: 72 },
        regime: { state: "compression", score: 68, confidence: 66 },
        momentum: { state: "rising", direction: "long", score: 62, confidence: 60 },
        liquidity: { state: "reclaim_after_sweep", score: 82, confidence: 80 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("liquidity_sweep_reversal");
    expect(result.direction).toBe("long");
  });

  it("detects range reclaim and does not let breakout swallow it", () => {
    const input = createSetupInput({
      marketOverrides: {
        structure: { state: "reclaim_structure", direction: "long", score: 70, confidence: 72 },
        regime: { state: "ranging", score: 64, confidence: 66 },
        momentum: { state: "rising", direction: "long", score: 58, confidence: 60 },
        liquidity: { state: "neutral", score: 45, confidence: 44 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("range_reclaim");
    expect(result.direction).toBe("long");
  });

  it("detects failed breakout in a reversal context", () => {
    const input = createSetupInput({
      marketOverrides: {
        structure: { state: "failed_break", direction: "short", score: 72, confidence: 74 },
        regime: { state: "ranging", score: 58, confidence: 60 },
        momentum: { state: "rising", direction: "short", score: 60, confidence: 62 },
        liquidity: { state: "liquidity_sweep", score: 70, confidence: 68 },
      },
    });

    const result = detectSetup(input);

    expect(result.type).toBe("failed_breakout");
    expect(result.direction).toBe("short");
  });

  it("returns none when the context does not support a valid setup", () => {
    const input = createSetupInput();

    const result = detectSetup(input);

    expect(result).toEqual({
      type: "none",
      direction: "neutral",
      triggerLevel: null,
      invalidationLevel: null,
      confidence: 18,
    });
  });
});
