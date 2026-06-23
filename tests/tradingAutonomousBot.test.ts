import { describe, expect, it } from "vitest";

import {
  buildPaperOnlyBotConfig,
  buildPrivateBotConfig,
  buildRealMoneyWhenArmedBotConfig,
  createPaperBrokerAdapter,
  planAutonomousBotCycle,
  runAutonomousBotCycle,
  type BotAccountState,
  type BotMarketDecision,
} from "@/lib/trading/bot";
import { isAlpacaPaperSymbolSupported } from "@/lib/trading/bot/paperRunner";

const account: BotAccountState = {
  equity: 10000,
  currency: "EUR",
  openPositions: 0,
  openRiskPct: 0,
  dailyLossPct: 0,
  tradesToday: 0,
  consecutiveLosses: 0,
};

const decision: BotMarketDecision = {
  instrument: "BTCUSD",
  side: "buy",
  tradeValid: true,
  executionStatus: "allowed",
  marketOpen: true,
  snapshotFresh: true,
  snapshotAt: "2026-06-06T10:00:00.000Z",
  trigger: 70000,
  entryLow: 69950,
  entryHigh: 70050,
  invalidation: 69850,
  target: 70400,
  confidence: 74,
  riskReward: 2.6,
  reason: "Liquidity sweep reversal with fresh trigger.",
};

describe("private autonomous trading bot policy", () => {
  it("exposes a paper-only option that cannot send live orders", () => {
    const config = buildPaperOnlyBotConfig("owner_1");

    const result = planAutonomousBotCycle({ config, account, decision });

    expect(result.action).toBe("ready");
    expect(result.mode).toBe("paper");
    expect(result.intent?.mode).toBe("paper");
  });

  it("exposes a real-money option only after explicit arming", () => {
    const config = buildRealMoneyWhenArmedBotConfig({
      ownerUserId: "owner_1",
      operatorAcknowledgedAt: "2026-06-06T12:00:00.000Z",
    });

    const result = planAutonomousBotCycle({ config, account, decision });

    expect(result.action).toBe("ready");
    expect(result.mode).toBe("live");
    expect(result.intent?.mode).toBe("live");
    expect(result.intent?.riskPct).toBe(0.1);
  });

  it("creates a paper order intent when all gates pass", () => {
    const config = buildPrivateBotConfig({ ownerUserId: "owner_1" });

    const result = planAutonomousBotCycle({ config, account, decision });

    expect(result.action).toBe("ready");
    expect(result.intent?.mode).toBe("paper");
    expect(result.intent?.instrument).toBe("BTCUSD");
    expect(result.intent?.riskPct).toBe(0.25);
    expect(result.intent?.stopLoss).toBe(69850);
    expect(result.intent?.takeProfit).toBe(70400);
  });

  it("blocks live orders unless live trading is explicitly armed", () => {
    const config = buildPrivateBotConfig({
      ownerUserId: "owner_1",
      safety: {
        executionMode: "live",
        autonomyOption: "real_money_when_armed",
        allowLiveTrading: false,
        liveEnvironmentConfirmed: false,
        killSwitch: false,
        requireFreshSnapshot: true,
        requireMarketOpen: true,
      },
    });

    const result = planAutonomousBotCycle({ config, account, decision });

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContain("Live trading is disabled by configuration.");
    expect(result.reasons).toContain("Live environment has not been explicitly confirmed.");
  });

  it("blocks stale snapshots before order creation", () => {
    const config = buildPrivateBotConfig({ ownerUserId: "owner_1" });

    const result = planAutonomousBotCycle({
      config,
      account,
      decision: { ...decision, snapshotFresh: false },
    });

    expect(result.action).toBe("blocked");
    expect(result.reasons).toContain("Snapshot is not fresh.");
  });

  it("can run against the paper broker without sending a real order", async () => {
    const config = buildPrivateBotConfig({ ownerUserId: "owner_1" });

    const result = await runAutonomousBotCycle({
      config,
      account,
      decision,
      broker: createPaperBrokerAdapter(),
    });

    expect(result.planned.action).toBe("ready");
    expect(result.execution?.ok).toBe(true);
    expect(result.execution?.status).toBe("paper_queued");
  });

  it("routes only Alpaca-supported paper symbols to Alpaca", () => {
    expect(isAlpacaPaperSymbolSupported("AAPL")).toBe(true);
    expect(isAlpacaPaperSymbolSupported("TSLA")).toBe(true);

    expect(isAlpacaPaperSymbolSupported("USDJPY")).toBe(false);
    expect(isAlpacaPaperSymbolSupported("EURUSD")).toBe(false);
    expect(isAlpacaPaperSymbolSupported("XAUUSD")).toBe(false);
    expect(isAlpacaPaperSymbolSupported("BTCUSD")).toBe(false);
  });
});
