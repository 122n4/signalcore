import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : typeof value === "string" ? value : null;
}

export default async function OfflineSetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  const params =
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === "function"
      ? await (searchParams as Promise<Record<string, string | string[] | undefined>>)
      : (searchParams as Record<string, string | string[] | undefined> | undefined);

  const qp = new URLSearchParams();
  qp.set("tab", "planning");
  qp.set("offlineSetup", "1");

  const mode = firstParam(params?.mode);
  if (mode) qp.set("mode", mode);

  const source = firstParam(params?.source);
  if (source) qp.set("source", source);

  const target = `/app?${qp.toString()}`;
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(target)}`);
  redirect(target);
}
