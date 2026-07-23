# Investing — Matriz de Fontes Canónicas

**Fase:** 2
**Data:** 2026-07-20
**Objetivo:** tornar explícito quem lê o quê, qual será a fonte canónica e como cada caminho transita sem dupla escrita financeira.

## 1. Vocabulário de ações

- **Manter:** já está na fronteira correta e não precisa de mudança conceptual.
- **Adaptar:** é útil, mas deve consumir/produzir o novo contrato.
- **Compatibility layer:** permanece temporariamente com tradução server-side e telemetria.
- **Descontinuar:** não recebe novas funcionalidades e os consumidores são migrados.
- **Remover mais tarde:** só após critérios objetivos de desligamento.

## 2. Matriz por domínio

| Domínio | Fonte atual | Fonte canónica futura | Escrita autorizada | Consumidores alvo |
|---|---|---|---|---|
| Mandate | inferência de `plans` + `user_settings`; snapshot em `investing_mandate_snapshots` | `investing_mandate_snapshots` ligado a um input/run | daily-cycle/engine persistence server-side | engine, Advisor, audit/replay |
| Plan | `plans` | `plans` como authoring; `investing_plan_read_model_v1` tipado | `/api/plans`, só campos de plano | canonical input adapter, Plan UI |
| Settings | `user_settings` | `user_settings` como authoring; projection Investing com allowlist | `/api/user-settings`, sem campos financeiros calculados | canonical input adapter, UI |
| Account | `investing_accounts` e, no legacy, `portfolios` | `investing_accounts` | RPCs/serviços Investing autorizados | engine snapshot, dashboard, execution |
| Cash | `investing_cash_balances`; no legacy, `portfolios.cash_eur`/snapshot | `investing_cash_balances`, provado por movements + ledger | RPCs financeiros Investing | projected state, risk, read models |
| Positions | `investing_positions` no Daily canónico; `portfolio_items` nas restantes tabs | `investing_positions`, provado por fills/corporate actions + ledger | RPCs financeiros Investing | projected state, Portfolio read model |
| Pending orders | `investing_orders`/queue são mostrados, mas não entram no cálculo | open `investing_orders` + reservas + queue relation | Persistent Paper RPCs | projected state, risk, rebalance |
| Market snapshot | `getQuotes()` em runtime, cache/provider volátil | `investing_market_snapshots` + items, imutáveis | market snapshot service | todos os módulos puros e replay |
| Target portfolio | payload de `investing_rebalance_ledger`; também outputs transitórios | `investing_rebalance_ledger.target_portfolio` ligado a run/input | engine persistence | Rebalance, Advisor, proposal builder |
| Risk | governance/cost/research payloads dispersos | `investing_risk_snapshots` | engine persistence | policy, UI, audit |
| Rebalance | runtime transitório + `investing_rebalance_ledger` | `investing_rebalance_ledger` | engine persistence | proposal builder, Advisor, audit |
| Proposal | `investing_execution_queue` | `investing_execution_queue` | atomic daily-cycle/proposal RPC | approval e execution boundary |
| Approval | `investing_execution_approvals` | `investing_execution_approvals` append-only | approval RPC | execution boundary, audit |
| Execution | shared broker/FixNow no legacy; Persistent Paper no canónico | `investing_orders`, fills, fees, events | Persistent Paper RPC/worker, Paper only | dashboard, accounting, reconciliation |
| Accounting | ledger + projections canónicas; nenhum equivalente sólido no legacy | `investing_ledger_transactions` + `investing_ledger_entries` | RPCs transacionais | reconciliation, audit, projections |
| Reconciliation | runs/items/resolutions; `investing_reconciliation_ledger` antigo | runs + items + resolutions | reconciliation RPCs/worker | operations, readiness, audit |

## 3. Matriz de componentes, consumidores e migração

