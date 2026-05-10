import { beforeEach, describe, expect, it, vi } from "vitest";
import DailyPage from "@/app/app/daily/page";
import BrokerPage from "@/app/app/broker/page";
import LegacyPortfolioPage from "@/app/app/portfolio/page";
import MyPortfolioLegacy from "@/app/my-portfolio/page";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

import WelcomePage from "@/app/app/welcome/page";
import OfflineSetupPage from "@/app/app/offline-setup/page";

function expectRedirect(fn: () => unknown, target: string) {
  try {
    fn();
    throw new Error("Expected redirect to be thrown.");
  } catch (error: any) {
    const digest = String(error?.digest || error?.message || error);
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain(target);
  }
}

async function expectRedirectAsync(fn: () => Promise<unknown>, target: string) {
  try {
    await fn();
    throw new Error("Expected redirect to be thrown.");
  } catch (error: any) {
    const digest = String(error?.digest || error?.message || error);
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain(target);
  }
}

describe("navigation redirects", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("redirects /my-portfolio into the shell portfolio tab and preserves mode", () => {
    expectRedirect(() => MyPortfolioLegacy({ searchParams: { mode: "crypto" } }), "/app?tab=portfolio&mode=crypto");
  });

  it("redirects /app/portfolio into the shell portfolio tab and preserves mode", () => {
    expectRedirect(() => LegacyPortfolioPage({ searchParams: { mode: "forex" } }), "/app?tab=portfolio&mode=forex");
  });

  it("keeps /app/daily redirecting into the shell daily tab", () => {
    expectRedirect(() => DailyPage({ searchParams: { mode: "trading" } }), "/app?tab=daily&mode=trading");
  });

  it("redirects /app/broker into the shell autonomy broker setup flow and preserves mode", () => {
    expectRedirect(
      () => BrokerPage({ searchParams: { mode: "crypto", source: "welcome" } }),
      "/app?tab=autonomy&brokerSetup=1&mode=crypto&source=welcome",
    );
  });

  it("redirects /app/welcome into the shell planning onboarding flow for signed-in users", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });

    await expectRedirectAsync(() => WelcomePage(), "/app?tab=planning&offlineSetup=1");
  });

  it("redirects /app/welcome to sign-in with shell onboarding redirect when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expectRedirectAsync(
      () => WelcomePage(),
      "/sign-in?redirect_url=%2Fapp%3Ftab%3Dplanning%26offlineSetup%3D1",
    );
  });

  it("redirects /app/offline-setup into the shell planning onboarding flow and preserves mode", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });

    await expectRedirectAsync(
      () => OfflineSetupPage({ searchParams: { mode: "forex", source: "welcome" } }),
      "/app?tab=planning&offlineSetup=1&mode=forex&source=welcome",
    );
  });

  it("redirects /app/offline-setup to sign-in with shell onboarding redirect when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expectRedirectAsync(
      () => OfflineSetupPage({ searchParams: { mode: "crypto" } }),
      "/sign-in?redirect_url=%2Fapp%3Ftab%3Dplanning%26offlineSetup%3D1%26mode%3Dcrypto",
    );
  });
});
