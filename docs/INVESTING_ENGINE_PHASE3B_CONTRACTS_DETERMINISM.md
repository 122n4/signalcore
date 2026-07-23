# Investing Engine — FASE 3B: contratos v1 e determinismo

Data: 2026-07-20
Estado: concluída; aguarda aceitação explícita antes da FASE 3C

## 1. Âmbito e resultado

A FASE 3B introduz um namespace novo e isolado em `lib/investing/engine/v1`. Não existe cutover, caller no runtime atual, persistência nova, acesso a provider/DB, escrita em queue, criação de proposal operacional, ordem, fill, accounting ou reconciliation.

O resultado é um núcleo contratual determinístico composto por:

- `CanonicalInvestingInputV1`;
- `InvestingEngineResultV1`;
- `VersionSet`;
- estados `ready`, `degraded`, `blocked` e `no_trade`;
- quality issues, warnings, confidence e constraints hard/soft;
- primitives de decimal, timestamp, JSON canónico e SHA-256;
- `InstrumentCatalogPort` e adapter piloto versionado;
- `MarketSnapshotPort` read-only e adapter exclusivamente por fixtures;
- orchestrator puro, sem efeitos laterais.

O orchestrator da 3B nunca emite uma proposal operacional: `proposal` é estruturalmente `null`. Com construction/rebalance ainda fora desta fase, inputs válidos sem degradação resultam deterministicamente em `no_trade`. `blocked` e `degraded` já obedecem às constraints e data quality; `ready` fica definido no contrato para os módulos posteriores, sem antecipar a sua semântica.

## 2. Arquitetura dos contratos

### Input canónico

`CanonicalInvestingInputV1` contém identidade do snapshot/run/account/portfolio, ambiente não-Live, `asOf`, versões, mandate, estado `actual`, pending orders, estado `projected`, snapshot do catálogo, snapshot de mercado, quality, confidence, warnings e `inputHash`.

Pending orders são parte explícita do input e o estado `projected` é um campo obrigatório; a 3B não tenta derivá-lo nem consultar estado operacional.

### Output canónico

`InvestingEngineResultV1` referencia o input por `inputSnapshotId` e `inputHash`, preserva `asOf` e `VersionSet`, expõe estado/quality/constraints/confidence/warnings e reserva estruturas para target portfolio e rebalance. Nesta fase ambas são vazias e `proposal` é obrigatoriamente `null`.

### Versionamento

- input: `investing-engine-input/v1`;
- output: `investing-engine-result/v1`;
- market snapshot: `investing-market-snapshot/v1`;
- catálogo piloto: `static-pilot-investing-catalog/v1`.

`VersionSet` inclui contract, engine, policy, model, instrument catalog e market-data schema. Todas participam no conteúdo hashado; mudanças de engine, policy, model ou catálogo foram verificadas como mudanças de hash.

### Estados e políticas mínimas

- hard constraint `fail` ou `unknown`: `blocked`;
- data quality `insufficient`: `blocked`;
- soft constraint `fail` ou `unknown`: `degraded`;
- data quality `degraded`: `degraded`;
- input íntegro na 3B, sem construction/rebalance: `no_trade`;
- `ready`: valor contratual reservado às fases que produzam resultado de construção completo.

Confidence nunca ultrapassa uma hard constraint.

## 3. Canonicalização

### Decimals

- valores financeiros no payload canónico são strings decimais, nunca `number`;
- zeros à esquerda e zeros fracionários à direita são removidos;
- zero negativo é normalizado para `0`;
- `NaN`, `Infinity`, `-Infinity`, exponentes em strings e valores inválidos são rejeitados;
- existe uma única fronteira explícita para números legados finitos: `canonicalDecimalFromFiniteNumberBoundary`;
- a fronteira expande notação científica antes da normalização;
- payloads canónicos com qualquer `number` cru são rejeitados, evitando floats financeiros implícitos.

### Timestamps

- `asOf` é obrigatório;
- aceita-se apenas data/hora ISO completa com `Z` ou offset explícito;
- datas sem timezone, datas apenas de calendário e datas civis inválidas são rejeitadas;
- timestamps aceites são normalizados para UTC no formato `toISOString()`;
- as funções puras não usam `Date.now()` nem consultam o relógio atual.

### JSON canónico

- as chaves dos objetos são ordenadas recursivamente;
- a ordem dos arrays é preservada porque é semântica no contrato;
- apenas objetos simples são aceites;
- `undefined`, ciclos, `bigint`, funções, símbolos e números crus são rejeitados;
- o resultado é serializado sem formatação variável, produzindo bytes estáveis em UTF-8.

Todos os builders de snapshot devolvem estruturas recursivamente congeladas.

## 4. Hashing e replay

O hash é SHA-256 hexadecimal sobre o JSON canónico em UTF-8.

- `catalogHash`: versão + instrumentos;
- `snapshotHash`: todo o market snapshot exceto o próprio `snapshotHash`;
- `inputHash`: todo o input exceto o próprio `inputHash`;
- `outputHash`: todo o resultado exceto o próprio `outputHash`.

O output referencia o hash exato do input. O orchestrator valida novamente o input e o seu hash antes de calcular o resultado. Não consulta provider, DB, clock, estado atual ou ports; portanto o replay é função exclusiva do input selado.

