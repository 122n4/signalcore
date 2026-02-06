// app/api/copilot/daily/route.ts
import { NextResponse } from "next/server";

import {
  applyUserMessage,
  detectDailyLangFromSettings,
  initDailyStateFromSettings,
  nextDailyQuestion,
  type DailyCopilotMessage,
  type DailyCopilotState,
} from "@/lib/copilot/daily";

export async function POST(req: Request) {
  const body = await req.json();

  const settings = body?.settings ?? {};
  const stateIn: DailyCopilotState =
    body?.state ?? initDailyStateFromSettings(settings);

  const messages: DailyCopilotMessage[] = Array.isArray(body?.messages)
    ? body.messages
    : [];

  const userText = String(body?.userText ?? "").trim();
  const lang = detectDailyLangFromSettings(settings);

  // If no user text, return the next question
  if (!userText) {
    const q = nextDailyQuestion(stateIn, lang);
    return NextResponse.json({
      ok: true,
      lang,
      state: stateIn,
      assistant: q,
      patches: {},
    });
  }

  const out = applyUserMessage(stateIn, userText, lang);

  return NextResponse.json({
    ok: true,
    lang,
    state: out.state,
    assistant: out.assistant,
    patches: out.patches,
  });
}