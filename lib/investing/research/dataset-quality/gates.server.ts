import "server-only";

import { createHash } from "node:crypto";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import { deriveDatasetRequirementIdentity } from "../datasets/identity.server";
import type {
  DatasetQualityReportMaterial, QualityEvidence,
  QualityGateId, QualityGateResult, QualityReportOutcome,
} from "./types";
import { QUALITY_GATE_IDS } from "./types";
import { DATASET_QUALITY_REPORT_VERSION } from "./versions";
import { validateQualityEvaluationInput, type QualityValidationResult } from "./runtimeValidation";

const result = (
  gateId: QualityGateId,
  outcome: QualityGateResult["outcome"],
  reasonCode: QualityGateResult["reasonCode"],
  evidence: readonly QualityEvidence[] = [],
  metrics: QualityGateResult["metrics"] = {},
  applicabilityRule: QualityGateResult["applicabilityRule"] = null,
): QualityGateResult => ({
  gateId, gateVersion: "v1", outcome, reasonCode,
  evidenceIds: evidence.map((item) => item.evidenceId).sort(),
  metrics, applicabilityRule,
});

export function evaluateDatasetQuality(input: unknown): QualityValidationResult<DatasetQualityReportMaterial> {
  const parsed = validateQualityEvaluationInput(input);
  if ("issues" in parsed) return { ok: false, issues: parsed.issues };
  const value = parsed.value;
  const requirementIdentity = deriveDatasetRequirementIdentity(value.requirement);
  if (!requirementIdentity.ok || requirementIdentity.value.requirementId !== value.source.requirementId) {
    return { ok: false, issues: [{ path: "requirementId", reasonCode: "quality_evidence_mismatch" }] };
  }
  for (const evidence of value.evidence) {
    const canonical = canonicalizeResearchContract(evidence.material);
    if ("issues" in canonical) return { ok: false, issues: canonical.issues };
    const digest = createHash("sha256")
      .update(`syntrake.investing.quality-evidence/v1\n${evidence.kind}\n${canonical.value}`, "utf8")
      .digest("hex");
    if (canonical.value !== evidence.canonicalMaterial
      || digest !== evidence.contentHash || evidence.evidenceId !== `irqev_v1_${digest}`) {
      return { ok: false, issues: [{ path: `evidence.${evidence.kind}`, reasonCode: "quality_evidence_mismatch" }] };
    }
  }
  const byKind = new Map<QualityGateId, QualityEvidence[]>();
  for (const item of value.evidence) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  const gates: QualityGateResult[] = [];
  const requireEvidence = (
    gate: QualityGateId,
    missingCode: QualityGateResult["reasonCode"] = "quality_evidence_missing",
    valid: (item: QualityEvidence) => boolean = () => true,
  ) => {
    const evidence = byKind.get(gate) ?? [];
    gates.push(evidence.length === 0 ? result(gate, "blocked", missingCode)
      : evidence.every(valid) ? result(gate, "passed", null, evidence)
        : result(gate, "failed", "quality_evidence_mismatch", evidence));
  };

  const storage = byKind.get("storage_integrity") ?? [];
  const storageOk = storage.some((e) =>
    e.material.normalizedContentHash === value.source.storage.normalizedContentHash
    && e.material.rawContentHash === value.source.storage.rawContentHash
    && e.material.storageKey === value.source.storage.key);
  gates.push(storageOk ? result("storage_integrity", "passed", null, storage)
    : result("storage_integrity", storage.length ? "failed" : "blocked", storage.length ? "quality_storage_integrity_failed" : "quality_evidence_missing", storage));

  const coverage = byKind.get("coverage") ?? [];
  const ratio = coverage[0]?.material.coverageRatio;
  gates.push(typeof ratio !== "number" ? result("coverage", "blocked", "quality_evidence_missing", coverage)
    : ratio < value.requirement.requestedCoverage.minimumRatio
      ? result("coverage", "failed", "quality_coverage_insufficient", coverage, { coverageRatio: ratio })
      : result("coverage", "passed", null, coverage, { coverageRatio: ratio }));

  requireEvidence("calendar_session", "quality_calendar_unknown", (e) =>
    e.material.calendar === value.requirement.timezonePolicy.calendar
    && e.material.sessionPolicy === value.requirement.sessionPolicy && e.material.verified === true);
  requireEvidence("gaps", "quality_calendar_unknown", (e) =>
    e.material.gapCount === 0 && e.material.calendar === value.requirement.timezonePolicy.calendar);
  requireEvidence("duplicates", "quality_evidence_missing", (e) =>
    e.material.duplicateCount === 0 && e.material.conflictCount === 0);
  requireEvidence("timezone", "quality_timezone_unknown", (e) =>
    e.material.sourceTimezone === value.source.sourceTimezone && e.material.canonicalTimezone === "UTC");

  const stale = byKind.get("stale_data") ?? [];
  const lastMs = Date.parse(value.source.coverage.lastTimestamp);
  const asOfMs = Date.parse(value.profile.asOfExclusive);
  const staleSeconds = (asOfMs - lastMs) / 1000;
  const staleMatches = stale.some((e) => e.material.lastTimestamp === value.source.coverage.lastTimestamp);
  gates.push(staleSeconds < 0
    ? result("stale_data", "failed", "quality_look_ahead_detected", stale, { staleSeconds })
    : staleSeconds > value.profile.maximumStalenessSeconds
    ? result("stale_data", "failed", "quality_data_stale", stale, { staleSeconds })
    : staleMatches ? result("stale_data", "passed", null, stale, { staleSeconds })
      : result("stale_data", "blocked", "quality_evidence_missing", [], { staleSeconds }));

  requireEvidence("ohlcv_outliers", "quality_ohlcv_invalid", (e) =>
    e.material.invalidBarCount === 0 && typeof e.material.maximumObservedAbsoluteReturn === "number"
    && e.material.maximumObservedAbsoluteReturn <= value.profile.maximumAbsoluteReturn);
  requireEvidence("adjustment_policy", "quality_adjustment_evidence_missing", (e) =>
    e.material.adjustmentPolicy === value.requirement.adjustmentPolicy && e.material.verified === true);

  if (["equity", "fund"].includes(value.requirement.instrument.assetClass)) {
    requireEvidence("corporate_actions", "quality_corporate_action_evidence_missing", (e) =>
      e.material.verified === true && e.material.coveredThroughExclusive === value.requirement.range.endExclusive);
  } else {
    gates.push(result("corporate_actions", "not_applicable", null, [], {}, "corporate_actions_non_equity/v1"));
  }

  const lookAhead = byKind.get("look_ahead") ?? [];
  const beyondEnd = Date.parse(value.source.coverage.lastTimestamp) >= Date.parse(value.requirement.range.endExclusive);
  const beyondAsOf = Date.parse(value.source.coverage.lastTimestamp) >= Date.parse(value.profile.asOfExclusive);
  const lookAheadValid = lookAhead.some((e) =>
    e.material.latestInformationAt === value.source.coverage.lastTimestamp
    && Date.parse(String(e.material.latestInformationAt)) < Date.parse(value.requirement.range.endExclusive));
  gates.push(beyondEnd || beyondAsOf ? result("look_ahead", "failed", "quality_look_ahead_detected", lookAhead)
    : lookAheadValid ? result("look_ahead", "passed", null, lookAhead)
      : result("look_ahead", "blocked", "quality_evidence_missing"));

  if (value.profile.universeMode === "single_instrument") {
    gates.push(result("survivorship", "not_applicable", null, [], {}, "survivorship_single_instrument/v1"));
  } else {
    requireEvidence("survivorship", "quality_survivorship_evidence_missing", (e) =>
      e.material.pointInTime === true && typeof e.material.universeManifestHash === "string");
  }
  requireEvidence("provenance", "quality_provenance_incomplete", (e) =>
    e.material.complete === true && e.material.provider === value.source.provider.id
    && e.material.providerSymbol === value.source.provider.symbol);

  // Every gate is emitted exactly once and missing evidence can never disappear by omission.
  if (gates.length !== QUALITY_GATE_IDS.length) return { ok: false, issues: [{ path: "gates", reasonCode: "quality_input_invalid" }] };
  const outcomes = new Set(gates.map((gate) => gate.outcome));
  const outcome: QualityReportOutcome = outcomes.has("failed") ? "invalid"
    : outcomes.has("blocked") ? "incomplete"
      : outcomes.has("warning") ? "valid_not_research_ready" : "research_ready";
  return {
    ok: true,
    value: {
      contractVersion: DATASET_QUALITY_REPORT_VERSION,
      sourceDatasetVersionId: value.sourceDatasetVersionId,
      requirementId: value.source.requirementId,
      scope: value.source.scope,
      policyVersion: value.profile.contractVersion,
      profile: value.profile,
      evidence: [...value.evidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      gates: [...gates].sort((a, b) => a.gateId.localeCompare(b.gateId)),
      outcome,
    },
  };
}
