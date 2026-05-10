import path from "node:path";
import { readdir, writeFile } from "node:fs/promises";

import {
  runTradingHistoricalComparativeSweep,
  runTradingWalkForwardStudy,
  type TradingBacktestComparativeReport,
  type TradingWalkForwardStudyReport,
} from "@/lib/trading/backtest";
import { computeBacktestMetrics } from "@/lib/trading/backtest/metrics";
import type {
  TradingBacktestConfig,
  TradingBacktestTrade,
  TradingBacktestMarketSessionRule,
  TradingBacktestRiskRule,
} from "@/lib/trading/backtest/types";

import { ensureResearchBaselineSnapshot } from "./baseline";
import { decideResearchRun } from "./decisionEngine";
import { ensureDirectory, readJsonFile, stableStringify, writeJsonAtomic } from "./fs";
import { runResearchMonteCarloFromSlices } from "./monteCarlo";
import { evaluateResearchPortfolioStress } from "./portfolioStress";
import { evaluateResearchValidationGates } from "./validationGates";
import type {
  ResearchBundleCandidate,
  ResearchCampaignObjective,
  ResearchCampaignPerformanceEntry,
  ResearchBundleValidationReport,
  ResearchBundleValidationResult,
  ResearchConfig,
  ResearchMetricSummary,
  ResearchRunComparison,
  ResearchSupplementalValidation,
  ResearchTask,
  ResearchTaskScope,
  ResearchRunDecision,
  ResearchRankingBand,
} from "./types";

type ResearchBundleValidationDeps = {
  runComparative?: typeof runTradingHistoricalComparativeSweep;
  runWalkForward?: typeof runTradingWalkForwardStudy;
  now?: () => Date;
};

type ComparativeSlice = {
  trades: TradingBacktestTrade[];
  evaluatedBars: number;
};

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function resolveRankingBand(score: number): ResearchRankingBand {
  if (score >= 80) {
    return "elite_watch";
  }
  if (score >= 60) {
    return "strong";
  }
  if (score >= 35) {
    return "promising";
  }
  return "weak";
}

function applyPortfolioStressDecisionAdjustment(
  decision: ResearchRunDecision,
  portfolioStress: NonNullable<ResearchBundleValidationResult["portfolio_stress"]>,
): ResearchRunDecision {
  if (portfolioStress.passes) {
    return decision;
  }

  const adjustedScore =
    typeof decision.ranking?.score === "number" ? Math.max(0, decision.ranking.score - 12) : null;

  return {
    ...decision,
    decision: decision.decision === "promote" ? "candidate" : decision.decision,
    reason: `${decision.reason} ${portfolioStress.reason}`.trim(),
    ranking: decision.ranking
      ? {
          ...decision.ranking,
          score: adjustedScore ?? decision.ranking.score,
          band: resolveRankingBand(adjustedScore ?? decision.ranking.score),
          components: {
            ...decision.ranking.components,
            penalties: roundMetric(decision.ranking.components.penalties - 12) ?? decision.ranking.components.penalties,
          },
        }
      : decision.ranking,
  };
}

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct) ?? equity;
    values.push(equity);
  }

  return values;
}

function toMetricSummary(input: ResearchMetricSummary): ResearchMetricSummary {
  return {
    totalTrades: input.totalTrades,
    winRate: input.winRate,
    averageRiskReward: input.averageRiskReward,
    expectancy: input.expectancy,
    profitFactor: input.profitFactor,
    maxDrawdown: input.maxDrawdown,
  };
}

function toWalkForwardSummary(report: TradingWalkForwardStudyReport): ResearchMetricSummary {
  return {
    totalTrades: report.aggregate.totalTrades,
    winRate: report.aggregate.winRate,
    averageRiskReward: report.aggregate.averageRiskReward,
    expectancy: report.aggregate.expectancy,
    profitFactor: report.aggregate.profitFactor,
    maxDrawdown: report.aggregate.maxDrawdown,
  };
}

function arraysOverlap(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) {
    return true;
  }

  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function scopesCollide(left: ResearchTaskScope, right: ResearchTaskScope): boolean {
  return (
    arraysOverlap(left.instruments, right.instruments) &&
    arraysOverlap(left.sessions, right.sessions) &&
    arraysOverlap(left.setup_types, right.setup_types)
  );
}

