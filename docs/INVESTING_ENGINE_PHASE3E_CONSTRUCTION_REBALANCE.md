# Investing Engine — FASE 3E: Construction, Rebalance e proposta preliminar

Data: 2026-07-20
Estado: concluída; aguarda aceitação explícita antes da FASE 3F

## 1. Resultado

A FASE 3E implementa um motor puro, determinístico, isolado e auditável que transforma snapshots selados da 3C e o envelope autorizado da 3D numa proposta preliminar não executável.

```text
CanonicalInvestingInputV1 + PortfolioState PROJECTED
Risk + Policy + Constraints + FeasibleDecisionEnvelopeV1
ConstructionModelSnapshotV1
                         |
                         v
         capacity allocation + target rounding
                         |
                         v
       hold / partial_rebalance / full_rebalance
                         |
          costs + liquidity + tax awareness
                         |
                         v
          deterministic candidate ranking
                         |
                         v
       PreliminaryInvestingProposalV1 (executable=false)
```

O namespace completo está em `lib/investing/engine/v1/phase3e`. Não existe caller operacional, acesso a provider, DB, browser, queue, broker, relógio implícito ou efeito lateral.

## 2. Contratos

| Contrato | Versão | Responsabilidade |
|---|---|---|
| `ConstructionModelSnapshotV1` | `investing-construction-model/v1` | Snapshot selado dos pressupostos de rounding, custos, liquidez e tax-lot availability |
| `PortfolioTargetV1` | `investing-portfolio-target/v1` | Pesos e quantities alvo, exposição e residual cash |
| `RebalanceActionV1` | `investing-rebalance-action/v1` | Buy, sell ou hold a partir de ACTUAL e PROJECTED |
| `ConstructionCandidateV1` | `investing-construction-candidate/v1` | Candidato hold, parcial ou full e respetiva avaliação |
| `ConstructionEvaluationV1` | `investing-construction-evaluation/v1` | Compliance, risco, fit, diversificação, custo, liquidez, turnover, tax e quality |
| `CostEstimateV1` | `investing-cost-estimate/v1` | Componentes e materialidade do custo estimado |
| `LiquidityAssessmentV1` | `investing-liquidity-assessment/v1` | Capacidade, participation, ADV, marketability, impact e freshness |
| `TaxAwarenessAssessmentV1` | `investing-tax-awareness/v1` | Gain/loss estimado e incerteza fiscal, sem aconselhamento legal |
| `PreliminaryInvestingProposalV1` | `investing-preliminary-proposal/v1` | Resultado canónico terminal, sempre `executable=false` |

Todos os objetos financeiros usam decimals canónicos em strings. Snapshots, targets, candidatos e proposal usam serialização canónica com chaves ordenadas e SHA-256 estável. Arrays com semântica de conjunto são ordenados na fronteira que os sela; arrays com semântica contratual preservam essa ordem.

## 3. Construção e precedência

A construção obedece à seguinte precedência, sem score agregado capaz de ultrapassá-la:

1. Validar hashes, versões, ownership, Paper e coerência entre snapshots.
2. Propagar imediatamente `blocked` ou `insufficient_data` da 3D.
3. Bloquear ambiguidade económica de pending orders.
4. Excluir universo proibido, unsuitable ou não autorizado.
5. Reservar o maior de `minimum cash` e `1 - maximum exposure`.
6. Distribuir capacidade deterministicamente por símbolos ordenados.
7. Aplicar cumulativamente caps de instrumento, classe e moeda; símbolos da mesma classe/moeda partilham o mesmo cap.
8. Construir targets hold, parcial (50% do drift) e full.
9. Converter pesos em quantities com rounding conservador.
10. Partir de PROJECTED para o delta e de cash ACTUAL disponível para financiar buys; proceeds de pending sells nunca entram no orçamento.
11. Aplicar mínimos, custos, liquidez e tax awareness.
12. Reconstituir o target efetivo a partir das ações ajustadas para que target, actions e residual cash sejam internamente consistentes.
13. Revalidar todas as hard constraints depois do rounding.
14. Classificar e ordenar candidatos deterministicamente.

O algoritmo inicial é uma alocação por capacidade, não um otimizador estatístico. Em cada ronda, os instrumentos ativos recebem uma parcela igual da exposição restante, limitada pela capacidade ainda disponível do instrumento, classe e moeda. O remanescente é redistribuído até não existir exposição ou capacidade. O universo piloto permanece o catálogo versionado já aprovado.

## 4. Rebalance e pending orders

O delta económico é sempre:

```text
quantity_delta = target_quantity - projected_quantity
```

