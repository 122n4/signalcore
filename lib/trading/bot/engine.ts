import { planAutonomousBotCycle } from "./policy";
import type {
  AutonomousBotConfig,
  BotAccountState,
  BotMarketDecision,
  BrokerExecutionAdapter,
  BrokerExecutionResult,
} from "./types";

export async function runAutonomousBotCycle(args: {
  config: AutonomousBotConfig;
  account: BotAccountState;
  decision: BotMarketDecision;
  broker: BrokerExecutionAdapter;
}): Promise<{
  planned: ReturnType<typeof planAutonomousBotCycle>;
  execution: BrokerExecutionResult | null;
}> {
  const planned = planAutonomousBotCycle({
    config: args.config,
    account: args.account,
    decision: args.decision,
  });

  if (planned.action !== "ready") {
    return { planned, execution: null };
  }

  if (args.broker.mode !== planned.mode) {
    return {
      planned: {
        action: "blocked",
        mode: planned.mode,
        instrument: planned.instrument,
        reasons: [`Broker adapter mode ${args.broker.mode} does not match bot mode ${planned.mode}.`],
        intent: null,
      },
      execution: null,
    };
  }

  const execution = await args.broker.submitBracketOrder(planned.intent);
  return { planned, execution };
}