Foi provado que conteúdo lógico equivalente com chaves em ordens diferentes gera o mesmo hash, enquanto mudanças de decimal ou versões alteram o hash.

## 5. Catálogo piloto e ports

### `InstrumentCatalogPort`

Contrato read-only com:

- snapshot canónico versionado;
- pesquisa por símbolos;
- listagem elegível para um mandate.

`StaticPilotInstrumentCatalogAdapter` adapta o `instrumentMaster` atual sem alterar a sua definição nem misturá-la com construction. O universo piloto estável contém, por esta ordem semântica: `VWCE`, `SPY`, `AGGH`, `GLD`. Símbolos e IDs duplicados, símbolos inválidos e divergências de hash são rejeitados.

### `MarketSnapshotPort`

Contrato apenas de leitura por ID de snapshot. A única implementação 3B é `FixtureMarketSnapshotPort`, alimentada no construtor por snapshots já selados. Não contém provider, fetch ou DB e rejeita IDs de snapshot duplicados.

O orchestrator puro não depende nem chama estes ports: eles definem a fronteira de composição futura sem introduzir IO na execução determinística.

## 6. Ficheiros criados

- `lib/investing/engine/v1/canonical.ts` — decimals, timestamps, JSON canónico, SHA-256 e freeze;
- `lib/investing/engine/v1/contracts.ts` — contratos e tipos v1;
- `lib/investing/engine/v1/validation.ts` — validators, builders e hashes selados;
- `lib/investing/engine/v1/ports.ts` — ports read-only e fixture market adapter;
- `lib/investing/engine/v1/catalog.ts` — adapter piloto versionado;
- `lib/investing/engine/v1/orchestrator.ts` — orchestrator puro;
- `lib/investing/engine/v1/index.ts` — exports públicos do namespace v1;
- `tests/investingEnginePhase3BContracts.test.ts` — contratos, canonicalização, hashing e orchestrator;
- `tests/investingEnginePhase3BPortsIsolation.test.ts` — ports, fixtures e isolamento de IO/imports;
- `docs/INVESTING_ENGINE_PHASE3B_CONTRACTS_DETERMINISM.md` — este relatório.

Não foi alterado qualquer ficheiro de `lib/trading/**`, Persistent Paper, migrations, APIs, UI ou runtime operacional para implementar a 3B. O `instrumentMaster` existente é apenas consumido pelo adapter piloto e não foi modificado.

## 7. Testes e resultados

Comando de regressão dirigido:

```text
npx vitest run \
  tests/investingEnginePhase3BContracts.test.ts \
  tests/investingEnginePhase3BPortsIsolation.test.ts \
  tests/investingEnginePhase3ASyncGuard.test.ts \
  tests/investingEnginePhase3ALoop.test.ts \
  tests/investingEnginePhase3ALegacyWrites.test.ts \
  tests/investingEnginePhase3ABrokerRoutes.test.ts \
  tests/investingArchitectureIsolation.test.ts
```

Resultado: **7 ficheiros, 64 testes, 64 aprovados**.

Distribuição:

- 26 testes específicos da 3B;
- 34 testes da boundary safety 3A;
- 4 testes de isolamento arquitetural Investing.

Cobertura 3B provada:

1. outputs repetidos byte-identical;
2. ordem de chaves indiferente ao hash e ordem de arrays preservada;
3. mudança de decimal altera input/output hash;
4. mudanças de engine, policy, model ou catálogo alteram hashes;
5. timestamps inválidos/ambíguos rejeitados e offsets normalizados;
6. `NaN` e infinidades rejeitados;
7. números financeiros crus rejeitados e fronteira explícita testada;
8. `asOf` obrigatório;
9. ausência de fetch e imutabilidade de input/output;
10. scan do grafo v1 sem broker, worker, Supabase, API de execução, Persistent Paper, provider ou `Date.now()`;
11. versão e hash do catálogo piloto estáveis;
12. símbolos duplicados ou inválidos rejeitados;
13. `Live` rejeitado pelo contrato;
14. regressão 3A verde;
15. isolamento Investing preservado.

Validação estática:

- `npx tsc --noEmit`: aprovado;
- `npx eslint lib/investing/engine/v1 tests/investingEnginePhase3BContracts.test.ts tests/investingEnginePhase3BPortsIsolation.test.ts`: aprovado, sem warnings;
- `git diff --check`: aprovado.

As seis falhas globais Trading Paper já classificadas como baseline externo ao diff 3A não foram corrigidas nem reabertas. A suite global não é usada para lhes atribuir causalidade à 3B; a regressão dirigida do boundary e do isolamento passou integralmente.

## 8. Limitações deliberadas

- não existe Canonical Input Builder ligado a dados reais; pertence à 3C;
- não existe cálculo `actual/reserved/projected`; pertence à 3C;
- não existem Risk/Policy Engines completos; pertencem à 3D;
- não existem construction, rebalance, custos, liquidez, tax port ou explainability; pertencem à 3E;
- não existe shadow comparison; pertence à 3F;
- market data permanece exclusivamente fixture-based;
- não existe persistence/replay store em DB;
- não existe proposal operacional, approval ou execução;
- não existe caller no runtime nem UI cutover.

## 9. Declarações de controlo

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- Migrations aplicadas: **não**.
- Live continua bloqueado: **sim**; `live` não pertence ao union de ambientes executáveis e é rejeitado em runtime validation.
- FASE 3C iniciada: **não**.
