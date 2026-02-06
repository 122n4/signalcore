// lib/brokers/snaptrade.ts
import type { BrokerSnapshot } from "./types";

/**
 * NOTA:
 * Isto é a versão "V2-ready":
 * - não assume trades automáticos
 * - foca em: conectar, sincronizar, ler holdings
 *
 * Mais tarde trocamos isto para usar o SDK oficial do SnapTrade.
 */

export async function snaptradeFetchSnapshot(params: {
  userId: string;
  accessToken?: string | null;
}): Promise<BrokerSnapshot> {
  // Por agora, devolve snapshot mock seguro (para não crashar)
  // e permite o produto funcionar enquanto ligas SnapTrade real.

  const now = new Date().toISOString();

  return {
    provider: "snaptrade",
    asOf: now,
    accounts: [
      {
        id: "demo",
        name: "Demo account",
        institution: "SnapTrade",
        currency: "USD",
      },
    ],
    positions: [],
    totalValue: 0,
  };
}