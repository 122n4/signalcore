import {
  INVESTING_PAPER_CALLER_ERROR_VERSION,
  type InvestingPaperCallerFailureCodeV1,
  type InvestingPaperCallerFailureV1,
} from "@/lib/investing/paper-caller/contracts";

export function paperCallerFailure(
  code: InvestingPaperCallerFailureCodeV1,
  correlationId: string | null = null,
): InvestingPaperCallerFailureV1 {
  return {
    contractVersion: INVESTING_PAPER_CALLER_ERROR_VERSION,
    ok: false,
    correlationId,
    error: { code, reasonCode: code },
  };
}
