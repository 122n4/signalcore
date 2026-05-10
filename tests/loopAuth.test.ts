import { describe, expect, it } from "vitest";
import { isEngineLoopAuthorized, readBearerToken } from "../lib/engine/loopAuth";

function makeHeaders(values: Record<string, string>) {
  const h = new Headers();
  for (const [k, v] of Object.entries(values)) h.set(k, v);
  return h;
}

describe("readBearerToken", () => {
  it("extracts bearer token", () => {
    expect(readBearerToken("Bearer secret_123")).toBe("secret_123");
  });

  it("returns null on invalid header", () => {
    expect(readBearerToken("Basic abc")).toBe(null);
    expect(readBearerToken("")).toBe(null);
    expect(readBearerToken(null)).toBe(null);
  });
});

describe("isEngineLoopAuthorized", () => {
  it("allows only matching bearer token when secret exists", () => {
    const headers = makeHeaders({ authorization: "Bearer topsecret" });
    const ok = isEngineLoopAuthorized({
      headers,
      env: { CRON_SECRET: "topsecret", NODE_ENV: "production" },
    });
    expect(ok).toBe(true);
  });

  it("denies when secret exists and token mismatches", () => {
    const headers = makeHeaders({ authorization: "Bearer wrong", "x-vercel-cron": "1" });
    const ok = isEngineLoopAuthorized({
      headers,
      env: { CRON_SECRET: "topsecret", NODE_ENV: "production" },
    });
    expect(ok).toBe(false);
  });

  it("denies in production without secret", () => {
    const headers = makeHeaders({ "x-vercel-cron": "1" });
    const ok = isEngineLoopAuthorized({
      headers,
      env: { NODE_ENV: "production" },
    });
    expect(ok).toBe(false);
  });

  it("allows in development without secret", () => {
    const headers = makeHeaders({});
    const ok = isEngineLoopAuthorized({
      headers,
      env: { NODE_ENV: "development" },
    });
    expect(ok).toBe(true);
  });
});
