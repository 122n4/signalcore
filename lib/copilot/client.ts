// lib/copilot/client.ts

type CopilotRequest = {
  context: string; // ex: "risk" | "advisor" | "portfolio"
  question: string;
  state?: Record<string, any>;
};

export type CopilotResponse = {
  summary?: string;

  actions?: Array<{
    id?: string;
    action?: string;
    label?: string;
    asset?: string;
    sizePct?: number;
    rationale?: string;
    confidence?: "low" | "medium" | "high";
    impact?: Record<string, string>;
    guardrailsCheck?: { pass: boolean; notes?: string[] };
  }>;

  assumptions?: string[];
  confidence?: "low" | "medium" | "high";

  // opcional, para debug
  raw?: any;
};

export async function askCopilot(payload: CopilotRequest, signal?: AbortSignal) {
  const res = await fetch("/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Copilot error (${res.status}): ${text || "unknown"}`);
  }

  const data = (await res.json()) as CopilotResponse;
  return data;
}