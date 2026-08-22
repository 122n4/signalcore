"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import CockpitShell from "@/components/CockpitShell";
import MoneyPill from "@/components/MoneyPill";
import UpgradeModal from "@/components/UpgradeModal";
import TradingUpgradeGate from "@/components/trading/TradingUpgradeGate";
import TradingNotificationManager from "@/components/trading/TradingNotificationManager";
import { buildTradingUpgradeModel } from "@/components/trading/tradingUpgradeModel";
import { useSiteLanguage } from "@/components/SiteLanguageProvider";
import { pickByLang } from "@/lib/i18n/siteLanguage";

import { useAccess } from "@/lib/signalcore/useAccess";
import { canAccessView, getLockedViewsForMode } from "@/lib/signalcore/entitlements";

import TradingTab from "@/app/app/tabs/TradingTab";
import JournalTab from "@/app/app/tabs/JournalTab";
import AlertsTab from "@/app/app/tabs/AlertsTab";
import {
  buildModeAwareNavItems,
  buildShellCopy,
  getModeHomeView,
  resolveModeAwareView,
  toModeAwareTab,
  type ViewKey,
} from "@/app/app/navigationModel";

function toLockedTradingSurface(view: ViewKey): "journal" | "alerts" | null {
  if (view === "journal" || view === "alerts") {
    return view;
  }
  return null;
}

function isLocalQaShellAuthBypass() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa") === "assisted" || params.get("__qa_auth") === "1") return true;
  return document.cookie.split(";").some((part) => part.trim() === "syntrake_qa_auth=1");
}

