type EnginePhaseSummary = {
  phase: string;
  state: string;
  quality: string;
  inputHash?: string | null;
  outputHash?: string | null;
  warnings?: readonly string[];
  blockers?: readonly string[];
  reasonCodes?: readonly string[];
};

export type InvestingEngineV1CustomerBridgeResult = {
  contractVersion: "investing-engine-v1-customer-bridge/v1";
  status: "connected" | "unavailable";
  finalPhase3FConnected: boolean;
  executable: false;
  source: "phase3c_d_e_f_shadow" | "not_available";
  state: "ready" | "blocked" | "degraded" | "unavailable";
  quality: "real" | "estimated" | "stale" | "unavailable";
  confidence: string | null;
  finalResultHash: string | null;
  finalDecisionHash: string | null;
  auditBundleHash: string | null;
  shadowPackageHash: string | null;
  phaseSummaries: readonly EnginePhaseSummary[];
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  errorCode: string | null;
};

const QUARANTINED = "phase3f_customer_bridge_quarantined";

function unavailable(code = QUARANTINED): InvestingEngineV1CustomerBridgeResult {
  return {
    contractVersion: "investing-engine-v1-customer-bridge/v1",
    status: "unavailable",
    finalPhase3FConnected: false,
    executable: false,
    source: "not_available",
    state: "unavailable",
    quality: "unavailable",
    confidence: null,
    finalResultHash: null,
    finalDecisionHash: null,
    auditBundleHash: null,
    shadowPackageHash: null,
    phaseSummaries: [],
    blockers: [code],
    warnings: [],
    reasonCodes: [],
    errorCode: code,
  };
}

export function buildInvestingEngineV1CustomerBridge(_args?: unknown): InvestingEngineV1CustomerBridgeResult {
  void _args;
  return unavailable();
}
