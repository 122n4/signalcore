# Investing Engine — FASE 3F: decisão final end-to-end

Data: 2026-07-20
Estado: concluída; aguarda aceitação explícita antes da FASE 4

## 1. Resumo executivo

A FASE 3F fecha o Investing Engine v1 com uma fronteira pura que recebe request, contexto e snapshots selados equivalentes aos resultados 3C, 3D e 3E. A fronteira prova identidade, account Paper, run, referências, versões, hashes e coerência financeira antes de consolidar uma decisão final.

O resultado contém decisão explicável, actions finais, árvore de evidência, phase summaries, audit bundle e shadow package. É sempre `executable=false`. Não existe integração operacional, persistence, DB, provider, broker, API, UI, scheduler, legacy ou Live.

## 2. Arquitetura end-to-end

```text
InvestingEngineRunRequestV1 + InvestingEngineRunContextV1
                              |
                    structural validation
                              |
Canonical Input + ACTUAL/RESERVED/PROJECTED snapshot
                              |
Risk + Policy + Constraints + Feasible Envelope snapshot
                              |
Construction candidates + Preliminary Proposal snapshot
                              |
                    mandatory precedence
                              |
 InvestingEngineDecisionV1 (executable=false)
          |                   |                    |
   Explainability       Audit Bundle        Shadow Package
          |                   |                    |
          +-------------------+--------------------+
                              |
              InvestingEngineResultV1Final
```

A 3F não chama as implementações das fases anteriores. Consome objetos estruturais selados, recalcula os seus hashes e confirma as ligações cruzadas. Isto preserva os gates de isolamento congelados: nenhum namespace 3C ou 3E passou a ter caller.

## 3. Contratos finais

| Contrato | Versão | Função |
|---|---|---|
| `InvestingEngineRunRequestV1` | `investing-engine-run-request/v1` | IDs externos, versões, refs e hashes esperados |
| `InvestingEngineRunContextV1` | `investing-engine-run-context/v1` | owner, identidade esperada e account Paper |
| `InvestingEngineActionDecisionV1` | `investing-engine-action-decision/v1` | Ação final explicável e não executável |
| `InvestingEngineDecisionV1` | `investing-engine-decision/v1` | Decisão consolidada e respetivo hash |
| `InvestingEngineExplanationNodeV1` | estrutural v1 | Nó determinístico com evidência |
| `InvestingEngineExplanationV1` | `investing-engine-explanation/v1` | Sequência explicativa completa |
| `InvestingEnginePhaseSummaryV1` | estrutural v1 | Estado e hashes por fase |
| `InvestingEngineAuditBundleV1` | `investing-engine-audit-bundle/v1` | Pacote in-memory para replay/auditoria futura |
| `InvestingEngineShadowPackageV1` | `investing-engine-shadow-package/v1` | Schema futuro de comparação, sem chamar legacy |
| `InvestingEngineResultV1Final` | `investing-engine-result-final/v1` | Output final único e canónico |

O resultado expõe run/user/owner/account/asOf, quatro snapshot IDs, `VersionSet`, doze hashes, estado, quality, confidence, proposal, target, actions, constraints, costs, liquidity, tax awareness, risk before/after, warnings, blockers, explanations, audit e shadow.

## 4. Fluxo 3C → 3D → 3E → 3F

1. O request externo sela as referências e hashes de todos os artefactos.
2. A 3F recalcula request/context e hashes de conteúdo.
3. ACTUAL e PROJECTED são comparados byte-canonicamente com o Canonical Input.
4. RESERVED é ligado ao request pelo derivation hash set-semantic.
5. Risk e Policy são comparados com os objetos embebidos no envelope.
6. Constraints usam hash set-semantic e igualdade semântica.
7. Proposal liga `inputHash`, `envelopeHash` e `modelSnapshotHash` aos snapshots recebidos.
8. Candidate selecionado, proposal, actions, target e residual cash são reconciliados.
9. O estado final é determinado pela precedência obrigatória.
10. Estados terminais anteriores removem proposal material, target, selected candidate e actions da decisão final.
11. Risk after é o HHI do target efetivamente selecionado.
12. Decision, explanation, audit, shadow e final result são selados por ordem, sem ciclos.

