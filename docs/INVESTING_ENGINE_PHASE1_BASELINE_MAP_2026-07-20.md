# Investing Engine — FASE 1: baseline e mapa global

Data: 2026-07-20
Modo: discovery factual, zero alterações ao engine
Prompt de referência: `SYNTRAKE INVESTING DISCOVERY AUDIT — FASE 1, MAPA GLOBAL DA PLATAFORMA`
Estado: **FASE 1 CONCLUÍDA**

## 1. Mandato e fronteiras desta fase

Esta fase inventaria o que existe e quem o utiliza. Não corrige, redesenha ou melhora código. O núcleo operacional Investing aceite em `docs/INVESTING_STAGING_WORKER_VALIDATION_2026-07-20.md` está congelado.

Restrições observadas:

- nenhum ficheiro do engine foi alterado;
- nenhum ficheiro Trading foi alterado;
- Live não foi ativado;
- Research Lab não foi construído;
- engine e execução são descritos como camadas separadas;
- staging, Preview e artefactos operacionais foram preservados;
- não há worker Investing ativo nem PostgreSQL portátil ativo no fim da descoberta.

A limitação residual do smoke autenticado é uma dependência futura de validação, não uma falha do engine. Está referenciada na secção 16.

## 2. Identificação reproduzível do baseline

| Campo | Valor observado |
|---|---|
| Git `HEAD` | `bcc72bc6aed514565b83f6b49b50aec98c316f46` |
| Estado do worktree | não limpo; inclui a implementação Investing validada e alterações alheias já existentes |
| Ficheiros `lib/investing/**` | 36 |
| Fingerprint dos paths + conteúdo de `lib/investing/**` | `f5d10a147bd3a9c3765e2375c671e40f4c38033aa1b95c2fd411eb0bf4eada2b` |
| Node | `v24.13.0` |
| npm | `11.8.0` |
| Versões persistidas pelo ciclo | `investing_mandate_v2`, `investing_policy_v2`, `investing_model_v2` |
| Staging PostgreSQL | Supabase branch `jrpjcrovnntzapmfjpga` |
| Preview preservado | `dpl_56SZdYtYpyAru2J448otwY1w8Kmm` |
| Artefacto worker preservado | `artifacts/investing-worker-crash/afbf7a3e726e/report.json` |

O commit isoladamente não identifica este baseline porque vários ficheiros Investing ainda são modificados ou não rastreados. O fingerprint acima identifica o conteúdo efetivamente auditado.

## 3. Topologia global encontrada

```text
Clerk + RootLayout
        |
        v
/app -> AppShell -> modo Investing
        |-- Today ------> /api/investing/dashboard
        |                  -> runtimeAdapter -> mandate/construction/rebalance/
        |                     benchmark/costs/governance/research
        |                  -> tabelas investing_*
        |-- Plan --------> /api/daily-bundle + plans/user_settings/portfolio_items
        |-- Portfolio ---> /api/portfolio-items + /api/fix-now/run + daily-bundle
        |-- Advisor -----> /api/daily-bundle
        `-- Autonomy ----> daily-bundle + APIs broker/fix-now/daily-close legacy

Today -> /api/investing/daily-cycle -> engine canónico -> RPC atómica
     -> queue -> /api/ops/investing/approvals -> approval
     -> /api/investing/paper/orders -> quote fresca -> ordem Paper
     -> worker Node separado -> fills -> accounting -> reconciliation
