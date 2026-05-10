import { describe, expect, it } from "vitest";
import { sanitizeProductHref } from "@/lib/navigation/sanitizeProductHref";

describe("sanitizeProductHref", () => {
  it("preserves allowlisted shell params and drops unknown params", () => {
    const href = sanitizeProductHref({
      href: "/app?tab=portfolio&mode=investing&fixNow=1&fixKey=pricing_low&brokerSetup=1&unknown=1",
      fallbackHref: "/app?tab=daily",
      mode: "investing",
    });

    expect(href).toBe("/app?tab=portfolio&mode=investing&fixNow=1&fixKey=pricing_low&brokerSetup=1");
  });

  it("coerces legacy /apptab routes into the investing shell", () => {
    const href = sanitizeProductHref({
      href: "/apptab=planning&mode=crypto&addHoldingsNow=1&unknown=drop-me",
      fallbackHref: "/app?tab=daily&mode=investing",
      mode: "investing",
    });

    expect(href).toBe("/app?tab=planning&mode=investing&addHoldingsNow=1");
  });

  it("preserves trading tabs and mode inside the shell", () => {
    const href = sanitizeProductHref({
      href: "/app?tab=execution&mode=trading&source=desk&unknown=drop-me",
      fallbackHref: "/app?tab=trading&mode=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=execution&mode=trading&source=desk");
  });

  it("coerces legacy /apptab routes into the trading shell when the mode is trading", () => {
    const href = sanitizeProductHref({
      href: "/apptab=opportunities&mode=trading&source=journal",
      fallbackHref: "/app?tab=trading&mode=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=opportunities&mode=trading&source=journal");
  });

  it("falls back to a shell-safe href without reviving removed modes", () => {
    const href = sanitizeProductHref({
      href: "/app/welcome?mode=forex&unknown=1",
      fallbackHref: "/app?tab=daily",
      mode: null,
    });

    expect(href).toBe("/app?tab=planning&welcomeSetup=1&mode=investing");
  });

  it("falls back to investing when the target href has no valid mode", () => {
    const href = sanitizeProductHref({
      href: "/app/welcome",
      fallbackHref: "/app?tab=portfolio",
      mode: "crypto",
    });

    expect(href).toBe("/app?tab=planning&welcomeSetup=1&mode=investing");
  });

  it("uses the trading home when the fallback lives in trading mode", () => {
    const href = sanitizeProductHref({
      href: "",
      fallbackHref: "/app?tab=trading&mode=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=trading&mode=trading");
  });

  it("coerces offline-setup targets into planning shell onboarding using investing mode", () => {
    const href = sanitizeProductHref({
      href: "/app/offline-setup?mode=trading&source=welcome&unknown=drop-me",
      fallbackHref: "/app?tab=daily&mode=investing",
      mode: "investing",
    });

    expect(href).toBe("/app?tab=planning&offlineSetup=1&mode=investing&source=welcome");
  });

  it("falls back from removed standalone broker targets to the safe investing shell", () => {
    const href = sanitizeProductHref({
      href: "/app/broker?mode=crypto&source=autonomy",
      fallbackHref: "/app?tab=autonomy&brokerSetup=1",
      mode: "investing",
    });

    expect(href).toBe("/app?tab=autonomy&brokerSetup=1&mode=investing");
  });

  it("rejects external absolute URLs", () => {
    const href = sanitizeProductHref({
      href: "https://evil.example/app?tab=daily&mode=crypto",
      fallbackHref: "/app?tab=daily",
      mode: "crypto",
    });

    expect(href).toBe("/app?tab=daily");
  });
});
