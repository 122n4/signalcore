# Investing — Plano de Migração Legacy

**Fase:** 2
**Data:** 2026-07-20
**Estratégia:** aditiva, observável, reversível no consumo e sem dual-write financeiro.

## 1. Resultado pretendido

Plan, Portfolio, Advisor e Autonomy continuam funcionais enquanto passam, uma a uma, a consumir read models canónicos. O núcleo `investing_*` permanece a única fonte financeira. Tabelas e APIs legacy não são apagadas no início; primeiro deixam de escrever para Investing, depois deixam de ser lidas e só no fim são removidas.

Não existe uma “big bang migration” nem uma cópia silenciosa de `portfolio_items` para `investing_positions`.

## 2. Princípios de migração

1. Migrations novas são aditivas até o último estágio.
2. Escrever uma vez na fonte canónica; projetar muitas vezes para leitura.
3. Dual-read só em shadow mode, com comparação e sem decidir valores financeiros.
4. Dual-write financeiro é proibido.
5. `portfolio_items` é dado legacy não confiável para abertura de livro.
6. Backfill que não prove provenance fica `legacy_unverified`, não “reconciled”.
7. Cada cutover tem flag server-side, métricas, rollback de leitura e testes de paridade.
8. Rollback nunca reverte fills/ledger nem volta a fazer de `portfolio_items` fonte de verdade.
9. Live continua bloqueado; Trading fica fora dos diffs.
10. Nenhuma migration é aplicada em produção antes de staging isolado, migration ledger verificado, backup e dry run.

## 3. Sequência faseada

### M0 — contenção de fronteiras, sem migration

Objetivo: impedir novas divergências antes de construir o engine alvo.

- bloquear `active_mode=investing` em `runEngineLoop` antes de eventos/sync;
- defesa em profundidade em `syncBrokerToPortfolio`;
- corrigir a guarda de modo efetivo em `/api/broker/sync`;
- impedir refresh shared em `/api/broker/reconcile` para Investing;
- bloquear reset/FixNow e writes em `portfolio_items` quando o modo efetivo é Investing;
- adicionar telemetria específica, sem `order_sent`/`order_filled` falsos;
- preservar integralmente os caminhos Trading/shared permitidos.

Rollback: flag de boundary apenas para modos permitidos; a exclusão Investing não tem rollback para o shared broker, porque restaurá-la violaria a fonte canónica.

### M1 — contratos e execução shadow, sem cutover

- adicionar tipos v1, canonical JSON/decimal normalization e hash fixtures;
- criar `CanonicalInputBuilder` server-side;
- criar Portfolio State Engine com actual/reserved/projected;
- fazer replay puro em memória e comparar com o runtime atual;
- não persistir proposta operacional nova e não mudar a UI.

Critério: mesmos fixtures + mesmas versões produzem byte-identical output; inputs incompletos bloqueiam/degradam de forma previsível.

### M2 — persistence aditiva de snapshots/runs

Migrations previsíveis, em ficheiros novos posteriores a `20260719290000`:

| ID lógico | Objeto | Conteúdo mínimo |
|---|---|---|
| `ENG-001` | `investing_market_snapshots` | id, user/portfolio/account opcional, as_of, provider set, schema version, quality, hash, created_at; immutable |
| `ENG-002` | `investing_market_snapshot_items` | snapshot FK, symbol/instrument id, price/FX/currency/venue, provider_as_of, received_at, freshness, quality, unique(snapshot,symbol,venue) |
| `ENG-003` | `investing_input_snapshots` | ids de mandate/account/market, open-order-set hash, payload canónico, contract/version set, input hash, quality/state; immutable |
| `ENG-004` | `investing_engine_runs` | run id, input snapshot/hash, versions, status, output/hash, started/completed, error code; idempotency unique |
| `ENG-005` | `investing_risk_snapshots` | run/input FK, metrics, constraints, confidence, quality, hash; immutable |
| `ENG-006` | read models/views v1 | portfolio, plan, daily/engine, Advisor/explainability e Autonomy/execution status |
| `ENG-007` | RLS/grants/immutability | owner reads, service-only writes, append-only triggers, indexes e check constraints |

As migrations podem ser agrupadas fisicamente após revisão, mas a ordem lógica é obrigatória. Não se alteram RPCs do Persistent Paper para acomodar o engine.

Checks e índices mínimos:

- FK de run para input e de input para market/mandate/account;
- `input_hash`, `output_hash` e snapshot hashes com formato SHA-256;
- unique `(input_hash, engine_version, policy_version, model_version, instrument_catalog_version)` para replay/idempotência quando aplicável;
- `state in ('ready','degraded','blocked','no_trade')`;
- confidence entre 0 e 1;
- JSON schema version não nula;
- triggers append-only em snapshots concluídos;
- índices por `(user_id, portfolio_id, created_at desc)` e por hashes;
- RLS read-own; writes apenas por funções/role de serviço.

### M3 — backfill controlado e shadow reads

Backfills autorizados:

- ligar `investing_mandate_snapshots`, `investing_rebalance_ledger`, `investing_research_snapshots`, queue e `investing_daily_cycles` existentes a runs legacy quando IDs, timestamps e fingerprints permitem associação inequívoca;
- marcar versões antigas como `legacy/v1` e qualidade `legacy_unverified` quando não existe market snapshot completo;
- calcular hashes apenas sobre o payload realmente disponível;
- construir read models das fontes `investing_*` sem modificar o livro.

Backfills proibidos:

- copiar `portfolio_items` diretamente para `investing_positions`;
- copiar `portfolios.cash_eur` ou localStorage para `investing_cash_balances`;
- fabricar quotes/provider timestamps para ciclos antigos;
- marcar histórico como `reconciled` sem reconciliation factual;
- gerar fills/ledger retroativos para explicar alterações legacy desconhecidas.

Se for necessária uma abertura a partir do legacy, criar uma staging table temporária de candidatos, por exemplo `investing_legacy_opening_candidates`, com source row, hash, divergências e approval. A entrada real ocorre por um comando/RPC de opening balance auditável; nunca por update direto de projections.

Shadow read:

- executar resposta legacy e canónica lado a lado no servidor;
- devolver apenas a fonte atualmente selecionada;
- registar diferenças de account, cash, positions, valuation, stage e proposal;
- nunca escolher “o valor maior/mais recente” entre as duas fontes;
- divergência financeira bloqueia cutover, não provoca sincronização automática.

### M4 — cutover incremental de consumidores

Ordem recomendada:

1. **Advisor:** read-only, passa a explicar o último engine run.
2. **Planning:** continua a escrever `plans`/settings, mas lê effective mandate e estado através do read model.
3. **Portfolio:** lê account/cash/positions/pending orders canónicos; edição livre de holdings desaparece no Investing.
4. **Autonomy:** mostra approval/Paper/reconciliation canónicos; reset/FixNow/broker shared permanecem bloqueados.
5. **`/api/daily-bundle?mode=investing`:** torna-se adapter do mesmo read model para clientes ainda não migrados.
6. **Operating loop:** todos os consumers usam o presenter canónico; remove-se a duplicação shared.

Cada tab tem flag independente e pode reverter apenas para a response compatibility construída a partir das mesmas fontes canónicas. Não pode reverter para financial reads de `portfolio_items`.

### M5 — desligar caminhos legacy de Investing

- `/api/portfolio-items` para Investing: GET compatibility temporário; POST/DELETE/reset retirados;
- `/api/fix-now/run` para Investing: retirado;
- broker sync/reconcile shared para Investing: retirado;
- branch de cálculo Investing dentro de `/api/daily-bundle`: retirado, ficando um adapter fino enquanto necessário;
- `lib/signalcore/investingOperatingLoop.ts`: removido depois de zero imports;
- comentários/testes que chamam `portfolio_items` de fonte canónica são corrigidos no mesmo cutover, não antes da proteção estar pronta.

### M6 — limpeza destrutiva, muito posterior

Só depois dos critérios da secção 8:

- remover branch Investing do daily-bundle;
- remover colunas/índices específicos de Investing nas tabelas shared, se não houver outros consumidores;
- remover dados `portfolio_items(mode='investing')` através de migration auditada e backup recuperável;
- remover views compatibility sem tráfego;
- manter evidências, audit tables e hashes segundo a política de retenção.

Nenhuma tarefa M6 pertence à Fase 3 inicial.

## 4. Compatibility views/read models

As views são projeções de leitura, não mecanismos de escrita.

### `investing_portfolio_read_model_v1`

Deve combinar:

- account identity/base currency/environment;
- balances available/settled/reserved;
- positions quantity/reserved/cost basis;
- valuation ligada a um market snapshot concreto;
- open orders e projected state;
- `asOf`, quality, snapshot IDs e provenance.

Um adapter pode converter positions para a forma `{symbol,name,qty,value_eur}` esperada pela UI antiga. O adapter declara `canonicalSource: "investing_positions"` e nunca implementa POST/DELETE.

### `investing_plan_read_model_v1`

Combina o plano authored, settings permitidos e o último effective mandate snapshot. Expõe diferenças entre “configuração atual” e “mandato usado no último run”, evitando alterar retroativamente decisões já persistidas.

### `investing_daily_read_model_v1`

Combina último run, daily cycle, market quality, target, risk, rebalance, proposal/execution summary e operating-loop state. Substitui o branch Investing calculado no monólito daily-bundle.

### `investing_advisor_read_model_v1`

Expõe explanation nodes, constraints, warnings, confidence, input/output versions e links de audit. Não executa uma nova decisão ao abrir a tab.

### `investing_autonomy_read_model_v1`

Expõe proposal, approval, orders, fills e reconciliation. `Live=false`/blocked é explícito e não é controlável pelo browser.

## 5. Estratégia de dual-read e proibição de dual-write

Dual-read é aceitável apenas quando:

- está atrás de flag server-side;
- a fonte canónica é calculada independentemente;
- diferenças são métricas, não resolvidas por merge;
- tem data de remoção e owner;
- não aumenta carga da base sem budget/índices verificados.