```

O produto atual contém duas superfícies de dados Investing simultâneas:

1. **Canónica financeira**: `lib/investing/**`, APIs `/api/investing/**` e tabelas `investing_*`.
2. **Shared/legacy de produto**: `user_settings`, `plans`, `portfolio_items`, `daily_snapshots`, `journal_entries`, `daily-bundle`, `fix-now` e broker genérico.

O Today já lê a primeira. Plan, Portfolio, Advisor e Autonomy ainda leem materialmente a segunda. Isto é uma descrição do baseline, não uma proposta de alteração.

## 4. Páginas, layouts e navegação

| Elemento | Responsabilidade observada | Localização | Consumidor/entrada | Estado |
|---|---|---|---|---|
| Root layout | Clerk, idioma, GTM, fonts e shell global | `app/layout.tsx` | todas as páginas | ATIVO, shared |
| App page | monta o cockpit cliente | `app/app/page.tsx` | `/app` | ATIVO |
| AppShell | autenticação cliente, modo, entitlements, navegação e seleção de tabs | `app/app/ui.tsx` | `/app?mode=investing` | ATIVO, shared com Trading |
| Navigation model | define as views Investing `daily`, `planning`, `portfolio`, `advisor`, `autonomy` | `app/app/navigationModel.ts` | AppShell | ATIVO |
| Workspace identity | copy e links de identidade do workspace | `app/app/workspaceIdentity.ts`, `WorkspaceIdentityRail.tsx` | AppShell | ATIVO, apresentação |
| First-value model | progresso inicial de setup | `app/app/firstValue.ts` | AppShell | ATIVO, apresentação |
| Today | dashboard canónico, account Paper, ciclo, retry e submit | `app/app/tabs/DailyTab.tsx` | AppShell | ATIVO, CANÓNICO para o novo runtime |
| Plan | objetivos, risco, horizonte, contribuições e cenários | `app/app/tabs/PlanningTab.tsx` | AppShell | ATIVO, SHARED/LEGACY na persistência |
| Portfolio | holdings, valuation e FixNow | `app/app/tabs/PortfolioTab.tsx` | AppShell | ATIVO, SHARED/LEGACY na persistência |
| Advisor | interpretação do daily bundle e orientação | `app/app/tabs/AdvisorTab.tsx` | AppShell | ATIVO, SHARED/LEGACY |
| Autonomy | setup/automações/broker genérico e close diário legacy | `app/app/tabs/AutonomyTab.tsx` | AppShell | ATIVO, SHARED/LEGACY |
| Daily decision VM | semântica da decisão e fallback directive Investing | `app/app/tabs/dailyDecisionViewModel.ts` | Today/Advisor/Autonomy | ATIVO |
| Advisor decision VM | view model Advisor | `app/app/tabs/advisorDecisionViewModel.ts` | Advisor | ATIVO |
| Autonomy decision VM | view model Autonomy | `app/app/tabs/autonomyDecisionViewModel.ts` | Autonomy | ATIVO |
| Daily view models | composição de secções do Today | `app/app/tabs/dailyViewModels.ts` | UI Daily histórica/auxiliar | PARCIALMENTE ATIVO |
| Decision stability hook | estabiliza apresentação cliente | `app/app/tabs/decisionStability.ts` | Today/Advisor/Autonomy | ATIVO, UI only |
| `/app/daily` | redirect para `/app?tab=daily` | `app/app/daily/page.tsx` | links antigos | ATIVO como redirect |
| `DailyPageClient`/`DailyClient` | implementação Daily alternativa | `app/app/daily/DailyPageClient.tsx`, `DailyClient.tsx` | não importada pela page atual | ÓRFÃO/INACESSÍVEL pela rota atual |
| `/app/portfolio` | redirect para tab Portfolio | `app/app/portfolio/page.tsx` | links antigos | ATIVO como redirect |
| Offline setup | recolhe inputs e grava setup/local storage | `app/app/offline-setup/**` | fluxo auxiliar | ATIVO, SHARED/LEGACY |
| Broker page | configuração genérica de broker | `app/app/broker/**` | superfície auxiliar | ATIVO, shared; não é execução Paper canónica |
| Ops Investing | cockpit histórico e aprovação owner | `app/ops/investing/page.tsx` | `/ops/investing` | ATIVO, CANÓNICO |

Não existe um layout dedicado exclusivamente ao Investing; o módulo usa o root layout e o AppShell partilhados.

## 5. Componentes, hooks, providers, stores e contexts

| Categoria | Elemento | Uso observado | Estado |
|---|---|---|---|
| Provider | `ClerkProvider` | identidade/autenticação | ATIVO, shared |
| Provider/context | `SiteLanguageProvider` | idioma e copy | ATIVO, shared |
| Hook | `useUser` | sessão no AppShell/Advisor | ATIVO, shared |
| Hook | `useAccess` | tier/entitlements | ATIVO, shared |
| Hook | `useAutopilotMode` | modo Investing/Trading | ATIVO, shared |
| Hook | `useUserSettings` | setup e preferências | ATIVO, shared |
| Component | `InvestingOperatingLoopRail` | mostra etapas Plan → Portfolio → Today → Review | ATIVO |
| Component | `InvestingApprovalControls` | approve/reject versionado | ATIVO no Ops |
| Components shared | `CockpitShell`, `MoneyPill`, `ProofRail`, `DailyHtmlDashboard` | estrutura e apresentação | ATIVO, shared |
| Store servidor | `user_settings` | risco, horizonte, objetivo, modo e broker legacy | ATIVO, shared |
| Store servidor | `plans` | plano Investing ativo | ATIVO, shared e input canónico |
| Store cliente | `sc_wealth_plan_v1`, `sc_goal_quiz_v1` | seed/UI de planeamento | ATIVO, não canónico financeiro |
| Store cliente | `sc_starter_budget_v1` | budget inicial de UI | ATIVO, não canónico financeiro |
| Store cliente | `sc_hands_free_fixnow_v1`, `sc_broker_connection_v1` | Autonomy/FixNow/broker legacy | ATIVO, shared/legacy |
| Store cliente | `sc_first_advisor_intro_seen_v1`, `sc_starter_warmup_v1` | estado de apresentação | ATIVO, UI only |

Não foi encontrado um React context ou store cliente dedicado ao estado financeiro canónico Investing. Cash, positions, orders, fills e queue são lidos do servidor.

Há duas implementações do resumo do operating loop: `lib/investing/ui/operatingLoop.ts` é usada pelo Today; `lib/signalcore/investingOperatingLoop.ts` é usada por Plan e Advisor.

## 6. APIs dedicadas Investing

Foram encontrados 9 ficheiros de rota dedicados, com 12 handlers HTTP.

| Rota | Métodos | Responsabilidade | Consumidor | Estado |
|---|---|---|---|---|
| `/api/investing/dashboard` | GET | read model canónico do utilizador | Today | ATIVO |
| `/api/investing/daily-cycle` | POST | recomputar engine e persistir ciclo/mandate/rebalance/research/queue | Today | ATIVO |
| `/api/investing/paper/accounts` | GET/POST | listar ou abrir/financiar account Paper | Today/API | ATIVO |
| `/api/investing/paper/accounts/[accountId]/movements` | POST | deposit, withdrawal, dividend e reversal | API | ATIVO, sem UI principal encontrada |
| `/api/investing/paper/orders` | GET/POST | listar e submeter queue aprovada | Today/API | ATIVO |
| `/api/investing/paper/orders/[orderId]` | POST | cancel ou reconciliation manual | API | ATIVO, sem controlo principal encontrado no AppShell |
| `/api/investing/paper/worker` | GET/POST | health/recover/process/split com worker secret | operador/worker HTTP | ATIVO, não agendado por Vercel |
| `/api/ops/investing` | GET | audit cockpit owner/local QA | Ops | ATIVO |
| `/api/ops/investing/approvals` | GET/POST | queue pendente e decisão atómica | Ops/ApprovalControls | ATIVO |

Todas usam runtime Node e `no-store`. As rotas do utilizador obtêm identidade por `getRequestUserId`; as mutações financeiras chamam RPCs server-side. A rota worker usa segredo próprio e comparação constant-time.

## 7. APIs shared/legacy ainda consumidas pelo modo Investing

| Rota | Consumidor Investing | Dados/efeito observado | Estado no baseline |
|---|---|---|---|
| `/api/daily-bundle` | Plan, Advisor, Autonomy; código legado adicional | agrega `user_settings`, `plans`, `portfolio_items`, snapshots, engine genérico e também chama `buildInvestingRuntimeSnapshot` | ATIVO, SHARED/LEGACY |
| `/api/plans` | Plan | `plans` | ATIVO, input também usado pelo engine canónico |
| `/api/user-settings` | Plan/setup/AppShell | `user_settings` | ATIVO, input também usado pelo engine canónico |
| `/api/portfolio-items` | Portfolio | holdings legacy | ATIVO, não é `investing_positions` |
| `/api/portfolio-items/reset` | Plan/Portfolio/Autonomy | substituição de holdings legacy e journal | ATIVO, SHARED/LEGACY |
| `/api/fix-now/run` | Portfolio/Autonomy | escreve `portfolio_items` e journal com engine genérico | ATIVO, SHARED/LEGACY |
| `/api/daily/close` | Autonomy | `daily_snapshots` e `journal_entries` | ATIVO, SHARED/LEGACY |
| `/api/broker/status`, `/connect`, `/disconnect` | Autonomy | configuração broker genérica | ATIVO, SHARED/LEGACY |
| `/api/broker/sync` | chamada presente em Autonomy | rejeita explicitamente modo Investing com HTTP 410 | RETIRADO para Investing |
| `/api/engine/loop` | cron Vercel genérico | percorre modos ativos e chama sync broker partilhado | ATIVO, SHARED/LEGACY |

## 8. Mapa dos módulos e motores em `lib/investing`

| Módulo/motor | Responsabilidade observada | Consumidor real | Estado |
|---|---|---|---|
| `types.ts` | contratos de mandato, benchmark, construção, rebalance e execução | todos os motores | ATIVO |
| `mandate.ts` | targets por risco/objetivo/horizonte, drift, concentração, turnover e cash reserve | benchmark, construction, costs, governance | ATIVO |
| `instrumentMaster.ts` | universo estático VWCE, SPY, AGGH e GLD com scores/metadados | runtime/dashboard/daily cycle | ATIVO, estático em código |
| `construction.ts` | score determinístico e target allocations com caps | runtimeAdapter | ATIVO |
| `rebalancing.ts` | drift, buy/sell/hold, delta e gross turnover | runtimeAdapter | ATIVO |
| `benchmark.ts` | benchmark por mandato | runtimeAdapter | ATIVO; o próprio output declara que não é benchmark total-return validado |
| `costs.ts` | fee/slippage/tax/turnover heurísticos | runtimeAdapter | ATIVO |
| `governance.ts` | suitability, autonomy, approval, kill switch e deployable cap | runtimeAdapter | ATIVO |
| `research.ts` | scorecards e validação relativa ao benchmark | runtimeAdapter | ATIVO como evidence/validation; não é Research Lab |
| `execution.ts` | transforma governance/rebalance em hold, blocked, manual ou paper | dailyCycle | ATIVO, separado da submissão |
| `runtimeAdapter.ts` | orquestra os motores acima num snapshot | dashboard, dailyCycle e daily-bundle legacy | ATIVO, ORQUESTRADOR CANÓNICO |
| `persistence.ts` | fingerprints e rows de mandate/rebalance/research/queue | dailyCycle e reconciliation | ATIVO |
| `historyAudit.ts` | agrega histórico persistido para Ops | opsAudit | ATIVO |
| `opsAudit.ts` | lê tabelas de auditoria e lifecycle | Ops page/API | ATIVO |
| `server/dashboard.ts` | read model canónico com quotes e runtime | dashboard API | ATIVO |
| `server/dailyCycle.ts` | reads, recomputação server-side e RPC atómica | daily-cycle API | ATIVO |
| `server/persistentPaper.ts` | submit/ack/fill/recovery/health | orders e worker API | ATIVO |
| `server/cashAndCorporateActions.ts` | cash movements, reversals e splits | movements/worker API | ATIVO |
| `server/config.ts` | força environment Paper e parametriza fees/tax/fill | APIs/worker server | ATIVO |
| `repository/admin.ts` | cliente Supabase service-role com validação de env | serviços server | ATIVO |
| `repository/owner.ts` | autorização owner de Ops | página/API Ops | ATIVO |
| `money/decimal.ts` | aritmética decimal string/BigInt | server, accounting e adapters | ATIVO |
| `reconciliation.ts` | reconciliação de intent com snapshot broker e helpers accounting | `lib/broker/sync.ts` + testes | PARCIAL: caminho broker legacy + funções test-only |
| `reconciliation/types.ts` | contratos de breaks | reconciliation | ATIVO como contratos |
| `accounting/ledger.ts` | drafts e balanço de ledger em TypeScript | testes | TEST-ONLY; accounting operacional está nas RPCs SQL |
| `execution/controls.ts` | pre-trade controls em TypeScript | testes | TEST-ONLY; controlos operacionais estão nas RPCs SQL |
| `execution/stateMachine.ts` | transições TypeScript e hard block Live | testes | TEST-ONLY; lifecycle operacional está nas RPCs SQL |
| `broker/types.ts` | contratos de adapter | adapters/testes | ATIVO como contratos |
| `broker/paper-adapter.ts` | broker Paper in-memory com failure modes | testes | TEST-ONLY, não persistente |
| `broker/disabled-live-adapter.ts` | adapter que rejeita Live | testes | TEST-ONLY/GUARD |
| `broker/symbols.ts` | normalização de símbolo | reconciliation | ATIVO |
| `historical-market-data/reader.ts` | interface read-only e writer desativado | nenhum consumidor encontrado | INTERFACE/GUARD, sem implementação concreta |
| `ui/directives.ts` | fallback directive Today | dailyDecisionViewModel | ATIVO como fallback UI |
| `ui/decisionImpact.ts` | apresentação de impacto | Today | ATIVO, UI only |
| `ui/operatingLoop.ts` | resumo de loop canónico | Today | ATIVO, UI only |
| `index.ts` | barrel público | daily-bundle e testes | ATIVO |

## 9. Motores que existem e motores não encontrados

| Motor lógico | Implementação observada | Estado |
|---|---|---|
| Mandate | `mandate.ts` + snapshot persistido | EXISTE, ATIVO |
| Portfolio state | account/cash/positions + dashboard | EXISTE, ATIVO |
| Instrument master | array canónico em código | EXISTE, ATIVO, ESTÁTICO |
| Construction/allocation | `construction.ts` | EXISTE, ATIVO |
| Rebalance | `rebalancing.ts` | EXISTE, ATIVO |
| Benchmark | `benchmark.ts` | EXISTE, ATIVO, não total-return validado |
| Cost/tax friction | `costs.ts` | EXISTE, ATIVO, HEURÍSTICO |
| Governance/autonomy | `governance.ts` | EXISTE, ATIVO |
| Approval | execution plan + queue + RPC approval | EXISTE, ATIVO |
| Execution decision | `execution.ts` | EXISTE, ATIVO |
| Execution lifecycle | API/RPC/worker, fora do motor de decisão | EXISTE, ATIVO, OPERACIONAL CONGELADO |
| Accounting | RPCs/ledger PostgreSQL | EXISTE, ATIVO, OPERACIONAL CONGELADO |
| Reconciliation | RPCs/worker e Ops | EXISTE, ATIVO, OPERACIONAL CONGELADO |
| Evidence/audit | persistence/historyAudit/opsAudit | EXISTE, ATIVO |
| Advisor | view model sobre outputs | EXISTE, ATIVO, UI/shared |
| Scheduler/loop Investing dedicado | nenhum cron/service manifest dedicado | NÃO ENCONTRADO; worker manual existe |
| Historical data layer concreta | apenas interface read-only; runtime usa quotes online | NÃO ENCONTRADA no módulo Investing |
| Performance/attribution | nenhum motor dedicado encontrado | NÃO ENCONTRADO |
| Goal probability engine | wealth math/shared UI, sem motor Investing dedicado | NÃO ENCONTRADO |
| Learning engine | nenhum motor dedicado encontrado | NÃO ENCONTRADO |
| Notification engine dedicado | apenas componentes/engine shared | NÃO ENCONTRADO |
| Research Lab Investing | não existe neste baseline | NÃO ENCONTRADO, fora do escopo |

## 10. Workers, schedulers, pipelines, crons e integrações

| Elemento | Localização | Comportamento observado | Estado |
|---|---|---|---|
| Persistent Paper worker | `scripts/investing/runPersistentPaperWorker.mjs` | poll PostgreSQL, lock `skip locked`, heartbeat, fill e reconciliation | IMPLEMENTADO/VALIDADO; processo atual parado |
| Worker HTTP | `/api/investing/paper/worker` | health/recover/process/split por secret | ATIVO, sem cron dedicado |
| QA concurrency | `scripts/qa/runInvestingPostgresConcurrency.mjs` | corridas multi-sessão | QA |
| QA crash recovery | `scripts/qa/runInvestingWorkerCrashRecovery.mjs` | cria cenários, mata/reinicia worker | QA |
| Production audit script | `scripts/qa/investing-production-audit.mjs` | auditoria read-only | QA/OPS |
| GitHub workflow | `.github/workflows/investing-postgres.yml` | reset, SQL, concorrência e crash worker | DEFINIDO; execução remota não faz parte desta fase |
| Vercel crons Investing | `vercel.json` | nenhum cron dedicado | NÃO EXISTE |
| Vercel cron genérico | `/api/engine/loop`, `15 3 * * *` | broker loop shared, modo derivado de settings | ATIVO, SHARED/LEGACY |
| Market quote integration | `lib/market/quotes.ts` via `lib/market/marketClient` | TwelveData normalizada, cache em memória e candle fallback | ATIVO, shared |
| Supabase | repositories + RPCs | persistência canónica | ATIVO |
| Clerk | root/provider + request auth | identidade | ATIVO |
| Broker real Investing | nenhum adapter operacional dedicado; Live bloqueado | não usado | NÃO ATIVO |
| Edge Functions Investing | diretório/função não encontrada | — | NÃO EXISTE |

O cron genérico chama `syncBrokerToPortfolio` para targets cujo `active_mode` pode ser Investing. A API pública `/api/broker/sync` contém um bloqueio explícito para Investing, mas o cron chama a biblioteca diretamente. Este é um caminho shared/legacy encontrado no código; não é usado pelo Today canónico e não foi alterado nesta fase.

## 11. Modelo de persistência confirmado no staging

Consulta direta ao PostgreSQL da branch isolada confirmou 31 tabelas relevantes: 24 com prefixo `investing_` e 7 shared/legacy.

### 11.1 Tabelas canónicas Investing

| Domínio | Tabelas |
|---|---|
| Mandate/decision evidence | `investing_mandate_snapshots`, `investing_rebalance_ledger`, `investing_research_snapshots`, `investing_daily_cycles` |
| Queue/approval | `investing_execution_queue`, `investing_execution_approvals`, `investing_control_evaluations`, `investing_execution_events` |
| Account/cash | `investing_accounts`, `investing_cash_balances`, `investing_cash_movements` |
| Orders/fills | `investing_orders`, `investing_fills`, `investing_fees` |
| Positions/actions | `investing_positions`, `investing_corporate_actions` |
| Ledger | `investing_ledger_transactions`, `investing_ledger_entries` |
| Reconciliation | `investing_reconciliation_ledger`, `investing_reconciliation_runs`, `investing_reconciliation_items`, `investing_reconciliation_resolutions` |
| Readiness/worker | `investing_readiness_gates`, `investing_worker_heartbeats` |

### 11.2 Tabelas shared/legacy ainda relevantes

`user_settings`, `plans`, `portfolio_items`, `daily_snapshots`, `journal_entries`, `portfolios` e `portfolio_meta`.

O runtime canónico lê `user_settings` e `plans` como inputs de mandato. Não usa `portfolio_items` como posição financeira; usa `investing_positions` e `investing_cash_balances`. As tabs legacy continuam a usar `portfolio_items`.

### 11.3 Views, triggers, RPCs, RLS e Storage

- Views `investing_*`: **0**.
- Funções `investing_*` distintas no schema: **28**.
- Triggers Investing confirmados: **23**.
- Policies RLS em tabelas `investing_*`: **23**.
- Buckets Supabase Storage com prefixo Investing: **0**.
- Triggers confirmados incluem append-only, `touch_updated_at`, rejeição Live e rejeição de split com reserva aberta.
- RPCs ativas cobrem daily cycle, approval, account funding, submit/ack/cancel, fill, cash/reversal, split, ledger, reconciliation, recovery, resolution e Live blocked attempt.

Não foi encontrada persistência de engine em ficheiros ou Supabase Storage. A evidência canónica está em PostgreSQL; o artefacto de crash é QA local.

## 12. Fluxos ativos encontrados

### 12.1 Recomendação e proposta canónicas

1. Clerk identifica o utilizador.
2. Dashboard/daily cycle leem `user_settings`, `plans`, account, cash e positions.
3. `getQuotes` obtém preços.
4. `runtimeAdapter` deriva objetivo e executa mandate → construction → rebalance → benchmark → costs → governance → research validation.
5. `execution.ts` cria a decisão de execução, sem submeter ordem.
6. `investing_record_daily_cycle_v2` persiste ciclo, snapshots e queue de forma atómica.

### 12.2 Aprovação e execução Paper

1. Ops lê queue pendente.
2. `investing_record_approval_v2` valida owner, estado e versão.
3. Submit obtém quote e chama `investing_submit_paper_order_v2`.
4. A RPC exige market data com máximo de 15 minutos, instrumento presente na ação canónica, limits, idempotência e Paper.
5. Worker processa fills e reconciliation pela DB.

### 12.3 Fluxo shared/legacy de produto

Plan/Portfolio/Advisor/Autonomy usam `daily-bundle` e tabelas generalistas. `daily-bundle` também calcula um `investingRuntime`, mas agrega módulos `lib/engine`, `lib/signalcore` e imports Trading condicionais no mesmo ficheiro. Este fluxo não escreve as ordens/fills/ledger do Persistent Paper.

## 13. Dependências reais do engine canónico

| Dependência | Direção | Papel |
|---|---|---|
| `user_settings` | input → runtime | risk profile, horizon e goal metadata |
| `plans` | input → runtime | texto/estado do plano e objetivo |
| `investing_cash_balances` | input → runtime | cash disponível |
| `investing_positions` | input → runtime | posições persistentes |
| `lib/market/quotes` | input → runtime/submit | preços atuais e freshness |
| instrument master em código | input → runtime | universo e metadados |
| `runtimeAdapter` | engines → snapshot | composição determinística |
| persistence builders | snapshot → rows | fingerprints e payloads |
| RPC daily cycle | rows → PostgreSQL | write atómico |
| queue/approval | engine → execution boundary | autorização, sem fill |
| worker/RPCs | execução → accounting/reconciliation | lifecycle posterior |

Não foi encontrado consumo de `historical_raw` pelo engine atual. A interface read-only existe, mas não tem implementação nem consumidor no runtime.

## 14. Estado funcional do baseline da FASE 1

| Superfície | Estado factual |
|---|---|
| Today canónico | ativo e ligado ao Persistent Paper |
| Plan | ativo, persistência shared |
| Portfolio | ativo, holdings legacy separados de `investing_positions` |
| Advisor | ativo, derivado do daily bundle shared |
| Autonomy | ativo, contém operações legacy de broker/FixNow/close |
| Engine canónico | ativo no dashboard e daily cycle |
| Decision ledger | ativo em snapshots/ledger/queue |
| Persistent Paper/accounting/reconciliation | ativo e congelado |
| Ops/approvals | ativo |
| Worker dedicado | implementado e validado; não instalado como serviço/cron neste repositório |
| Live | bloqueado |
| Research Lab | inexistente |
| Data layer histórico Investing | interface apenas |

## 15. Testes de baseline executados

Seleção exclusiva dos motores de decisão:

- 10 ficheiros;
- 19 testes passed;
- 0 failed;
- 0 skipped.

Suites: mandate, instrument master, construction, rebalance, benchmark, costs, governance, execution plan, research validation e runtime adapter.

A suite Investing ampla executada na fase operacional permanece: 27 ficheiros, 80 passed, 0 failed, 0 skipped. Estes testes provam o comportamento codificado; esta FASE 1 não usa a sua existência para assumir que módulos sem consumidor estão ativos.

## 16. Dependência residual de validação

Único item residual, não bloqueador e não classificado como falha do engine:

> Repetir em janela de mercado, com fonte de cotação isolada própria de staging, o fluxo autenticado da queue aprovada desde submit até partial fill, fill e reconciled, preservando todas as políticas atuais.

Recursos preservados para esse item:

- Supabase branch `jrpjcrovnntzapmfjpga`;
- Vercel Preview `dpl_56SZdYtYpyAru2J448otwY1w8Kmm`;
- migrations e testes SQL;
- artefacto `afbf7a3e726e`;
- worker e harness de crash recovery.

## 17. Conclusão factual da FASE 1

O Investing atual é um sistema híbrido em transição de uma plataforma shared/legacy para um núcleo financeiro próprio. O engine canónico existe, está ativo e é orquestrado por `runtimeAdapter`; o Today, daily cycle, queue, approvals e Persistent Paper já usam esse núcleo. Quatro tabs principais ainda obtêm parte substancial do estado e comportamento pelas APIs e tabelas shared/legacy.

Existem motores ativos de mandate, construction, rebalance, benchmark, costs, governance, validation e execution planning. Existem módulos TypeScript apenas usados por testes para adapter Paper, controls, state machine e ledger; o comportamento operacional equivalente vive nas RPCs PostgreSQL. Não existem no baseline um Research Lab Investing, um data layer histórico concreto, um performance/attribution engine ou um scheduler Investing dedicado.

Esta conclusão encerra apenas a FASE 1 de descoberta. Não contém proposta de melhoria, percentagem de implementação ou alteração arquitetónica.

Investing Engine modificado nesta fase: não.
Núcleo operacional reaberto: não.
Trading core modificado: não.
