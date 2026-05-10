import { describe, expect, it } from "vitest";

import {
  DEFAULT_SITE_LANG,
  resolveBrowserSiteLang,
  resolveCountrySiteLang,
  resolvePreferredSiteLang,
  resolveSiteLang,
  resolveSiteLangOrNull,
} from "@/lib/i18n/siteLanguage";

describe("site language resolution", () => {
  it("normalizes supported browser locale variants", () => {
    expect(resolveSiteLang("pt-PT")).toBe("pt");
    expect(resolveSiteLang("es-MX")).toBe("es");
    expect(resolveSiteLang("fr-CA")).toBe("fr");
    expect(resolveSiteLang("de-AT")).toBe("de");
    expect(resolveSiteLang("it-CH")).toBe("it");
  });

  it("returns null for unsupported languages before falling back", () => {
    expect(resolveSiteLangOrNull("zh-CN")).toBe(null);
    expect(resolveBrowserSiteLang("zh-CN,zh;q=0.9")).toBe(null);
  });

  it("uses country only for supported automatic language fallbacks", () => {
    expect(resolveCountrySiteLang("PT")).toBe("pt");
    expect(resolveCountrySiteLang("BR")).toBe("pt");
    expect(resolveCountrySiteLang("MX")).toBe("es");
    expect(resolveCountrySiteLang("FR")).toBe("fr");
    expect(resolveCountrySiteLang("CN")).toBe(null);
  });

  it("prioritizes explicit user preference over browser and country", () => {
    expect(
      resolvePreferredSiteLang({
        query: "pt",
        stored: "fr",
        cookie: "de",
        browser: ["es-ES"],
        country: "IT",
      }),
    ).toBe("pt");

    expect(
      resolvePreferredSiteLang({
        stored: "fr",
        cookie: "de",
        browser: ["es-ES"],
        country: "IT",
      }),
    ).toBe("fr");
  });

  it("falls back from browser to country to English", () => {
    expect(resolvePreferredSiteLang({ browser: ["de-DE"], country: "PT" })).toBe("de");
    expect(resolvePreferredSiteLang({ browser: ["zh-CN"], country: "PT" })).toBe("pt");
    expect(resolvePreferredSiteLang({ browser: ["zh-CN"], country: "CN" })).toBe(DEFAULT_SITE_LANG);
  });
});
