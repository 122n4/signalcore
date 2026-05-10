"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest: string };
  reset: () => void;
}) {
  console.error("[global error]", error);

  return (
    <html>
      <body className="bg-zinc-50 text-zinc-900">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center px-6 py-12">
          <h1 className="text-2xl font-semibold">Syntrake encountered an unexpected error</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Your data is safe. Try reloading the app.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}


