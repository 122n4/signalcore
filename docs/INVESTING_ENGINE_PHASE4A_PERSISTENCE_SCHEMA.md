# Investing Engine — FASE 4A Persistence Schema

Data: 2026-07-20

Estado: **IMPLEMENTADA E PROVADA EM POSTGRESQL 17 LOCAL ISOLADO**

Âmbito: schema, migrations, contratos de persistência, RLS, append-only, idempotência e testes. A FASE 4B não foi iniciada.

## 1. Resumo executivo

A FASE 4A criou uma fronteira de persistência canónica, Paper-only e não executável para o resultado congelado do Investing Engine v1. Uma run só pode ser selada se, na mesma transação, existirem os 12 artefactos obrigatórios, quatro phase summaries, shadow package pendente, reason evidence e 13 claims de idempotência coerentes.

O schema foi instalado de zero em duas bases independentes e sobre um schema anterior à 4A, reaplicado, removido em base vazia e reaplicado. Os dois dumps limpos foram byte-equivalent após normalização. A assinatura do schema legacy permaneceu igual. PostgreSQL real provou RLS, append-only, integridade, concorrência e ausência de manifests parciais.

Não foram criados persistence service, runtime adapter, replay service, API, UI, worker, scheduler, queue, broker, execução, accounting, reconciliation ou shadow comparison operacional.

## 2. Modelo de dados

Foi escolhido um modelo híbrido:

- raiz especializada `investing_engine_runs` para identidade, snapshots, versões, estado final e manifest de hashes;
- `investing_engine_artifacts` genérica para os 12 payloads canónicos imutáveis;
- tabelas especializadas para phase summaries, reason/evidence, shadow pendente e claims de idempotência.

Este desenho evita 12 tabelas quase idênticas, mantém tipos de artefacto explícitos e cria índices escalares próprios para as consultas operacionais futuras. O payload permanece exatamente como texto canónico; uma coluna JSONB gerada valida e disponibiliza a estrutura sem substituir os bytes originais.

## 3. Justificação do desenho

Uma tabela genérica isolada seria fraca para consultas de shadow, razões e idempotência. Tabelas totalmente especializadas repetiriam ownership, RLS, hashing, sealing e retenção. O modelo híbrido concentra invariantes comuns e especializa apenas os índices de leitura necessários.

A run é atómica: a DB grava `persistence_txid` server-side em raiz e filhos. A FK composta exige que todos pertençam à mesma transação. Depois do commit não é possível acrescentar artefactos ou evidência à run; uma correção exige nova run/novos artefactos.

## 4. Tabelas e colunas

| Tabela | Conteúdo principal |
|---|---|
| `investing_engine_runs` | run/user/owner/account, Paper environment, `as_of`, quatro snapshot IDs, `version_set`, estado, quality, confidence, 13 hashes, idempotency, source e `executable=false` |
| `investing_engine_artifacts` | tipo explícito, phase, state, quality, confidence, content/final hashes, contract/schema versions, payload canónico preservado, JSONB gerado, sealed e executable |
| `investing_engine_phase_summaries` | 3C/3D/3E/3F, state, quality, input/output hashes, warnings, blockers e reasons |
| `investing_engine_reason_evidence` | reason code, phase, severity, consequence, evidence hash e referências opcionais a symbol/order/constraint |
| `investing_engine_shadow_packages` | shadow hash, resultado novo, estado fixo `awaiting_legacy_result`, campos legacy/comparison nulos e executable false |
| `investing_engine_idempotency_keys` | scope, key, artifact type, owner/account/run e expected content hash |

Tipos de artefacto obrigatórios:

| Phase | Artefactos |
|---|---|
| 3C | canonical input; portfolio state derivation |
| 3D | risk assessment; policy evaluation; constraint evaluation; feasible decision envelope |
| 3E | construction model; preliminary proposal |
| 3F | final decision; audit bundle; shadow package; final result |

## 5. Constraints

O schema final contém 69 constraints nas seis tabelas. As principais são:

- checks de IDs, hashes SHA-256 lowercase, versões, JSON, quality, state e confidence;
- `account_mode='paper'`, `environment='paper'`, `executable=false` e `sealed=true`;
- `requested_user_id=owner_id`, validado também contra a conta;
- um único artefacto de cada tipo e um único summary de cada phase por run;
- um único final result e um único shadow package por run;
- idempotency claim único por owner/account/scope/key e por run/artifact type;
- payload entre 2 bytes e 16 MiB, top-level object, sem nomes de chave de secrets/tokens/credentials/stack;
- correspondência obrigatória tipo ↔ source phase.

