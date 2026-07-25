import {
  INVESTING_OPS_ERROR_VERSION,
  type InvestingOpsFailureV1,
  type InvestingOpsReasonCodeV1,
} from "@/lib/investing/ops/contracts";

export function opsFailure(
  code: InvestingOpsReasonCodeV1,
  correlationId: string | null,
): InvestingOpsFailureV1 {
  return {
    contractVersion: INVESTING_OPS_ERROR_VERSION,
    ok: false,
    correlationId,
    error: { code, reasonCode: code },
  };
}
