import { canonicalDatasetSeriesHashPayloadV1, type DatasetSeriesHashPayloadV1 } from "./executionMaterials";
import { i5ResearchInternalCanonicalJsonBytesV1, sha256HexV1, type HashRefV1 } from "./canonical";
import { isXnysSessionV1 } from "./calendars";

export type DatasetSeriesObservationV1 = Readonly<{ date: string; value: string }>;

export type VerifiedDatasetSeriesMaterialV1 = Readonly<{
  series: DatasetSeriesHashPayloadV1;
  observations: readonly DatasetSeriesObservationV1[];
  byDate: ReadonlyMap<string, string>;
}>;

export interface ResearchDatasetMaterialProviderV1 {
  loadSeriesContent(seriesRef: HashRefV1): Promise<Buffer | null>;
}

export class InMemoryResearchDatasetMaterialProviderV1 implements ResearchDatasetMaterialProviderV1 {
  constructor(private readonly materials: ReadonlyMap<string, Buffer>) {}
  async loadSeriesContent(seriesRef: HashRefV1): Promise<Buffer | null> {
    return this.materials.get(seriesRef.hashHex) ?? null;
  }
}

export function canonicalDatasetSeriesMaterialBytesV1(observations: readonly DatasetSeriesObservationV1[]): Buffer {
  const rows = observations.map((observation) => `${i5ResearchInternalCanonicalJsonBytesV1({
    date: observation.date,
    value: observation.value,
  }).toString("utf8")}\n`);
  return Buffer.from(rows.join(""), "utf8");
}

export function verifyDatasetSeriesMaterialV1(series: DatasetSeriesHashPayloadV1, bytes: Buffer): VerifiedDatasetSeriesMaterialV1 {
  canonicalDatasetSeriesHashPayloadV1(series);
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (bytes.includes(0x0d) || (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  }
  const actualSha = sha256HexV1(bytes);
  if (actualSha !== series.contentSha256) throw new Error("DATASET_MATERIAL_HASH_MISMATCH");
  const lines = bytes.toString("utf8").split("\n");
  lines.pop();
  const observations = lines.map(parseObservationLine);
  const canonical = canonicalDatasetSeriesMaterialBytesV1(observations);
  if (!canonical.equals(bytes)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (String(observations.length) !== series.observationCount) throw new Error("DATASET_MATERIAL_COUNT_MISMATCH");
  if (observations[0]?.date !== series.coverageStart || observations.at(-1)?.date !== series.coverageEnd) {
    throw new Error("DATASET_MATERIAL_COVERAGE_MISMATCH");
  }
  let previous = "";
  const byDate = new Map<string, string>();
  for (const observation of observations) {
    if (observation.date <= previous || byDate.has(observation.date)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    validateFieldMaterial(series, observation);
    previous = observation.date;
    byDate.set(observation.date, observation.value);
  }
  return Object.freeze({ series, observations, byDate });
}

function parseObservationLine(line: string): DatasetSeriesObservationV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "date,value") throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (typeof record.date !== "string" || typeof record.value !== "string") throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(record.date)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  return { date: record.date, value: record.value };
}

function validateFieldMaterial(series: DatasetSeriesHashPayloadV1, observation: DatasetSeriesObservationV1): void {
  if (series.frequency !== "DAILY" || series.timezone !== "America/New_York" || series.calendar !== "XNYS_TRADING_CALENDAR_V1") {
    throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  }
  if (!isXnysSessionV1(observation.date)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
  if (series.fieldId === "ADJUSTED_CLOSE") {
    if (series.currency !== "USD") throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    if (!/^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/u.test(observation.value) || /^0(?:\.0+)?$/u.test(observation.value)) {
      throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    }
    return;
  }
  if (series.fieldId === "VOLUME") {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(observation.value)) throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
    return;
  }
  throw new Error("DATASET_MATERIAL_SCHEMA_INVALID");
}
