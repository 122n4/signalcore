// lib/copilot/daily.ts

export type DailyLang = "en" | "pt";

export type DailyCopilotState = {
  step:
    | "ASK_GOAL_AMOUNT"
    | "ASK_TIMEFRAME"
    | "ASK_RISK"
    | "ASK_CONTRIBUTION"
    | "DONE";
  goal_amount?: number | null;
  goal_timeframe_months?: number | null;
  goal_currency?: string | null;
  risk_profile?: "Conservative" | "Balanced" | "Aggressive" | null;
  monthly_contribution?: number | null;
};

export type DailyCopilotMessage = {
  role: "assistant" | "user";
  content: string;
};

function detectLang(raw?: string): DailyLang {
  const v = String(raw ?? "").toLowerCase();
  if (v.startsWith("pt")) return "pt";
  return "en";
}

function t(lang: DailyLang, en: string, pt: string) {
  return lang === "pt" ? pt : en;
}

function parseMoney(input: string) {
  // Accept: 50000, 50k, 50.000, 50,000, 50 000, 50k€
  const s = input
    .toLowerCase()
    .replace(/[€$£]/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");

  if (!s) return null;

  if (s.endsWith("k")) {
    const n = Number(s.slice(0, -1));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000);
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;

  return Math.round(n);
}

function parseTimeframeMonths(input: string) {
  // Accept: "5 years", "5y", "60 months", "60m", "2 anos", "18 meses"
  const s = input.toLowerCase().trim();

  // months direct
  const m = s.match(/(\d+)\s*(m|mo|month|months|mes|meses)\b/);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  // years
  const y = s.match(/(\d+)\s*(y|yr|year|years|ano|anos)\b/);
  if (y) {
    const n = Number(y[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n * 12;
  }

  // raw number (assume years if <= 50, months if > 50)
  const raw = s.replace(/[^\d]/g, "");
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  if (n > 50) return n; // months
  return n * 12; // years
}

function parseRisk(input: string) {
  const s = input.toLowerCase();

  if (s.includes("steady") || s.includes("safe") || s.includes("conservative") || s.includes("seguro") || s.includes("conservador"))
    return "Conservative" as const;

  if (s.includes("aggressive") || s.includes("risk") || s.includes("max") || s.includes("agressivo"))
    return "Aggressive" as const;

  if (s.includes("balanced") || s.includes("normal") || s.includes("moderate") || s.includes("equilibr"))
    return "Balanced" as const;

  // numbers 1-10
  const n = Number((s.match(/\b(\d{1,2})\b/) ?? [])[1]);
  if (Number.isFinite(n)) {
    if (n <= 3) return "Conservative" as const;
    if (n >= 8) return "Aggressive" as const;
    return "Balanced" as const;
  }

  return null;
}

function needsContribution(goalAmount: number, months: number) {
  // heuristic:
  // if goal is very large for the horizon, ask about monthly contribution
  // Example: 50k in 12 months => yes
  const perMonth = goalAmount / Math.max(1, months);
  return perMonth > 2500; // aggressive
}

export function nextDailyQuestion(state: DailyCopilotState, lang: DailyLang) {
  if (state.step === "ASK_GOAL_AMOUNT") {
    return t(
      lang,
      "What is your goal amount? Example: 50,000€",
      "Qual é o teu objetivo em dinheiro? Ex: 50.000€"
    );
  }

  if (state.step === "ASK_TIMEFRAME") {
    return t(
      lang,
      "By when do you want to reach it? Example: 5 years",
      "Em quanto tempo queres atingir isso? Ex: 5 anos"
    );
  }

  if (state.step === "ASK_RISK") {
    return t(
      lang,
      "Quick risk preference: steady growth or aggressive growth?",
      "Preferes crescimento estável ou agressivo?"
    );
  }

  if (state.step === "ASK_CONTRIBUTION") {
    return t(
      lang,
      "Do you plan to add money monthly? If yes, roughly how much per month?",
      "Planeias adicionar dinheiro mensalmente? Se sim, quanto mais ou menos por mês?"
    );
  }

  return t(lang, "Done.", "Feito.");
}

export function initDailyStateFromSettings(settings: any): DailyCopilotState {
  const goal_amount = typeof settings?.goal_amount === "number" ? settings.goal_amount : null;
  const goal_timeframe_months =
    typeof settings?.goal_timeframe_months === "number" ? settings.goal_timeframe_months : null;

  const goal_currency = typeof settings?.goal_currency === "string" ? settings.goal_currency : "EUR";

  // Determine initial step
  let step: DailyCopilotState["step"] = "ASK_GOAL_AMOUNT";
  if (goal_amount && !goal_timeframe_months) step = "ASK_TIMEFRAME";
  if (!goal_amount) step = "ASK_GOAL_AMOUNT";
  if (goal_amount && goal_timeframe_months) step = "DONE";

  return {
    step,
    goal_amount,
    goal_timeframe_months,
    goal_currency,
    risk_profile: null,
    monthly_contribution: null,
  };
}

export function applyUserMessage(
  state: DailyCopilotState,
  userMessage: string,
  lang: DailyLang
): { state: DailyCopilotState; assistant: string; patches: any } {
  const msg = String(userMessage ?? "").trim();
  const patches: any = {};

  if (state.step === "ASK_GOAL_AMOUNT") {
    const amount = parseMoney(msg);
    if (!amount) {
      return {
        state,
        assistant: t(
          lang,
          "I didn’t catch the amount. Try something like: 50,000€ or 50k.",
          "Não percebi o valor. Tenta: 50.000€ ou 50k."
        ),
        patches,
      };
    }

    const next: DailyCopilotState = {
      ...state,
      goal_amount: amount,
      step: "ASK_TIMEFRAME",
    };

    patches.goal_amount = amount;
    patches.goal_currency = state.goal_currency ?? "EUR";

    return {
      state: next,
      assistant: nextDailyQuestion(next, lang),
      patches,
    };
  }

  if (state.step === "ASK_TIMEFRAME") {
    const months = parseTimeframeMonths(msg);
    if (!months) {
      return {
        state,
        assistant: t(
          lang,
          "I didn’t catch the timeframe. Try: 5 years or 60 months.",
          "Não percebi o tempo. Tenta: 5 anos ou 60 meses."
        ),
        patches,
      };
    }

    const nextBase: DailyCopilotState = {
      ...state,
      goal_timeframe_months: months,
      step: "DONE",
    };

    patches.goal_timeframe_months = months;

    // smart conditional steps
    if (state.goal_amount && needsContribution(state.goal_amount, months)) {
      nextBase.step = "ASK_CONTRIBUTION";
      return {
        state: nextBase,
        assistant: nextDailyQuestion(nextBase, lang),
        patches,
      };
    }

    // ask risk if not set
    nextBase.step = "ASK_RISK";
    return {
      state: nextBase,
      assistant: nextDailyQuestion(nextBase, lang),
      patches,
    };
  }

  if (state.step === "ASK_RISK") {
    const risk = parseRisk(msg);
    if (!risk) {
      return {
        state,
        assistant: t(
          lang,
          "Just say: steady or aggressive (or balanced).",
          "Basta dizer: estável ou agressivo (ou equilibrado)."
        ),
        patches,
      };
    }

    const next: DailyCopilotState = {
      ...state,
      risk_profile: risk,
      step: "DONE",
    };

    patches.risk_profile = risk;

    return {
      state: next,
      assistant: t(
        lang,
        "Perfect. Your plan is now goal-aware. Come back here daily and I’ll guide the next best action.",
        "Perfeito. O teu plano agora já tem objetivo. Volta aqui todos os dias e eu guio-te na próxima melhor ação."
      ),
      patches,
    };
  }

  if (state.step === "ASK_CONTRIBUTION") {
    const amount = parseMoney(msg);
    const next: DailyCopilotState = {
      ...state,
      monthly_contribution: amount ?? null,
      step: "ASK_RISK",
    };

    patches.monthly_contribution = amount ?? null;

    return {
      state: next,
      assistant: nextDailyQuestion(next, lang),
      patches,
    };
  }

  return {
    state,
    assistant: t(lang, "Done.", "Feito."),
    patches,
  };
}

export function detectDailyLangFromSettings(settings: any): DailyLang {
  // If you later store settings.language, it will use it.
  return detectLang(settings?.language ?? settings?.lang ?? "en");
}