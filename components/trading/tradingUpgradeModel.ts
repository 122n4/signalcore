export type TradingUpgradeSurface = "execution" | "risk" | "journal" | "alerts";

export type TradingUpgradeModel = {
  surface: TradingUpgradeSurface;
  eyebrow: string;
  title: string;
  body: string;
  pricingHref: string;
  primaryCta: string;
  compareCta: string;
  freeTitle: string;
  freeBody: string;
  trialTitle: string;
  trialBody: string;
  proTitle: string;
  proBullets: string[];
  modalTitle: string;
  modalSubtitle: string;
};

const MODELS: Record<TradingUpgradeSurface, TradingUpgradeModel> = {
  execution: {
    surface: "execution",
    eyebrow: "Trading Pro",
    title: "Execution is where Syntrake stops being discovery and starts being operational",
    body: "Free trading keeps the desk open so the user can see flow. Pro adds trigger levels, invalidation, trade path, sizing, and the execution pack that actually turns a setup into a disciplined broker action.",
    pricingHref: "/pricing?source=trading_execution_gate",
    primaryCta: "Unlock execution depth",
    compareCta: "Compare Trading Pro",
    freeTitle: "Free now",
    freeBody: "Desk, radar, and opportunity flow stay visible before payment. The user can inspect context without being forced into a blind upgrade.",
    trialTitle: "Unlock with trial",
    trialBody: "Open the full execution cockpit and see how trigger, invalidation, and sizing change the quality of the workflow.",
    proTitle: "What Pro keeps unlocked",
    proBullets: [
      "Execution cockpit with trigger, invalidation, and target framing",
      "Sizing, trade path, and risk-aware broker preparation",
      "Deeper continuity after trial instead of a one-off preview",
      "Full workflow coverage when timing actually matters",
    ],
    modalTitle: "Unlock execution when the setup becomes real",
    modalSubtitle: "Investing stays free forever. Trading discovery stays open. Pro starts where disciplined execution begins.",
  },
  risk: {
    surface: "risk",
    eyebrow: "Trading Pro",
    title: "Risk should feel like a live operating layer, not a hidden spreadsheet",
    body: "Free trading keeps flow open. Pro adds the deeper layer that shows risk posture, pressure, concentration of active ideas, and what should stay blocked before the user escalates size.",
    pricingHref: "/pricing?source=trading_risk_gate",
    primaryCta: "Unlock risk depth",
    compareCta: "Compare Trading Pro",
    freeTitle: "Free now",
    freeBody: "Discovery shows the desk and opportunity flow, but not the deeper operating layer that tells the user how hard to press and what to leave alone.",
    trialTitle: "Unlock with trial",
    trialBody: "Open the full risk view and see how Syntrake frames pressure, caution, and protection around the live watchlist.",
    proTitle: "What Pro keeps unlocked",
    proBullets: [
      "Risk posture across the live watchlist",
      "Pressure mapping, guardrails, and size discipline",
      "Clear separation between allowed, caution, and restricted risk states",
      "Deeper continuity around operator protection",
    ],
    modalTitle: "Unlock the risk operating layer",
    modalSubtitle: "Discovery shows the flow. Pro is where Syntrake makes risk feel operational and explicit.",
  },
  journal: {
    surface: "journal",
    eyebrow: "Trading Pro",
    title: "Journal should feel like memory, not just storage",
    body: "Free trading keeps discovery lightweight. Pro keeps the audit trail, searchability, and deeper continuity that let users understand what changed, when it changed, and how their trading discipline is evolving over time.",
    pricingHref: "/pricing?source=trading_journal_gate",
    primaryCta: "Unlock journal memory",
    compareCta: "Compare Trading Pro",
    freeTitle: "Free now",
    freeBody: "Desk and Opportunities stay open, but the long-form trading memory stays intentionally light in discovery mode.",
    trialTitle: "Unlock with trial",
    trialBody: "Open the journal and see searchable session memory, feed continuity, and deeper trade-state history before paying.",
    proTitle: "What Pro keeps unlocked",
    proBullets: [
      "Searchable trade-state memory and deeper history",
      "Session continuity across setup, execution, and aftermath",
      "Stronger post-trade learning instead of snapshot-only usage",
      "A trading cockpit that compounds context over time",
    ],
    modalTitle: "Unlock trading memory and continuity",
    modalSubtitle: "Syntrake stays useful for free. Pro turns that usefulness into a durable audit trail and real continuity.",
  },
  alerts: {
    surface: "alerts",
    eyebrow: "Trading Pro",
    title: "Alerts should escalate discipline, not just make noise",
    body: "Free trading lets the user inspect the desk. Pro adds active monitoring, alert logic, and discipline escalation so the product keeps working between check-ins instead of depending on constant manual polling.",
    pricingHref: "/pricing?source=trading_alerts_gate",
    primaryCta: "Unlock alerts",
    compareCta: "Compare Trading Pro",
    freeTitle: "Free now",
    freeBody: "Discovery mode is for inspecting flow and opportunity quality. It does not keep the full discipline-alert layer running for the user.",
    trialTitle: "Unlock with trial",
    trialBody: "Open the alert layer and see how Syntrake escalates what matters, blocks what is dangerous, and keeps the rest quiet.",
    proTitle: "What Pro keeps unlocked",
    proBullets: [
      "Discipline alerts tied to live market state changes",
      "Escalation when setups degrade or become dangerous",
      "Clearer operator monitoring between sessions",
      "A more active cockpit instead of manual refresh dependence",
    ],
    modalTitle: "Unlock active monitoring and discipline alerts",
    modalSubtitle: "Discovery lets the user inspect. Pro lets Syntrake keep watching and escalating what matters.",
  },
};

export function buildTradingUpgradeModel(surface: TradingUpgradeSurface): TradingUpgradeModel {
  return MODELS[surface];
}
