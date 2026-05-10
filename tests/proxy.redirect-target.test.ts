import { describe, expect, it } from "vitest";
import { resolveProtectedRedirectTarget } from "@/lib/navigation/resolveProtectedRedirectTarget";

describe("resolveProtectedRedirectTarget", () => {
  it("maps /app/welcome into shell onboarding and preserves mode", () => {
    expect(resolveProtectedRedirectTarget("/app/welcome", "?mode=investing")).toBe(
      "/app?tab=planning&welcomeSetup=1&mode=investing",
    );
  });

  it("maps /app/offline-setup into shell onboarding and preserves mode and source", () => {
    expect(resolveProtectedRedirectTarget("/app/offline-setup", "?mode=crypto&source=welcome")).toBe(
      "/app?tab=planning&offlineSetup=1&mode=crypto&source=welcome",
    );
  });

  it("maps /app/broker into shell autonomy setup", () => {
    expect(resolveProtectedRedirectTarget("/app/broker", "?mode=forex&source=autonomy")).toBe(
      "/app?tab=autonomy&brokerSetup=1&mode=forex&source=autonomy",
    );
  });

  it("maps compatibility portfolio routes into the shell", () => {
    expect(resolveProtectedRedirectTarget("/my-portfolio", "?mode=trading")).toBe(
      "/app?tab=portfolio&mode=trading",
    );
    expect(resolveProtectedRedirectTarget("/app/portfolio", "")).toBe("/app?tab=portfolio");
  });

  it("leaves unrelated protected routes unchanged", () => {
    expect(resolveProtectedRedirectTarget("/app", "?tab=daily&mode=investing")).toBe(
      "/app?tab=daily&mode=investing",
    );
  });
});
