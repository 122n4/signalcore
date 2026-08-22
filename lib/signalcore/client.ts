// lib/signalcore/client.ts
"use client";

export * from "./useDailyBundle";
export * from "./usePaid";

export type { AutopilotMode } from "./modes";
export { AUTOPILOT_MODES, asMode, modeLabel, normalizeMode, normMode } from "./modes";

export type * from "./types";
