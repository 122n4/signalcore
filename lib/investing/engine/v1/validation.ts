import {
  canonicalJsonStringify,
  canonicalSha256,
  deepFreezeCanonical,
  isCanonicalDecimal,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  INVESTING_ENGINE_RESULT_CONTRACT_VERSION,
  type CanonicalInstrumentCatalogSnapshotV1,
  type CanonicalInstrumentV1,
  type CanonicalInvestingInputV1,
  type CanonicalMarketSnapshotV1,
  type InvestingConstraintEvaluationV1,
  type InvestingEngineResultV1,
  type InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function assertId(value: unknown, code: string) {
  assert(typeof value === "string" && ID_PATTERN.test(value), code);
}

function assertVersion(value: unknown, code: string) {
  assert(typeof value === "string" && VERSION_PATTERN.test(value), code);
}

function assertCurrency(value: unknown, code: string) {
  assert(typeof value === "string" && CURRENCY_PATTERN.test(value), code);
}

function assertSymbol(value: unknown, code: string) {
  assert(typeof value === "string" && SYMBOL_PATTERN.test(value), code);
}

function assertDecimal(value: unknown, code: string) {
  assert(isCanonicalDecimal(value), code);
}

function assertTimestamp(value: unknown, code: string) {
  assert(typeof value === "string" && normalizeIsoTimestamp(value) === value, code);
}

function assertUnique(values: readonly string[], code: string) {
  assert(new Set(values).size === values.length, code);
}

function assertIssue(issue: InvestingQualityIssueV1, prefix: string) {
  assertId(issue.code, `${prefix}_code_invalid`);
  assert(["info", "warning", "error"].includes(issue.severity), `${prefix}_severity_invalid`);
  assertId(issue.domain, `${prefix}_domain_invalid`);
  assert(typeof issue.message === "string" && issue.message.trim().length > 0, `${prefix}_message_invalid`);
  if (issue.observedAt !== null) assertTimestamp(issue.observedAt, `${prefix}_observed_at_invalid`);
}

function assertConstraint(constraint: InvestingConstraintEvaluationV1, prefix: string) {
  assertId(constraint.id, `${prefix}_id_invalid`);
  assert(["hard", "soft"].includes(constraint.kind), `${prefix}_kind_invalid`);
  assert(["pass", "fail", "unknown"].includes(constraint.status), `${prefix}_status_invalid`);
  assertId(constraint.reasonCode, `${prefix}_reason_code_invalid`);
  if (constraint.observed !== null) assertDecimal(constraint.observed, `${prefix}_observed_invalid`);
  if (constraint.limit !== null) assertDecimal(constraint.limit, `${prefix}_limit_invalid`);
  assert(Array.isArray(constraint.evidenceRefs), `${prefix}_evidence_invalid`);
  constraint.evidenceRefs.forEach((ref) => assertId(ref, `${prefix}_evidence_ref_invalid`));
}

export function assertCanonicalInstrumentV1(instrument: CanonicalInstrumentV1) {
  assertId(instrument.instrumentId, "investing_instrument_id_invalid");
  assertSymbol(instrument.symbol, "investing_instrument_symbol_invalid");
  assert(typeof instrument.name === "string" && instrument.name.trim().length > 0, "investing_instrument_name_invalid");
  assert(["equity", "bond", "commodity", "cash", "other"].includes(instrument.assetClass), "investing_instrument_asset_class_invalid");
  assertCurrency(instrument.currency, "investing_instrument_currency_invalid");
  assert(typeof instrument.enabled === "boolean", "investing_instrument_enabled_invalid");
  assertDecimal(instrument.lotSize, "investing_instrument_lot_size_invalid");
  assertDecimal(instrument.minimumNotional, "investing_instrument_minimum_notional_invalid");
  assertDecimal(instrument.feeBps, "investing_instrument_fee_bps_invalid");
  assertDecimal(instrument.qualityScore, "investing_instrument_quality_score_invalid");
}

export function assertCanonicalInstrumentCatalogSnapshotV1(catalog: CanonicalInstrumentCatalogSnapshotV1) {
  assertVersion(catalog.version, "investing_catalog_version_invalid");
  assert(Array.isArray(catalog.instruments), "investing_catalog_instruments_invalid");
  catalog.instruments.forEach(assertCanonicalInstrumentV1);
  assertUnique(catalog.instruments.map((instrument) => instrument.symbol), "investing_catalog_duplicate_symbol");
  assertUnique(catalog.instruments.map((instrument) => instrument.instrumentId), "investing_catalog_duplicate_instrument_id");
  assert(SHA256_PATTERN.test(catalog.catalogHash), "investing_catalog_hash_invalid");
  const expected = canonicalSha256({ version: catalog.version, instruments: catalog.instruments });
  assert(expected === catalog.catalogHash, "investing_catalog_hash_mismatch");
}

export function sealInstrumentCatalogSnapshotV1(args: {
  version: string;
  instruments: readonly CanonicalInstrumentV1[];
}): CanonicalInstrumentCatalogSnapshotV1 {
  const candidate = {
    version: args.version,
    instruments: [...args.instruments],
    catalogHash: canonicalSha256({ version: args.version, instruments: args.instruments }),
  } satisfies CanonicalInstrumentCatalogSnapshotV1;
  assertCanonicalInstrumentCatalogSnapshotV1(candidate);
  return deepFreezeCanonical(candidate) as CanonicalInstrumentCatalogSnapshotV1;
}

export function assertCanonicalMarketSnapshotV1(snapshot: CanonicalMarketSnapshotV1) {
  assert(snapshot.contractVersion === "investing-market-snapshot/v1", "investing_market_contract_version_invalid");
  assertId(snapshot.marketSnapshotId, "investing_market_snapshot_id_invalid");
  assertTimestamp(snapshot.asOf, "investing_market_as_of_invalid");
  assertVersion(snapshot.schemaVersion, "investing_market_schema_version_invalid");
  assert(Array.isArray(snapshot.points), "investing_market_points_invalid");
  assertUnique(snapshot.points.map((point) => point.symbol), "investing_market_duplicate_symbol");
  for (const point of snapshot.points) {
    assertSymbol(point.symbol, "investing_market_symbol_invalid");
    assertDecimal(point.price, "investing_market_price_invalid");
    assertCurrency(point.currency, "investing_market_currency_invalid");
    assertId(point.provider, "investing_market_provider_invalid");
    assertTimestamp(point.providerAsOf, "investing_market_provider_as_of_invalid");
    assertTimestamp(point.receivedAt, "investing_market_received_at_invalid");
    assert(["good", "degraded", "insufficient"].includes(point.quality), "investing_market_quality_invalid");
  }
  snapshot.issues.forEach((issue, index) => assertIssue(issue, `investing_market_issue_${index}`));
  assert(SHA256_PATTERN.test(snapshot.snapshotHash), "investing_market_hash_invalid");
  const hashable: Record<string, unknown> = { ...snapshot };
  delete hashable.snapshotHash;
  assert(canonicalSha256(hashable) === snapshot.snapshotHash, "investing_market_hash_mismatch");
}

export function sealMarketSnapshotV1(
  draft: Omit<CanonicalMarketSnapshotV1, "snapshotHash">,
): CanonicalMarketSnapshotV1 {
  const normalized = {
    ...draft,
    asOf: normalizeIsoTimestamp(draft.asOf),
    points: draft.points.map((point) => ({
      ...point,
      providerAsOf: normalizeIsoTimestamp(point.providerAsOf),
      receivedAt: normalizeIsoTimestamp(point.receivedAt),
    })),
    issues: draft.issues.map((issue) => ({
      ...issue,
      observedAt: issue.observedAt === null ? null : normalizeIsoTimestamp(issue.observedAt),
    })),
  };
  const candidate = {
    ...normalized,
    snapshotHash: canonicalSha256(normalized),
  } satisfies CanonicalMarketSnapshotV1;
  assertCanonicalMarketSnapshotV1(candidate);
  return deepFreezeCanonical(candidate) as CanonicalMarketSnapshotV1;
}

type CanonicalInputDraftV1 = Omit<CanonicalInvestingInputV1, "inputHash">;

function normalizeInputDraft(draft: CanonicalInputDraftV1): CanonicalInputDraftV1 {
  const marketDraft: Record<string, unknown> = { ...draft.market };
  delete marketDraft.snapshotHash;
  return {
    ...draft,
    asOf: normalizeIsoTimestamp(draft.asOf),
    market: sealMarketSnapshotV1(marketDraft as Omit<CanonicalMarketSnapshotV1, "snapshotHash">),
    quality: {
      ...draft.quality,
      issues: draft.quality.issues.map((issue) => ({
        ...issue,
        observedAt: issue.observedAt === null ? null : normalizeIsoTimestamp(issue.observedAt),
      })),
    },
    warnings: draft.warnings.map((issue) => ({
      ...issue,
      observedAt: issue.observedAt === null ? null : normalizeIsoTimestamp(issue.observedAt),
    })),
  };
}

export function hashCanonicalInvestingInputV1(input: CanonicalInvestingInputV1 | CanonicalInputDraftV1) {
  const hashable: Record<string, unknown> = { ...input };
  delete hashable.inputHash;
  return canonicalSha256(hashable);
}

export function assertCanonicalInvestingInputV1(input: CanonicalInvestingInputV1) {
  canonicalJsonStringify(input);
  assert(input.contractVersion === INVESTING_ENGINE_INPUT_CONTRACT_VERSION, "investing_input_contract_version_invalid");
  [input.inputSnapshotId, input.runId, input.userId, input.portfolioId, input.accountId].forEach((id) =>
    assertId(id, "investing_input_id_invalid"),
  );
  assert(input.environment === "paper" || input.environment === "simulation", "investing_input_environment_invalid");
  assertTimestamp(input.asOf, "investing_input_as_of_invalid");

  assert(input.versions.contractVersion === INVESTING_ENGINE_INPUT_CONTRACT_VERSION, "investing_versions_contract_invalid");
  assertVersion(input.versions.engineVersion, "investing_engine_version_invalid");
  assertVersion(input.versions.policyVersion, "investing_policy_version_invalid");
  assertVersion(input.versions.modelVersion, "investing_model_version_invalid");
  assertVersion(input.versions.instrumentCatalogVersion, "investing_catalog_version_invalid");
  assertVersion(input.versions.marketDataSchemaVersion, "investing_market_schema_version_invalid");

  assertId(input.mandate.mandateSnapshotId, "investing_mandate_snapshot_id_invalid");
  assert(["preservation", "growth", "income", "balanced"].includes(input.mandate.objective), "investing_mandate_objective_invalid");
  assert(["Conservative", "Balanced", "Aggressive"].includes(input.mandate.riskProfile), "investing_mandate_risk_invalid");
  assert(["Short", "Medium", "Long"].includes(input.mandate.horizon), "investing_mandate_horizon_invalid");
  assertCurrency(input.mandate.baseCurrency, "investing_mandate_currency_invalid");
  input.mandate.constraints.forEach((constraint, index) => assertConstraint(constraint, `investing_constraint_${index}`));
  assertUnique(input.mandate.constraints.map((constraint) => constraint.id), "investing_constraint_duplicate_id");

  for (const state of [input.actual, input.projected]) {
    assertVersion(state.stateVersion, "investing_portfolio_state_version_invalid");
    assertUnique(state.cash.map((cash) => cash.currency), "investing_cash_duplicate_currency");
    for (const cash of state.cash) {
      assertCurrency(cash.currency, "investing_cash_currency_invalid");
      assertDecimal(cash.available, "investing_cash_available_invalid");
      assertDecimal(cash.settled, "investing_cash_settled_invalid");
      assertDecimal(cash.reserved, "investing_cash_reserved_invalid");
    }
    assertUnique(state.positions.map((position) => position.symbol), "investing_position_duplicate_symbol");
    for (const position of state.positions) {
      assertSymbol(position.symbol, "investing_position_symbol_invalid");
      assertDecimal(position.quantity, "investing_position_quantity_invalid");
      assertDecimal(position.reservedQuantity, "investing_position_reserved_invalid");
      assertDecimal(position.costBasis, "investing_position_cost_basis_invalid");
      assertCurrency(position.currency, "investing_position_currency_invalid");
    }
  }

  assertUnique(input.pendingOrders.map((order) => order.orderId), "investing_pending_order_duplicate_id");
  for (const order of input.pendingOrders) {
    assertId(order.orderId, "investing_pending_order_id_invalid");
    assertSymbol(order.symbol, "investing_pending_order_symbol_invalid");
    assert(order.side === "buy" || order.side === "sell", "investing_pending_order_side_invalid");
    assert(["pending", "submitted", "partially_filled", "reconciling"].includes(order.status), "investing_pending_order_status_invalid");
    assertDecimal(order.quantity, "investing_pending_order_quantity_invalid");
    assertDecimal(order.cumulativeFilledQuantity, "investing_pending_order_filled_invalid");
    assertDecimal(order.reservedCash, "investing_pending_order_reserved_cash_invalid");
    assertDecimal(order.reservedQuantity, "investing_pending_order_reserved_quantity_invalid");
    assertCurrency(order.currency, "investing_pending_order_currency_invalid");
  }

  assertCanonicalInstrumentCatalogSnapshotV1(input.instrumentCatalog);
  assertCanonicalMarketSnapshotV1(input.market);
  assert(input.versions.instrumentCatalogVersion === input.instrumentCatalog.version, "investing_catalog_version_mismatch");
  assert(input.versions.marketDataSchemaVersion === input.market.schemaVersion, "investing_market_schema_version_mismatch");

  assert(["good", "degraded", "insufficient"].includes(input.quality.status), "investing_input_quality_invalid");
  input.quality.issues.forEach((issue, index) => assertIssue(issue, `investing_input_issue_${index}`));
  input.warnings.forEach((issue, index) => assertIssue(issue, `investing_input_warning_${index}`));
  assertDecimal(input.confidence.value, "investing_input_confidence_invalid");
  const confidence = Number(input.confidence.value);
  assert(confidence >= 0 && confidence <= 1, "investing_input_confidence_out_of_range");
  input.confidence.basis.forEach((basis) => assertId(basis, "investing_input_confidence_basis_invalid"));

  assert(SHA256_PATTERN.test(input.inputHash), "investing_input_hash_invalid");
  assert(hashCanonicalInvestingInputV1(input) === input.inputHash, "investing_input_hash_mismatch");
}

export function sealCanonicalInvestingInputV1(draft: CanonicalInputDraftV1): CanonicalInvestingInputV1 {
  const normalized = normalizeInputDraft(draft);
  const candidate = {
    ...normalized,
    inputHash: hashCanonicalInvestingInputV1(normalized),
  } satisfies CanonicalInvestingInputV1;
  assertCanonicalInvestingInputV1(candidate);
  return deepFreezeCanonical(candidate) as CanonicalInvestingInputV1;
}

export function hashInvestingEngineResultV1(result: InvestingEngineResultV1 | Omit<InvestingEngineResultV1, "outputHash">) {
  const hashable: Record<string, unknown> = { ...result };
  delete hashable.outputHash;
  return canonicalSha256(hashable);
}

export function assertInvestingEngineResultV1(result: InvestingEngineResultV1) {
  canonicalJsonStringify(result);
  assert(result.contractVersion === INVESTING_ENGINE_RESULT_CONTRACT_VERSION, "investing_result_contract_version_invalid");
  assertId(result.runId, "investing_result_run_id_invalid");
  assertId(result.inputSnapshotId, "investing_result_input_snapshot_id_invalid");
  assert(SHA256_PATTERN.test(result.inputHash), "investing_result_input_hash_invalid");
  assert(["ready", "degraded", "blocked", "no_trade"].includes(result.state), "investing_result_state_invalid");
  assertTimestamp(result.asOf, "investing_result_as_of_invalid");
  assert(result.versions.contractVersion === INVESTING_ENGINE_INPUT_CONTRACT_VERSION, "investing_result_versions_contract_invalid");
  assertVersion(result.versions.engineVersion, "investing_result_engine_version_invalid");
  assertVersion(result.versions.policyVersion, "investing_result_policy_version_invalid");
  assertVersion(result.versions.modelVersion, "investing_result_model_version_invalid");
  assertVersion(result.versions.instrumentCatalogVersion, "investing_result_catalog_version_invalid");
  assertVersion(result.versions.marketDataSchemaVersion, "investing_result_market_version_invalid");
  assert(["good", "degraded", "insufficient"].includes(result.quality), "investing_result_quality_invalid");
  result.constraints.forEach((constraint, index) => assertConstraint(constraint, `investing_result_constraint_${index}`));
  assertUnique(result.constraints.map((constraint) => constraint.id), "investing_result_constraint_duplicate_id");
  assertDecimal(result.confidence.value, "investing_result_confidence_invalid");
  const confidence = Number(result.confidence.value);
  assert(confidence >= 0 && confidence <= 1, "investing_result_confidence_out_of_range");
  result.confidence.basis.forEach((basis) => assertId(basis, "investing_result_confidence_basis_invalid"));
  result.warnings.forEach((warning, index) => assertIssue(warning, `investing_result_warning_${index}`));
  assertUnique(result.targetPortfolio.map((target) => target.symbol), "investing_result_target_duplicate_symbol");
  for (const target of result.targetPortfolio) {
    assertSymbol(target.symbol, "investing_result_target_symbol_invalid");
    assertDecimal(target.targetWeight, "investing_result_target_weight_invalid");
    assertDecimal(target.targetValue, "investing_result_target_value_invalid");
    assertCurrency(target.currency, "investing_result_target_currency_invalid");
    target.reasonCodes.forEach((reason) => assertId(reason, "investing_result_target_reason_invalid"));
  }
  assertUnique(result.rebalance.map((action) => action.symbol), "investing_result_rebalance_duplicate_symbol");
  for (const action of result.rebalance) {
    assertSymbol(action.symbol, "investing_result_rebalance_symbol_invalid");
    assert(["buy", "sell", "hold"].includes(action.action), "investing_result_rebalance_action_invalid");
    assertDecimal(action.deltaQuantity, "investing_result_rebalance_quantity_invalid");
    assertDecimal(action.deltaValue, "investing_result_rebalance_value_invalid");
    assertCurrency(action.currency, "investing_result_rebalance_currency_invalid");
    action.reasonCodes.forEach((reason) => assertId(reason, "investing_result_rebalance_reason_invalid"));
  }
  assert(result.proposal === null, "investing_result_operational_proposal_forbidden");
  assert(SHA256_PATTERN.test(result.outputHash), "investing_result_hash_invalid");
  assert(hashInvestingEngineResultV1(result) === result.outputHash, "investing_result_hash_mismatch");
}
