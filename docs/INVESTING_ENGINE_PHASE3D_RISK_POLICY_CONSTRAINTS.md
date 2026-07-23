# Investing Engine — FASE 3D: Risk, Policy e Constraints

Data: 2026-07-20
Estado: concluída; aguarda aceitação explícita antes da FASE 3E

## 1. Resultado

A FASE 3D implementa um motor puro, determinístico e isolado que responde:

> Que decisões são permitidas, proibidas ou condicionadas, e porquê?

O motor recebe um `CanonicalInvestingInputV1` selado e um contexto explícito de autorização. Devolve exclusivamente um `FeasibleDecisionEnvelopeV1`; não constrói carteira, pesos-alvo, quantities, proposal, orders ou execução.

Arquitetura:

```text
CanonicalInvestingInputV1 selado + authorization context Paper
                              |
              +---------------+---------------+
              |                               |
      RiskAssessmentV1                PolicyEvaluationV1
              |                               |
              +---------------+---------------+
                              |
                   ConstraintEvaluationV1[]
                              |
                              v
                FeasibleDecisionEnvelopeV1
          allowed / degraded / blocked / insufficient_data
```

Todo o namespace está em `lib/investing/engine/v1/phase3d`. Não existe caller operacional.

## 2. Contratos versionados

### `RiskAssessmentV1`

Versão: `investing-risk-assessment/v1`.

Contém:

- referência ao `inputHash` e `asOf`;
- base currency;
- status `complete`, `degraded` ou `insufficient_data`;
- data quality e confidence;
- portfolio value, total exposure, available cash e cash weight;
- concentração por instrumento e classe;
- exposição por currency;
- concentration risk score;
- volatility, drawdown e risk capacity com suporte explícito ou `insufficient_data`;
- issues;
- `assessmentHash` SHA-256.

### `PolicyEvaluationV1`

Versão: `investing-policy-evaluation/v1`.

Contém:

- mandate snapshot e policy version;
- objective, horizon e risk profile autoritativos;
- universo permitido;
- instrumentos proibidos e unsuitable;
- regra explicável por instrumento, com disposition/source/explanation;
- limites resolvidos e respetiva origem;
- conflitos;
- `policyHash` SHA-256.

### `ConstraintEvaluationV1`

Versão: `investing-constraint-evaluation/v1`.

Cada avaliação tem obrigatoriamente:

- code estável;
- severity `hard`, `soft` ou `informational`;
- status `pass`, `fail`, `unknown` ou `conflict`;
- observed e allowed limit como decimals canónicos ou `null`;
- source;
- explanation auditável;
- consequence `allow`, `degrade`, `block` ou `inform`;
- subject quando aplicável.

### `FeasibleDecisionEnvelopeV1`

Versão: `investing-feasible-envelope/v1`.

Agrega risk, policy, constraints, instrumentos permitidos/proibidos, condições e contexto de autorização. Inclui `envelopeHash` SHA-256 e nunca inclui construção ou execução.

## 3. Risk Assessment

O risco é calculado sobre `input.projected`, nunca sobre UI, estado atual ou carteira legacy.

| Métrica | Cálculo/fonte | Ausência de dados |
|---|---|---|
| Total portfolio value | projected cash + projected positions, convertidos para base currency | `insufficient_data` se preço/FX/catalog falhar |
| Total exposure | position value / total value | zero para portfolio conhecido com valor zero |
| Available cash | projected cash convertido para base currency | `insufficient_data` se FX faltar |
| Cash weight | cash / total value | `1` para portfolio conhecido vazio |
| Instrument concentration | valor de cada instrumento / total | array estável por symbol |
| Asset-class concentration | soma por asset class / total | depende do catálogo selado |
| Currency exposure | cash + positions agregados por currency / total | depende de FX selado |
| Concentration risk score | soma dos quadrados dos pesos por instrumento (HHI) | `insufficient_data` se valuation incompleta |
| Volatility | requer return series canónica | explicitamente `insufficient_data` nesta fase |
| Drawdown | requer equity curve canónica | explicitamente `insufficient_data` nesta fase |
| Risk capacity | requer dataset canónico de loss capacity | explicitamente `insufficient_data` nesta fase |

O HHI é um score de concentração, não é apresentado como volatilidade. Não se fabricam métricas quando o contrato v1 não contém dados suficientes.

Preços e FX são lidos apenas do market snapshot presente no input. A 3D suporta pares FX diretos/inversos selados. O limite de staleness do risk policy v1 é 15 minutos e usa exclusivamente `input.asOf` e `providerAsOf`; não consulta relógio.

## 4. Policy Engine

### Fontes autoritativas

- mandate snapshot: objective, horizon, risk profile, suitability e overrides;
- instrument catalog selado: universo piloto enabled;
- policy version do `VersionSet`;
- Paper-only como hard invariant.

