import { describe, expect, it } from "vitest";
import { sanitizeProductHref } from "@/lib/navigation/sanitizeProductHref";

describe("sanitizeProductHref", () => {
  it("preserves current trading tabs and mode inside the shell", () => {
    const href = sanitizeProductHref({
      href: "/app?tab=alerts&mode=trading&source=desk&unknown=drop-me",
      fallbackHref: "/app?tab=trading&mode=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=alerts&mode=trading&source=desk");
  });

  it("falls back to the Trading shell for unknown targets", () => {
    const href = sanitizeProductHref({
      href: "/unknown?x=1",
      fallbackHref: "/app?tab=trading&mode=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=trading&mode=trading");
  });

  it("rejects external absolute URLs", () => {
    const href = sanitizeProductHref({
      href: "https://evil.example/app?tab=trading",
      fallbackHref: "/app?tab=trading",
      mode: "trading",
    });

    expect(href).toBe("/app?tab=trading&mode=trading");
  });
});
