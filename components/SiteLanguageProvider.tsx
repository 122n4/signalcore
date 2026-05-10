"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics/client";
import { DEFAULT_SITE_LANG, SITE_LANG_COOKIE_KEY, type SiteLang, resolveSiteLang } from "@/lib/i18n/siteLanguage";

type SiteLanguageContextValue = {
  lang: SiteLang;
  setLang: (next: SiteLang) => void;
};

const SITE_LANG_KEY = "sc_site_lang";

const SiteLanguageContext = createContext<SiteLanguageContextValue | null>(null);

function syncLangInUrl(lang: SiteLang) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (lang === DEFAULT_SITE_LANG) url.searchParams.delete("lang");
    else url.searchParams.set("lang", lang);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore URL parsing errors
  }
}

export function SiteLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<SiteLang>(DEFAULT_SITE_LANG);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${SITE_LANG_COOKIE_KEY}=([^;]*)`));
    const rawCookie = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : null;
    const fromCookie = rawCookie ? resolveSiteLang(rawCookie) : null;
    const qp = new URLSearchParams(window.location.search);
    const rawQuery = qp.get("lang");
    const fromQuery = rawQuery ? resolveSiteLang(rawQuery) : null;
    const rawStored = window.localStorage.getItem(SITE_LANG_KEY);
    const stored = rawStored ? resolveSiteLang(rawStored) : null;
    // Sync initial language preference once after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLangState(fromQuery ?? stored ?? fromCookie ?? DEFAULT_SITE_LANG);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SITE_LANG_KEY, lang);
    document.cookie = `${SITE_LANG_COOKIE_KEY}=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = lang;
    syncLangInUrl(lang);
  }, [lang]);

  function setLang(next: SiteLang) {
    const normalized = resolveSiteLang(next);
    setLangState(normalized);
    track("site_language_changed", { lang: normalized });
  }

  const value = useMemo<SiteLanguageContextValue>(() => ({ lang, setLang }), [lang]);

  return <SiteLanguageContext.Provider value={value}>{children}</SiteLanguageContext.Provider>;
}

export function useSiteLanguage() {
  const ctx = useContext(SiteLanguageContext);
  if (!ctx) {
    return {
      lang: DEFAULT_SITE_LANG as SiteLang,
      setLang: () => {},
    };
  }
  return ctx;
}
