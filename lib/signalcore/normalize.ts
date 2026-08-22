// lib/signalcore/normalize.ts
export type AutopilotMode = "Trading";

export function normMode(x: any): AutopilotMode {
  const s = String(x ?? "").trim();
  void s;
  return "Trading";
}
