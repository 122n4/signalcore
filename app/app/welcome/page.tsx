import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function WelcomePage() {
  const { userId } = await auth();
  const target = "/app?tab=planning&offlineSetup=1";
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(target)}`);
  redirect(target);
}
