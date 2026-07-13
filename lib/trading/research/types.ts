import type { TradingBacktestComparativeReport } from "@/lib/trading/backtest/comparativeSweep";
import type { TradingContextBlockStudyReport } from "@/lib/trading/backtest/contextBlockStudy";
import type { TradingHistoricalPeriod } from "@/lib/trading/backtest/periods";
import type { TradingSecondLayerRiskStudyReport } from "@/lib/trading/backtest/secondLayerRiskStudy";
import type { TradingBacktestMarketSessionRule, TradingBacktestRiskRule } from "@/lib/trading/backtest/types";
import type { TradingHistoricalSourcePreference } from "@/lib/trading/backtest/datasets";
import type { TradingTimeframe } from "@/lib/trading/data";

export type ResearchTaskType =
  | "baseline_validation"
  | "risk_shaping"
  | "context_filter"
  | "session_nuance"
  | "clarity_threshold"
  | "behavior_control"
  | "promotion_apply";

export type ResearchTaskStatus =
  | "pending"
  | "running"
  | "awaiting_decision"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type ResearchDecision = "reject" | "candidate" | "promote";

export type ResearchFailureCategory =
  | "validation_gate"
  | "artifact_contract"
  | "runtime_timeout"
  | "runtime_fs"
  | "runtime_lock"
  | "runtime_os"
  | "data_quality"
  | "unsupported_task"
  | "unknown_runtime";

export type ResearchFailureForensics = {
  category: ResearchFailureCategory;
  confidence: "high" | "medium" | "low";
  summary: string;
};

export type ResearchCampaignObjective =
  | "increase_expectancy"
  | "improve_crisis"
  | "recover_frequency"
  | "reduce_drawdown";

export type ResearchRankingBand =
  | "weak"
  | "promising"
  | "strong"
  | "elite_watch";

export type ResearchCampaignMetadataSource = "recorded" | "task" | "library_backfill" | "missing";
export type ResearchRankingMetadataSource = "recorded" | "summary_backfill" | "missing";

export type ResearchPromotionRanking = {
  score: number;
  band: ResearchRankingBand;
  components: {
    aggregate: number;
    crisis: number;
    walkForward: number;
    robustness: number;
    penalties: number;
  };
};

export type ResearchIdleReason =
  | "candidate_library_empty"
  | "no_enabled_candidates"
  | "no_supported_candidates"
  | "no_valid_validation_profile"
  | "no_compatible_candidates_for_current_baseline"
  | "no_campaign_qualified_candidates"
  | "no_data_quality_qualified_candidates"
  | "all_candidates_deduped_for_current_baseline";

export type ResearchDatasetProfile = "core_20y" | "crisis_windows" | "walkforward_full";
export type ResearchValidationProfileId =
  | "default_live_safe"
  | "elite_push"
  | "frequency_annual_180_500_live_safe";

export type ResearchTaskScope = {
  instruments?: string[];
  sessions?: string[];
  setup_types?: string[];
  risk_modes?: string[];
  execution_statuses?: string[];
  quality_grades?: string[];
  clarity_levels?: string[];
  environment_states?: string[];
};

export type ResearchTaskMutation =
  | { kind: "risk_multiplier"; value: number }
  | { kind: "aggressive_risk_cap"; value: number }
  | { kind: "blocked_context" }
  | { kind: "clarity_minimum"; value: string }
  | { kind: "behavior_reduction_after_drawdown"; value: number };

export type ResearchEngineScope = {
  allowed_files: string[];
  live_mutation_allowed: boolean;
};

export type ResearchTask = {
  id: string;
  type: ResearchTaskType;
  status: ResearchTaskStatus;
  priority: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempt: number;
  max_attempts: number;
  retryable: boolean;
  baseline_id: string;
  dataset_profile: ResearchDatasetProfile;
  validation_profile: ResearchValidationProfileId;
  depends_on: string[];
  candidate_scope: ResearchTaskScope;
  candidate_mutation: ResearchTaskMutation;
  engine_scope: ResearchEngineScope;
  run_fingerprint: string | null;
  last_run_id: string | null;
  decision: ResearchDecision | null;
  decision_reason: string | null;
  error: string | null;
  notes: string | null;
  planner_source?: {
    family_id: string;
    template_id: string;
    campaign_id: string | null;
    campaign_objective: ResearchCampaignObjective | null;
    auto_enqueued: boolean;
  } | null;
};

export type ResearchQueue = {
  version: number;
  queue_id: string;
  updated_at: string;
  live_baseline_id: string | null;
  active_run_id: string | null;
  idle_reason: ResearchIdleReason | null;
  tasks: ResearchTask[];
};

export type ResearchLock = {
  version: number;
  run_id: string;
  task_id: string;
  runner_pid: number;
  hostname: string;
  started_at: string;
  heartbeat_at: string;
  stage: string;
  run_fingerprint: string;
  baseline_id: string;
};