## 5. Precedência dos estados

| Ordem | Condição | Resultado |
|---|---|---|
| 1 | Contrato/hash/version/identity/run/snapshot incoerente | Erro estrutural lançado |
| 2 | Account não Paper ou tentativa Live | Erro estrutural; não continua |
| 3 | Erro 3C de ownership/ambiguidade/conflito económico | `blocked` |
| 4 | Dados 3C materialmente insuficientes | `insufficient_data` |
| 5 | Envelope 3D blocked | `blocked` |
| 6 | Envelope 3D insufficient | `insufficient_data` |
| 7 | Proposal 3E blocked | `blocked` |
| 8 | Proposal 3E insufficient | `insufficient_data` |
| 9 | Ação material segura com warning suportado | `degraded` |
| 10 | Ação material segura sem warning material | `proposal_ready` |
| 11 | Nenhuma ação material | `no_trade` |

Hard constraints mantêm precedência absoluta. Confidence, ranking, cost benefit, tax awareness ou diversification nunca alteram esta ordem.

## 6. Política de falhas

- **Erro estrutural:** lança antes da decisão; nunca vira warning.
- **Blocked:** hard constraint, proibição, ambiguidade pending, envelope/target/liquidez insegura.
- **Insufficient data:** preço, FX, custo, liquidez, mandate, model ou risk materialmente incompleto.
- **Degraded:** soft constraint, warning suportado, quality reduzida ou tax uncertainty não bloqueadora numa proposta material.
- **No trade:** portfolio alinhado, drift/mínimo/custo/rounding eliminam a ação ou hold vence.

Blocked e insufficient não expõem proposal, target, candidate selecionado ou actions finais. Evidência de candidatos recebidos pode permanecer apenas no audit bundle como rejeitada/não selecionável.

## 7. Invariantes de coerência

- `requestedUserId = ownerId = canonicalInput.userId = envelope.authorization.expectedUserId`.
- Account ID é igual em request, context, canonical input e envelope.
- Account mode e environment são exclusivamente Paper.
- `runId`, `asOf`, input, market e mandate snapshot IDs coincidem.
- VersionSet coincide com input, policy, model, catalog e market schema.
- Todos os phase hashes correspondem ao conteúdo real.
- ACTUAL e PROJECTED são os objetos canónicos usados pela 3C.
- RESERVED é ligado integralmente pelo derivation hash.
- 3D usa o `inputHash` 3C.
- 3E usa os hashes exatos de input, envelope e model.
- Proposal e candidate selecionado coincidem.
- Actions e target quantities coincidem por símbolo.
- Target value + residual cash = total portfolio value exatamente.
- Pesos admitem apenas a tolerância canónica de truncagem `1e-17`; dinheiro não admite tolerância.
- Risk after é recalculado do target efetivo sem `Number`.
- Cada reason e explanation node tem evidence hash verificável.
- Mistura de run, user, account ou snapshot falha fechado mesmo com request novamente selado.

## 8. Estratégia de hashes

Todos os hashes são SHA-256 de JSON canónico com chaves ordenadas e sem `undefined`, `NaN`, Infinity ou números financeiros JS.

| Hash | Conteúdo selado |
|---|---|
| `requestHash` | IDs, VersionSet e source hashes |
| `canonicalInputHash` | Canonical Input sem o próprio hash |
| `portfolioStateDerivationHash` | ACTUAL/RESERVED/PROJECTED com arrays set-semantic |
| `riskAssessmentHash` | Risk snapshot |
| `policyEvaluationHash` | Policy snapshot |
| `constraintEvaluationHash` | Set de constraints |
| `feasibleDecisionEnvelopeHash` | Envelope 3D |
| `constructionModelHash` | Model snapshot 3E |
| `preliminaryProposalHash` | Proposal 3E |
| `finalDecisionHash` | Decisão, actions, reasons e explanation |
| `auditBundleHash` | Bundle completo sem o próprio hash |
| `shadowPackageHash` | Shadow package sem o próprio hash |
| `finalResultHash` | Resultado final completo sem o próprio hash |

IDs são fornecidos externamente. Não existe UUID, random ou relógio interno. A ordem de chaves e rows set-semantic não altera o resultado; mudança material altera os hashes finais.

