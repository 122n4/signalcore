import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BrokerPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qp = new URLSearchParams();
  const rawMode = searchParams?.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  const rawSource = searchParams?.source;
  const source = Array.isArray(rawSource) ? rawSource[0] : rawSource;

  qp.set("tab", "autonomy");
  qp.set("brokerSetup", "1");
  if (mode) qp.set("mode", mode);
  if (source) qp.set("source", source);

  redirect(`/app?${qp.toString()}`);
}
