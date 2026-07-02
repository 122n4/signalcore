import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

async function createTempDir(prefix: string) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function importFreshAdminModule() {
  vi.resetModules();
  return import("@/lib/supabase/admin");
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("supabase admin env bootstrap", () => {
  it("loads .env.research when CLI env is missing", async () => {
    const rootDir = await createTempDir("supabase-admin-env-");
    await writeFile(
      path.join(rootDir, ".env.research"),
      [
        "SUPABASE_URL=https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key",
      ].join("\n"),
      "utf8",
    );

    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.chdir(rootDir);

    const { getSupabaseAdmin } = await importFreshAdminModule();
    expect(() => getSupabaseAdmin()).not.toThrow();
    expect(process.env.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("test-service-role-key");
  });

  it("does not override an already loaded environment", async () => {
    const rootDir = await createTempDir("supabase-admin-env-");
    await mkdir(rootDir, { recursive: true });
    await writeFile(
      path.join(rootDir, ".env.research"),
      [
        "SUPABASE_URL=https://wrong.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY=wrong-key",
      ].join("\n"),
      "utf8",
    );

    process.env.SUPABASE_URL = "https://canonical.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "canonical-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.chdir(rootDir);

    const { getSupabaseAdmin } = await importFreshAdminModule();
    expect(() => getSupabaseAdmin()).not.toThrow();
    expect(process.env.SUPABASE_URL).toBe("https://canonical.supabase.co");
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("canonical-key");
  });
});
