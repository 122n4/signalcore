"use client";

import { useMemo } from "react";

type PlanningTabProps = {
  locale: "pt" | "en";
  isPaid: boolean;
};

export default function PlanningTab({ locale, isPaid }: PlanningTabProps) {
  const pt = locale === "pt";

  const t = useMemo(() => {
    return {
      title: pt ? "Planeamento" : "Planning",
      subtitle: pt ? "Define um objetivo à tua maneira." : "Define your goal your way.",
    };
  }, [pt]);

  return (
    <div>
      <h2>{t.title}</h2>
      <p>{t.subtitle}</p>

      {!isPaid ? (
        <div style={{ marginTop: 12 }}>
          <strong>{pt ? "Plano grátis" : "Free plan"}</strong>
          <p>{pt ? "Faz upgrade para desbloquear tudo." : "Upgrade to unlock everything."}</p>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <strong>{pt ? "Premium ativo" : "Premium active"}</strong>
          <p>{pt ? "Acesso total desbloqueado." : "Full access unlocked."}</p>
        </div>
      )}
    </div>
  );
}