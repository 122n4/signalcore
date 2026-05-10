"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { usePaid } from "@/lib/signalcore/usePaid";

export default function PremiumGate({
  children,
  title = "Premium",
  subtitle = "Esta funcionalidade é exclusiva para Premium.",
  ctaHref = "/pricing",
  ctaText = "Ativar Premium",
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  ctaHref?: string;
  ctaText?: string;
}) {
  const { isPaid, loadingPaid } = usePaid();

  // Não logado → manda para sign-in (ou mostra CTA)
  return (
    <>
      <SignedOut>
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">{title}</p>
          <p className="mt-2 text-sm text-ink-700">{subtitle}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Iniciar sessão
            </Link>

            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {ctaText}
            </Link>
          </div>

          <p className="mt-4 text-xs text-ink-500">Conteúdo educativo. Investir envolve risco.</p>
        </div>
      </SignedOut>

      <SignedIn>
        {loadingPaid ? (
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">{title}</p>
            <p className="mt-3 text-sm text-ink-700">A verificar subscrição…</p>
          </div>
        ) : isPaid ? (
          <>{children}</>
        ) : (
          <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">{title}</p>
            <p className="mt-2 text-sm text-ink-700">{subtitle}</p>

            <div className="mt-6">
              <Link
                href={ctaHref}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              >
                {ctaText}
              </Link>
            </div>

            <p className="mt-4 text-xs text-ink-500">
              Estás autenticado, mas sem Premium ativo nesta conta.
            </p>
          </div>
        )}
      </SignedIn>
    </>
  );
}