"use client";

export default function OnboardingStartScreen({
  onDone,
}: {
  onDone: () => void | Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold">Onboarding</div>
      <p className="mt-2 text-sm text-gray-600">
        Setup starts here. This component is typed correctly to avoid TS errors.
      </p>

      <button
        onClick={() => onDone()}
        className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white"
      >
        Continue
      </button>
    </div>
  );
}