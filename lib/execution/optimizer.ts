// lib/execution/optimizer.ts
import { ExecutionBatch, OrderIntent } from "@/lib/execution/types";

/**
 * MAX++ v1 optimizer:
 * - Netting: merges same (instrument,symbol,action) and cancels opposing actions
 * - Sequencing: sell intents first (to "fund" buys)
 */
export function optimizeBatch(batch: ExecutionBatch): ExecutionBatch {
  const map = new Map<string, OrderIntent>();

  function key(i: OrderIntent) {
    return `${i.instrument}:${i.symbol}:${i.action}`;
  }
  function oppKey(i: OrderIntent) {
    return `${i.instrument}:${i.symbol}:${i.action === "Buy" ? "Sell" : "Buy"}`;
  }

  for (const it of batch.intents) {
    const k = key(it);
    const ok = oppKey(it);

    // If opposing intent exists, net by sizePct (proxy)
    if (map.has(ok)) {
      const opp = map.get(ok)!;
      const a = (opp.sizePct ?? 0);
      const b = (it.sizePct ?? 0);
      if (a === b) {
        map.delete(ok);
      } else if (a > b) {
        opp.sizePct = a - b;
        map.set(ok, opp);
      } else {
        // replace with remaining of current intent
        map.delete(ok);
        map.set(k, { ...it, sizePct: b - a });
      }
      continue;
    }

    // Otherwise merge same direction
    if (map.has(k)) {
      const cur = map.get(k)!;
      cur.sizePct = (cur.sizePct ?? 0) + (it.sizePct ?? 0);
      map.set(k, cur);
    } else {
      map.set(k, { ...it });
    }
  }

  const intents = Array.from(map.values())
    .filter((x) => (x.sizePct ?? 0) > 0.0001)
    .sort((a, b) => (a.action === "Sell" ? -1 : 1) - (b.action === "Sell" ? -1 : 1));

  return { ...batch, intents };
}