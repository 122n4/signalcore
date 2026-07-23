# Investing Engine — Fase 3A Boundary Safety

**Data:** 2026-07-20
**Estado:** implementação 3A concluída; não avançado para 3B
**Reason code:** `investing_shared_broker_sync_blocked`

## 1. Risco inicial

O loop shared aceitava `active_mode=investing` e chegava a `syncBrokerToPortfolio`. A chamada podia consultar bridge/CSV, atribuir preços, inserir/atualizar/apagar `portfolio_items`, escrever mirrors em `portfolios` e `daily_snapshots` e emitir `order_sent`/`order_filled` sem ordens ou fills canónicos.

A guarda HTTP antiga de `/api/broker/sync` verificava apenas o modo explicitamente pedido. Um request sem modo, ou uma chamada interna ao serviço, não passava por uma proteção efetiva.

## 2. Fluxo reproduzível antes da correção

Precondições provadas na Fase 2:

1. `user_settings.active_mode = 'investing'`;
2. broker connection connected, `autoSync=true` e prova válida;
3. target due, ou `force=true`;
4. `dryRun=false`;
5. execução do cron/route `/api/engine/loop`.

Prova isolada anterior:

```text
npx vitest run tests/.codexInvestingEngineLoopRisk.test.ts
1 test passed
assertion: syncBrokerToPortfolio({ mode: "investing", ... }) called once
```

O teste de prova foi descartável e removido após a execução. Não contactou staging ou produção.

## 3. Ficheiros alterados

Implementação:

- `lib/broker/investingBoundary.ts` — reason code, erro tipado, resolução de modo efetivo e fail-closed;
- `lib/broker/index.ts` — export da boundary;
- `lib/broker/sync.ts` — guardas diretas antes de CSV/bridge/DB em sync e shared reconciliation;
- `lib/engine/loop.ts` — exclusão de targets Investing antes de due/proof/events/sync;
- `app/api/broker/sync/route.ts` — resolução efetiva antes de carregar broker e segunda verificação após access resolution;
- `app/api/broker/reconcile/route.ts` — bloqueio shared para Investing com `refresh=true` e `refresh=false`;
- `app/api/portfolio-items/route.ts` — bloqueio de POST/DELETE Investing e DELETE limitado ao modo efetivo;
- `app/api/portfolio-items/reset/route.ts` — bloqueio de reset Investing;
- `app/api/fix-now/run/route.ts` — bloqueio Investing antes de contexto, quotes, writes ou eventos.

Testes novos:

- `tests/investingEnginePhase3ASyncGuard.test.ts`;
- `tests/investingEnginePhase3ALoop.test.ts`;
- `tests/investingEnginePhase3ABrokerRoutes.test.ts`;
- `tests/investingEnginePhase3ALegacyWrites.test.ts`.

Não foram alterados `lib/trading/**`, Persistent Paper, RPCs, migrations ou UI.

## 4. Guardas implementadas

### Resolução do modo efetivo

`resolveEffectiveSharedBrokerMode` cruza o modo pedido com `user_settings.active_mode`:

- modo omitido usa o modo guardado;
- valor inválido normaliza para Investing e bloqueia;
- Investing pedido bloqueia, mesmo que o stored mode seja Trading;
- Trading pedido com stored mode Investing é tratado como spoofing e bloqueia;
- mismatch entre stored/requested falha fechado como Investing;
- erro a ler `active_mode` falha fechado como Investing;
- routes broker mantêm a verificação de entitlement/access; fallback de Trading para Investing volta a ser bloqueado antes de carregar a ligação.

### Loop

Um target Investing de `user_settings`, journal fallback ou chamada explícita retorna `skipped` com o reason code antes de:

- `createExecutionId`;
- validação/uso de broker connection;
- `writeEngineEvent`;
- `syncBrokerToPortfolio`;
- save/reconciliation/journal legacy.

O bloqueio tem precedência sobre due/not-due, `force` e `dryRun` para que nenhuma variante volte a abrir o caminho.

### Serviço shared

`syncBrokerToPortfolio` e `reconcileWithPortfolio` executam `assertSharedBrokerSyncAllowed` imediatamente após normalizar o modo e antes de obter Supabase, ler CSV, consultar bridge/quotes ou tocar em `portfolio_items`.

O antigo branch que conciliava intent Investing dentro da reconciliation shared foi removido por ficar atrás de uma fronteira agora proibida. A reconciliation canónica Investing não foi alterada.

### APIs e writes legacy