- `ACTUAL` é apresentado para auditoria.
- `PROJECTED` é a base da decisão.
- Pending buys já projetadas não voltam a ser compradas.
- Quantities de pending sells já comprometidas não voltam a ser vendidas.
- `cancellation_requested` permanece economicamente ativa por vir incorporada no PROJECTED da 3C.
- Estados terminais não entram no PROJECTED.
- Partial fills usam apenas o remanescente.
- Duas orders no mesmo instrumento são agregadas pela 3C antes da construção.
- Ambiguidades declaradas pela derivação da 3C produzem `blocked`.
- Buy budget usa cash ACTUAL disponível menos o buffer obrigatório; proceeds atuais ou projetados de sells não o aumentam.

## 5. Rounding e impossibilidade

| Regra | Política |
|---|---|
| Whole shares | Incremento mínimo de `max(1, quantityIncrement, catalog lotSize)` |
| Fractional shares | `quantityIncrement` explícito do modelo |
| Target quantity | Arredondada para baixo |
| Buy price | Arredondado para cima ao price increment |
| Sell price | Arredondado para baixo ao price increment |
| Min quantity/notional | Produz hold quando a dimensão segura deixa de ser material/executável |
| Cash insuficiente | Reduz deterministicamente a compra; se ficar abaixo dos mínimos, hold |
| Oversell | Quantity de venda limitada ao PROJECTED |
| Hard constraint pós-rounding | Candidato bloqueado |
| Residual cash | Sempre explícito e reconciliado com o target efetivo |

Não é usada matemática financeira com `Number`; coeficientes decimais são processados com `BigInt`. `Date` é usado apenas para timestamps explícitos e freshness, nunca como fonte de relógio.

## 6. Cost Model V1

O custo total é:

```text
commission = max(notional * commission_bps / 10000, minimum_fee)
spread     = notional * spread_bps / 10000
slippage   = notional * slippage_bps / 10000
fx_cost    = notional * fx_cost_bps / 10000, apenas quando currency != base
total_cost = commission + spread + slippage + fx_cost
```

O output inclui custo por notional, custo por portfolio e avaliação contra `costBenefitThreshold`. O catálogo pode fornecer apenas o fallback explícito de commission bps. Spread, slippage, minimum fee e FX cost material não disponíveis nunca são convertidos silenciosamente em zero: o trade fica `insufficient_data` com os componentes ausentes identificados.

## 7. Liquidity Model V1

```text
estimated_tradable_quantity = ADV * max_participation
estimated_market_impact     = notional * market_impact_bps / 10000
```

O resultado distingue `sufficient`, `insufficient`, `stale`, `unavailable` e `not_required`, e expõe `marketable`, `not_marketable`, `unknown` ou `not_required`. ADV, participation, tier, impact e timestamp são materiais. A ausência ou staleness impede que o trade seja considerado seguro; hold/no-trade não exige prova de liquidez.

Freshness compara somente `canonicalInput.asOf` com `liquidityAsOf`. Timestamps futuros, inválidos ou não canónicos falham fechado.

## 8. Tax Awareness V1

Para sells com cost basis canónica e tax-lot availability comprovada:

```text
estimated_realized_gain_loss = (estimated_sell_price - cost_basis) * quantity * fx_to_base
```

O modelo distingue ganho, perda, neutral, basis desconhecida e não aplicável. Basis ausente/desconhecida nunca é tratada como ganho zero. Uma venda com ganho conhecido ou basis desconhecida favorece menor turnover no desempate económico, mas nunca ultrapassa constraints hard. Isto é awareness determinística; não calcula imposto, jurisdição, lot selection nem aconselhamento fiscal.

## 9. Ranking determinístico

1. Estado: `feasible`, `degraded`, `insufficient_data`, `blocked`.
2. Existência de risk improvement.
3. Menor turnover quando existe sensibilidade fiscal.
4. Maior target fit.
5. Menor turnover como desempate de custo.
6. `candidateId` lexical como desempate final.

Compliance hard é avaliado separadamente e tem precedência absoluta. O motor não usa um score agregado que possa esconder violação.

## 10. Estados finais

| Estado | Significado |
|---|---|
| `proposal_ready` | Existe candidato seguro com pelo menos uma ação material |
| `no_trade` | Hold é a decisão final depois de thresholds, mínimos e estado projetado |
| `degraded` | Proposal possível, mas soft constraints, quality ou tax uncertainty exigem aviso |
| `blocked` | Envelope/hard constraint/ambiguidade/liquidez impede construção segura |
| `insufficient_data` | Não há prova material suficiente de custo, liquidez, mercado ou envelope |

Todos os estados produzem apenas uma proposta preliminar pura. `executable` é literal e invariavelmente `false`.

## 11. Reason codes