## 6. Foreign keys e integridade referencial

- `investing_engine_runs.account_id` referencia `investing_accounts.id` com `ON DELETE RESTRICT`.
- Um trigger confirma que a conta é do owner e tem environment Paper.
- Todas as tabelas filhas usam FK composta para `(run_id, owner_id, account_id, final_result_hash, persistence_txid)`.
- O constraint trigger diferido do manifest confirma cada tipo/hash, os quatro phase hash chains, o shadow, reason evidence e todas as claims de idempotência antes do commit.
- O audit bundle e todos os restantes artefactos ficam ligados ao final result pela raiz e por `final_result_hash`, sem criar ciclos de hash dentro do payload 3F congelado.

Não há FK nem dependência para orders, fills, queue, ledger, reconciliation ou tabelas legacy.

## 7. Índices

Foram criados 30 índices no total, incluindo PKs/uniques. Os índices adicionais cobrem:

- última run por owner/account/as-of;
- runs por período e estado;
- partial index para blocked/insufficient;
- replay por owner/account/input snapshot/final hash;
- artefactos por scope, tipo, hash e data;
- summaries por phase/data;
- reasons por code/data e run/phase;
- pending shadow packages;
- idempotency lookup e artifact type/hash.

Não existe GIN sobre payload JSON. A indexação limita-se ao metadata que sustenta consultas previsíveis.

## 8. RLS e grants

As seis tabelas têm `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`. Cada uma tem policy SELECT para `authenticated` com `owner_id = auth.jwt()->>'sub'`.

- authenticated: apenas SELECT das próprias rows;
- anon: SELECT concedido mas sem policy aplicável, logo zero rows e zero enumeração de hashes;
- service_role: apenas SELECT e INSERT, com RLS bypass próprio do role e todas as constraints/triggers ativas;
- authenticated/anon: sem INSERT, UPDATE ou DELETE;
- funções internas dos triggers: sem EXECUTE direto para browser ou service roles.

Os testes provaram A lê A, A não lê B, anon não lê, browser não insere e service role insere uma run completa válida.

## 9. Append-only e sealing

Todas as seis tabelas têm trigger `BEFORE UPDATE OR DELETE` que lança `investing_engine_append_only_violation`. Foram rejeitados update de payload, hash, owner, account e run, delete de artefacto e delete de run com children.

O `persistence_txid` é sempre substituído pelo valor server-side. Assim, um filho inserido numa transação posterior não consegue satisfazer a FK composta. O teste multi-sessão tentou acrescentar reason evidence após o commit: PostgreSQL rejeitou e a row count permaneceu 1.

O rollback manual também falha se existir qualquer run. Não há purge automático nem bypass administrativo no runtime.

## 10. Idempotência

Cada persistência lógica tem owner, account, run, scope, key, artifact type e expected hash. A raiz tem ainda unique `(owner, account, scope, key)`.

- mesma key + mesmo hash: o retry faz `ON CONFLICT DO NOTHING`, lê a row canónica e não duplica;
- mesma key + hash diferente: a unique claim impede nova aquisição e o harness classifica conflito estrutural;
- mesmo run ID + resultado diferente: a PK admite um único vencedor;
- mesmo artefacto/hash + outro owner/account/type: trigger com advisory transaction lock rejeita a segunda claim;
- o mesmo snapshot/model hash pode ser reutilizado por outra run do mesmo owner/account e mesmo tipo.

Esta última regra evita bloquear legitimamente um model snapshot versionado que seja usado em duas runs.

## 11. Concorrência

Três ligações PostgreSQL independentes, `lock_timeout=10s` e `statement_timeout=20s`, provaram:

| Cenário | Resultado |
|---|---|
| dois writers, mesma key/mesmo hash | 2 respostas; 1 run; 12 artefactos; um replay |
| mesma key/hash diferente | 1 conflito; zero run parcial |
| mesmo artifact hash em tenants diferentes | 1 winner; 1 rejeição; 1 manifest completo |
| mesmo model hash no mesmo scope | 2 runs completas válidas |
| mesmo run ID/resultados diferentes | 1 winner; 1 rejeição; 1 manifest completo |
| append após commit | rejeitado; nenhuma row adicional |

