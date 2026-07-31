# FASE 7 — Hardening, readiness e beta gate

## Sequência oficial

| Subfase | Âmbito | Estado |
|---|---|---|
| 7A | Contrato determinístico e fail-closed de readiness | Concluída |
| 7B | Recolha por ports e persistência imutável | Concluída |
| 7C | Boundary autenticada e projeção OPS read-only | Concluída |
| 7D | Runtime de trusted sources, timeouts e concorrência | Concluída |
| 7E | Release candidate identity e effective readiness | Concluída |
| 7F | UI OPS read-only | Concluída |
| 7G | Beta activation boundary, allowlist, kill switch e rollback | Concluída |
| 7H | Validação integrada, auditoria e beta gate final | Concluída |

## Separação obrigatória

`relatório histórico beta_ready → readiness efetivo do release candidate → decisão
humana e boundary de ativação`

Nenhuma das três condições implica automaticamente a seguinte. Em particular,
`beta_ready` nunca é uma autorização de ativação, promoção, deploy ou Live.

## Gate transversal

Antes de 7G, todo readiness tem de estar ligado ao commit, lockfile, conjunto de
migrations, build, runtime, configuração operacional e ambiente alvo exatos.
