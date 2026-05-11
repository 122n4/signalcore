"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  MarketingChannel,
  MarketingContentItem,
  MarketingContentStatus,
  MarketingLead,
} from "@/lib/marketing/marketingOps";
import type { MarketingCreativeKind } from "@/lib/marketing/marketingIntegrations";

type MarketingOpsClientProps = {
  initialContent: MarketingContentItem[];
  initialLeads: MarketingLead[];
  schemaReady: boolean;
  schemaError: string | null;
};

const CHANNELS: MarketingChannel[] = ["linkedin", "x", "reddit", "facebook", "email", "video"];
const STATUSES: MarketingContentStatus[] = ["draft", "review", "approved", "scheduled", "published", "rejected"];

function statusClasses(status: MarketingContentStatus) {
  if (status === "published") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (status === "scheduled" || status === "approved") return "border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
  if (status === "review") return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  if (status === "rejected") return "border-red-300/40 bg-red-400/10 text-red-100";
  return "border-slate-500/40 bg-slate-900/80 text-slate-200";
}

function safetyClasses(severity: string | null | undefined) {
  if (severity === "block") return "border-red-300/40 bg-red-400/10 text-red-100";
  if (severity === "warn") return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
}

function creativeClasses(status: string | null | undefined) {
  if (status === "ready" || status === "published") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (status === "rendering" || status === "brief_ready" || status === "queued" || status === "scheduled") return "border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
  if (status === "failed") return "border-red-300/40 bg-red-400/10 text-red-100";
  return "border-slate-500/40 bg-slate-900/80 text-slate-200";
}

async function postMarketing(payload: Record<string, unknown>) {
  const response = await fetch("/api/ops/marketing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`);
  }
  return data;
}

function summarizeCounts(content: MarketingContentItem[]) {
  return STATUSES.map((status) => ({
    status,
    count: content.filter((item) => item.status === status).length,
  }));
}

