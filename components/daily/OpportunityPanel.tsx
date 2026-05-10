"use client";

import React from "react";

type Tone = "neutral" | "good" | "warn" | "bad";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200/80 bg-amber-50/90 text-amber-800"
        : tone === "bad"
          ? "border-rose-200/80 bg-rose-50/90 text-rose-700"
          : "border-slate-200 bg-slate-50/80 text-slate-700";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-[0_10px_22px_-18px_rgba(79,96,135,0.28)]",
        styles
      )}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
  className,
  headerClassName,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_24px_70px_-52px_rgba(79,96,135,0.22)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(226,232,240,0.22),transparent)]" />
      <div
        className={clsx(
          "relative flex items-start justify-between gap-4 px-5 pt-5",
          headerClassName
        )}
      >
        <div className="space-y-1">
          <div className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="text-[12px] text-slate-500">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="relative px-5 pb-5 pt-4">{children}</div>
    </div>
  );
}

type SimpleRationaleProps = {
  section: "simpleRationale";
  simpleDecisionRationaleLines: string[];
};

type WhyDecisionProps = {
  section: "whyDecision";
  whyThisDecisionMain: string;
  showDetails: boolean;
  whyDecisionSignals: string[];
};

type OpportunityQueueItem = {
  id: string;
  title?: string;
  priority: number;
  riskScore: number;
  effortScore: number;
};

type OpportunityQueueInlineProps = {
  section: "opportunityQueueInline";
  opportunityQueueNode:
    | {
        topPriority: number;
        items: OpportunityQueueItem[];
      }
    | null
    | undefined;
};

type DecisionSourcesProps = {
  section: "decisionSources";
  decisionSourcesNode:
    | {
        headline: string;
        sources: string[];
        trustLine?: string | null;
      }
    | null
    | undefined;
};

type SupportingLayoutProps = {
  layout: "supporting";
  decisionSourcesNode:
    | {
        headline: string;
        sources: string[];
        trustLine?: string | null;
      }
    | null
    | undefined;
  opportunityQueueNode:
    | {
        topPriority: number;
        items: OpportunityQueueItem[];
      }
    | null
    | undefined;
};

type ExplanationLayoutProps = {
  layout: "explanation";
  whyThisDecisionMain: string;
  showDetails: boolean;
  whyDecisionSignals: string[];
};

type SimpleLayoutProps = {
  layout: "simple";
  simpleDecisionRationaleLines: string[];
};

type OpportunityPanelSectionProps =
  | SimpleRationaleProps
  | WhyDecisionProps
  | OpportunityQueueInlineProps
  | DecisionSourcesProps;

type OpportunityPanelLayoutProps = SupportingLayoutProps | ExplanationLayoutProps | SimpleLayoutProps;

export type OpportunityPanelProps = OpportunityPanelSectionProps | OpportunityPanelLayoutProps;

function renderSimpleRationale(props: SimpleRationaleProps) {
  return (
    <Card title="Why this decision" subtitle="Short rationale from current market + portfolio context.">
      <div className="space-y-2.5">
        {props.simpleDecisionRationaleLines.map((line, idx) => (
          <div key={`simple-rationale-${idx}`} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-800">
            <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
            <span>{line}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function renderWhyDecision(props: WhyDecisionProps) {
  return (
    <Card title="Why this decision?" subtitle="Server-generated reasoning for today's capital action." right={<Badge tone="neutral">Reasoning</Badge>}>
      <div className="space-y-3">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-relaxed text-slate-800">
          {props.whyThisDecisionMain}
        </div>
        {props.showDetails && props.whyDecisionSignals.length > 0 ? (
          <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signals behind the call</div>
            {props.whyDecisionSignals.map((signal, idx) => (
              <div key={`why-signal-${idx}`} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-[10px] font-semibold text-sky-700">{idx + 1}</span>
                <span>{signal}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function renderOpportunityQueueInline(props: OpportunityQueueInlineProps) {
  if (!props.opportunityQueueNode || props.opportunityQueueNode.items.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
      Opportunity queue top priority: {Math.round(props.opportunityQueueNode.topPriority)}/100.
      <div className="mt-1 grid grid-cols-1 gap-1 md:grid-cols-3">
        {props.opportunityQueueNode.items.map((item) => (
          <div key={`queue-${item.id}`} className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
            <div className="font-medium text-zinc-900">{item.title || item.id}</div>
            <div>
              Priority {Math.round(item.priority)} | Risk {Math.round(item.riskScore)} | Effort {Math.round(item.effortScore)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderDecisionSources(props: DecisionSourcesProps) {
  if (!props.decisionSourcesNode || props.decisionSourcesNode.sources.length === 0) return null;
  return (
    <Card title={props.decisionSourcesNode.headline} subtitle="Transparency: how today's decision was computed." right={<Badge tone="neutral">Trust</Badge>}>
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {props.decisionSourcesNode.sources.map((src, idx) => (
            <div key={`decision-source-${idx}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
              {src}
            </div>
          ))}
        </div>
        {props.decisionSourcesNode.trustLine ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{props.decisionSourcesNode.trustLine}</div>
        ) : null}
      </div>
    </Card>
  );
}

function renderSupportingLayout(props: SupportingLayoutProps) {
  const hasSources = Boolean(props.decisionSourcesNode && props.decisionSourcesNode.sources.length > 0);
  const queueContent = renderOpportunityQueueInline({
    section: "opportunityQueueInline",
    opportunityQueueNode: props.opportunityQueueNode,
  });
  if (!hasSources && !queueContent) return null;

  return (
    <div className="space-y-4">
      {hasSources
        ? renderDecisionSources({
            section: "decisionSources",
            decisionSourcesNode: props.decisionSourcesNode,
          })
        : null}
      {queueContent ? (
        <Card title="Opportunity queue" subtitle="Priority-ranked follow-on ideas from the current engine state." right={<Badge tone="neutral">Queue</Badge>}>
          {queueContent}
        </Card>
      ) : null}
    </div>
  );
}

export default function OpportunityPanel(props: OpportunityPanelProps) {
  if ("layout" in props) {
    switch (props.layout) {
      case "supporting":
        return renderSupportingLayout(props);
      case "explanation":
        return renderWhyDecision({
          section: "whyDecision",
          whyThisDecisionMain: props.whyThisDecisionMain,
          showDetails: props.showDetails,
          whyDecisionSignals: props.whyDecisionSignals,
        });
      case "simple":
        return renderSimpleRationale({
          section: "simpleRationale",
          simpleDecisionRationaleLines: props.simpleDecisionRationaleLines,
        });
      default:
        return null;
    }
  }

  switch (props.section) {
    case "simpleRationale":
      return renderSimpleRationale(props);
    case "whyDecision":
      return renderWhyDecision(props);
    case "opportunityQueueInline":
      return renderOpportunityQueueInline(props);
    case "decisionSources":
      return renderDecisionSources(props);
    default:
      return null;
  }
}
