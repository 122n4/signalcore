import type { ConstructionEngineInputV1 } from "@/lib/investing/engine/v1/phase3e/types";
import { canonicalStringify, compare, decimal, normalizeTimestamp, sha256, ZERO } from "@/lib/investing/engine/v1/phase3e/primitives";

const SHA_PATTERN = /^[a-f0-9]{64}$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

function hashWithout(value: unknown, field: string) {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy[field];
  return sha256(copy);
}

function assertHash(value: unknown, field: string, code: string) {
  const hash = (value as Record<string, unknown>)[field];
  if (typeof hash !== "string" || !SHA_PATTERN.test(hash) || hashWithout(value, field) !== hash) {
    throw new Error(code);
  }
}

export function assertConstructionEngineInputV1(sources: ConstructionEngineInputV1) {
  canonicalStringify(sources);
  assertHash(sources.canonicalInput, "inputHash", "investing_construction_input_hash_invalid");
  assertHash(sources.risk, "assessmentHash", "investing_construction_risk_hash_invalid");
  assertHash(sources.policy, "policyHash", "investing_construction_policy_hash_invalid");
  assertHash(sources.envelope, "envelopeHash", "investing_construction_envelope_hash_invalid");
  assertHash(sources.model, "snapshotHash", "investing_construction_model_hash_invalid");

  const inputHash = sources.canonicalInput.inputHash;
  if (
    sources.risk.inputHash !== inputHash
    || sources.policy.inputHash !== inputHash
    || sources.envelope.inputHash !== inputHash
    || sources.envelope.risk.assessmentHash !== sources.risk.assessmentHash
    || sources.envelope.policy.policyHash !== sources.policy.policyHash
  ) {
    throw new Error("investing_construction_cross_snapshot_hash_mismatch");
  }
  if (
    canonicalStringify(sources.constraints) !== canonicalStringify(sources.envelope.constraints)
    || canonicalStringify(sources.portfolioState.actual.canonical) !== canonicalStringify(sources.canonicalInput.actual)
    || canonicalStringify(sources.portfolioState.projected.canonical) !== canonicalStringify(sources.canonicalInput.projected)
  ) {
    throw new Error("investing_construction_cross_snapshot_content_mismatch");
  }
  if (
    sources.envelope.authorization.expectedUserId !== sources.canonicalInput.userId
    || sources.envelope.authorization.expectedAccountId !== sources.canonicalInput.accountId
  ) {
    throw new Error("investing_construction_ownership_mismatch");
  }
  if ((sources.canonicalInput as { environment: string }).environment === "live") {
    throw new Error("investing_construction_live_forbidden");
  }
  if (sources.model.contractVersion !== "investing-construction-model/v1") {
    throw new Error("investing_construction_model_contract_invalid");
  }
  if (normalizeTimestamp(sources.model.asOf) !== sources.model.asOf) {
    throw new Error("investing_construction_model_timestamp_noncanonical");
  }
  for (const value of [
    sources.model.costBenefitThreshold,
    sources.model.minimumTradeBenefit,
    sources.model.liquidityMaxAgeSeconds,
  ]) {
    if (decimal(value) !== value) throw new Error("investing_construction_model_decimal_noncanonical");
    if (compare(value, ZERO) < 0) throw new Error("investing_construction_model_negative_value");
  }
  if (new Set(sources.model.instruments.map((instrument) => instrument.symbol)).size !== sources.model.instruments.length) {
    throw new Error("investing_construction_model_duplicate_symbol");
  }
  for (const instrument of sources.model.instruments) {
    if (!SYMBOL_PATTERN.test(instrument.symbol)) throw new Error("investing_construction_model_symbol_invalid");
    for (const value of [instrument.minimumQuantity, instrument.quantityIncrement]) {
      if (decimal(value) !== value) throw new Error("investing_construction_model_decimal_noncanonical");
      if (compare(value, ZERO) <= 0) throw new Error("investing_construction_model_increment_invalid");
    }
    for (const value of [
      instrument.priceIncrement,
      instrument.commissionBps,
      instrument.spreadBps,
      instrument.slippageBps,
      instrument.fxCostBps,
      instrument.minimumFee,
      instrument.averageDailyVolume,
      instrument.maxParticipation,
      instrument.marketImpactBps,
    ]) {
      if (value !== null && decimal(value) !== value) throw new Error("investing_construction_model_decimal_noncanonical");
      if (value !== null && compare(value, ZERO) < 0) throw new Error("investing_construction_model_negative_value");
    }
    if (instrument.liquidityAsOf !== null) {
      if (normalizeTimestamp(instrument.liquidityAsOf) !== instrument.liquidityAsOf) {
        throw new Error("investing_construction_liquidity_timestamp_noncanonical");
      }
      if (new Date(instrument.liquidityAsOf).getTime() > new Date(sources.canonicalInput.asOf).getTime()) {
        throw new Error("investing_construction_liquidity_timestamp_future");
      }
    }
  }
}
