"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePaid } from "@/lib/usePaid";
import { useMarketRegime } from "@/lib/useMarketRegime";
import { useUserSettings } from "@/lib/useUserSettings";

type ChatMsg = { role: "user" | "assistant"; content: string };

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

export default function CopilotChatDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Estou aqui. Diz-me o teu objetivo e eu devolvo o plano operacional (coerência + próximos passos).",
    },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { isPaid, loadingPaid, isAuthenticated } = usePaid();
  const { regime } = useMarketRegime();
  const settings = useUserSettings();

  const context = useMemo(() => {
    return {
      tier: loadingPaid ? "free" : isPaid ? "paid" : "free",
      isAuthenticated,
      regime,
      settings: settings.data,
    };
  }, [loadingPaid, isPaid, isAuthenticated, regime, settings.data]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, msgs]);

  async function send() {
    const q = text.trim();
    if (!q || sending) return;

    setText("");
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: data?.message || "Erro. Tenta novamente." },
        ]);
        return;
      }

      const reply = String(data?.assistant_message ?? "Ok. Diz-me mais.");
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Falha de rede." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-soft"
        >
          Copilot Chat
        </button>
      )}

      {open && (
        <div className="w-[360px] overflow-hidden rounded-3xl border border-border-soft bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">SignalCore Copilot</p>
              <p className="text-[11px] text-ink-500">
                {loadingPaid ? "A verificar..." : isPaid ? "Premium active" : "Free"} · Regime:{" "}
                <span className="font-semibold text-ink-800">{regime ?? "Neutral"}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border-soft bg-white px-2 py-1 text-xs font-semibold hover:bg-canvas-50"
            >
              Fechar
            </button>
          </div>

          <div ref={listRef} className="max-h-[380px] space-y-3 overflow-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-8 bg-ink-900 text-white"
                    : "mr-8 bg-canvas-50 text-ink-900 border border-border-soft"
                )}
              >
                {m.content}
              </div>
            ))}
          </div>

          <div className="border-t border-border-soft px-3 py-3">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Escreve aqui…"
                className="flex-1 rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                disabled={sending}
                onClick={send}
                className="rounded-2xl bg-signal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sending ? "…" : "Enviar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <Quick onClick={() => setText("Explica-me Drift e o que faço quando está high.")}>Drift?</Quick>
              <Quick onClick={() => setText("Qual o meu próximo passo para subir a coerência rápido?")}>Next step</Quick>
              <Quick onClick={() => setText("O que devo fazer esta semana?")}>Plano semanal</Quick>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Quick({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border-soft bg-white px-2 py-1 font-semibold text-ink-700 hover:bg-canvas-50"
    >
      {children}
    </button>
  );
}