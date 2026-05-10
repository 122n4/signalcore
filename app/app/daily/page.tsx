import { redirect } from "next/navigation";

export default function DailyPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qp = new URLSearchParams();
  const rawMode = searchParams?.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  qp.set("tab", "daily");
  if (mode) qp.set("mode", mode);
  redirect(`/app?${qp.toString()}`);
}
