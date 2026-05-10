import { alertsStore } from "@/lib/alerts/clientStore";

export async function createPlanningActivationAlerts() {
  await alertsStore.create({
    type: "planning",
    title: "Plan monitoring enabled",
    message: "Syntrake will watch your plan drift and warn you before it becomes expensive.",
    severity: "success",
    dedupe_key: "planning_activation_drift_v1",
    action: { label: "Open Risk", href: "/risk-test" },
  });

  await alertsStore.create({
    type: "planning",
    title: "Guardrails enabled",
    message: "Syntrake will warn you if concentration, drawdown or FX exposure breaches your limits.",
    severity: "info",
    dedupe_key: "planning_activation_guardrails_v1",
    action: { label: "Open Advisor", href: "/advisor-test" },
  });

  await alertsStore.create({
    type: "advisor",
    title: "Weekly briefing enabled",
    message: "Every week you'll get a short plan health summary + next best action.",
    severity: "info",
    dedupe_key: "planning_activation_weekly_v1",
    action: { label: "Open Daily", href: "/app?tab=daily" },
  });
}

