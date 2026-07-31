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

## FASE 7B — Recolha e persistência

A 7B acrescenta ports fechados, exatamente um por gate, recolhidos em paralelo e
reordenados canonicamente antes da avaliação. Ausência, duplicação ou exceção de
um collector falha antes de existir relatório utilizável.

O par manifesto/relatório é reavaliado antes de qualquer IO e persistido numa
tabela content-addressed pelo `reportHash`. A tabela é append-only, tem RLS
forçado e não concede acesso a `authenticated`; apenas o boundary `service_role`
pode inserir e ler. Um conflito só converge quando o payload canónico é idêntico.
O rollback é recusado quando já existe evidência.

A 7B continua sem API, UI, scheduler, promoção ou ativação beta.

## FASE 7C — Boundary autenticada e projeção OPS

A 7C autoriza a leitura através da operação existente `view_research_lab_ops` e
exige membership resolvida server-side. O scope não é aceite do browser. Como o
readiness pertence ao checkpoint da plataforma, e não a uma carteira, o scope
serve apenas para autorizar o operador autenticado.

A projeção lista no máximo 20 relatórios e contém apenas hash, checkpoint, estado,
instante e perfil. Não seleciona nem devolve `canonical_payload`, evidências,
secrets ou dados financeiros. Não possui mutations, API pública, UI, promoção ou
ativação beta.

## FASE 7D — Trusted collection runtime

Cada gate fica vinculado a um `issuerId` e chave pública Ed25519 próprios. O
runtime só aceita attestations closed-schema cuja assinatura, gate e checkpoint
coincidam com esse vínculo. A chave privada nunca pertence à aplicação.

Timeout e indisponibilidade tornam-se evidência explícita `unavailable` e
bloqueiam readiness. Assinatura, issuer ou checkpoint inválidos invalidam a
coleção inteira. Avaliações concorrentes idênticas usam single-flight; uma
avaliação contraditória para o mesmo checkpoint é recusada.

A composição de produção usa HTTPS, token server-side e chaves públicas por gate.
Não existe fallback para mocks, prova autoatestada ou evidência vinda do browser.

## FASE 7E — Release identity e effective readiness

O release candidate é content-addressed sobre commit completo, hashes do lockfile,
migrations, artefacto de build e configuração operacional, `buildId`, perfil de
runtime e ambiente alvo. Alterar qualquer dimensão cria outro candidato.

O estado efetivo revalida o relatório canónico, exige binding exato ao commit e
reavalia a validade temporal das nove evidências. Um candidato novo no mesmo
ambiente supersede explicitamente o assessment anterior sem o alterar. Revogações
são append-only e tornam a reutilização do mesmo assessment bloqueada.

Candidate, assessment e revogação são persistidos em tabelas imutáveis com RLS
forçado, acesso exclusivo `service_role`, FKs de integridade e rollback fail-closed.
Ainda não existe ativação beta.
