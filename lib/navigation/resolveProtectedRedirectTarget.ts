function firstParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

export function resolveProtectedRedirectTarget(pathname: string, search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const qp = new URLSearchParams();

  const mode = firstParam(params, "mode");
  const source = firstParam(params, "source");
  const lang = firstParam(params, "lang");

  const preserveCommon = () => {
    if (mode) qp.set("mode", mode);
    if (source) qp.set("source", source);
    if (lang) qp.set("lang", lang);
  };

  if (pathname === "/app/welcome") {
    qp.set("tab", "planning");
    qp.set("welcomeSetup", "1");
    preserveCommon();
    return `/app?${qp.toString()}`;
  }

  if (pathname === "/app/offline-setup") {
    qp.set("tab", "planning");
    qp.set("offlineSetup", "1");
    preserveCommon();
    return `/app?${qp.toString()}`;
  }

  if (pathname === "/app/broker") {
    qp.set("tab", "autonomy");
    qp.set("brokerSetup", "1");
    preserveCommon();
    return `/app?${qp.toString()}`;
  }

  if (pathname === "/app/daily") {
    qp.set("tab", "daily");
    preserveCommon();
    return `/app?${qp.toString()}`;
  }

  if (pathname === "/app/portfolio" || pathname === "/my-portfolio" || pathname === "/portfolio") {
    qp.set("tab", "portfolio");
    preserveCommon();
    return `/app?${qp.toString()}`;
  }

  return `${pathname}${search}`;
}