- broker sync/reconcile Investing devolvem HTTP 410 e o reason code;
- não se carrega/salva broker connection e não se emitem eventos de execução no bloqueio;
- POST/DELETE/reset de `portfolio_items` e FixNow Investing devolvem HTTP 410 antes da primeira leitura/escrita legacy;
- GET legacy não foi migrado nesta subfase;
- o modo Trading continua a seguir o comportamento anterior.

## 5. Testes obrigatórios

Cobertura 3A:

| Cenário | Resultado |
|---|---|
| `active_mode=investing` em `user_settings` | Bloqueado |
| target Investing por journal fallback | Bloqueado |
| due e not due | Bloqueado antes de ambos |
| `force=true` | Bloqueado |
| `dryRun=true/false` | Bloqueado sem efeitos |
| modo explícito e omitido | Coberto |
| modo inválido, mismatch e spoof | Fail-closed coberto |
| access fallback Trading→Investing | Bloqueado |
| reconcile `refresh=true/false` | Bloqueado no Investing; preservado no Trading |
| bridge fetch, CSV/DB read e quotes | Ausentes no direct guard |
| `portfolio_items`, `portfolios`, `daily_snapshots` writes | Ausentes no bloqueio |
| reset e FixNow | Bloqueados antes de leitura/write/event |
| eventos `order_sent`/`order_filled` | Ausentes no Investing |
| Trading shared sync/reconcile/portfolio write | Preservados |
| cron `/api/engine/loop` | Configuração preservada e target Trading executado em teste |

## 6. Resultados

```text
Testes 3A dedicados:
4 files passed
34 tests passed

Regressão focada de arquitetura/broker/Trading/cron:
9 files passed
23 tests passed

TypeScript:
npx tsc --noEmit --pretty false
PASS

ESLint dos ficheiros 3A:
PASS

git diff --check dos ficheiros 3A:
PASS (apenas avisos CRLF do worktree Windows)
```

Suite total adicional:

```text
234 files passed, 3 failed, 15 skipped
835 tests passed, 6 failed, 22 skipped
```

As seis falhas estão limitadas a `paperRunnerConcurrency.test.ts`, `paperRunnerHistory.test.ts` e `paperSignalExecutionContract.test.ts`, dentro do Trading Paper existente: mocks sem o export `reconcileCanonicalPaperTradeRuns` e duas expectativas de histórico. Não envolvem qualquer ficheiro 3A. Não foram corrigidas porque Trading core está congelado. As regressões Trading diretamente relacionadas com a alteração (`tradingRouteAccess`, scanner refresh, paper daemon/settlement e execução do modo Trading no shared loop/routes) passaram.

## 7. Impacto nos modos permitidos

O único outro `AutopilotMode` existente é `trading`. Para Trading:

- target due continua a sincronizar;
- sync route continua a chamar shared sync e reconciliation;
- reconcile continua com e sem refresh;
- `portfolio_items` POST continua disponível;
- cron continua em `15 3 * * *`;
- entitlement/access resolution foi preservada nas entradas que já a utilizavam.

Não houve alteração em código `lib/trading/**`.

## 8. Limitações

- Não houve staging, produção, provider ou base PostgreSQL real; 3A é uma contenção unitária/integration-mocked.
- GETs legacy e `/api/daily-bundle` permanecem para a migração posterior; esta fase bloqueia writes/efeitos, não faz UI cutover.
- O reason code comum foi aplicado também a portfolio writes/FixNow conforme a decisão vinculativa, apesar de o nome mencionar broker sync.
- A suite global não está totalmente verde devido às seis falhas Trading acima; a Fase 3A não as amplia nem tenta corrigi-las.
- A validação autenticada residual de staging permanece dependência operacional, não falha desta boundary.

## 9. Gate 3A

| Critério | Estado |
|---|---|
| Investing não chega ao shared sync por entradas conhecidas | Provado nos testes 3A |
| Sem efeitos laterais legacy | Provado nos mocks/spies |
| Sem eventos falsos de execução | Provado |
| Modos permitidos preservados | Provado para Trading nos caminhos alterados |
| Tipagem/lint/regressões focadas | Verde |
| Suite total do repositório | 835 verdes; 6 falhas Trading fora do diff 3A |
| Live bloqueado | Inalterado |
| Migrations aplicadas | Não |

Declaração final:

- **Trading core modificado: não.**
- **Persistent Paper modificado: não.**
- **Live permanece bloqueado: sim.**
- **Research Lab modificado: não.**
- **Fase 3B iniciada: não; aguarda aceitação da Fase 3A.**