export type ResearchMetricSummary = {
  totalTrades: number;
  annualizedTrades?: number | null;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type ResearchBaselineManifest = {
  baseline_id: string;
  created_at: string;
  dataset_profile: ResearchDatasetProfile;
  validation_profile: ResearchValidationProfileId;
  dataset_manifest_hash: string;
  engine_manifest_hash: string;
  dataset_snapshot_id: string;
  dataset_snapshot_version: string;
  source_artifacts: {
    aggregate: string;
    crisis: string;
    walkforward: string;
  };
  live_summary: ResearchMetricSummary;
  crisis_summary: ResearchMetricSummary;
};

export type ResearchRunManifest = {
  version: number;
  run_id: string;
  task_id: string;
  task_type: ResearchTaskType;
  baseline_id: string;
  run_fingerprint: string;
  started_at: string;
  dataset_profile: ResearchDatasetProfile;
  validation_profile: ResearchValidationProfileId;
  dataset_manifest_hash?: string;
  engine_manifest_hash?: string;
  dataset_snapshot_id?: string;
  dataset_snapshot_version?: string;
};

export type ResearchRunStatus = {
  run_id: string;
  task_id: string;
  status: "running" | "completed" | "failed";
  stage: "aggregate" | "crisis" | "walkforward" | "robustness" | "decision" | "completed" | "failed";
  started_at: string;
  updated_at: string;
  stage_started_at?: string;
  stage_elapsed_ms?: number;
  stage_warn_ms?: number | null;
  stage_hard_timeout_ms?: number | null;
  progress_note?: string | null;
  completed_stages: string[];
  failed_stage: string | null;
  error: string | null;
};

export type ResearchValidationThresholds = {
  epsilon: number;
  aggregateExpectancyMinDelta: number;
  aggregateProfitFactorMinDelta: number;
  crisisExpectancyMinDelta: number;
  crisisProfitFactorMinDelta: number;
  maxDrawdownMinImprovement: number;
  requireWalkForwardBreakEven: boolean;
  minAggregateTrades?: number;
  maxAggregateTrades?: number;
  minAnnualizedTrades?: number;
  maxAnnualizedTrades?: number;
  minAggregateTradeRetentionPct?: number;
  requireCrisisImprovementForPromotion?: boolean;
  requireHoldoutBreakEven?: boolean;
  requirePerturbationBreakEven?: boolean;
  requireMonteCarloBreakEven?: boolean;
  requireFinalHoldoutBreakEven?: boolean;
  requireCostStressBreakEven?: boolean;
  minDeflatedSharpeRatio?: number;
  maxPbo?: number;
  maxWhiteRealityCheckPValue?: number;
};

export type ResearchValidationProfile = {
  id: ResearchValidationProfileId;
  thresholds: ResearchValidationThresholds;
};

export type ResearchGateEvaluation = {
  aggregateExpectancyStable: boolean;
  aggregateProfitFactorStable: boolean;
  aggregateDrawdownStable: boolean;
  aggregateTradeCountStable?: boolean;
  annualizedTradeCadencePass?: boolean;
  aggregateTradeCadencePass?: boolean;
  crisisExpectancyStable: boolean;
  crisisProfitFactorStable: boolean;
  crisisDrawdownStable: boolean;
  walkForwardExpectancyStable: boolean;
  walkForwardProfitFactorStable: boolean;
  walkForwardDrawdownStable: boolean;
  walkForwardBreakEvenOrBetter: boolean;
  holdoutExpectancyStable?: boolean;
  holdoutProfitFactorStable?: boolean;
  holdoutDrawdownStable?: boolean;
  holdoutBreakEvenOrBetter?: boolean;
  finalHoldoutExpectancyStable?: boolean;
  finalHoldoutProfitFactorStable?: boolean;
  finalHoldoutDrawdownStable?: boolean;
  finalHoldoutBreakEvenOrBetter?: boolean;
  perturbationExpectancyStable?: boolean;
  perturbationProfitFactorStable?: boolean;
  perturbationDrawdownStable?: boolean;
  perturbationBreakEvenOrBetter?: boolean;
  monteCarloExpectancyStable?: boolean;
  monteCarloProfitFactorStable?: boolean;
  monteCarloDrawdownStable?: boolean;
  monteCarloBreakEvenOrBetter?: boolean;
  costStressExpectancyStable?: boolean;
  costStressProfitFactorStable?: boolean;
  costStressDrawdownStable?: boolean;
  costStressBreakEvenOrBetter?: boolean;
  deflatedSharpeRatioPass?: boolean;
  pboPass?: boolean;
  whiteRealityCheckPass?: boolean;
  statisticalValidationPass?: boolean;
  aggregateImproved: boolean;
  crisisImproved: boolean;
  walkForwardImproved: boolean;
  aggregatePromotionThresholdMet?: boolean;
  crisisPromotionThresholdMet?: boolean;
  drawdownPromotionThresholdMet?: boolean;
  promotionThresholdMet: boolean;
  allHardGatesPass: boolean;
};

export type ResearchStatisticalValidation = {
  sample_size: number;
  independent_trial_count: number;
  trade_level_sharpe_ratio: number | null;
  deflated_sharpe_ratio: number | null;
  pbo: {
    value: number | null;
    risk_band: "low" | "moderate" | "high" | "insufficient_data";
  };
  white_reality_check: {
    p_value: number | null;
    adjusted_p_value: number | null;
    bootstrap_iterations: number;
  };
  diagnostics: {
    out_of_sample_checks: Array<{
      label: string;
      expectancy: number | null;
      profit_factor: number | null;
      passed_break_even: boolean | null;
    }>;
    notes: string[];
  };
};

export type ResearchMonteCarloDiagnostics = {
  iterations: number;
  percentile: number;
  bootstrap: {
    pessimistic: ResearchMetricSummary;
    median: ResearchMetricSummary;
    worst: ResearchMetricSummary;
  };
  reshuffle: {
    pessimisticDrawdown: number;
    medianDrawdown: number;
    worstDrawdown: number;
  };
};

export type ResearchSupplementalValidationSummary = {
  baseline: ResearchMetricSummary;
  current: ResearchMetricSummary;
  diagnostics?: ResearchMonteCarloDiagnostics | null;
};

export type ResearchSupplementalValidation = {
  holdout?: ResearchSupplementalValidationSummary | null;
  finalHoldout?: ResearchSupplementalValidationSummary | null;
  perturbation?: ResearchSupplementalValidationSummary | null;
  monteCarlo?: ResearchSupplementalValidationSummary | null;
  costStress?: ResearchSupplementalValidationSummary | null;
};

export type ResearchRunComparison = {
  aggregate: {
    baseline: ResearchMetricSummary;
    current: ResearchMetricSummary;
  };
  crisis: {
    baseline: ResearchMetricSummary;
    current: ResearchMetricSummary;
  };
  walkForward: {
    baseline: ResearchMetricSummary;
    current: ResearchMetricSummary;
    affectedInstruments: string[];
  };
  robustness?: ResearchSupplementalValidation | null;
  statistical_validation?: ResearchStatisticalValidation | null;
  gates: ResearchGateEvaluation;
};

export type ResearchRunDecision = {
  run_id: string;
  task_id: string;
  decision: ResearchDecision;
  reason: string;
  gates: ResearchGateEvaluation;
  promoted_metrics: Record<string, number | null>;
  ranking?: ResearchPromotionRanking | null;
  failure_forensics?: ResearchFailureForensics | null;
  operational_failure?: boolean;
  failed_stage?: ResearchRunStatus["failed_stage"];
};

export type ResearchTaskExecutionArtifacts = {
  aggregateReport: unknown;
  crisisReport: unknown;
  walkForwardReport: unknown;
};

export type ResearchTaskExecutionResult = {
  affectedInstruments: string[];
  comparison: ResearchRunComparison;
  artifacts: ResearchTaskExecutionArtifacts;
};

export type ResearchRunnerPaths = {
  rootDir: string;
  queueDir: string;
  queuePath: string;
  lockPath: string;
  candidateLibraryPath: string;
  candidateReserveLibraryPath?: string;
  campaignLibraryPath?: string;
  coverageAuditPath?: string;
  baselinesDir: string;
  runsDir: string;
  reportsDir: string;
  decisionsPath: string;
  runIndexDir: string;
  fingerprintIndexDir: string;
};

export type ResearchLiveBaselineSource = {
  baselineId: string;
  datasetProfile: ResearchDatasetProfile;
  validationProfile: ResearchValidationProfileId;
  aggregateComparativePath: string;
  crisisComparativePath: string;
  walkforwardBaselinePath?: string | null;
  engineManifestFiles: string[];
};

export type ResearchStudyConfig = {
  yearlyPeriods?: TradingHistoricalPeriod[];
  yearlyPeriodAutoRange?: {
    enabled: boolean;
    startYear: number;
    endYear?: number | null;
    deriveEndYearFrom?: "walk_forward_to" | "holdout_to" | "final_holdout_to";
  };
  crisisPeriods: TradingHistoricalPeriod[];
  instruments: string[];
  timeframes: TradingTimeframe[];
  sourcePreference: TradingHistoricalSourcePreference;
  datasetLocalDataRoot?: string | null;
  datasetTimezone?: string | null;
  providerComparability?: {
    canonicalProvider: string;
    fallbackProviders: string[];
    preserveProvenance: boolean;
  };
  adjustmentPolicies?: Partial<Record<string, {
    splits: "not_applicable" | "raw" | "adjusted" | "unknown";
    dividends: "not_applicable" | "raw" | "adjusted" | "unknown";
    note?: string | null;
  }>>;
  walkForward: {
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
  robustness?: {
    holdout?: {
      enabled: boolean;
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
    finalHoldout?: {
      enabled: boolean;
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
    perturbation?: {
      enabled: boolean;
      windowing?: {
        primaryTimeframe?: TradingTimeframe | null;
        trainFraction?: number;
        testFraction?: number;
        minTrainBars?: number;
        minTestBars?: number;
      };
    };
    monteCarlo?: {
      enabled: boolean;
      iterations: number;
      percentile: number;
      seed: number;
    };
    costStress?: {
      enabled: boolean;
      roundTripCostR: number;
    };
    portfolioStress?: {
      enabled: boolean;
      maxConcurrentTrades: number;
      maxOverlapRatio: number;
      maxDrawdownTolerance: number;
    };
  };
};

export type ResearchConfig = {
  version: number;
  queueId: string;
  paths: ResearchRunnerPaths;
  timing: {
    heartbeatIntervalMs: number;
    staleLockMs: number;
    hungLockMs: number;
    stageWarnMs?: number;
    stageHardTimeoutMs?: number;
  };
  automation: {
    pollIntervalMs: number;
    idleIntervalMs: number;
    errorBackoffMs: number;
    reportIntervalMs?: number;
    templateCooldown?: {
      enabled: boolean;
      maxRecentRejects: number;
      decisionWindowSize: number;
    };
    campaignQuota?: {
      enabled: boolean;
      maxSelectionsPerWindow: number;
      decisionWindowSize: number;
    };
    familyQuota?: {
      enabled: boolean;
      maxSelectionsPerWindow: number;
      decisionWindowSize: number;
    };
    autoRefuel?: {
      enabled: boolean;
      maxAdditionsPerRefuel?: number;
    };
  };
  liveBaselineSource: ResearchLiveBaselineSource;
  validationProfiles: Record<ResearchValidationProfileId, ResearchValidationProfile>;
  study: ResearchStudyConfig;
};

export type ResearchDecisionLedgerEntry = {
  event_id: string;
  timestamp: string;
  run_id: string;
  task_id: string;
  baseline_id: string;
  run_fingerprint: string;
  decision: ResearchDecision | "failed";
  reason: string;
  aggregate_summary?: ResearchMetricSummary | null;
  crisis_summary?: ResearchMetricSummary | null;
  walkforward_summary?: ResearchMetricSummary | null;
  error?: string | null;
  planner_family_id?: string | null;
  planner_template_id?: string | null;
  planner_campaign_id?: string | null;
  planner_campaign_objective?: ResearchCampaignObjective | null;
  ranking_score?: number | null;
  ranking_band?: ResearchRankingBand | null;
  failure_forensics?: ResearchFailureForensics | null;
};

export type ResearchDailyReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  live_baseline_id: string | null;
  runs_started: number;
  runs_completed: number;
  runs_failed: number;
  promoted: Array<{
    task_id: string;
    run_id: string;
    summary: string;
  }>;
  candidates: Array<{
    task_id: string;
    run_id: string;
    summary: string;
  }>;
  rejected: Array<{
    task_id: string;
    run_id: string;
    reason: string;
  }>;
  queue_snapshot: ResearchQueueSnapshot;
  idle_reason: ResearchIdleReason | null;
  live_state_after_promotions: ResearchMetricSummary | null;
  crisis_state_after_promotions: ResearchMetricSummary | null;
  next_planned_task_id: string | null;
  fuel_status: ResearchPlannerFuelStatus;
  dataset_health: ResearchDatasetHealthSummary;
  top_promotions: Array<{
    task_id: string;
    run_id: string;
    score: number;
    band: ResearchRankingBand;
  }>;
  failure_forensics_summary: Partial<Record<ResearchFailureCategory, number>>;
};

export type ResearchWindowReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  interval_hours: number;
  window_started_at: string;
  window_finished_at: string;
  live_baseline_id: string | null;
  runs_started: number;
  runs_completed: number;
  runs_failed: number;
  promoted: Array<{
    task_id: string;
    run_id: string;
    summary: string;
  }>;
  candidates: Array<{
    task_id: string;
    run_id: string;
    summary: string;
  }>;
  rejected: Array<{
    task_id: string;
    run_id: string;
    reason: string;
  }>;
  queue_snapshot: ResearchQueueSnapshot;
  idle_reason: ResearchIdleReason | null;
  live_state_after_promotions: ResearchMetricSummary | null;
  crisis_state_after_promotions: ResearchMetricSummary | null;
  next_planned_task_id: string | null;
  fuel_status: ResearchPlannerFuelStatus;
  dataset_health: ResearchDatasetHealthSummary;
  top_promotions: Array<{
    task_id: string;
    run_id: string;
    score: number;
    band: ResearchRankingBand;
  }>;
  failure_forensics_summary: Partial<Record<ResearchFailureCategory, number>>;
};

export type ResearchQueueSnapshot = {
  pending: number;
  running: number;
  blocked: number;
  failed: number;
};

export type ResearchCycleReportEntry = {
  task_id: string;
  run_id: string;
  decision: ResearchDecision | "failed";
  reason: string;
  planner_family_id: string | null;
  planner_template_id: string | null;
  planner_campaign_id: string | null;
  planner_campaign_objective: ResearchCampaignObjective | null;
  ranking_score: number | null;
  ranking_band: ResearchRankingBand | null;
  failure_category: ResearchFailureCategory | null;
};

export type ResearchCycleReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  cycle_id: string;
  generated_at: string;
  started_at: string;
  finished_at: string;
  live_baseline_id: string | null;
  processed_run_ids: string[];
  auto_enqueued_task_ids: string[];
  runs: ResearchCycleReportEntry[];
  queue_snapshot: ResearchQueueSnapshot;
  idle_reason: ResearchIdleReason | null;
  next_planned_task_id: string | null;
  fuel_status: ResearchPlannerFuelStatus;
  dataset_health: ResearchDatasetHealthSummary;
  top_promotions: Array<{
    task_id: string;
    run_id: string;
    score: number;
    band: ResearchRankingBand;
  }>;
  failure_forensics_summary: Partial<Record<ResearchFailureCategory, number>>;
};

export type ResearchBundleCandidate = {
  id: string;
  baseline_id: string;
  task_ids: string[];
  task_types: ResearchTaskType[];
  affected_instruments: string[];
  campaign_ids: string[];
  campaign_objectives: ResearchCampaignObjective[];
  primary_campaign_id: string | null;
  primary_campaign_objective: ResearchCampaignObjective | null;
  campaign_mode: "single" | "mixed" | "unknown";
  tasks: ResearchTask[];
};

export type ResearchBundleValidationResult = {
  bundle_id: string;
  baseline_id: string;
  task_ids: string[];
  affected_instruments: string[];
  campaign_ids: string[];
  campaign_objectives: ResearchCampaignObjective[];
  primary_campaign_id: string | null;
  primary_campaign_objective: ResearchCampaignObjective | null;
  campaign_mode: "single" | "mixed" | "unknown";
  comparison: ResearchRunComparison;
  decision: ResearchRunDecision;
  portfolio_stress?: ResearchPortfolioStressResult | null;
};

export type ResearchCampaignPerformanceEntry = {
  campaign_id: string;
  objective: ResearchCampaignObjective;
  task_promotes: number;
  task_candidates: number;
  task_rejects_or_failed: number;
  bundle_promotes: number;
  bundle_candidates: number;
  bundle_confirmed_count: number;
  review_ready_count: number;
  watchlist_count: number;
  top_score: number | null;
  last_activity_at: string | null;
};

export type ResearchPortfolioStressDiagnostics = {
  cluster_count: number;
  overlapping_trade_count: number;
  overlap_ratio: number;
  max_concurrent_trades: number;
  stressed_max_drawdown: number;
};

export type ResearchPortfolioStressResult = {
  baseline: ResearchPortfolioStressDiagnostics;
  current: ResearchPortfolioStressDiagnostics;
  passes: boolean;
  reason: string;
};

export type ResearchBundleValidationReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  baseline_id: string | null;
  candidate_count: number;
  candidates: Array<{
    bundle_id: string;
    task_ids: string[];
    affected_instruments: string[];
    campaign_ids: string[];
    campaign_objectives: ResearchCampaignObjective[];
    primary_campaign_id: string | null;
    primary_campaign_objective: ResearchCampaignObjective | null;
    campaign_mode: "single" | "mixed" | "unknown";
  }>;
  results: ResearchBundleValidationResult[];
  keepable_bundles: Array<{
    bundle_id: string;
    decision: ResearchDecision;
    score: number | null;
    band: ResearchRankingBand | null;
    primary_campaign_id: string | null;
    primary_campaign_objective: ResearchCampaignObjective | null;
    campaign_mode: "single" | "mixed" | "unknown";
    portfolio_stress_passed: boolean | null;
    statistical_validation_passed: boolean | null;
  }>;
  campaign_performance: ResearchCampaignPerformanceEntry[];
};

