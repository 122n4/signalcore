export type AutopilotMode = "investing" | "trading";

export const AUTOPILOT_MODES: AutopilotMode[] = ["investing", "trading"];

export function normalizeMode(x: any): AutopilotMode {
  const m = String(x || "investing").toLowerCase().trim();
  if ((AUTOPILOT_MODES as string[]).includes(m)) return m as AutopilotMode;
  return "investing";
}

// Alias para compatibilidade com imports antigos
export const asMode = normalizeMode;

export function modeLabel(m: AutopilotMode) {
  return m === "trading" ? "Trading" : "Investing";
}

// Back-compat alias (some routes import normMode)
export const normMode = normalizeMode;
