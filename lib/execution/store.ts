// lib/execution/store.ts
import { ExecutionBatch, SimulationResult, ExecutionMode, OrderIntent } from "@/lib/execution/types";

const KEY_BATCH = "signalcore_execution_batch_v1";
const KEY_LAST = "signalcore_execution_last_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const executionStore = {
  getBatch(): ExecutionBatch | null {
    if (typeof window === "undefined") return null;
    return safeParse<ExecutionBatch | null>(localStorage.getItem(KEY_BATCH), null);
  },

  initBatch(mode: ExecutionMode = "balanced"): ExecutionBatch {
    const b: ExecutionBatch = {
      id: `b_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      createdAt: Date.now(),
      mode,
      intents: [],
    };
    safeSet(KEY_BATCH, b);
    return b;
  },

  setMode(mode: ExecutionMode) {
    const b = this.getBatch() ?? this.initBatch(mode);
    b.mode = mode;
    safeSet(KEY_BATCH, b);
    return b;
  },

  addIntent(intent: OrderIntent) {
    const b = this.getBatch() ?? this.initBatch("balanced");
    const exists = b.intents.some((x) => x.id === intent.id);
    if (!exists) b.intents.push(intent);
    safeSet(KEY_BATCH, b);
    return b;
  },

  removeIntent(id: string) {
    const b = this.getBatch() ?? this.initBatch("balanced");
    b.intents = b.intents.filter((x) => x.id !== id);
    safeSet(KEY_BATCH, b);
    return b;
  },

  clearBatch() {
    safeSet(KEY_BATCH, null);
  },

  setLastExecution(payload: { batch: ExecutionBatch; simulation?: SimulationResult; memo?: string }) {
    safeSet(KEY_LAST, { ...payload, ts: Date.now() });
  },

  getLastExecution(): any {
    if (typeof window === "undefined") return null;
    return safeParse<any>(localStorage.getItem(KEY_LAST), null);
  },
};