export const BACKTEST_INPUT_VERSION = "investing-backtest-input/v1" as const;
export const BACKTEST_RESULT_VERSION = "investing-backtest-result/v1" as const;

export type BacktestBar = Readonly<{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>;

export type BacktestConfiguration = Readonly<{
  initialCapital: number;
  transactionCostBps: number;
  slippageBps: number;
  maximumPositionWeight: number;
}>;

export type BacktestInput = Readonly<{
  contractVersion: typeof BACKTEST_INPUT_VERSION;
  experimentId: string;
  executionId: string;
  datasetVersionId: string;
  bars: readonly BacktestBar[];
  configuration: BacktestConfiguration;
}>;

export type BacktestDecisionContext = Readonly<{
  timestamp: string;
  observedBar: BacktestBar;
  previousBar: BacktestBar | null;
  cash: number;
  units: number;
  equity: number;
}>;

export type BacktestStrategy = Readonly<{
  contractVersion: string;
  decide(context: BacktestDecisionContext): number;
}>;

export type BacktestFill = Readonly<{
  timestamp: string;
  price: number;
  units: number;
  costs: number;
  targetWeight: number;
}>;

export type BacktestEquityPoint = Readonly<{
  timestamp: string;
  equity: number;
  cash: number;
  units: number;
}>;

export type BacktestResult = Readonly<{
  contractVersion: typeof BACKTEST_RESULT_VERSION;
  experimentId: string;
  executionId: string;
  datasetVersionId: string;
  completionStatus: "completed";
  fills: readonly BacktestFill[];
  equityCurve: readonly BacktestEquityPoint[];
  metrics: Readonly<{
    initialCapital: number;
    finalEquity: number;
    totalReturn: number;
    maximumDrawdown: number;
    turnover: number;
    totalCosts: number;
  }>;
  resultHash: string;
}>;

export type BacktestValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; reason: string }>;