function normalizeInstrumentList(tasks: ResearchTask[]): string[] {
  return Array.from(
    new Set(tasks.flatMap((task) => task.candidate_scope.instruments ?? [])),
  ).sort();
}

export function buildResearchTaskOpportunityKey(task: ResearchTask): string {
  const templateId =
    typeof task.planner_source?.template_id === "string" &&
    task.planner_source.template_id.trim().length > 0
      ? task.planner_source.template_id.trim()
      : null;

  if (templateId) {
    return `${task.baseline_id}::template::${templateId}`;
  }

  return `${task.baseline_id}::task::${task.type}::${stableStringify(task.candidate_scope)}::${stableStringify(task.candidate_mutation)}`;
}

function compareResearchTaskRecency(left: ResearchTask, right: ResearchTask): number {
  return (
    left.created_at.localeCompare(right.created_at) ||
    (left.started_at ?? "").localeCompare(right.started_at ?? "") ||
    (left.finished_at ?? "").localeCompare(right.finished_at ?? "") ||
    left.id.localeCompare(right.id)
  );
}

export function buildCurrentResearchTaskView(tasks: ResearchTask[]): ResearchTask[] {
  const latestByOpportunity = new Map<string, ResearchTask>();

  for (const task of tasks) {
    const key = buildResearchTaskOpportunityKey(task);
    const previous = latestByOpportunity.get(key);
    if (!previous || compareResearchTaskRecency(previous, task) < 0) {
      latestByOpportunity.set(key, task);
    }
  }

  return [...latestByOpportunity.values()];
}

