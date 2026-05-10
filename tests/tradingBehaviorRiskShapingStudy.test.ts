import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingSecondLayerRiskStudy,
  type TradingBacktestComparativeReport,
  type TradingBacktestRiskRule,
  type TradingSecondLayerRiskStudyScenario,
} from "@/lib/trading/backtest";
import type { SessionState } from "@/lib/trading/market";
import type { BehaviorGuardOutput } from "@/lib/trading/playbook";
import type { SetupType } from "@/lib/trading/setups";

const YEARLY_PERIODS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});

const CRISIS_PERIODS = [
  {
    label: "covid_crash",
    from: "2020-02-15T00:00:00.000Z",
    to: "2020-06-30T23:59:59.000Z",
  },
  {
    label: "inflation_war_shock",
    from: "2022-02-01T00:00:00.000Z",
    to: "2022-06-30T23:59:59.000Z",
  },
  {
    label: "banking_stress",
    from: "2023-03-01T00:00:00.000Z",
    to: "2023-05-31T23:59:59.000Z",
  },
] as const;

const INSTRUMENTS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "NAS100",
  "US500",
  "BTCUSD",
  "ETHUSD",
] as const;

const COARSE_WALK_FORWARD = {
  trainFraction: 0.75,
  testFraction: 0.2,
  minTrainBars: 400,
  minTestBars: 120,
} as const;

function buildBehaviorRules(factory: (instrument: (typeof INSTRUMENTS)[number]) => TradingSecondLayerRiskStudyScenario["rules"][number]) {
  return INSTRUMENTS.map(factory);
}

function buildTargetedBehaviorRules(args: {
  instruments: Array<(typeof INSTRUMENTS)[number]>;
  sessions?: SessionState[];
  setupTypes?: SetupType[];
  behaviorStates?: Array<BehaviorGuardOutput["state"]>;
  minConsecutiveLosses?: number;
  minDailyLossPct?: number;
  qualityGrades?: Array<"A" | "B" | "C" | "D">;
  clarityLevels?: Array<"high" | "medium" | "low">;
  riskMultiplier: number;
  reason: string;
}): TradingBacktestRiskRule[] {
  return args.instruments.map((instrument) => ({
    instrument,
    sessions: args.sessions ?? null,
    setupTypes: args.setupTypes ?? null,
    behaviorStates: args.behaviorStates ?? null,
    minConsecutiveLosses: args.minConsecutiveLosses ?? null,
    minDailyLossPct: args.minDailyLossPct ?? null,
    qualityGrades: args.qualityGrades ?? null,
    clarityLevels: args.clarityLevels ?? null,
    riskMultiplier: args.riskMultiplier,
    reason: args.reason,
  }));
}

