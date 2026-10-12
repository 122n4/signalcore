/**
 * Syntrake Core market identity candidate resolver (RL-9C3B2B7B).
 *
 * This code intentionally has NO import from Investing, Trading or Labs.
 * The records describe historical candidate assertions, NOT provider trust,
 * verified financial/market truth, complete embargo state or read permission.
 */

export type CoreMarketSeriesIdentityV1 = Readonly<{
  providerDatasetId: string;
  providerDatasetVersion: string;
  instrumentId: string;
  fieldId: string;
  fieldVersion: string;
  coverageStart: string;
  coverageEnd: string;
}>;

export type CoreMarketIdentityCandidateV1 = Readonly<{
  schemaVersion: "CORE_MARKET_IDENTITY_CANDIDATE_V1";
  sourceKind: "PROVIDER_ADAPTER_CANDIDATE";
  authorityState: "UNVERIFIED";
  providerId: string;
  providerDatasetId: string;
  providerDatasetVersion: string;
  instrumentId: string;
  fieldId: string;
  fieldVersion: string;
  canonicalMarketId: string;
  canonicalFieldId: string;
  validFrom: string;
  validThrough: string;
  knownAt: string;
  sourceEvidenceSha256Hex: string;
}>;

export type CoreMarketIdentityCandidateResolutionV1 = Readonly<{
  classification: "UNPROVEN";
  reason:
    | "INVALID_REQUEST"
    | "INVALID_EVIDENCE"
    | "EVIDENCE_UNAVAILABLE"
    | "EVIDENCE_FUTURE_KNOWLEDGE"
    | "EVIDENCE_PARTIAL_COVERAGE"
    | "EVIDENCE_AMBIGUOUS"
    | "CANDIDATE_UNVERIFIED";
  /**
   * This is raw asserted metadata for future trust evaluation, never a grant.
   * Neither this value nor its digest is evidence of provider authenticity.
   */
  candidate?: CoreMarketIdentityCandidateV1;
}>;

const SERIES_KEYS = [
  "providerDatasetId", "providerDatasetVersion", "instrumentId", "fieldId",
  "fieldVersion", "coverageStart", "coverageEnd",
] as const;
const CANDIDATE_KEYS = [
  "schemaVersion", "sourceKind", "authorityState", "providerId",
  "providerDatasetId", "providerDatasetVersion", "instrumentId", "fieldId",
  "fieldVersion", "canonicalMarketId", "canonicalFieldId", "validFrom",
  "validThrough", "knownAt", "sourceEvidenceSha256Hex",
] as const;
const REQUEST_KEYS = ["series", "asOf", "candidates"] as const;
const KEY_FIELDS = [
  "providerDatasetId", "providerDatasetVersion", "instrumentId", "fieldId",
  "fieldVersion",
] as const;
const TOKEN_FIELDS = [
  "providerId", "providerDatasetId", "providerDatasetVersion", "instrumentId",
  "fieldId", "fieldVersion", "canonicalMarketId", "canonicalFieldId",
] as const;
const SHA256_UPPER = /^[0-9A-F]{64}$/u;

function closedRecord(raw: unknown, fields: readonly string[]): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) ||
      Object.getPrototypeOf(raw) !== Object.prototype) throw Error("INVALID");
  const own = Reflect.ownKeys(raw);
  if (own.length !== fields.length ||
      own.some((key) => typeof key !== "string" || !fields.includes(key))) {
    throw Error("INVALID");
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const property = descriptors[field];
    if (!property || !property.enumerable || !("value" in property)) throw Error("INVALID");
    result[field] = property.value;
  }
  return result;
}

function boundedText(value: unknown, max = 256): string {
  if (typeof value !== "string" || value.length === 0 ||
      new TextEncoder().encode(value).length > max || value !== value.normalize("NFC") ||
      /[\u0000-\u001F\u007F]/u.test(value)) throw Error("INVALID");
  return value;
}

function isoDay(raw: unknown): string {
  if (typeof raw !== "string") throw Error("INVALID");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
  if (!match) throw Error("INVALID");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 ||
      day > days[month - 1]!) throw Error("INVALID");
  return raw;
}

function utcTimestamp(raw: unknown): string {
  if (typeof raw !== "string") throw Error("INVALID");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u.exec(raw);
  if (!match) throw Error("INVALID");
  isoDay(match[1]);
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    throw Error("INVALID");
  }
  return raw;
}

function parseSeries(raw: unknown): CoreMarketSeriesIdentityV1 {
  const record = closedRecord(raw, SERIES_KEYS);
  const start = isoDay(record.coverageStart);
  const end = isoDay(record.coverageEnd);
  if (start > end) throw Error("INVALID");
  const tokens = Object.fromEntries(KEY_FIELDS.map(key => [key, boundedText(record[key])]));
  return Object.freeze({ ...tokens, coverageStart: start, coverageEnd: end }) as CoreMarketSeriesIdentityV1;
}

