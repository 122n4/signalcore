"use client";

import type { ExecutionQueueItem } from "@/lib/execution/types";

const KEY = "signalcore_execution_queue_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(items: ExecutionQueueItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export const executionClientStore = {
  list(): ExecutionQueueItem[] {
    if (typeof window === "undefined") return [];
    return safeParse<ExecutionQueueItem[]>(localStorage.getItem(KEY), []).slice().reverse();
  },

  push(item: ExecutionQueueItem) {
    const items = safeParse<ExecutionQueueItem[]>(localStorage.getItem(KEY), []);
    items.push(item);
    write(items);
  },

  update(id: string, patch: Partial<ExecutionQueueItem>) {
    const items = safeParse<ExecutionQueueItem[]>(localStorage.getItem(KEY), []);
    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...patch };
      write(items);
    }
  },

  clear() {
    write([]);
  },
};

export async function enqueueExecutionServer(item: ExecutionQueueItem) {
  try {
    const res = await fetch("/api/execution-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("execution-queue POST failed", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error("execution-queue POST error", e);
    return false;
  }
}