// lib/signalcore/engine/scoring.ts
import type { ScoreMove } from "./types";
import { clamp } from "./utils";

export function computeAutopilotScore(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  streak: number;
  diagnosticsCount: number;
  blockingCount: number;
  opportunitiesCount: number;
}) {
  const moves: ScoreMove[] = [];

  let s = 52;

  if (args.hasPlan) {
    s += 22;
    moves.push({ label: "Plan active", delta: +22 });
  } else {
    s -= 30;
    moves.push({ label: "No plan", delta: -30 });
  }

  if (args.hasHoldings) {
    s += 16;
    moves.push({ label: "Holdings tracked", delta: +16 });
  } else if (args.hasPlan) {
    s -= 14;
    moves.push({ label: "No holdings", delta: -14 });
  }

  if (args.doneToday) {
    s += 6;
    moves.push({ label: "Daily discipline", delta: +6 });
  }

  if (args.streak >= 3) {
    s += 2;
    moves.push({ label: "Streak momentum", delta: +2 });
  }
  if (args.streak >= 7) {
    s += 2;
    moves.push({ label: "Consistency", delta: +2 });
  }

  if (args.blockingCount > 0) {
    s -= 10;
    moves.push({ label: "Blocking risk leaks", delta: -10 });
  } else if (args.diagnosticsCount === 0 && args.hasPlan && args.hasHoldings) {
    s += 4;
    moves.push({ label: "Coherence", delta: +4 });
  }

  if (args.opportunitiesCount === 0 && args.hasPlan && args.hasHoldings) {
    s += 4;
    moves.push({ label: "Quiet day", delta: +4 });
  }

  s = clamp(s, 5, 99);

  return { score: s, moves };
}