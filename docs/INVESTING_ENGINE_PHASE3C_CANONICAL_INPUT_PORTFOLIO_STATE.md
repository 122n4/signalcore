# Investing Engine — FASE 3C: Canonical Input e Portfolio State

Data: 2026-07-20
Estado: concluída; aguarda aceitação explícita antes da FASE 3D

## 1. Resultado e arquitetura

A FASE 3C foi implementada como uma extensão isolada em `lib/investing/engine/v1/phase3c`. Não existe caller no runtime operacional, cutover, DB adapter, migration, UI, staging, execução ou proposal.

O fluxo criado é:

```text
read model autorizado + catálogo selado + market snapshot selado + asOf/version set
                                  |
                                  v
                    validação de identidade/ownership
                                  |
                                  v
                    allowlist de plan/settings
                                  |
                                  v
                Portfolio State Engine determinístico
                       actual / reserved / projected
                                  |
                                  v
                  CanonicalInvestingInputV1 selado
                         + inputHash SHA-256
```

Existem duas fronteiras:

1. `buildCanonicalInvestingInputFromSourcesV1` é a função pura sobre fontes já fixadas;
2. `CanonicalInvestingInputBuilderV1` apenas compõe três ports read-only — repository, catálogo e market snapshot — e entrega os snapshots à função pura.

O builder devolve:

- o `CanonicalInvestingInputV1` selado;
- a identidade da account selecionada;
- o authoring normalizado pela allowlist;
- um `PortfolioStateDerivationV1` auditável com `actual`, `reserved`, `projected`, valuations e issues.

O contrato 3B foi preservado sem alteração. Como `CanonicalInvestingInputV1` já contém `actual`, pending orders, `projected` e as reservas persistidas nos saldos/posições/ordens, toda a informação que determina o cálculo participa no `inputHash`. O estado `reserved` detalhado acompanha o resultado do builder como prova de derivação, sem abrir o contrato congelado.

## 2. Ports utilizados

### `InvestingCanonicalSourceRepositoryPortV1`

Expõe apenas `getFinancialReadModel(requestedUserId)`. A implementação desta fase é `InMemoryInvestingCanonicalSourceRepositoryV1`, exclusivamente por fixtures, sem client de base de dados.

### `InstrumentCatalogPort`

Reutiliza o port 3B e o `StaticPilotInstrumentCatalogAdapter`. O builder recebe um snapshot já versionado e selado.

### `MarketSnapshotPort`

Reutiliza o port read-only 3B. A implementação testada é `FixtureMarketSnapshotPort`; a pesquisa é feita apenas por `marketSnapshotId` explícito.

Nenhum port permite escrita.

## 3. Fontes autorizadas

O read model 3C aceita exclusivamente:

- identidade `requestedUserId`/owner;
- accounts Investing e seleção explícita de account `active` + `paper`;
- cash balances Investing;
- positions Investing;
- orders e reservas persistidas;
- fills identificados semanticamente para validar o cumulative fill/remainder;
- mandate snapshot associado ao mesmo user/account;
- plan/settings através da allowlist tipada;
- catálogo 3B versionado;
- market snapshot 3B selado;
- `VersionSet`;
- `asOf`, input snapshot ID e run ID explícitos.

Ownership divergente em identity, account, mandate ou order falha antes da construção. Accounts Live, fechadas ou suspensas não são selecionáveis. Havendo mais de uma account Paper elegível sem seleção inequívoca, o builder também falha fechado.

## 4. Fontes proibidas

O grafo 3C não importa nem consulta:

- `portfolio_items`;
- `portfolios`;
- `daily_snapshots`;
- `journal_entries`;
- browser ou `localStorage`;
- shared broker;
- FixNow;
- Trading;
- Supabase/runtime DB;
- workers ou APIs de execução;
- providers/quotes em runtime;
- relógio atual ou `Date.now()`.

Campos financeiros injetados em plan/settings são ignorados pela allowlist e não alteram cash, positions ou hash. Um teste de scan estático prova a ausência destas dependências no namespace completo.

