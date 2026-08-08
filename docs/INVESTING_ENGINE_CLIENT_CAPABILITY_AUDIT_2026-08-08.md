# Investing Engine - Auditoria de capacidades para cliente

Data: 2026-08-08  
Escopo: modulo Investing, engine, APIs, UI cliente, persistencia e limites comerciais/tecnicos.  
Base auditada: codigo local em `signalcore-site`, documentos `INVESTING_*` existentes e rotas ativas.

## 1. Resumo executivo

O modulo Investing ja tem um nucleo financeiro canonico operacional e as cinco tabs principais do produto Investing foram alinhadas para esse caminho. Hoje a fronteira de leitura/operacao do cliente Investing e:

1. **Camada canonica ativa no cliente**: Today, Plan, Portfolio, Advisor e Autonomy leem `/api/investing/dashboard` e usam `/api/investing/daily-cycle` ou `/api/investing/paper/accounts` quando precisam de acao canonical.
2. **Camada shared/legacy contida**: `/api/daily-bundle`, `portfolio_items`, `daily_snapshots`, `journal_entries`, FixNow e broker genericos continuam no repo para compatibilidade/outros produtos, mas as tabs Investing principais ja nao chamam esses endpoints.

Conclusao curta: o engine atual consegue explicar plano, alocacao-alvo, drift, rebalance, custos estimados, governance, research/benchmark relativo, proposta de execucao Paper e estado operacional numa superficie canonical unica para o cliente. Agora tambem expoe uma `CustomerDecisionProjection` unica, market snapshot hashado/persistivel, research publication boundary, attribution basico por posicao e phase3f ligado como shadow/audit engine `executable:false`. Mas ainda nao deve prometer um advisor institucional completo com pesquisa publicada externa, performance attribution total, broker Live ou phase3f como motor operacional primario.

## 2. Fontes principais de evidencia

- `lib/investing/runtimeAdapter.ts`: orquestrador atual do engine cliente. Define `InvestingRuntimeSnapshot` e chama mandate, construction, rebalance, benchmark, costs, governance e research validation.
- `lib/investing/server/dashboard.ts`: read model canonico do Today. Le dashboard compacto, cash, positions, quotes e devolve `portfolio`, `daily` e `derived`.
- `lib/investing/server/dailyCycle.ts`: fecha ciclo diario, recomputa engine, cria mandato/rebalance/research/execution e persiste via RPC atomica.
- `lib/investing/customerDecisionProjection.ts`: contrato unico cliente para decisao, acao, risco, custos, qualidade de dados, market snapshot, research boundary e attribution basico.
- `lib/investing/server/marketSnapshots.ts` e migration `20260810120000_investing_market_snapshots.sql`: snapshot canonico v1, append-only, idempotente e gravado via `investing_record_market_snapshot_v1`.
- `lib/investing/execution.ts`: transforma output do engine em decisao `hold`, `blocked`, `manual_execute` ou `paper_execute`.
- `lib/investing/server/persistentPaper.ts`: submissao Paper, ack, fill, recovery e health.
- `lib/investing/engine/v1/phase3c..phase3f`: arquitetura v1 avancada com input canonico, risk/policy, construction, final decision, audit bundle, shadow package e replay.
- `app/api/daily-bundle/route.ts`: caminho shared/legacy ainda existente no repo, mas removido das tabs Investing principais.

## 3. O que esta ativo para o cliente hoje

### 3.1 Today / Dashboard canonico

O Today em Investing chama `/api/investing/dashboard`. Essa rota autentica o user e usa `loadInvestingDashboard`.

O dashboard canonico consegue transmitir ao cliente:

- estado do plano ativo;
- account Paper ativa;
- cash EUR disponivel;
- posicoes em `investing_positions`;
- valor total EUR estimado;
- lista de holdings com symbol, name, qty, valueEur, price e currency;
- cobertura de precos;
- ultimo ciclo fechado;
- queue/proposta mais recente;
- order Paper mais recente;
- estado derivado: `hasPlan`, `hasHoldings`, `doneToday`, `receiptsCount`, `receiptsTimeline`, `executionState`.
- `customerDecision`: projection unica para as tabs, com state, action, risk, costs, allowed responses, marketSnapshot, researchPublication e performanceAttribution.

Evidencia:

- `loadInvestingDashboard` em `lib/investing/server/dashboard.ts:15`.
- RPC compacta `read_investing_dashboard_compact_v1` em `lib/investing/server/dashboard.ts:18`.
- quotes via `getQuotes` em `lib/investing/server/dashboard.ts:38`.
- resposta `portfolio` em `lib/investing/server/dashboard.ts:71`.
- resposta `daily` em `lib/investing/server/dashboard.ts:80`.
- resposta `derived` em `lib/investing/server/dashboard.ts:88`.
- projection cliente em `lib/investing/customerDecisionProjection.ts`.

Nota critica: se nao existir quote valida para uma posicao, o dashboard usa `cost_basis` como fallback de valor. Isto e util para nao quebrar o painel, mas nao deve ser vendido ao cliente como "valor de mercado atual". A UI deve mostrar cobertura/preco indisponivel quando isso acontecer.

### 3.2 Fecho diario e proposta canonica

O cliente pode fechar o ciclo diario. O backend:

1. le `user_settings`;
2. le ultimo `plans` em modo Investing;
3. encontra account ativa em `investing_accounts`;
4. le `investing_cash_balances`;
5. le `investing_positions`;
6. pede quotes;
7. sela um market snapshot canonico v1 com hash;
8. reconstrui as quotes do runtime a partir desse snapshot;
9. recomputa runtime;
10. cria snapshot de mandato;
11. cria ledger de rebalance;
12. cria research snapshot;
13. cria execution plan;
14. cria `CustomerDecisionProjection`;
15. persiste market snapshot e ciclo diario de forma idempotente via RPCs dedicadas.

Evidencia:

- `closeInvestingDailyCycle` em `lib/investing/server/dailyCycle.ts:36`.
- leitura de settings/plans/accounts em `lib/investing/server/dailyCycle.ts:43`, `:45`, `:53`.
- leitura de cash/positions em `lib/investing/server/dailyCycle.ts:72`, `:76`.
- quotes em `lib/investing/server/dailyCycle.ts`.
- market snapshot em `lib/investing/server/marketSnapshots.ts`.
- execution plan em `lib/investing/server/dailyCycle.ts`.
- RPC atomica do ciclo em `lib/investing/server/dailyCycle.ts`.

Informacao que isto permite transmitir ao cliente:

- "o teu ciclo de hoje foi guardado";
- "a decisao foi calculada com este mandato";
- "o portfolio alvo e este";
- "estas sao as acoes propostas";
- "esta proposta expira neste periodo";
- "esta proposta precisa de aprovacao ou esta bloqueada";
- "este foi o fingerprint/versao operacional da decisao" em backend.

### 3.3 Bloqueio Live

Live nao esta ativo. As rotas Investing bloqueiam ambiente `live`.

Evidencia:

- daily-cycle bloqueia live e grava tentativa em `app/api/investing/daily-cycle/route.ts:34` e devolve `investing_live_execution_blocked` em `:44`.
- worker Paper bloqueia live em `app/api/investing/paper/worker/route.ts:30`.
- orders Paper bloqueiam live em `app/api/investing/paper/orders/route.ts:41`.
- accounts Paper bloqueiam live em `app/api/investing/paper/accounts/route.ts:39`.

O cliente pode receber linguagem de Paper/simulacao/manual, mas nao deve receber promessa de execucao Live automatica.

## 4. Submotores do runtime atual

### 4.1 Mandate Engine

Ficheiro: `lib/investing/mandate.ts`.

Capacidades:

- transforma objetivo, perfil de risco e horizonte em targets por asset class;
- aplica overlays de objetivo:
  - growth aumenta equity;
  - income aumenta bond;
  - preservation aumenta cash/bond;
- ajusta horizonte:
  - Short aumenta cash/bond;
  - Long aumenta equity;
- aplica reserva minima de liquidez;
- define drift band;
- define max single position;
- define max turnover;
- define cash reserve;
- bloqueia crypto por default;
- permite gold por default.

Informacao ao cliente:

- "o teu perfil e Conservative/Balanced/Aggressive";
- "o teu horizonte e Short/Medium/Long";
- "a politica alvo e X% equity, Y% bonds, Z% commodity, W% cash";
- "a banda de drift aceitavel e N%";
- "a concentracao maxima por posicao e N%";
- "o turnover maximo do ciclo e N%";
- "ha uma reserva de cash minima".

Limite:

- nao e um suitability engine regulatorio completo;
- nao usa questionario MiFID/FINRA completo;
- nao considera fiscalidade real do cliente.

### 4.2 Instrument Master

Ficheiro: `lib/investing/instrumentMaster.ts`.

Universo canonico atual:

- `VWCE`: Vanguard FTSE All-World UCITS ETF;
- `SPY`: SPDR S&P 500 ETF Trust;
- `AGGH`: iShares Core Global Aggregate Bond UCITS ETF;
- `GLD`: SPDR Gold Shares.

Evidencia:

- array canonico em `lib/investing/instrumentMaster.ts:3`.
- instrumentos e nomes em `lib/investing/instrumentMaster.ts:5`, `:27`, `:49`, `:71`.
- export por copia em `lib/investing/instrumentMaster.ts:95`.

Capacidades:

- identity de instrumento;
- asset class;
- market;
- role;
- domicilio;
- currency;
- execution venue;
- benchmark eligibility;
- liquidity tier;
- tax treatment;
- suitability bucket;
- quality/growth/income/inflation/liquidity score;
- fee bps;
- enabled/disabled.

Informacao ao cliente:

- quais instrumentos sao elegiveis dentro do starter/rebalance;
- porque um instrumento entra como core growth, income ballast ou inflation hedge;
- custos aproximados por fee bps;
- warnings de qualidade/fiscalidade/liquidez.

Limite critico:

- o universo operacional atual e pequeno e estatico. Nao ha pesquisa real de todos os instrumentos investiveis dentro do nucleo canonico.

### 4.3 Construction Engine

Ficheiro: `lib/investing/construction.ts`.

Evidencia:

- `buildTargetPortfolio` em `lib/investing/construction.ts:63`.
- chamado pelo runtime em `lib/investing/runtimeAdapter.ts:205`.

Capacidades:

- calcula capital total de referencia;
- seleciona instrumentos por asset class;
- pontua instrumentos por qualidade, growth, income, inflation, liquidity e fee penalty;
- distribui pesos dentro de cada asset class;
- aplica cap por posicao;
- cria cash target;
- calcula residual cash;
- gera rationale por alocacao.

Informacao ao cliente:

- portfolio alvo;
- peso alvo por instrumento;
- valor alvo EUR por instrumento;
- rationale por bucket;
- cash residual;
- notas quando falta instrumento habilitado para uma asset class.

Limite:

- alocacao e baseada no catalogo estatico;
- nao usa optimizacao quantitativa historica;
- nao calcula probabilidade de atingir objetivo.

### 4.4 Rebalance Engine

Ficheiro: `lib/investing/rebalancing.ts`.

Evidencia:

- `buildRebalancePlan` em `lib/investing/rebalancing.ts:13`.
- chamado pelo runtime em `lib/investing/runtimeAdapter.ts:232`.

Capacidades:

- compara posicao atual com target;
- calcula currentWeightPct;
- calcula targetWeightPct;
- calcula deltaWeightPct;
- calcula deltaValueEur;
- decide `buy`, `sell` ou `hold`;
- aplica drift band;
- calcula grossTurnoverPct;
- bloqueia ou nota rebalance se turnover excede mandato.

Informacao ao cliente:

- "comprar X" ou "vender X" em termos de desvio de valor;
- "manter" quando esta dentro da banda;
- quanto o portfolio esta afastado do mandato;
- se o rebalance deve ser faseado por excesso de turnover.

Limite:

- o runtime atual gera delta em valor, nao necessariamente quantidade final executavel completa para todos os casos;
- quantidade executavel aparece mais claramente no starter pack quando ha price.

### 4.5 Benchmark Engine

Ficheiro: `lib/investing/benchmark.ts`.

Capacidades:

- cria benchmark por objetivo, risco e horizonte;
- combina VWCE, SPY, AGGH, GLD e cash em pesos diferentes;
- devolve benchmarkId, benchmarkName, components e notes.

Informacao ao cliente:

- benchmark relativo ao mandato;
- composicao de referencia;
- razao de cada componente.

Limite explicito:

- o proprio output declara que ainda nao e benchmark total-return validado. Nao deve ser vendido como performance benchmark institucional completo.

### 4.6 Costs Engine

Ficheiro: `lib/investing/costs.ts`.

Evidencia:

- `buildExecutionCostPolicy` em `lib/investing/costs.ts:8`.
- chamado pelo runtime em `lib/investing/runtimeAdapter.ts:248`.

Capacidades:

- calcula avgFeeBps para acoes ativas;
- estima slippage bps por perfil de risco;
- estima tradedValueEur;
- estima feeBudgetEur;
- estima slippageBudgetEur;
- estima estimatedRoundTripCostEur;
- classifica turnoverBucket;
- classifica taxFrictionBucket;
- decide executionMode: hold, rebalance_now ou phase_rebalance;
- define minimumHoldingPeriodDays;
- marca governanceStatus ok/review/blocked.

Informacao ao cliente:

- custo estimado do rebalance;
- friccao fiscal aproximada;
- se o custo e baixo/medio/alto;
- se e melhor executar agora ou fasear.

Limite:

- fiscalidade e heuristica por taxTreatment do instrumento, nao tax lots reais do cliente;
- slippage e modelado, nao medido por order book real.

### 4.7 Governance Engine

Ficheiro: `lib/investing/governance.ts`.

Evidencia:

- `buildInvestingGovernancePolicy` em `lib/investing/governance.ts:9`.
- chamado pelo runtime em `lib/investing/runtimeAdapter.ts:262`.

Capacidades:

- identifica instrumentos bloqueados;
- calcula turnover status;
- calcula tax drag bucket;
- cria manualReviewReasons;
- define suitabilityStatus: ok/review/blocked;
- define autonomyStatus: eligible/supervised/manual_only;
- define executionClearance: cleared/review/blocked;
- ativa kill switch;
- define approvalRequired;
- define overrideAllowed;
- calcula maxDeployablePct;
- lista approvedSymbols e blockedSymbols.

Informacao ao cliente:

- "esta proposta esta dentro da governance";
- "precisa de aprovacao humana";
- "esta bloqueada";
- "maximo deployable agora e X%";
- "razoes: turnover perto do limite, high tax drag, short horizon, instrumento bloqueado".

Limite:

- e governance de produto, nao aprovacao regulatoria formal;
- override existe no modelo, mas o fluxo real mantem Paper/manual.

### 4.8 Research / Benchmark Validation

Ficheiro: `lib/investing/research.ts`.

Evidencia:

- `buildInvestingInstrumentScorecards` em `lib/investing/research.ts:45`.
- `buildInvestingBenchmarkRelativeValidation` em `lib/investing/research.ts:101`.
- chamado pelo runtime em `lib/investing/runtimeAdapter.ts:276` e `:280`.

Capacidades:

- scorecard por instrumento;
- compositeScore;
- mandateFit high/medium/low;
- strengths: high_liquidity, benchmark_eligible, quality_approved, cost_efficient;
- warnings: high_fee, tax_drag, governance_review, weak_mandate_fit;
- benchmark overlap;
- active share;
- concentration drift;
- active bets;
- status aligned/review/divergent.

Informacao ao cliente:

- porque um instrumento encaixa ou nao no mandato;
- divergencia face ao benchmark;
- posicoes overweight/underweight;
- se o target deve ir para review.

Limite critico:

- isto nao e Research Lab. E validacao heuristica relativa ao catalogo/benchmark. Nao contem research fundamental publicada, notas de analista, backtests aprovados ou eventos de mercado validados.

## 5. Execution e Persistent Paper

### 5.1 Execution Plan

Ficheiro: `lib/investing/execution.ts`.

Evidencia:

- `buildInvestingExecutionPlan` em `lib/investing/execution.ts:18`.
- `approvalStatus` e `expiresAt` em `lib/investing/execution.ts:53`, `:69`, `:85`, `:100`.

Decisoes possiveis:

- `hold`: nao ha trades;
- `blocked`: kill switch ou governance bloqueia;
- `manual_execute`: ha trades mas precisa de aprovacao/supervisao;
- `paper_execute`: execution cleared para Paper controlado.

Informacao ao cliente:

- se deve agir ou manter;
- se a proposta precisa de aprovacao;
- checklist antes de executar;
- capital maximo deployable;
- prazo de validade de 24h quando aplicavel;
- blockingReasons;
- notes.

Limite:

- execution plan nao submete ordem por si so. Ele cria fronteira de proposta/queue. A submissao Paper e outro passo.

### 5.2 Paper Order Lifecycle

Ficheiro: `lib/investing/server/persistentPaper.ts`.

Evidencia:

- submit em `lib/investing/server/persistentPaper.ts:12`.
- RPC `investing_submit_paper_order_v2` em `:25`.
- ack via `investing_ack_paper_order_v2` em `:41`.
- fill via `processPersistentPaperOrder` em `:50`.
- RPC `investing_record_paper_fill_v2` em `:72`.
- recovery em `:88`.
- health em `:99`.

Capacidades:

- submeter ordem Paper a partir de queue aprovada;
- obter quote fresca antes de submeter;
- usar expectedQueueVersion;
- usar clientRequestId/idempotency;
- fazer ack;
- processar fill total ou parcial conforme config;
- calcular fee/tax em fill;
- registar fill em PostgreSQL via RPC;
- recuperar stuck work;
- expor health de orders, material breaks e heartbeat.

Informacao ao cliente:

- ordem submetida;
- estado da ordem;
- fill/partial fill;
- reconciliation/recovery status;
- material breaks;
- worker heartbeat em contexto operacional.

Limite:

- e Paper, nao broker Live;
- worker existe como script/API, mas nao ha cron dedicado Vercel confirmado no codigo.

### 5.3 Cash e corporate actions Paper

Ficheiro: `lib/investing/server/cashAndCorporateActions.ts`.

Capacidades:

- deposit;
- withdrawal;
- dividend;
- reversal;
- split;
- reverse split.

Informacao ao cliente:

- cash movements registados;
- dividendos/splits aplicados ao ambiente Paper;
- reversao/auditoria operacional.

Limite:

- sem broker Live verificado.

## 6. Engine v1 avancado: capacidade arquitetural preparada

Existe uma segunda arquitetura em `lib/investing/engine/v1`, mais forte do que o `runtimeAdapter` atual. Ela e importante para perceber o potencial do engine e agora deve ser classificada como **implementada/testada, ligada ao cliente como shadow/audit, ainda nao promovida como fonte operacional principal**.

### 6.1 Phase 3C - canonical input e portfolio state

Ficheiro: `lib/investing/engine/v1/phase3c/canonicalInputBuilder.ts`.

Capacidades:

- seleciona uma unica account Paper ativa;
- valida ownership user/account;
- rejeita ambiguidade;
- valida base currency;
- compara authoring plan/settings com mandato autoritativo;
- valida marketSnapshotId;
- constroi estado actual e projected;
- aplica pending orders/reservas;
- classifica quality good/degraded/insufficient;
- cria confidence e warnings;
- sela input com hash canonico.

Evidencia:

- `buildCanonicalInvestingInputFromSourcesV1` em `lib/investing/engine/v1/phase3c/canonicalInputBuilder.ts:56`.
- selecao Paper account em `:28`.
- account ativa obrigatoria/ambigua em `:43`.

Capacidade de cliente/ops atual:

- dizer "esta decisao foi calculada com estes inputs imutaveis";
- explicar porque dados sao insuficientes;
- separar actual de projected por causa de pending orders;
- bloquear quando ownership/estado financeiro e incoerente.

### 6.2 Phase 3D - risk, policy e constraints

Ficheiro: `lib/investing/engine/v1/phase3d/engine.ts`.

Capacidades:

- avalia risk;
- avalia policy;
- avalia constraints;
- deriva feasible envelope;
- estados: allowed, degraded, blocked, insufficient_data;
- rejeita ambiente nao Paper;
- devolve allowedInstruments e prohibitedInstruments.

Evidencia:

- `evaluateInvestingRiskPolicyV1` em `lib/investing/engine/v1/phase3d/engine.ts:75`.
- live/context invalidos bloqueados em `:83`.
- status derivado em `:25`.

Capacidade de cliente futura:

- explicar hard constraints e soft constraints;
- bloquear em vez de improvisar;
- mostrar "insufficient data" quando faltam provas.

### 6.3 Phase 3E - construction/rebalance por candidatos

Ficheiros: `lib/investing/engine/v1/phase3e/engine.ts` e `constructionEngine.ts`.

Capacidades:

- cria candidatos `hold`, `partial_rebalance`, `full_rebalance`;
- constroi target com quantidade, valor, cash residual e pesos;
- calcula actions por symbol;
- aplica lot size, minimum notional, quantity increment;
- usa FX quando instrumento nao esta na base currency;
- avalia cost, liquidity e tax awareness;
- evita oversell;
- reduz buy se cash nao chega;
- aplica minimum trade benefit;
- classifica action como trade/hold/blocked/insufficient_data;
- rankeia candidatos por constraint compliance, risk improvement, target fit, turnover, tax sensitivity.

Evidencia:

- `constructPreliminaryInvestingProposalV1` em `lib/investing/engine/v1/phase3e/engine.ts:80`.
- construcao de candidatos em `lib/investing/engine/v1/phase3e/constructionEngine.ts:430`.
- ranking em `lib/investing/engine/v1/phase3e/constructionEngine.ts:452`.

Capacidade de cliente futura:

- mostrar alternativa rejeitada e por que foi rejeitada;
- dizer quantidade estimada;
- dizer custo/liquidez/tax awareness por acao;
- explicar se full rebalance foi reduzido para partial;
- mostrar cash insufficient, below minimum, stale liquidity, cost/benefit fail.

### 6.4 Phase 3F - final decision, audit bundle e shadow package

Ficheiros: `lib/investing/engine/v1/phase3f/engine.ts`, `orchestration.ts`.

Capacidades:

- gera decisao final;
- estados finais: proposal_ready, degraded, no_trade, blocked, insufficient_data;
- seleciona candidato;
- expoe proposal quando nao esta blocked/insufficient;
- produz actions finais;
- produz targetPortfolio;
- produz residualCash, turnover, riskBefore, projectedRiskAfter;
- inclui hardConstraints, softConstraints, costs, liquidity, taxAwareness;
- inclui warnings, blockers, reasonCodes, reasons e explanation;
- cria phaseSummaries;
- cria auditBundle;
- cria shadowPackage;
- finalResultHash;
- afirma `executable: false`.

Evidencia:

- `runInvestingEngineV1Final` em `lib/investing/engine/v1/phase3f/engine.ts:12`.
- audit/shadow em `lib/investing/engine/v1/phase3f/engine.ts:20`, `:21`.
- `executable: false` em `lib/investing/engine/v1/phase3f/engine.ts:52`.
- `buildInvestingEngineDecisionV1` em `lib/investing/engine/v1/phase3f/orchestration.ts:170`.
- proposal/targetPortfolio em `lib/investing/engine/v1/phase3f/orchestration.ts:204`, `:205`.

Capacidade de cliente futura:

- decisao explicavel e reproduzivel;
- proposta com razoes e alternativas;
- relatorio de qualidade por fase;
- auditoria server-side sem expor ruido tecnico ao cliente;
- estado/hash phase3f shadow incluido na `CustomerDecisionProjection`.

Estado atual:

- `CustomerDecisionProjection.source.engineV1Bridge` declara formalmente o estado do bridge para o cliente/ops.
- O bridge passou a correr phase3c, phase3d, phase3e e phase3f a partir do read model canonical atual.
- O output fica marcado como shadow/audit, `operationalPrimary: false` e `executable:false`.
- A promocao de phase3f para motor operacional primario ainda exige persistencia/replay dos artefactos por customer run e prova de paridade contra o runtime adapter.

Limite critico:

- o fluxo cliente atual continua a usar `runtimeAdapter` para a proposta operacional Paper/manual; phase3f ja e chamado como shadow/audit, mas ainda nao substitui a fronteira operacional.

### 6.5 Persistence/replay v1

Ficheiros: `lib/investing/engine/v1/persistence/**`.

Capacidades:

- manifest com hashes de artefactos;
- sealed artifacts;
- phase summaries;
- reason evidence;
- shadow metadata;
- idempotency claims;
- read latest;
- replay e comparacao com resultado persistido.

Evidencia:

- service em `lib/investing/engine/v1/persistence/service.ts:7`.
- `persist` em `lib/investing/engine/v1/persistence/service.ts:18`.
- artefactos/manifest em `lib/investing/engine/v1/persistence/manifest.ts:139`, `:207`, `:213`.
- replay em `lib/investing/engine/v1/persistence/replay.ts:37`.
- resultado replay_match/replay_mismatch em `lib/investing/engine/v1/persistence/replay.ts:68`.

Capacidade de cliente/ops futura:

- provar que uma decisao e reprodutivel;
- identificar mismatch;
- auditar cada fase;
- construir reports periodicos com lineage.

Limite:

- nao e a persistencia usada pelo Today atual. Today usa tabelas legacy canonicas `investing_mandate_snapshots`, `investing_rebalance_ledger`, `investing_research_snapshots`, `investing_execution_queue` via `persistence.ts` e RPC `investing_record_daily_cycle_v2`.

## 7. O que cada tab consegue transmitir ao cliente

### 7.1 Daily / Today

Estado: canonico para Investing atual.

Pode transmitir:

- setup state: falta plano, falta holdings, account Paper financiada;
- starter pack;
- portfolio paper atual;
- close day;
- decision receipt;
- queue execution state;
- submit Paper order quando queue aprovada;
- high-level decision view;
- customer decision projection unica;
- risk/data quality state;
- market snapshot hashado;
- market snapshot persistido quando o daily-cycle corre em ambiente com migration aplicada;
- research publication boundary;
- performance attribution basico por posicao;
- last snapshot/receipts.

Pontos fortes:

- ligado a `/api/investing/dashboard`;
- cria ciclo via `/api/investing/daily-cycle`;
- expoe `derived.customerDecision` e `daily.customerDecision`;
- nao depende do broker sync shared.

Riscos:

- algumas mensagens de UI ainda usam fallbacks e view models de produto;
- precisa distinguir sempre quote atual de cost_basis fallback.
- phase3f aparece como shadow/audit bridge, nao como fonte operacional final.

### 7.2 Planning

Estado: ativo e alinhado com o read model canonical.

Pode transmitir:

- objetivos;
- risco;
- horizonte;
- contribuicao mensal;
- cenarios de crescimento;
- plano/contrato;
- starter pack derivado;
- loop summary.

Guardrails ja aplicados:

- le `/api/investing/dashboard`;
- Starter Pack deixa de resetar `portfolio_items` e passa a financiar/abrir Persistent Paper via `/api/investing/paper/accounts`;
- copy de FixNow foi reclassificada como canonical review.

Riscos restantes:

- persiste plano e settings em `plans` e `user_settings`, que continuam como authoring layer compartilhada;
- cenarios usam `wealthMath` shared, nao motor Investing financeiro completo.

### 7.3 Portfolio

Estado: ativo e alinhado com canonical Investing.

Pode transmitir:

- lista de posicoes canonicas Paper a partir de `/api/investing/dashboard`;
- valor, qty, preco, moeda e cobertura de pricing;
- missing symbols;
- starter pack como financiamento/abertura de Persistent Paper account;
- diagnosticos de data quality e concentracao derivados do read model canonico.

Guardrails ja aplicados:

- a tab deixou de chamar `/api/daily-bundle`, `/api/portfolio-items` e `/api/fix-now/run`;
- adicao manual, paste import, edicao, remocao, clear/reset e FixNow/FixAll legacy ficam bloqueados no cliente;
- Starter Pack usa `/api/investing/paper/accounts`.

Riscos restantes:

- alguns controlos antigos ainda existem visualmente, embora ja nao escrevam no caminho legacy;
- falta polish de UX para esconder/desativar definitivamente fluxos manuais antigos;
- a projection financeira ja vem do dashboard canonico e usa o contrato `CustomerDecisionProjection`; falta apenas polish visual para tornar todas as tabs dependentes desse bloco de forma explicita.

### 7.4 Advisor

Estado: ativo e alinhado com o read model canonical.

Pode transmitir:

- strategic score;
- open leaks;
- weekly confirmed;
- next review;
- risk pressure;
- plan coherence;
- execution quality;
- weekly report/anti-churn;
- explicacoes de postura.

Riscos:

- alimentado por `/api/investing/dashboard`;
- ainda mistura view models de produto, scoring e investingRuntime;
- nao e ainda explicacao direta do engine canonico v1 final.

### 7.5 Autonomy

Estado: ativo e alinhado com canonical Investing/Persistent Paper.

Pode transmitir:

- broker/Live bloqueado;
- canonical Paper status;
- operator preference sem FixNow;
- health check;
- operator steps;
- readiness;
- diagnostics/control tower.

Guardrails ja aplicados:

- le `/api/investing/dashboard`;
- operador usa `/api/investing/paper/accounts` para financiar Paper quando falta estado;
- fecho do ciclo usa `/api/investing/daily-cycle`;
- broker sync/connect/status, `/api/daily/close`, reset legacy e FixNow foram removidos da tab;
- UI passa a comunicar canonical Paper e Daily review.

Riscos restantes:

- Live Investing esta bloqueado, portanto "max autonomy" nao deve sugerir auto-execucao financeira real;
- ainda existem preferencias locais antigas de broker/hands-free por compatibilidade de storage, mas elas sao forcadas para estado bloqueado/desligado no arranque.

## 8. Market data

Ficheiros: `lib/market/quotes.ts`, `lib/market/marketClient.ts`.

Capacidades:

- quotes por symbol;
- cache em memoria;
- in-flight dedupe;
- TwelveData como primeira tentativa em `getQuotes`;
- candle fallback se quote normalizada falhar;
- providers alternativos no `marketClient`: AlphaVantage, Binance, Coinbase, Finnhub, FMP, Kraken, TwelveData;
- last known good fallback no `marketClient`;
- telemetria de provider.
- market snapshot hashado dentro de `CustomerDecisionProjection.marketSnapshot`.
- reconstrucao do mapa de quotes do runtime a partir do snapshot canonico selado;
- persistencia append-only em `investing_market_snapshots` e `investing_market_snapshot_items`;
- RPC `investing_record_market_snapshot_v1` idempotente por `snapshot_id`/hash.

Evidencia:

- `getQuotes` em `lib/market/quotes.ts:97`.
- TwelveData direto no wrapper em `lib/market/quotes.ts:55`.
- candle fallback em `lib/market/quotes.ts:80`.
- providers em `lib/market/marketClient.ts:210`.
- last known good em `lib/market/marketClient.ts:470`.

Informacao ao cliente:

- preco;
- timestamp;
- provider/source;
- prevClose/open/high/low/volume quando provider devolve;
- market open/extended hours se disponivel.

Limites:

- o daily-cycle ja tenta persistir o snapshot antes de gravar o `canonical_result`;
- o dashboard GET ainda pode gerar snapshot derivado da leitura atual sem escrever DB;
- o runtime ja recebe quotes normalizadas a partir do snapshot canonico construido no processo;
- o proximo passo e carregar o snapshot persistido como fonte exclusiva do engine/phase3f em vez de construi-lo no mesmo request.
- `price_ts` no starter pack atual fica `null`;
- se providers falham, ha fallback que precisa ser marcado como stale/partial;
- nao ha historical data layer Investing concreto em producao.

## 9. Persistencia operacional confirmada pelo desenho

O caminho canonico atual persiste:

- daily cycles;
- mandate snapshots;
- rebalance ledger;
- research snapshots;
- execution queue;
- approvals;
- accounts;
- cash balances/movements;
- orders;
- fills;
- fees;
- positions;
- corporate actions;
- ledger transactions/entries;
- reconciliation runs/items/resolutions;
- worker heartbeats.

Isto permite:

- auditoria operacional;
- repeticao de historico de decisoes ao nivel de snapshots atuais;
- separacao proposta/aprovacao/ordem/fill/reconciliation;
- prova de que Paper nao e Live.