function parseCandidate(raw: unknown): CoreMarketIdentityCandidateV1 {
  const record = closedRecord(raw, CANDIDATE_KEYS);
  if (record.schemaVersion !== "CORE_MARKET_IDENTITY_CANDIDATE_V1" ||
      record.sourceKind !== "PROVIDER_ADAPTER_CANDIDATE" ||
      record.authorityState !== "UNVERIFIED") throw Error("INVALID");
  const tokens = Object.fromEntries(TOKEN_FIELDS.map(key => [key, boundedText(record[key])]));
  const start = isoDay(record.validFrom);
  const end = isoDay(record.validThrough);
  if (start > end || typeof record.sourceEvidenceSha256Hex !== "string" ||
      !SHA256_UPPER.test(record.sourceEvidenceSha256Hex)) throw Error("INVALID");
  return Object.freeze({
    schemaVersion: "CORE_MARKET_IDENTITY_CANDIDATE_V1" as const,
    sourceKind: "PROVIDER_ADAPTER_CANDIDATE" as const,
    authorityState: "UNVERIFIED" as const,
    ...tokens, validFrom: start, validThrough: end,
    knownAt: utcTimestamp(record.knownAt),
    sourceEvidenceSha256Hex: record.sourceEvidenceSha256Hex,
  }) as CoreMarketIdentityCandidateV1;
}

function closedArray(raw: unknown): readonly unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype ||
      raw.length > 1024) throw Error("INVALID");
  const properties = Reflect.ownKeys(raw);
  if (properties.length !== raw.length + 1 ||
      properties.some((key) => key !== "length" && (typeof key !== "string" ||
        !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= raw.length))) throw Error("INVALID");
  const desc = Object.getOwnPropertyDescriptors(raw);
  const out: unknown[] = [];
  for (let i = 0; i < raw.length; i++) {
    const property = desc[String(i)];
    if (!property || !("value" in property) || !property.enumerable) throw Error("INVALID");
    out.push(property.value);
  }
  return out;
}

const result = (reason: CoreMarketIdentityCandidateResolutionV1["reason"],
  candidate?: CoreMarketIdentityCandidateV1): CoreMarketIdentityCandidateResolutionV1 =>
  Object.freeze(candidate ? { classification: "UNPROVEN", reason, candidate } :
    { classification: "UNPROVEN", reason });

/**
 * Deliberately denies ALL resolutions: even a complete single candidate
 * contains neither authenticated source evidence nor read-access authority.
 *
 * asOf and candidate.knownAt are strict UTC milliseconds; date ranges are
 * inclusive market civil dates. Future provider knowledge cannot be used.
 */
export function resolveCoreMarketIdentityCandidateV1(raw: unknown): CoreMarketIdentityCandidateResolutionV1 {
  let request: Record<string, unknown>;
  let series: CoreMarketSeriesIdentityV1;
  let asOf: string;
  try {
    request = closedRecord(raw, REQUEST_KEYS);
    series = parseSeries(request.series);
    asOf = utcTimestamp(request.asOf);
    // Date-only observations have no validated intraday publication time.\n    // Same-day asOf cannot prove even a completed daily close.\n    if (series.coverageEnd >= asOf.slice(0, 10)) throw Error("INVALID");
  } catch {
    return result("INVALID_REQUEST");
  }

  let candidates: CoreMarketIdentityCandidateV1[];
  try {
    candidates = closedArray(request.candidates).map(parseCandidate);
  } catch {
    return result("INVALID_EVIDENCE");
  }
  const matches = candidates.filter(candidate =>
    KEY_FIELDS.every(key => candidate[key] === series[key]));
  if (matches.length === 0) return result("EVIDENCE_UNAVAILABLE");

  const pointInTime = matches.filter(candidate => candidate.knownAt <= asOf);
  if (pointInTime.length === 0) return result("EVIDENCE_FUTURE_KNOWLEDGE");
  const intersecting = pointInTime.filter(candidate =>
    candidate.validFrom <= series.coverageEnd &&
    candidate.validThrough >= series.coverageStart);
  if (intersecting.length === 0) return result("EVIDENCE_PARTIAL_COVERAGE");
  // A revision/alias change in the period requires segmented point-in-time
  // proof. Never silently prefer "newest" or "most complete".
  if (intersecting.length > 1) return result("EVIDENCE_AMBIGUOUS");
  const candidate = intersecting[0]!;
  if (candidate.validFrom > series.coverageStart ||
      candidate.validThrough < series.coverageEnd) {
    return result("EVIDENCE_PARTIAL_COVERAGE");
  }
  return result("CANDIDATE_UNVERIFIED", candidate);
}
