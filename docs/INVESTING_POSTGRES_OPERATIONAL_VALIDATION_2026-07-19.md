# Validação operacional Investing — PostgreSQL real, concorrência e recovery

Data: 2026-07-19
Resultado global: **PARCIALMENTE PROVADO** — a persistência financeira local está fortemente provada; staging autenticado e crash de um processo worker separado não foram executados.

## 1. Resumo executivo

Foram instalados e usados PostgreSQL reais, recriadas bases vazias, aplicadas 26 migrations na ordem do repositório, executados testes SQL transacionais, RLS A/B, concorrência multi-sessão, failure injection, restart abrupto da base e recovery. Foram encontradas falhas reais e corrigidas apenas por migrations posteriores. Live permaneceu bloqueado e nenhum broker, VPS ou dado de produção foi usado.

## 2. Ambiente PostgreSQL usado

Estado: **PROVADO**.

- PostgreSQL 17.10, cluster portátil isolado em `artifacts/investing-postgres/pg17-validation-20260719`, loopback, porta 55433.
- PostgreSQL 17.10 adicional instalado como serviço local de teste, porta 55432.
- Supabase CLI 2.109.1; Docker não estava disponível, pelo que foi usada a alternativa PostgreSQL local dedicada.
- Node 24.13.0 e npm 11.8.0.
- Roles locais equivalentes a `anon`, `authenticated` e `service_role`; `auth.jwt()` lê claims isoladas de teste.
- Sem secrets de produção, broker, capital real ou ligação ao VPS.
- O `trust` está limitado ao loopback do cluster descartável; não é uma configuração a transportar para staging.

Comandos principais: `psql -v ON_ERROR_STOP=1 -f ...`, `pg_dump --schema-only --no-owner --no-privileges`, `node scripts/qa/runInvestingPostgresConcurrency.mjs`, `npx vitest run`, `npx tsc --noEmit`, `npm run lint` e `npm run build`.

## 3. Migrations aplicadas

Estado: **PROVADO**.

- 26 migrations aplicadas do zero, de `20260509090000_create_trading_scanner_snapshots.sql` a `20260719270000_investing_resolution_severity_vocabulary.sql`.
- Instalação final vazia: 4.043 ms, sem erro; os `NOTICE` eram `IF EXISTS`/`IF NOT EXISTS` esperados.
- Reinstalação independente e schema normalizado iguais: SHA-256 `8FBC177DFC2CA591A3997E5E015BFC7570F1A4C2E6522BB3324079EACB43C658`.
- Reaplicação das migrations novas suportadas passou; reaplicação transacional da migration de idempotência seguida de rollback deixou o schema igual.
- Base legacy mínima preservou settings, portfolio, snapshot e queue; não foi fabricada uma conta para a queue legacy com `account_id` nulo.
- Funções, triggers, checks, unique indexes, FKs, RLS, grants e revokes foram compilados/exercitados.
- Nenhuma migration antiga foi alterada para reparar uma base já migrada; as correções foram acrescentadas cronologicamente.

## 4. Correções necessárias após execução real

Estado: **PROVADO**.

1. O bootstrap standalone não reproduzia grants Supabase: corrigido apenas no harness local.
2. A reconciliação inseria um run append-only e tentava atualizá-lo: passou a calcular breaks antes do insert final.
3. Um fixture lançava valor em `cash` sem atualizar a projeção: corrigido para contas neutras de teste.
4. Recovery de `submitting` deixava reservas presas e queue incoerente: passou a libertar reservas e persistir evento/heartbeat.
5. Withdrawal, dividend, split, reverse split e reversal estavam incompletos: foram implementados com ledger e idempotência.
6. A quantidade esperada ignorava splits: agora ajusta fills históricos por corporate actions aplicadas.
7. Retry concorrente da mesma submissão criava uma ordem única, mas devolvia version conflict ao segundo caller: agora ambos recebem a ordem canónica e um recebe `replayed=true`.
8. Não havia resolução append-only de breaks: foi criada `investing_reconciliation_resolutions` e RPC que acrescenta resolução/evento sem reescrever o item/run.
9. O primeiro teste desta resolução encontrou `info` versus `informational`: corrigido por migration posterior `20260719270000`, sem editar a migration aplicada.

## 5. RPC permissions reais

Estado: **PROVADO**.

Todas as funções `SECURITY DEFINER` Investing foram enumeradas em `pg_proc`, verificadas com `PUBLIC/anon/authenticated = EXECUTE false` e `search_path=pg_catalog,public`. As RPCs legacy e a implementação interna de submit ficaram sem EXECUTE para `service_role`.

