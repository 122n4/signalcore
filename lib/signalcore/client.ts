// lib/signalcore/client.ts
"use client";

export * from "./useAutopilotMode";
export * from "./useDailyBundle";
export * from "./usePortfolioItems";
export * from "./usePaid";

export type { AutopilotMode } from "./modes";
export { MODES, MODE_TAGLINE, normMode, asMode } from "./modes";

export type * from "./types";