## 5. Allowlist de plan/settings

Plan pode fornecer apenas `objective`, `riskProfile` e `horizon`. Estes valores nunca substituem o mandate: divergências geram warning e o mandate permanece autoritativo.

Settings pode fornecer apenas:

- `marketDataMaxAgeSeconds`;
- `orderStaleAfterSeconds`.

São strings inteiras decimais não negativas. Valores inválidos usam defaults versionados (`900` e `86400`) e degradam quality. Todos os outros campos são ignorados.

## 6. Tabela completa de estados de ordem

Em estados económicos ativos, a regra por side é sempre:

- buy: reserva/debita cash do remainder e adiciona a quantity restante ao projected;
- sell: reserva/subtrai quantity do remainder e mostra o crédito projetado, líquido da fee conhecida;
- pending sell proceeds nunca financiam a validação de pending buys;
- cumulative fills já pertencem ao estado factual e nunca são reaplicados.

| Estado | Terminal | Reserved | Projected | Remainder | Partial fill | Cancel/reject/failure/ambiguidade |
|---|---:|---:|---:|---|---|---|
| `proposed` | não | não | não | calculável, sem efeito | fill é contraditório | proposta não é compromisso económico |
| `approved` | não | sim | sim | `quantity - effectiveFilled` | só o remainder entra | mantém compromisso até estado terminal |
| `submitting` | não | sim | sim | `quantity - effectiveFilled` | só o remainder entra | submission em voo permanece reservada |
| `submitted` | não | sim | sim | `quantity - effectiveFilled` | só o remainder entra | mantém compromisso até estado terminal |
| `partially_filled` | não | sim | sim | `quantity - unique cumulative fills` | parte factual não é repetida | zero fill ou zero remainder é contraditório |
| `reconciling` | não | sim | sim | remainder conhecido; desconhecido permanece reservado | fills conhecidos contam uma vez | gera `degraded`, nunca liberta silenciosamente |
| `cancellation_requested` | não | sim | sim | `quantity - effectiveFilled` | fills conhecidos contam uma vez | só liberta após confirmação de cancelamento |
| `cancelled` | sim | não | não | zero | fills anteriores já estão no factual | liberta reserva; efeito pendente zero |
| `submission_failed` | sim | não | não | zero | fill é contraditório | liberta reserva; efeito pendente zero |
| `rejected` | sim | não | não | zero | fill é contraditório | liberta reserva; efeito pendente zero |
| `filled` | sim | não | não | zero | cumulative fill deve igualar quantity | estado terminal; não reaplica fill |
| `reconciled` | sim | não | não | zero | accounting já é factual | estado terminal; não reaplica efeito |

Um estado fora desta tabela gera `order_state_unknown`, quality `insufficient` e nenhum efeito inferido.

## 7. Modelo `actual / reserved / projected`

### ACTUAL

É exclusivamente factual e vem do read model autorizado:

- cash `available`, `settled` e `reserved` persistido;
- positions, quantity, persisted reserved quantity, cost basis e currency;
- base currency da account Paper;
- valuation e exposure calculadas exclusivamente pelo market snapshot selado;
- FX direto ou inverso procurado exclusivamente dentro do mesmo snapshot.

Orders e fills nunca corrigem retrospectivamente ACTUAL. Assume-se que os efeitos já realizados estão refletidos nas projections financeiras canónicas; fills servem apenas para provar o remainder.

### RESERVED

Mantém evidência separada por currency, symbol e order:

- reserva persistida agregada;
- reserva persistida declarada por orders;
- reserva económica recalculada sobre o remainder;
- fees/custos restantes quando disponíveis;
- reserva efetiva conservadora;
- IDs das orders contribuintes;
- conflitos entre as três leituras.

A reserva efetiva é o máximo entre o agregado persistido, a soma persistida das orders e o efeito económico calculado. Uma divergência bloqueia, mas o cálculo continua conservador para nunca disponibilizar o recurso em conflito.

### PROJECTED