export type ResearchPromotionBoardEntrySource = "task" | "bundle";

export type ResearchPromotionBoardStatus =
  | "watchlist"
  | "review_ready"
  | "bundle_confirmed";

export type ResearchPromotionBoardEntry = {
  entry_id: string;
  source: ResearchPromotionBoardEntrySource;
  baseline_id: string;
  task_ids: string[];
  campaign_ids: string[];
  campaign_objectives: ResearchCampaignObjective[];
  primary_campaign_id: string | null;
  primary_campaign_objective: ResearchCampaignObjective | null;
  campaign_metadata_source: ResearchCampaignMetadataSource;
  campaign_mode: "single" | "mixed" | "unknown";
  run_id: string | null;
  decision: ResearchDecision;
  board_status: ResearchPromotionBoardStatus;
  summary: string;
  score: number | null;
  band: ResearchRankingBand | null;
  ranking_metadata_source: ResearchRankingMetadataSource;
  portfolio_stress_passed?: boolean | null;
  portfolio_stress_overlap_ratio?: number | null;
  portfolio_stress_max_concurrent?: number | null;
  statistical_validation_passed?: boolean | null;
  deflated_sharpe_ratio?: number | null;
  pbo_estimate?: number | null;
  white_reality_check_p_value?: number | null;
  aggregate_summary: ResearchMetricSummary | null;
  crisis_summary: ResearchMetricSummary | null;
  walkforward_summary: ResearchMetricSummary | null;
  generated_at: string;
};

