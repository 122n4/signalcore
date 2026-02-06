// lib/advisor/types.ts
import { Candidate } from "@/lib/core/types";

export type AdvisorPressureLevel = "low" | "medium" | "high" | "critical";

export type AdvisorSignal = {
  id: string;
  ts: number;
  type: "insight" | "warning" | "opportunity" | "candidate_pack";
  title: string;
  message: string;
  why?: string;
  pressure?: AdvisorPressureLevel;
  candidates?: Candidate[];
};

export type AdvisorState = {
  lastUpdatedAt: number;
  pressure: AdvisorPressureLevel;
  pressureScore: number; // 0..100
  topDrivers: string[];
  nextBestAction?: {
    title: string;
    message: string;
    candidates: Candidate[];
  };
  coherence?: {
    score: number; // 0..100
    notes: string[];
    fixes: string[];
  };
  feed: AdvisorSignal[];
};