function normalizeCampaignMetadata(tasks: ResearchTask[]): {
  campaignIds: string[];
  campaignObjectives: ResearchCampaignObjective[];
  primaryCampaignId: string | null;
  primaryCampaignObjective: ResearchCampaignObjective | null;
  campaignMode: "single" | "mixed" | "unknown";
} {
  const campaignIds = Array.from(
    new Set(
      tasks
        .map((task) => task.planner_source?.campaign_id ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const campaignObjectives = Array.from(
    new Set(
      tasks
        .map((task) => task.planner_source?.campaign_objective ?? null)
        .filter((value): value is ResearchCampaignObjective => Boolean(value)),
    ),
  ).sort();

  if (campaignIds.length === 0 && campaignObjectives.length === 0) {
    return {
      campaignIds,
      campaignObjectives,
      primaryCampaignId: null,
      primaryCampaignObjective: null,
      campaignMode: "unknown",
    };
  }

  if (campaignIds.length <= 1 && campaignObjectives.length <= 1) {
    return {
      campaignIds,
      campaignObjectives,
      primaryCampaignId: campaignIds[0] ?? null,
      primaryCampaignObjective: campaignObjectives[0] ?? null,
      campaignMode: "single",
    };
  }

  return {
    campaignIds,
    campaignObjectives,
    primaryCampaignId: null,
    primaryCampaignObjective: null,
    campaignMode: "mixed",
  };
}

function areBundleTasksCompatible(left: ResearchTask, right: ResearchTask): boolean {
  if (left.id === right.id) {
    return false;
  }

  if (left.baseline_id !== right.baseline_id) {
    return false;
  }

  if (!["risk_shaping", "context_filter"].includes(left.type) || !["risk_shaping", "context_filter"].includes(right.type)) {
    return false;
  }

  if (left.run_fingerprint && right.run_fingerprint && left.run_fingerprint === right.run_fingerprint) {
    return false;
  }

  return !scopesCollide(left.candidate_scope, right.candidate_scope);
}

function buildRiskRule(task: ResearchTask): TradingBacktestRiskRule | null {
  const mutation = task.candidate_mutation;
  if (task.type !== "risk_shaping") {
    return null;
  }
  if (mutation.kind !== "risk_multiplier" && mutation.kind !== "aggressive_risk_cap") {
    return null;
  }

  return {
    instrument: task.candidate_scope.instruments?.[0] ?? null,
    sessions: task.candidate_scope.sessions as any,
    setupTypes: task.candidate_scope.setup_types as any,
    riskModes: task.candidate_scope.risk_modes as any,
    executionStatuses: task.candidate_scope.execution_statuses as any,
    qualityGrades: task.candidate_scope.quality_grades as any,
    clarityLevels: task.candidate_scope.clarity_levels as any,
    environmentStates: task.candidate_scope.environment_states as any,
    riskPct: mutation.kind === "aggressive_risk_cap" ? mutation.value : null,
    riskMultiplier: mutation.kind === "risk_multiplier" ? mutation.value : null,
    reason: `Bundle member ${task.id}`,
  };
}

function buildContextRule(task: ResearchTask): TradingBacktestMarketSessionRule | null {
  if (task.type !== "context_filter" || task.candidate_mutation.kind !== "blocked_context") {
    return null;
  }

  return {
    instrument: task.candidate_scope.instruments?.[0] ?? null,
    sessions: task.candidate_scope.sessions as any,
    setupTypes: task.candidate_scope.setup_types as any,
    qualityGrades: task.candidate_scope.quality_grades as any,
    clarityLevels: task.candidate_scope.clarity_levels as any,
    environmentStates: task.candidate_scope.environment_states as any,
    reason: `Bundle member ${task.id}`,
  };
}

function buildBundleBacktestConfig(tasks: ResearchTask[]): TradingBacktestConfig {
  const riskRules = tasks
    .map((task) => buildRiskRule(task))
    .filter((rule): rule is TradingBacktestRiskRule => Boolean(rule));
  const contextRules = tasks
    .map((task) => buildContextRule(task))
    .filter((rule): rule is TradingBacktestMarketSessionRule => Boolean(rule));

  return {
    captureSteps: false,
    riskOverrides: riskRules.length > 0 ? { rules: riskRules } : null,
    marketSessionOverrides:
      contextRules.length > 0
        ? {
            blockedTradeValidContexts: contextRules,
          }
        : null,
  };
}

function collectComparativeSlice(
  report: TradingBacktestComparativeReport,
  instrumentFilter?: Set<string>,
): ComparativeSlice {
  const selectedMarkets = report.periods.flatMap((periodResult) =>
    periodResult.report.markets.filter(
      (market) => !instrumentFilter || instrumentFilter.has(market.instrument),
    ),
  );

  return {
    trades: selectedMarkets.flatMap((market) => market.report.trades),
    evaluatedBars: selectedMarkets.reduce((sum, market) => sum + market.report.period.evaluatedBars, 0),
  };
}

function computeSummaryFromSlice(slice: ComparativeSlice): ResearchMetricSummary {
  const metrics = computeBacktestMetrics({
    trades: slice.trades,
    evaluatedBars: slice.evaluatedBars,
    equityValues: buildEquityValues(slice.trades),
  });

  return {
    totalTrades: slice.trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function buildMergedSummary(args: {
  baselineFull: TradingBacktestComparativeReport;
  scenarioAffected: TradingBacktestComparativeReport;
  affectedInstruments: Set<string>;
}): ResearchMetricSummary {
  const baselineUnchanged = collectComparativeSlice(
    args.baselineFull,
    new Set(
      args.baselineFull.request.instruments.filter(
        (instrument) => !args.affectedInstruments.has(instrument),
      ),
    ),
  );
  const scenarioChanged = collectComparativeSlice(args.scenarioAffected, args.affectedInstruments);
  const mergedTrades = [...baselineUnchanged.trades, ...scenarioChanged.trades].sort(
    (left, right) => left.closedAt.localeCompare(right.closedAt),
  );

  return computeSummaryFromSlice({
    trades: mergedTrades,
    evaluatedBars: baselineUnchanged.evaluatedBars + scenarioChanged.evaluatedBars,
  });
}

async function runWalkForwardSummary(args: {
  config: ResearchConfig;
  instruments: string[];
  backtest?: TradingBacktestConfig;
  from: string;
  to: string;
  windowing?: ResearchConfig["study"]["walkForward"]["windowing"];
  runWalkForward: typeof runTradingWalkForwardStudy;
}): Promise<ResearchMetricSummary> {
  const report = await args.runWalkForward({
    instruments: args.instruments,
    from: args.from,
    to: args.to,
    timeframes: args.config.study.timeframes,
    sourcePreference: args.config.study.sourcePreference,
    backtest: args.backtest,
    windowing: args.windowing,
  });

  return toWalkForwardSummary(report);
}

export function buildResearchPromotionBundleCandidates(tasks: ResearchTask[]): ResearchBundleCandidate[] {
  const promotes = buildCurrentResearchTaskView(tasks)
    .filter((task) => task.status === "completed" && task.decision === "promote")
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  const output: ResearchBundleCandidate[] = [];

  for (let leftIndex = 0; leftIndex < promotes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < promotes.length; rightIndex += 1) {
      const left = promotes[leftIndex]!;
      const right = promotes[rightIndex]!;

      if (!areBundleTasksCompatible(left, right)) {
        continue;
      }

      const orderedTasks = [left, right].sort((a, b) => a.id.localeCompare(b.id));
      const campaignMetadata = normalizeCampaignMetadata(orderedTasks);
      output.push({
        id: `bundle-${orderedTasks.map((task) => task.id).join("__")}`,
        baseline_id: left.baseline_id,
        task_ids: orderedTasks.map((task) => task.id),
        task_types: orderedTasks.map((task) => task.type),
        affected_instruments: normalizeInstrumentList(orderedTasks),
        campaign_ids: campaignMetadata.campaignIds,
        campaign_objectives: campaignMetadata.campaignObjectives,
        primary_campaign_id: campaignMetadata.primaryCampaignId,
        primary_campaign_objective: campaignMetadata.primaryCampaignObjective,
        campaign_mode: campaignMetadata.campaignMode,
        tasks: orderedTasks,
      });
    }
  }

  return output.sort((left, right) => left.id.localeCompare(right.id));
}

function buildBundleCampaignPerformance(
  results: ResearchBundleValidationResult[],
): ResearchCampaignPerformanceEntry[] {
  const byCampaignKey = new Map<string, ResearchCampaignPerformanceEntry>();

  for (const result of results) {
    const campaignId =
      result.primary_campaign_id ??
      (result.campaign_ids.length === 1 ? result.campaign_ids[0]! : null);
    const objective =
      result.primary_campaign_objective ??
      (result.campaign_objectives.length === 1 ? result.campaign_objectives[0]! : null);

    if (!campaignId || !objective) {
      continue;
    }

    const current = byCampaignKey.get(campaignId) ?? {
      campaign_id: campaignId,
      objective,
      task_promotes: 0,
      task_candidates: 0,
      task_rejects_or_failed: 0,
      bundle_promotes: 0,
      bundle_candidates: 0,
      bundle_confirmed_count: 0,
      review_ready_count: 0,
      watchlist_count: 0,
      top_score: null,
      last_activity_at: null,
    };

    if (result.decision.decision === "promote") {
      current.bundle_promotes += 1;
      current.bundle_confirmed_count += 1;
      current.review_ready_count += 1;
    } else if (result.decision.decision === "candidate") {
      current.bundle_candidates += 1;
      current.watchlist_count += 1;
    } else {
      current.task_rejects_or_failed += 1;
    }

    const score = result.decision.ranking?.score ?? null;
    if (typeof score === "number") {
      current.top_score = current.top_score === null ? score : Math.max(current.top_score, score);
    }

    byCampaignKey.set(campaignId, current);
  }

  return [...byCampaignKey.values()].sort((left, right) => {
    return (
      right.bundle_confirmed_count - left.bundle_confirmed_count ||
      right.bundle_promotes - left.bundle_promotes ||
      (right.top_score ?? Number.NEGATIVE_INFINITY) - (left.top_score ?? Number.NEGATIVE_INFINITY) ||
      left.campaign_id.localeCompare(right.campaign_id)
    );
  });
}

function areBundleCandidateSetsEqual(
  left: ResearchBundleValidationReport["candidates"],
  right: ResearchBundleValidationReport["candidates"],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSignature = left
    .map((candidate) => `${candidate.bundle_id}::${candidate.task_ids.join(",")}`)
    .sort();
  const rightSignature = right
    .map((candidate) => `${candidate.bundle_id}::${candidate.task_ids.join(",")}`)
    .sort();

  return leftSignature.every((value, index) => value === rightSignature[index]);
}

export async function readLatestResearchBundleValidationReport(args: {
  config: ResearchConfig;
  baselineId?: string | null;
}): Promise<ResearchBundleValidationReport | null> {
  const bundleDir = path.join(args.config.paths.reportsDir, "bundles");

  try {
    const filenames = (await readdir(bundleDir))
      .filter((filename) => filename.endsWith(".json"))
      .sort();
    const reports = await Promise.all(
      filenames.map((filename) =>
        readJsonFile<ResearchBundleValidationReport>(path.join(bundleDir, filename)),
      ),
    );

    return (
      reports
        .filter((report) =>
          args.baselineId === undefined ? true : report.baseline_id === args.baselineId,
        )
        .sort((left, right) => right.generated_at.localeCompare(left.generated_at))[0] ?? null
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function validateResearchPromotionBundle(args: {
  config: ResearchConfig;
  candidate: ResearchBundleCandidate;
  deps?: ResearchBundleValidationDeps;
}): Promise<ResearchBundleValidationResult> {
  const baseline = await ensureResearchBaselineSnapshot(args.config);
  const runComparative = args.deps?.runComparative ?? runTradingHistoricalComparativeSweep;
  const runWalkForward = args.deps?.runWalkForward ?? runTradingWalkForwardStudy;
  const affectedInstruments = args.candidate.affected_instruments;
  const affectedSet = new Set(affectedInstruments);
  const backtest = buildBundleBacktestConfig(args.candidate.tasks);
  const yearlyCurrent = await runComparative({
    periods: args.config.study.yearlyPeriods,
    instruments: affectedInstruments,
    timeframes: args.config.study.timeframes,
    continueOnError: true,
    sourcePreference: args.config.study.sourcePreference,
    backtest,
  });
  const crisisCurrent = await runComparative({
    periods: args.config.study.crisisPeriods,
    instruments: affectedInstruments,
    timeframes: args.config.study.timeframes,
    continueOnError: true,
    sourcePreference: args.config.study.sourcePreference,
    backtest,
  });

  const aggregateBaseline = toMetricSummary(baseline.aggregateComparative.aggregate.summary);
  const crisisBaseline = toMetricSummary(baseline.crisisComparative.aggregate.summary);
  const aggregateCurrent = buildMergedSummary({
    baselineFull: baseline.aggregateComparative,
    scenarioAffected: yearlyCurrent,
    affectedInstruments: affectedSet,
  });
  const crisisCurrentSummary = buildMergedSummary({
    baselineFull: baseline.crisisComparative,
    scenarioAffected: crisisCurrent,
    affectedInstruments: affectedSet,
  });

  const walkForwardBaseline = await runWalkForwardSummary({
    config: args.config,
    instruments: affectedInstruments,
    from: args.config.study.walkForward.from,
    to: args.config.study.walkForward.to,
    windowing: args.config.study.walkForward.windowing,
    runWalkForward,
  });
  const walkForwardCurrent = await runWalkForwardSummary({
    config: args.config,
    instruments: affectedInstruments,
    backtest,
    from: args.config.study.walkForward.from,
    to: args.config.study.walkForward.to,
    windowing: args.config.study.walkForward.windowing,
    runWalkForward,
  });

  const robustness: ResearchSupplementalValidation = {};
  if (args.config.study.robustness?.holdout?.enabled) {
    robustness.holdout = {
      baseline: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        from: args.config.study.robustness.holdout.from,
        to: args.config.study.robustness.holdout.to,
        windowing: args.config.study.robustness.holdout.windowing,
        runWalkForward,
      }),
      current: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        backtest,
        from: args.config.study.robustness.holdout.from,
        to: args.config.study.robustness.holdout.to,
        windowing: args.config.study.robustness.holdout.windowing,
        runWalkForward,
      }),
    };
  }
  if (args.config.study.robustness?.perturbation?.enabled) {
    robustness.perturbation = {
      baseline: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        from: args.config.study.walkForward.from,
        to: args.config.study.walkForward.to,
        windowing: args.config.study.robustness.perturbation.windowing,
        runWalkForward,
      }),
      current: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        backtest,
        from: args.config.study.walkForward.from,
        to: args.config.study.walkForward.to,
        windowing: args.config.study.robustness.perturbation.windowing,
        runWalkForward,
      }),
    };
  }

  const thresholds = args.config.validationProfiles.default_live_safe.thresholds;
  const baselineAffectedSlice = collectComparativeSlice(baseline.aggregateComparative, affectedSet);
  const currentAffectedSlice = collectComparativeSlice(yearlyCurrent, affectedSet);
  let comparison: ResearchRunComparison = {
    aggregate: {
      baseline: aggregateBaseline,
      current: aggregateCurrent,
    },
    crisis: {
      baseline: crisisBaseline,
      current: crisisCurrentSummary,
    },
    walkForward: {
      baseline: walkForwardBaseline,
      current: walkForwardCurrent,
      affectedInstruments,
    },
    robustness,
    gates: evaluateResearchValidationGates({
      aggregateBaseline,
      aggregateCurrent,
      crisisBaseline,
      crisisCurrent: crisisCurrentSummary,
      walkForwardBaseline,
      walkForwardCurrent,
      holdoutBaseline: robustness.holdout?.baseline,
      holdoutCurrent: robustness.holdout?.current,
      finalHoldoutBaseline: robustness.finalHoldout?.baseline,
      finalHoldoutCurrent: robustness.finalHoldout?.current,
      perturbationBaseline: robustness.perturbation?.baseline,
      perturbationCurrent: robustness.perturbation?.current,
      thresholds,
    }),
  };

  if (args.config.study.robustness?.monteCarlo?.enabled && comparison.gates.allHardGatesPass) {
    robustness.monteCarlo = runResearchMonteCarloFromSlices({
      baselineSlice: collectComparativeSlice(baseline.aggregateComparative, affectedSet),
      currentSlice: collectComparativeSlice(yearlyCurrent, affectedSet),
      iterations: args.config.study.robustness.monteCarlo.iterations,
      percentile: args.config.study.robustness.monteCarlo.percentile,
      seed: args.config.study.robustness.monteCarlo.seed,
      label: args.candidate.id,
    });

    comparison = {
      ...comparison,
      robustness,
      gates: evaluateResearchValidationGates({
        aggregateBaseline,
        aggregateCurrent,
        crisisBaseline,
        crisisCurrent: crisisCurrentSummary,
        walkForwardBaseline,
        walkForwardCurrent,
        holdoutBaseline: robustness.holdout?.baseline,
        holdoutCurrent: robustness.holdout?.current,
        finalHoldoutBaseline: robustness.finalHoldout?.baseline,
        finalHoldoutCurrent: robustness.finalHoldout?.current,
        perturbationBaseline: robustness.perturbation?.baseline,
        perturbationCurrent: robustness.perturbation?.current,
        monteCarloBaseline: robustness.monteCarlo?.baseline,
        monteCarloCurrent: robustness.monteCarlo?.current,
        thresholds,
      }),
    };
  }

  if (args.config.study.robustness?.finalHoldout?.enabled && comparison.gates.allHardGatesPass) {
    robustness.finalHoldout = {
      baseline: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        from: args.config.study.robustness.finalHoldout.from,
        to: args.config.study.robustness.finalHoldout.to,
        windowing: args.config.study.robustness.finalHoldout.windowing,
        runWalkForward,
      }),
      current: await runWalkForwardSummary({
        config: args.config,
        instruments: affectedInstruments,
        backtest,
        from: args.config.study.robustness.finalHoldout.from,
        to: args.config.study.robustness.finalHoldout.to,
        windowing: args.config.study.robustness.finalHoldout.windowing,
        runWalkForward,
      }),
    };

    comparison = {
      ...comparison,
      robustness,
      gates: evaluateResearchValidationGates({
        aggregateBaseline,
        aggregateCurrent,
        crisisBaseline,
        crisisCurrent: crisisCurrentSummary,
        walkForwardBaseline,
        walkForwardCurrent,
        holdoutBaseline: robustness.holdout?.baseline,
        holdoutCurrent: robustness.holdout?.current,
        finalHoldoutBaseline: robustness.finalHoldout?.baseline,
        finalHoldoutCurrent: robustness.finalHoldout?.current,
        perturbationBaseline: robustness.perturbation?.baseline,
        perturbationCurrent: robustness.perturbation?.current,
        monteCarloBaseline: robustness.monteCarlo?.baseline,
        monteCarloCurrent: robustness.monteCarlo?.current,
        thresholds,
      }),
    };
  }

  const decision = decideResearchRun({
    runId: `bundle-${(args.deps?.now ?? (() => new Date()))().toISOString()}`,
    taskId: args.candidate.id,
    gates: comparison.gates,
    promotedMetrics: {
      aggregateExpectancy: comparison.aggregate.current.expectancy,
      crisisExpectancy: comparison.crisis.current.expectancy,
      walkForwardExpectancy: comparison.walkForward.current.expectancy,
      holdoutExpectancy: comparison.robustness?.holdout?.current.expectancy ?? null,
      finalHoldoutExpectancy: comparison.robustness?.finalHoldout?.current.expectancy ?? null,
      perturbationExpectancy: comparison.robustness?.perturbation?.current.expectancy ?? null,
      monteCarloExpectancy: comparison.robustness?.monteCarlo?.current.expectancy ?? null,
    },
    comparison,
  });
  const portfolioStress = evaluateResearchPortfolioStress({
    config: args.config,
    baselineTrades: baselineAffectedSlice.trades,
    baselineEvaluatedBars: baselineAffectedSlice.evaluatedBars,
    currentTrades: currentAffectedSlice.trades,
    currentEvaluatedBars: currentAffectedSlice.evaluatedBars,
  });
  const adjustedDecision =
    portfolioStress ? applyPortfolioStressDecisionAdjustment(decision, portfolioStress) : decision;

  return {
    bundle_id: args.candidate.id,
    baseline_id: args.candidate.baseline_id,
    task_ids: [...args.candidate.task_ids],
    affected_instruments: [...affectedInstruments],
    campaign_ids: [...args.candidate.campaign_ids],
    campaign_objectives: [...args.candidate.campaign_objectives],
    primary_campaign_id: args.candidate.primary_campaign_id,
    primary_campaign_objective: args.candidate.primary_campaign_objective,
    campaign_mode: args.candidate.campaign_mode,
    comparison,
    decision: adjustedDecision,
    portfolio_stress: portfolioStress,
  };
}

