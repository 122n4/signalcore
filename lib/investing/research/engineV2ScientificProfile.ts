import { hashDatasetSeriesV1, type DatasetSeriesHashPayloadV1, type DatasetSnapshotHashPayloadV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "./executionMaterials";
import { providerProfileForEngineV2, type VerifiedDatasetSeriesMaterialV1 } from "./datasetMaterial";
import { type BooleanExpressionV1, type DataFieldRefV1, type ResearchIrV1 } from "./index";
import { type RunInputHashPayloadV1 } from "./canonical";
import { metricRegistryV2Requests, metricRegistryVersionV2 } from "./researchMetrics";

const v1FieldVersion = "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
const v2FieldVersion = "I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2";
const v1Fields = new Set(["ADJUSTED_CLOSE", "TOTAL_RETURN", "VOLUME", "MOMENTUM_12M", "OBSERVATION_DATE"]);
const v2Fields = new Set([
  "TOTAL_RETURN",
  "MOMENTUM_12M",
  "OPEN_TO_CLOSE_RETURN",
  "INTRADAY_RANGE_RATIO",
  "CLOSE_TO_SMA_20_RETURN",
  "CLOSE_TO_SMA_50_RETURN",
  "CLOSE_TO_SMA_200_RETURN",
  "CLOSE_TO_ROLLING_HIGH_20_RETURN",
  "CLOSE_TO_ROLLING_LOW_20_RETURN",
  "VOLUME",
  "OBSERVATION_DATE",
]);
const universeMaterialFieldsV2 = ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", "VOLUME"] as const;

export function assertEngineV1ResearchIrFieldContract(ir: ResearchIrV1): void {
  visitResearchIrFields(ir, (field) => {
    if (field.fieldVersion !== v1FieldVersion || !v1Fields.has(field.fieldId)) throw new Error("UNSUPPORTED_IR_PROFILE");
  });
}

export function assertEngineV2ResearchIrFieldContract(ir: ResearchIrV1): void {
  visitResearchIrFields(ir, (field) => {
    if (field.fieldVersion !== v2FieldVersion) throw new Error("UNSUPPORTED_V2_FIELD_VERSION");
    if (!v2Fields.has(field.fieldId)) throw new Error("UNSUPPORTED_V2_FIELD");
  });
}

export function researchIrReferencesVolume(ir: ResearchIrV1): boolean {
  let references = false;
  visitResearchIrFields(ir, (field) => {
    if (field.fieldId === "VOLUME") references = true;
  });
  return references;
}

export function assertEngineV2ExecutionConfig(config: ExecutionConfigHashPayloadV1): void {
  if (
    config.engineCompatibilityVersion !== "ENGINE_V20260926" ||
    config.missingDataPolicy !== "MISSING_DATA_STRICT_RESEARCH_V2" ||
    config.fxPolicy !== "FX_USD_IDENTITY_V1" ||
    !Object.hasOwn(costPoliciesV2, config.costsPolicy) ||
    !Object.hasOwn(slippagePoliciesV2, config.slippagePolicy) ||
    config.fillPolicy !== "NEXT_SESSION_OPEN_V1" ||
    config.corporateActionPolicy !== "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2" ||
    config.calendarSessionPolicy !== "XNYS_OPEN_CLOSE_SESSION_V2" ||
    config.valuationPolicy !== "USD_ADJUSTED_CLOSE_MARK_V2"
  ) throw new Error("UNSUPPORTED_EXECUTION_CONFIG");
}

export function assertEngineV2MetricRequestSet(metricRequestSet: MetricRequestSetHashPayloadV1): void {
  const requests = [...metricRequestSet.requests].sort((left, right) => left.metricId.localeCompare(right.metricId));
  if (
    metricRequestSet.schemaVersion !== "METRIC_REQUEST_SET_HASH_PAYLOAD_V1" ||
    (metricRequestSet.metricRegistryVersion !== "METRIC_REGISTRY_V20260918" && metricRequestSet.metricRegistryVersion !== metricRegistryVersionV2)
  ) throw new Error("UNSUPPORTED_V2_METRIC_REQUEST_SET");
  if (metricRequestSet.metricRegistryVersion === "METRIC_REGISTRY_V20260918" && (
    requests.length !== 2 ||
    requests[0]?.metricId !== "MAX_DRAWDOWN" ||
    requests[0]?.metricVersion !== "METRIC_V1" ||
    requests[1]?.metricId !== "TOTAL_RETURN" ||
    requests[1]?.metricVersion !== "METRIC_V1"
  )) throw new Error("UNSUPPORTED_V2_METRIC_REQUEST_SET");
  if (metricRequestSet.metricRegistryVersion === metricRegistryVersionV2) {
    if (requests.length !== metricRegistryV2Requests.length) throw new Error("UNSUPPORTED_V2_METRIC_REQUEST_SET");
    for (let index = 0; index < metricRegistryV2Requests.length; index += 1) {
      if (requests[index]?.metricId !== metricRegistryV2Requests[index]!.metricId || requests[index]?.metricVersion !== metricRegistryV2Requests[index]!.metricVersion) {
        throw new Error("UNSUPPORTED_V2_METRIC_REQUEST_SET");
      }
    }
  }
}

export function assertEngineV2RunInputProfile(runInput: RunInputHashPayloadV1): void {
  if (
    runInput.schemaVersion !== "RUN_INPUT_HASH_PAYLOAD_V1" ||
    runInput.runType !== "HISTORICAL_BACKTEST" ||
    runInput.researchEnvironment !== "HISTORICAL_BACKTEST" ||
    runInput.researchSourceContext !== "PURE_RESEARCH" ||
    runInput.accountResearchContext !== undefined ||
    runInput.engineId !== "HISTORICAL_EXECUTION_ADAPTER" ||
    runInput.engineVersion !== "ENGINE_V20260926" ||
    (runInput.metricRegistryVersion !== "METRIC_REGISTRY_V20260918" && runInput.metricRegistryVersion !== metricRegistryVersionV2)
  ) throw new Error("UNSUPPORTED_RUN_PROFILE");
  if (runInput.deterministicSeed !== undefined) throw new Error("UNSUPPORTED_V2_DETERMINISTIC_SEED");
  const policies = [...runInput.materialPolicies].sort((left, right) => left.policyId.localeCompare(right.policyId));
  if (
    policies.length !== 2 ||
    policies[0]?.policyId !== "DATASET_SNAPSHOT" ||
    policies[0]?.policyVersion !== "DATASET_SNAPSHOT_POLICY_V1" ||
    policies[1]?.policyId !== "EXECUTION_CONFIG" ||
    policies[1]?.policyVersion !== "EXECUTION_CONFIG_HASH_PAYLOAD_V1"
  ) throw new Error("UNSUPPORTED_V2_MATERIAL_POLICIES");
}

export function assertEngineV2DatasetSeriesSet(
  ir: ResearchIrV1,
  series: readonly DatasetSeriesHashPayloadV1[],
): void {
  assertNoDuplicateDatasetSeries(series);
  assertNoDuplicateDatasetSemanticKeys(series);
  for (const payload of series) assertDatasetSeriesV2(payload);

  const required = requiredDatasetSeriesSemanticKeysV2(ir);
  const byKey = new Map(series.map((payload) => [semanticKey(payload), payload]));
  for (const key of required) {
    if (!byKey.has(key)) {
      if (key.endsWith("\nVOLUME")) throw new Error("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
      throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    }
  }
  for (const key of byKey.keys()) {
    if (!required.has(key)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  }
}

export function assertEngineV2MaterialBinding(input: {
  researchIr: ResearchIrV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  materials: readonly VerifiedDatasetSeriesMaterialV1[];
}): void {
  assertEngineV2DatasetSeriesSet(input.researchIr, input.datasetSeries);
  if (input.materials.length !== input.datasetSeries.length) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  const expected = new Set(input.datasetSeries.map(hashDatasetSeriesV1));
  const seen = new Set<string>();
  for (const material of input.materials) {
    const hash = hashDatasetSeriesV1(material.series);
    if (!expected.has(hash) || seen.has(hash)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    seen.add(hash);
  }
  if (seen.size !== expected.size) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  assertNoDuplicateDatasetSemanticKeys(input.materials.map((material) => material.series));
}

export function assertEngineV2DatasetSnapshotMembership(datasetSeries: readonly DatasetSeriesHashPayloadV1[], snapshot: DatasetSnapshotHashPayloadV1): void {
  const expected = datasetSeries.map(hashDatasetSeriesV1).sort();
  const actual = snapshot.series.map((ref) => ref.hashHex).sort();
  if (expected.length !== actual.length) throw new Error("DatasetSnapshot DatasetSeries proof mismatch");
  for (let index = 0; index < expected.length; index += 1) if (expected[index] !== actual[index]) throw new Error("DatasetSnapshot DatasetSeries proof mismatch");
}

export function assertEngineV2ScientificCandidate(input: {
  runInput: RunInputHashPayloadV1;
  researchIr: ResearchIrV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  datasetSnapshot: DatasetSnapshotHashPayloadV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
  executionConfig: ExecutionConfigHashPayloadV1;
}): void {
  assertEngineV2RunInputProfile(input.runInput);
  assertEngineV2ExecutionConfig(input.executionConfig);
  assertEngineV2MetricRequestSet(input.metricRequestSet);
  assertEngineV2ResearchIrFieldContract(input.researchIr);
  assertEngineV2DatasetSeriesSet(input.researchIr, input.datasetSeries);
  assertEngineV2DatasetSnapshotMembership(input.datasetSeries, input.datasetSnapshot);
}

export function assertDatasetSeriesV2(series: DatasetSeriesHashPayloadV1): void {
  if (series.frequency !== "DAILY" || series.timezone !== "America/New_York" || series.calendar !== "XNYS_TRADING_CALENDAR_V2") throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE"].includes(series.fieldId)) {
    const profile = providerProfileForEngineV2(series);
    if (!profile.commonOhlcAdjustmentBasis || series.fieldVersion !== "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2" || series.currency !== "USD") throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    return;
  }
  if (series.fieldId === "VOLUME") {
    if (series.fieldVersion !== "POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2" || series.currency !== "NONE") throw new Error("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
    assertVolumeProviderPitSafe(series);
    return;
  }
  throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
}

function assertVolumeProviderPitSafe(series: DatasetSeriesHashPayloadV1): void {
  let profile: ReturnType<typeof providerProfileForEngineV2>;
  try {
    profile = providerProfileForEngineV2(series);
  } catch {
    throw new Error("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
  }
  if (!profile.volumePointInTimeSafe || profile.volumeSemantic !== "POINT_IN_TIME_REPORTED_SESSION_VOLUME" || profile.volumeState !== "RAW_REPORTED") {
    throw new Error("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
  }
}

function assertNoDuplicateDatasetSeries(series: readonly DatasetSeriesHashPayloadV1[]): void {
  const seen = new Set<string>();
  for (const payload of series) {
    const hash = hashDatasetSeriesV1(payload);
    if (seen.has(hash)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    seen.add(hash);
  }
}

function assertNoDuplicateDatasetSemanticKeys(series: readonly DatasetSeriesHashPayloadV1[]): void {
  const seen = new Set<string>();
  for (const payload of series) {
    const key = semanticKey(payload);
    if (seen.has(key)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    seen.add(key);
  }
}

function semanticKey(series: DatasetSeriesHashPayloadV1): string {
  return `${series.instrumentId}\n${series.fieldId}`;
}

function requiredDatasetSeriesSemanticKeysV2(ir: ResearchIrV1): Set<string> {
  const required = new Set<string>();
  const universe = new Set(ir.universe.instrumentIds);
  for (const instrumentId of [...universe].sort()) {
    for (const fieldId of universeMaterialFieldsV2) required.add(`${instrumentId}\n${fieldId}`);
  }
  if (ir.benchmark.benchmark === "INSTRUMENT" && !universe.has(ir.benchmark.instrumentId)) {
    required.add(`${ir.benchmark.instrumentId}\nADJUSTED_CLOSE`);
  }
  return required;
}

function visitResearchIrFields(ir: ResearchIrV1, visitor: (field: DataFieldRefV1) => void): void {
  const visitExpr = (expr: BooleanExpressionV1): void => {
    if (expr.type === "COMPARE") {
      visitor(expr.left);
      if ("fieldId" in expr.right) visitor(expr.right);
    } else if (expr.type === "NOT") visitExpr(expr.clause);
    else for (const clause of expr.clauses) visitExpr(clause);
  };
  for (const operation of ir.pipeline) {
    if (operation.type === "FILTER") visitExpr(operation.predicate);
    if (operation.type === "RANK") visitor(operation.field);
    if (operation.type === "ENTER") visitExpr(operation.condition);
    if (operation.type === "EXIT") visitExpr(operation.condition);
  }
}

export const costPoliciesV2 = {
  COMMISSION_FEES_ZERO_V1: 0n,
  COMMISSION_FEES_NOTIONAL_1_BPS_V1: 1n,
  COMMISSION_FEES_NOTIONAL_5_BPS_V1: 5n,
  COMMISSION_FEES_NOTIONAL_10_BPS_V1: 10n,
  COMMISSION_FEES_NOTIONAL_25_BPS_V1: 25n,
} as const;

export const slippagePoliciesV2 = {
  SLIPPAGE_ZERO_RESEARCH_V1: 0n,
  SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1: 1n,
  SLIPPAGE_SPREAD_ADVERSE_5_BPS_V1: 5n,
  SLIPPAGE_SPREAD_ADVERSE_10_BPS_V1: 10n,
  SLIPPAGE_SPREAD_ADVERSE_25_BPS_V1: 25n,
  SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1: 50n,
} as const;