| Grupo | Codes estáveis ou famílias dinâmicas |
|---|---|
| Envelope | `feasible_envelope_blocked`, `feasible_envelope_insufficient_data` |
| Pending | `pending_order_ambiguity_blocked` |
| Target | `projected_state_start`, `policy_capacity_allocation`, `conservative_rounding`, `action_adjusted_target`, `below_minimum_quantity`, `below_minimum_notional` |
| Target impossível | `target_construction_impossible`, `target_instrument_missing:<symbol>`, `target_market_data_missing:<symbol>` |
| Estado/action | `projected_state_used`, `target_drift:<-1|0|1>`, `instrument_catalog_missing`, `market_data_missing`, `oversell_prevented` |
| Cash/minimum | `cash_limited_partial_rebalance`, `cash_insufficient`, `cash_insufficient_after_trade_minimums`, `benefit_below_minimum` |
| Custos | `transaction_cost_exceeds_benefit_threshold`, `transaction_cost_data_unavailable` |
| Liquidez | `liquidity_capacity_exceeded`, `liquidity_data_unavailable`, `liquidity_data_stale` |
| Tax | `tax_basis_unknown`, `potential_taxable_gain`, `estimated_realized_loss`, `taxable_gain_prefer_lower_turnover` |
| Evaluation | `hard_constraints_satisfied`, `hard_constraints_failed`, `risk_improves`, `risk_not_improved`, `cost_threshold_pass`, `cost_<status>`, `liquidity_pass`, `liquidity_<status>`, `tax_effect_known`, `tax_not_applicable` |
| Selection | `selected_<mode>`, `candidate_rejected:<mode>:<state>`, `no_trade_after_thresholds` |
| Terminal | `trade_safety_data_insufficient`, `all_rebalance_candidates_blocked`, `no_candidate_with_sufficient_data`, `no_hard_compliant_candidate` |

As condições estáveis emitidas pelo envelope da 3D são também propagadas sem alteração, preservando a origem da decisão.

## 12. Fail-closed

- Hash, versão, ownership ou conteúdo cruzado incoerente lança erro antes da construção.
- Live é rejeitado; a autorização só admite `paper`.
- Um envelope 3D bloqueado ou insuficiente nunca chega à candidate generation executável.
- Constraints hard são reavaliadas depois do rounding e dos ajustes de cash.
- Dados materiais desconhecidos não recebem defaults financeiros silenciosos.
- Liquidez não comprovada nunca é inventada.
- Pending-order ambiguity bloqueia.
- Um target impossível não é substituído por portfolio legacy ou estado atual.
- A proposal não cria order, approval, fill, ledger, persistência ou reconciliação.

## 13. Ficheiros criados

- `lib/investing/engine/v1/phase3e/types.ts`
- `lib/investing/engine/v1/phase3e/primitives.ts`
- `lib/investing/engine/v1/phase3e/models.ts`
- `lib/investing/engine/v1/phase3e/validation.ts`
- `lib/investing/engine/v1/phase3e/constructionEngine.ts`
- `lib/investing/engine/v1/phase3e/engine.ts`
- `lib/investing/engine/v1/phase3e/index.ts`
- `tests/investingEnginePhase3EConstruction.test.ts`
- `tests/investingEnginePhase3EIsolation.test.ts`
- `docs/INVESTING_ENGINE_PHASE3E_CONSTRUCTION_REBALANCE.md`

Nenhum ficheiro da 3A, 3B, 3C ou 3D foi alterado pela 3E.

## 14. Validação

| Validação | Resultado |
|---|---|
| Testes específicos 3E | 2 files, 49 tests passed |
| Regressão conjunta 3A–3E | 12 files, 174 tests passed |
| Isolamento 3E | imports/dependências proibidas ausentes; caller operacional ausente |
| `npx tsc --noEmit` | exit 0 |
| ESLint 3E + testes 3E | exit 0, zero warnings |
| `git diff --check` | exit 0; os ficheiros 3E untracked foram também verificados individualmente com `--no-index --check`; apenas avisos informativos LF/CRLF do worktree existente |

Cobertura funcional inclui todos os cenários mínimos pedidos: vazio, cash-only, posições, buy/sell/hold, partial/full, constraints, pending orders e fills, rounding, custos, liquidez, tax awareness, dados ausentes/stale, determinismo, ownership, Paper/Live e isolamento.

## 15. Limitações deliberadas

- A alocação v1 é capacity-balanced e determinística; não é mean-variance, risk parity nem otimização por forecast.
- O partial rebalance v1 usa um blend versionado de 50% do drift.
- Custos e liquidez vêm apenas do snapshot explícito do modelo; não existe provider runtime.
- Market impact é uma estimativa linear simples.
- Tax awareness usa cost basis canónica e disponibilidade declarada; não seleciona lots nem calcula imposto legal.
- Confidence/data quality são herdadas dos snapshots canónicos e degradadas pelas avaliações 3E; não existe modelo probabilístico novo.
- Não existe persistence/replay store, API, UI, staging, shadow comparison ou caller operacional nesta fase.

## 16. Declarações finais

- Trading core modificado: não.
- Persistent Paper modificado: não.
- Fases 3A–3D modificadas: não.
- Migrations aplicadas: não.
- Caller operacional criado: não.
- Live continua bloqueado: sim.
- FASE 3F iniciada: não.
