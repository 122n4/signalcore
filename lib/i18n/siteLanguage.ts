export const SITE_LANGS = ["en", "pt", "es", "fr", "de", "it"] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

export const DEFAULT_SITE_LANG: SiteLang = "en";
export const SITE_LANG_COOKIE_KEY = "sc_site_lang";

export function resolveSiteLang(input: unknown): SiteLang {
  const raw = String(input ?? "").toLowerCase().trim();
  const norm = raw.slice(0, 2);
  if (norm === "pt") return "pt";
  if (norm === "es") return "es";
  if (norm === "fr") return "fr";
  if (norm === "de") return "de";
  if (norm === "it") return "it";
  return "en";
}

export const SITE_LANG_LABELS: Record<SiteLang, string> = {
  en: "English",
  pt: "Portugues",
  es: "Espanol",
  fr: "Francais",
  de: "Deutsch",
  it: "Italiano",
};

type Multilingual = {
  en: string;
  pt?: string;
  es?: string;
  fr?: string;
  de?: string;
  it?: string;
};

export function pickByLang(lang: SiteLang, text: Multilingual): string {
  return text[lang] ?? text.en;
}
