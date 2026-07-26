"use client";

import Link from "next/link";

export default function InvestingError() {
  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl rounded-[28px] border border-red-300/30 bg-red-400/10 p-7">
        <h1 className="text-3xl font-bold">Informação Investing indisponível</h1>
        <p className="mt-3 text-red-100/85">
          Não foi possível apresentar os dados. Nenhuma operação foi iniciada.
        </p>
        <Link className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm font-bold" href="/app">
          Voltar ao produto
        </Link>
      </section>
    </main>
  );
}
