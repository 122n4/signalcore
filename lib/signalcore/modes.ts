export type AutopilotMode = "trading";

export const AUTOPILOT_MODES: AutopilotMode[] = ["trading"];

export function normalizeMode(x: any): AutopilotMode {
  const m = String(x || "trading").toLowerCase().trim();
  if ((AUTOPILOT_MODES as string[]).includes(m)) return m as AutopilotMode;
  return "trading";
}

// Alias para compatibilidade com imports antigos
export const asMode = normalizeMode;

export function modeLabel(m: AutopilotMode) {
  void m;
  return "Trading";
}

// Back-compat alias (some routes import normMode)
export const normMode = normalizeMode;