export type ResearchPromotionBoardReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  live_baseline_id: string | null;
  summary: {
    task_promotes: number;
    task_candidates: number;
    bundle_promotes: number;
    bundle_candidates: number;
    review_ready_count: number;
    watchlist_count: number;
    bundle_confirmed_count: number;
  };
  campaign_performance: ResearchCampaignPerformanceEntry[];
  entries: ResearchPromotionBoardEntry[];
  top_review_ready: Array<{
    entry_id: string;
    source: ResearchPromotionBoardEntrySource;
    primary_campaign_id: string | null;
    primary_campaign_objective: ResearchCampaignObjective | null;
    score: number | null;
    band: ResearchRankingBand | null;
    board_status: ResearchPromotionBoardStatus;
    portfolio_stress_passed: boolean | null;
    statistical_validation_passed: boolean | null;
  }>;
};

export type ResearchPromotionPackageRunArtifact = {
  task_id: string;
  run_id: string;
  manifest_path: string | null;
  comparison_path: string | null;
  decision_path: string | null;
  manifest_artifact_id: string | null;
  manifest_artifact_version: string | null;
  comparison_artifact_id: string | null;
  comparison_artifact_version: string | null;
  decision_artifact_id: string | null;
  decision_artifact_version: string | null;
};

export type ResearchPromotionPackageArtifactLinks = {
  board_report_id: string;
  board_json_path: string | null;
  board_markdown_path: string | null;
  bundle_report_id: string | null;
  bundle_json_path: string | null;
  bundle_markdown_path: string | null;
  registry_report_id: string | null;
  registry_json_path: string | null;
  run_artifacts: ResearchPromotionPackageRunArtifact[];
};

