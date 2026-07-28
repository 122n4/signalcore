export const RESEARCH_DATA_STRATEGY = {
  mode: "selective_on_demand",
  fullUniverseMirror: false,
  providerNeutral: true,
  immutableScientificVersions: true,
  requestSeparation: ["research_request", "dataset_requirement", "acquisition_request"],
  lifecycle: ["not_acquired", "provider_unavailable", "acquisition_failed", "invalid", "incomplete", "valid_not_research_ready", "research_ready"],
} as const;

export const FUTURE_TOPOLOGY = [
  { process: "syntrake-control-plane", owns: ["authentication", "authorization", "requests", "read-state"], channels: ["authenticated-commands", "read-models"], secrets: [], failureIsolation: "never executes heavy science" },
  { process: "investing-research-runtime", owns: ["experiments", "future-backtests", "future-validation", "artifacts"], channels: ["research-jobs", "dataset-manifests"], secrets: [], failureIsolation: "no providers, brokers or Trading" },
  { process: "investing-data-agent", owns: ["on-demand-acquisition", "normalization", "quality", "dataset-publication"], channels: ["acquisition-requests", "dataset-publications"], secrets: ["provider-credentials"], failureIsolation: "no experiments, promotion or engine" },
] as const;
