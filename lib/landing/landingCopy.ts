export type LandingDecisionPreview = {
  decision: "BUY" | "REDUCE" | "HOLD" | "WAIT" | "CLOSE";
  autopilotConfidencePct: number;
  edgeVsBaselinePct: number;
  reason: string;
  nextEvaluationLabel: string;
  stateLabel?: string;
};

export const LANDING_COPY = {
  nav: {
    productName: "Syntrake",
    productTagline: "Daily decision governance for capital",
    signIn: "Sign in",
    pricing: "Pricing",
    trust: "Trust",
  },
  hero: {
    title: "Stop guessing what to do with your portfolio.",
    line1:
      "Syntrake analyzes your portfolio, detects risk leaks, and gives you one clear next action - every day.",
    line2: "",
    primaryCta: "Run your 2-minute portfolio check",
    secondaryLink: "See how Syntrake decides",
    compliance:
      "Educational decision support only. Not investment advice. Outputs are probabilistic estimates, never guaranteed outcomes.",
  },
  preview: {
    sectionEyebrow: "Live Decision Preview",
    cardTitle: "TODAY'S SYNTRAKE DECISION",
    autopilotConfidenceLabel: "Autopilot confidence",
    edgeLabel: "Edge vs baseline",
    reasonLabel: "Reason",
    nextEvaluationLabel: "Next evaluation",
    traceButton: "See how Syntrake decided this",
    traceTitle: "Decision trace (what the system checked)",
    traceItems: [
      "Market regime + volatility",
      "Opportunity ranking (risk-adjusted scoring)",
      "Portfolio exposure and concentration",
      "Risk policy + ActionGate (can block execution)",
      "Daily cycle: one decision -> execution -> close day",
    ],
    disclaimer: "Estimates and probabilities are not guarantees. Syntrake is a decision framework.",
    edgeCompliance: "Probability edge is an estimate relative to baseline, not a return forecast.",
  },
  problem: {
    title: "The Problem",
    lead:
      "Most people do not lose because they lack information - they lose because they do not have a repeatable decision loop.",
    blocks: [
      {
        title: "Information overload -> paralysis",
        body: "Too many inputs, no clear priority. You end up watching instead of acting.",
      },
      {
        title: "Emotional execution -> bad timing",
        body: "Fear and FOMO change position size and timing exactly when discipline matters most.",
      },
      {
        title: "No decision discipline -> inconsistency",
        body: "Without a daily loop, good days and bad days cancel out and confidence drops.",
      },
    ],
  },
  approach: {
    title: "The Syntrake Approach",
    subtitle: "Decision governance system for your capital.",
    steps: [
      "Read market environment",
      "Rank opportunities with probabilistic scoring",
      "Apply risk governance -> produce one daily command",
    ],
  },
  ritual: {
    title: "What You Get Daily",
    subtitle: "Daily Ritual",
    steps: [
      "Open Syntrake",
      "Read Today's Command",
      "Execute (if needed)",
      "Close the day",
    ],
    line: "5 minutes a day. The rest is discipline.",
    compliance: "Execution steps appear only when governance allows execution.",
  },
  trust: {
    title: "Trust and Transparency",
    bullets: [
      "Decisions are explainable (trace + reason codes).",
      "Governance can block unsafe actions.",
      "When data quality is weak, Syntrake degrades safely (WAIT/HOLD).",
    ],
    line: "No promises. Just a system that makes decisions harder to mess up.",
  },
  finalCta: {
    title: "Make your next decision the disciplined one.",
    button: "Start with Syntrake",
    note: "Discipline compounds over time. Outcomes remain uncertain.",
  },
  footer: {
    disclaimer: "Not investment advice. Past performance is not indicative of future results.",
  },
} as const;

export const LANDING_DEMO_DECISION: LandingDecisionPreview = {
  decision: "HOLD",
  autopilotConfidencePct: 63,
  edgeVsBaselinePct: 4.2,
  reason: "Volatility regime elevated. Syntrake prioritizes capital protection.",
  nextEvaluationLabel: "in 4h 22m",
  stateLabel: "PROTECTION MODE",
};
