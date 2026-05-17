import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  computeBacktestMetrics,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
  type TradingBacktestComparativeReport,
  type TradingBacktestMarketSessionRule,
  type TradingBacktestTrade,
} from "@/lib/trading/backtest";
import type { TradingTimeframe } from "@/lib/trading/data";

type Scenario = {
  id: string;
  description: string;
  rules: TradingBacktestMarketSessionRule[];
};

const YEARLY_PERIODS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});

const CRISIS_PERIODS = [
  { label: "covid_crash", from: "2020-02-15T00:00:00.000Z", to: "2020-06-30T23:59:59.000Z" },
  { label: "inflation_war_shock", from: "2022-02-01T00:00:00.000Z", to: "2022-06-30T23:59:59.000Z" },
  { label: "banking_stress", from: "2023-03-01T00:00:00.000Z", to: "2023-05-31T23:59:59.000Z" },
] as const;

const BASELINE_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_current_xau_btc_breakout_risk_shaped.json",
);
const BASELINE_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_current_xau_btc_breakout_risk_shaped.json",
);
const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const REPORT_PATH = path.join(OUTPUT_DIR, "trading-current-engine-elevation-study.json");
const DEFAULT_TIMEFRAMES: TradingTimeframe[] = ["4h", "1h", "15m"];

const SCENARIOS: Scenario[] = [
  {
    id: "surgical_crisis_context_stack",
    description:
      "Block four weak crisis contexts while keeping all markets alive and aggregate trades inside the 220-320 target.",
    rules: [
      {
        instrument: "GBPUSD",
        sessions: ["london_open"],
        reason: "Engine elevation blocks GBPUSD London open after weak baseline/crisis behavior.",
      },
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        reason: "Engine elevation blocks NAS100 overlap breakouts after weak crisis behavior.",
      },
      {
        instrument: "XAUUSD",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        reason: "Engine elevation blocks XAUUSD late US breakouts after weak crisis behavior.",
      },
      {
        instrument: "BTCUSD",
        sessions: ["weekend_drift"],
        setupTypes: ["breakout_continuation"],
        reason: "Engine elevation blocks BTCUSD weekend-drift breakouts after weak crisis behavior.",
      },
    ],
  },
  {
    id: "ethusd_stand_down",
    description:
      "Block ETHUSD entirely because current crisis sample is loss-only; useful as a conservative benchmark, not first-choice live behavior.",
    rules: [
      {
        instrument: "ETHUSD",
        reason: "Engine elevation blocks ETHUSD until crisis behavior is revalidated.",
      },
    ],
  },
  {
    id: "indices_crisis_breakout_guard",
    description:
      "Block only the two index breakout contexts that are consistently weak during crisis windows.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        reason: "Engine elevation blocks NAS100 overlap breakouts after weak crisis behavior.",
      },
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        reason: "Engine elevation blocks NAS100 NY open breakouts after weak crisis behavior.",
      },
    ],
  },
];

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function round(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10_000) / 10_000;
}

function collectTrades(report: TradingBacktestComparativeReport): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const trades: TradingBacktestTrade[] = [];
  let evaluatedBars = 0;

  for (const period of report.periods) {
    for (const market of period.report.markets) {
      trades.push(...market.report.trades);
      evaluatedBars += market.report.period.evaluatedBars;
    }
  }

  return {
    trades: trades.sort((left, right) => left.closedAt.localeCompare(right.closedAt)),
    evaluatedBars,
  };
}