Resultados semânticos individuais: `open_paper_account_v2`, `record_daily_cycle_v2`, `record_approval_v2`, `submit_paper_order_v2`, `ack_paper_order_v2`, `record_paper_fill_v2`, `cancel_paper_order_v2`, `start_paper_reconciliation_v2`, `reconcile_paper_order_v2`, `record_ledger_transaction_v2`, `record_cash_movement_v2`, `reverse_cash_movement_v2`, `apply_split_v2`, `resolve_reconciliation_item_v2`, `recover_stuck_paper_v2` e `record_live_blocked_attempt_v2`: **PROVADO**. Parâmetros incoerentes, owner alheio, estado/versão incorretos, correlation inválida e reutilização conflitante foram rejeitados.

## 6. Resultados RLS A/B

Estado: **PROVADO**.

Users A e B, portfolios A/B e accounts A/B foram criados em PostgreSQL. A e B só leram os seus accounts, orders, fills, ledger, approvals, runs, items e resolutions. Nos dois sentidos foram rejeitados financiamento, fill e cancel sobre o outro owner; approval A sobre queue B também foi rejeitada. Foram exercitados sessão ausente, UUID aleatório e IDs válidos do outro owner.

## 7. Resultados Live bypass

Estado: **PROVADO** no ambiente local; staging permanece fora desta prova.

INSERT/UPDATE de account/order Live com `service_role` falhou no trigger; cash, orders, fills, positions e ledger ficaram inalterados. A tentativa aplicável persistiu `blocked_live_attempt`. API, worker, config, state machine, controls, paper adapter e adapter Live desativado rejeitaram `live` antes do efeito financeiro. Live não foi ativado.

## 8. Accounting e corporate actions

Estado: **PROVADO**.

Foram executados deposit, buy com fee/tax, sell parcial em dois fills, withdrawal, dividend, split, reverse split e reversal. O sell creditou `gross-fees-taxes`; quantity, reserved quantity, cash, cost basis e P&L seguiram os cálculos esperados. Todas as transações verificadas tinham pelo menos duas entries e débitos=créditos. Overdraw, posição negativa, ledger vazio/desbalanceado, duplicate fill/fee e payload idempotente conflitante foram rejeitados. Reversal compensou o efeito e preservou o histórico original.

## 9. Concorrência

Estado: **PROVADO**.

Run final `e4c4794b6899`, três ligações independentes, `lock_timeout=10s`, `statement_timeout=20s`:

| Corrida | Tempo | Resultado |
|---|---:|---|
| approve vs reject | 21 ms | 1 winner, 1 rejeição |
| dois daily cycles | 42 ms | 2 respostas, 1 efeito |
| dois submits/proposal | 38 ms | 1 winner, 1 rejeição |
| mesma idempotency key | 7 ms | 2 respostas, mesma ordem, 1 replay |
| fill duplicado/dois workers | 32 ms | 2 respostas, 1 fill/ledger |
| partial fills distintos | 45 ms | 2 efeitos válidos, ordem completa |
| dois reconciliation workers | 31 ms | 2 respostas, 1 run canónico |
| reservas cash concorrentes | 15 ms | 1 winner, sem overdraw |
| vendas concorrentes | 12 ms | 1 winner, sem posição negativa |

Sem deadlock, timeout não tratado ou efeito financeiro duplicado.

## 10. Rollback

Estado: **PROVADO**.

Failpoints transacionais foram injetados após/antes de order, reservation, event, position, segunda entry de ledger, reconciliation run e marcação reconciled. Todos produziram rollback total: sem order/fill/ledger/run parcial, sem reserva impossível e sem sucesso falso.

## 11. Persistent Paper end-to-end

Estado: **PROVADO** para o pipeline DB; dashboard HTTP autenticado **PARCIALMENTE PROVADO**.

Conta e funding reais, daily cycle, proposal, approval, submit, ack, partial fill, fill final, ledger, cash, position e reconciliation foram persistidos e validados passo a passo. A DB é a fonte canónica. O read model/dashboard tem testes TypeScript, mas não houve smoke autenticado contra PostgREST/Clerk staging.

## 12. Crash/restart recovery

Estado: **PARCIALMENTE PROVADO**.

O cluster portátil foi parado com `pg_ctl -m immediate` e reiniciado. Estados `submitting`, `submitted`, `partially_filled` e `reconciling` sobreviveram. Recovery converteu stale submitting/reconciling, libertou a reserva aplicável, preservou submitted/partial, atualizou heartbeat e gravou eventos. Depois do restart, as quatro linhas retomaram até reconciled; ficaram 5 fills distintos, posição 4, cost basis 400, cash 4600 e reserved 0. Não foi morto um processo Next worker separado em cada estado; por isso essa parte não é classificada como totalmente provada.

