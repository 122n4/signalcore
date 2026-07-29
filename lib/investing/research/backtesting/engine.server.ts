import "server-only";
import { hashCanonicalResearchMaterial } from "../reproducibility/hashing.server";
import { ARTIFACT_IDENTITY_DOMAIN } from "../reproducibility/versions";
import { validateBacktestInput } from "./runtimeValidation";
import {
  BACKTEST_RESULT_VERSION,
  type BacktestDecisionContext,
  type BacktestResult,
  type BacktestStrategy,
  type BacktestValidationResult,
} from "./types";

const round = (value: number) => Number(value.toFixed(12));

export function runDeterministicBacktest(
  unknownInput: unknown,
  strategy: BacktestStrategy,
  shouldStop: () => string | null = () => null,
): BacktestValidationResult<BacktestResult> {
  const input = validateBacktestInput(unknownInput);
  if ("reason" in input) return { ok: false,reason: input.reason };
  if (!strategy || typeof strategy.contractVersion !== "string"
    || typeof strategy.decide !== "function") {
    return { ok: false,reason: "backtest_strategy_invalid" };
  }
  const { bars,configuration } = input.value;
  let cash = configuration.initialCapital;
  let units = 0;
  let pendingTarget: number | null = null;
  let peak = configuration.initialCapital;
  let maximumDrawdown = 0;
  let turnover = 0;
  let totalCosts = 0;
  const fills: BacktestResult["fills"][number][] = [];
  const equityCurve: BacktestResult["equityCurve"][number][] = [];
  try {
    for (let index=0; index<bars.length; index += 1) {
      if(index%256===0){
        const stopReason=shouldStop();
        if(stopReason!==null)return {ok:false,reason:stopReason};
      }
      const current = bars[index];
      if (pendingTarget !== null) {
        const before = cash + units * current.open;
        const targetValue = before * pendingTarget;
        const requestedUnits = targetValue / current.open - units;
        const direction = Math.sign(requestedUnits);
        const price = current.open * (1 + direction * configuration.slippageBps / 10_000);
        const notional = requestedUnits * price;
        const costs = Math.abs(notional) * configuration.transactionCostBps / 10_000;
        if (cash - notional - costs < -1e-9) {
          return { ok: false,reason: "backtest_capital_constraint" };
        }
        cash = round(cash-notional-costs);
        units = round(units+requestedUnits);
        turnover = round(turnover+Math.abs(notional));
        totalCosts = round(totalCosts+costs);
        if (Math.abs(requestedUnits) > 1e-12) fills.push({
          timestamp: current.timestamp,price: round(price),units: round(requestedUnits),
          costs: round(costs),targetWeight: pendingTarget,
        });
      }
      const equity = round(cash+units*current.close);
      peak = Math.max(peak,equity);
      maximumDrawdown = Math.max(maximumDrawdown,(peak-equity)/peak);
      equityCurve.push({ timestamp: current.timestamp,equity,cash,units });
      const context: BacktestDecisionContext = Object.freeze({
        timestamp: current.timestamp,observedBar: Object.freeze({ ...current }),
        previousBar: index === 0 ? null : Object.freeze({ ...bars[index-1] }),
        cash,units,equity,
      });
      const decision = strategy.decide(context);
      if (!Number.isFinite(decision) || decision < 0
        || decision > configuration.maximumPositionWeight) {
        return { ok: false,reason: "backtest_strategy_decision_invalid" };
      }
      pendingTarget = round(decision);
    }
  } catch {
    return { ok: false,reason: "backtest_strategy_failed" };
  }
  const finalEquity = equityCurve[equityCurve.length-1].equity;
  const material = {
    contractVersion: BACKTEST_RESULT_VERSION,
    experimentId: input.value.experimentId,executionId: input.value.executionId,
    datasetVersionId: input.value.datasetVersionId,completionStatus: "completed" as const,
    fills,equityCurve,metrics: {
      initialCapital: configuration.initialCapital,finalEquity,
      totalReturn: round(finalEquity/configuration.initialCapital-1),
      maximumDrawdown: round(maximumDrawdown),
      turnover,totalCosts,
    },
  };
  const hashed = hashCanonicalResearchMaterial(ARTIFACT_IDENTITY_DOMAIN,material);
  if ("issues" in hashed) return { ok: false,reason: "backtest_result_invalid" };
  return { ok: true,value: { ...material,resultHash: hashed.value.digest } };
}

export async function runDeterministicBacktestCooperatively(
  unknownInput: unknown,
  strategy: BacktestStrategy,
  checkpoint: () => Promise<void>,
  shouldStop: () => string | null = () => null,
): Promise<BacktestValidationResult<BacktestResult>> {
  const input=validateBacktestInput(unknownInput);
  if("reason" in input)return input;
  for(let index=0;index<input.value.bars.length;index+=256){
    await checkpoint();
    await new Promise<void>((resolve)=>setImmediate(resolve));
  }
  return runDeterministicBacktest(input.value,strategy,shouldStop);
}
