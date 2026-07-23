# Validação final Investing — staging autenticado e crash recovery de worker

Data: 2026-07-20
Fonte de verdade anterior: `docs/INVESTING_POSTGRES_OPERATIONAL_VALIDATION_2026-07-19.md`
Resultado global: **PARCIALMENTE PROVADO** — o worker separado e o Persistent Paper em PostgreSQL real ficaram provados; o fluxo autenticado de staging ficou provado até aprovação e submissão fail-closed, mas não até `reconciled` porque o staging não dispunha de uma cotação fresca e isolada.

Estado de governação: validação aceite em 2026-07-20; núcleo operacional Investing congelado. O item residual da secção 17 não bloqueia a auditoria do Investing Engine.

## 1. Resumo executivo

Foi criado um Supabase Preview persistente sem dados, aplicado o schema Investing completo, publicado um Vercel Preview e usada uma sessão Clerk real. No browser foram confirmados plano, abertura e financiamento de account Paper, ciclo canónico, proposta, supervisão e aprovação. A tentativa de submissão foi recusada com `investing_market_quote_unavailable`; não criou ordem nem reserva e não foi contornada com mock, segredo de produção ou relaxamento da freshness policy.

Na mesma base PostgreSQL real foi executado um worker Node/Next independente da aplicação. Foram mortos processos reais com `SIGKILL` em `submitting`, `submitted`, `partially_filled` e `reconciling`; os restarts reconstruíram o estado pela DB, sem ordens, fills, ledger ou reservas duplicados. O artefacto canónico é `artifacts/investing-worker-crash/afbf7a3e726e/report.json`.

## 2. Ambiente staging usado

Estado: **PROVADO**.

