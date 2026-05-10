// lib/market/cache.ts
type CacheEntry<T> = { v: T; exp: number };

const g = globalThis as any;
if (!g.__sc_cache) g.__sc_cache = new Map<string, CacheEntry<any>>();

const CACHE: Map<string, CacheEntry<any>> = g.__sc_cache;

export function cacheGet<T>(key: string): T | null {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    CACHE.delete(key);
    return null;
  }
  return e.v as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  CACHE.set(key, { v: value, exp: Date.now() + Math.max(0, ttlMs) });
}