function summaryFromTrades(collected: { trades: TradingBacktestTrade[]; evaluatedBars: number }) {
  const equityValues: number[] = [];
  let equity = 100;

  for (const trade of collected.trades) {
    equity += trade.pnlPct;
    equityValues.push(round(equity) ?? equity);
  }

  const metrics = computeBacktestMetrics({
    trades: collected.trades,
    evaluatedBars: collected.evaluatedBars,
    equityValues,
  });

  return {
    totalTrades: metrics.tradeCount,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function summary(report: TradingBacktestComparativeReport) {
  return summaryFromTrades(collectTrades(report));
}

function delta(current: ReturnType<typeof summary>, baseline: ReturnType<typeof summary>) {
  return {
    totalTrades: current.totalTrades - baseline.totalTrades,
    winRate: round(current.winRate - baseline.winRate),
    expectancy: round(current.expectancy - baseline.expectancy),
    profitFactor:
      current.profitFactor == null || baseline.profitFactor == null
        ? null
        : round(current.profitFactor - baseline.profitFactor),
    maxDrawdown: round(current.maxDrawdown - baseline.maxDrawdown),
  };
}

async function readComparative(outputPath: string): Promise<TradingBacktestComparativeReport> {
  return JSON.parse(await readFile(outputPath, "utf8")) as TradingBacktestComparativeReport;
}

async function runScenario(scenario: Scenario, baselineYearly: TradingBacktestComparativeReport, baselineCrisis: TradingBacktestComparativeReport) {
  const timeframes = (baselineYearly.request.timeframes.length > 0
    ? baselineYearly.request.timeframes
    : DEFAULT_TIMEFRAMES) as TradingTimeframe[];
  const yearly = await runTradingHistoricalComparativeSweep({
    periods: YEARLY_PERIODS,
    instruments: baselineYearly.request.instruments,
    timeframes,
    sourcePreference: "local_only",
    continueOnError: true,
    backtest: {
      captureSteps: false,
      marketSessionOverrides: {
        blockedTradeValidContexts: scenario.rules,
      },
    },
  });
  const crisis = await runTradingHistoricalComparativeSweep({
    periods: [...CRISIS_PERIODS],
    instruments: baselineYearly.request.instruments,
    timeframes,
    sourcePreference: "local_only",
    continueOnError: true,
    backtest: {
      captureSteps: false,
      marketSessionOverrides: {
        blockedTradeValidContexts: scenario.rules,
      },
    },
  });
  const yearlyPath = path.join(OUTPUT_DIR, `trading-engine-elevation-yearly-${scenario.id}.json`);
  const crisisPath = path.join(OUTPUT_DIR, `trading-engine-elevation-crisis-${scenario.id}.json`);

  await writeTradingHistoricalComparativeReport({ report: yearly, outputPath: yearlyPath });
  await writeTradingHistoricalComparativeReport({ report: crisis, outputPath: crisisPath });

  const yearlySummary = summary(yearly);
  const crisisSummary = summary(crisis);
  const baselineYearlySummary = summary(baselineYearly);
  const baselineCrisisSummary = summary(baselineCrisis);

  return {
    id: scenario.id,
    description: scenario.description,
    rules: scenario.rules,
    aggregate: {
      current: yearlySummary,
      delta: delta(yearlySummary, baselineYearlySummary),
    },
    crisis: {
      current: crisisSummary,
      delta: delta(crisisSummary, baselineCrisisSummary),
      breakEvenOrBetter: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
    },
    gates: {
      aggregateTradesInTarget: yearlySummary.totalTrades >= 220 && yearlySummary.totalTrades <= 320,
      aggregateRetentionOk: yearlySummary.totalTrades >= baselineYearlySummary.totalTrades * 0.9,
      aggregateImproved:
        yearlySummary.expectancy >= baselineYearlySummary.expectancy &&
        (yearlySummary.profitFactor ?? 0) >= (baselineYearlySummary.profitFactor ?? 0),
      crisisImproved:
        crisisSummary.expectancy >= baselineCrisisSummary.expectancy &&
        (crisisSummary.profitFactor ?? 0) >= (baselineCrisisSummary.profitFactor ?? 0),
      crisisBreakEven: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
    },
    artifacts: {
      yearlyPath,
      crisisPath,
    },
  };
}

function ruleMatchesTrade(rule: TradingBacktestMarketSessionRule, trade: TradingBacktestTrade): boolean {
  const instrumentMatches =
    !rule.instrument ||
    rule.instrument.trim().toUpperCase() === trade.instrument.trim().toUpperCase();
  const sessionMatches =
    !rule.sessions ||
    rule.sessions.length === 0 ||
    rule.sessions.includes(trade.session);
  const setupMatches =
    !rule.setupTypes ||
    rule.setupTypes.length === 0 ||
    rule.setupTypes.includes(trade.setupType);

  return instrumentMatches && sessionMatches && setupMatches;
}

function filterScenarioTrades(
  baseline: TradingBacktestComparativeReport,
  scenario: Scenario,
): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const collected = collectTrades(baseline);

  return {
    evaluatedBars: collected.evaluatedBars,
    trades: collected.trades.filter((trade) =>
      !scenario.rules.some((rule) => ruleMatchesTrade(rule, trade)),
    ),
  };
}

function runFastScenario(
  scenario: Scenario,
  baselineYearly: TradingBacktestComparativeReport,
  baselineCrisis: TradingBacktestComparativeReport,
) {
  const yearlySummary = summaryFromTrades(filterScenarioTrades(baselineYearly, scenario));
  const crisisSummary = summaryFromTrades(filterScenarioTrades(baselineCrisis, scenario));
  const baselineYearlySummary = summary(baselineYearly);
  const baselineCrisisSummary = summary(baselineCrisis);

  return {
    id: scenario.id,
    description: scenario.description,
    rules: scenario.rules,
    aggregate: {
      current: yearlySummary,
      delta: delta(yearlySummary, baselineYearlySummary),
    },
    crisis: {
      current: crisisSummary,
      delta: delta(crisisSummary, baselineCrisisSummary),
      breakEvenOrBetter: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
    },
    gates: {
      aggregateTradesInTarget: yearlySummary.totalTrades >= 220 && yearlySummary.totalTrades <= 320,
      aggregateRetentionOk: yearlySummary.totalTrades >= baselineYearlySummary.totalTrades * 0.9,
      aggregateImproved:
        yearlySummary.expectancy >= baselineYearlySummary.expectancy &&
        (yearlySummary.profitFactor ?? 0) >= (baselineYearlySummary.profitFactor ?? 0),
      crisisImproved:
        crisisSummary.expectancy >= baselineCrisisSummary.expectancy &&
        (crisisSummary.profitFactor ?? 0) >= (baselineCrisisSummary.profitFactor ?? 0),
      crisisBreakEven: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
    },
    artifacts: null,
  };
}

async function main() {
  const baselineYearly = await readComparative(BASELINE_YEARLY_PATH);
  const baselineCrisis = await readComparative(BASELINE_CRISIS_PATH);
  const scenarioFilter = readArg("scenario");
  const selectedScenarios = scenarioFilter
    ? SCENARIOS.filter((scenario) => scenario.id === scenarioFilter)
    : SCENARIOS;
  const results = [];

  if (selectedScenarios.length === 0) {
    throw new Error(`No engine elevation scenario matched '${scenarioFilter}'.`);
  }

  for (const scenario of selectedScenarios) {
    results.push(
      hasFlag("fast")
        ? runFastScenario(scenario, baselineYearly, baselineCrisis)
        : await runScenario(scenario, baselineYearly, baselineCrisis),
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: hasFlag("fast") ? "artifact_replay" : "full_backtest",
    baseline: {
      aggregate: summary(baselineYearly),
      crisis: summary(baselineCrisis),
    },
    results,
    recommended:
      results
        .filter((result) => Object.values(result.gates).every(Boolean))
        .sort((left, right) => right.crisis.current.expectancy - left.crisis.current.expectancy)[0]?.id ?? null,
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    hasFlag("fast")
      ? path.join(OUTPUT_DIR, "trading-current-engine-elevation-fast-study.json")
      : REPORT_PATH,
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