- Supabase branch persistente `investing-staging-20260719`, ref `jrpjcrovnntzapmfjpga`, região `eu-west-1`, compute `nano`, criada sem clone de dados.
- Vercel Preview `dpl_56SZdYtYpyAru2J448otwY1w8Kmm`, estado `Ready`, URL `https://signalcore-site-ko5w7jv4l-nunos-projects-5ce64860.vercel.app`.
- Clerk em instância de teste, com login Google real; nenhuma cookie, password ou token foi guardado no relatório.
- PostgreSQL 17 no staging; Node 24.13.0, npm 11.8.0, Vercel CLI 56.3.2 e Supabase CLI 2.109.1 no cliente de validação.
- Variáveis necessárias, apenas por nome: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`/`INVESTING_TEST_DATABASE_URL`, variáveis Clerk de teste, `INVESTING_OWNER_USER_ID` e configuração Paper do worker.
- `INVESTING_OWNER_USER_ID` foi definido apenas no ambiente Preview a partir do utilizador de teste autenticado. Não foi copiada configuração de owner, broker, TwelveData ou Live de produção.
- A ligação do harness Node ao pooler usou TLS com `sslmode=no-verify` devido à cadeia apresentada no ambiente de execução. A consulta final com `psql` usou `sslmode=require`. Existe encriptação de transporte, mas o harness Node não provou validação completa da cadeia do certificado.

## 3. Smoke autenticado

Estado: **PARCIALMENTE PROVADO**.

- Login Clerk real: **PROVADO**.
- Aplicação Investing e dashboard Daily autenticados: **PROVADO**.
- Plano ativo persistido para o utilizador de teste: **PROVADO**.
- Account Paper `777404df-57c2-45db-9d60-9d7d81cb71dc`, portfolio `primary`, EUR, estado `active`: **PROVADO**.
- Funding persistido: EUR 10.000 disponíveis/settled, EUR 0 reservados: **PROVADO**.
- Ciclo canónico, proposta, retry governado, cockpit owner e aprovação: **PROVADO**.
- Dashboard `/ops/investing` autenticado após deploy: **PROVADO**; mostrou zero aprovações pendentes, lifecycle persistido e reconciliações passadas dos cenários de QA.
- Percurso individual documentado por Today, Plan, Portfolio, Advisor e Autonomy, com matriz HTTP/correlation por passo: **NÃO PROVADO**. Não foi fabricado um registo retroativo desses cliques.

O browser apenas disparou APIs. A decisão canónica, queue, versões e aprovação foram calculadas/persistidas server-side. Guardar/criar o ciclo não submeteu ordens. A UI não mostrou `filled` ou `reconciled` para o fluxo autenticado, porque nenhuma ordem foi criada.

## 4. Fluxo Paper ponta a ponta

Estado: **PROVADO** operacionalmente em DB/worker; **PARCIALMENTE PROVADO** numa única sessão HTTP autenticada.

Fluxo autenticado observado:

1. A primeira queue `a5ad2a26-d7a2-477d-88ad-84650a64e551` foi bloqueada/rejeitada por `turnover_outside_policy_cap`.
2. Após a correção reproduzível para alocação inicial, o retry criou `a9a972d9-f16d-4d53-85ae-ebca75816e4f` em `awaiting_approval`, `manual_execute`, kill switch desligado e version 1.
3. O owner autenticado aprovou a queue; ficou `approved`, approval `approved`, version 2, com exatamente uma linha append-only no approval ledger.
4. `Submit AGGH to Paper` chamou a API Paper real. A API devolveu `investing_market_quote_unavailable` e falhou fechada.
5. Snapshot PostgreSQL posterior: zero orders nessa account, EUR 0 reserved e zero efeitos Live.

O lifecycle completo submit → partial fill → fill → ledger → cash/position → reconciliation foi provado na mesma base pelo worker separado e pelas RPCs reais. Não é apresentado como se tivesse ocorrido para a queue autenticada.

## 5. Worker separado

Estado: **PROVADO**.

- Arranque: `npm run investing:worker` ou `node scripts/investing/runPersistentPaperWorker.mjs`.
- Processo Node independente da aplicação web e do worker Trading.
- Lê trabalho persistido de PostgreSQL; não usa memória local como fonte de recovery.
- Expõe health HTTP loopback, persiste heartbeat, emite logs JSON com `worker_name`, PID, estado, order ID e `correlation_id`.
- Política exercitada: kill deliberado, restart com novo PID, processamento até terminal e segundo restart idempotente.
- Método de crash: `SIGKILL` dirigido ao PID capturado pelo harness.

## 6. Crash em `submitting`

Estado: **PROVADO**.

- PID morto: `16012`; restart: `16236`.
- Antes/depois do kill permaneceu uma única ordem em `submitting`, com EUR 100 reservados e zero fills.
- O restart detetou uma operação stale, gravou um recovery event, libertou a reserva e terminou em `submission_failed` de forma segura.
- Resultado: uma ordem, zero fills, zero ledger parcial, EUR 0 reserved e um recovery event. Um segundo restart não alterou o resultado.

## 7. Crash em `submitted`

Estado: **PROVADO**.

- PID morto: `13376`; restart: `13348`.
- O estado `submitted` persistiu após o kill e não voltou a ser submetido.
- O restart gravou um único fill, um único ledger de fill, uma reconciliation run e terminou order/queue em `reconciled`.
- Resultado: cash EUR 900 settled/disponível, EUR 0 reserved, posição 1 e cost basis EUR 100; segundo restart sem novo efeito.

## 8. Crash em `partially_filled`

Estado: **PROVADO**.

- PID morto: `9468`; restart: `10432`.
- O partial fill existente foi preservado. O restart completou apenas a quantidade restante.
- Resultado: dois fills sem duplicação, uma posição final de 1, cost basis EUR 100, EUR 0 reserved, ledger balanceado e estado final `reconciled`.
- O replay do mesmo fill foi reconhecido como replay e não criou novo fill, fee, tax ou lançamento.

## 9. Crash em `reconciling`

Estado: **PROVADO**.

- PID morto: `11236`; restart: `12064`.
- Ordem e queue permaneceram em `reconciling` após o kill.
- O restart detetou a run incompleta, persistiu recovery, criou/concluiu uma run canónica com zero breaks e só então marcou `reconciled`.
- Resultado: uma run, um recovery event, um fill, posição 1, EUR 0 reserved, zero ledger desbalanceado; segundo restart idempotente.

## 10. Testes de duplicação e ambiguidade

Estado: **PROVADO**.

- Mesmo fill repetido: `replayed=true`, uma única consequência financeira.
- Evento fora de ordem: rejeitado explicitamente.
- Mesmo submit/idempotency key: uma ordem lógica e replay canónico.
- Restarts repetidos: estados e contagens permaneceram iguais.
- `submitting` ambíguo: bloqueio seguro em `submission_failed`, nunca assumido como submitted.
- Todos os cenários terminaram com `unbalanced=0` e pelo menos duas entries por transação financeira aplicável.

## 11. Teste de dois workers

Estado: **PROVADO**.

Os PIDs `6336` e `18216` arrancaram simultaneamente sobre a mesma ordem `submitted`. Um worker adquiriu o trabalho; o outro ficou idle. Estado final: uma ordem, um fill, uma fill transaction, uma reconciliation run, cash EUR 900, posição 1, cost basis EUR 100 e EUR 0 reserved. Não houve deadlock ou efeito duplicado.

## 12. Live bypass

Estado: **PROVADO** no staging isolado.

- Os quatro scripts SQL reais exerceram triggers, constraints, RPCs, RLS e tentativas Live.
- O worker iniciado com payload Live terminou com exit 1 e `investing_live_execution_blocked`.
- API/adapter/config/state machine e inserts/updates/RPCs Live foram rejeitados antes do efeito financeiro.
- Snapshot final do staging: zero accounts Live, zero orders Live e zero fills Live.
- Nenhum broker real, capital real ou segredo de produção foi usado.

## 13. Observabilidade

Estado: **PROVADO** para o worker; **PARCIALMENTE PROVADO** para a matriz HTTP pedida.

O artefacto `afbf7a3e726e` contém timestamps, PIDs, health responses, heartbeats, correlation IDs, order claims, pontos de hold, signals de kill, recovery, fills e reconciliation outcomes. Stuck detection foi exercitada em `submitting` e `reconciling`. O dashboard autenticado apresentou os estados persistidos e zero aprovações pendentes.

Os totais do cockpit incluem fixtures dos testes SQL, concorrência e crash recovery; por isso não representam apenas o utilizador do smoke. O fluxo autenticado foi isolado por account/queue IDs nas consultas finais. Não foi construída uma tabela completa de status HTTP e correlation ID para cada um dos 22 passos do pedido: **NÃO PROVADO** nesse nível de granularidade.

## 14. Build e deploy

Estado: **PROVADO**, com restart PostgreSQL gerido fora do escopo do Preview.

- Build completo local anterior: exit 0.
- Deploy Vercel final: `Ready`, Preview `dpl_56SZdYtYpyAru2J448otwY1w8Kmm`.
- Smoke autenticado repetido depois do deploy final; `/ops/investing` carregou a sessão owner e os dados do Supabase branch.
- Processos worker foram efetivamente mortos e reiniciados em todos os cenários.
- A persistência após restart abrupto de PostgreSQL já estava provada no relatório fonte local.
- Não foi reiniciado o serviço Supabase gerido da branch, porque esse controlo não é exposto como uma operação segura de aplicação: **NÃO PROVADO** no serviço remoto.
- Os warnings de tracing Trading/Research do build eram baseline e não foram alterados.

## 15. Testes executados

Estado: **PROVADO**.

- Branch Supabase: quatro suites SQL — `investing_p0_p1.sql`, `investing_security_accounting.sql`, `investing_rollback_recovery.sql` e `investing_reconciliation_breaks.sql` — todas passaram.
- Concorrência PostgreSQL: 9/9 cenários, run `7b3d121e4f6f`.
- Worker crash: 4/4 crashes, dois workers, replay/out-of-order e Live block, run `afbf7a3e726e`, `ok=true`.
- Suite Investing final: 27 ficheiros, 80 testes passed, 0 failed, 0 skipped.
- TypeScript `npx tsc --noEmit`: passed.
- ESLint dirigido aos ficheiros alterados: passed.
- `git diff --check`: sem erro; apenas avisos de conversão LF/CRLF no Windows.
- Vercel build/deploy final: passed.

## 16. Falhas encontradas e corrigidas

Estado: **PROVADO**.

1. O botão `Apply Starter Pack` era resolvido como link para a própria página e não chamava a API. A prioridade da ação foi corrigida.
2. A UI exigia holdings antes de permitir criar a primeira proposta, embora a account Paper já estivesse financiada. O funding Paper passou a desbloquear a proposta canónica.
3. A alocação inicial, composta apenas por buys com peso atual zero, ativava kill switch por turnover e impossibilitava supervisão. Foi corrigida para continuar em review/approval sem desligar os bloqueios de instrumento; foi adicionado teste de regressão.
4. Uma proposta bloqueada no mesmo dia não tinha caminho de retry idempotente. Foi acrescentado retry com request ID estável e versão da queue.
5. Não existia ação autenticada explícita para submeter uma queue aprovada ao Persistent Paper. Foi adicionada, preservando API, versionamento e idempotency key.
6. As funções Supabase com `search_path` restrito não encontravam `digest`. A migration `20260719290000_investing_pgcrypto_schema_qualification.sql` qualificou `extensions.digest`.
7. A idempotência semântica de fills e o recovery de worker foram fechados pelas migrations/scripts já descritos no artefacto.

Nenhuma destas correções habilitou Live, adicionou Research Lab ou alterou o worker Trading.

## 17. Item residual de validação

Estado: **NÃO PROVADO**, não bloqueador da fase seguinte.

> Repetir em janela de mercado, com fonte de cotação isolada própria de staging, o fluxo autenticado da queue aprovada desde submit até partial fill, fill e reconciled, preservando todas as políticas atuais.

Não usar preço inventado, mock de provider, dado ou secret de produção, nem reduzir a freshness policy para concluir este item. A branch de staging, o Preview e os artefactos necessários devem ser preservados até à execução.

## 18. Classificação final

| Área | Classificação | Evidência |
|---|---|---|
| Staging autenticado | PARCIALMENTE PROVADO | Login, account, funding, proposal, aprovação, submit fail-closed e cockpit reais; lifecycle terminal da mesma sessão não concluído |
| Persistent Paper | PROVADO operacionalmente; PARCIALMENTE PROVADO na sessão autenticada | DB/worker completos; browser até aprovação/fail-closed |
| Worker recovery | PROVADO | Quatro `SIGKILL`, restart e segundo restart |
| Accounting | PROVADO | Cash, posição, fills e ledger balanceado |
| Reconciliation | PROVADO | `reconciled` apenas com zero breaks materiais |
| Live blocking | PROVADO | DB/API/worker/config bloqueados; zero efeitos Live |

## 19. Declaração Trading

As alterações Trading/Research já existentes no worktree foram preservadas e não fazem parte desta validação. Nenhum ficheiro `lib/trading/**`, worker Trading, adapter Trading, schema Trading ou Paper Trading foi escrito por esta tarefa.

Trading core modificado: não.

## 20. Limites da conclusão

Este relatório não usa as expressões “100% confiável” ou “production ready”. A classificação respeita a evidência observada: uma falha fechada por falta de cotação é um resultado correto de segurança, mas não substitui a prova de um lifecycle terminal autenticado. O artefacto do worker prova esse lifecycle com dados Paper isolados e persistência real, não com a identidade do smoke.

## 21. Veredicto

**Worker crash recovery: PROVADO. Persistent Paper: PROVADO operacionalmente. Live blocking: PROVADO. Staging autenticado ponta a ponta até `reconciled`: PARCIALMENTE PROVADO.**

As duas lacunas técnicas foram substancialmente fechadas: há autenticação/deploy real e há crash recovery real de processo separado. A única lacuna de aceitação restante é repetir, em janela de mercado e com uma fonte de cotação própria de staging, o submit autenticado da queue aprovada até `reconciled`, sem reutilizar segredos ou dados de produção.

Trading core modificado: não.