export type ResearchPromotionPackageReview = {
  ready_for_live_review: boolean;
  blockers: string[];
  cautions: string[];
  checklist: string[];
};

export type ResearchPromotionPackage = {
  package_id: string;
  generated_at: string;
  baseline_id: string;
  entry_id: string;
  source: ResearchPromotionBoardEntrySource;
  board_status: ResearchPromotionBoardStatus;
  decision: ResearchDecision;
  summary: string;
  task_ids: string[];
  campaign_ids: string[];
  campaign_objectives: ResearchCampaignObjective[];
  primary_campaign_id: string | null;
  primary_campaign_objective: ResearchCampaignObjective | null;
  campaign_metadata_source: ResearchCampaignMetadataSource;
  campaign_mode: "single" | "mixed" | "unknown";
  run_id: string | null;
  score: number | null;
  band: ResearchRankingBand | null;
  ranking_metadata_source: ResearchRankingMetadataSource;
  portfolio_stress_passed: boolean | null;
  portfolio_stress_overlap_ratio: number | null;
  portfolio_stress_max_concurrent: number | null;
  statistical_validation_passed: boolean | null;
  deflated_sharpe_ratio: number | null;
  pbo_estimate: number | null;
  white_reality_check_p_value: number | null;
  aggregate_summary: ResearchMetricSummary | null;
  crisis_summary: ResearchMetricSummary | null;
  walkforward_summary: ResearchMetricSummary | null;
  review: ResearchPromotionPackageReview;
  artifacts: ResearchPromotionPackageArtifactLinks;
};

