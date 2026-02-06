// lib/alerts/clientStore.ts
import { CreateUserAlertInput, UserAlert } from "@/lib/alerts/types";

export const alertsStore = {
  async list(limit = 50): Promise<UserAlert[]> {
    const res = await fetch(`/api/alerts?limit=${limit}`, { cache: "no-store" });
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  },

  async create(input: CreateUserAlertInput): Promise<UserAlert | null> {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as UserAlert | null;
  },

  async dismiss(id: string) {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
  },

  async dismissAll() {
    await fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ALL" }),
    }).catch(() => null);
  },
};