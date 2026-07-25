import type {
  CreateCanonicalInvestingRunResponseV1,
  InvestingApplicationFailureV1,
} from "@/lib/investing/application";
import type { InvestingIdentityFailureV1 } from "@/lib/investing/identity";

export const INVESTING_PAPER_CALLER_REQUEST_VERSION =
  "investing-paper-caller-request/v1" as const;
export const INVESTING_PAPER_CALLER_ERROR_VERSION =
  "investing-paper-caller-error/v1" as const;

export type InvestingPaperCallerRequestV1 = Readonly<{
  mode: "paper";
  sourceReference: string;
  idempotencyKey: string;
}>;

export type InvestingPaperCallerFailureCodeV1 =
  | "invalid_request"
  | "paper_mode_required";

export type InvestingPaperCallerFailureV1 = Readonly<{
  contractVersion: typeof INVESTING_PAPER_CALLER_ERROR_VERSION;
  ok: false;
  correlationId: string | null;
  error: Readonly<{
    code: InvestingPaperCallerFailureCodeV1;
    reasonCode: InvestingPaperCallerFailureCodeV1;
  }>;
}>;

export type InvestingPaperCallerSuccessV1 = Readonly<{
  ok: true;
  value: CreateCanonicalInvestingRunResponseV1;
}>;

export type InvestingPaperCallerResultV1 =
  | InvestingPaperCallerSuccessV1
  | InvestingPaperCallerFailureV1
  | InvestingIdentityFailureV1
  | InvestingApplicationFailureV1;