| Componente atual | Consumidor atual | Fonte atual | Fonte canónica futura | Ação | Risco | Testes necessários |
|---|---|---|---|---|---|---|
| `app/api/investing/dashboard` + `server/dashboard.ts` | Daily Investing | account, cash, positions, cycles, queue, orders canónicos; quotes voláteis | read model canónico + último engine run/market snapshot | Adaptar | Médio: hoje recalcula output em cada GET | contract, auth/RLS, snapshot consistency, no provider no replay |
| `app/api/investing/daily-cycle` + `server/dailyCycle.ts` | botão de fecho no Daily | plan/settings + financial tables + `getQuotes()` | input snapshot persistido + engine v1 + atomic run/proposal persistence | Adaptar | Alto: aquisição e cálculo estão acoplados | idempotência, concorrência, deterministic replay, stale quote fail-closed |
| `app/api/investing/paper/**` | Daily e ops | Persistent Paper `investing_*` | igual | Manter | Baixo dentro do âmbito congelado | regressão Paper, Live block, auth, idempotência |
| `investing_accounts` | runtime canónico | própria tabela | própria tabela | Manter | Baixo | owner/RLS, um active account por chave, Paper-only |
| `investing_cash_balances` | Daily, order submission, reconciliation | projection mutável | mesma projection, provada pelo ledger | Manter | Médio: projection/book divergence | ledger-to-cash, reservations, concurrency, recovery |
| `investing_positions` | Daily, fills, reconciliation | projection mutável | mesma projection, provada por eventos/ledger | Manter | Médio: projection/book divergence | fills/actions-to-position, reservations, reconciliation |
| `investing_orders` | dashboard, worker, reconciliation | própria tabela | própria tabela + open-order snapshot | Manter/Adaptar leitura | Médio: ainda ausente do projected engine state | all non-terminal states, partial fill, cancel, reserved effects |
| ledger/fills/fees/events | accounting e audit | `investing_*` append-only | igual | Manter | Baixo/Médio | append-only, balanced entries, semantic idempotency |
| reconciliation runs/items/resolutions | ops/readiness | próprias tabelas | igual | Manter | Baixo | no fabricated reconciled, resolution audit, severity vocabulary |
| `investing_mandate_snapshots` | daily cycle/audit | output do runtimeAdapter | effective mandate do input v1 | Adaptar | Médio: snapshot atual omite provenance/quality | hash, source refs, version, immutable replay |
| `investing_rebalance_ledger` | daily cycle/audit/proposal | runtime output | result do Rebalance Engine v1 | Adaptar | Médio | target conservation, pending-order delta, hash/idempotency |
| `investing_research_snapshots` | audit/UI eventual | scorecards heurísticos | explainability/validation read model; manter nome por compatibilidade | Compatibility layer | Baixo | versioned payload, no Research Lab claims |
| `investing_execution_queue` | approval/Paper | execution-plan output | proposal boundary result | Adaptar | Médio | blocked/no-trade cannot submit, exact approved version |
| `plans` | Plan, daily-bundle, daily cycle | linha mais recente por mode | authoring source + typed read model | Manter/Adaptar | Médio: “latest” não garante active/effective version | active selection, invalid/partial plan, version pinning |
| `user_settings` | todas as tabs, loop shared | settings, active mode e broker blob | authoring only; Investing allowlist | Manter/Adaptar | Alto: mistura preferências com broker control state | schema allowlist, mode changes, no financial inputs |
| `portfolio_items` | Portfolio, Plan, Advisor, Autonomy, daily-bundle, FixNow, broker shared | holdings legacy editáveis | nunca financeiro; compatibility read model derivado de `investing_positions` após cutover | Descontinuar/Remover mais tarde | Crítico: duas carteiras visíveis e mutáveis | shadow parity, no write for Investing, UI edit semantics, rollback |
| `portfolios` | broker shared/compatibility | snapshot/cash mirror | nenhum papel financeiro no Investing | Descontinuar | Alto | ensure no Investing reader/writer before retirement |
| `daily_snapshots` | daily-bundle, streak/timeline | snapshot legacy | `investing_daily_cycles` + engine runs read model | Compatibility layer | Médio | timeline parity, day keys, no financial reconstruction |
| `journal_entries` | daily-bundle, shared loop, streak/proof | eventos legacy | product engagement only; execution audit vem de `investing_*` | Compatibility layer | Médio: eventos parecem prova financeira | semantic separation, no order/fill authority |
| `/api/daily-bundle` | Plan, Portfolio, Advisor, Autonomy, offline setup | plan/settings/portfolio_items/daily snapshots + grande engine shared | dispatcher: Investing lê read model canónico; Trading mantém caminho atual | Compatibility layer/Descontinuar | Alto: endpoint monolítico e dupla semântica | mode isolation, response contract, canonical provenance, Trading regression |
| `/api/portfolio-items` e reset | Portfolio/Plan/Autonomy | `portfolio_items` read/write | para Investing: read-only compatibility view; onboarding financeiro por comandos explícitos do account | Descontinuar | Crítico: browser pode inventar posição | Investing 410/409 writes, read mapping, no Trading regression |
| `/api/portfolio`, `/api/portfolio/save`, `/api/portfolio-meta` | legacy clients | redirecionam para `portfolio_items` | read model canónico quando Investing; depois remoção | Compatibility layer | Alto | caller inventory, route mode isolation |
| `/api/fix-now/run` | Portfolio/Autonomy | lê/escreve `portfolio_items` e snapshots | sem substituto no Investing; engine gera proposta, não “fixa” holdings | Descontinuar para Investing | Crítico | hard block in Investing, Trading/shared regression |
| `lib/engine/loop.ts` | cron `/api/engine/loop` | settings/broker shared | domínios shared permitidos; Investing explicitamente excluído | Adaptar com boundary guard | Crítico e provado | investing direct/fallback/force/dry-run, cron, Trading regression |
| `lib/broker/sync.ts` | engine loop, broker sync/reconcile | broker/CSV -> portfolio_items/portfolios/daily_snapshots | proibido para Investing; broker shared permanece noutros domínios | Adaptar com defesa em profundidade | Crítico e provado | impossible Investing input, no side effects, supported modes |
| `/api/broker/sync` | UI/automation shared | guarda só modo pedido; depois sync | modo efetivo guardado; Investing -> retired | Adaptar | Alto: modo omitido pode resolver para Investing | explicit/omitted/spoofed mode, auth, no writes |
| `/api/broker/reconcile` | UI/automation shared | `refresh` pode chamar shared sync | Investing sem refresh shared; reconciliation canónica própria | Adaptar | Alto | refresh false/true, effective mode, canonical alternative |
| `runtimeAdapter.ts` | daily-cycle/dashboard/daily-bundle | objetos soltos + defaults/heurísticas | compatibility adapter para `CanonicalInvestingInputV1` | Descontinuar gradualmente | Alto: inferência silenciosa e relógio/dados externos | fixture equivalence, missing fields, no UI financial data |
| `mandate.ts` | runtime | `MandateInput` simples | policy module v1 com input canónico | Adaptar | Médio | golden fixtures, hard constraints, normalization |
| `construction.ts` | runtime | static scores/universe | construction v1 por catalog port + constraints | Adaptar/substituir | Alto: targets podem ficar subalocados | conservation, caps, infeasible constraints, determinism |
| `rebalancing.ts` | runtime | current value vs target | projected state vs target | Adaptar | Alto: duplica ordens abertas hoje | pending buys/sells/partial fills, turnover, no-trade |
| `benchmark.ts` | runtime/research | policy codificada | benchmark policy versionada/catalog-backed | Heurístico temporário | Médio | weights=100, eligibility, version fixtures |
| `costs.ts` | runtime/governance | bps/buckets codificados | model port; fallback degradado versionado | Heurístico temporário | Médio | unknown liquidity, min notional, confidence |
| `governance.ts` | runtime/execution plan | mixed gates/override | Policy/Constraint Engine | Adaptar | Alto: hard/soft não explícitos | hard fail/unknown blocks, soft warnings, no override |
| `research.ts` | runtime/persistence | scorecards manuais | validation + explainability adapter | Incompleto/Compatibility layer | Baixo/Médio | reason/evidence links, no unsupported claims |
| `execution.ts` | daily cycle | transforma governance em decisão | proposal builder apenas | Adaptar/renomear conceito | Alto: “paper_execute” pode sugerir execução | blocked/no-trade, approval, expiry from input time |
| `persistence.ts` | daily snapshot persistence | stable JSON + fingerprints parciais | run/input/output repository v1 | Adaptar | Médio: normalização de data usa relógio em fallback | canonical decimals, stable ordering, replay/hash |
| `instrumentMaster.ts` | todos os motores | constante VWCE/SPY/AGGH/GLD | `StaticPilotInstrumentCatalog/v1` por interface | Heurístico temporário | Médio: metadata manual e universo curto | catalog version, duplicate symbols, eligibility, immutable fixtures |
| `lib/investing/ui/operatingLoop.ts` | Daily | estado canónico resumido | único presenter de operating loop | Manter/Adaptar | Baixo | stage matrix, copy/provenance |
| `lib/signalcore/investingOperatingLoop.ts` | Plan/Advisor | loop duplicado com semântica legacy | presenter único sobre read model | Descontinuar/Remover mais tarde | Médio: mesmas fases, significados diferentes | cross-tab parity, import elimination |
| `PortfolioTab` | UI | portfolio-items + daily-bundle; writes/reset/FixNow | canonical portfolio read model; comandos financeiros explícitos | Migrar gradualmente | Alto | UI parity, write prevention, pending state display |
| `PlanningTab` | UI | plans/settings + daily-bundle + reset | plan/settings authoring + Investing read model | Migrar gradualmente | Médio | save/version pin, no portfolio reset side effect |
| `AdvisorTab` | UI | daily-bundle | latest engine run/explainability read model | Migrar gradualmente | Médio | explanation provenance, degraded/blocked/no-trade |
| `AutonomyTab` | UI | daily-bundle + portfolio reset + FixNow | approval/execution status read model; no shared automation | Migrar gradualmente | Crítico | no Live, no shared sync/FixNow, approval boundary |

