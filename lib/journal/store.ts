// lib/journal/store.ts
import { JournalEvent, JournalEventType } from "@/lib/core/types";

const KEY = "signalcore_journal_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export type JournalQuery = {
  q?: string; // search across title/details/type/meta
  types?: JournalEventType[];
  fromTs?: number; // inclusive
  toTs?: number; // inclusive
  limit?: number; // default 200
};

export function readAll(): JournalEvent[] {
  if (typeof window === "undefined") return [];
  const items = safeParse<JournalEvent[]>(localStorage.getItem(KEY), []);
  return items.sort((a, b) => b.ts - a.ts);
}

function textOf(e: JournalEvent) {
  const parts = [
    e.title ?? "",
    e.details ?? "",
    e.type ?? "",
    JSON.stringify(e.meta ?? {}),
  ];
  return parts.join(" ").toLowerCase();
}

export function queryJournal(query: JournalQuery): JournalEvent[] {
  const { q, types, fromTs, toTs, limit = 200 } = query;

  let out = readAll();
  const qn = (q ?? "").trim().toLowerCase();

  if (types?.length) out = out.filter((e) => types.includes(e.type));
  if (typeof fromTs === "number") out = out.filter((e) => e.ts >= fromTs);
  if (typeof toTs === "number") out = out.filter((e) => e.ts <= toTs);
  if (qn) out = out.filter((e) => textOf(e).includes(qn));

  return out.slice(0, limit);
}