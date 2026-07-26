import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

describe("FASE 5B-R server-only and schema boundaries", () => {
  const infrastructure = [
    "lib/investing/identity/infrastructure/clerkSession.server.ts",
    "lib/investing/identity/infrastructure/postgresDirectory.server.ts",
    "lib/investing/identity/infrastructure/factory.server.ts",
    "lib/investing/identity/infrastructure/server.ts",
  ];

  it.each(infrastructure)("%s is server-only", (file) => {
    expect(read(file).startsWith('import "server-only";')).toBe(true);
  });

  it("uses closed permissions and no wildcard in persisted schema", () => {
    const migration = read(
      "supabase/migrations/20260725120000_investing_identity_schema_recovery.sql",
    );
    for (const permission of [
      "investing:read",
      "investing:create",
      "investing:verify",
      "investing:replay",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).not.toContain("'investing:*'");
    expect(migration).not.toContain("begin read only");
  });

  it("directory uses parameterized read-only RLS transactions", () => {
    const directory = read(
      "lib/investing/identity/infrastructure/postgresDirectory.server.ts",
    );
    expect(directory).toContain("begin read only");
    expect(directory).toContain("set local role authenticated");
    expect(directory).toContain("$1");
    expect(directory).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("does not expose infrastructure through the neutral identity entrypoint", () => {
    expect(read("lib/investing/identity/index.ts"))
      .not.toContain("infrastructure");
  });
});
