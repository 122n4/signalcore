# Investing Engine — Plano de Fases

**Fase atual:** Fase 2 concluída em documentação
**Data:** 2026-07-20
**Regra de execução:** cada fase termina com evidência e gate; nenhuma fase ativa Live, modifica Trading ou constrói Research Lab.

## 1. Sequência global

| Fase | Objetivo | Estado após esta entrega |
|---|---|---|
| Fase 1 | baseline e mapa global | Aceite |
| Fase 2 | arquitetura alvo, fontes canónicas e migração | Documentada; pronta para aceitação |
| Fase 3 | fronteiras seguras, contratos v1 e engine shadow determinístico | Próxima |
| Fase 4 | persistence/replay e projected state sobre PostgreSQL isolado | Planeada |
| Fase 5 | read models e migração gradual de UI | Planeada |
| Fase 6 | desligamento/remoção controlada de legacy | Futura; fora do início da implementação |

## 2. O que será implementado primeiro

A primeira alteração da Fase 3 será a contenção do risco provado em `/api/engine/loop -> syncBrokerToPortfolio`, antes de qualquer melhoria algorítmica:

1. boundary guard em `runEngineLoop` para não selecionar/executar targets Investing;
2. defesa em profundidade em `syncBrokerToPortfolio` para rejeitar Investing antes de fetch ou escrita;
3. resolução do modo efetivo antes da guarda em `/api/broker/sync`;
4. bloqueio do refresh shared Investing em `/api/broker/reconcile`;
5. reason code/telemetria `investing_shared_broker_sync_blocked`;
6. testes de Investing e regressão de modos shared/Trading.

Esta alteração não toca no Trading core, no Persistent Paper, em Live ou em Research Lab. Não requer migration.

## 3. Fase 3 — plano detalhado

### 3A — Boundary safety

**Scope**

- implementar as guardas acima;
- bloquear writes/reset/FixNow de `portfolio_items` apenas quando o modo efetivo é Investing;
- inventariar callers antes de alterar responses;
- manter `/api/daily-bundle` funcional.

**Testes**

- `active_mode=investing` por `user_settings`;
- target vindo do fallback `journal_entries`;
- `force=true`, due e not due;
- `dryRun=true/false`;
- request de broker com modo explícito, omitido e incompatível;
- reconcile `refresh=true/false`;
- nenhuma chamada a fetch bridge, read CSV, portfolio writes ou eventos de ordem no bloqueio;
- rotas/loop dos modos permitidos preservados;
- suites de isolamento Investing/Trading.

**Gate 3A**

- risco original reproduzível antes da correção e verde depois;
- zero diffs em `lib/trading/**` e no core operacional Investing;
- cron continua a processar apenas targets suportados.

### 3B — Contratos v1 e primitives determinísticas

**Scope**

- `CanonicalInvestingInputV1`, `InvestingEngineResultV1`, version set, quality/warnings/constraints/states;
- canonical decimal/JSON serialization e SHA-256;
- `InstrumentCatalogPort` com adapter estático piloto;
- `MarketSnapshotPort` de leitura, inicialmente in-memory fixture;
- clock explícito (`asOf` no input), sem fallback silencioso para `Date.now()` nas funções puras;
- orchestrator puro que ainda não substitui o runtime atual.

**Gate 3B**

- golden fixtures byte-identical em execuções repetidas;
- mudança de uma versão ou input altera o hash;
- ordem de chaves não altera o hash;
- valores inválidos, NaN/Infinity e timestamps ambíguos são rejeitados;
- Live não faz parte de nenhum input executável.

### 3C — Canonical Input Builder e Portfolio State Engine

**Scope**

- adapter server-side de plan/settings com allowlist e source refs;
- leitura read-only de account, cash, positions, open orders e reservas;
- actual/reserved/projected state;
- tratamento explícito de submitted, partially filled, reconciling, cancellation/failure e terminal states;
- data-quality report e blocked/degraded rules;
- sem escrita DB nova nesta subfase, usando repository ports/mocks.

**Gate 3C**

- pending buy não pode ser novamente recomendado como cash livre;
- pending sell não pode usar quantidade reservada;
- partial fill reflete fill realizado + remainder pendente uma única vez;
- ordem terminal deixa de projetar remainder;
- projections conservam moeda/quantidade e são determinísticas;
- nenhum fixture usa `portfolio_items`, `portfolios` ou localStorage.

### 3D — Risk e Policy/Constraint Engine

**Scope**