## 4. Resolução das coexistências

### `investing_positions` versus `portfolio_items`

- `investing_positions` é a única projection financeira Investing.
- Não há backfill automático de `portfolio_items`; qualquer importação é tratada como candidato, reconciliada e aprovada explicitamente.
- Durante a transição, a UI pode manter a forma antiga através de uma view/read model derivada de `investing_positions`.
- Escritas Investing em `/api/portfolio-items`, reset e FixNow são desligadas antes do cutover de leitura.
- `portfolio_items` pode continuar a existir para consumidores não-Investing até ao inventário completo.

### `/api/investing/**` versus `/api/daily-bundle`

- `/api/investing/**` é a API canónica e pequena por domínio.
- `/api/daily-bundle?mode=investing` torna-se um adapter de resposta que lê o mesmo read model; não recalcula engine nem lê holdings legacy.
- Os restantes modos de `daily-bundle` não são alterados na migração Investing.
- Depois de todas as tabs migrarem, o branch Investing de `daily-bundle` é removido.

### Runtime canónico versus FixNow/engine shared

- Runtime canónico produz target/rebalance/proposta.
- FixNow é proibido no Investing; “corrigir” uma carteira não é equivalente a criar fills/accounting.
- Engine loop e broker shared ficam limitados aos domínios explicitamente suportados.