As nove corridas do Persistent Paper existente também continuaram verdes.

## 12. Paper-only enforcement

Checks de DB impedem `account_mode` diferente de Paper, `environment` diferente de Paper e `executable=true`. O trigger de ownership exige ainda uma `investing_account` Paper do mesmo owner.

Inserts Live e executable foram exercitados e rejeitados no schema. Nenhuma tabela 4A contém estado ou coluna que permita order submission, fill, broker execution ou ledger mutation.

## 13. Estratégia de hashes e payload canónico

- hashes persistidos como 64 caracteres hex lowercase;
- bytes do JSON canónico preservados em `canonical_payload text`;
- `payload_json` gerado valida JSON e permite inspeção futura;
- contrato, schema version, source phase e final linkage ficam fora e junto do payload;
- a DB valida formato, imutabilidade e relações, mas não recalcula decisões financeiras;
- a recomputação SHA-256 payload ↔ hash será responsabilidade obrigatória da fronteira 4B antes do INSERT.

Um content hash pode repetir apenas no mesmo owner/account e artifact type. Um lock por hash torna esta regra segura sob concorrência real.

## 14. Migrations

- Forward: `20260720100000_investing_engine_v1_persistence.sql`.
- Down manual: `supabase/rollbacks/20260720100000_investing_engine_v1_persistence.down.sql`.
- Ordem total validada: 29 migrations, sem timestamp duplicado; 4A é a última.
- From zero: passou em duas bases limpas.
- Sobre schema atual: 28 migrations anteriores + 4A passou.
- Reapply: passou sem alteração estrutural.
- Rollback vazio: passou; removeu apenas os seis objetos-table 4A; reapply passou.
- Rollback com runs: bloqueado e preservou as seis tabelas.

Não houve data migration, backfill, cópia de `portfolio_items`, alteração legacy ou cutover.

## 15. Testes executados

- `supabase/tests/investing_engine_phase4a.sql`;
- `scripts/qa/runInvestingEnginePhase4AConcurrency.mjs`;
- `tests/investingEnginePhase4ASchemaIsolation.test.ts`;
- quatro suites SQL PostgreSQL operacionais já existentes;
- concorrência Persistent Paper já existente;
- suites 3A–3F completas;
- TypeScript, ESLint e `git diff --check`;
- scans de dependências legacy, Trading, broker, provider, execution e callers.

O workflow `investing-postgres.yml` passou a executar SQL e concorrência 4A depois de aplicar todas as migrations de zero.

## 16. Resultados

| Validação | Resultado |
|---|---|
| PostgreSQL SQL | 5 scripts passed, 0 failed |
| Concorrência 4A | 6 cenários passed, 0 failed |
| Concorrência operacional existente | 9 cenários passed, 0 failed |
| 3A–3F + isolamento 4A | 17 ficheiros, 233 testes passed |
| Isolamento 4A | 5 passed |
| Suite global | 247 ficheiros passed, 3 baseline Trading failed, 15 skipped; 1035 testes passed, 6 baseline Trading failed, 22 skipped |
| TypeScript | passed |
| ESLint | passed |
| Migration from zero/current/reapply | passed |
| Rollback guard | passed |

As seis falhas baseline Trading Paper permanecem fora do âmbito e não foram corrigidas.

## 17. Schema diff

Dois schemas criados independentemente a partir das 29 migrations produziram o mesmo SHA-256 normalizado:

`8314f0b18669257dfb13b93b490d20c435bc5aa5a8cd3176a42e4a16e6623e4f`

Resultado: schema diff vazio. Após rollback vazio + reapply, o mesmo hash foi obtido. Na aplicação sobre o schema pré-4A, a assinatura das colunas legacy permaneceu `2c7300e5ca046f711464ed96c0557955` antes e depois.

## 18. Queries futuras preparadas

O schema e os testes cobrem os shapes para:

- última run: owner/account ordenado por `as_of, created_at desc`;
- runs por período: owner + intervalo de `as_of`;
- run completa: raiz + artefactos + summaries + reasons + shadow;
- artefacto por content hash e type;
- blocked/insufficient runs pelo partial index;
- shadow packages com `awaiting_legacy_result`;
- reason codes por período;
- replay lookup por owner/account/input snapshot/final result hash.

