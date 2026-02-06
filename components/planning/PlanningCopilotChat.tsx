"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/planning/types";

type Props = {
  plan: Plan;
  onApplyPlan: (next: Plan) => void;
};

type Role = "assistant" | "user";
type Msg = { id: string; role: Role; text: string };

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseMoney(input: string): number | null {
  const s = (input || "")
    .trim()
    .replaceAll(" ", "")
    .replaceAll("€", "")
    .replaceAll("$", "")
    .replaceAll(".", "")
    .replaceAll(",", ".");
  const m = s.match(/([0-9]+(\.[0-9]+)?)/);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  if (val > 1_000_000_000) return null;
  return Math.round(val);
}

function parseYears(input: string): number | null {
  const s = (input || "").trim().toLowerCase();
  const m = s.match(/([0-9]+(\.[0-9]+)?)/);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  if (val > 100) return null;
  return val;
}

function fmtEUR(n: number) {
  try {
    return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n) + "€";
  } catch {
    return `${Math.round(n)}€`;
  }
}

function computePreview(goal: number, months: number, posture: Plan["riskPosture"]) {
  const years = Math.max(1 / 12, months / 12);
  const ambition = clamp((goal / 50000) * (5 / years), 0.6, 3.0);

  if (ambition > 2.0 && (posture === "conservative" || posture === "balanced")) {
    return {
      title: "Ambition vs posture",
      detail:
        "Your goal is ambitious for this timeframe. Consider extending the timeframe OR accepting slightly more risk.",
      urgency: "Pro-active",
    };
  }

  if (ambition < 0.9) {
    return {
      title: "Solid pace",
      detail:
        "This looks realistic. Your edge comes from consistency + guardrails, not constant trading.",
      urgency: "Watch",
    };
  }

  return {
    title: "Good foundation",
    detail:
      "You have a workable setup. Next: Daily will guide you and keep you aligned with your plan.",
    urgency: "Pro-active",
  };
}

async function persistUserSettingsFireAndForget(patch: Record<string, any>) {
  try {
    const res = await fetch("/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    // If user is not logged in, ignore silently (freemium flow must continue)
    if (res.status === 401) return;

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("user-settings POST failed", res.status, txt);
      return;
    }
  } catch (e) {
    console.error("user-settings POST error", e);
  }
}

