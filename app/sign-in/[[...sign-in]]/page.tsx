import { SignIn } from "@clerk/nextjs";

export default function Page({
  searchParams,
}: {
  searchParams: { redirect_url?: string };
}) {
  const redirectUrl = searchParams?.redirect_url ?? "/my-portfolio";

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <SignIn redirectUrl={redirectUrl} afterSignInUrl={redirectUrl} />
    </div>
  );
}