Estas são apenas consultas de desenho/teste; nenhum load/replay service foi criado.

## 19. Retenção e tamanho

- retenção inicial: indefinida/sem purge; runs auditáveis são preservadas;
- payload máximo: 16 MiB por artefacto, sem truncagem;
- compressão: PostgreSQL TOAST inicialmente; compressão externa só após medição;
- archival: futuro processo explícito, verificável e não destrutivo antes de validação;
- particionamento: considerar por `created_at` apenas quando volume real justificar;
- crescimento estimável: 12 payloads + metadata por run; monitorizar bytes por owner/account e percentis de payload.

## 20. Segurança

É proibido persistir passwords, secrets, API keys, authorization headers, bearer values, access/refresh tokens, broker credentials/tokens, stack traces e PII não exigida pelo contrato. O campo canónico `authorization` do decision envelope é permitido porque contém apenas identidade/account/Paper e não um header HTTP. O schema rejeita os restantes nomes de chave de alto risco, JSON inválido, payload excessivo, tipos/versions inválidos e qualquer scope não Paper.

O 4B deve usar DTOs allowlist, scan de conteúdo e recomputação de hash antes de abrir a transação. Não deve enviar raw errors, auth objects, provider responses ou config/environment dumps para estes payloads.

## 21. Limitações deliberadas

- não existe save/load/replay adapter;
- não existe verificação criptográfica payload/hash na DB;
- não existe validação semântica financeira dentro de PostgreSQL;
- shadow permanece pendente e imutável, com legacy/comparison nulos;
- reason references são evidência textual, não FK para ordens operacionais;
- sem partitioning, archive ou purge;
- sem API/UI/staging/cutover;
- nenhum caller operacional.

## 22. Riscos residuais

1. Até 4B, um caller service-role incorreto poderia fornecer um hash formalmente válido que não corresponda ao payload inicial. Não poderia alterá-lo depois do commit. 4B deve recomputar e comparar todos os hashes antes do INSERT.
2. Uma denylist de nomes de chave não identifica um secret escondido sob um nome inócuo. 4B deve aceitar apenas DTOs canónicos allowlisted.
3. Crescimento de payload ainda não foi medido em workload real; não se deve escolher partitioning ou archival sem métricas.
4. O hash advisory lock pode serializar hashes com a mesma chave de 64 bits; uma colisão apenas reduz throughput, não relaxa integridade.

Nenhum destes riscos exige reabrir 3A–3F ou o núcleo operacional.

## 23. Critérios de aceitação da 4A

- seis tabelas canónicas e 12 tipos de artefacto: cumprido;
- manifest completo e reconstruível: cumprido;
- owner/account/run/final-result scope: cumprido;
- Paper-only e executable false no schema: cumprido;
- RLS/FORCE RLS em todas as tabelas: cumprido;
- append-only e sealing transacional: cumprido;
- idempotência e concorrência PostgreSQL real: cumprido;
- from-zero, current, reapply, diff e rollback seguro: cumprido;
- sem legacy/dual-write/backfill: cumprido;
- sem runtime/execução/replay/cutover: cumprido.

FASE 4A pronta para aceitação formal. A 4B continua bloqueada até autorização explícita.

## 24. Prova de congelamento 3A–3F

O patch 4A limita-se a:

- migration e rollback 4A;
- contratos estáticos em `engine/v1/persistence` sem import das phases;
- SQL, teste de isolamento e harness QA 4A;
- extensão do workflow PostgreSQL;
- este relatório.

O scan não encontrou caller de persistence em `app`, `components`, `scripts` ou `lib`; o script QA fala diretamente com o schema e não importa o engine. As 17 suites 3A–3F/4A passaram. Nenhum ficheiro sob `phase3c`, `phase3d`, `phase3e` ou `phase3f` foi escrito pela 4A; os caminhos 3A operacionais também não foram alterados nesta fase.

Declarações finais:

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- fases 3A–3F modificadas: **não**.
- tabelas legacy modificadas: **não**.
- migrations aplicadas: **sim, apenas em PostgreSQL local isolado; não em staging/produção**.
- RLS criada: **sim**.
- append-only provado: **sim**.
- idempotência provada: **sim**.
- concurrency provada: **sim**.
- Live continua bloqueado: **sim**.
- caller operacional criado: **não**.
- FASE 4B iniciada: **não**.
