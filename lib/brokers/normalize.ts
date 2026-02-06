// lib/brokers/normalize.ts
import type { BrokerSnapshot } from "./types";

export function snapshotHash(snapshot: BrokerSnapshot) {
  // hash simples (determinístico) para evitar guardar snapshots repetidos
  const raw = JSON.stringify({
    provider: snapshot.provider,
    asOf: snapshot.asOf,
    accounts: snapshot.accounts,
    positions: snapshot.positions,
  });

  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h << 5) - h + raw.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

export function computeMetrics(snapshot: BrokerSnapshot) {
  const total =
    snapshot.totalValue ??
    snapshot.positions.reduce((acc, p) => acc + (p.value ?? 0), 0);

  const positionsCount = snapshot.positions.length;
  const accountsCount = snapshot.accounts.length;

  return {
    totalValue: total,
    positionsCount,
    accountsCount,
  };
}