Parte de ACTUAL e aplica apenas efeitos ainda pendentes:

- cash económico total é reconstruído como `available + persisted reserved`;
- pending buy retira uma única vez a reserva efetiva;
- pending sell acrescenta proceeds projetados líquidos de fee conhecida;
- buys são validados contra recursos atuais sem reutilizar reservas ou antecipar proceeds de sells;
- sell reduz uma única vez a maior quantity comprometida comprovada;
- buy adiciona apenas remaining quantity;
- projected positions/cash são novamente valorizados pelo snapshot selado;
- reservas no estado projected ficam a zero porque o efeito já foi aplicado na projeção.

Valores projetados negativos são preservados como evidência, nunca escondidos, e produzem quality `insufficient`/blocked.

## 8. Partial fills, duplicates e reservas

### Partial fills

1. Fills são deduplicados por `semanticFillId`.
2. Uma repetição byte-equivalente gera warning e conta uma vez.
3. Repetições contraditórias bloqueiam.
4. A soma dos fills únicos é comparada ao `cumulativeFilledQuantity` da order.
5. Divergência bloqueia; o maior valor comprovado é usado conservadoramente.
6. O valor é limitado à quantity da order para calcular remainder sem produzir efeito impossível.
7. Apenas `quantity - effectiveFilled` entra em reserved/projected.
8. `fill > quantity` e estados contraditórios bloqueiam.

### Orders duplicadas

Orders são ordenadas e deduplicadas por `semanticOrderId`. A duplicação gera erro material e só uma instância contribui para os efeitos. Duas orders legítimas com IDs semânticos distintos sobre o mesmo instrumento são agregadas deterministicamente.

### Reserva de cash

- notional buy = remaining quantity × unit price;
- unit price vem da própria order ou, quando ausente, do market snapshot selado;
- fee restante conhecida é acrescentada ao compromisso;
- persisted e economic são comparados exatamente como decimals;
- pending sell proceeds não aumentam o cash usado para validar buys.

### Reserva de quantity

- economic sell reservation = remaining quantity;
- persisted position reservation e order reservation são comparadas;
- o maior compromisso é usado na projeção;
- reserva superior à posição factual bloqueia.

## 9. Data quality

Classificação:

- zero issues: `good`, confidence `1`;
- apenas warnings suportados: `degraded`, confidence `0.5`;
- qualquer erro material: `insufficient`, confidence `0`.

O orchestrator operacional não é chamado. Quando um input `insufficient` for posteriormente avaliado pelo orchestrator puro 3B, a regra já provada produz `blocked`.

Issues materiais implementadas incluem:

- preço/FX/instrumento ausente;
- currency mismatch;
- cash negativo;
- quantity/decimal inválido;
- reserva superior ao recurso;
- order sem quantity/notional suficiente;
- estado desconhecido ou contraditório;
- cumulative fill superior à quantity ou divergente dos fills;
- semantic order/fill contraditório;
- persisted reservation inconsistente;
- source symbol/currency duplicado ou inválido;
- ownership ou account Paper inválida, que falham ainda antes da construção.

Warnings suportados incluem preço stale/degraded, order stale, `reconciling`, repetição idêntica de fill e authoring inválido/não autoritativo.

## 10. Determinismo e invariantes

- a matemática financeira usa coeficiente `BigInt` + escala, sem conversão por `Number`;
- todos os outputs financeiros são decimals canónicos;
- `NaN`, infinidades e numbers crus são contidos na fronteira, substituídos por zero apenas como evidência bloqueada e nunca entram no input canónico;
- sources, cash, positions, orders e issues são ordenados por chave semântica;
- ordem diferente das chaves/rows produz o mesmo input e hash;
- `asOf` é obrigatório; parsing de datas usa apenas os timestamps fornecidos;
- valuation, FX, staleness e projected usam exclusivamente o market snapshot selado;
- ACTUAL não incorpora novamente fills;
- RESERVED contém apenas compromissos económicos não terminais;
- PROJECTED aplica remainder uma única vez;
- terminal orders não alteram PROJECTED;
- projected negativo nunca passa sem `insufficient`;
- hard/material inconsistency nunca é reduzida por confidence;
- Live não é uma account selecionável nem um ambiente produzido;
- nenhuma proposal, order, fill, ledger entry ou reconciliation é criada.