Plan/settings não são reconsultados. A 3D recebe apenas o resultado canónico da 3C.

### Defaults versionados por risk profile

| Limite | Conservative | Balanced | Aggressive | Tipo default |
|---|---:|---:|---:|---|
| Máximo por instrumento | 0.25 | 0.35 | 0.50 | hard |
| Máximo por asset class | 0.60 | 0.75 | 0.90 | hard |
| Máximo por foreign currency | 0.40 | 0.60 | 0.80 | soft |
| Cash mínimo | 0.10 | 0.05 | 0.02 | hard |
| Total exposure máxima | 0.90 | 0.95 | 0.98 | hard |
| Concentration risk score máximo | 0.35 | 0.50 | 0.70 | soft |

Um override do mandate substitui o default da mesma chave. Dois overrides do mandate incompatíveis para a mesma chave produzem conflito hard; confidence ou preferências não escolhem entre eles.

### Vocabulário declarativo do mandate

Os IDs das constraints do mandate suportados como policy declarations são:

| Prefixo | Semântica |
|---|---|
| `allow_instrument:<SYMBOL>` | cria universo explícito allowlisted |
| `prohibit_instrument:<SYMBOL>` | proíbe o instrumento |
| `suitability_instrument:<SYMBOL>` | status diferente de pass torna o instrumento unsuitable |
| `suitability_asset_class:<CLASS>` | aplica suitability à classe |
| `max_instrument_weight[:<SYMBOL>]` | limite global ou específico |
| `max_asset_class_weight[:<CLASS>]` | limite global ou específico |
| `max_currency_weight[:<CCY>]` | limite global ou específico |
| `minimum_cash_weight` | cash buffer mínimo |
| `maximum_total_exposure` | exposição investida máxima |
| `maximum_risk_score` | limite do HHI de concentração |

Todos os limites são ratios canónicos entre `0` e `1`. Limite ausente/inválido gera policy conflict. Um instrumento simultaneamente allowlisted e proibido também gera conflict.

Constraints do mandate fora deste vocabulário são preservadas como constraints autoritativas herdadas; hard fail bloqueia e hard unknown retém todas as decisões como `insufficient_data`.

## 5. Tabela completa de constraints

| Code/padrão | Severity | Observed/limit | Source | Consequência de não-pass |
|---|---|---|---|---|
| `authorization_ownership` | hard | identidade por referência | evaluation context | blocked |
| `environment_paper_only` | hard | ambiente por referência | mandate/account input | blocked |
| `canonical_data_quality` | hard para insufficient; soft para degraded | confidence / sem limite | canonical input | insufficient_data ou degraded |
| `risk_valuation_available` | hard | portfolio value / sem limite | risk assessment | insufficient_data |
| `policy_conflict:<reason>` | hard | null/null | policy evaluation | blocked |
| `instrument_universe:<SYMBOL>` | hard | peso / sem limite | mandate | blocked se posição positiva fora do universo |
| `instrument_prohibited:<SYMBOL>` | hard | peso / 0 | mandate | blocked se instrumento proibido estiver detido |
| `instrument_unsuitable:<SYMBOL>` | hard | peso / 0 | mandate suitability | blocked se instrumento unsuitable estiver detido |
| `maximum_instrument_weight:<SYMBOL>` | hard/soft conforme regra | peso / limite | default ou mandate override | blocked/degraded |
| `maximum_asset_class_weight:<CLASS>` | hard/soft conforme regra | peso / limite | default ou mandate override | blocked/degraded |
| `maximum_currency_weight:<CCY>` | hard/soft conforme regra | peso / limite | default ou mandate override | blocked/degraded |
| `minimum_cash_weight` | hard/soft conforme regra | cash weight / mínimo | default ou mandate override | blocked/degraded |
| `maximum_total_exposure` | hard/soft conforme regra | exposure / máximo | default ou mandate override | blocked/degraded |
| `maximum_risk_score` | hard/soft conforme regra | HHI / máximo | default ou mandate override | blocked/degraded |
| `mandate_constraint:<ID>` | hard/soft do mandate | observed/limit originais | mandate snapshot | blocked, insufficient_data ou degraded |

Uma proibição/suitability sobre um instrumento não detido remove esse instrumento do universo viável, mas não bloqueia decisões permitidas nos restantes instrumentos. Se já houver exposição positiva, a constraint hard falha.

## 6. Precedência e fail-closed

A precedência é fixa:

1. input canónico estruturalmente inválido: rejeição antes da avaliação;
2. hard `fail` ou `conflict`: `blocked`;
3. hard `unknown`, valuation obrigatória ausente ou quality insufficient: `insufficient_data`;
4. soft `fail`, `unknown` ou risk/data quality degraded: `degraded`;
5. todas as constraints aplicáveis em pass: `allowed`.