const SCENARIOS: TradingSecondLayerRiskStudyScenario[] = [
  {
    id: "behavior_caution_global_soft_risk",
    description: "Reduce risk after the behavior guard enters caution.",
    rules: buildBehaviorRules((instrument) => ({
      instrument,
      behaviorStates: ["caution"],
      riskMultiplier: 0.67,
      reason: `Behavior risk study softens ${instrument} once the behavior guard is in caution.`,
    })),
  },
  {
    id: "behavior_caution_global_half_risk",
    description: "Halve risk after the behavior guard enters caution.",
    rules: buildBehaviorRules((instrument) => ({
      instrument,
      behaviorStates: ["caution"],
      riskMultiplier: 0.5,
      reason: `Behavior risk study halves ${instrument} once the behavior guard is in caution.`,
    })),
  },
  {
    id: "after_one_loss_global_soft_risk",
    description: "Reduce risk once a one-loss streak begins.",
    rules: buildBehaviorRules((instrument) => ({
      instrument,
      minConsecutiveLosses: 1,
      riskMultiplier: 0.67,
      reason: `Behavior risk study softens ${instrument} after the first consecutive loss.`,
    })),
  },
  {
    id: "after_drawdown_global_soft_risk",
    description: "Reduce risk once daily loss reaches 1%.",
    rules: buildBehaviorRules((instrument) => ({
      instrument,
      minDailyLossPct: 1,
      riskMultiplier: 0.67,
      reason: `Behavior risk study softens ${instrument} once daily loss reaches 1%.`,
    })),
  },
  {
    id: "nas100_breakout_overlap_caution_half_risk",
    description: "Halve NAS100 breakout overlap risk only once behavior enters caution.",
    rules: buildTargetedBehaviorRules({
      instruments: ["NAS100"],
      sessions: ["london_ny_overlap"],
      setupTypes: ["breakout_continuation"],
      behaviorStates: ["caution"],
      riskMultiplier: 0.5,
      reason:
        "Behavior risk study halves NAS100 breakout continuation overlap risk only once behavior is already in caution.",
    }),
  },
  {
    id: "nas100_breakout_weak_sessions_after_one_loss_half_risk",
    description:
      "Halve NAS100 breakout risk in ny_open and london_ny_overlap after the first loss in-session.",
    rules: buildTargetedBehaviorRules({
      instruments: ["NAS100"],
      sessions: ["ny_open", "london_ny_overlap"],
      setupTypes: ["breakout_continuation"],
      minConsecutiveLosses: 1,
      riskMultiplier: 0.5,
      reason:
        "Behavior risk study halves NAS100 breakout continuation risk in weak index sessions after the first loss streak starts.",
    }),
  },
  {
    id: "indices_breakout_weak_sessions_after_drawdown_soft_risk",
    description:
      "Soften index breakout risk in weak sessions once daily loss reaches 1%.",
    rules: [
      ...buildTargetedBehaviorRules({
        instruments: ["NAS100"],
        sessions: ["ny_open", "london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        minDailyLossPct: 1,
        riskMultiplier: 0.67,
        reason:
          "Behavior risk study softens NAS100 breakout continuation risk in weak sessions once daily loss reaches 1%.",
      }),
      ...buildTargetedBehaviorRules({
        instruments: ["US500"],
        sessions: ["pre_market"],
        setupTypes: ["breakout_continuation"],
        minDailyLossPct: 1,
        riskMultiplier: 0.67,
        reason:
          "Behavior risk study softens US500 pre-market breakout continuation risk once daily loss reaches 1%.",
      }),
    ],
  },
  {
    id: "indices_breakout_weak_sessions_after_drawdown_half_risk",
    description:
      "Halve index breakout risk in weak sessions once daily loss reaches 1%.",
    rules: [
      ...buildTargetedBehaviorRules({
        instruments: ["NAS100"],
        sessions: ["ny_open", "london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        minDailyLossPct: 1,
        riskMultiplier: 0.5,
        reason:
          "Behavior risk study halves NAS100 breakout continuation risk in weak sessions once daily loss reaches 1%.",
      }),
      ...buildTargetedBehaviorRules({
        instruments: ["US500"],
        sessions: ["pre_market"],
        setupTypes: ["breakout_continuation"],
        minDailyLossPct: 1,
        riskMultiplier: 0.5,
        reason:
          "Behavior risk study halves US500 pre-market breakout continuation risk once daily loss reaches 1%.",
      }),
    ],
  },
  {
    id: "nas100_breakout_weak_sessions_after_drawdown_half_risk",
    description:
      "Halve NAS100 breakout risk in ny_open and london_ny_overlap once daily loss reaches 1%.",
    rules: buildTargetedBehaviorRules({
      instruments: ["NAS100"],
      sessions: ["ny_open", "london_ny_overlap"],
      setupTypes: ["breakout_continuation"],
      minDailyLossPct: 1,
      riskMultiplier: 0.5,
      reason:
        "Behavior risk study halves NAS100 breakout continuation risk in weak sessions once daily loss reaches 1%.",
    }),
  },
  {
    id: "nas100_breakout_weak_sessions_non_a_after_drawdown_half_risk",
    description:
      "Halve only non-A NAS100 breakout risk in weak sessions once daily loss reaches 1%.",
    rules: buildTargetedBehaviorRules({
      instruments: ["NAS100"],
      sessions: ["ny_open", "london_ny_overlap"],
      setupTypes: ["breakout_continuation"],
      minDailyLossPct: 1,
      qualityGrades: ["B", "C", "D"],
      riskMultiplier: 0.5,
      reason:
        "Behavior risk study halves non-A NAS100 breakout continuation risk in weak sessions once daily loss reaches 1%.",
    }),
  },
  {
    id: "nas100_breakout_weak_sessions_medium_clarity_after_drawdown_half_risk",
    description:
      "Halve only medium-clarity NAS100 breakout risk in weak sessions once daily loss reaches 1%.",
    rules: buildTargetedBehaviorRules({
      instruments: ["NAS100"],
      sessions: ["ny_open", "london_ny_overlap"],
      setupTypes: ["breakout_continuation"],
      minDailyLossPct: 1,
      clarityLevels: ["medium"],
      riskMultiplier: 0.5,
      reason:
        "Behavior risk study halves medium-clarity NAS100 breakout continuation risk in weak sessions once daily loss reaches 1%.",
    }),
  },
  {
    id: "indices_breakout_weak_sessions_after_one_loss_soft_risk",
    description:
      "Soften index breakout risk in weak sessions after the first loss streak starts.",
    rules: [
      ...buildTargetedBehaviorRules({
        instruments: ["NAS100"],
        sessions: ["ny_open", "london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        minConsecutiveLosses: 1,
        riskMultiplier: 0.67,
        reason:
          "Behavior risk study softens NAS100 breakout continuation risk in weak sessions after the first loss streak starts.",
      }),
      ...buildTargetedBehaviorRules({
        instruments: ["US500"],
        sessions: ["pre_market"],
        setupTypes: ["breakout_continuation"],
        minConsecutiveLosses: 1,
        riskMultiplier: 0.67,
        reason:
          "Behavior risk study softens US500 pre-market breakout continuation risk after the first loss streak starts.",
      }),
    ],
  },
] as const;

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-behavior-risk-shaping-study-local-2020-2025-current_live_screen.json",
);
const runScreen = process.env.RUN_TRADING_BEHAVIOR_RISK_SHAPING_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_BEHAVIOR_RISK_SHAPING_ACTUAL_WF === "1" ? test : test.skip;
const requestedScreenScenarioIds = new Set(
  process.env.TRADING_BEHAVIOR_RISK_SHAPING_SCREEN_IDS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [],
);
const screeningScenarios =
  requestedScreenScenarioIds.size > 0
    ? SCENARIOS.filter((scenario) => requestedScreenScenarioIds.has(scenario.id))
    : SCENARIOS;
const activeScenarioId = process.env.TRADING_BEHAVIOR_RISK_SHAPING_SCENARIO_ID?.trim() ?? null;
const activeScenarios = activeScenarioId
  ? SCENARIOS.filter((scenario) => scenario.id === activeScenarioId)
  : SCENARIOS;
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  activeScenarioId
    ? `trading-behavior-risk-shaping-study-actual-walk-forward-${activeScenarioId}.json`
    : "trading-behavior-risk-shaping-study-actual-walk-forward.json",
);

const BASELINE_FULL_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const BASELINE_FULL_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_playbook_market_session_calibrated.json",
);
const CURRENT_INDICES_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-yearly-indices_mixed_soft_risk.json",
);
const CURRENT_INDICES_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-crisis-indices_mixed_soft_risk.json",
);
const CURRENT_NAS100_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-yearly.json",
);
const CURRENT_NAS100_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-crisis.json",
);

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
}

