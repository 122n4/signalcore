export type WeeklyAdvisorData = {
  title: string;
  summary: string;
  points: string[];
};

export type Locale = "en" | "pt";

export function getWeeklyAdvisor(locale: Locale): WeeklyAdvisorData {
  if (locale === "pt") {
    return {
      title: "Análise Semanal",
      summary: "Resumo educativo da semana nos mercados.",
      points: [
        "Contexto macroeconómico",
        "Regime de mercado",
        "Riscos principais",
      ],
    };
  }

  return {
    title: "Weekly Analysis",
    summary: "Educational weekly overview of the markets.",
    points: [
      "Macroeconomic context",
      "Market regime",
      "Key risks",
    ],
  };
}