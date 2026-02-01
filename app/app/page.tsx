import { Suspense } from "react";
import AppClient from "./ui";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-ink-500">Loading app…</div>}>
      <AppClient />
    </Suspense>
  );
}