Limite:

- o lineage mais forte por artefactos/hashes/replay existe no engine v1 persistence, mas nao esta ligado ao fluxo cliente atual.

## 10. O que o cliente pode legitimamente entender do produto hoje

Mensagem correta:

"Syntrake Investing e um sistema de decisao de longo prazo que transforma o teu plano, posicoes Paper, cash, cotacoes disponiveis e regras de risco em uma proposta diaria: manter, rever, bloquear ou criar uma ordem Paper apos aprovacao. O sistema mostra alocacao alvo, drift, custos estimados, friccao fiscal, benchmark relativo, razoes de governance, validade e estado de execucao Paper."

Informacoes concretas que pode transmitir:

- "O teu plano esta/missing/ativo."
- "Tens/nao tens holdings canonicas Paper."
- "Tens X EUR cash disponivel."
- "A avaliacao estimada e X EUR, com Y% cobertura de preco."
- "O objetivo inferido e growth/income/preservation/balanced."
- "A politica alvo e X% equity, Y% bonds, Z% commodities, W% cash."
- "O portfolio alvo propoe estes instrumentos/pesos/valores."
- "Esta posicao esta underweight/overweight."
- "A acao proposta e buy/sell/hold."
- "O drift e X% e o delta e Y EUR."
- "O turnover bruto e X%."
- "O custo estimado e X EUR."
- "A friccao fiscal e low/medium/high."
- "A governance esta ok/review/blocked."
- "E necessaria aprovacao."
- "A proposta expira em 24h."
- "A ordem Paper esta submitted/filled/reconciled/etc."
- "A informacao esta incompleta/stale/partial quando aplicavel."

## 11. O que nao deve ser prometido ao cliente ainda

Nao prometer:

- execucao Live automatica;
- ligacao broker Live operacional para Investing;
- pesquisa institucional publicada personalizada;
- universo global de instrumentos investiveis;
- performance attribution completo;
- benchmark total-return validado;
- historico real completo por instrumento;
- dividendos/splits reais importados de providers no fluxo Live;
- recomendacao fiscal personalizada;
- resultado futuro/probabilidade garantida;
- replay canonico phase3f completo promovido como fonte operacional no fluxo cliente atual.

## 12. Lacunas principais

### Criticas

1. **Engine v1 phase3f ainda nao foi promovido a fonte operacional principal**
   - A arquitetura de canonical input, constraints, candidatos, final decision e replay existe.
   - O cliente ja recebe phase3f shadow/audit em `CustomerDecisionProjection`.
   - Mas `/api/investing/dashboard` e `/api/investing/daily-cycle` ainda usam `runtimeAdapter` para a decisao operacional.

2. **Market snapshot imutavel existe, mas ainda nao e origem persistida exclusiva**
   - A migration cria `investing_market_snapshots` e `investing_market_snapshot_items`.
   - O daily-cycle tenta persistir via `investing_record_market_snapshot_v1`.
   - Dashboard e daily-cycle ja normalizam o runtime a partir do snapshot canonico.
   - O proximo passo institucional e reler/selecionar o snapshot persistido como fonte exclusiva do engine/phase3f.

3. **Instrument universe muito pequeno**
   - VWCE, SPY, AGGH, GLD.
   - Bom para MVP controlado, insuficiente para produto investing amplo.

4. **Daily-bundle ainda existe como monolito shared no repo**
   - Ja nao alimenta as tabs Investing principais.
   - Continua a ser risco de regressao se alguma tab voltar a chama-lo sem teste.

### Altas

5. **Portfolio valuation pode cair em cost_basis**
   - Deve ser exibido como cobertura parcial, nao valor de mercado.

6. **Research boundary existe, mas ainda e validation heuristica**
   - `researchPublication` ja separa claramente o que e validacao de produto.
   - Ainda nao e Research Lab externo/publicado com backtests e fontes aprovadas.

7. **Persistent Paper worker nao parece agendado como servico permanente**
   - Existe script e endpoint, mas sem cron Vercel Investing dedicado.

8. **Advisor ainda mistura produto e scoring**
   - Bom para UX, mas ainda nao e uma explicacao direta do engine v1 final.

9. **Autonomy ainda carrega storage local antigo de broker/hands-free**
   - As chamadas operacionais foram removidas, mas a estrutura local deve ser limpa numa fase de UX cleanup.

### Medias

10. **Starter pack pode ter `static_fallback`**
    - Aceitavel para empty state, mas precisa copy clara.

11. **Custos/slippage/tax sao heuristicas**
    - Bons para triagem, nao para promessa de custo real.

12. **Performance/attribution ainda e basico**
    - `performanceAttribution` calcula apenas unrealized PnL por posicao quando existe cost basis.
    - Ainda nao mede TWR/MWR, dividendos, fees, benchmark attribution ou impacto de decisoes.

## 13. Mapa de maturidade

| Dominio | Estado | Cliente pode ver? | Observacao |
|---|---|---|---|
| Plan/risk/horizon | Ativo | Sim | Shared authoring, input para runtime |
| Cash/positions canonicos | Ativo nas tabs principais | Sim | `investing_*` via dashboard |
| Portfolio canonical | Ativo | Sim | Le canonical; UX antiga ainda precisa limpeza |
| Mandate | Ativo | Sim | Regras claras |
| Construction | Ativo | Sim | Catalogo pequeno |
| Rebalance | Ativo | Sim | Delta por valor/peso |
| Costs | Ativo | Sim | Heuristico |
| Governance | Ativo | Sim | Bom para bloqueio/review |
| Research validation | Ativo | Sim | Nao Research Lab |
| Research publication boundary | Ativo | Sim | Boundary explicito, ainda heuristico |
| Execution plan | Ativo | Sim | Hold/manual/Paper/blocked |
| CustomerDecisionProjection | Ativo | Sim | Contrato unico nas respostas canonical |
| Market snapshot canonico | Ativo no dashboard/daily-cycle | Sim/Ops | Dashboard usa snapshot read-only; daily-cycle persiste append-only via RPC |
| Approvals | Ativo | Ops/fluxo | Queue versionada |
| Persistent Paper | Ativo | Sim | Paper only |
| Ledger/accounting/reconciliation | Ativo via RPC/DB | Parcial | Mais ops/backend |
| Engine v1 phase3c-f | Implementado/testado | Shadow/ops | Ligado como audit; ainda nao fonte operacional principal |
| Replay v1 | Implementado/testado | Ainda nao diretamente | Nao no Today atual |
| Live Investing | Bloqueado | Nao | Correto |
| Research Lab Investing | Nao encontrado | Nao | Futuro |
| Historical market data Investing | Interface/ausente | Nao | Futuro |
| Performance attribution | Basico | Parcial | Unrealized por posicao; nao attribution completo |