- constraints hard/soft tipadas;
- risk metrics sobre projected state;
- quality/confidence/warnings;
- state machine `ready|degraded|blocked|no_trade`;
- adaptar regras úteis de mandate/governance atuais como `policy/v1`.

**Gate 3D**

- todo hard fail/unknown produz `blocked`;
- confidence nunca relaxa hard constraints;
- soft fail segue uma regra versionada e visível;
- cada constraint tem evidence refs e reason code;
- estado `no_trade` é distinto de erro e de blocked.

### 3E — Construction, Rebalance, Cost/Liquidity, Tax interface e Explainability

**Scope**

- construction recebe catálogo pelo input;
- conservation/caps/feasibility explícitos;
- rebalance usa projected state;
- cost model atual apenas como fallback versionado `degraded`;
- Tax Interface devolve known/unknown sem inventar fiscalidade;
- explanation graph estruturado;
- proposal builder, sem submit.

**Gate 3E**

- target + residual cash conserva 100%/capital dentro da tolerância decimal;
- constraints inviáveis bloqueiam, não deixam allocation silenciosamente incompleta;
- turnover e custos são calculados sobre ações líquidas de pending orders;
- vendas com tax data requerido mas ausente seguem a policy degraded/blocked;
- engine não importa módulos de broker, execution worker ou RPC de submit;
- output só contém proposta.

### 3F — Shadow comparison com runtime atual

**Scope**

- executar engine v1 sem afetar resposta, queue ou UI;
- comparar mandato, target, drift, turnover, state e warnings;
- classificar diferenças esperadas versus defeitos;
- medir tempo, memória e taxa de blocked/degraded.

**Gate 3F**

- nenhuma escrita operacional do output shadow;
- diferenças têm reason code e fixtures reproduzíveis;
- performance budget definido e cumprido;
- decisão explícita de avançar para migrations da Fase 4.

## 4. Fase 4 — persistence, replay e PostgreSQL isolado

### 4A — Migrations aditivas

Criar, após revisão:

- `investing_market_snapshots`;
- `investing_market_snapshot_items`;
- `investing_input_snapshots`;
- `investing_engine_runs`;
- `investing_risk_snapshots`;
- views/read models v1;
- RLS, grants, append-only guards, FKs, uniques e índices.

Não alterar as migrations históricas `20260719120000`–`20260719290000`; criar migrations forward novas.

### 4B — Persistence/replay

- persistir market snapshot antes do input;
- persistir input e run por idempotency key;
- persistir output/hash atomically;
- replay read-only pelo run ID;
- falha de persistence não cria proposal parcial.

### 4C — Backfill não financeiro

- ligar artefactos históricos quando a correlação é inequívoca;
- marcar incompletos como `legacy_unverified`;
- não importar `portfolio_items` ou cash legacy para o livro.

### Gate da Fase 4

- staging isolado criado e migration ledger confirmado;
- apply/rollback ensaiados sem dados/secrets de produção;
- RLS authenticated provado;
- replay produz o mesmo output hash;
- concorrência/idempotência testadas em PostgreSQL real;
- núcleo operacional continua verde e Live bloqueado.

## 5. Fase 5 — read models e UI

Ordem de cutover:

1. Advisor;
2. Planning;
3. Portfolio;
4. Autonomy;
5. compatibility branch `/api/daily-bundle?mode=investing`;
6. presenter único do operating loop.

Cada cutover exige:

- flag server-side independente;
- provenance visível no response;
- shadow parity e métricas;
- teste browser autenticado;
- rollback para adapter canónico, nunca para financial legacy;
- confirmação de zero writes duplicados.

No Portfolio, actual/reserved/projected devem ser distinguíveis. No Advisor, abrir a página não recalcula uma decisão. No Autonomy, só aparecem proposal, approval e Persistent Paper; Live/shared broker/FixNow continuam impossíveis.

## 6. Fase 6 — retirada legacy

Fica condicionada a 30 dias/30 ciclos de paridade, zero writes/tráfego, testes completos, backup e aprovação operacional. Inclui:

- branch Investing do daily-bundle;
- writes/reset de portfolio-items para Investing;
- FixNow Investing;
- operating loop duplicado;
- dados/colunas/views legacy sem consumers.

Deletes físicos são migrations separadas e revistas; evidências não são apagadas.

## 7. Módulos atuais reutilizados

