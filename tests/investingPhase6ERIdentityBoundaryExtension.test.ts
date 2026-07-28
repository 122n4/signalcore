import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createInvestingIdentityScopeResolverV1,
} from "@/lib/investing/identity/server";
import type {
  InvestingIdentityOperationV1,
  InvestingIdentityPermissionV1,
} from "@/lib/investing/identity/contracts";
import type {
  InvestingAuthorizedPortfolioV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";
import {
  datasetCompositionConsumerPath,
  datasetCompositionIdentityImportsAccepted,
} from "./support/investingIdentityImportPolicy";

const DATASET_OPERATIONS = [
  ["create_dataset_requirement", "investing:create"],
  ["request_dataset_acquisition", "investing:create"],
  ["get_dataset_acquisition", "investing:read"],
  ["cancel_dataset_acquisition", "investing:create"],
  ["transition_dataset_acquisition", "investing:create"],
  ["publish_dataset_version", "investing:create"],
  ["list_datasets", "investing:read"],
  ["get_dataset_version", "investing:read"],
] as const satisfies readonly (readonly [
  InvestingIdentityOperationV1,
  InvestingIdentityPermissionV1,
])[];

const PAPER_AND_OPS_OPERATIONS = [
  ["create_canonical_run", "investing:create"],
  ["get_run", "investing:read"],
  ["get_latest_run", "investing:read"],
  ["verify_run", "investing:verify"],
  ["replay_run", "investing:replay"],
] as const satisfies readonly (readonly [
  InvestingIdentityOperationV1,
  InvestingIdentityPermissionV1,
])[];

const membership: InvestingTenantMembershipV1 = {
  membershipId: "membership-a",
  authenticatedUserId: "user-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  role: "investing-researcher",
  permissions: ["investing:read", "investing:create"],
  status: "active",
};

const portfolio: InvestingAuthorizedPortfolioV1 = {
  portfolioId: "portfolio-a",
  accountId: "account-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  status: "active",
  investingEnabled: true,
};

function harness(
  permissions: readonly InvestingIdentityPermissionV1[] =
    membership.permissions,
) {
  const state: {
    membership: InvestingTenantMembershipV1 | null;
    portfolio: InvestingAuthorizedPortfolioV1 | null;
    authenticatedUserId: string | null;
  } = {
    membership: { ...membership, permissions },
    portfolio: { ...portfolio },
    authenticatedUserId: "user-a",
  };
  const resolver = createInvestingIdentityScopeResolverV1({
    session: {
      resolve: async () => state.authenticatedUserId === null
        ? null
        : {
          authenticatedUserId: state.authenticatedUserId,
          requestId: "request-a",
        },
    },
    directory: {
      findMemberships: async () =>
        state.membership === null ? [] : [state.membership],
      findPortfolios: async () =>
        state.portfolio === null ? [] : [state.portfolio],
    },
  });
  return { resolver, state };
}

describe("FASE 6E-R additive identity boundary", () => {
  it.each(DATASET_OPERATIONS)(
    "authorizes %s with only %s",
    async (operation, permission) => {
      const { resolver } = harness([permission]);
      await expect(resolver.resolve(operation)).resolves.toMatchObject({
        authenticatedUserId: "user-a",
        ownerId: "owner-a",
        tenantId: "tenant-a",
        portfolioId: "portfolio-a",
        accountId: "account-a",
      });
    },
  );

  it.each(DATASET_OPERATIONS)(
    "rejects %s without %s",
    async (operation, permission) => {
      const other = permission === "investing:read"
        ? "investing:create"
        : "investing:read";
      const { resolver } = harness([other]);
      await expect(resolver.resolve(operation)).rejects.toThrow(
        "identity_scope_not_authorized",
      );
    },
  );

  it.each(PAPER_AND_OPS_OPERATIONS)(
    "preserves %s permission mapping",
    async (operation, permission) => {
      const { resolver } = harness([permission]);
      await expect(resolver.resolve(operation)).resolves.toMatchObject({
        tenantId: "tenant-a",
      });
    },
  );

  it("rejects unknown operations at runtime", async () => {
    const { resolver } = harness(["investing:*"]);
    await expect(
      resolver.resolve("dataset_admin" as InvestingIdentityOperationV1),
    ).rejects.toThrow("identity_scope_not_authorized");
  });

  it("does not let dataset read permission grant Paper or OPS capabilities", async () => {
    const { resolver } = harness(["investing:read"]);
    await expect(resolver.resolve("get_dataset_version")).resolves.toBeDefined();
    await expect(resolver.resolve("create_canonical_run")).rejects.toThrow(
      "identity_scope_not_authorized",
    );
    await expect(resolver.resolve("verify_run")).rejects.toThrow(
      "identity_scope_not_authorized",
    );
    await expect(resolver.resolve("replay_run")).rejects.toThrow(
      "identity_scope_not_authorized",
    );
  });

  it.each(["revoked", "inactive"] as const)(
    "rejects a %s membership",
    async (status) => {
      const { resolver, state } = harness();
      state.membership = { ...membership, status };
      await expect(resolver.resolve("list_datasets")).rejects.toThrow(
        "identity_scope_not_authorized",
      );
    },
  );

  it("rejects absent membership and service-role-only context", async () => {
    const absent = harness();
    absent.state.membership = null;
    await expect(absent.resolver.resolve("list_datasets")).rejects.toThrow(
      "identity_scope_not_authorized",
    );

    const serviceRole = harness(["investing:*"]);
    serviceRole.state.authenticatedUserId = "service-role";
    await expect(
      serviceRole.resolver.resolve("publish_dataset_version"),
    ).rejects.toThrow("identity_scope_not_authorized");
  });

  it.each([
    ["tenant", { tenantId: "tenant-b" }],
    ["owner", { ownerId: "owner-b" }],
    ["portfolio status", { status: "inactive" as const }],
    ["account binding", { accountId: "" }],
  ])("rejects incompatible %s scope", async (_label, override) => {
    const { resolver, state } = harness();
    state.portfolio = { ...portfolio, ...override };
    await expect(resolver.resolve("get_dataset_version")).rejects.toThrow(
      "identity_scope_not_authorized",
    );
  });

  it("reconstructs output without trusting a structural authorization object", async () => {
    const fabricated = {
      authenticatedUserId: "attacker",
      tenantId: "tenant-attacker",
      ownerId: "owner-attacker",
      portfolioId: "portfolio-attacker",
      accountId: "account-attacker",
    };
    const { resolver } = harness();
    const forgedCall = resolver.resolve.bind(resolver) as unknown as (
      operation: InvestingIdentityOperationV1,
      input: unknown,
    ) => ReturnType<typeof resolver.resolve>;
    const result = await forgedCall("list_datasets", fabricated);
    expect(result).toMatchObject({
      authenticatedUserId: "user-a",
      tenantId: "tenant-a",
      ownerId: "owner-a",
      portfolioId: "portfolio-a",
      accountId: "account-a",
    });
  });

  it("exports only the public factory and reserves one exact 6E consumer", () => {
    const root = process.cwd();
    const server = readFileSync(
      path.join(root, "lib/investing/identity/server.ts"),
      "utf8",
    );
    const isolation = readFileSync(
      path.join(root, "tests/investingPhase5BIsolation.test.ts"),
      "utf8",
    );
    expect(server).toContain("createInvestingIdentityScopeResolverV1");
    expect(server).not.toContain("resolver.server");
    expect(isolation).toContain("datasetCompositionConsumerPath");
    expect(isolation).toContain("datasetCompositionIdentityImportsAccepted");
    expect(isolation).not.toMatch(
      /path\.resolve\(root,\s*"lib",\s*"investing",\s*"research"\s*\)/u,
    );
  });

  it.each([
    [
      "DATASET_COMPOSITION_PUBLIC_ENTRYPOINT_ACCEPTED",
      'import { createInvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/server";',
      true,
    ],
    [
      "DATASET_COMPOSITION_PRIVATE_RESOLVER_ACCEPTED",
      'import { InvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/resolver.server";',
      false,
    ],
    [
      "DATASET_COMPOSITION_PRIVATE_FACTORY_ACCEPTED",
      'import { createInvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/factory.server";',
      false,
    ],
    [
      "DATASET_COMPOSITION_PRIVATE_INFRASTRUCTURE_ACCEPTED",
      'import { createProductionInvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/infrastructure/server";',
      false,
    ],
    [
      "DATASET_COMPOSITION_PRIVATE_PORTS_ACCEPTED",
      'export type { InvestingIdentityScopeResolverPortV1 } from "@/lib/investing/identity/ports";',
      false,
    ],
    [
      "DATASET_COMPOSITION_PRIVATE_GATEWAY_ACCEPTED",
      'const gateway = require("@/lib/investing/identity/gateway.server");',
      false,
    ],
    [
      "DATASET_COMPOSITION_IDENTITY_SUBPATH_ACCEPTED",
      'const identity = await import("@/lib/investing/identity/server/index");',
      false,
    ],
  ])("%s", (_name, source, expected) => {
    const root = process.cwd();
    expect(datasetCompositionIdentityImportsAccepted({
      root,
      consumerPath: datasetCompositionConsumerPath(root),
      source,
    })).toBe(expected);
  });

  it.each([
    'import identity from "@/lib/investing/identity/server.ts";',
    'import identity from "../../identity/server";',
    'export * from "@/lib/investing/identity/contracts";',
    'import identity = require("@/lib/investing/identity/factory.server");',
    'const target = "@/lib/investing/identity/server"; import(target);',
    `import privateResolver from "${
      pathToFileURL(path.resolve(
        process.cwd(),
        "lib/investing/identity/resolver.server.ts",
      )).href
    }";`,
    `import privateResolver from "@/lib/investing/identity\\resolver.server";`,
  ])("rejects non-canonical identity import: %s", (source) => {
    const root = process.cwd();
    expect(datasetCompositionIdentityImportsAccepted({
      root,
      consumerPath: datasetCompositionConsumerPath(root),
      source,
    })).toBe(false);
  });

  it("OTHER_DATASET_FILE_IDENTITY_IMPORT_ACCEPTED=false", () => {
    const root = process.cwd();
    expect(datasetCompositionIdentityImportsAccepted({
      root,
      consumerPath: path.resolve(
        root,
        "lib/investing/research/dataset-catalog/other.server.ts",
      ),
      source:
        'import { createInvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/server";',
    })).toBe(false);
  });
});