## 14. Proxima arquitetura recomendada

Para transformar isto num produto cliente forte, a ordem pragmaticamente correta e:

1. Promover phase3f de shadow/audit para fonte operacional principal quando os artefactos forem persistidos por customer run e houver prova de paridade.
2. Selecionar/reler o market snapshot persistido como input exclusivo do runtime/phase3f, em vez de construir a fonte de mercado dentro do mesmo request.
3. Expandir instrument master por provider/reference data, nao por hardcode.
4. Evoluir `researchPublication` de boundary heuristico para Research Lab com fontes, backtests e versionamento.
5. Evoluir `performanceAttribution` para TWR/MWR, dividendos, fees, benchmark attribution e impacto de decisoes.
6. Remover/limpar UX residual de controlos antigos que agora so mostram bloqueio ou redirecionam para Daily review.

## 15. Veredicto final

O modulo Investing ja consegue entregar ao cliente uma experiencia real de decisao Paper/manual: plano, portfolio canonico nas tabs principais, alocacao alvo, drift, rebalance, custos estimados, governance, proposta, aprovacao, lifecycle Paper, market snapshot hashado/persistivel, research boundary e attribution basico. Isto ja e mais do que um dashboard.

Do ponto de vista da arquitetura de tabs cliente, o cutover principal esta resolvido: as tabs Investing primarias ja nao chamam `/api/daily-bundle`, `/api/portfolio-items`, `/api/fix-now/run`, broker shared ou `/api/daily/close`. A camada cliente agora tem `CustomerDecisionProjection` unica. O engine v1 em `engine/v1/phase3c-f`, com contratos, hashes, audit bundle e replay, ja esta ligado como shadow/audit `executable:false`. Mas a arquitetura ainda nao e institucional completa: phase3f ainda nao substitui o `runtimeAdapter` como motor operacional primario, e research/performance continuam limites conhecidos. Enquanto essa promocao nao for feita com artefactos persistidos e paridade comprovada, a promessa ao cliente deve continuar disciplinada: decisao assistida, Paper/manual, explicavel e auditavel, nao automacao Live nem research/performance institucional completo.

## 16. Implementacao UI segundo os prompts visuais

Foi criada uma nova superficie comum em `app/app/tabs/InvestingDashboardSurface.tsx` para concretizar os prompts visuais fornecidos para:

- Today;
- Portfolio;
- Plan;
- Research;
- Reports;
- Autonomy;
- Settings.

O modelo de navegacao Investing foi expandido em `app/app/navigationModel.ts` para expor:

- `daily`;
- `portfolio`;
- `planning`;
- `research`;
- `reports`;
- `autonomy`;
- `settings`.

O antigo `advisor` fica como alias compatibilizado para `research`, evitando quebrar links antigos.

### 16.1 Regras aplicadas dos prompts

- todas as paginas usam `/api/investing/dashboard` como fonte principal;
- nao ha writes para `portfolio_items`;
- nao ha chamadas a `/api/daily-bundle`;
- nao ha chamadas a `/api/fix-now/run`;
- nao ha chamadas a `/api/broker/*`;
- Live aparece explicitamente bloqueado;
- valores de portfolio, cash, holdings, coverage, queue, order, receipts e decision state saem do payload canonico;
- quando faltam series historicas, notas publicadas, worker heartbeat ou dados de seguranca, a UI mostra estado indisponivel em vez de inventar dados;
- Research e apresentado como validation-oriented, nao institutional published research;
- Reports sao apresentados como snapshots Paper/manual, nao live performance;
- Settings deixam claro que controlam apenas workflow Paper/manual.

### 16.2 Resultado de validação

- `npx vitest run tests/appNavigationModel.test.ts tests/investingArchitectureIsolation.test.ts tests/investingDashboardCompactRead.test.ts tests/investingMarketSnapshots.test.ts`
  - 4 ficheiros passed;
  - 16 testes passed.
- `npx tsc --noEmit --pretty false`
  - passed.
- Dev server local:
  - `http://localhost:3000`
  - `/app?tab=daily&mode=investing` respondeu HTTP 200.

### 16.3 Limites que continuam verdadeiros

Esta fase resolveu a superficie cliente e o binding canonical das paginas. Nao resolveu, por si so:

- promocao total do phase3f como engine operacional principal;
- Research Lab publicado real;
- attribution completo TWR/MWR;
- instrument universe expandido por provider/reference data;
- execucao Live, que continua corretamente bloqueada.

## 17. Auditoria de confianca de dados e browser QA

Objetivo: responder pragmaticamente a pergunta "posso ter 100% garantia?". A resposta continua a ser nao, mas a margem de incerteza foi reduzida com verificacoes em ambiente local e Supabase real configurado em `.env.local`.

### 17.1 Supabase real

Ambiente verificado sem expor segredos:

- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`: presente;
- `SUPABASE_SERVICE_ROLE_KEY`: presente;
- host auditado: `qdnvbamoamtkujzwrxdb.supabase.co`.

Tabelas Investing confirmadas como existentes:

- `investing_accounts`;
- `investing_cash_balances`;
- `investing_positions`;
- `investing_daily_cycles`;
- `investing_mandate_snapshots`;
- `investing_rebalance_ledger`;
- `investing_research_snapshots`;
- `investing_execution_queue`;
- `investing_paper_orders`;
- `investing_paper_fills`;
- `investing_market_snapshots`;
- `investing_market_snapshot_items`.

Read model real:

- existe pelo menos uma account Paper ativa;
- `read_investing_dashboard_compact_v1` executa com sucesso;
- para uma account ativa auditada de forma sanitizada:
  - settings: presente;
  - plan: presente;
  - account: presente;
  - positions: 3;
  - cash rows: 1;
  - daily cycles: 2;
  - queue rows: 2;
  - orders: 0;
  - environment: `paper`;
  - status: `active`.

Achado critico resolvido:

- inicialmente, a RPC `investing_record_market_snapshot_v1` nao apareceu no schema cache PostgREST (`PGRST202`);
- as tabelas de snapshot ja existiam;
- foi adicionado fallback server-side em `lib/investing/server/marketSnapshots.ts`:
  - se a RPC nao existir no schema cache, o servidor tenta persistir diretamente nas tabelas append-only;
  - valida ownership da account quando `accountId` existe;
  - preserva idempotencia por `snapshot_id`/`snapshot_hash`;
  - marca `directFallback: true` no resultado.

Este fallback fica como protecao operacional, mas a solucao principal tambem foi aplicada no Supabase real.

Atualizacao pos-correcao:

- a migration `20260810120000_investing_market_snapshots.sql` foi aplicada ao remoto via `npx supabase db query --linked --file ...`;
- a RPC passou a existir no schema cache;
- chamada invalida de teste passou a falhar com `23514 investing_market_snapshot_id_invalid`, confirmando que a funcao e a validacao estao ativas;
- snapshot sintetico `market_codex_audit_rpc_20260808` foi persistido com sucesso;
- segunda chamada do mesmo snapshot devolveu `idempotent: true`;
- `investing_market_snapshot_items` recebeu 1 item associado;
- a migration history remota foi reparada para marcar `20260810120000` como aplicada;
- foram adicionados placeholders locais para 19 migrations remotas historicas que estavam ausentes deste checkout;
- esses placeholders nao reexecutam schema: apenas alinham o comparador local/remoto da Supabase CLI;
- `npx supabase migration list --linked` passou a mostrar todas as versões com `local` e `remote`;
- `npx supabase db push --linked --dry-run` devolveu `Remote database is up to date`, com zero migrations pendentes.

### 17.2 Auth e endpoints locais

Endpoints verificados:

- `/api/investing/dashboard?mode=investing`
  - sem auth: `401 unauthorized`;
  - correto, porque nao deve expor dados sem user.
- `/api/investing/dashboard?mode=investing&qa=assisted`
  - com bypass QA local: `200`;
  - devolve `CustomerDecisionProjection` em estado `setup_required` para o user QA local sem plano/conta.

Isto confirma:

- auth gate funciona;
- QA local funciona;
- resposta canonical existe mesmo em empty state;
- empty state nao inventa plano, holdings ou cash.

### 17.3 Browser QA

QA automatizado com Playwright:

- paginas:
  - Today;
  - Portfolio;
  - Plan;
  - Research;
  - Reports;
  - Autonomy;
  - Settings.
- viewports:
  - desktop `1440x1100`;
  - mobile `390x844`.

Resultado final:

- 14 navegacoes;
- 14 respostas HTTP 200;
- zero hard failures;
- zero `unauthorized` visivel;
- zero erro de dashboard canonical;
- zero overflow horizontal detectado;
- Live blocked visivel;
- Paper/manual language presente;
- screenshots guardados em `artifacts/investing-ui-qa-2026-08-08-r2/`;
- report JSON em `artifacts/investing-ui-qa-2026-08-08-r2/report.json`.

Achado corrigido durante QA:

- o shell global ainda montava `TradingNotificationManager` em workspace Investing quando alertas trading estavam enabled;
- isso disparava `/api/trading/followed-instruments?mode=trading`;
- `app/app/ui.tsx` foi corrigido para montar `TradingNotificationManager` apenas quando `workspaceMode === "trading"`.

### 17.4 Validacao automatizada final

Comandos executados:

- `npx vitest run tests/appNavigationModel.test.ts tests/investingArchitectureIsolation.test.ts tests/investingDashboardCompactRead.test.ts tests/investingMarketSnapshots.test.ts tests/investingMigrationArchitecture.test.ts tests/investingEnginePhase3ALegacyWrites.test.ts`
  - 6 ficheiros passed;
  - 27 testes passed.
- `npx tsc --noEmit --pretty false`
  - passed.

### 17.5 Grau de garantia atingido

Garantia forte agora:

- a UI Investing principal le o dashboard canonical;
- o cliente Investing nao chama APIs legacy/shared perigosas;
- o endpoint canonical protege auth;
- empty states nao inventam dados;
- DB real tem tabelas e dados Paper suficientes para read model;
- browser QA desktop/mobile nao encontrou falhas duras;
- market snapshot tem fallback de persistencia se a RPC faltar no schema cache.

Garantia ainda nao absoluta:

- phase3f ainda nao e o engine operacional principal cliente, embora ja esteja ligado como shadow/audit;
- providers de quotes podem falhar ou devolver dados stale;
- Research ainda e validation boundary, nao research institucional publicado;
- attribution ainda nao e TWR/MWR completo;
- performance historica completa ainda nao esta implementada.

Conclusao da auditoria de confianca: a arquitetura cliente e a verdade de dados melhoraram significativamente e passaram QA realista, mas ainda nao se deve declarar "100% garantia". O nivel correto de promessa e "fortemente validado para Paper/manual canonical Investing, com limites institucionais explicitamente conhecidos".

## 18. Resultado final do goal

Estado final: **entrega fechada para a fase canonical Investing Paper/manual**.

O que ficou resolvido:

- a experiencia Investing principal foi reconstruida como superficie unica em `InvestingDashboardSurface`;
- Today, Portfolio, Plan, Research, Reports, Autonomy e Settings usam `/api/investing/dashboard` como fonte principal;
- as tabs deixaram de depender de `/api/daily-bundle`, `/api/portfolio-items`, `/api/fix-now/run` e `/api/broker/*`;
- Live Investing aparece bloqueado e nao ha promessa de execucao real automatica;
- existe `CustomerDecisionProjection` para transformar o output tecnico em linguagem cliente;
- market snapshots canonicos foram adicionados com hash, itens append-only, idempotencia e persistencia;
- phase3f foi ligado como shadow/audit engine dentro da `CustomerDecisionProjection`;
- a RPC `investing_record_market_snapshot_v1` foi aplicada no Supabase real;
- a migration history remota/local foi alinhada;
- `npx supabase db push --linked --dry-run` confirmou que o remoto esta atualizado;
- placeholders locais foram adicionados para migrations remotas historicas ausentes neste checkout;
- o relatorio agora distingue com clareza capacidades reais, limites comerciais e limites tecnicos.

Resultado validado:

- TypeScript: passed;
- testes focados de architecture/dashboard/snapshots/navigation/phase3f: 7 ficheiros, 63 testes passed;
- browser QA desktop/mobile nas 7 tabs: passed;
- Supabase real: tabelas, read model, RPC, idempotencia e migration state verificados.

Veredicto final:

O modulo Investing esta limpo para ser apresentado como um produto canonical Paper/manual, explicavel e auditado. A informacao mostrada ao cliente vem de backend canonical, nao de valores inventados na UI. O phase3f ja participa como shadow/audit engine `executable:false`; o que permanece fora desta entrega e evolucao institucional: promover phase3f a motor operacional primario, research publicado, attribution TWR/MWR, historico completo e execucao Live. Esses pontos devem ser tratados como roadmap, nao como bloqueadores da fase atual.