export type ResearchPromotionPackageReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  live_baseline_id: string | null;
  summary: {
    package_count: number;
    review_ready_count: number;
    bundle_confirmed_count: number;
    ready_for_live_review_count: number;
    blocked_count: number;
  };
  packages: ResearchPromotionPackage[];
};

export type ResearchOpportunityReviewItem = {
  entry_id: string;
  package_id: string;
  task_id: string;
  source: ResearchPromotionBoardEntrySource;
  board_status: ResearchPromotionBoardStatus;
  decision: ResearchDecision;
  primary_campaign_id: string | null;
  primary_campaign_objective: ResearchCampaignObjective | null;
  isolated_decision: ResearchDecision;
  isolated_reason: string;
  isolated_score: number | null;
  isolated_band: ResearchRankingBand | null;
  comparison: ResearchRunComparison;
  package_ready_for_live_review: boolean;
};

export type ResearchOpportunityReviewBundle =
  | {
      status: "validated";
      reason: string;
      bundle_id: string;
      task_ids: string[];
      decision: ResearchRunDecision;
      comparison: ResearchRunComparison;
      portfolio_stress: ResearchPortfolioStressResult | null;
    }
  | {
      status: "incompatible" | "insufficient_candidates";
      reason: string;
      bundle_id: null;
      task_ids: string[];
      decision: null;
      comparison: null;
      portfolio_stress: null;
    };

export type ResearchOpportunityReviewReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  live_baseline_id: string | null;
  source_board_report_id: string;
  source_package_report_id: string;
  source_registry_report_id: string | null;
  summary: {
    reviewed_item_count: number;
    isolated_promote_count: number;
    isolated_candidate_count: number;
    isolated_reject_count: number;
    package_ready_for_live_review_count: number;
    bundle_status: ResearchOpportunityReviewBundle["status"];
  };
  items: ResearchOpportunityReviewItem[];
  bundle: ResearchOpportunityReviewBundle;
};

export type ResearchPaperPromotionScope = {
  package_id: string;
  entry_id: string;
  task_id: string;
  source: ResearchPromotionBoardEntrySource;
  baseline_id: string;
  instrument: string | null;
  sessions: string[];
  setup_types: string[];
  risk_modes: string[];
  execution_statuses: string[];
  quality_grades: string[];
  clarity_levels: string[];
  environment_states: string[];
  package_ready_for_live_review: boolean;
};

export type ResearchPaperPromotionSnapshot = {
  generated_at: string;
  live_baseline_id: string | null;
  ready_package_count: number;
  executable_task_scope_count: number;
  bundle_only_ready_package_count: number;
  scopes: ResearchPaperPromotionScope[];
};

export type ResearchPaperPromotionApproval = {
  approved: boolean;
  source: "local_artifact" | "remote_state" | "missing";
  reason: string;
  snapshot: ResearchPaperPromotionSnapshot | null;
  matched_scope: ResearchPaperPromotionScope | null;
  candidate_summary: {
    instrument: string | null;
    session: string | null;
    setup_type: string | null;
    risk_mode: string | null;
    execution_status: string | null;
    quality_grade: string | null;
    clarity_level: string | null;
    environment_state: string | null;
  };
};

export type ResearchPaperPromotionCandidateSummary =
  ResearchPaperPromotionApproval["candidate_summary"];

export type ResearchDatasetHealthStatus =
  | "eligible"
  | "degraded"
  | "failed"
  | "missing";

export type ResearchDatasetHealthInstrumentEntry = {
  instrument: string;
  configured: boolean;
  audited: boolean;
  status: ResearchDatasetHealthStatus;
  valid_periods: number;
  invalid_periods: number;
  failed_periods: number;
  sources: string[];
};

export type ResearchDatasetHealthSummary = {
  audit_loaded: boolean;
  audit_generated_at: string | null;
  configured_instrument_count: number;
  audited_instrument_count: number;
  eligible_instrument_count: number;
  degraded_instrument_count: number;
  failed_instrument_count: number;
  missing_instrument_count: number;
  suspended_instrument_count: number;
  eligible_instruments: string[];
  suspended_instruments: string[];
  missing_instruments: string[];
};

export type ResearchDatasetHealthReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  coverage_audit_path: string | null;
  summary: ResearchDatasetHealthSummary;
  instruments: ResearchDatasetHealthInstrumentEntry[];
};

export type ResearchReportFileOutput = {
  jsonPath: string;
  markdownPath: string;
};

export type ResearchRegistryDatasetStatus =
  | "ready"
  | "degraded"
  | "missing";

export type ResearchDatasetReference = {
  dataset_id: string;
  dataset_version: string;
  status: ResearchRegistryDatasetStatus;
  generated_at: string | null;
  source_path: string | null;
  snapshot_id?: string | null;
  content_address?: string | null;
  checksum?: string | null;
};

export type ResearchReportProvenance = {
  owner: "research_lab";
  config_path: string;
  live_baseline_id: string | null;
  dataset_manifest_hash: string | null;
  engine_manifest_hash: string | null;
  dataset_refs: ResearchDatasetReference[];
  upstream_report_ids: string[];
};

