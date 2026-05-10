// lib/signalcore/engine/proof.ts
import type { ProofLine } from "./types";

export function buildProof(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  diagnosticsCount: number;
  blockingCount: number;
  candidatesCount: number;
  streak: number;
}) : ProofLine[] {
  const out: ProofLine[] = [];

  // 1) setup proof
  if (args.hasPlan) out.push({ label: "Plan constraints loaded", tone: "good" });
  else out.push({ label: "Plan missing (Safety Brain limited)", tone: "warn" });

  if (args.hasHoldings) out.push({ label: "Holdings scanned for risk leaks", tone: "good" });
  else out.push({ label: "No holdings yet (monitoring pending)", tone: "warn" });

  // 2) scanning proof
  if (args.blockingCount > 0) out.push({ label: `${args.blockingCount} blocking risk leaks detected`, tone: "danger" });
  else if (args.diagnosticsCount > 0) out.push({ label: `${args.diagnosticsCount} minor flags detected`, tone: "neutral" });
  else if (args.hasPlan && args.hasHoldings) out.push({ label: "No leaks detected (quiet day)", tone: "good" });

  // 3) candidates proof
  if (args.hasPlan && args.hasHoldings) {
    if (args.candidatesCount > 0) out.push({ label: `${args.candidatesCount} candidates ranked`, tone: "neutral" });
    else out.push({ label: "No candidates today (stability)", tone: "good" });
  }

  // 4) discipline proof
  if (args.doneToday) out.push({ label: "Daily already closed", tone: "good" });
  else if (args.streak > 0) out.push({ label: `Streak active (${args.streak}d)`, tone: "good" });

  return out.slice(0, 4);
}