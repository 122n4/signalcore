// lib/execution/queue.ts
import { Candidate } from "@/lib/core/types";

const KEY = "signalcore_execution_queue_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const executionQueue = {
  list(): Candidate[] {
    if (typeof window === "undefined") return [];
    return safeParse<Candidate[]>(localStorage.getItem(KEY), []);
  },

  add(candidate: Candidate) {
    if (typeof window === "undefined") return;
    const items = safeParse<Candidate[]>(localStorage.getItem(KEY), []);
    const exists = items.some((c) => c.id === candidate.id);
    if (!exists) items.unshift(candidate);
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200)));
  },

  remove(id: string) {
    if (typeof window === "undefined") return;
    const items = safeParse<Candidate[]>(localStorage.getItem(KEY), []);
    localStorage.setItem(KEY, JSON.stringify(items.filter((c) => c.id !== id)));
  },

  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
  },
};