### Operating loops duplicados

- `lib/investing/ui/operatingLoop.ts` é o presenter de referência porque já fala em conta persistente, ciclo canónico e separação de execução.
- `lib/signalcore/investingOperatingLoop.ts` fica compatibility-only até Plan e Advisor receberem o read model canónico.
- A deduplicação ocorre depois do cutover, sem bloquear os contratos do engine.

### Broker shared versus Persistent Paper Investing

- Broker shared nunca escreve estado Investing.
- Persistent Paper continua a única execução operacional Investing.
- Uma integração broker externa futura exigirá um adapter próprio do domínio, eventos/fills canónicos, accounting e reconciliation; não reutilizará `syncBrokerToPortfolio`.

## 5. Proibições de escrita durante a transição

| Origem | `portfolio_items` | `investing_positions` | ledger/cash/orders |
|---|---:|---:|---:|
| Browser/legacy UI em Investing | Bloquear writes | Nunca direto | Nunca direto |
| Compatibility layer | Read-only | Read-only | Read-only |
| Engine | Nunca | Nunca | Nunca |
| Proposal boundary | Nunca | Nunca | Queue/approval apenas via RPC |
| Persistent Paper RPC/worker | Nunca | Projection por transação | Sim, dentro das invariantes |
| Backfill administrado | Candidatos read-only | Só após validação/aprovação explícita | Só por RPC de abertura/movimento |

## 6. Critério de fonte canónica

Um payload só pode declarar `canonical=true` quando inclui `source`, `snapshotId`/`runId`, `asOf`, `version` e `hash`, e quando todos os campos financeiros vêm da fronteira `investing_*`. Respostas compatibility devem declarar `compatibility=true` e a proveniência; nunca podem apresentar `portfolio_items` como canónico depois do cutover.
