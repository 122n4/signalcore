// lib/advisor/engine.ts
import { AdvisorState, AdvisorPressureLevel, AdvisorSignal } from "@/lib/advisor/types";
import { AlertsSnapshot } from "@/lib/alerts/types";
import { Candidate } from "@/lib/core/types";

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function pressureFromScore(score: number): AdvisorPressureLevel {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function mkCandidate(
  label: string,
  rationale: string,
  action: Candidate["action"],
  impact?: Candidate["impact"]
): Candidate {
  return {
    id: `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
    action,
    label,
    rationale,
    confidence: "medium",
    impact: impact ?? {},
    guardrailsCheck: { pass: true },
  };
}

function postureBias(posture?: AlertsSnapshot["planRiskPosture"]) {
  // conservative => more sensitive; return_seeking => less sensitive
  if (posture === "conservative") return +10;
  if (posture === "return_seeking") return -6;
  return 0;
}

export function buildAdvisorState(snapshot: AlertsSnapshot): AdvisorState {
  const drift = snapshot.drift ?? 0.12;
  const vol = snapshot.risk?.vol ?? 0.14;
  const dd = snapshot.risk?.maxDD ?? 0.28;
  const top5 = snapshot.concentrationTop5 ?? 0.36;
  const fx = snapshot.fxExposure ?? 0.52;

  const planOn = !!snapshot.planActive;
  const planName = snapshot.planName ?? "";
  const posture = snapshot.planRiskPosture ?? "balanced";
  const execStyle = snapshot.planExecutionStyle ?? "steady";
  const planG = snapshot.planGuardrails ?? {};

  const guard = snapshot.guardrails ?? [];
  const breaches = guard.filter((g: any) => g.status === "breach").length;
  const nears = guard.filter((g: any) => g.status === "near").length;

  // Pressure score (proxy) + bias from posture
  let score = 0;
  score += clamp((drift - 0.10) * 220, 0, 25);
  score += clamp((dd - 0.22) * 180, 0, 25);
  score += clamp((top5 - 0.32) * 180, 0, 18);
  score += clamp((fx - 0.50) * 140, 0, 12);
  score += breaches * 18;
  score += nears * 6;

  score += postureBias(posture);

  // If plan has stricter guardrails, increase sensitivity
  if (planOn) {
    const maxTop5 = planG.maxTop5ConcentrationPct != null ? planG.maxTop5ConcentrationPct / 100 : undefined;
    if (maxTop5 != null && top5 > maxTop5) score += 10;

    const maxFx = planG.maxFxExposurePct != null ? planG.maxFxExposurePct / 100 : undefined;
    if (maxFx != null && fx > maxFx) score += 8;

    const maxDD = planG.maxDrawdownPct != null ? planG.maxDrawdownPct / 100 : undefined;
    if (maxDD != null && dd > maxDD) score += 12;
  }

  score = clamp(score, 0, 100);
  const pressure = pressureFromScore(score);

  const drivers: string[] = [];
  if (planOn) drivers.push(`Plan: ${planName || "Active"} (${posture}/${execStyle})`);
  if (breaches) drivers.push("Guardrail breach");
  if (drift > 0.18) drivers.push("High drift");
  if (dd > 0.26) drivers.push("Drawdown risk");
  if (top5 > 0.40) drivers.push("Concentration");
  if (fx > 0.60) drivers.push("FX exposure");
  if (!drivers.length) drivers.push("Within band");

  // Next Best Action tuned by posture + plan guardrails
  let nbaTitle = "Stay the course";
  let nbaMessage = "You are within band. Consider small optimizations only.";
  let nbaCandidates: Candidate[] = [
    mkCandidate(
      "Small rebalance",
      "Keep drift tight and stay aligned with the plan blueprint.",
      "Rebalance",
      { driftDown: "Low" }
    ),
  ];

  const wantsDefense = posture === "conservative" || execStyle === "defensive";
  const wantsReturn = posture === "return_seeking" || execStyle === "opportunistic";

  if (breaches) {
    nbaTitle = "Bring the plan back into band";
    nbaMessage = "Plan guardrails are breached. Fix constraints first, then optimize return.";
    nbaCandidates = [
      mkCandidate(
        "Reduce breach drivers",
        "Reduce exposures directly causing the breach (concentration/FX/tail risk).",
        "Reduce",
        { riskDown: "High", driftDown: "Medium" }
      ),
      mkCandidate(
        "Rebalance to blueprint",
        "Rotate towards Core/Hedge according to the active plan.",
        "Rebalance",
        { driftDown: "High", riskDown: "Medium" }
      ),
    ];
  } else if (pressure === "high" || pressure === "critical") {
    nbaTitle = wantsReturn ? "Stabilize risk, then resume return-seeking" : "Reduce risk pressure";
    nbaMessage = wantsReturn
      ? "You can pursue return, but first lower drawdown/concentration to stay within plan guardrails."
      : "Your risk is elevated. Reduce drawdown and concentration, then re-evaluate.";
    nbaCandidates = [
      mkCandidate(
        "Trim concentration",
        "Reduce top holdings to lower idiosyncratic risk and stay within plan concentration limits.",
        "Reduce",
        { riskDown: "Medium" }
      ),
      mkCandidate(
        "Reduce/hedge FX",
        "Hedge or reduce unintended currency exposure if above plan cap.",
        "Hedge",
        { riskDown: "Low–Medium" }
      ),
    ];
  } else if (pressure === "medium") {
    nbaTitle = wantsDefense ? "Stabilize and rebalance" : "Rebalance and prepare opportunity";
    nbaMessage = wantsDefense
      ? "Slightly above band. Reduce drift and keep volatility controlled."
      : "Slightly above band. Rebalance now so you have room to deploy opportunistically.";
    nbaCandidates = [
      mkCandidate(
        "Rebalance to plan weights",
        "Reduce drift and improve plan alignment.",
        "Rebalance",
        { driftDown: "High", riskDown: "Low" }
      ),
    ];
  } else if (wantsReturn) {
    nbaTitle = "Deploy within the plan";
    nbaMessage = "You’re in-band. You can pursue return-seeking moves within the plan policy and guardrails.";
    nbaCandidates = [
      mkCandidate(
        "Add return-seeking sleeve",
        "Allocate inside the Satellite bucket within min/max band.",
        "Increase",
        { returnUp: "Medium", driftDown: "Low" }
      ),
    ];
  }

  const coherenceScore =
    pressure === "critical" ? 55 : pressure === "high" ? 65 : pressure === "medium" ? 78 : 88;

  const coherenceNotes: string[] = [];
  if (planOn) coherenceNotes.push("Advisor is operating under the active plan contract.");
  if (drift > 0.18) coherenceNotes.push("Portfolio drift is materially above the plan.");
  if (breaches) coherenceNotes.push("One or more guardrails are breached.");
  if (top5 > 0.40) coherenceNotes.push("Concentration risk is above tolerance.");
  if (fx > 0.60) coherenceNotes.push("FX exposure may dominate variance.");
  if (coherenceNotes.length === 0) coherenceNotes.push("Plan coherence looks good.");

  const coherenceFixes: string[] = [];
  if (drift > 0.18) coherenceFixes.push("Rebalance to blueprint weights.");
  if (top5 > 0.40) coherenceFixes.push("Trim top holdings and diversify.");
  if (fx > 0.60) coherenceFixes.push("Reduce/hedge FX exposure.");
  if (breaches) coherenceFixes.push("Bring guardrails back into band first.");

  const playbooks = snapshot.planAppliedPlaybooks ?? [];
  const feed: AdvisorSignal[] = [
    {
      id: "s_pressure",
      ts: Date.now(),
      type: pressure === "low" ? "insight" : "warning",
      title: "Decision pressure (plan-aware)",
      message: `Pressure is ${pressure.toUpperCase()} (${score.toFixed(0)}/100). ${planOn ? "Plan active." : "No active plan."}`,
      why: `Drift ${(drift * 100).toFixed(1)}% · Vol ${(vol * 100).toFixed(1)}% · DD ${(dd * 100).toFixed(1)}% · Top5 ${(top5 * 100).toFixed(1)}% · FX ${(fx * 100).toFixed(1)}% · Breaches ${breaches}`,
      pressure,
    },
    ...(playbooks.length
      ? [{
          id: "s_playbooks",
          ts: Date.now(),
          type: "insight" as const,
          title: "Playbooks applied",
          message: playbooks.slice(0, 3).join(" · "),
          pressure,
        }]
      : []),
    {
      id: "s_nba",
      ts: Date.now(),
      type: "candidate_pack",
      title: "Next best action (plan-aware)",
      message: `${nbaTitle}: ${nbaMessage}`,
      candidates: nbaCandidates,
      pressure,
    },
  ];

  return {
    lastUpdatedAt: Date.now(),
    pressure,
    pressureScore: score,
    topDrivers: drivers.slice(0, 4),
    nextBestAction: {
      title: nbaTitle,
      message: nbaMessage,
      candidates: nbaCandidates,
    },
    coherence: {
      score: coherenceScore,
      notes: coherenceNotes,
      fixes: coherenceFixes.slice(0, 3),
    },
    feed,
  };
}