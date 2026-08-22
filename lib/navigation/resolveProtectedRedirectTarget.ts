function firstParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

export function resolveProtectedRedirectTarget(pathname: string, search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const source = firstParam(params, "source");
  const lang = firstParam(params, "lang");

  if (pathname === "/app/broker") {
    const qp = new URLSearchParams();
    if (source) qp.set("source", source);
    if (lang) qp.set("lang", lang);
    const query = qp.toString();
    return query ? `/app/broker?${query}` : "/app/broker";
  }

  return `${pathname}${search}`;
}