## 9. Explainability consolidada

Template: `investing-engine-explanation-template/v1`.

A sequência contém quinze nós:

```text
canonical_input → portfolio_state → data_quality → risk_assessment
→ policy_evaluation → constraints → feasible_envelope
→ target_construction → rebalance_candidates → cost_evaluation
→ liquidity_evaluation → tax_awareness → candidate_ranking
→ selected_decision → final_state
```

Cada nó contém stable code, phase source, category, severity, status, observed/expected, source, consequence, símbolos, orders, constraints, child IDs, deterministic text e evidence hash. Actions finais explicam current, reserved, projected, target, drift, decisão, regra/constraint, alternativa rejeitada, custo, liquidez, tax uncertainty e risk before/after.

## 10. Audit bundle

O bundle inclui request selado, versões, identidade, account, snapshot hashes, summaries 3C/3D, envelope, candidates, ranking, selected/rejected, target, actions, costs, liquidity, tax, phase summaries, explanation, estado, warnings, blockers, reasons e a asserção `executable=false`.

Permanece exclusivamente in-memory. O formato é adequado para persistence/replay/OPS/shadow futuros, mas nenhuma dessas integrações foi criada.

## 11. Shadow package

O package contém identidade da run, refs, versões, hashes, decisão do engine novo e as dimensões futuras de comparação pedidas. `legacyResult=null`, todos os differences começam em `null`, `missingLegacyFields=[]` e o estado é sempre `awaiting_legacy_result`.

Não chama, importa, adapta ou substitui legacy. Não executa comparação operacional.

## 12. Reason codes finais

### Estruturais lançados

- `final_request_invalid`, `final_context_invalid`;
- `cross_phase_identity_mismatch`, `cross_phase_account_mismatch`, `cross_phase_asof_mismatch`;
- `cross_phase_version_mismatch`, `cross_phase_hash_mismatch`, `cross_run_snapshot_mismatch`;
- `cross_phase_input_snapshot_mismatch`, `cross_phase_market_snapshot_mismatch`, `cross_phase_mandate_snapshot_mismatch`;
- `cross_phase_actual_mismatch`, `cross_phase_projected_mismatch`, `cross_phase_constraint_mismatch`, `cross_phase_risk_mismatch`, `cross_phase_policy_mismatch`;
- `final_live_or_non_paper_forbidden`, `final_proposal_executable_forbidden`;
- `selected_candidate_integrity_failed`, `final_target_action_mismatch`, `final_residual_cash_mismatch`, `final_target_weight_mismatch`;
- `final_result_integrity_failed`, `final_reason_origin_missing`, `final_explanation_evidence_invalid`;
- erros canónicos `final_decimal_*`, `final_timestamp_invalid`, `final_number_forbidden`, `final_undefined_forbidden`, `final_cycle_forbidden`, `final_plain_object_required`.

### Reason evidence preservada no resultado

- Codes autoritativos de quality/issues 3C, conditions 3D e proposal 3E, sem duplicação.
- `phase3c_blocked`, `phase3c_insufficient_data`;
- `phase3d_blocked`, `phase3d_insufficient_data`;
- `phase3e_blocked`, `phase3e_insufficient_data`;
- `final_proposal_ready`, `final_no_trade`, `final_degraded`, `final_blocked`, `final_insufficient_data`;
- `selected_candidate_confirmed`;
- `rejected_candidate_hard_constraint`, `rejected_candidate_cost`, `rejected_candidate_liquidity`, `rejected_candidate_tax_turnover`, `rejected_candidate_lower_target_fit`;
- `audit_bundle_created`, `shadow_package_created`, `awaiting_legacy_result`, `executable_false_asserted`.

Cada reason preserva `code`, `phaseSource`, `severity`, `consequence` e `evidenceHash`.

## 13. Ficheiros criados

