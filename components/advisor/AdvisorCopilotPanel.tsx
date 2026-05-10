"use client";

import React, { useMemo, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function AdvisorCopilotPanel(props: {
  context: any;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I’m your Syntrake Advisor. Ask me what to do today, how to reach your goal faster, or whether your risk is too high.",
    },
  ]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const quick = useMemo(
    () => [
      "What should I do today?",
      "Am I taking too much risk?",
      "What is the fastest safe path to my goal?",
      "Explain my plan in human terms.",
    ],
    []
  );

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;

    setMessages((m) => [...m, { role: "user", content: t }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: t }],
          context: props.context ?? {},
        }),
      });

      const data = await res.json().catch(() => ({}));
      const assistant = String(data?.assistant_message ?? "").trim();

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            assistant ||
            "I couldn’t generate a response. Try: “What should I do today?”",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Network error. Try again in a moment. (If this persists, refresh.)",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            Copilot (Advisor)
          </div>
          <div className="mt-1 text-sm text-ink-600">
            Human answers by default. Pro view when you want the terminal.
          </div>
        </div>

        <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-ink-700">
          Live
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-neutral-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {messages.slice(-10).map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              m.role === "assistant"
                ? "border-border-soft bg-neutral-50 text-ink-900"
                : "border-border-soft bg-white text-ink-900"
            }`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Ask Syntrake…"
          className="h-11 w-full rounded-2xl border border-border-soft bg-white px-4 text-sm outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="h-11 rounded-2xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>

      <div className="mt-3 text-xs text-ink-500">
        Tip: ask “What should I do today?” every morning.
      </div>
    </div>
  );
}
