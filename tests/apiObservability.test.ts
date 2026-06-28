import { describe, expect, it } from "vitest";

import {
  buildApiRequestContext,
  jsonWithRequestContext,
  toErrorMessage,
} from "@/lib/ops/apiObservability";

describe("api observability helpers", () => {
  it("reuses inbound request ids when available", async () => {
    const req = new Request("https://example.com/api/health", {
      headers: { "x-request-id": "req_123" },
    });

    const context = buildApiRequestContext(req);

    expect(context.requestId).toBe("req_123");
  });

  it("adds canonical request metadata to responses", async () => {
    const req = new Request("https://example.com/api/health");
    const context = buildApiRequestContext(req);
    const response = jsonWithRequestContext(context, { ok: true });
    const payload = await response.json();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(context.requestId);
    expect(payload.ok).toBe(true);
    expect(payload.requestId).toBe(context.requestId);
    expect(typeof payload.generatedAt).toBe("string");
  });

  it("normalizes unknown errors safely", () => {
    expect(toErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(toErrorMessage(null, "fallback")).toBe("fallback");
  });
});
