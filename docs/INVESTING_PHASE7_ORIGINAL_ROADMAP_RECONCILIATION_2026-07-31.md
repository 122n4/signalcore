# Investing — reconciliação da FASE 7 original

Data: 2026-07-31  
Checkpoint auditado: `dd9fef9e22b1fe4558f047ee6e52bb8654d52e02`  
Classificação: `phase7_original_roadmap_reconciliation_blocked`

## Âmbito

Esta auditoria reconcilia os objetivos da FASE 7 do handoff oficial original —
shadow validation, comparação entre caminhos, retirada controlada de caminhos
antigos, equivalência e zero regressão operacional — com as provas já aceites
nas FASES 3F, 5F, 6M e na FASE 7 de readiness.

Não reabre fases congeladas, não ativa beta ou Live, não inicia a FASE 8 e não
interpreta readiness como autorização de cutover.

## Provas já existentes

- A FASE 3F produz um shadow package determinístico e não executável.
- A persistência da FASE 4 sela e verifica o shadow package.
- A FASE 5F implementa rollout read-only `off`, `allowlist` e `on`, com rollback
  operacional para `off`.
- Os writes legacy, FixNow, broker shared e engine loop estão bloqueados para o
  modo Investing.
- A FASE 6M prepara material científico apenas para `shadow` ou
  `investing_paper`, com revogação append-only e sem chamada Research → Engine.
- A FASE 7 de readiness liga evidência, release candidate, build e ambiente,
  mantendo activation boundary, allowlist e kill switch fail-closed.
- As suites focadas passaram: 6 ficheiros, 52 testes, zero falhas.
- O gate global pré-deploy passou anteriormente com 321 ficheiros e 1.786
  testes aprovados; as suites PostgreSQL obrigatórias foram provadas nos
  checkpoints de auditoria próprios.

## Lacuna material

O shadow package continua, por contrato e schema, fixo em
`awaiting_legacy_result`. `legacyResult` e `comparison` permanecem nulos. Não
existe composition root operacional que execute os dois caminhos read-only,
normalize resultados comparáveis e persista evidência de paridade.

Os consumers legacy de leitura continuam presentes no produto Investing,
incluindo `portfolio_items`, `/api/portfolio-items`, `/api/daily-bundle` e as
tabs Portfolio, Plan, Advisor e Autonomy. Os writes Investing nesses caminhos
estão bloqueados, mas o cutover de leitura não ocorreu.

Na base Supabase de produção, as estimativas observadas para
`investing_engine_runs`, `investing_engine_shadow_packages`,
`investing_positions`, `investing_cash_balances`, `investing_orders` e
`investing_fills` são zero. Assim, não existe um histórico material de ciclos
que possa satisfazer a condição de paridade prolongada.

## Matriz dos critérios de retirada legacy

| Critério oficial | Estado | Evidência / lacuna |
|---|---|---|
| Inventário de callers sem desconhecidos | Parcial | Inventário estático existe; não há prova de tráfego runtime completa. |
| Zero writes Investing no caminho durante 30 dias | Bloqueado | Guardas existem; falta janela observada e evidência persistida. |
| Zero tráfego necessário ou adapter canónico equivalente | Não satisfeito | Consumers legacy de leitura continuam ativos. |
| 30 ciclos consecutivos de shadow parity | Não satisfeito | Comparator operacional ausente e zero shadow runs em produção. |
| Provenance em resultados financeiros | Estrutura pronta | Contratos/schema existem; não há resultados operacionais observados. |
| Auth, RLS, replay, pending, constraints e Live block | Provado por checkpoints | Não substitui a prova temporal de parity. |
| Regressão Trading sem alteração do core | Parcialmente provado | Gate global passou; deve ser repetido no futuro cutover efetivo. |
| Rollback da leitura ensaiado | Não satisfeito | Rollback do rollout 5F existe; não houve read cutover canónico a reverter. |
| Evidências e backup preservados | Parcial | Backups Supabase existem; o conjunto de parity ainda não existe. |
| Aprovação operacional do cutover | Não realizada | Cutover não foi apresentado para aprovação. |

## Blockers

1. `missing_operational_shadow_comparator` — não existe runtime read-only que
   produza legacy result, comparação normalizada e evidência append-only.
2. `missing_30_cycle_observation_window` — a janela exigida ainda não começou.
3. `legacy_read_consumers_still_required` — UI e adapters ainda dependem dos
   caminhos legacy de leitura.
4. `read_cutover_rollback_not_rehearsed` — não existe cutover de leitura sobre
   o qual ensaiar rollback.
5. `operational_cutover_approval_not_performed` — aprovação humana permanece
   pendente e não pode ser inferida de readiness.

## Correção permitida e ordem futura

Não existe correção mínima documental ou de configuração capaz de fechar estes
blockers. A continuação deve ser aditiva e separada:

1. preflight de contratos e sources comparáveis;
2. desenho de um comparator read-only, tenant-aware, sem writes financeiros;
3. persistência append-only de ciclos e dimensões de parity;
4. canary allowlisted com rollback para `off`;
5. recolha de 30 ciclos diários consecutivos;
6. migração consumer a consumer para read models canónicos;
7. ensaio de rollback de leitura;
8. regressão Investing + Trading;
9. aprovação operacional explícita;
10. só então retirada controlada de caminhos legacy.

## Veredicto

```text
classification: phase7_original_roadmap_reconciliation_blocked
blocker_type: missing_runtime_and_operational_evidence
containment: accepted
controlled_promotion: accepted
release_readiness_infrastructure: accepted
shadow_comparison_runtime: missing
consecutive_shadow_parity_cycles: 0/30
legacy_read_cutover: not_performed
legacy_removal: not_authorized
beta_activation: not_performed_not_authorized
phase8: not_started
```

O sistema permanece seguro e fail-closed. A classificação bloqueada não é uma
regressão das fases aceites; identifica trabalho residual real do roadmap
original que não pode ser substituído por testes locais, readiness ou um
deployment bem-sucedido.
