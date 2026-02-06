// lib/brokers/store.ts
import type { BrokerSnapshot } from "./types";

/**
 * Nesta V2 guardamos o snapshot em memória (dev),
 * e depois trocamos para Supabase (prod).
 *
 * Para já isto desbloqueia tudo e remove erros.
 */

const mem = new Map<string, BrokerSnapshot>();

export function storeSnapshot(userId: string, snapshot: BrokerSnapshot) {
  mem.set(userId, snapshot);
}

export function getLatestSnapshot(userId: string) {
  return mem.get(userId) ?? null;
}