export type ResearchRegistryDatasetEntry = {
  dataset_id: string;
  dataset_version: string;
  kind:
    | "coverage_audit"
    | "active_research_universe"
    | "market_data_backfill"
    | "market_data_harvest"
    | "scientific_snapshot";
  owner: "research_lab";
  status: ResearchRegistryDatasetStatus;
  source_path: string | null;
  generated_at: string | null;
  snapshot_id?: string | null;
  content_address?: string | null;
  data_plane: {
    tier: "bronze" | "silver" | "gold";
    storage: {
      kind: "local_file" | "report_artifact" | "derived_manifest" | "catalog" | "content_addressed_snapshot";
      primary_root: string | null;
      secondary_root: string | null;
      format: string | null;
    };
    coverage: {
      scoped_items: number | null;
      ready_items: number | null;
      gap_items: number | null;
      coverage_ratio: number | null;
      gap_detected: boolean;
    };
    provider_quality: {
      providers: string[];
      quality_gates: string[];
      source_mode: "local_only" | "mixed" | "provider_catalog" | "derived";
    };
    integrity: {
      source_checksum: string | null;
      verification_status: "verified" | "pending" | "failed" | "not_applicable";
      verified_items: number;
      pending_items: number;
      failed_items: number;
    };
  };
  lineage: {
    config_paths: string[];
    artifact_paths: string[];
  };
  payload: Record<string, unknown>;
};

export type ResearchScientificDatasetFileRef = {
  path: string;
  sha256: string;
  size_bytes: number;
  line_count: number;
  modified_at: string;
};

export type ResearchScientificDatasetInstrumentSnapshot = {
  instrument: string;
  dataset_id: string;
  selected_provider: string;
  provider_candidates: string[];
  universe: string;
  market_type: string;
  session_profile: string;
  source_preference: TradingHistoricalSourcePreference;
  symbols: Array<{
    symbol: string;
    relation: "direct" | "proxy";
    label?: string | null;
  }>;
  selected_symbol: string;
  selected_symbol_relation: "direct" | "proxy";
  timeframe_base: TradingTimeframe | "1m";
  timeframes: TradingTimeframe[];
  from: string;
  to: string;
  timezone: string;
  adjustment_policy: {
    splits: "not_applicable" | "raw" | "adjusted" | "unknown";
    dividends: "not_applicable" | "raw" | "adjusted" | "unknown";
    note: string | null;
  };
  row_counts: Partial<Record<TradingTimeframe, number>>;
  files: ResearchScientificDatasetFileRef[];
  comparability: {
    canonical_provider: string;
    fallback_providers: string[];
    preserve_provenance: boolean;
  };
};

export type ResearchScientificDatasetSnapshot = {
  schema_version: "research.scientific-dataset-snapshot.v1";
  snapshot_id: string;
  dataset_id: string;
  dataset_version: string;
  created_at: string;
  dataset_profile: ResearchDatasetProfile;
  source_preference: TradingHistoricalSourcePreference;
  timezone: string;
  universe: string;
  periods: {
    yearly: TradingHistoricalPeriod[];
    crisis: TradingHistoricalPeriod[];
    walk_forward: ResearchStudyConfig["walkForward"];
    robustness: ResearchStudyConfig["robustness"] | null;
  };
  instruments: ResearchScientificDatasetInstrumentSnapshot[];
  provider_matrix: {
    canonical_provider: string;
    fallback_providers: string[];
    selected_providers: string[];
  };
  content_address: string;
};

export type ResearchRegistryArtifactEntry = {
  artifact_id: string;
  artifact_version: string | null;
  run_id: string;
  task_id: string | null;
  artifact_type:
    | "manifest"
    | "input"
    | "status"
    | "aggregate_report"
    | "crisis_report"
    | "walkforward_report"
    | "comparison"
    | "decision"
    | "checksums";
  path: string;
  generated_at: string | null;
  owner: "research_lab";
  lineage: {
    dataset_ids: string[];
    depends_on_artifact_ids: string[];
  };
};

export type ResearchRegistryReport = {
  schema_version: string;
  provenance: ResearchReportProvenance;
  report_id: string;
  generated_at: string;
  summary: {
    dataset_count: number;
    ready_dataset_count: number;
    degraded_dataset_count: number;
    missing_dataset_count: number;
    bronze_dataset_count: number;
    silver_dataset_count: number;
    gold_dataset_count: number;
    gap_dataset_count: number;
    verified_dataset_count: number;
    artifact_count: number;
    run_count: number;
  };
  datasets: ResearchRegistryDatasetEntry[];
  artifacts: ResearchRegistryArtifactEntry[];
};

export type ResearchBundleRefreshOutput =
  | {
      refreshed: boolean;
      jsonPath: string | null;
      markdownPath: string | null;
    }
  | null;

export type ResearchPostCycleOpportunityOutputs = {
  bundle: ResearchBundleRefreshOutput;
  board: ResearchReportFileOutput;
  datasetHealth: ResearchReportFileOutput;
  packages: ResearchReportFileOutput;
  review?: ResearchReportFileOutput;
  registry?: ResearchReportFileOutput;
  knowledgeBase?: ResearchReportFileOutput;
  preservation?: ResearchReportFileOutput;
};

export type ResearchProcessReportOutputs = {
  daily: ResearchReportFileOutput;
  cycle: ResearchReportFileOutput;
  bundle: ResearchBundleRefreshOutput;
  board: ResearchReportFileOutput;
  datasetHealth: ResearchReportFileOutput;
  packages: ResearchReportFileOutput;
  review?: ResearchReportFileOutput;
  registry?: ResearchReportFileOutput;
  knowledgeBase?: ResearchReportFileOutput;
  preservation?: ResearchReportFileOutput;
};