Regras adicionais:

- hard nunca é anulada por soft, score, confidence ou preferência;
- conflito hard tem precedência sobre insuficiência de dados;
- `blocked` e `insufficient_data` devolvem `allowedInstruments: []`;
- `degraded` conserva apenas instrumentos que continuam policy-feasible;
- Live forjado no input é estruturalmente inválido;
- `simulation` é um input 3B válido, mas falha a policy Paper-only e fica blocked;
- contexto de autorização Live/ inválido é rejeitado;
- ownership divergente produz hard block;
- cada non-pass aparece em `conditions` e mantém source/explanation.

`allowed` significa apenas permitido para uma futura fase de construction. Não significa aprovado, proposto ou executável.

## 7. Determinismo e hashing

- matemática financeira decimal privada da 3D usa coeficiente `BigInt` + escala;
- nenhum valor financeiro é convertido por `Number`;
- não existe `Date.now()`;
- ordenação de instruments, classes, currencies, limits, conflicts e constraints é semântica e estável;
- hashes usam JSON canónico e SHA-256;
- `assessmentHash` sela risk;
- `policyHash` sela policy;
- `envelopeHash` sela contexto, risk, policy, constraints e universo final;
- o output referencia o `inputHash` exato;
- replay do mesmo input/context produz bytes e hashes idênticos.

Durante a regressão, o primeiro desenho importava a primitive decimal interna da 3C. O teste congelado de isolamento 3C detetou o novo consumidor. A correção foi feita apenas na 3D, que passou a possuir primitives privadas; o teste 3C voltou a passar sem alterar qualquer ficheiro 3C.

## 8. Ficheiros criados

- `lib/investing/engine/v1/phase3d/types.ts`;
- `lib/investing/engine/v1/phase3d/decimalMath.ts`;
- `lib/investing/engine/v1/phase3d/riskAssessment.ts`;
- `lib/investing/engine/v1/phase3d/policyEngine.ts`;
- `lib/investing/engine/v1/phase3d/constraintEngine.ts`;
- `lib/investing/engine/v1/phase3d/engine.ts`;
- `lib/investing/engine/v1/phase3d/index.ts`;
- `tests/investingEnginePhase3DRiskPolicy.test.ts`;
- `tests/investingEnginePhase3DIsolation.test.ts`;
- `docs/INVESTING_ENGINE_PHASE3D_RISK_POLICY_CONSTRAINTS.md`.

Nenhum ficheiro 3A, 3B ou 3C foi alterado. Também não foram alterados Trading, Persistent Paper, accounting, reconciliation, APIs, UI ou migrations.

## 9. Testes e resultados

Suite dirigida final:

```text
npx vitest run
  tests/investingEnginePhase3DRiskPolicy.test.ts
  tests/investingEnginePhase3DIsolation.test.ts
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

Resultado final: **11 ficheiros, 129 testes, 129 aprovados**.

- 27 testes 3D;
- 38 testes 3C;
- 26 testes 3B;
- 34 testes 3A;
- 4 testes de isolamento arquitetural base.

A 3D cobre portfolio vazio, cash-only, concentração excessiva, limites por instrumento/classe/currency, cash mínimo, universo, proibição, suitability, mandate ausente/contraditório, stale, preço/FX ausente, quality insufficient, hard+soft, conflitos, ordem de rows/chaves, decimals extremos, ownership, account não-Paper, Live, replay, hashes e ausência de outputs de construction/execution.

Validação estática:

- `npx tsc --noEmit`: aprovado;
- ESLint do namespace/testes 3D: aprovado, sem warnings;
- `git diff --check`: aprovado;
- scan de imports/dependências proibidas: aprovado;
- caller operacional 3D: nenhum;
- regressões 3A–3C: aprovadas.

As seis falhas globais Trading Paper aceites como baseline externo não foram corrigidas nem reabertas.

## 10. Limitações deliberadas

- sem return series canónica, volatility permanece `insufficient_data`;
- sem equity curve canónica, drawdown permanece `insufficient_data`;
- sem loss-capacity dataset canónico, risk capacity permanece `insufficient_data`;
- o risk score suportado é apenas concentração HHI, não volatilidade de mercado;
- FX limita-se aos pares diretos/inversos do snapshot selado;
- defaults de policy pertencem à `risk-policy/v1` e terão de ser governados/versionados antes de cutover;
- não existe portfolio construction, target weights, quantities ou rebalance;
- não existe cost/liquidity/tax model completo;
- não existe proposal, approval, order ou execução;
- não existe persistence, DB adapter, UI, staging ou shadow comparison;
- não existe caller no runtime atual.

## 11. Declarações finais

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- Migrations aplicadas: **não**.
- Live continua bloqueado: **sim**.
- FASE 3E iniciada: **não**.
