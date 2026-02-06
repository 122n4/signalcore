export const dynamic = "force-dynamic";

function isoDay() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const regime = url.searchParams.get("regime") ?? "Neutral / Range-bound";

  const stance =
    regime === "Risk-off"
      ? "Defensive"
      : regime === "Risk-on"
      ? "Offensive"
      : "Balanced";

  const checklist =
    stance === "Defensive"
      ? [
          "Reduce tail risk (concentration, leverage, meme assets).",
          "Increase cash buffer slightly.",
          "Prioritize plan coherence over speed.",
          "Do not chase rebounds.",
        ]
      : stance === "Offensive"
      ? [
          "Scale risk gradually, not all at once.",
          "Keep guardrails tight while adding exposure.",
          "Avoid overtrading; use cadence.",
          "Log your rationale in Journal.",
        ]
      : [
          "Focus on the lowest coherence driver.",
          "Rebalance only inside bands.",
          "Keep contributions consistent.",
          "Avoid new complexity.",
        ];

  return Response.json({
    updatedAt: isoDay(),
    stance,
    summary:
      "This is your weekly stance. Use it to avoid emotional pivots and stay aligned with your plan.",
    checklist,
  });
}