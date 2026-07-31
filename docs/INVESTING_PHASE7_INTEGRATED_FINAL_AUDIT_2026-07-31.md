# Auditoria integrada final — FASE 7

Data: 2026-07-31  
Checkpoint de entrada auditado: `74bd27b09f190fd0ec0d2a48048ad2cfcb70c811`  
Baseline anterior à FASE 7: `83e6518`  
Classificação: `phase7_integrated_accepted`  
Ativação beta real: `not_performed_not_authorized`

## Âmbito

Foram auditadas as subfases 7A–7G e fechada a 7H: contrato determinístico,
persistência, OPS read-only, trusted collectors, release binding, estado efetivo,
activation boundary, allowlist, kill switch, rollback e isolamento transversal.

Esta auditoria valida a implementação e o checkpoint local. Não substitui as
atestações oficiais do release candidate real, não concede autorização humana,
não executa deploy e não abre beta ou Live.

## Checkpoints

| Subfase | Checkpoint |
|---|---|
| 7A | `80799ee0e9421360c7df5234b130b4f1ebab7a8f` |
| 7B | `2a10c49a4eb1b64925d8ca26a5bf3c850f03c04a` |
| 7C | `2e43103cd660901fc112e1acbf20165bca185fce` |
| 7D | `f9a494fb90f7c73b172080b44c62968e34c11ad1` |
| 7E | `222fc8f550bec7c0b23b3e9565360407720882c9` |
| 7F | `009a37e7ed9ac1572f3b3ae399db123760c6f06a` |
| 7G | `74bd27b09f190fd0ec0d2a48048ad2cfcb70c811` |
| 7H | checkpoint que contém este relatório |

## Findings materiais e remediação

### H-01 — Writers 7B/7E sem composição vertical

Severidade original: alta. O runtime trusted não chamava o repositório 7B e não
existia writer operacional para candidates/assessments 7E. A UI 7F e a boundary
7G dependiam de tabelas que apenas os testes preenchiam.

Remediação: `ReleaseGateService` e `PostgresReleaseGateRepository` recolhem,
validam e persistem relatório, candidate e assessment atomicamente, sob advisory
lock por ambiente, com idempotência, verificação de colisões e rollback integral.

Estado: fechado e reproduzido em PostgreSQL real.

### H-02 — Autorização de operador demasiado ampla

Severidade original: crítica. `operate_research_beta` dependia apenas de
`investing:create`, presente em memberships normais.

Remediação: identidade/membership continuam obrigatórios e foram complementados
por `INVESTING_BETA_OPERATOR_USER_IDS`, allowlist server-only, fechada, sem
wildcard, sem duplicados e separada da allowlist de utilizadores beta.

Estado: fechado por testes positivos, negativos e scan de Client Components.

### H-03 — Evidência ligada ao commit, não ao candidate completo

Severidade original: crítica. Um relatório do mesmo commit poderia, em teoria,
ser associado a outros hashes de dependências, migrations, artifact, runtime,
configuração ou ambiente.

Remediação: o candidate content-addressed é criado antes da recolha; o
`candidateId` é enviado a cada trusted source, incorporado na evidência assinada
e validado pelo coordinator e pelo repositório. Evidência de outro candidate é
recusada fail-closed.

Estado: fechado, incluindo teste adversarial de reutilização cruzada.

## Provas executadas

- FASE 7 completa não-PostgreSQL: 15 ficheiros, 66 testes aprovados; as duas
  suites PostgreSQL foram executadas separadamente com 2/2 aprovadas.
- Regressão global final: 321 ficheiros e 1786 testes aprovados.
- Skips condicionais globais: 30 ficheiros e 91 testes.
- TypeScript global: aprovado.
- ESLint do âmbito: aprovado.
- Build Next.js de produção: aprovado.
- Dependências de produção: zero vulnerabilidades em `npm audit --omit=dev`.
- PostgreSQL 17.10: migrations cronológicas from-zero aprovadas.
- Fluxo vertical: Ed25519 → relatório → candidate → assessment → activation.
- Indisponibilidade trusted: assessment bloqueado e ativação recusada.
- Concorrência: duas decisões contraditórias no mesmo instante produziram um
  único vencedor sob advisory lock.
- Dois operadores: decisões auditadas separadamente.
- Kill switch sticky, bloqueio, reset explícito e reativação: aprovados.
- Contagens QA: 3 relatórios, 3 candidates, 3 assessments e 5 decisões.
- Imutabilidade 7G e recusas de rollback 7B/7E/7G: aprovadas.
- Base QA destruída; zero base residual.

## Limites e decisão

O checkpoint contém um beta gate operacionalmente componível, fail-closed e
auditável. `beta_ready` continua sem significar ativação automática. Para um
release real ainda são obrigatórios: configuração dos issuers/chaves e endpoint
HTTPS, atestações reais para o candidate exato, build real, ambiente alvo,
allowlist real, rollback verificado e decisão humana autorizada.

Veredicto da implementação: `phase7_integrated_accepted`.

Veredicto operacional atual: beta não ativada, nenhum deploy e nenhum Live.