export default function AppUI() {
  const router = useRouter();
  const search = useSearchParams();
  const { isSignedIn } = useUser();
  const [qaAuthBypass, setQaAuthBypass] = useState(false);
  const { lang } = useSiteLanguage();

  const { isPaid, trial, tier, entitlements, loadingAccess } = useAccess();
  const requestedViewRaw = search?.get("tab") ?? search?.get("view");
  const workspaceMode = "trading" as const;

  const [view, setView] = useState<ViewKey>(() =>
    resolveModeAwareView({
      rawView: requestedViewRaw ?? getModeHomeView(workspaceMode),
      mode: workspaceMode,
    }),
  );
  const [lockedNavTarget, setLockedNavTarget] = useState<ViewKey | null>(null);

  useEffect(() => {
    setQaAuthBypass(isLocalQaShellAuthBypass());
  }, []);

  useEffect(() => {
    setView(
      resolveModeAwareView({
        rawView: requestedViewRaw ?? getModeHomeView(workspaceMode),
        mode: workspaceMode,
      }),
    );
  }, [requestedViewRaw, workspaceMode]);

  useEffect(() => {
    const qp = new URLSearchParams(search?.toString() || "");
    qp.set("tab", toModeAwareTab({ view, mode: workspaceMode }));
    qp.set("mode", workspaceMode);
    qp.delete("view");
    qp.delete("welcomeSetup");
    qp.delete("offlineSetup");
    const nextQuery = qp.toString();
    const currentQuery = search?.toString() || "";
    if (nextQuery === currentQuery) return;
    router.replace(`/app?${nextQuery}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, workspaceMode]);

  const lockedViewKeys = useMemo(() => getLockedViewsForMode({ tier, mode: workspaceMode }), [tier, workspaceMode]);
  const navItems = useMemo(
    () => buildModeAwareNavItems({ mode: workspaceMode, lang, lockedKeys: lockedViewKeys as ViewKey[] }),
    [workspaceMode, lang, lockedViewKeys],
  );
  const shellCopy = useMemo(
    () => buildShellCopy({ mode: workspaceMode, view, lang }),
    [workspaceMode, view, lang],
  );
  const homeHref = useMemo(() => `/app?tab=${getModeHomeView(workspaceMode)}&mode=${workspaceMode}`, [workspaceMode]);
  const showTopRight = false;
  const tradingViewLocked = !canAccessView({ tier, mode: workspaceMode, view });
  const lockedTradingSurface = toLockedTradingSurface(view);
  const lockedNavSurface = lockedNavTarget ? toLockedTradingSurface(lockedNavTarget) : null;
  const lockedNavUpgradeModel = lockedNavSurface ? buildTradingUpgradeModel(lockedNavSurface) : null;

  const right = (
    <div className="hidden gap-2 md:flex">
      <MoneyPill
        label={pickByLang(lang, {
          en: "Opportunity flow",
          pt: "Fluxo de oportunidades",
          es: "Flujo de oportunidades",
          fr: "Flux d opportunites",
          de: "Opportunity-Flow",
          it: "Flusso opportunita",
        })}
        value={tier === "free" ? "DISCOVERY" : "LIVE"}
      />
      <MoneyPill
        label={pickByLang(lang, {
          en: "Execution posture",
          pt: "Postura de execucao",
          es: "Postura de ejecucion",
          fr: "Posture d execution",
          de: "Execution-Posture",
          it: "Postura di esecuzione",
        })}
        value={tier === "free" ? "LIMITED" : "ACTIVE"}
      />
    </div>
  );

  if (!isSignedIn && !qaAuthBypass) return null;

  return (
    <>
      {entitlements.trading.alertsEnabled ? (
        <TradingNotificationManager enabled={entitlements.trading.alertsEnabled} />
      ) : null}

      <CockpitShell
        title={shellCopy.title}
        subtitle={shellCopy.subtitle}
        productBadge="Trading Desk"
        right={showTopRight ? right : null}
        active={view}
        items={navItems}
        homeHref={homeHref}
        onNav={(key) => {
          const nextView = key as ViewKey;
          setView(nextView);

          const qp = new URLSearchParams(search?.toString() || "");
          qp.set("tab", toModeAwareTab({ view: nextView, mode: workspaceMode }));
          qp.set("mode", workspaceMode);
          qp.delete("view");

          qp.delete("welcomeSetup");
          qp.delete("offlineSetup");

          router.push(`/app?${qp.toString()}`);
        }}
        onLockedNav={(key) => setLockedNavTarget(key as ViewKey)}
        isPaid={Boolean(isPaid)}
        trial={loadingAccess ? null : trial}
        showPageHeader={view !== "trading"}
      >
        <div className="grid gap-4">
          <div className="rounded-[22px] border border-cyan-300/20 bg-cyan-300/[0.08] p-4 text-cyan-50 shadow-[0_18px_50px_rgba(8,145,178,0.08)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">
                    Private automation
                  </p>
                  <h2 className="mt-1 text-lg font-black text-white">Bot automatico + paper history</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-cyan-50/75">
                    Testa o bot em paper, guarda ate 6 meses de historico e so prepara live quando estiver armado e ligado a broker.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/app/bot")}
                  className="rounded-2xl bg-cyan-200 px-4 py-3 text-sm font-black text-slate-950 transition hover:brightness-110"
                >
                  Open bot cockpit
                </button>
              </div>
          </div>

          {tradingViewLocked && lockedTradingSurface ? (
            <TradingUpgradeGate surface={lockedTradingSurface} />
          ) : (
            <>
              {view === "trading" && (
                <TradingTab mode={workspaceMode} discoveryLimit={entitlements.trading.discoveryInstrumentLimit} />
              )}
              {view === "journal" && <JournalTab />}
              {view === "alerts" && <AlertsTab locale={lang === "pt" ? "pt" : "en"} />}
            </>
          )}

        </div>
      </CockpitShell>

      <UpgradeModal
        open={lockedNavTarget !== null}
        onClose={() => setLockedNavTarget(null)}
        eyebrow={lockedNavUpgradeModel?.eyebrow || "Trading Pro"}
        title={lockedNavUpgradeModel?.modalTitle || "Unlock full trading depth"}
        subtitle={
          lockedNavUpgradeModel?.modalSubtitle ||
          "Trading opens with Market Radar in discovery mode. Upgrade when you want execution depth, journal, alerts, and deeper history."
        }
        primaryHref={lockedNavUpgradeModel?.pricingHref || "/pricing?source=app_locked_nav"}
        primaryText={lockedNavUpgradeModel?.primaryCta || "See trading plans"}
        secondaryHref={lockedNavUpgradeModel?.pricingHref || "/pricing?source=app_locked_nav_compare"}
        secondaryText={lockedNavUpgradeModel?.compareCta || "Compare Trading Pro"}
        freeTitle={lockedNavUpgradeModel?.freeTitle}
        freeBody={lockedNavUpgradeModel?.freeBody}
        trialTitle={lockedNavUpgradeModel?.trialTitle}
        trialBody={lockedNavUpgradeModel?.trialBody}
        proTitle={lockedNavUpgradeModel?.proTitle}
        proBullets={lockedNavUpgradeModel?.proBullets}
      />
    </>
  );
}
