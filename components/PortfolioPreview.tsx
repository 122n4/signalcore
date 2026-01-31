"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Locale = "en" | "pt";

type CloudPayload = {
  data: any | null;
  updatedAt: string | null;
};

function pickHoldings(data: any): any[] {
  if (!data) return [];
  // tenta formatos comuns
  if (Array.isArray(data.holdings)) return data.holdings;
  if (Array.isArray(data.assets)) return data.assets;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function getHoldingLabel(h: any) {
  // tenta mostrar algo legível
  const name = h?.name ?? h?.ticker ?? h?.symbol ?? h?.id ?? "Asset";
  const type = h?.type ?? h?.category ?? "";
  return type ? `${name} · ${type}` : String(name);
}

export default function PortfolioPreview({ locale }: { locale: Locale }) {
  const t = useMemo(() => {
    if (locale === "pt") {
      return {
        title: "Meu portefólio",
        subtitle: "Pré-visualização (cloud)",
        loading: "A carregar…",
        emptyTitle: "Ainda não adicionaste ativos",
        emptyBody:
          "Adiciona apenas o que já tens. O SignalCore transforma isto num plano alinhado com o teu objetivo — sem te empurrar para trading.",
        open: "Abrir portefólio",
        signIn: "Entrar",
        lastUpdated: "Última atualização",
        err: "Não foi possível carregar agora. Tenta mais tarde.",
      };
    }
    return {
      title: "My Portfolio",
      subtitle: "Preview (cloud)",
      loading: "Loading…",
      emptyTitle: "No holdings yet",
      emptyBody:
        "Add only what you already own. SignalCore turns it into a goal-based plan — without pushing trading.",
      open: "Open portfolio",
      signIn: "Sign in",
      lastUpdated: "Last updated",
      err: "Couldn’t load right now. Try again.",
    };
  }, [locale]);

  const [status, setStatus] = useState<"loading" | "signedOut" | "ok" | "error">(
    "loading"
  );
  const [payload, setPayload] = useState<CloudPayload>({ data: null, updatedAt: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/portfolio", { method: "GET" });

        if (cancelled) return;

        if (res.status === 401) {
          setStatus("signedOut");
          return;
        }

        if (!res.ok) {
          setStatus("error");
          return;
        }

        const json = (await res.json()) as CloudPayload;
        setPayload(json);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const holdings = pickHoldings(payload.data);
  const openHref = locale === "pt" ? "/pt/my-portfolio" : "/my-portfolio";
  const signInHref = locale === "pt" ? "/pt/sign-in" : "/sign-in";

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-500">{t.subtitle}</p>
          <h2 className="mt-2 text-xl font-semibold">{t.title}</h2>
        </div>

        {status === "signedOut" ? (
          <Link
            href={signInHref}
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            {t.signIn}
          </Link>
        ) : (
          <Link
            href={openHref}
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            {t.open}
          </Link>
        )}
      </div>

      <div className="mt-6">
        {status === "loading" && (
          <p className="text-sm text-ink-700">{t.loading}</p>
        )}

        {status === "error" && (
          <p className="text-sm text-ink-700">{t.err}</p>
        )}

        {status === "signedOut" && (
          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <p className="text-sm text-ink-700">
              {locale === "pt"
                ? "Faz login para veres o teu portefólio na cloud."
                : "Sign in to see your cloud portfolio."}
            </p>
          </div>
        )}

        {status === "ok" && holdings.length === 0 && (
          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <p className="text-sm font-semibold text-ink-900">{t.emptyTitle}</p>
            <p className="mt-2 text-sm text-ink-700">{t.emptyBody}</p>
          </div>
        )}

        {status === "ok" && holdings.length > 0 && (
          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <p className="text-sm text-ink-700">
              {holdings.length} {locale === "pt" ? "ativos" : "holdings"}
            </p>

            <ul className="mt-3 space-y-2 text-sm text-ink-900">
              {holdings.slice(0, 5).map((h, idx) => (
                <li key={idx} className="flex items-center justify-between gap-4">
                  <span className="truncate">{getHoldingLabel(h)}</span>
                  {typeof h?.value === "number" ? (
                    <span className="text-ink-600 tabular-nums">{h.value}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            {payload.updatedAt ? (
              <p className="mt-4 text-xs text-ink-500">
                {t.lastUpdated}: {payload.updatedAt}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}