import {
  runTradingContextBlockStudy,
  runTradingSecondLayerRiskStudy,
  type TradingBacktestConfig,
  type TradingContextBlockStudyMetricSummary,
  type TradingContextBlockStudyScenario,
  type TradingSecondLayerRiskStudyMetricSummary,
  type TradingSecondLayerRiskStudyScenario,
} from "@/lib/trading/backtest";
import type { TradingTimeframe } from "@/lib/trading/data";

import type {
  ResearchMetricSummary,
  ResearchSupplementalValidation,
  ResearchTaskExecutorContext,
} from "./types";

function toResearchMetricSummary(
  summary: TradingSecondLayerRiskStudyMetricSummary | TradingContextBlockStudyMetricSummary,
): ResearchMetricSummary {
  return {
    totalTrades: summary.totalTrades,
    winRate: summary.winRate,
    averageRiskReward: summary.averageRiskReward,
    expectancy: summary.expectancy,
    profitFactor: summary.profitFactor,
    maxDrawdown: summary.maxDrawdown,
  };
}

type ResearchRobustnessWalkForwardWindow = {
  from: string;
  to: string;
  windowing?: {
    primaryTimeframe?: TradingTimeframe | null;
    trainFraction?: number;
    testFraction?: number;
    minTrainBars?: number;
    minTestBars?: number;
  };
};

async function runRiskWalkForwardValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingSecondLayerRiskStudyScenario;
  instruments: string[];
  window: ResearchRobustnessWalkForwardWindow;
  backtest?: TradingBacktestConfig;
  useBaselineComparatives?: boolean;
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary }> {
  const report = await runTradingSecondLayerRiskStudy({
    yearlyPeriods: args.context.config.study.yearlyPeriods,
    crisisPeriods: args.context.config.study.crisisPeriods,
    scenarios: [args.scenario],
    instruments: args.instruments,
    timeframes: args.context.config.study.timeframes,
    sourcePreference: args.context.config.study.sourcePreference,
    walkForward: {
      mode: "actual",
      from: args.window.from,
      to: args.window.to,
      windowing: args.window.windowing,
    },
    backtest: {
      ...(args.backtest ?? {}),
      captureSteps: false,
    },
    baseline: args.useBaselineComparatives === false
      ? undefined
      : {
          yearlyComparatives: [args.context.baseline.aggregateComparative],
          crisisComparatives: [args.context.baseline.crisisComparative],
        },
  });

  const scenarioResult = report.scenarios[0];
  const walkKey = scenarioResult.affectedInstruments.slice().sort().join(",");
  return {
    baseline: toResearchMetricSummary(report.baseline.walkForwardByAffectedInstruments[walkKey]),
    current: toResearchMetricSummary(scenarioResult.walkForward.current),
  };
}

async function runContextWalkForwardValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingContextBlockStudyScenario;
  instruments: string[];
  window: ResearchRobustnessWalkForwardWindow;
  backtest?: TradingBacktestConfig;
  useBaselineComparatives?: boolean;
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary }> {
  const report = await runTradingContextBlockStudy({
    yearlyPeriods: args.context.config.study.yearlyPeriods,
    crisisPeriods: args.context.config.study.crisisPeriods,
    scenarios: [args.scenario],
    instruments: args.instruments,
    timeframes: args.context.config.study.timeframes,
    sourcePreference: args.context.config.study.sourcePreference,
    walkForward: {
      from: args.window.from,
      to: args.window.to,
      windowing: args.window.windowing,
    },
    backtest: {
      ...(args.backtest ?? {}),
      captureSteps: false,
    },
    baseline: args.useBaselineComparatives === false
      ? undefined
      : {
          yearlyComparatives: [args.context.baseline.aggregateComparative],
          crisisComparatives: [args.context.baseline.crisisComparative],
        },
  });

  const scenarioResult = report.scenarios[0];
  const walkKey = scenarioResult.affectedInstruments.slice().sort().join("|");
  return {
    baseline: toResearchMetricSummary(report.baseline.walkForwardByAffectedInstruments[walkKey]),
    current: toResearchMetricSummary(scenarioResult.walkForward.current),
  };
}

export async function runResearchRiskRobustnessValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingSecondLayerRiskStudyScenario;
  affectedInstruments: string[];
}): Promise<ResearchSupplementalValidation | null> {
  const robustness = args.context.config.study.robustness;
  if (!robustness?.holdout?.enabled && !robustness?.perturbation?.enabled) {
    return null;
  }

  const output: ResearchSupplementalValidation = {};

  if (robustness.holdout?.enabled) {
    output.holdout = await runRiskWalkForwardValidation({
      context: args.context,
      scenario: args.scenario,
      instruments: args.affectedInstruments,
      window: {
        from: robustness.holdout.from,
        to: robustness.holdout.to,
        windowing: robustness.holdout.windowing,
      },
    });
  }

  if (robustness.perturbation?.enabled) {
    output.perturbation = await runRiskWalkForwardValidation({
      context: args.context,
      scenario: args.scenario,
      instruments: args.affectedInstruments,
      window: {
        from: args.context.config.study.walkForward.from,
        to: args.context.config.study.walkForward.to,
        windowing: robustness.perturbation.windowing,
      },
    });
  }

  return output;
}

export async function runResearchRiskFinalHoldoutValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingSecondLayerRiskStudyScenario;
  affectedInstruments: string[];
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary } | null> {
  const finalHoldout = args.context.config.study.robustness?.finalHoldout;
  if (!finalHoldout?.enabled) {
    return null;
  }

  return runRiskWalkForwardValidation({
    context: args.context,
    scenario: args.scenario,
    instruments: args.affectedInstruments,
    window: {
      from: finalHoldout.from,
      to: finalHoldout.to,
      windowing: finalHoldout.windowing,
    },
  });
}

export async function runResearchContextRobustnessValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingContextBlockStudyScenario;
  affectedInstruments: string[];
}): Promise<ResearchSupplementalValidation | null> {
  const robustness = args.context.config.study.robustness;
  if (!robustness?.holdout?.enabled && !robustness?.perturbation?.enabled) {
    return null;
  }

  const output: ResearchSupplementalValidation = {};

  if (robustness.holdout?.enabled) {
    output.holdout = await runContextWalkForwardValidation({
      context: args.context,
      scenario: args.scenario,
      instruments: args.affectedInstruments,
      window: {
        from: robustness.holdout.from,
        to: robustness.holdout.to,
        windowing: robustness.holdout.windowing,
      },
    });
  }

  if (robustness.perturbation?.enabled) {
    output.perturbation = await runContextWalkForwardValidation({
      context: args.context,
      scenario: args.scenario,
      instruments: args.affectedInstruments,
      window: {
        from: args.context.config.study.walkForward.from,
        to: args.context.config.study.walkForward.to,
        windowing: robustness.perturbation.windowing,
      },
    });
  }

  return output;
}

export async function runResearchContextFinalHoldoutValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingContextBlockStudyScenario;
  affectedInstruments: string[];
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary } | null> {
  const finalHoldout = args.context.config.study.robustness?.finalHoldout;
  if (!finalHoldout?.enabled) {
    return null;
  }

  return runContextWalkForwardValidation({
    context: args.context,
    scenario: args.scenario,
    instruments: args.affectedInstruments,
    window: {
      from: finalHoldout.from,
      to: finalHoldout.to,
      windowing: finalHoldout.windowing,
    },
  });
}

function buildCostStressBacktest(roundTripCostR: number): TradingBacktestConfig {
  return {
    costModel: {
      roundTripCostR,
    },
  };
}

export async function runResearchRiskCostStressValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingSecondLayerRiskStudyScenario;
  affectedInstruments: string[];
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary } | null> {
  const costStress = args.context.config.study.robustness?.costStress;
  if (!costStress?.enabled) {
    return null;
  }

  return runRiskWalkForwardValidation({
    context: args.context,
    scenario: args.scenario,
    instruments: args.affectedInstruments,
    window: {
      from: args.context.config.study.walkForward.from,
      to: args.context.config.study.walkForward.to,
      windowing: args.context.config.study.walkForward.windowing,
    },
    backtest: buildCostStressBacktest(costStress.roundTripCostR),
    useBaselineComparatives: false,
  });
}

export async function runResearchContextCostStressValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingContextBlockStudyScenario;
  affectedInstruments: string[];
}): Promise<{ baseline: ResearchMetricSummary; current: ResearchMetricSummary } | null> {
  const costStress = args.context.config.study.robustness?.costStress;
  if (!costStress?.enabled) {
    return null;
  }

  return runContextWalkForwardValidation({
    context: args.context,
    scenario: args.scenario,
    instruments: args.affectedInstruments,
    window: {
      from: args.context.config.study.walkForward.from,
      to: args.context.config.study.walkForward.to,
      windowing: args.context.config.study.walkForward.windowing,
    },
    backtest: buildCostStressBacktest(costStress.roundTripCostR),
    useBaselineComparatives: false,
  });
}
