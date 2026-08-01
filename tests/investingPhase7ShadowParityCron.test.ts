import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { authorizedShadowParityCron } from "@/lib/investing/shadow-parity/cronAuthorization.server";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Phase 7 trusted shadow parity scheduler", () => {
  it("accepts only an exact sufficiently strong bearer secret", () => {
    const secret = "a".repeat(32);
    expect(authorizedShadowParityCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorizedShadowParityCron(`bearer ${secret}`, secret)).toBe(false);
    expect(authorizedShadowParityCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(authorizedShadowParityCron(null, secret)).toBe(false);
    expect(authorizedShadowParityCron("Bearer short", "short")).toBe(false);
    expect(authorizedShadowParityCron(`Bearer ${secret}`, undefined)).toBe(false);
  });

  it("reconstructs the scheduled operator through the official identity boundary", () => {
    const composition = read("lib/investing/shadow-parity/composition.server.ts");
    expect(composition).toContain("createProductionInvestingIdentityScopeResolverV1");
    expect(composition).toContain("SHADOW_PARITY_SCHEDULED_OPERATOR_USER_ID");
    expect(composition).toContain("readUser:async()=>operatorId??null");
    expect(composition).not.toContain("tenantId:process.env");
    expect(composition).not.toContain("accountId:process.env");
  });

  it("keeps the cron narrow, secret-protected and outside beta, Live and Trading", () => {
    const route = read("app/api/cron/investing/shadow-parity/route.ts");
    expect(route).toContain("authorizedShadowParityCron");
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("createScheduledShadowParityServiceV1().run");
    expect(route).not.toMatch(/activateBeta|executeOrder|liveBroker|lib\/trading/u);
    expect(read("vercel.json")).toContain("/api/cron/investing/shadow-parity");
  });
});