Dual-write não é necessário:

- writes de plan/settings continuam nas fontes de authoring existentes;
- writes financeiros continuam exclusivamente nos RPCs `investing_*`;
- legacy UI recebe projections/read models;
- a compatibilidade ocorre na leitura/shape, não duplicando estado.

## 6. Rollback seguro

| Falha | Rollback permitido | O que nunca fazer |
|---|---|---|
| Novo contrato/engine shadow falha | desligar shadow run | alterar livro ou executar output shadow |
| Persistence nova falha | parar criação de novos runs, manter ciclo operacional congelado | apagar snapshots já referenciados |
| Read model tem regressão | voltar ao adapter compatibility que lê as mesmas tabelas canónicas | voltar a `portfolio_items` como financeiro |
| Cutover de uma tab falha | desligar flag dessa tab | reativar reset/FixNow/broker shared |
| Backfill diverge | apagar apenas linhas de staging/backfill identificadas, após validar targets; repetir | modificar fills/ledger/projections para “bater” |
| Migration falha | aplicar migration forward de correção ou rollback ensaiado para objetos novos sem referências | `reset --hard`, drop amplo ou migration destrutiva improvisada |

Antes de cada release DB:

- confirmar projeto/ref alvo e migration ledger;
- backup e restore testado;
- dry run num staging isolado;
- estimar locks, tamanho e índices;
- aplicar uma migration de cada vez;
- smoke tests auth/RLS + Paper + Live block;
- monitorizar connections, CPU, IO, locks e error rate.

## 7. Plano específico de Plan, Portfolio, Advisor e Autonomy

### Plan

- preserva criação/edição funcional;
- cada engine run fixa a versão/linha e campos usados;
- mudanças de plan não reescrevem runs anteriores;
- resets de portfolio deixam de ser side effect de planeamento Investing.

### Portfolio

- apresenta actual, reserved e projected separadamente;
- contribuições/aberturas são comandos explícitos, não edição arbitrária de rows;
- `portfolio_items` pode manter shape visual temporário, mas não autoridade.

### Advisor

- lê explainability e latest persisted run;
- não dispara cálculo implícito nem escolhe quotes no browser;
- mostra claramente `degraded`, `blocked` e `no_trade`.

### Autonomy

- controla apenas ações permitidas sobre proposal/approval/Paper;
- shared broker, FixNow e Live não aparecem como alternativas Investing;
- estado mostrado vem de queue/orders/fills/reconciliation canónicos.

## 8. Critérios para desligar legacy

Um caminho legacy Investing só pode ser desligado/removido quando todos forem verdadeiros:

1. inventário de callers sem desconhecidos;
2. zero writes Investing no caminho durante pelo menos 30 dias;
3. zero tráfego necessário no consumer, ou adapter canónico equivalente;
4. 30 ciclos diários consecutivos de shadow parity para identidade, cash, positions, pending state e valuation dentro das tolerâncias definidas;
5. todos os resultados financeiros têm snapshot/run IDs e provenance;
6. testes de auth, RLS, deterministic replay, pending orders, hard constraints e Live block passam;
7. regressão Trading passa sem alteração do Trading core;
8. rollback da leitura foi ensaiado;
9. evidências e backup foram preservados;
10. owner operacional aprova o cutover.

Para delete físico de dados legacy, acrescentar retenção cumprida, backup restaurável e migration destrutiva revista separadamente.

## 9. Riscos bloqueantes e dependências

| Risco | Bloqueia | Mitigação/gate |
|---|---|---|
| Shared engine loop pode sincronizar Investing | qualquer cutover | M0 completo e testes de defesa em profundidade |
| Não existe market snapshot imutável | replay e confiança do engine | ENG-001/002 + freshness/quality contract |
| Pending orders não entram no estado projetado | rebalance correto | Portfolio State Engine + fixtures de todos os estados |
| `plans`/settings são inferidos e não version-pinned | mandato reproduzível | canonical input fixa row/version/hash |
| `portfolio_items` pode divergir sem provenance | backfill automático | candidatos + reconciliação/aprovação explícita |
| Staging anterior foi removido | promoção de migrations | recriar staging próprio isolado, sem dados/secrets de produção |
| Validação autenticada de submit→partial→fill→reconciled é residual | promoção operacional, não design | repetir em janela de mercado com quote source de staging |
| Catálogo/custos/tax são heurísticos | amplitude/confidence | universo piloto, degraded states e interfaces versionadas |
| Paridade do migration ledger por ambiente não está assumida | qualquer DB deploy | verificar local/remote antes de aplicar; nunca “repair” sem evidência |

## 10. Evidências preservadas

- baseline e mapa da Fase 1;
- relatórios de auditoria e validação PostgreSQL/Persistent Paper existentes em `docs/`;
- migrations `20260719120000` a `20260719290000` no workspace;
- prova desta fase do shared loop registada no documento de arquitetura;
- item residual de staging tratado como dependência de validação, não como falha do engine.
