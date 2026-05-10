// lib/signalcore/modes.ts
export type AutopilotMode = "Investing";

export function normMode(x: any): AutopilotMode {
  const s = String(x ?? "").trim();
  void s;
  return "Investing";
}