export type ResearchCandidateTemplate = {
  id: string;
  enabled: boolean;
  type: ResearchTaskType;
  priority: number;
  campaign_id?: string;
  dataset_profile: ResearchDatasetProfile;
  validation_profile: ResearchValidationProfileId;
  candidate_scope: ResearchTaskScope;
  candidate_mutation: ResearchTaskMutation;
};

export type ResearchCandidateFamily = {
  id: string;
  enabled: boolean;
  priority: number;
  campaign_id?: string;
  templates: ResearchCandidateTemplate[];
};

export type ResearchCandidateLibrary = {
  version: number;
  families: ResearchCandidateFamily[];
};

export type ResearchCampaignDefinition = {
  id: string;
  enabled: boolean;
  objective: ResearchCampaignObjective;
  priority: number;
};

export type ResearchCampaignLibrary = {
  version: number;
  campaigns: ResearchCampaignDefinition[];
};

export type ResearchPlannerSelection = {
  campaign: ResearchCampaignDefinition;
  family: ResearchCandidateFamily;
  template: ResearchCandidateTemplate;
  runFingerprint: string;
};

export type ResearchPlannerFuelCampaignStatus = {
  campaign_id: string;
  objective: ResearchCampaignObjective;
  priority: number;
  enabled: boolean;
  total_templates: number;
  selectable_templates: number;
  recent_selection_count: number;
  rejected_or_failed_count: number;
  completed_count: number;
  under_quota: boolean | null;
};

export type ResearchPlannerFuelFamilyStatus = {
  family_id: string;
  source: "active" | "reserve";
  total_templates: number;
  enabled_templates: number;
  selectable_templates: number;
  recent_selection_count: number;
  rejected_or_failed_count: number;
  completed_count: number;
  under_quota: boolean | null;
};

export type ResearchPlannerFuelStatus = {
  baseline_id: string | null;
  active_family_count: number;
  active_template_count: number;
  active_campaign_count: number;
  reserve_family_count: number;
  reserve_template_count: number;
  enabled_campaign_count: number;
  enabled_template_count: number;
  supported_template_count: number;
  valid_profile_template_count: number;
  compatible_template_count: number;
  campaign_qualified_template_count: number;
  data_quality_qualified_template_count: number;
  deduped_template_count: number;
  selectable_template_count: number;
  selectable_campaign_count: number;
  blocked_by_campaign_count: number;
  blocked_by_data_quality_count: number;
  blocked_by_dedupe_count: number;
  blocked_by_template_cooldown_count: number;
  blocked_by_quota_count: number;
  template_cooldown: {
    enabled: boolean;
    max_recent_rejects: number | null;
    decision_window_size: number | null;
    constrained: boolean;
  };
  campaign_quota: {
    enabled: boolean;
    max_selections_per_window: number | null;
    decision_window_size: number | null;
    constrained: boolean;
  };
  quota: {
    enabled: boolean;
    max_selections_per_window: number | null;
    decision_window_size: number | null;
    constrained: boolean;
  };
  campaigns: ResearchPlannerFuelCampaignStatus[];
  families: ResearchPlannerFuelFamilyStatus[];
};

export type ResearchPlannerResult =
  | {
      action: "enqueued";
      taskId: string;
      runFingerprint: string;
    }
  | {
      action: "idle";
      reason: ResearchIdleReason;
    };

export type ResearchTaskExecutorContext = {
  config: ResearchConfig;
  task: ResearchTask;
  baseline: {
    manifest: ResearchBaselineManifest;
    aggregateComparative: TradingBacktestComparativeReport;
    crisisComparative: TradingBacktestComparativeReport;
  };
  reportProgress?: (progress: {
    stage: ResearchRunStatus["stage"];
    progress_note: string;
    completed_stages?: ResearchRunStatus["completed_stages"];
  }) => Promise<void>;
};

export type ResearchTaskExecutor = (
  context: ResearchTaskExecutorContext,
) => Promise<ResearchTaskExecutionResult>;

export type ResearchTaskExecutorMap = Partial<Record<ResearchTaskType, ResearchTaskExecutor>>;

export type ResearchRunSummary = {
  run_id: string;
  task_id: string;
  decision: ResearchDecision;
  reason: string;
  comparison: ResearchRunComparison;
};

export type ResearchTaskRunnerDependencies = {
  executors?: ResearchTaskExecutorMap;
  now?: () => Date;
  pid?: () => number;
  postRunOpportunityRefresh?: (
    config: ResearchConfig,
  ) => Promise<ResearchPostCycleOpportunityOutputs>;
  postCycleOpportunityRefresh?: (
    config: ResearchConfig,
  ) => Promise<ResearchPostCycleOpportunityOutputs>;
};

export type ResearchAutomationLoopResult = {
  cycles: number;
  idleCycles: number;
  processedRunIds: string[];
  autoEnqueuedTaskIds: string[];
  lastIdleReason: ResearchIdleReason | null;
  stopReason: "max_cycles_reached" | "aborted";
  lastReportOutputs: ResearchProcessReportOutputs | null;
};

export type ResearchSupervisorCycleOutcome = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export type ResearchSupervisorResult = {
  cycles: number;
  recoveries: number;
  lastIdleReason: ResearchIdleReason | null;
  stopReason: "max_cycles_reached" | "aborted";
  lastCycleOutcome: ResearchSupervisorCycleOutcome | null;
};

export type ResearchRiskShapingTaskRules = {
  rules: TradingBacktestRiskRule[];
};

export type ResearchContextFilterTaskRules = {
  rules: TradingBacktestMarketSessionRule[];
};

export type ResearchExecutorArtifacts =
  | TradingSecondLayerRiskStudyReport
  | TradingContextBlockStudyReport;