## 11. Ficheiros criados

- `lib/investing/engine/v1/phase3c/types.ts`;
- `lib/investing/engine/v1/phase3c/decimalMath.ts`;
- `lib/investing/engine/v1/phase3c/orderSemantics.ts`;
- `lib/investing/engine/v1/phase3c/authoring.ts`;
- `lib/investing/engine/v1/phase3c/portfolioState.ts`;
- `lib/investing/engine/v1/phase3c/repository.ts`;
- `lib/investing/engine/v1/phase3c/canonicalInputBuilder.ts`;
- `lib/investing/engine/v1/phase3c/index.ts`;
- `tests/investingEnginePhase3CCanonicalInput.test.ts`;
- `tests/investingEnginePhase3CIsolation.test.ts`;
- `docs/INVESTING_ENGINE_PHASE3C_CANONICAL_INPUT_PORTFOLIO_STATE.md`.

Nenhum ficheiro da FASE 3B foi alterado. Não foram alterados Trading, Persistent Paper, accounting, reconciliation, Live blocking, 3A, APIs ou UI.

## 12. Testes e resultados

Regressão dirigida conjunta:

```text
npx vitest run
  tests/investingEnginePhase3CCanonicalInput.test.ts
  tests/investingEnginePhase3CIsolation.test.ts
  tests/investingEnginePhase3BContracts.test.ts
  tests/investingEnginePhase3BPortsIsolation.test.ts
  tests/investingEnginePhase3ASyncGuard.test.ts
  tests/investingEnginePhase3ALoop.test.ts
  tests/investingEnginePhase3ALegacyWrites.test.ts
  tests/investingEnginePhase3ABrokerRoutes.test.ts
  tests/investingArchitectureIsolation.test.ts
```

Resultado: **9 ficheiros, 102 testes, 102 aprovados**.

- 38 testes 3C;
- 26 testes 3B;
- 34 testes 3A;
- 4 testes de isolamento arquitetural base.

As fixtures cobrem portfolio vazio, cash-only, uma/múltiplas positions, pending buy/sell, partial buy/sell, duas orders no mesmo instrumento, estados terminais, cancellation requested, submission failed, order stale/ambígua, cash insuficiente, oversell, reservas inconsistentes, preço stale/ausente, FX ausente, instrumento ausente, decimal extremo, semantic duplicates, ordem de chaves/rows, fill repetido, allowlist sem fontes legacy, valores financeiros crus, ownership e Paper-only.

Validação estática:

- `npx tsc --noEmit`: aprovado;
- ESLint sobre todo o namespace/testes 3C: aprovado, sem warnings;
- `git diff --check`: aprovado;
- scan de imports/dependências proibidas: aprovado;
- caller operacional 3C: nenhum.

As seis falhas globais Trading Paper aceites como baseline externo continuam fora do diff e não foram corrigidas nem reabertas.

## 13. Limitações deliberadas

- repository e market ports permanecem in-memory/fixture;
- não existe DB adapter, persistence ou replay store;
- a valuation FX suporta pares diretos/inversos presentes no snapshot (`USDEUR`/`EURUSD` ou variante com underscore), sem provider fallback;
- o modelo de custos completo não existe; apenas fee restante explicitamente fornecida é considerada;
- projected sell proceeds são visíveis, mas nunca usados para autorizar funding de buys;
- não existe Risk Engine ou Policy/Constraint Engine completo;
- não existe Construction, Rebalance, liquidity, tax ou explainability final;
- não existe shadow comparison, UI cutover ou staging;
- não existe execução nem integração com o runtime atual.

## 14. Declarações finais

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- Migrations aplicadas: **não**.
- Live continua bloqueado: **sim**.
- FASE 3D iniciada: **não**.
