"use client";

import { useState } from "react";

const items = [
  {
    question: "O que é a SYNTRAKE?",
    answer: "A SYNTRAKE é uma plataforma para organizar decisões, contexto e disciplina num único espaço. As páginas comerciais descrevem o produto sem prometer funcionalidades que ainda não estejam disponíveis.",
  },
  {
    question: "Preciso de ligar um broker para começar?",
    answer: "Não. Estas páginas são informativas e não iniciam onboarding, ligações a brokers, ordens ou qualquer fluxo financeiro.",
  },
  {
    question: "O que está incluído no acesso?",
    answer: "O acesso e as funcionalidades dependem do estado atual do produto e do plano apresentado na página de pricing. Consulta o pricing atual antes de tomar qualquer decisão.",
  },
  {
    question: "A SYNTRAKE garante resultados financeiros?",
    answer: "Não. A SYNTRAKE não garante resultados, retornos ou ausência de perdas. Qualquer decisão financeira continua a ser responsabilidade do utilizador.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.question} className="rounded-2xl border border-zinc-200 bg-white">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-zinc-950"
            >
              <span>{item.question}</span>
              <span aria-hidden="true" className="text-lg text-zinc-500">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? <p className="px-5 pb-5 text-sm leading-6 text-zinc-700">{item.answer}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
