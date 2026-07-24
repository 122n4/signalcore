import {
  INVESTING_APPLICATION_ERROR_VERSION,
  type InvestingApplicationErrorCodeV1,
  type InvestingApplicationFailureV1,
} from "@/lib/investing/application/contracts";

export class InvestingApplicationErrorV1 extends Error {
  readonly code: InvestingApplicationErrorCodeV1;

  constructor(code: InvestingApplicationErrorCodeV1, cause?: unknown) {
    super(code, { cause });
    this.name = "InvestingApplicationErrorV1";
    this.code = code;
  }
}

export function applicationError(
  code: InvestingApplicationErrorCodeV1,
  cause?: unknown,
): never {
  throw new InvestingApplicationErrorV1(code, cause);
}

export function applicationFailure(
  code: InvestingApplicationErrorCodeV1,
  correlationId: string | null,
): InvestingApplicationFailureV1 {
  return {
    contractVersion: INVESTING_APPLICATION_ERROR_VERSION,
    ok: false,
    correlationId,
    error: { code, reasonCode: code },
  };
}

