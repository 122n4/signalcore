import { compareRationalV1, decimalStringToRationalV1, subtractRationalV1, type ExactRationalV1 } from "./exactRational";
import { metricDirectionV1, type ComparisonMetricIdV1, type DirectionalComparisonMetricIdV1 } from "./experimentComparison";

export type ExactMetricObservationV1 = Readonly<{
  metricId: ComparisonMetricIdV1;
  metricVersion: "METRIC_V2";
  registryVersion: "METRIC_REGISTRY_V20260927";
  artifactSchemaVersion: "METRIC_RESULT_SET_V2";
  state: "VALUE" | "MISSING";
  canonicalDecimal: string | null;
}>;

export type ExactMetricDeltaV1 = Readonly<{
  metricId: ComparisonMetricIdV1;
  metricVersion: "METRIC_V2";
  registryVersion: "METRIC_REGISTRY_V20260927";
  artifactSchemaVersion: "METRIC_RESULT_SET_V2";
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "DESCRIPTIVE_ONLY";
  referenceValue: string;
  subjectValue: string;
  rawDelta: Readonly<{ numerator: string; denominator: string }>;
  orientedDelta: Readonly<{ numerator: string; denominator: string }> | null;
  orientedDeltaSign: -1 | 0 | 1 | null;
}>;

export type MetricDeltaOutcomeV1 =
  | Readonly<{ state: "AVAILABLE"; delta: ExactMetricDeltaV1 }>
  | Readonly<{ state: "UNAVAILABLE"; reason: "MISSING_METRIC" | "METRIC_UNAVAILABLE_ON_ONE_SIDE" }>;

export function compareExactMetricObservationV1(reference: ExactMetricObservationV1, subject: ExactMetricObservationV1): MetricDeltaOutcomeV1 {
  if (reference.metricId !== subject.metricId) throw new Error("METRIC_ID_MISMATCH");
  assertMetricCompatibilityV1(reference, subject);
  if (reference.state !== "VALUE" || subject.state !== "VALUE") {
    return Object.freeze({ state: "UNAVAILABLE", reason: reference.state === "MISSING" && subject.state === "MISSING" ? "MISSING_METRIC" : "METRIC_UNAVAILABLE_ON_ONE_SIDE" });
  }
  if (reference.canonicalDecimal === null || subject.canonicalDecimal === null) throw new Error("VALUE_WITHOUT_CANONICAL_DECIMAL");
  const referenceRational = decimalStringToRationalV1(reference.canonicalDecimal);
  const subjectRational = decimalStringToRationalV1(subject.canonicalDecimal);
  const raw = subtractRationalV1(subjectRational, referenceRational);
  const direction = metricDirectionV1(reference.metricId);
  const oriented = direction === "DESCRIPTIVE_ONLY" ? null : direction === "HIGHER_IS_BETTER" ? raw : negate(raw);
  return Object.freeze({
    state: "AVAILABLE",
    delta: Object.freeze({
      metricId: reference.metricId,
      metricVersion: reference.metricVersion,
      registryVersion: reference.registryVersion,
      artifactSchemaVersion: reference.artifactSchemaVersion,
      direction,
      referenceValue: reference.canonicalDecimal,
      subjectValue: subject.canonicalDecimal,
      rawDelta: canonicalRational(raw),
      orientedDelta: oriented === null ? null : canonicalRational(oriented),
      orientedDeltaSign: oriented === null ? null : compareRationalV1(oriented, { numerator: 0n, denominator: 1n }),
    }),
  });
}

export function directionalMetricDeltaSignV1(outcome: MetricDeltaOutcomeV1, metricId: DirectionalComparisonMetricIdV1): -1 | 0 | 1 | null {
  if (outcome.state === "UNAVAILABLE") return null;
  if (outcome.delta.metricId !== metricId) throw new Error("PRIMARY_METRIC_ID_MISMATCH");
  if (outcome.delta.orientedDeltaSign === null) throw new Error("PRIMARY_METRIC_NOT_DIRECTIONAL");
  return outcome.delta.orientedDeltaSign;
}

function negate(value: ExactRationalV1): ExactRationalV1 { return { numerator: -value.numerator, denominator: value.denominator }; }
function canonicalRational(value: ExactRationalV1): Readonly<{ numerator: string; denominator: string }> { return Object.freeze({ numerator: value.numerator.toString(), denominator: value.denominator.toString() }); }
function assertMetricCompatibilityV1(reference: ExactMetricObservationV1, subject: ExactMetricObservationV1): void {
  if (reference.metricVersion !== "METRIC_V2" || subject.metricVersion !== "METRIC_V2") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (reference.registryVersion !== "METRIC_REGISTRY_V20260927" || subject.registryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (reference.artifactSchemaVersion !== "METRIC_RESULT_SET_V2" || subject.artifactSchemaVersion !== "METRIC_RESULT_SET_V2") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (reference.metricVersion !== subject.metricVersion) throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (reference.registryVersion !== subject.registryVersion) throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (reference.artifactSchemaVersion !== subject.artifactSchemaVersion) throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
}
