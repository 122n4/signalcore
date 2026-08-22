import { describe, expect, it } from "vitest";
import { resolveProtectedRedirectTarget } from "@/lib/navigation/resolveProtectedRedirectTarget";

describe("resolveProtectedRedirectTarget", () => {
  it("keeps the broker route on the broker surface", () => {
    expect(resolveProtectedRedirectTarget("/app/broker", "?source=desk")).toBe(
      "/app/broker?source=desk",
    );
  });

  it("leaves unrelated protected routes unchanged", () => {
    expect(resolveProtectedRedirectTarget("/app", "?tab=trading&mode=trading")).toBe(
      "/app?tab=trading&mode=trading",
    );
  });
});
