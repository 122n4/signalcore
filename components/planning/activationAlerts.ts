import { alertsStore } from "@/lib/alerts/clientStore";

export async function createPlanningActivationAlerts() {
  // drift
  await alertsStore.create({
    type: "planning",
    title: "Plan monitoring enabled",
    message: "SignalCore will watch your plan drift and warn you before it becomes expensive.",
    severity: "success",
    dedupe_key: "planning_activation_drift_v1",
    action: { label: "Open Risk", href: "/risk-test" },
  });

  // guardrails
  await alertsStore.create({
    type: "planning",
    title: "Guardrails enabled",
    message: "SignalCore will warn you if concentration, drawdown or FX exposure breaches your limits.",
    severity: "info",
    dedupe_key: "planning_activation_guardrails_v1",
    action: { label: "Open Advisor", href: "/advisor-test" },
  });

  // weekly
  await alertsStore.create({
    type: "advisor",
    title: "Weekly briefing enabled",
    message: "Every week you’ll get a short plan health summary + next best action.",
    severity: "info",
    dedupe_key: "planning_activation_weekly_v1",
    action: { label: "Open Daily", href: "/app/daily" },
  });
}