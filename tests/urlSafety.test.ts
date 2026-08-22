import { describe, expect, it } from "vitest";
import { resolveAppUrl, resolvePortalReturnUrl, toCleanString } from "../lib/server/urlSafety";

describe("urlSafety", () => {
  it("normalizes app url", () => {
    expect(resolveAppUrl("https://signalcore.app/")).toBe("https://signalcore.app");
  });

  it("returns localhost fallback for invalid app url", () => {
    expect(resolveAppUrl("not a url")).toBe("http://localhost:3000");
  });

  it("builds default portal return url", () => {
    expect(resolvePortalReturnUrl(undefined, "https://signalcore.app")).toBe("https://signalcore.app/app");
  });

  it("accepts relative return url", () => {
    expect(resolvePortalReturnUrl("/app?tab=daily", "https://signalcore.app")).toBe("https://signalcore.app/app?tab=daily");
    expect(resolvePortalReturnUrl("pricing", "https://signalcore.app")).toBe("https://signalcore.app/pricing");
  });

  it("accepts same-origin absolute return url", () => {
    expect(resolvePortalReturnUrl("https://signalcore.app/app?tab=trading", "https://signalcore.app")).toBe(
      "https://signalcore.app/app?tab=trading"
    );
  });

  it("blocks external absolute return url", () => {
    expect(resolvePortalReturnUrl("https://evil.example.com/phish", "https://signalcore.app")).toBe("https://signalcore.app/app");
  });

  it("trims and limits values", () => {
    expect(toCleanString("  abc  ", 10)).toBe("abc");
    expect(toCleanString("x".repeat(20), 5)).toBe("xxxxx");
    expect(toCleanString("", 10)).toBe(null);
  });
});
