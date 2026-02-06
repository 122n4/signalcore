// lib/copilot/runCopilot.ts
import type { CopilotResponse } from "./types";
import { buildCopilotContext } from "./context";
import { reasonCopilot } from "./reasoner";

export function runCopilot(input: Parameters<typeof buildCopilotContext>[0]): CopilotResponse {
  const ctx = buildCopilotContext(input);
  return reasonCopilot(ctx);
}