| Atual | Uso futuro |
|---|---|
| `mandate.ts` | policy v1 atrás de input/constraints tipadas |
| `rebalancing.ts` | matemática de drift adaptada ao projected state |
| `governance.ts` | reason codes/gates separados em hard e soft |
| `persistence.ts` | base de canonical JSON e SHA-256, com decimals/time explícitos |
| `server/dailyCycle.ts` | boundary server-side e atomicidade, depois de separar snapshot/acquisition |
| `server/dashboard.ts` | repository/read-model boundary, sem recomputar em GET |
| `execution.ts` | proposal builder, sem semântica de execução |
| `instrumentMaster.ts` | adapter `StaticPilotInstrumentCatalog/v1` |
| Persistent Paper RPCs/workers | sem alteração; execution/accounting/reconciliation externos ao engine |

## 8. Módulos novos

- `contracts/v1`;
- canonical input builder;
- market snapshot service/repository;
- portfolio actual/reserved/projected state;
- risk engine;
- policy/constraint engine;
- instrument catalog port;
- construction v1/feasibility;
- cost/liquidity port;
- tax port;
- explainability graph;
- engine run repository e replay;
- canonical read models/presenters.

Os nomes físicos serão decididos na implementação mantendo dependências unidirecionais; o contrato, não a pasta, é a decisão desta fase.

## 9. Caminhos legacy mantidos temporariamente

- `plans` e `user_settings` como authoring;
- `/api/daily-bundle` para tabs ainda não migradas;
- `portfolio_items` apenas para consumidores legacy/read compatibility, nunca fonte financeira futura;
- `daily_snapshots`/`journal_entries` para histórico de produto e streak compatibility;
- `runtimeAdapter.ts` como baseline/shadow comparator;
- FixNow/broker shared para domínios permitidos, explicitamente bloqueados no Investing;
- dois presenters de operating loop até Plan/Advisor migrarem.

## 10. Riscos bloqueantes

| Risco | Gate afetado | Estado atual |
|---|---|---|
| engine loop shared executa sync no modo Investing | 3A | Provado por código e teste isolado; plano definido |
| ausência de market snapshot imutável | 3B/4 | Por implementar |
| pending orders ausentes do projected state | 3C | Por implementar |
| hard/soft constraints não formalizadas | 3D | Por implementar |
| construction/cost/tax heurísticos | 3E | Aceites só no piloto/degraded |
| backfill legacy sem provenance | 4/5 | Proibido automaticamente; fluxo candidato necessário se usado |
| staging isolado anterior removido | 4 | Recriação necessária antes de DB deploy |
| validação autenticada residual | promoção operacional | Parcial; dependência, não falha do engine |
| migration ledger/environment parity | 4 | Deve ser verificado antes de qualquer apply |

## 11. Critérios de aceitação para iniciar a Fase 3

A Fase 3 pode começar quando esta documentação for aceite e as seguintes decisões forem mantidas:

1. `investing_*` é a única fonte financeira.
2. `portfolio_items` não será importado nem dual-written.
3. o primeiro patch será boundary safety, não algoritmo/rewrite.
4. contratos v1 precedem persistence e UI cutover.
5. pending orders entram no estado projetado.
6. engine produz proposal, nunca execution.
7. hard constraints são não-contornáveis.
8. market snapshots são imutáveis e replay não consulta provider.
9. Live permanece impossível e Trading fica sem modificações.
10. migrations são aditivas e só entram após staging isolado/ledger check.

## 12. Critérios de aceitação para concluir a Fase 3

- guardas shared completas e testadas, sem efeitos laterais em Investing;
- contratos v1 e hashes estáveis;
- pure engine replay sobre fixtures;
- actual/reserved/projected cobre pending e partial fills;
- hard/soft constraints e quatro estados têm testes;
- target conserva capital e situações inviáveis bloqueiam;
- cost/tax desconhecidos são explícitos;
- engine não possui imports/calls de execução;
- shadow output não escreve queue, order, cash, positions ou ledger;
- suites relevantes passam e o diff delimitado contra o baseline registado no início da Fase 3 confirma zero alterações dessa fase no Trading core/Persistent Paper;
- relatório da Fase 3 inclui limitações e a dependência residual de staging sem a classificar como falha do engine.

## 13. Validação residual preservada

> Repetir em janela de mercado, com fonte de cotação isolada própria de staging, o fluxo autenticado da queue aprovada desde submit até partial fill, fill e reconciled, preservando todas as políticas atuais.

Este item não bloqueia o início da Fase 3A–3F em código puro/shadow. Bloqueia promoção de migrations/execução para um ambiente operacional até existir novo staging isolado e evidência completa.