async function loadCurrentBaselineComparatives() {
  const baselineFullYearly = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_YEARLY_PATH,
  );
  const baselineFullCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_CRISIS_PATH,
  );
  const currentIndicesYearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_YEARLY_PATH,
  );
  const currentIndicesCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_CRISIS_PATH,
  );
  const currentNas100Yearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_YEARLY_PATH,
  );
  const currentNas100Crisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_CRISIS_PATH,
  );

  return {
    yearlyComparatives: [baselineFullYearly, currentIndicesYearly, currentNas100Yearly],
    crisisComparatives: [baselineFullCrisis, currentIndicesCrisis, currentNas100Crisis],
  };
}

describe("trading behavior risk shaping study", () => {
  runScreen(
    "screens behavior-aware risk shaping candidates against the current live baseline",
    { timeout: 1000 * 60 * 180 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: [...screeningScenarios],
        instruments: [...INSTRUMENTS],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "comparative_proxy",
        },
        baseline,
      });

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(SCREEN_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: SCREEN_OUTPUT,
            keepableScenarios: report.keepableScenarios,
            scoredScenarios: report.scenarios.map((scenario) => ({
              id: scenario.id,
              gates: scenario.gates,
              aggregateExpectancy: scenario.aggregate.current.expectancy,
              aggregateProfitFactor: scenario.aggregate.current.profitFactor,
              aggregateMaxDrawdown: scenario.aggregate.current.maxDrawdown,
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              crisisMaxDrawdown: scenario.crisis.current.maxDrawdown,
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
              walkForwardMaxDrawdown: scenario.walkForward.current.maxDrawdown,
            })),
          },
          null,
          2,
        ),
      );

      expect(report.scenarios.length).toBe(screeningScenarios.length);
    },
  );

  runActual(
    "runs coarse actual walk-forward for the selected behavior-aware risk shaping candidate",
    { timeout: 1000 * 60 * 240 },
    async () => {
      expect(activeScenarios.length).toBeGreaterThan(0);

      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: activeScenarios,
        instruments: [...INSTRUMENTS],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "actual",
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
          windowing: COARSE_WALK_FORWARD,
        },
        baseline,
      });

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(ACTUAL_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: ACTUAL_OUTPUT,
            keepableScenarios: report.keepableScenarios,
            scoredScenarios: report.scenarios.map((scenario) => ({
              id: scenario.id,
              gates: scenario.gates,
              aggregateExpectancy: scenario.aggregate.current.expectancy,
              aggregateProfitFactor: scenario.aggregate.current.profitFactor,
              aggregateMaxDrawdown: scenario.aggregate.current.maxDrawdown,
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              crisisMaxDrawdown: scenario.crisis.current.maxDrawdown,
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
              walkForwardMaxDrawdown: scenario.walkForward.current.maxDrawdown,
            })),
          },
          null,
          2,
        ),
      );

      expect(report.scenarios.length).toBe(activeScenarios.length);
    },
  );
});
