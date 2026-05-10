// lib/signalcore/mode.ts
// Compatibility wrapper used across the app to normalize the single supported mode.

export * from "./modes";

export type AutopilotMode = "investing";

const ALLOWED: AutopilotMode[] = ["investing"];

export function asMode(input: unknown, fallback: AutopilotMode = "investing"): AutopilotMode {
  const raw = String(input ?? "").trim().toLowerCase();
  if (raw === "investing") return "investing";
  return fallback;
}

export const normalizeMode = asMode;

export function modeLabel(mode: AutopilotMode) {
  void mode;
  return "Investing";
}

export function isMode(x: any): x is AutopilotMode {
  return ALLOWED.includes(String(x ?? "").toLowerCase() as AutopilotMode);
}
