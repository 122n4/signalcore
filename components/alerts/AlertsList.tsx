"use client";

import React from "react";
import { Alert } from "@/lib/alerts/types";
import { AlertCard } from "@/components/alerts/AlertCard";

export function AlertsList({ alerts, onChange }: { alerts: Alert[]; onChange: () => void }) {
  if (!alerts.length) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">No alerts</div>
        <div className="mt-1 text-xs text-neutral-500">
          You’re within band (or rules are disabled). Refresh to re-evaluate.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map(a => (
        <AlertCard key={a.id} alert={a} onChange={onChange} />
      ))}
    </div>
  );
}