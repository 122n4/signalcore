import {
  BACKTEST_INPUT_VERSION,
  type BacktestBar,
  type BacktestInput,
  type BacktestValidationResult,
} from "./types";

const plain = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => typeof key === "string"
    && descriptors[key]?.enumerable === true
    && descriptors[key]?.get === undefined
    && descriptors[key]?.set === undefined);
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Reflect.ownKeys(value).length === keys.length
  && keys.every((key) => Object.prototype.hasOwnProperty.call(value,key));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const timestamp = (value: unknown): value is string => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function bar(value: unknown): BacktestBar | null {
  if (!plain(value) || !exact(value,["timestamp","open","high","low","close","volume"])
    || !timestamp(value.timestamp)
    || !finite(value.open) || value.open <= 0
    || !finite(value.high) || value.high <= 0
    || !finite(value.low) || value.low <= 0
    || !finite(value.close) || value.close <= 0
    || !finite(value.volume) || value.volume < 0
    || value.high < Math.max(value.open,value.close)
    || value.low > Math.min(value.open,value.close)
    || value.low > value.high) return null;
  return { timestamp: value.timestamp,open: value.open,high: value.high,
    low: value.low,close: value.close,volume: value.volume };
}

export function validateBacktestInput(input: unknown): BacktestValidationResult<BacktestInput> {
  try {
    if (!plain(input) || !exact(input,[
      "contractVersion","experimentId","executionId","datasetVersionId","bars","configuration",
    ]) || input.contractVersion !== BACKTEST_INPUT_VERSION
      || typeof input.experimentId !== "string" || !/^irexp_v1_[a-f0-9]{64}$/u.test(input.experimentId)
      || typeof input.executionId !== "string" || !/^irexec_v1_[a-f0-9]{64}$/u.test(input.executionId)
      || typeof input.datasetVersionId !== "string" || input.datasetVersionId.length === 0
      || !Array.isArray(input.bars) || input.bars.length < 2
      || input.bars.length > 250_000
      || !plain(input.configuration) || !exact(input.configuration,[
        "initialCapital","transactionCostBps","slippageBps","maximumPositionWeight",
      ])) return { ok: false,reason: "backtest_input_invalid" };
    const configuration = input.configuration;
    if (!finite(configuration.initialCapital) || configuration.initialCapital <= 0
      || !finite(configuration.transactionCostBps) || configuration.transactionCostBps < 0
      || configuration.transactionCostBps > 10_000
      || !finite(configuration.slippageBps) || configuration.slippageBps < 0
      || configuration.slippageBps > 10_000
      || !finite(configuration.maximumPositionWeight)
      || configuration.maximumPositionWeight < 0
      || configuration.maximumPositionWeight > 1) {
      return { ok: false,reason: "backtest_configuration_invalid" };
    }
    const bars: BacktestBar[] = [];
    let prior = "";
    for (const item of input.bars) {
      const parsed = bar(item);
      if (parsed === null || parsed.timestamp <= prior) {
        return { ok: false,reason: "backtest_bars_invalid" };
      }
      prior = parsed.timestamp;
      bars.push(parsed);
    }
    return { ok: true,value: {
      contractVersion: BACKTEST_INPUT_VERSION,
      experimentId: input.experimentId,executionId: input.executionId,
      datasetVersionId: input.datasetVersionId,bars,
      configuration: {
        initialCapital: configuration.initialCapital,
        transactionCostBps: configuration.transactionCostBps,
        slippageBps: configuration.slippageBps,
        maximumPositionWeight: configuration.maximumPositionWeight,
      },
    } };
  } catch {
    return { ok: false,reason: "backtest_input_invalid" };
  }
}
