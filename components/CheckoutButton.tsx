"use client";

import { useState } from "react";

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingCycle: "monthly", variant: "A", campaign: { ref: "pricing_pro" } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.message === "string" ? data.message : "Checkout indisponível");
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout indisponível");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="inline-flex rounded-2xl bg-cyan-200 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? "A abrir checkout..." : "Começar teste Pro"}
      </button>
      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
    </div>
  );
}