export async function buildResearchBundleValidationReport(args: {
  config: ResearchConfig;
  deps?: ResearchBundleValidationDeps;
}): Promise<ResearchBundleValidationReport> {
  const queue = await readJsonFile<{ live_baseline_id: string | null; tasks: ResearchTask[] }>(
    args.config.paths.queuePath,
  );
  const candidates = buildResearchPromotionBundleCandidates(queue.tasks);
  const results: ResearchBundleValidationResult[] = [];

  for (const candidate of candidates) {
    results.push(
      await validateResearchPromotionBundle({
        config: args.config,
        candidate,
        deps: args.deps,
      }),
    );
  }

  return {
    report_id: `bundle-validation-${(args.deps?.now ?? (() => new Date()))().toISOString()}`,
    generated_at: (args.deps?.now ?? (() => new Date()))().toISOString(),
    baseline_id: queue.live_baseline_id,
      candidate_count: candidates.length,
      candidates: candidates.map((candidate) => ({
        bundle_id: candidate.id,
        task_ids: candidate.task_ids,
        affected_instruments: candidate.affected_instruments,
        campaign_ids: candidate.campaign_ids,
        campaign_objectives: candidate.campaign_objectives,
        primary_campaign_id: candidate.primary_campaign_id,
        primary_campaign_objective: candidate.primary_campaign_objective,
        campaign_mode: candidate.campaign_mode,
      })),
      results,
      keepable_bundles: results
        .filter((result) => result.decision.decision !== "reject")
        .map((result) => ({
          bundle_id: result.bundle_id,
          decision: result.decision.decision,
          score: result.decision.ranking?.score ?? null,
          band: result.decision.ranking?.band ?? null,
          primary_campaign_id: result.primary_campaign_id,
          primary_campaign_objective: result.primary_campaign_objective,
          campaign_mode: result.campaign_mode,
          portfolio_stress_passed: result.portfolio_stress?.passes ?? null,
        })),
      campaign_performance: buildBundleCampaignPerformance(results),
  };
}

