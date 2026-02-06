// lib/copilot/index.ts

export { runCopilot } from "./copilotCore";

// Re-export dos tipos oficiais do SignalCore (single source of truth)
export type {
  MarketRegime,
  Horizon,
  RiskProfile,
  PortfolioItem,
  Goal,
  EngineV2Output,
  CoherenceDriver,
} from "@/lib/signalcore";