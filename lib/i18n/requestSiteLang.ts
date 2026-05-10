import { cookies } from "next/headers";
import { DEFAULT_SITE_LANG, resolveSiteLang, SITE_LANG_COOKIE_KEY, type SiteLang } from "@/lib/i18n/siteLanguage";

type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string") return value;
  return null;
}

export async function resolveRequestSiteLang(searchParams?: SearchParamsInput): Promise<SiteLang> {
  let fromQuery: string | null = null;

  if (searchParams instanceof URLSearchParams) {
    fromQuery = searchParams.get("lang");
  } else if (searchParams && typeof searchParams === "object") {
    fromQuery = firstParam(searchParams.lang);
  }

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(SITE_LANG_COOKIE_KEY)?.value ?? null;
  return resolveSiteLang(fromQuery ?? fromCookie ?? DEFAULT_SITE_LANG);
}

export function withLangQuery(href: string, lang: SiteLang): string {
  if (lang === DEFAULT_SITE_LANG) return href;
  const [pathPart, hashPart = ""] = href.split("#");
  const [pathname, query = ""] = pathPart.split("?");
  const qp = new URLSearchParams(query);
  qp.set("lang", lang);
  const querySuffix = qp.toString() ? `?${qp.toString()}` : "";
  const hashSuffix = hashPart ? `#${hashPart}` : "";
  return `${pathname}${querySuffix}${hashSuffix}`;
}
