import type { WeeklyAdvisorData, Locale } from "@/lib/weeklyAdvisor";

type Props = {
  data: WeeklyAdvisorData;
  locale: Locale;
};

export function WeeklyAdvisorView({ data }: Props) {
  return (
    <section className="rounded-2xl border p-6 bg-white">
      <h2 className="text-xl font-semibold mb-2">{data.title}</h2>
      <p className="text-sm text-gray-600 mb-4">{data.summary}</p>

      <ul className="list-disc pl-5 space-y-1 text-sm">
        {data.points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </section>
  );
}