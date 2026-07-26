import "server-only";

import { randomUUID } from "node:crypto";

import { getRequestUserId } from "@/lib/auth/requestUser";
import type {
  InvestingAuthenticatedSessionPortV1,
  InvestingAuthenticatedSessionV1,
} from "@/lib/investing/identity/ports";

export type InvestingRequestUserReaderV1 =
  () => Promise<string | null>;

export class ClerkInvestingAuthenticatedSessionAdapterV1
implements InvestingAuthenticatedSessionPortV1 {
  constructor(
    private readonly readUser: InvestingRequestUserReaderV1 =
      () => getRequestUserId(),
    private readonly createRequestId: () => string = randomUUID,
  ) {}

  async resolve(): Promise<InvestingAuthenticatedSessionV1 | null> {
    const authenticatedUserId = await this.readUser();
    if (!authenticatedUserId) return null;
    return {
      authenticatedUserId,
      requestId: this.createRequestId(),
    };
  }
}