export async function writeResearchBundleValidationReport(args: {
  config: ResearchConfig;
  report: ResearchBundleValidationReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}> {
  const bundleDir = path.join(args.config.paths.reportsDir, "bundles");
  await ensureDirectory(bundleDir);
  const safeId = args.report.report_id.replace(/[:.]/g, "_");
  const jsonPath = path.join(bundleDir, `${safeId}.json`);
  const markdownPath = path.join(bundleDir, `${safeId}.md`);
  const latestJsonPath = path.join(bundleDir, "bundle-validation-latest.json");
  const latestMarkdownPath = path.join(bundleDir, "bundle-validation-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);
  const markdown = [
    `# Research Bundle Validation`,
    ``,
    `- Generated: ${args.report.generated_at}`,
    `- Baseline: ${args.report.baseline_id ?? "n/a"}`,
    `- Candidates: ${args.report.candidate_count}`,
    ``,
    `## Campaign Performance`,
    ...(args.report.campaign_performance.length > 0
      ? args.report.campaign_performance.map(
          (entry) =>
            `- ${entry.campaign_id} [${entry.objective}]: bundle_confirmed ${entry.bundle_confirmed_count}, bundle_promotes ${entry.bundle_promotes}, bundle_candidates ${entry.bundle_candidates}, top_score ${entry.top_score ?? "n/a"}`,
        )
      : ["- none"]),
    ``,
    `## Keepable Bundles`,
    ...(args.report.keepable_bundles.length > 0
      ? args.report.keepable_bundles.map(
          (entry) =>
            `- ${entry.bundle_id}: ${entry.decision} (${entry.score ?? "n/a"} / ${entry.band ?? "n/a"})` +
            `${entry.primary_campaign_id ? ` [${entry.primary_campaign_id}/${entry.primary_campaign_objective ?? "n/a"}]` : ""}` +
            ` [portfolio_stress=${entry.portfolio_stress_passed ?? "n/a"}]`,
        )
      : ["- none"]),
    ``,
    `## All Results`,
    ...(args.report.results.length > 0
      ? args.report.results.map(
          (entry) =>
            `- ${entry.bundle_id}: ${entry.decision.decision} (${entry.decision.reason})` +
            `${entry.portfolio_stress ? ` [portfolio_stress=${entry.portfolio_stress.passes}]` : ""}`,
        )
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  return {
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

export async function refreshResearchBundleValidationReportIfNeeded(args: {
  config: ResearchConfig;
  deps?: ResearchBundleValidationDeps;
}): Promise<{
  refreshed: boolean;
  report: ResearchBundleValidationReport | null;
  outputs:
    | {
        jsonPath: string;
        markdownPath: string;
        latestJsonPath: string;
        latestMarkdownPath: string;
      }
    | null;
}> {
  const queue = await readJsonFile<{ live_baseline_id: string | null; tasks: ResearchTask[] }>(
    args.config.paths.queuePath,
  );
  const currentCandidates = buildResearchPromotionBundleCandidates(queue.tasks);
  const currentCandidateSnapshot = currentCandidates.map((candidate) => ({
    bundle_id: candidate.id,
    task_ids: candidate.task_ids,
    affected_instruments: candidate.affected_instruments,
    campaign_ids: candidate.campaign_ids,
    campaign_objectives: candidate.campaign_objectives,
    primary_campaign_id: candidate.primary_campaign_id,
    primary_campaign_objective: candidate.primary_campaign_objective,
    campaign_mode: candidate.campaign_mode,
  }));

  if (currentCandidates.length === 0) {
    return {
      refreshed: false,
      report: await readLatestResearchBundleValidationReport({
        config: args.config,
        baselineId: queue.live_baseline_id,
      }),
      outputs: null,
    };
  }

  const latestReport = await readLatestResearchBundleValidationReport({
    config: args.config,
    baselineId: queue.live_baseline_id,
  });
  const isCurrent =
    latestReport !== null &&
    latestReport.baseline_id === queue.live_baseline_id &&
    areBundleCandidateSetsEqual(latestReport.candidates, currentCandidateSnapshot);

  if (isCurrent) {
    return {
      refreshed: false,
      report: latestReport,
      outputs: null,
    };
  }

  const report = await buildResearchBundleValidationReport(args);
  const outputs = await writeResearchBundleValidationReport({
    config: args.config,
    report,
  });

  return {
    refreshed: true,
    report,
    outputs,
  };
}
