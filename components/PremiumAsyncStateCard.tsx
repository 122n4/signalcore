import type { ReactNode } from "react";

import { formatUtcDateTime } from "@/lib/ui/format";

type PremiumAsyncStateCardProps = {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "error";
  state?: "loading" | "message";
  footnote?: string | null;
  meta?: ReactNode;
};

const toneClasses = {
  default: {
    shell:
      "border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)]",
    eyebrow: "text-slate-400",
    title: "text-white",
    body: "text-slate-300",
    action:
      "border border-slate-700 bg-[#12203a] text-white transition hover:border-slate-600",
    meta: "border border-slate-700 bg-[#0f1a2d] text-slate-300",
  },
  error: {
    shell: "border border-rose-900/70 bg-rose-950/40",
    eyebrow: "text-rose-200/90",
    title: "text-rose-100",
    body: "text-rose-100/90",
    action:
      "border border-rose-800 bg-rose-950/30 text-rose-100 transition hover:border-rose-700",
    meta: "border border-rose-800/80 bg-rose-950/25 text-rose-100/85",
  },
} as const;

function LoadingShimmer() {
  return (
    <div className="mt-5 space-y-3">
      <div className="h-3 w-40 animate-pulse rounded-full bg-white/10" />
      <div className="h-3 w-72 animate-pulse rounded-full bg-white/10" />
      <div className="h-3 w-56 animate-pulse rounded-full bg-white/10" />
    </div>
  );
}

export default function PremiumAsyncStateCard({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
  tone = "default",
  state = "message",
  footnote,
  meta,
}: PremiumAsyncStateCardProps) {
  const styles = toneClasses[tone];

  return (
    <section className={`rounded-[22px] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${styles.shell}`}>
      <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${styles.eyebrow}`}>
        {eyebrow}
      </div>
      <div className={`mt-3 text-xl font-semibold ${styles.title}`}>{title}</div>
      <div className={`mt-2 max-w-3xl text-sm leading-7 ${styles.body}`}>{body}</div>

      {meta ? <div className="mt-5">{meta}</div> : null}

      {state === "loading" ? <LoadingShimmer /> : null}

      {footnote ? (
        <div className={`mt-5 inline-flex rounded-2xl px-4 py-3 text-xs ${styles.meta}`}>
          {footnote}
        </div>
      ) : null}

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-5 rounded-xl px-4 py-2 text-sm font-semibold ${styles.action}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function buildSnapshotFootnote(args: {
  isRefreshing?: boolean;
  lastUpdatedAt?: string | null;
  refreshLabel?: string;
}) {
  if (args.isRefreshing && args.lastUpdatedAt) {
    return `${args.refreshLabel ?? "Refreshing live snapshot"} | last good snapshot ${formatUtcDateTime(args.lastUpdatedAt)}`;
  }

  if (args.isRefreshing) {
    return args.refreshLabel ?? "Refreshing live snapshot";
  }

  if (args.lastUpdatedAt) {
    return `Last good snapshot ${formatUtcDateTime(args.lastUpdatedAt)}`;
  }

  return null;
}
