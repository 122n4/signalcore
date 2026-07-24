import type { InvestingIdentityFailureV1 } from "@/lib/investing/identity/contracts";

export class InvestingIdentityResolutionErrorV1 extends Error {
  constructor(cause?: unknown) {
    super("identity_scope_not_authorized", { cause });
    this.name = "InvestingIdentityResolutionErrorV1";
  }
}

export function identityResolutionError(cause?: unknown): never {
  throw new InvestingIdentityResolutionErrorV1(cause);
}

export function identityFailure(): InvestingIdentityFailureV1 {
  return {
    ok: false,
    correlationId: null,
    error: {
      code: "identity_scope_not_authorized",
      reasonCode: "identity_scope_not_authorized",
    },
  };
}
