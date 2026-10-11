import { describe, expect, it } from 'vitest';
import { inspectBlindTruthEmbargoIntersectionV1 as inspect } from '../lib/investing/research/blindTruthEmbargoIntersection';
import type { BlindTruthHoldoutScopeV1 } from '../lib/investing/research/blindTruth';

const scope: BlindTruthHoldoutScopeV1 = {
  schemaVersion: 'BLIND_TRUTH_HOLDOUT_SCOPE_V1',
  providerId: 'PROVIDER_V1', providerDatasetId: 'DATASET_V1',
  providerDatasetVersion: 'DATASET_VERSION_20261009',
  markets: ['EURUSD', 'BTCUSD'], frequency: 'M1', fields: ['close', 'open'],
  coverageStart: '2026-01-01', coverageEnd: '2026-06-30',
  calendarId: 'CALENDAR_24_7_V1', timezone: 'UTC'
};
const request = {
  canonicalMarkets: ['EURUSD'], canonicalFields: ['close'],
  coverageStart: '2026-06-30', coverageEnd: '2026-07-01',
  requestedFrequency: '1D', mappingState: 'VERIFIED' as const
};
const input = (r: object = request, embargoScopes: readonly BlindTruthHoldoutScopeV1[] = [scope]) => ({request:r, embargoScopes});
const denied = {classification: 'DENY', reason: 'EMBARGO_INTERSECTION'};
const unproven = {classification: 'UNPROVEN', reason: 'NO_INTERSECTION_NOT_AUTHORIZATION'};

describe('RL-9C3A: no-cost pure embargo intersection inspection, NEVER authorization', () => {
  it('denies touching the inclusive end of the embargo interval despite different requested frequency', () => {
    expect(inspect(input())).toEqual(denied);
  });
  it('denies touching the inclusive start of the embargo interval', () => {
    expect(inspect(input({...request,coverageStart:'2025-12-31',coverageEnd:'2026-01-01'}))).toEqual(denied);
  });
  it('denies subset / superset market and field overlap', () => {
    expect(inspect(input({...request, canonicalMarkets:['AAPL','BTCUSD'],canonicalFields:['volume','open']}))).toEqual(denied);
  });
  it('ignores provider and frequency identity for canonical market-field embargo intersection', () => {
    expect(inspect(input({...request,requestedFrequency:'W1'},[{...scope,providerId:'OTHER_PROVIDER_V1',frequency:'D1'}]))).toEqual(denied);
  });
  it('never authorizes when market or field does not intersect', () => {
    expect(inspect(input({...request,canonicalMarkets:['ETHUSD']}))).toEqual(unproven);
    expect(inspect(input({...request,canonicalFields:['volume']}))).toEqual(unproven);
  });
  it('never authorizes when coverage dates are nonoverlapping', () => {
    expect(inspect(input({...request,coverageStart:'2026-07-01',coverageEnd:'2026-07-02'}))).toEqual(unproven);
    expect(inspect(input({...request,coverageStart:'2025-12-28',coverageEnd:'2025-12-31'}))).toEqual(unproven);
  });
  it('does not count absence of an authoritative embargo snapshot as clear access', () => {
    expect(inspect(input(request,[]))).toEqual({classification:'UNPROVEN',reason:'NO_EMBARGO_SNAPSHOT'});
  });
  it('blocks both ambiguous and unavailable provider-field mapping', () => {
    for (const mappingState of ['AMBIGUOUS','UNAVAILABLE',undefined]) {
      expect(inspect(input({...request,mappingState}))).toEqual({classification:'UNPROVEN',reason:'MAPPING_NOT_VERIFIED'});
    }
  });
  it('rejects reversed, nonexistent or malformed dates', () => {
    for (const dates of [{coverageStart:'2026-07-02',coverageEnd:'2026-07-01'},
      {coverageStart:'2026-02-30',coverageEnd:'2026-06-30'},
      {coverageStart:'2026-01-01T00:00:00Z',coverageEnd:'2026-06-30'}]) {
      expect(inspect(input({...request,...dates}))).toEqual({classification:'UNPROVEN',reason:'MALFORMED_EVIDENCE'});
    }
  });
  it('rejects duplicate canonical market/field identifiers and empty sets', () => {
    for (const bad of [{canonicalMarkets: ['EURUSD','EURUSD']}, {canonicalFields: []}, {canonicalMarkets: []}]) {
      expect(inspect(input({...request,...bad}))).toEqual({classification:'UNPROVEN',reason:'MALFORMED_EVIDENCE'});
    }
  });
  it('rejects malformed embargo scopes, even with an earlier valid overlapping scope', () => {
    expect(inspect(input(request,[scope,{...scope,coverageStart:'2026-11-02',coverageEnd:'2026-01-01'}]))).toEqual({classification:'UNPROVEN',reason:'MALFORMED_EVIDENCE'});
  });
  it('never executes malicious getters or exposes their error messages', () => {
    const poison={...request};
    Object.defineProperty(poison,'canonicalMarkets',{enumerable:true,get(){throw Error('secret input leak');}});
    expect(inspect(input(poison))).toEqual({classification:'UNPROVEN',reason:'MALFORMED_EVIDENCE'});
  });
  it('rejects inherited attributes, additional fields and symbol keys', () => {
    const inherited=Object.assign(Object.create({admin:true}), request);
    for (const bad of [inherited,{...request,extra:true},{...request,[Symbol('extra')]:1}]) {
      expect(inspect(input(bad))).toEqual({classification:'UNPROVEN',reason:'MALFORMED_EVIDENCE'});
    }
  });
  it('does not claim durable embargo, mapping authority or access-audit completeness', () => {
    const answer=inspect(input({...request,canonicalFields:['volume']}));
    expect(answer.classification).not.toBe('ALLOW');
    expect(JSON.stringify(answer)).not.toMatch(/AUTHORIZED|COMPLETE|READ_GRANTED/);
  });
});