## 13. Reconciliação

Estado: **PROVADO**.

Cash, settled cash, reserved cash, position/corporate action, fee, tax, missing fill ledger, cumulative fill/order, queue e ledger imbalance criaram items append-only material/critical e impediram reconciled. Duplicados e órfãos foram rejeitados por unique/FK. Split correto reconciliou com expected quantity ajustada. `1` e `1.0` foram tratados como numericamente equivalentes num item informational de run passado. Resolução cria nova row e novo evento; o failed run/item original permanece inalterado. Reconciled só ocorreu com zero breaks materiais.

## 14. Build

Estado: **PROVADO**.

`npm run build` terminou com exit 0 em 1.147,9 s (19m08s): compile, TypeScript e 30 páginas concluídos. Houve cinco warnings de file tracing no arquivo histórico Research/Trading já existente; não foram corrigidos porque Trading estava congelado.

## 15. Staging smoke

Estado: **NÃO PROVADO**.

Não existiam projeto/credentials isolados de staging, PostgREST/Clerk staging nem autorização para deploy. `.env.local` não foi reutilizado por poder apontar a produção. Não houve deploy, smoke autenticado Today/Plan/Portfolio/Advisor/Autonomy nem worker staging.

## 16. Testes executados

Estado: **PROVADO**, exceto staging.

- 4 scripts SQL reais: P0/P1; security/RLS/Live/accounting; rollback/recovery; reconciliation breaks/resolutions.
- 9 corridas concorrentes em PostgreSQL.
- 29 ficheiros de escopo Investing/manual lifecycle/daily view model.
- TypeScript, ESLint global, diff check, build e suite global.
- Workflow `.github/workflows/investing-postgres.yml` aplica migrations do zero e corre SQL + concorrência automaticamente.

## 17. Número de testes passados/falhados/ignorados

- Escopo Investing: 29 ficheiros, **95 passed, 0 failed, 0 skipped**.
- SQL PostgreSQL: **4 scripts passed, 0 failed** na instalação vazia final.
- Concorrência: **9 cenários passed, 0 failed**.
- Suite global: **230 ficheiros passed, 3 failed, 15 skipped**; **801 testes passed, 6 failed, 22 skipped**.
- TypeScript: passed. ESLint global: passed. Build: passed.

## 18. Falhas restantes

Estado: **PARCIALMENTE PROVADO**.

Permanecem as seis falhas Trading autorizadas como baseline, em `paperRunnerConcurrency`, `paperRunnerHistory` e `paperSignalExecutionContract`, ligadas a mocks/expectativas de `reconcileCanonicalPaperTradeRuns`. Não foram tocadas. `npm audit` reporta 12 vulnerabilidades do grafo atual (2 low, 4 moderate, 5 high, 1 critical); não foi aplicado fix automático fora do escopo.

## 19. Itens não provados

Estado: **NÃO PROVADO** para os itens abaixo.

- Deploy e smoke autenticado num staging persistente.
- Crash deliberado de um processo worker Next separado em cada estado intermédio.
- Integração HTTP real do dashboard com Clerk/PostgREST staging.
- Execução do novo workflow num runner GitHub remoto; o ficheiro foi criado e validado localmente.

## 20. Classificação

| Área | Classificação |
|---|---|
| Recommendation | PROVADO |
| Simulation | PROVADO |
| Persistent Paper | PROVADO no pipeline DB; PARCIALMENTE PROVADO no dashboard HTTP |
| Accounting | PROVADO |
| Security | PROVADO localmente |
| Recovery | PARCIALMENTE PROVADO |
| Staging | NÃO PROVADO |
| Live blocking | PROVADO localmente |

## 21. Declaração Trading

Trading core modificado: não.

As alterações Trading/Research que aparecem no worktree já existiam e foram preservadas; esta validação não lhes escreveu.

## 22. Limites da conclusão

O resultado não ultrapassa a evidência executada. A ausência de staging e do crash de processo worker impede classificar a tarefa inteira como totalmente provada.

## 23. Veredicto

**PARCIALMENTE PROVADO**. PostgreSQL, migrations, permissions, RLS, accounting, concorrência, rollback, persistência DB, restart DB, reconciliação material e Live block local têm evidência executada. Staging e crash de worker separado continuam **NÃO PROVADO/PARCIALMENTE PROVADO** conforme descrito.
