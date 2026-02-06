// lib/alerts/engine.ts
import { Alert, AlertRule, AlertsSnapshot } from "@/lib/alerts/types";
import { Candidate } from "@/lib/core/types";

function nowId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function sevRank(s: Alert["severity"]) {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function mkCandidate(label: string, rationale: string, action: Candidate["action"], impact?: Candidate["impact"]): Candidate {
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

export function generateAlerts(snapshot: AlertsSnapshot, rules: AlertRule[]): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  const drift = snapshot.drift ?? 0.12;
  const vol = snapshot.risk?.vol ?? 0.14;
  const dd = snapshot.risk?.maxDD ?? 0.28;
  const top5 = snapshot.concentrationTop5 ?? 0.36;
  const fx = snapshot.fxExposure ?? 0.52;

  const guard = snapshot.guardrails ?? [];
  const breaches = guard.filter(g => g.status === "breach");
  const nears = guard.filter(g => g.status === "near");

  const r = (id: string) => rules.find(x => x.id === id);

  // Drift high
  if (r("r_drift")?.enabled) {
    const th = Number(r("r_drift")?.params?.threshold ?? 0.18);
    if (drift >= th) {
      alerts.push({
        id: "a_drift_high",
        createdAt: now,
        updatedAt: now,
        type: "drift_high",
        severity: drift > th * 1.35 ? "high" : "medium",
        status: "open",
        title: "Drift is high",
        message: "Your portfolio is deviating from the plan. Rebalance to restore alignment.",
        why: `Drift proxy is ${(drift * 100).toFixed(1)}% vs threshold ${(th * 100).toFixed(1)}%.`,
        metrics: { drift },
        suggestedCandidates: [
          mkCandidate("Rebalance towards plan weights", "Reduce drift by aligning exposures back to plan buckets.", "Rebalance", { driftDown: "High", riskDown: "Low" }),
        ],
        source: "engine",
      });
    }
  }

  // Guardrail breach
  if (r("r_guard_breach")?.enabled && breaches.length) {
    alerts.push({
      id: "a_guardrail_breach",
      createdAt: now,
      updatedAt: now,
      type: "guardrail_breach",
      severity: "critical",
      status: "open",
      title: "Guardrail breached",
      message: "One or more policy limits are breached. Bring risk back into band before return-seeking.",
      why: breaches.map(b => `${b.label}`).join(" · "),
      metrics: { breaches: breaches.length },
      suggestedCandidates: [
        mkCandidate("Reduce high-beta exposure", "Prioritize bringing breached guardrails back into band.", "Reduce", { riskDown: "High", driftDown: "Medium" }),
      ],
      source: "engine",
    });
  }

  // Guardrail near
  if (r("r_guard_near")?.enabled && nears.length && !breaches.length) {
    alerts.push({
      id: "a_guardrail_near",
      createdAt: now,
      updatedAt: now,
      type: "guardrail_near",
      severity: "medium",
      status: "open",
      title: "Near guardrail limits",
      message: "You are close to one or more policy limits. Consider small trims to avoid breaches.",
      why: nears.map(n => `${n.label}`).join(" · "),
      metrics: { nears: nears.length },
      suggestedCandidates: [
        mkCandidate("Trim top concentration slightly", "Small trims reduce tail risk and avoid policy breach.", "Reduce", { riskDown: "Medium", driftDown: "Low" }),
      ],
      source: "engine",
    });
  }

  // Risk spike
  if (r("r_risk_spike")?.enabled) {
    const volTh = Number(r("r_risk_spike")?.params?.volThreshold ?? 0.16);
    const ddTh = Number(r("r_risk_spike")?.params?.ddThreshold ?? 0.26);

    if (vol >= volTh || dd >= ddTh) {
      const severity: Alert["severity"] =
        dd >= ddTh * 1.12 ? "high" : vol >= volTh * 1.12 ? "high" : "medium";

      alerts.push({
        id: "a_risk_spike",
        createdAt: now,
        updatedAt: now,
        type: "risk_spike",
        severity,
        status: "open",
        title: "Risk increased",
        message: "Risk is above your comfort band. Reduce drawdown drivers before adding return risk.",
        why: `Vol ${(vol * 100).toFixed(1)}% vs ${(volTh * 100).toFixed(1)}% · DD ${(dd * 100).toFixed(1)}% vs ${(ddTh * 100).toFixed(1)}%.`,
        metrics: { vol, dd },
        suggestedCandidates: [
          mkCandidate("Reduce drawdown drivers", "Cut high-risk tilts and restore risk budget.", "Reduce", { riskDown: "High" }),
          mkCandidate("Increase defensive allocation", "Rotate a slice into lower vol exposure.", "Rebalance", { riskDown: "Medium" }),
        ],
        source: "engine",
      });
    }
  }

  // Concentration spike
  if (r("r_conc")?.enabled) {
    const th = Number(r("r_conc")?.params?.top5Threshold ?? 0.40);
    if (top5 >= th) {
      alerts.push({
        id: "a_concentration_spike",
        createdAt: now,
        updatedAt: now,
        type: "concentration_spike",
        severity: top5 > th * 1.15 ? "high" : "medium",
        status: "open",
        title: "Concentration is high",
        message: "Top holdings dominate risk. Trim concentration to reduce idiosyncratic drawdowns.",
        why: `Top-5 concentration ${(top5 * 100).toFixed(1)}% vs threshold ${(th * 100).toFixed(1)}%.`,
        metrics: { concentrationTop5: top5 },
        suggestedCandidates: [
          mkCandidate("Trim top positions", "Reduce idiosyncratic tail risk by trimming top holdings.", "Reduce", { riskDown: "Medium" }),
        ],
        source: "engine",
      });
    }
  }

  // FX spike
  if (r("r_fx")?.enabled) {
    const th = Number(r("r_fx")?.params?.fxThreshold ?? 0.60);
    if (fx >= th) {
      alerts.push({
        id: "a_fx_spike",
        createdAt: now,
        updatedAt: now,
        type: "fx_spike",
        severity: fx > th * 1.12 ? "high" : "medium",
        status: "open",
        title: "FX exposure is high",
        message: "Currency exposure may dominate variance. Consider hedging or reducing unintended FX.",
        why: `FX exposure ${(fx * 100).toFixed(1)}% vs threshold ${(th * 100).toFixed(1)}%.`,
        metrics: { fxExposure: fx },
        suggestedCandidates: [
          mkCandidate("Reduce FX exposure", "Hedge or reduce currency exposure not aligned with the plan.", "Hedge", { riskDown: "Low–Medium" }),
        ],
        source: "engine",
      });
    }
  }

  // Plan inactive
  if (r("r_plan")?.enabled) {
    if (snapshot.planActive === false) {
      alerts.push({
        id: "a_plan_inactive",
        createdAt: now,
        updatedAt: now,
        type: "plan_inactive",
        severity: "high",
        status: "open",
        title: "No active plan",
        message: "Activate a plan to enable guardrails, drift, and goal-aware execution.",
        why: "Planning state indicates no active plan.",
        source: "engine",
      });
    }
  }

  // Execution queue stale (proxy: if queue has items and nothing happens)
  if (r("r_queue_stale")?.enabled) {
    const minCount = Number(r("r_queue_stale")?.params?.minCount ?? 3);
    if ((snapshot.executionQueueCount ?? 0) >= minCount) {
      alerts.push({
        id: "a_queue_stale",
        createdAt: now,
        updatedAt: now,
        type: "execution_queue_stale",
        severity: "medium",
        status: "open",
        title: "Execution inbox needs attention",
        message: "You have pending candidates waiting. Build a batch and simulate to proceed.",
        why: `Execution queue has ${snapshot.executionQueueCount} candidates.`,
        source: "engine",
      });
    }
  }

  // Opportunity (disabled by default)
  if (r("r_oppty")?.enabled) {
    alerts.push({
      id: "a_opportunity",
      createdAt: now,
      updatedAt: now,
      type: "opportunity",
      severity: "low",
      status: "open",
      title: "Opportunity check",
      message: "Consider return-seeking actions if guardrails are within band.",
      why: "Rule enabled: opportunities are informational.",
      source: "engine",
    });
  }

  // sort for stability
  return alerts.sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
}