export default function MarketingOpsClient({
  initialContent,
  initialLeads,
  schemaReady,
  schemaError,
}: MarketingOpsClientProps) {
  const [content, setContent] = useState(initialContent);
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialContent[0]?.id ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    campaign: "stale data discipline",
    channel: "linkedin" as MarketingChannel,
    audience: "manual traders who use broker apps",
    objective: "start trial without hype",
  });
  const [leadForm, setLeadForm] = useState({
    name: "",
    email: "",
    source: "manual",
    notes: "",
  });
  const [assetForm, setAssetForm] = useState({
    assetUrl: "",
    thumbnailUrl: "",
    kind: "image" as Exclude<MarketingCreativeKind, "copy">,
  });

  const selected = useMemo(
    () => content.find((item) => item.id === selectedId) ?? content[0] ?? null,
    [content, selectedId],
  );
  const counts = useMemo(() => summarizeCounts(content), [content]);
  const scheduled = useMemo(
    () =>
      content
        .filter((item) => item.scheduled_for)
        .slice()
        .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))
        .slice(0, 8),
    [content],
  );

  function updateItem(next: MarketingContentItem) {
    setContent((rows) => {
      const found = rows.some((row) => row.id === next.id);
      if (!found) return [next, ...rows];
      return rows.map((row) => (row.id === next.id ? next : row));
    });
    setSelectedId(next.id);
  }

  function generateDraft() {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "generate",
          ...form,
        });
        updateItem(data.item);
        setToast("Draft created. Review safety flags before approval.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not generate draft.");
      }
    });
  }

  function changeStatus(id: string, status: MarketingContentStatus) {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "update",
          id,
          status,
        });
        updateItem(data.item);
        setToast(status === "approved" ? "Approved. External publishing still requires a scheduled action." : `Moved to ${status}.`);
      } catch (error: any) {
        setToast(error?.message ?? "Could not update status.");
      }
    });
  }

  function schedule(id: string) {
    const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "update",
          id,
          status: "scheduled",
          scheduledFor: defaultDate,
        });
        updateItem(data.item);
        setToast("Scheduled internally. Buffer/Metricool publishing can be connected later.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not schedule.");
      }
    });
  }

  function requestCreative(id: string, kind: Exclude<MarketingCreativeKind, "copy">) {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "creative",
          id,
          kind,
        });
        updateItem(data.item);
        setToast(
          data.item.creative_status === "brief_ready"
            ? "Creative brief ready. Add Creatomate keys/template ids to render automatically."
            : `${kind} creative request sent.`,
        );
      } catch (error: any) {
        setToast(error?.message ?? "Could not request creative.");
      }
    });
  }

  function refreshCreative(id: string) {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "creative-status",
          id,
        });
        updateItem(data.item);
        setToast(data.item.asset_url ? "Creative asset is ready." : "Creative status refreshed.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not refresh creative status.");
      }
    });
  }

  function attachAsset(id: string) {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "asset",
          id,
          ...assetForm,
        });
        updateItem(data.item);
        setAssetForm({ assetUrl: "", thumbnailUrl: "", kind: assetForm.kind });
        setToast("Asset attached. You can now approve and publish it through the gateway.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not attach asset.");
      }
    });
  }

  function publish(id: string, publishNow: boolean) {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "publish",
          id,
          provider: "buffer",
          publishNow,
        });
        updateItem(data.item);
        setToast(publishNow ? "Approved content sent to Buffer for immediate publish." : "Approved content sent to Buffer queue.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not publish externally.");
      }
    });
  }

  function addLead() {
    setToast(null);
    startTransition(async () => {
      try {
        const data = await postMarketing({
          action: "lead",
          ...leadForm,
        });
        setLeads((rows) => [data.lead, ...rows]);
        setLeadForm({ name: "", email: "", source: "manual", notes: "" });
        setToast("Lead added to inbox.");
      } catch (error: any) {
        setToast(error?.message ?? "Could not add lead.");
      }
    });
  }

  if (!schemaReady) {
    return (
      <section className="rounded-[30px] border border-amber-300/30 bg-amber-400/10 p-6 text-amber-50">
        <p className="text-sm font-bold uppercase tracking-[0.24em]">Marketing schema missing</p>
        <h2 className="mt-2 text-2xl font-bold">Run the marketing ops migration first</h2>
        <p className="mt-3 text-sm text-amber-100/80">{schemaError ?? "marketing_content_items table is not ready yet."}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/70">Campaign factory</p>
            <h2 className="mt-2 text-2xl font-black text-white">Generate safe marketing drafts</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Creates reviewable campaigns for copy, image, video and social scheduling. External actions still require approval.
            </p>
          </div>
          <button
            type="button"
            onClick={generateDraft}
            disabled={isPending}
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
          >
            {isPending ? "Working..." : "Generate draft"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Campaign
            <input
              value={form.campaign}
              onChange={(event) => setForm((value) => ({ ...value, campaign: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
          <label className="text-sm text-slate-300">
            Channel
            <select
              value={form.channel}
              onChange={(event) => setForm((value) => ({ ...value, channel: event.target.value as MarketingChannel }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Audience
            <input
              value={form.audience}
              onChange={(event) => setForm((value) => ({ ...value, audience: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
          <label className="text-sm text-slate-300">
            Objective
            <input
              value={form.objective}
              onChange={(event) => setForm((value) => ({ ...value, objective: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
        </div>

        {toast ? (
          <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-200">{toast}</p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {counts.map((row) => (
            <div key={row.status} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{row.status}</p>
              <p className="mt-2 text-2xl font-black text-white">{row.count}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {content.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
              No drafts yet. Generate the first one above.
            </p>
          ) : (
            content.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selected?.id === item.id
                    ? "border-cyan-300/50 bg-cyan-300/10"
                    : "border-white/10 bg-slate-950/50 hover:border-white/20"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(item.status)}`}>{item.status}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${safetyClasses(item.safety?.severity)}`}>
                    safety {item.safety?.severity ?? "ok"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300">{item.channel}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${creativeClasses(item.creative_status)}`}>
                    creative {item.creative_status ?? "not_requested"}
                  </span>
                </div>
                <p className="mt-3 font-bold text-white">{item.title}</p>
                <p className="mt-1 text-sm text-slate-400">{item.campaign}</p>
              </button>
            ))
          )}
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/70">Review desk</p>
          {selected ? (
            <>
              <h2 className="mt-2 text-2xl font-black text-white">{selected.title}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(selected.status)}`}>{selected.status}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${safetyClasses(selected.safety?.severity)}`}>
                  {selected.safety?.severity ?? "ok"}
                </span>
              </div>
              <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-100">
                {selected.body}
              </pre>
              {selected.safety?.flags?.length ? (
                <div className="mt-4 space-y-2">
                  {selected.safety.flags.map((flag) => (
                    <p key={`${selected.id}-${flag.code}`} className={`rounded-2xl border p-3 text-sm ${safetyClasses(selected.safety.severity)}`}>
                      <span className="font-bold">{flag.code}</span>: {flag.message}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                  Safety checker found no blocked claims.
                </p>
              )}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => changeStatus(selected.id, "review")} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                  Send to review
                </button>
                <button type="button" onClick={() => changeStatus(selected.id, "approved")} className="rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">
                  Approve
                </button>
                <button type="button" onClick={() => schedule(selected.id)} className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950">
                  Schedule internally
                </button>
                <button type="button" onClick={() => changeStatus(selected.id, "rejected")} className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                  Reject
                </button>
              </div>
              <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/70">Creative studio</p>
                    <h3 className="mt-1 text-lg font-black text-white">Image/video asset</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${creativeClasses(selected.creative_status)}`}>
                    {selected.creative_kind ?? "copy"} · {selected.creative_status ?? "not_requested"}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => requestCreative(selected.id, "image")} className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100">
                    Create image brief/render
                  </button>
                  <button type="button" onClick={() => requestCreative(selected.id, "video")} className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-bold text-cyan-100">
                    Create video brief/render
                  </button>
                  <button type="button" onClick={() => refreshCreative(selected.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white sm:col-span-2">
                    Refresh render status
                  </button>
                </div>
                {selected.creative_prompt ? (
                  <pre className="mt-4 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-200">
                    {selected.creative_prompt}
                  </pre>
                ) : null}
                {selected.asset_url ? (
                  <a href={selected.asset_url} target="_blank" rel="noreferrer" className="mt-3 block rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">
                    Open attached creative asset
                  </a>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <input
                    value={assetForm.assetUrl}
                    onChange={(event) => setAssetForm((value) => ({ ...value, assetUrl: event.target.value }))}
                    placeholder="https://... image/video asset URL"
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
                  />
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={assetForm.thumbnailUrl}
                      onChange={(event) => setAssetForm((value) => ({ ...value, thumbnailUrl: event.target.value }))}
                      placeholder="Optional thumbnail URL"
                      className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
                    />
                    <select
                      value={assetForm.kind}
                      onChange={(event) => setAssetForm((value) => ({ ...value, kind: event.target.value as Exclude<MarketingCreativeKind, "copy"> }))}
                      className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none"
                    >
                      <option value="image">image</option>
                      <option value="video">video</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => attachAsset(selected.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                    Attach manual asset
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200/70">Publishing gateway</p>
                    <h3 className="mt-1 text-lg font-black text-white">Human-approved external action</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${creativeClasses(selected.external_status)}`}>
                    {selected.external_provider ?? "no provider"} · {selected.external_status ?? "not_sent"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Works with Buffer profile IDs when configured. It never auto-DMs, never auto-emails, and only sends approved/scheduled content.
                </p>
                {selected.last_external_error ? (
                  <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    {selected.last_external_error}
                  </p>
                ) : null}
                {selected.external_url ? (
                  <a href={selected.external_url} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-bold text-cyan-200">
                    Open external post/update
                  </a>
                ) : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => publish(selected.id, false)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
                    Send to Buffer queue
                  </button>
                  <button type="button" onClick={() => publish(selected.id, true)} className="rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950">
                    Publish now via Buffer
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Required env: BUFFER_ACCESS_TOKEN plus BUFFER_PROFILE_ID_LINKEDIN, BUFFER_PROFILE_ID_X, or BUFFER_PROFILE_ID_FACEBOOK.
                </p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-slate-300">Select or generate a draft to review.</p>
          )}
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/70">Calendar</p>
          <h2 className="mt-2 text-2xl font-black text-white">Scheduled content</h2>
          <div className="mt-4 space-y-2">
            {scheduled.length ? (
              scheduled.map((item) => (
                <div key={`scheduled-${item.id}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                  <p className="font-bold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : "No date"}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">No scheduled posts yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/70">Lead inbox</p>
          <h2 className="mt-2 text-2xl font-black text-white">Manual lead capture</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input value={leadForm.name} onChange={(event) => setLeadForm((value) => ({ ...value, name: event.target.value }))} placeholder="Name" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none" />
            <input value={leadForm.email} onChange={(event) => setLeadForm((value) => ({ ...value, email: event.target.value }))} placeholder="Email" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none" />
            <input value={leadForm.source} onChange={(event) => setLeadForm((value) => ({ ...value, source: event.target.value }))} placeholder="Source" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none" />
            <input value={leadForm.notes} onChange={(event) => setLeadForm((value) => ({ ...value, notes: event.target.value }))} placeholder="Notes" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none" />
          </div>
          <button type="button" onClick={addLead} disabled={isPending} className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white">
            Add lead
          </button>
          <div className="mt-4 space-y-2">
            {leads.slice(0, 8).map((lead) => (
              <div key={lead.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm">
                <p className="font-bold text-white">{lead.name || lead.email || "Unnamed lead"}</p>
                <p className="mt-1 text-slate-400">{lead.source || "unknown source"} | {lead.status}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
