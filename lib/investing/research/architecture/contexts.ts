import { MASTER_ARCHITECTURE_VERSION } from "./versions";

export type ArchitectureStatus = "implemented" | "contracted" | "planned" | "forbidden";
export type ArchitecturePlane =
  | "neutral_contract" | "control_plane" | "scientific_core" | "data_plane"
  | "execution_plane" | "persistence_plan" | "promotion_plane" | "observability";

export type ArchitectureComponent = Readonly<{
  id: string;
  contractVersion: typeof MASTER_ARCHITECTURE_VERSION;
  context: string;
  responsibility: string;
  trustZone: string;
  plane: ArchitecturePlane;
  dependencies: readonly string[];
  writesAllowed: readonly string[];
  writesForbidden: readonly string[];
  consumes: readonly string[];
  produces: readonly string[];
  runtimeOwner: string;
  status: ArchitectureStatus;
}>;

const NEVER_FINANCIAL = ["orders", "positions", "fills", "accounting", "brokers", "trading"] as const;

export const ARCHITECTURE_COMPONENTS: readonly ArchitectureComponent[] = [
  { id: "product-control-plane", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "product", responsibility: "Authenticate, resolve scope, authorize requests and present state without deciding science.", trustZone: "next-server", plane: "control_plane", dependencies: ["scientific-contracts", "promotion-boundary"], writesAllowed: ["user-intents"], writesForbidden: [...NEVER_FINANCIAL, "scientific-decisions"], consumes: ["authenticated-session", "feature-flags"], produces: ["authorized-research-request"], runtimeOwner: "syntrake-app", status: "planned" },
  { id: "scientific-contracts", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "scientific-contract-layer", responsibility: "Own immutable scientific language, states, evidence, reports, decisions and eligibility.", trustZone: "neutral", plane: "neutral_contract", dependencies: [], writesAllowed: [], writesForbidden: [...NEVER_FINANCIAL, "infrastructure-state"], consumes: ["validated-values"], produces: ["scientific-contracts"], runtimeOwner: "none", status: "implemented" },
  { id: "reproducibility", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "reproducibility-layer", responsibility: "Own scientific/execution identities, manifests and artifact references.", trustZone: "neutral", plane: "scientific_core", dependencies: ["scientific-contracts"], writesAllowed: [], writesForbidden: [...NEVER_FINANCIAL], consumes: ["experiment-material"], produces: ["identities", "manifests"], runtimeOwner: "none", status: "implemented" },
  { id: "dataset-catalog", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "dataset-catalog", responsibility: "Own dataset versions, lineage, quality and research-ready qualification.", trustZone: "research-data", plane: "persistence_plan", dependencies: ["scientific-contracts"], writesAllowed: ["dataset-metadata", "dataset-versions", "quality-state"], writesForbidden: [...NEVER_FINANCIAL, "scientific-decisions"], consumes: ["qualified-dataset-publication"], produces: ["research-ready-manifest"], runtimeOwner: "investing-data-agent", status: "planned" },
  { id: "data-acquisition-agent", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "data-acquisition", responsibility: "Selectively acquire on demand, normalize, validate quality and publish dataset versions.", trustZone: "provider-secrets", plane: "data_plane", dependencies: ["dataset-catalog"], writesAllowed: ["raw-acquisition", "normalized-data", "quality-evidence"], writesForbidden: [...NEVER_FINANCIAL, "experiments", "promotion", "scientific-decisions"], consumes: ["acquisition-request", "provider-response"], produces: ["qualified-dataset-publication"], runtimeOwner: "investing-data-agent", status: "planned" },
  { id: "research-runtime", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "research-runtime", responsibility: "Orchestrate experiments using only research-ready datasets and emit scientific evidence.", trustZone: "research-runtime", plane: "execution_plane", dependencies: ["scientific-contracts", "reproducibility", "dataset-catalog", "scientific-memory"], writesAllowed: ["runs", "artifacts", "validation-reports", "scientific-decisions"], writesForbidden: [...NEVER_FINANCIAL, "dataset-raw", "promotion-submission"], consumes: ["research-ready-manifest", "experiment-definition"], produces: ["result-envelope", "validation-report", "scientific-decision"], runtimeOwner: "investing-research-runtime", status: "planned" },
  { id: "scientific-memory", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "scientific-memory", responsibility: "Retain positive and negative knowledge without mutating finalized results.", trustZone: "research-runtime", plane: "persistence_plan", dependencies: ["scientific-contracts", "reproducibility"], writesAllowed: ["scientific-memory"], writesForbidden: [...NEVER_FINANCIAL, "finalized-result-mutation"], consumes: ["finalized-results", "rejections"], produces: ["prior-evidence", "saturation-state"], runtimeOwner: "investing-research-runtime", status: "planned" },
  { id: "promotion-boundary", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "promotion-boundary", responsibility: "Fail-closed preparation and future submission of verified eligible material; the sole Research-to-Engine boundary.", trustZone: "authenticated-application-boundary", plane: "promotion_plane", dependencies: ["scientific-contracts", "reproducibility", "dataset-catalog", "investing-engine"], writesAllowed: ["promotion-request-future"], writesForbidden: [...NEVER_FINANCIAL, "scientific-decisions"], consumes: ["promotion-candidate-envelope"], produces: ["promotion-prepared"], runtimeOwner: "future-phase-6M", status: "contracted" },
  { id: "investing-engine", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "investing-engine", responsibility: "Own canonical Investing runs, orders, positions, accounting, replay, verifier and integrity.", trustZone: "investing-server", plane: "execution_plane", dependencies: [], writesAllowed: ["investing-engine-state"], writesForbidden: ["research-state", "trading"], consumes: ["future-authorized-promotion-request"], produces: ["canonical-investing-result"], runtimeOwner: "investing-application", status: "implemented" },
  { id: "ops-observability", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "ops", responsibility: "Read operational health and integrity without deciding science or promotion.", trustZone: "ops-reader", plane: "observability", dependencies: ["dataset-catalog", "research-runtime", "promotion-boundary"], writesAllowed: ["operational-telemetry"], writesForbidden: [...NEVER_FINANCIAL, "scientific-decisions", "promotion"], consumes: ["health-signals", "read-models"], produces: ["ops-views"], runtimeOwner: "future-phase-6N", status: "planned" },
  { id: "trading-external-forbidden", contractVersion: MASTER_ARCHITECTURE_VERSION, context: "external-isolated-system", responsibility: "Declare Trading as an external context that Research and Investing must never import, call, share state with, or promote through.", trustZone: "outside-investing-research", plane: "execution_plane", dependencies: [], writesAllowed: [], writesForbidden: ["all-research-and-investing-state"], consumes: [], produces: [], runtimeOwner: "none", status: "forbidden" },
];
