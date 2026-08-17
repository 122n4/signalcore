import { describe, expect, it } from "vitest";
import { resolveProtectedRedirectTarget } from "@/lib/navigation/resolveProtectedRedirectTarget";

describe("resolveProtectedRedirectTarget", () => {
  it("does not revive deleted Investing onboarding routes", () => {
    expect(resolveProtectedRedirectTarget("/app/welcome", "?mode=investing")).toBe(
      "/app/welcome?mode=investing",
    );
    expect(resolveProtectedRedirectTarget("/app/offline-setup", "?mode=crypto&source=welcome")).toBe(
      "/app/offline-setup?mode=crypto&source=welcome",
    );
  });

  it("maps /app/broker into shell autonomy setup", () => {
    expect(resolveProtectedRedirectTarget("/app/broker", "?mode=forex&source=autonomy")).toBe(
      "/app?tab=autonomy&brokerSetup=1&mode=forex&source=autonomy",
    );
  });

  it("does not revive deleted portfolio compatibility routes", () => {
    expect(resolveProtectedRedirectTarget("/my-portfolio", "?mode=trading")).toBe(
      "/my-portfolio?mode=trading",
    );
    expect(resolveProtectedRedirectTarget("/app/portfolio", "")).toBe("/app/portfolio");
  });

  it("leaves unrelated protected routes unchanged", () => {
    expect(resolveProtectedRedirectTarget("/app", "?tab=daily&mode=investing")).toBe(
      "/app?tab=daily&mode=investing",
    );
  });
});
