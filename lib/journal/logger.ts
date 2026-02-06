// lib/journal/logger.ts
import { JournalEvent } from "@/lib/core/types";

const KEY = "signalcore_journal_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const journal = {
  list(limit = 50): JournalEvent[] {
    if (typeof window === "undefined") return [];
    const items = safeParse<JournalEvent[]>(localStorage.getItem(KEY), []);
    return items.sort((a, b) => b.ts - a.ts).slice(0, limit);
  },

  log(event: Omit<JournalEvent, "id" | "ts"> & { ts?: number; id?: string }) {
    if (typeof window === "undefined") return;

    const items = safeParse<JournalEvent[]>(localStorage.getItem(KEY), []);
    const id = event.id ?? `je_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const ts = event.ts ?? Date.now();

    items.push({ id, ts, type: event.type, title: event.title, details: event.details, meta: event.meta });
    localStorage.setItem(KEY, JSON.stringify(items.slice(-500))); // cap
  },

  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
  },
};