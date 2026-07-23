"use client";

import { useState } from "react";

export default function InvestingApprovalControls(props: { queueId: string; version: number; disabled?: boolean }) {
  const [state, setState] = useState<"pending" | "approved" | "rejected" | "working" | "conflict">("pending");

  async function decide(decision: "approved" | "rejected") {
    if (state !== "pending") return;
    setState("working");
    const response = await fetch("/api/ops/investing/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueId: props.queueId,
        expectedStatus: "pending",
        expectedVersion: props.version,
        decision,
      }),
    });
    setState(response.ok ? decision : "conflict");
  }

  if (state !== "pending") {
    return <p className="mt-3 text-xs font-semibold uppercase tracking-wide">{state === "working" ? "Saving…" : state}</p>;
  }
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => void decide("approved")}
        className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-100 disabled:opacity-40"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => void decide("rejected")}
        className="rounded-full border border-red-300/30 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-100 disabled:opacity-40"
      >
        Reject
      </button>
    </div>
  );
}
