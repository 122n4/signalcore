import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ");
}

function fencedBlockAfter(contract: string, marker: string): string {
  const start = contract.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const block = contract.slice(start).match(/```text\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`block not found after: ${marker}`);
  return block[1];
}

describe("I5 RL-3D Validation Assessment V1 design freeze", () => {
  it("remains candidate-only and design-only", () => {
    const contract = read(contractPath);
    expect(contract).toContain("CANDIDATE / RL-3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE / UNNUMBERED");
    expect(contract).toContain("Canonical predecessor:\n`b3f48e3f55a1f0c41004c60a3119fbd2cb7f84f0`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).toContain("Supabase Production:\n`UNCHANGED`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-3D");
  });

  it("does not retrofit accepted RL-3C Validation Result semantics", () => {
    const contract = read(contractPath);
    const rl3c = read("docs/investing-genesis/I5_RL3C_VALIDATION_AGGREGATE_CLOSURE_OWNER_CONTRACT_V1.md");
    for (const token of [
      "This design does not modify, retrofit or reinterpret",
      "SYNTRAKE:VALIDATION_RESULT:V1",
      "AGGREGATE_AVAILABLE != PASS",
      "CHILD_FAILED != FAIL assessment",
      "AGGREGATE_PENDING != INSUFFICIENT_EVIDENCE assessment",
      "Passport must not infer PASS from `AGGREGATE_AVAILABLE`",
    ]) expect(contract).toContain(token);
    expect(rl3c).toContain("This production/current-state closure does not introduce pass/fail scoring");
    expect(rl3c).toContain("- pass/fail;");
  });

  it("freezes exactly two new design-only assessment domains without runtime admission", () => {
    const contract = read(contractPath);
    const canonicalContract = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const canonicalRuntime = read("lib/investing/research/canonical.ts");
    for (const domain of [
      "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
    ]) {
      expect(contract).toContain(domain);
      expect(canonicalContract).not.toContain(domain);
      expect(canonicalRuntime).not.toContain(domain);
    }
    expect(contract).toContain("They are design-frozen only in this slice");
    expect(contract).toContain("not added to `HashDomainV1` here");
  });

  it("freezes pre-result assessment protocol authority without Validation Result binding", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    const protocolPayload = fencedBlockAfter(contract, "The future owner payload is a closed object:");
    expect(protocolPayload).toContain("VALIDATION_ASSESSMENT_PROTOCOL_V1");
    expect(protocolPayload).toContain("validationProtocol");
    expect(protocolPayload).not.toContain("validationResult");
    const protocolHashRefs = fencedBlockAfter(contract, "Required HashRefs:");
    expect(protocolHashRefs).toContain("validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>");
    expect(protocolHashRefs).not.toContain("validationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>");
    for (const token of [
      "VALIDATION_ASSESSMENT_PROTOCOL_V1",
      "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
      "ALL_REQUIRED_CRITERIA_PASS_V1",
      "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
      "subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>",
      "subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>",
      "METRIC_REGISTRY_V20260927",
      "MUST NOT contain a Validation Result",
      "VALIDATION_RUN_REGISTERED",
      "not admissible authority for RL-8",
      "logicalAssessmentProtocolKey",
      "DIVERGENT_ASSESSMENT_PROTOCOL",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("before the first VALIDATION_RUN_REGISTERED event");
    expect(normalized).toContain("more permissive Assessment Protocol");
    expect(normalized).toContain("pre-result scientific methodology/criteria authority");
    expect(normalized).toContain("MUST be durably accepted before the first VALIDATION_RUN_REGISTERED event");
    expect(normalized).toContain("MUST NOT contain a Validation Result HashRef, Validation Child Result HashRef, Result HashRef, Evidence Object HashRef, concrete Metric Result Set descriptor/hash");
    expect(normalized).toContain("Exactly one accepted Assessment Protocol may exist for one logical assessment protocol key");
    expect(normalized).toContain("must not choose by `latest`, caller preference, timestamp ordering or favorable outcome");
  });

  it("freezes non-empty required criteria and pre-result evidence descriptors", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "criteria.length >= 1",
      "required criteria count `>= 1`",
      "requiredEvidenceRequirements.length >= 1",
      "EvidenceRequirementDescriptorV1",
      "EvidenceSourceLineageSelectorV1",
      "artifactClass",
      "sourceLineage",
      "metricIdentity",
      "cardinality",
      "missingEvidencePolicy",
      "VALIDATION_RESULT",
      "VALIDATION_CHILD_RESULT",
      "METRIC_RESULT_SET_DESCRIPTOR_V1",
      "METRIC_RESULT_SET_DESCRIPTOR_V2",
      "EVIDENCE_OBJECT",
      "EXACTLY_ONE",
      "ONE_PER_SELECTED_OBSERVATION",
      "AT_LEAST_ONE",
      "MISSING_IS_INSUFFICIENT_EVIDENCE",
      "MISSING_IS_FAIL",
      "MISSING_FAILS_CLOSED_NO_RESULT",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("An empty criteria set or all-optional criteria set is invalid");
    expect(normalized).toContain("Duplicate criterion identity is forbidden");
    expect(normalized).toContain("Protocol evidence requirements are closed descriptors/selectors, not future concrete hashes");
    expect(normalized).toContain("`sourceLineage` is a closed pre-result selector");
    expect(normalized).toContain("validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>");
    expect(normalized).toContain("observationScope: ObservationScopeSelectorV1");
    expect(normalized).toContain("It must not include future Result, Validation Child Result, Validation Result, Evidence Object, Metric Result Set descriptor or database row identities");
    expect(normalized).toContain("Duplicate `requirementId` is forbidden");
    expect(normalized).toContain("Canonical ordering is lexicographic by `requirementId`");
    expect(normalized).toContain("Top-level `requiredEvidenceRequirements` MUST equal the byte-sorted deduplicated union of every criterion `evidenceRequirements`");
  });

  it("freezes exact criterion vocabularies and threshold union", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "VALIDATION_ASSESSMENT_CRITERION_V1",
      "[A-Z][A-Z0-9_]{2,63}",
      "CRITERION_V1",
      "{ kind = AGGREGATE }",
      "{ kind = ALL_EVALUATION_FOLDS }",
      "{ kind = ALL_TRAINING_FOLDS }",
      "{ kind = FOLD_PHASE, foldOrdinal = canonical non-negative integer string, phase = TRAINING | EVALUATION }",
      "SINGLE_OBSERVATION",
      "ALL_SELECTED_OBSERVATIONS_PASS",
      "VALIDATION_RESULT",
      "VALIDATION_CHILD_RESULT",
      "METRIC_RESULT_SET_DESCRIPTOR_V1",
      "METRIC_RESULT_SET_DESCRIPTOR_V2",
      "EVIDENCE_OBJECT",
      "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE",
      "UNAVAILABLE_IS_FAIL",
      "UNAVAILABLE_NOT_ADMITTED",
      "ScalarThresholdV1",
      "RangeThresholdV1",
      "CanonicalAssessmentNumericV1",
      "{ kind = RATIO, value = RESEARCH_RATIO_OUTPUT_V1 }",
      "{ kind = INTEGER, value = canonical decimal integer string }",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("Scalar operators `LT`, `LTE`, `EQ`, `GTE`, `GT` require exactly `ScalarThresholdV1`");
    expect(normalized).toContain("Range operators `BETWEEN_INCLUSIVE` and `OUTSIDE_EXCLUSIVE` require exactly `RangeThresholdV1` and `lower <= upper`");
    expect(normalized).toContain("Wrong threshold shape for operator fails closed");
    expect(normalized).toContain("A fold-specific scope must carry both `foldOrdinal` and `phase`");
    expect(normalized).toContain("Empty selected observation set must never vacuously PASS");
    expect(normalized).toContain("No runtime-selected averaging, weighting or reduction is admitted");
    expect(normalized).toContain("The former `ANY_SELECTED_OBSERVATION_FAILS` token is not admitted in V1");
    expect(contract).not.toContain("for example:");
  });

  it("freezes closed outcome vocabulary and fail-closed corruption semantics", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "VALIDATION_ASSESSMENT_RESULT_V1",
      "VALIDATION_ASSESSMENT_CRITERION_OUTCOME_V1",
      "PASS",
      "FAIL",
      "INSUFFICIENT_EVIDENCE",
      "Corruption, authority failure, schema incompatibility, lineage mismatch",
      "fail closed before an authoritative assessment outcome exists",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("failures are operational/integrity failures, not serialized assessment outcomes");
    expect(normalized).toContain("The closed assessment outcome vocabulary is exactly:");
    expect(normalized).toContain("PASS FAIL INSUFFICIENT_EVIDENCE");
  });

  it("freezes observed value kinds, reason vocabulary and outcome-to-criterion bijection", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "CRITERION_THRESHOLD_FAILED",
      "REQUIRED_EVIDENCE_MISSING",
      "METRIC_UNAVAILABLE",
      "UNAVAILABLE_POLICY_FAILED",
      "UNAVAILABLE_POLICY_INSUFFICIENT_EVIDENCE",
      "REGISTRY_INCOMPATIBLE",
      "EVIDENCE_SOURCE_INCOMPATIBLE",
      "OBSERVED_VALUE_KIND_MISMATCH",
      "reasonCode = null",
      "UNAVAILABLE_NOT_ADMITTED",
      "ValidationAssessmentObservationOutcomeV1",
      "ObservationIdentityV1",
      "observationOutcomes",
      "There is exactly one Criterion Outcome per Protocol Criterion",
    ]) expect(contract).toContain(token);
    const reasonBlock = fencedBlockAfter(contract, "`reasonCode` is closed:");
    expect(reasonBlock).not.toContain("CRITERION_PASSED");
    expect(normalized).toContain("No free-form reason string carries assessment authority");
    expect(normalized).toContain("Ratio metrics require `RATIO` observed values");
    expect(normalized).toContain("Count metrics require `INTEGER` observed values");
    expect(normalized).toContain("No implicit coercion between integer and ratio is admitted");
    expect(normalized).toContain("`reasonCode = null` exactly when `status = PASS`");
    expect(normalized).toContain("If a selected observation is unavailable under `UNAVAILABLE_NOT_ADMITTED`, no authoritative Assessment Result may be produced");
    expect(normalized).toContain("MUST NOT represent multi-fold scientific evidence with one ambiguous scalar `observedValue`");
    expect(normalized).toContain("Observation outcomes are byte-sorted by `observationIdentity.kind`, then numeric `foldOrdinal`, then `phase`");
    expect(normalized).toContain("Duplicate observation identity is forbidden");
    expect(normalized).toContain("Missing criterion outcome, extra criterion outcome, duplicate outcome, criterionId/version mismatch, operator drift, threshold drift");
    expect(normalized).toContain("Canonical ordering of `criterionOutcomes` is lexicographic by `criterionId`, then `criterionVersion`");
    expect(normalized).toContain("Within each observation outcome, `consumedEvidenceRefs` are ordered by the consumed-evidence canonical order and duplicates are forbidden");
  });

  it("freezes registry compatibility and blocks V1/V2 evidence mixing", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    expect(normalized).toContain("METRIC_REGISTRY_V20260918 -> METRIC_V1 -> METRIC_RESULT_SET_DESCRIPTOR_V1");
    expect(normalized).toContain("METRIC_REGISTRY_V20260927 -> METRIC_V2 -> METRIC_RESULT_SET_DESCRIPTOR_V2");
    expect(normalized).toContain("V1/V2 evidence cannot be mixed under a V2 assessment protocol merely because a descriptor is syntactically present");
    expect(normalized).toContain("Metric Result Set evidence is first-class descriptor evidence owned by Result and Validation Child Result payloads, not a standalone `HashRefV1` domain");
    expect(contract).toContain("MetricResultSetEvidenceV1");
    expect(contract).toContain("MetricResultSetEvidenceV2");
    expect(contract).toContain("MetricRecordEvidenceV1");
    expect(contract).toContain("MetricRecordEvidenceV2");
    expect(contract).toContain("ConsumedEvidenceRefV1");
    expect(normalized).toContain("full artifact bytes verify against descriptor SHA/byteLength/recordCount");
    expect(normalized).toContain("selects records by exact `metricId + metricVersion + registryVersion`");
    expect(normalized).toContain("Wrong metric, duplicate metric or wrong registry fails closed");
    expect(normalized).toContain("Records are ordered by `registryVersion`, then `metricId`, then `metricVersion`");
    expect(normalized).toContain("Duplicate `(registryVersion, metricId, metricVersion)` records fail closed");
    expect(normalized).toContain("never uses array indexes, database UUIDs, insertion order or object references as scientific identity");
  });

  it("freezes deterministic aggregation rather than hidden scoring", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "PASS:",
      "every required criterion has status PASS",
      "FAIL:",
      "at least one required criterion has status FAIL",
      "INSUFFICIENT_EVIDENCE:",
      "at least one required criterion has status INSUFFICIENT_EVIDENCE",
      "There is no hidden score",
      "weighted composite",
      "AI confidence",
      "caller override",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("Optional criteria may be recorded for diagnostic evidence only. Optional criteria cannot turn a failing required criterion into PASS");
    expect(normalized).toContain("no required criterion has status FAIL and at least one required criterion has status INSUFFICIENT_EVIDENCE");
  });

  it("freezes lineage, Passport projection and RL-8 consumption semantics", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    const resultPayload = fencedBlockAfter(contract, "`SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1` identifies");
    expect(resultPayload).toContain("assessmentProtocol");
    expect(resultPayload).toContain("validationProtocol");
    expect(resultPayload).toContain("validationResult");
    expect(resultPayload).toContain("consumedEvidence");
    for (const token of [
      "same tenant authority",
      "same Investigation",
      "accepted Validation Protocol HashRef",
      "accepted Validation Result HashRef",
      "Metric Result Set",
      "metric registry version is exactly the protocol's registry version",
      "Server-derived authority scope is mandatory",
      "validationAssessment.availability",
      "DEFERRED_RL3D",
      "ASSESSMENT_AVAILABLE",
      "ASSESSMENT_UNAVAILABLE",
      "Validation Assessment PASS",
      "RL-8 validation gate may PASS if all other gates pass",
      "Validation Assessment FAIL",
      "VALIDATION_FAILED",
      "Validation Assessment INSUFFICIENT_EVIDENCE",
      "Corrupt, incompatible, unauthorized or missing assessment authority",
      "PROMOTION_ELIGIBLE",
    ]) expect(contract).toContain(token);
    expect(contract).toContain("ConsumedEvidenceV1");
    expect(contract).toContain("ConsumedEvidenceRefV1");
    expect(normalized).toContain("binds exact post-result identities and descriptors");
    expect(normalized).toContain("Result evidence closure must reconstruct exactly every selected Validation Child Result, every exact Metric Result Set used, exact metric record(s), exact Validation Result and exact Assessment Protocol");
    expect(normalized).toContain("without caller memory, `latest` lookup or mutable pointers");
    expect(normalized).toContain("Assessment Result admission must also re-prove that its Assessment Protocol is the unique authoritative accepted protocol");
    expect(normalized).toContain("Multiple conflicting Assessment Results for the same exact Validation lineage and Assessment Protocol authority fail closed");
    expect(normalized).toContain("RL-8 may consume only the unique authoritative accepted Assessment Result");
    expect(normalized).toContain("RL-8 must never choose a PASS result because it is newer, more favorable or caller-selected");
  });

  it("preserves persistence boundaries and non-authority", () => {
    const contract = read(contractPath);
    for (const token of [
      "This design slice writes no SQL",
      "append-only",
      "identical retry reuses the exact same identity",
      "divergent payload",
      "RLS and FORCE RLS",
      "PostgreSQL 17 rehearsal",
      "Paper orders",
      "Live execution",
      "Capital Kernel approval",
      "Blind Truth / Evidence Vault",
      "RL-8 implementation",
      "RL-9",
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
      "Runtime changed: NO",
      "Migration changed: NO",
      "Production changed: NO",
      "Supabase Production changed: NO",
    ]) expect(contract).toContain(token);
  });
});
