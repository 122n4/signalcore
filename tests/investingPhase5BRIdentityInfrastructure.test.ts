import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => "clerk-user-a"),
}));

import { ClerkInvestingAuthenticatedSessionAdapterV1 } from
  "@/lib/investing/identity/infrastructure/clerkSession.server";
import { InvestingIdentityScopeResolverV1 } from
  "@/lib/investing/identity/resolver.server";

describe("FASE 5B-R identity infrastructure", () => {
  it("derives the authenticated user from the injected server reader", async () => {
    const session = new ClerkInvestingAuthenticatedSessionAdapterV1(
      async () => "clerk-user-a",
      () => "request-a",
    );
    await expect(session.resolve()).resolves.toEqual({
      authenticatedUserId: "clerk-user-a",
      requestId: "request-a",
    });
  });

  it("fails closed without a Clerk session", async () => {
    const session = new ClerkInvestingAuthenticatedSessionAdapterV1(
      async () => null,
    );
    await expect(session.resolve()).resolves.toBeNull();
  });

  it("fails closed for an empty Clerk user id", async () => {
    const session = new ClerkInvestingAuthenticatedSessionAdapterV1(
      async () => "",
    );
    await expect(session.resolve()).resolves.toBeNull();
  });

  it("resolves one persisted personal scope without changing resolver 5B", async () => {
    const resolver = new InvestingIdentityScopeResolverV1(
      {
        resolve: async () => ({
          authenticatedUserId: "owner-a",
          requestId: "request-a",
        }),
      },
      {
        findMemberships: async () => [{
          membershipId: "00000000-0000-4000-8000-000000000001",
          authenticatedUserId: "owner-a",
          ownerId: "owner-a",
          tenantId: "00000000-0000-4000-8000-000000000002",
          role: "owner",
          permissions: [
            "investing:read",
            "investing:create",
            "investing:verify",
            "investing:replay",
          ],
          status: "active",
        }],
        findPortfolios: async () => [{
          portfolioId: "portfolio-a",
          accountId: "00000000-0000-4000-8000-000000000003",
          ownerId: "owner-a",
          tenantId: "00000000-0000-4000-8000-000000000002",
          status: "active",
          investingEnabled: true,
        }],
      },
    );
    await expect(resolver.resolve("get_run")).resolves.toMatchObject({
      authenticatedUserId: "owner-a",
      ownerId: "owner-a",
      portfolioId: "portfolio-a",
      role: "owner",
    });
  });
});
