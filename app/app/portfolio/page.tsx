import { redirect } from "next/navigation";

export default function LegacyPortfolioPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qp = new URLSearchParams();
  const rawMode = searchParams?.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  qp.set("tab", "portfolio");
  if (mode) qp.set("mode", mode);
  redirect(`/app?${qp.toString()}`);
}
