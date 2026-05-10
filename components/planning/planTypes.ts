import type React from "react";

export type PlanTone = "neutral" | "good" | "warn" | "bad" | "blue";
export type PlanActionVariant = "primary" | "secondary" | "ghost";
export type PlanFieldKind = "text" | "select" | "readonly";

export type PlanAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: PlanActionVariant;
};

export type PlanMetric = {
  label: string;
  value: string;
  note?: string;
  tone?: PlanTone;
};

export type PlanFieldOption = {
  value: string;
  label: string;
  description?: string;
};

export type PlanField = {
  id: string;
  label: string;
  kind: PlanFieldKind;
  value: string;
  onChange?: (value: string) => void;
  options?: PlanFieldOption[];
  helper?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
  status?: string;
  cta?: PlanAction;
};

export type PlanPresetOption = {
  value: string;
  label: string;
  active: boolean;
  onClick?: () => void;
};

export type PlanAllocationRow = {
  assetClass: string;
  targetLabel: string;
  currentLabel: string;
  driftLabel: string;
  targetPct: number | null;
  currentPct: number | null;
  driftPct: number | null;
  tone?: PlanTone;
};

export type PlanGuardrailRow = {
  label: string;
  limitLabel: string;
  currentLabel: string;
  statusLabel: string;
  tone?: PlanTone;
};

export type PlanLogicRow = {
  label: string;
  value: string;
  tone?: PlanTone;
};

export type PlanForecastRow = {
  label: string;
  valueLabel: string;
  annualReturnLabel: string;
  etaLabel: string;
  barPct: number;
  tone?: PlanTone;
  current?: boolean;
};

export type PlanStatusItem = {
  label: string;
  value: string;
  tone?: PlanTone;
};

export type PlanCallout = {
  title: string;
  detail: string;
  tone?: PlanTone;
  bullets?: string[];
  actions?: PlanAction[];
};

export type PlanHeroModel = {
  eyebrow: string;
  title: string;
  summary: string;
  statusLabel: string;
  statusTone?: PlanTone;
  badges: string[];
  metrics: PlanMetric[];
  primaryAction: PlanAction;
  secondaryAction?: PlanAction | null;
};

export type PlanInputsModel = {
  title: string;
  subtitle: string;
  fields: PlanField[];
  note?: string;
  primaryAction: PlanAction;
  secondaryAction?: PlanAction | null;
  tertiaryAction?: PlanAction | null;
};

export type PlanGoalModel = {
  title: string;
  subtitle: string;
  presets: PlanPresetOption[];
  goalText: string;
  onGoalTextChange: (value: string) => void;
  helper: string;
  primaryAction?: PlanAction | null;
  secondaryAction?: PlanAction | null;
};

export type PlanStrategyModel = {
  title: string;
  subtitle: string;
  headline: string;
  summary: string;
  chips: string[];
  bullets: string[];
  primaryAction?: PlanAction | null;
  secondaryAction?: PlanAction | null;
};

export type PlanAllocationModel = {
  title: string;
  subtitle: string;
  rows: PlanAllocationRow[];
  summary: string;
  primaryAction?: PlanAction | null;
};

export type PlanGuardrailsModel = {
  title: string;
  subtitle: string;
  rows: PlanGuardrailRow[];
  note?: string;
};

export type PlanLogicModel = {
  title: string;
  subtitle: string;
  rows: PlanLogicRow[];
};

export type PlanForecastModel = {
  title: string;
  subtitle: string;
  rows: PlanForecastRow[];
  summary: string;
  primaryAction?: PlanAction | null;
};

export type PlanStatusModel = {
  title: string;
  subtitle: string;
  items: PlanStatusItem[];
  callout: PlanCallout;
};

export type PlanningDashboardViewModel = {
  setupMode: boolean;
  activeMode: boolean;
  hero: PlanHeroModel;
  inputs: PlanInputsModel;
  goal: PlanGoalModel;
  strategy: PlanStrategyModel;
  allocation: PlanAllocationModel;
  guardrails: PlanGuardrailsModel;
  logic: PlanLogicModel;
  forecast: PlanForecastModel;
  status: PlanStatusModel;
};
