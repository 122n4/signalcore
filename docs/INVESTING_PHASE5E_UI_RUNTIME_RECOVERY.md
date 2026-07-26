# Investing FASE 5E-R — UI Runtime Recovery

## Motivo da recuperação

A implementação 5E anterior tinha componentes e presenters úteis, mas o seu
runtime de produção terminava fail-closed com `null`. Fixtures e boundaries
injetadas provavam apresentação unitária, não a integração real. A worktree
antiga `feat/investing-phase5e` permanece preservada e não foi alterada.

## Dependências congeladas

A UI depende da identidade PostgreSQL/RLS aceite na FASE 5B-R e da composition
root OPS aceite na FASE 5D-R. Não replica pool, resolver, read model, integrity,
verifier, replay, SQL ou canonicalização.

## Reutilização seletiva

Foram preservados os princípios visuais do shell, cartões, badges, estados
vazios e hierarquia responsiva da 5E anterior. Foram rejeitados o runtime
`null`, reason codes visíveis, labels derivadas de scope, fixtures como prova
vertical e qualquer composição alternativa.

## Ponto único de integração

`lib/investing/ui/server/runtime.server.ts` é o único ponto que chama
`createProductionInvestingOpsRuntimeV1`. Cada loader cria uma runtime por
operação pública, usa o serviço OPS oficial e executa `close()` em `finally`,
incluindo em falhas.

## Rotas

- `/investing`: snapshot operacional real.
- `/investing/runs`: até 50 runs na ordenação oficial.
- `/investing/runs/[runId]`: detalhe autorizado e read-only.

As rotas são Server Components dinâmicos em runtime Node. Não foi criada API
Route nem Server Action.

## View models e estados públicos

Os view models removem scope, payload canónico, hashes e reason codes internos.
Números não finitos, negativos ou de tipo incorreto tornam-se
`Indisponível`; datas inválidas seguem a mesma regra. Ausência de sessão e
membership inválida usam uma mensagem pública não enumerável. Run inexistente
e cross-scope produzem exatamente o mesmo estado público.

Os estados distinguem sucesso, vazio, informação parcial, bloqueio,
indisponibilidade e acesso não autorizado. Integrity, verifier e replay são
apenas apresentados; a UI nunca inicia replay.

## Métricas

São apresentadas, quando válidas, `totalRuns`, `runsInPeriod`,
`latestRunAgeMs` e `generationDurationMs`. As onze métricas sem proveniência
oficial permanecem sempre `Indisponível`, mesmo que um valor inesperado surja
no contrato:

`totalRequests`, `created`, `existing`, `recovered`, `failed`, `blocked`,
`idempotencyConflicts`, `identityFailures`, `authorizationFailures`,
`integrityFailures` e `persistenceFailures`.

## Segurança, isolamento e zero writes

Nenhum Client Component importa UI server-only, OPS, identidade ou PostgreSQL.
O único Client Component é o boundary visual de erro, sem dados. Não existem
scope inputs, SQL, fixtures, mocks ou fallback estático no grafo de produção.

A prova vertical usa apenas leitor de sessão controlado, clock, PostgreSQL QA e
`runId`; atravessa Clerk adapter, directory 5B-R, resolver, factory 5D-R,
loader, presenter e renderização. Fingerprints com counts, conteúdo e `xmin`
das tabelas de identidade e das seis tabelas Engine confirmam zero writes para
dashboard, histórico, detalhe autorizado, inexistente, cross-scope e acesso
negado.

## Limites e fora de escopo

A UI é exclusivamente read-only. Não oferece criação de runs, replay manual,
repair, edição, ordens, posições, depósitos, brokers, Trading, tenant
management, workers, telemetria nova, feature flags 5F ou deploy.
