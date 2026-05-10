"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-start justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Syntrake recovered safely. Refresh this section and continue from your last step.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
      >
        Retry
      </button>
    </main>
  );
}


