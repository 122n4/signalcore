import { canonicalDateV1, canonicalTextV1 } from './canonical';
import { canonicalBlindTruthHoldoutScopeV1, type BlindTruthHoldoutScopeV1 } from './blindTruth';

/**
 * RL-9C3A: purely deterministic prefilter, NOT a dataset-access authorizer.
 * Caller-provided lists, mapping assertions and audit claims are NEVER proof of
 * complete active embargo state. Even NO_INTERSECTION is not permission to read.
 */
export type OrdinaryResearchCanonicalRequestV1 = Readonly<{
  canonicalMarkets: readonly string[];
  canonicalFields: readonly string[];
  coverageStart: string;
  coverageEnd: string;
  requestedFrequency: string;
  mappingState: 'VERIFIED' | 'AMBIGUOUS' | 'UNAVAILABLE';
}>;
export type EmbargoIntersectionInputV1 = Readonly<{
  request: OrdinaryResearchCanonicalRequestV1;
  embargoScopes: readonly BlindTruthHoldoutScopeV1[];
}>;
export type EmbargoIntersectionClassificationV1 = Readonly<{
  classification: 'DENY' | 'UNPROVEN';
  reason: 'EMBARGO_INTERSECTION' | 'MAPPING_NOT_VERIFIED' | 'MALFORMED_EVIDENCE' |
    'NO_EMBARGO_SNAPSHOT' | 'NO_INTERSECTION_NOT_AUTHORIZATION';
}>;

const DENIED = Object.freeze({classification: 'DENY', reason: 'EMBARGO_INTERSECTION'} as const);
const INVALID = Object.freeze({classification: 'UNPROVEN', reason: 'MALFORMED_EVIDENCE'} as const);
const MAPPING = Object.freeze({classification: 'UNPROVEN', reason: 'MAPPING_NOT_VERIFIED'} as const);
const ABSENT = Object.freeze({classification: 'UNPROVEN', reason: 'NO_EMBARGO_SNAPSHOT'} as const);
const NO_MATCH = Object.freeze({classification: 'UNPROVEN', reason: 'NO_INTERSECTION_NOT_AUTHORIZATION'} as const);

function closedDataObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) throw Error('INVALID');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(k => typeof k !== 'string' || !fields.includes(k))) throw Error('INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (fields.some(k => !Object.hasOwn(descriptors, k) || !('value' in descriptors[k]) || !descriptors[k].enumerable)) throw Error('INVALID');
  return Object.fromEntries(fields.map(k => [k, descriptors[k].value]));
}
function canonicalIds(value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) throw Error('INVALID');
  const normalized = value.map(item => canonicalTextV1(item, {minBytes: 1, maxBytes: 256}));
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) throw Error('INVALID');
  return unique;
}
function intersects(left: Set<string>, right: readonly string[]): boolean {
  return right.some(id => left.has(id));
}

export function inspectBlindTruthEmbargoIntersectionV1(input: unknown): EmbargoIntersectionClassificationV1 {
  try {
    const top = closedDataObject(input, ['request','embargoScopes']);
    const r = closedDataObject(top.request, ['canonicalMarkets','canonicalFields','coverageStart','coverageEnd','requestedFrequency','mappingState']);
    if (r.mappingState !== 'VERIFIED') return MAPPING;
    // Market/field mappings are *claimed* verified here; future owner must prove
    // mapping provenance, tenant, complete snapshot, and durable embargo in DB.
    const markets = canonicalIds(r.canonicalMarkets);
    const fields = canonicalIds(r.canonicalFields);
    const start = canonicalDateV1(r.coverageStart as string);
    const end = canonicalDateV1(r.coverageEnd as string);
    if (start > end) return INVALID;
    canonicalTextV1(r.requestedFrequency as string, {minBytes: 1, maxBytes: 128});
    const scopes = top.embargoScopes;
    if (!Array.isArray(scopes) || scopes.length > 512) return INVALID;
    if (scopes.length === 0) return ABSENT;
    // Full closed/validated scan. Reject any invalid scope, even after a match:
    // we never treat incomplete or corrupt scope evidence as a clear result.
    let overlap = false;
    for (const raw of scopes) {
      const scope = canonicalBlindTruthHoldoutScopeV1(raw as BlindTruthHoldoutScopeV1) as unknown as {
        markets: string[]; fields: string[]; coverageStart: string; coverageEnd: string;
      };
      const sameMarket = intersects(markets, scope.markets);
      const sameField = intersects(fields, scope.fields);
      const dateOverlap = start <= scope.coverageEnd && end >= scope.coverageStart;
      if (sameMarket && sameField && dateOverlap) overlap = true;
    }
    return overlap ? DENIED : NO_MATCH;
  } catch {
    // Suppress untrusted accessor/provider messages; never echo sensitive inputs.
    return INVALID;
  }
}