export default function PlanningCopilotChat({ plan, onApplyPlan }: Props) {
  const router = useRouter();

  const [pro, setPro] = useState(false);

  type Step = "goal" | "timeframe" | "done";
  const [step, setStep] = useState<Step>("goal");

  const [goalAmount, setGoalAmount] = useState<number | null>(null);
  const [timeframeYears, setTimeframeYears] = useState<number | null>(null);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const MAX_MESSAGES = 28;

  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      text: "Let’s build your plan in 60 seconds.\n\n1) What is your goal amount? Example: 50,000€",
    },
  ]);

  function pushMessage(m: Msg) {
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > MAX_MESSAGES) return next.slice(next.length - MAX_MESSAGES);
      return next;
    });
  }

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busy, step]);

  const resolvedGoal = useMemo(() => {
    if (goalAmount != null) return goalAmount;
    if (typeof plan?.targetValue === "number" && plan.targetValue > 0) return plan.targetValue;
    return 50000;
  }, [goalAmount, plan?.targetValue]);

  const resolvedMonths = useMemo(() => {
    if (timeframeYears != null) return clamp(Math.round(timeframeYears * 12), 3, 600);
    return null;
  }, [timeframeYears]);

  const posture = useMemo<Plan["riskPosture"]>(() => plan?.riskPosture ?? "balanced", [plan?.riskPosture]);

  const preview = useMemo(() => {
    if (!resolvedGoal || !resolvedMonths) return null;
    return computePreview(resolvedGoal, resolvedMonths, posture);
  }, [resolvedGoal, resolvedMonths, posture]);

  function restart() {
    setBusy(false);
    setInput("");
    setGoalAmount(null);
    setTimeframeYears(null);
    setStep("goal");
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text: "Let’s build your plan in 60 seconds.\n\n1) What is your goal amount? Example: 50,000€",
      },
    ]);
  }

  async function applyPlan(goal: number, years: number) {
    const months = clamp(Math.round(years * 12), 3, 600);

    // Simple heuristic for posture (later replace with engine)
    const ambition = (goal / 50000) * (60 / months);
    let inferred: Plan["riskPosture"] = "balanced";
    if (ambition > 1.8) inferred = "growth";
    if (ambition < 0.85) inferred = "conservative";

    const nextPlan: Plan = {
      ...plan,
      updatedAt: Date.now(),
      goalType: plan.goalType ?? "target_value",
      targetValue: goal,
      riskPosture: inferred,
    };

    onApplyPlan(nextPlan);

    // Fire-and-forget persistence (NEVER blocks UI)
    persistUserSettingsFireAndForget({
      goal_amount: goal,
      goal_currency: "EUR",
      goal_timeframe_months: months,
      risk_profile: inferred,
      language: "en",
    });
  }

  async function onSend() {
    if (busy) return;

    const txt = input.trim();
    if (!txt) return;

    pushMessage({ id: uid(), role: "user", text: txt });
    setInput("");

    if (step === "goal") {
      const val = parseMoney(txt);
      if (!val) {
        pushMessage({
          id: uid(),
          role: "assistant",
          text: "I didn’t catch a valid number. Try: 50000",
        });
        return;
      }

      setGoalAmount(val);
      pushMessage({
        id: uid(),
        role: "assistant",
        text: `Perfect — goal amount: ${fmtEUR(val)}.\n\n2) By when do you want to reach it? Example: 5 years`,
      });
      setStep("timeframe");
      return;
    }

    if (step === "timeframe") {
      const years = parseYears(txt);
      if (!years) {
        pushMessage({
          id: uid(),
          role: "assistant",
          text: "Please enter a number of years. Example: 5",
        });
        return;
      }

      setTimeframeYears(years);

      setBusy(true);
      pushMessage({
        id: uid(),
        role: "assistant",
        text: "Applying your plan now…",
      });

      try {
        await applyPlan(resolvedGoal, years);
        pushMessage({
          id: uid(),
          role: "assistant",
          text: "✅ Plan built. Next: open Daily to get today’s best action.",
        });
      } catch (e) {
        console.error("applyPlan error", e);
        pushMessage({
          id: uid(),
          role: "assistant",
          text: "✅ Plan built. Next: open Daily to get today’s best action.",
        });
      } finally {
        // Always finish flow
        setStep("done");
        setBusy(false);
      }
      return;
    }
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">Build your plan</div>
          <div className="mt-1 text-xs text-ink-600">Beginner mode = simple. Pro = optional.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={restart}
            className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
            type="button"
          >
            Restart
          </button>

          <button
            onClick={() => setPro((s) => !s)}
            className={
              "rounded-2xl px-3 py-2 text-xs font-semibold " +
              (pro
                ? "bg-brand text-white hover:opacity-95"
                : "border border-border-soft bg-white text-ink-700 hover:opacity-95")
            }
            type="button"
          >
            {pro ? "Switch to Beginner" : "Open Pro"}
          </button>
        </div>
      </div>

      {/* ALWAYS-VISIBLE CTA (so you never get stuck) */}
      <div className="mt-4">
        <button
          onClick={() => router.push("/app/app/daily")}
          className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
          type="button"
        >
          Go to Daily (today’s action)
        </button>
        <div className="mt-2 text-[11px] text-ink-500">
          You can go to Daily anytime — setup will continue there if needed.
        </div>
      </div>

      {/* Body grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Chat panel */}
        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-border-soft bg-white">
            <div className="border-b border-border-soft px-4 py-3">
              <div className="text-xs font-semibold text-ink-700">Copilot — Plan Builder</div>
              <div className="mt-1 text-[11px] text-ink-500">
                Answer 2 questions. SignalCore builds your plan and guides you daily.
              </div>
            </div>

            <div ref={scrollerRef} className="max-h-[320px] overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed " +
                      (m.role === "user"
                        ? "ml-auto w-fit max-w-[85%] bg-brand text-white"
                        : "w-fit max-w-[85%] bg-neutral-50 text-ink-800")
                    }
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {m.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border-soft px-4 py-3">
              {step !== "done" ? (
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSend();
                    }}
                    disabled={busy}
                    placeholder={step === "goal" ? "Type goal amount (e.g., 50000)" : "Type years (e.g., 5)"}
                    className="w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={onSend}
                    disabled={busy || !input.trim()}
                    className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    type="button"
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div className="text-sm text-ink-700">
                  ✅ Setup complete. You can adjust this later in Planning.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Plan status</div>

            {step === "done" ? (
              <div className="mt-2">
                <div className="text-sm font-semibold text-ink-900">Plan active ✅</div>
                <div className="mt-1 text-xs text-ink-600">
                  Daily + Advisor + Alerts now work off your plan.
                </div>

                <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-ink-700">What happens next</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-600">
                    <li>Daily computes your next best action.</li>
                    <li>Advisor explains what to do (goal-aware).</li>
                    <li>Alerts warn you before drift gets expensive.</li>
                  </ul>
                </div>

                {preview && (
                  <div className="mt-3 rounded-2xl border border-border-soft bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-ink-700">Today’s preview</div>
                      <span className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-600">
                        {preview.urgency}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-ink-900">{preview.title}</div>
                    <div className="mt-1 text-xs text-ink-600">{preview.detail}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-xs text-ink-600">
                Answer the 2 questions to build your plan.
              </div>
            )}
          </div>

          {pro && (
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <div className="text-xs font-semibold text-ink-700">Pro controls</div>
              <div className="mt-1 text-xs text-ink-600">
                For deeper institutional controls (optional).
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-600">
                <li>Guardrails enforcement</li>
                <li>Drift monitoring + alerts</li>
                <li>Stress tests + risk drivers</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}