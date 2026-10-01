import { canonicalDateV1, sha256HexV1, type CanonicalJsonValue } from "./canonical";
import { compareRationalV1, decimalStringToRationalV1, renderMoneyOutputV2 } from "./exactRational";
import { canonicalJsonlArtifactBytesV1, type ResearchArtifactDescriptorV1 } from "./resultArtifacts";

/** The records emitted by historicalExecutionEngineV2, not execution events. */
export type ValuationArtifactRecordV2 = Readonly<{
  sessionDate: string;
  cash: string;
  marketValue: string;
  nav: string;
  cumulativeExplicitFees: string;
  cumulativeSlippageCost: string;
}>;

export function parseValuationArtifactV2(bytes: Buffer, descriptor: ResearchArtifactDescriptorV1): readonly ValuationArtifactRecordV2[] {
  if (descriptor.artifactSchemaVersion !== "RESEARCH_VALUATION_SERIES_V2" || descriptor.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1" ||
      descriptor.contentSha256 !== sha256HexV1(bytes) || descriptor.contentByteLength !== String(bytes.length)) throw new Error("COST_ARTIFACT_INVALID");
  const records: ValuationArtifactRecordV2[] = bytes.toString("utf8").split("\n").slice(0, -1).map((line) => JSON.parse(line));
  if (!records.length || descriptor.recordCount !== String(records.length) || !canonicalJsonlArtifactBytesV1(records as unknown as CanonicalJsonValue[]).equals(bytes)) throw new Error("COST_ARTIFACT_INVALID");
  let previous: ValuationArtifactRecordV2 | undefined;
  const keys = ["cash", "cumulativeExplicitFees", "cumulativeSlippageCost", "marketValue", "nav", "sessionDate"];
  for (const record of records) {
    if (!record || Object.keys(record).sort().join() !== keys.join() || canonicalDateV1(record.sessionDate) !== record.sessionDate ||
        (previous && previous.sessionDate >= record.sessionDate)) throw new Error("COST_RECORD_INVALID");
    for (const key of ["cash", "marketValue", "nav", "cumulativeExplicitFees", "cumulativeSlippageCost"] as const) {
      if (typeof record[key] !== "string" || renderMoneyOutputV2(decimalStringToRationalV1(record[key])) !== record[key]) throw new Error("COST_RECORD_INVALID");
    }
    for (const key of ["cumulativeExplicitFees", "cumulativeSlippageCost"] as const) {
      const value = decimalStringToRationalV1(record[key]);
      if (value.numerator < 0n || (previous && compareRationalV1(value, decimalStringToRationalV1(previous[key])) < 0)) throw new Error("NON_MONOTONIC_COST");
    }
    previous = record;
  }
  return Object.freeze(records.map((record) => Object.freeze(record)));
}