- `lib/investing/engine/v1/phase3f/types.ts`
- `lib/investing/engine/v1/phase3f/primitives.ts`
- `lib/investing/engine/v1/phase3f/validation.ts`
- `lib/investing/engine/v1/phase3f/orchestration.ts`
- `lib/investing/engine/v1/phase3f/explanation.ts`
- `lib/investing/engine/v1/phase3f/auditBundle.ts`
- `lib/investing/engine/v1/phase3f/shadowPackage.ts`
- `lib/investing/engine/v1/phase3f/hashing.ts`
- `lib/investing/engine/v1/phase3f/engine.ts`
- `lib/investing/engine/v1/phase3f/index.ts`
- `tests/fixtures/investingEnginePhase3FFixture.ts`
- `tests/investingEnginePhase3FEndToEnd.test.ts`
- `tests/investingEnginePhase3FIntegrity.test.ts`
- `tests/investingEnginePhase3FDeterminism.test.ts`
- `tests/investingEnginePhase3FIsolation.test.ts`
- `docs/INVESTING_ENGINE_PHASE3F_END_TO_END_FINAL_DECISION.md`

Ficheiros existentes alterados pela 3F: nenhum.

## 14. Testes e validação

| Validação | Resultado |
|---|---|
| Testes específicos 3F | 4 files, 54 tests passed |
| Regressão 3A–3F + isolamento base | 17 files, 232 tests passed |
| `npx tsc --noEmit` | exit 0 |
| ESLint namespace/fixture/testes 3F | exit 0, zero warnings |
| `git diff --check` | exit 0; ficheiros untracked 3F também verificados individualmente |
| Scan de imports/dependências | sem DB, provider, broker, browser, runtime, Trading ou legacy imports |
| Scan determinístico | sem `Date.now`, random, UUID interno ou `Number(...)` financeiro |
| Scan de caller | nenhum caller fora de testes |

As seis falhas baseline Trading Paper não foram executadas, corrigidas ou reabertas; permanecem fora do âmbito conforme instruído.

## 15. Limitações deliberadas

- A 3F compõe snapshots; não volta a calcular 3C, 3D ou 3E.
- Os contratos estruturais locais evitam imports diretos que quebrariam os gates congelados 3C/3E.
- Não existe persistence/replay store, apesar de os bundles serem persistíveis futuramente.
- Shadow não contém resultado legacy nem diferenças calculadas.
- Explainability usa templates determinísticos em inglês técnico; não usa IA nem localização.
- Risk after nesta fase é concentration HHI do target; não inventa volatility, drawdown ou forecast.
- Tolerância existe apenas na soma de pesos truncados; reconciliação monetária continua exata.

## 16. Riscos residuais

- Evolução dos contratos 3C–3E exige uma nova versão estrutural 3F e testes de compatibilidade. Schema drift nunca é aceite silenciosamente graças a version/hash checks.
- Persistência futura terá de preservar bytes canónicos, ordem contratual e todos os hashes.
- O shadow package só poderá ser classificado depois de existir um adapter legacy explicitamente autorizado numa fase futura.
- Nenhum resultado deve ser tratado como aconselhamento fiscal legal ou como ordem executável.

## 17. Critérios de aceitação da 3F

- Cinco estados finais e precedência provados.
- Cross-phase identity/account/run/snapshot/version/hash provados.
- Proposal final e actions reconciliadas e não executáveis.
- Risk after ligado ao target selecionado.
- Explainability e evidence hashes verificáveis.
- Audit e shadow estáveis em replay.
- Mesmo input produz bytes idênticos; mudança material muda hashes.
- Regressões e gates congelados 3A–3E verdes.
- Nenhuma dependência ou caller operacional.
- Relatório e limitações explícitos.

## 18. Prova de congelamento 3A–3E

A implementação criou apenas o namespace, testes, fixture e relatório 3F. Nenhum ficheiro 3A, 3B, 3C, 3D ou 3E foi editado. As suites congeladas, incluindo os seus próprios scans de ausência de caller, passaram na regressão conjunta.

## 19. Declarações finais

- Trading core modificado: não.
- Persistent Paper modificado: não.
- Fases 3A–3E modificadas: não.
- Migrations aplicadas: não.
- Caller operacional criado: não.
- Legacy runtime importado: não.
- DB adapter criado: não.
- Provider runtime criado: não.
- Broker integration criada: não.
- Execução criada: não.
- Proposal executável criada: não.
- Live continua bloqueado: sim.
- FASE 4 iniciada: não.
