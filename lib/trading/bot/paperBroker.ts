import type { BotOrderIntent, BrokerExecutionAdapter, BrokerExecutionResult } from "./types";

export function createPaperBrokerAdapter(): BrokerExecutionAdapter {
  return {
    name: "syntrake_paper_broker",
    mode: "paper",
    async submitBracketOrder(intent: BotOrderIntent): Promise<BrokerExecutionResult> {
      return {
        ok: true,
        brokerOrderId: `paper_${intent.idempotencyKey}`,
        status: "accepted",
        message: "Paper bracket order accepted. No real broker order was sent.",
        raw: {
          instrument: intent.instrument,
          side: intent.side,
          quantity: intent.quantity,
          entry: intent.estimatedEntry,
          stopLoss: intent.stopLoss,
          takeProfit: intent.takeProfit,
        },
      };
    },
  };
}
