# FASE 7A — Contrato de Beta Readiness

## Decisão

A FASE 7 pós-Research Lab corresponde a hardening integrado, readiness e beta
gate. A designação antiga “Phase 7 — Dataset Catalog and acquisition” foi
absorvida pela FASE 6E; as antigas Fases 8–16 foram igualmente concretizadas
pelas Fases 6F–6N. A 7A não duplica essas capacidades.

## Âmbito

A 7A introduz um contrato fechado e um avaliador determinístico, content-addressed
e fail-closed. O avaliador recebe evidência já produzida; não executa testes, não
consulta CI, não lê PostgreSQL e não promove qualquer estratégia.

Os nove gates obrigatórios são:

1. integridade do source/checkpoint;
2. testes determinísticos;
3. validação PostgreSQL;
4. reproducibilidade de migrations;
5. análise estática;
6. build de produção;
7. segurança das dependências;
8. verificação CI;
9. contenção operacional.

Cada evidência fica vinculada ao checkpoint, tem instante de observação, validade
explícita e referência. Evidência ausente, duplicada, inválida, falhada,
indisponível, expirada ou pertencente a outro checkpoint bloqueia o gate.

## Invariantes

- `beta_ready` é uma conclusão de readiness, não autorização de promoção.
- O contrato não representa `live`, broker, ordem, fill, accounting ou execução.
- A ordem do input não altera a ordem canónica dos gates nem o hash do relatório.
- Timestamps são ISO-8601 UTC explícitos; não existe fallback para o relógio local.
- O input é closed-schema e rejeita accessors, prototypes e propriedades extra.
- O hash usa SHA-256 com domínio `investing-beta-readiness-report/v1`.
- `node:crypto` existe apenas no módulo `server-only`.

## Gate 7A

- manifesto completo produz relatório `beta_ready` determinístico;
- falha, indisponibilidade, staleness e checkpoint mismatch bloqueiam;
- input adversarial nunca lança;
- nenhuma dependência de Trading, broker, execution, Supabase ou PostgreSQL;
- TypeScript, ESLint e suites 7A aprovados;
- nenhuma alteração ao schema ou runtime operacional.

## Fora do âmbito

Persistência do relatório, recolha automática de evidências, API/UI, beta rollout,
promoção e qualquer ativação operacional pertencem a subfases posteriores e
exigem gates próprios.
