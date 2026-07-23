# Investing Engine — FASE 4B Persistence, Verify e Replay

Data da validação: 2026-07-21. Âmbito: serviço aplicacional 4B e PostgreSQL local isolado. Não existe cutover operacional.

## 1. Resumo executivo

A 4B implementa persistência atómica e idempotente dos 12 artefactos selados da 3F, leitura completa, verificação estrutural/criptográfica e replay determinístico. Os testes provaram um único commit lógico, retry sem duplicação, rollback total, recuperação após resposta de commit desconhecida, replay byte-equivalente e rejeição fail-closed de corrupção. Não foi criado caller de produto, API, cron, UI, queue, broker ou execução.

## 2. Arquitetura persist/load/verify/replay

O fluxo é `sealed 3F bundle -> verifier -> manifest builder -> writer -> repository port -> PostgreSQL`. A leitura segue `selector scoped -> snapshot read-only -> verifier -> verified load`. O replay segue `verified load -> reconstrução dos sources selados -> runner puro injetado -> comparação canónica`. A persistência nunca recalcula finanças; o replay não possui acesso próprio a DB, provider ou relógio.

## 3. Contratos

Foram definidos input autorizado, manifest v1, artefacto selado, identidade, VersionSet, claims, summaries, reasons, run persistida, verified load, resultados de persist e replay e o port do runner puro. `accountMode/environment=paper` e `executable=false` são invariantes de contrato. O input inclui request, context, canonical input, portfolio derivation, risk, policy, constraints, envelope, construction model, proposal, decision, explanation, audit, shadow, final result, summaries e reasons.

## 4. Repository port

`InvestingEnginePersistenceRepositoryPortV1` não depende de Supabase. Expõe transação, advisory locks, pesquisas scoped, inserts separados, validação de contagens, materialização de constraints, commit e rollback. O read port cobre scope completo, hash final, idempotency key e latest por account.

## 5. Adapter PostgreSQL

O adapter usa `pg`, recebe `Pool` ou connection string externamente e não lê environment/secrets por conta própria. Só consulta/escreve `investing_engine_*`. Não importa browser client, Supabase SDK, legacy, Trading, broker ou runtime Investing. Loads completos usam uma única transação `REPEATABLE READ READ ONLY` e ordenação semântica estável.

## 6. Manifest

`investing-engine-persistence-manifest/v1` contém owner/account/run/asOf, snapshots, VersionSet, idempotency scope/key, state/quality, request/final hashes, 12 tipos/hashes na ordem fixa 3C→3F, hashes dos quatro summaries, reason evidence, contagens, schema version e SHA-256. O manifest não requer coluna nova: é derivado e verificado a partir do conjunto selado 4A.

## 7. Transação

Sequência implementada: validate bundle; build manifest; `BEGIN`; lock de idempotency e run; leitura/validação de eventual existente; insert root; 12 artefactos; quatro summaries; reasons; shadow; 13 claims; contagens; `SET CONSTRAINTS ALL IMMEDIATE`; commit. Uma falha em qualquer ponto executa rollback. A integridade 4A por `persistence_txid` continua a impedir children tardios.

## 8. Idempotência

Mesma key/mesmo manifest retorna `idempotent_existing` sem writes. Mesma key/manifest diferente produz `persistence_idempotency_conflict`. Mesmo run/conteúdo repetido é idempotente; mesmo run/conteúdo diferente produz `persistence_run_conflict`. Advisory locks serializam key e run antes da inspeção. Nenhuma unique violation genérica é convertida em sucesso sem load e comparação do manifest completo.

## 9. Recovery

Se a resposta do commit for ambígua, o writer relê pela key, verifica todas as rows e compara o manifest. Só então devolve `recovered_after_ambiguous_commit`; ausência ou divergência permanece fail-closed. Foram injetadas falhas em cada passo pré-commit e uma perda simulada da resposta depois do commit.

## 10. Leitura completa

O reader suporta owner+account+run, finalResultHash, idempotency e latest scoped. Retorna status `complete`, root, manifest, artefactos, summaries, evidence e shadow. Missing, extra, duplicate, scope errado, versão errada, payload não canónico, count errado ou tx boundary misturada falham; não existe recuperação parcial.

## 11. Verificação

O verifier recalcula hashes canónicos de input, risk, policy, envelope, construction, proposal, decision, explanation, actions, evidence nodes, audit, shadow e final result. Portfolio state e constraints mantêm a semântica set-hash da 3F. Também reconstrói o manifest integral a partir dos payloads persistidos e compara os seus bytes/hash, além de validar request/context, VersionSet, ownership, account, run, snapshots, phase linkage, contagens, claims, Paper, `executable=false`, schema version e bytes canónicos.

## 12. Replay

`InvestingEngineReplayServiceV1` recebe um runner puro por injeção; a camada de produção 4B não importa a namespace 3F e, portanto, não cria caller operacional. Após um único verified load, reconstrói request/context e os sources exclusivamente dos artefactos selados. Resultados: `replay_match`, `replay_mismatch` ou `replay_blocked_by_integrity_error`. Nunca persiste automaticamente.

## 13. Comparação byte-equivalente

A comparação começa pelos bytes canónicos do final result inteiro e produz paths determinísticos de diferença. Assim cobre state, proposal, actions, target, risk before/after, warnings, blockers, reasons, explanation e todos os hashes. Foram provados `proposal_ready`, `no_trade`, `degraded`, `blocked` e `insufficient_data`.

## 14. RLS

Em PostgreSQL real, `authenticated` com owner correto leu os próprios runs; outro owner e `anon` obtiveram zero rows; update direto foi recusado. Os testes SQL 4A também cobrem isolamento de artefactos/hash e inserts. O adapter foi exercitado por superuser apenas no banco local; um caller futuro terá de permanecer numa fronteira server-side controlada. `FORCE RLS` e grants 4A permanecem ativos.

## 15. Corrupção testada

Em memória e, para os casos materiais, em PostgreSQL local com administração deliberada, foram adulterados payload, content hash, artefacto em falta/extra/duplicado, owner, account, run ref, schema version, summary, reasons, shadow hash, snapshot, final hash, executable, Live, claims e transaction id. Load e replay bloquearam sem repair, estado atual ou fallback legacy. As constraints foram removidas apenas no banco descartável para simular corrupções que o schema normal já impede.

## 16. Concorrência testada

Foram usados pools/conexões independentes e dois processos Node separados. Cobertura: mesma key/conteúdo, mesma key/conteúdo diferente, mesmo run divergente, reason/shadow incluídos no único commit, falha antes do commit, resposta desconhecida após commit e retry. Resultado: um commit lógico, zero duplicados e zero órfãos.

## 17. Ficheiros criados

- `lib/investing/engine/v1/persistence/`: `canonical.ts`, `contracts.ts`, `errors.ts`, `manifest.ts`, `repositoryPort.ts`, `writer.ts`, `reader.ts`, `verifier.ts`, `replay.ts`, `service.ts`, `index.ts`.
- `lib/investing/engine/v1/persistence/postgres/`: `adapter.ts`, `queries.ts`, `transaction.ts`, `index.ts`.
- Testes: `investingEnginePhase4BPersistence.test.ts`, `investingEnginePhase4BIntegrityReplay.test.ts`, `investingEnginePhase4BIsolation.test.ts`, `investingEnginePhase4BPostgres.integration.test.ts` e fixtures/worker 4B.
- Este relatório.

## 18. Ficheiros alterados

- `supabase/migrations/20260720100000_investing_engine_v1_persistence.sql`: correção estritamente necessária da denylist para permitir o campo canónico `authorization`; continuam proibidos authorization headers, bearer, passwords, keys, tokens e broker credentials.
- `docs/INVESTING_ENGINE_PHASE4A_PERSISTENCE_SCHEMA.md`: documentação dessa distinção.
- `tests/fixtures/investingEnginePhase3FFixture.ts`: apenas parâmetros opcionais `accountId/runId` para QA; nenhum engine 3F alterado.
- `.github/workflows/investing-postgres.yml`: gate 4B local PostgreSQL após 4A.

## 19. Testes executados

- 4B unit/integrity/isolation: 19/19.
- 4B PostgreSQL real: 5/5, incluindo múltiplos processos e 15 cenários de corrupção.
- 3A–3F + 4A + Persistent Paper + 4B: 255/255 por agregação dos gates dirigidos; integração PG ficou intencionalmente skipped na invocação sem env e foi executada separadamente.
- SQL: P0/P1, security/accounting, rollback/recovery, reconciliation breaks e 4A.
- Concorrência operacional: nove races; concorrência 4A: seis cenários.

## 20. Resultados

Persist válido criou 1 root, 12 artefactos, 4 summaries, 1 shadow, 13 claims e o número exato de reasons da decisão. Exact retry não escreveu. Falhas pré-commit deixaram root/artifacts a zero. Commit ambíguo recuperou por manifest. Replay conservou final hash e bytes. Toda a corrupção testada foi rejeitada.

## 21. Migrations e schema diff

As 29 migrations foram aplicadas do zero em `signalcore_engine4b_zero_a` e `signalcore_engine4b_zero_b`, apenas PostgreSQL local em `127.0.0.1:55432`. Dumps normalizados (excluindo os tokens aleatórios `\\restrict`) produziram o mesmo SHA-256: `4775da95a6bed885baf74c00f20fd4ef586fd40e2cbaf4c7a690a15ff473366f`. Não houve aplicação em staging/produção e não houve data migration/backfill.

## 22. Regressões

As 21 suites dirigidas de 3A–3F, 4A, 4B e Persistent Paper passaram; os cinco testes PostgreSQL foram executados separadamente e passaram. A suite global confirmou 250 ficheiros/1054 testes passados, 16 ficheiros/27 testes skipped e exatamente as seis falhas baseline em três ficheiros Trading Paper (`paperRunnerConcurrency`, `paperRunnerHistory`, `paperSignalExecutionContract`). Não foram corrigidas nesta fase.

## 23. Validação estática

`npx tsc --noEmit`, ESLint dirigido sem erros/warnings após limpeza, `git diff --check` e scans de imports/callers foram executados. A canonicalização recusa Number/undefined/cycles/non-plain objects e chaves de credenciais. O adapter usa queries parametrizadas.

## 24. Isolamento

Não existem imports de 3A–3F na implementação 4B, nem imports de app, Trading, broker, runtime, provider ou browser. Não existe uso de localStorage, fetch, relógio, randomness, Supabase browser client ou tabelas legacy. Só testes/fixtures conhecem simultaneamente 3F e 4B para injetar o runner puro.

## 25. Limitações deliberadas

Não há caller de produção, API, cron, UI, OPS, scheduler, queue, shadow legacy comparison, backfill, staging ou Live. Latest existe apenas no repository/reader. O manifest é derivado do conjunto selado porque o schema 4A não possui coluna própria; a verificação integral prova a mesma propriedade sem migration nova.

## 26. Riscos residuais

Antes de 4C será necessário decidir a fronteira server-side/autenticação e o modelo de operação/telemetria sem expor o adapter. O PostgreSQL local prova semântica e RLS, mas não substitui validação de latência/rede no futuro staging. A denylist complementa — não substitui — a allowlist estrutural; nomes inócuos ainda exigem revisão de contrato.

## 27. Critérios de aceitação

- Bundle 3F incompleto ou incoerente bloqueia antes de IO.
- Uma run completa tem exatamente 12 artefactos/4 summaries/1 shadow/13 claims e reasons completos num txid.
- Retry exacto não escreve; divergência conflita.
- Load nunca devolve parcial.
- Replay usa somente a leitura histórica inicial e é byte-equivalente.
- Corrupção, cross-scope, Live ou executable bloqueiam.
- PostgreSQL/RLS/concorrência/regressões/static checks ficam verdes.
- Nenhum caller operacional e nenhuma fase 4C.

## 28. Prova de congelamento 3A–3F e 4A

Nenhum ficheiro de implementação em `phase3a`–`phase3f` foi alterado. O único apoio 3F alterado é uma fixture de testes com IDs parametrizáveis. A migration 4A recebeu apenas a correção necessária para compatibilidade com o contrato já aprovado: permitir o campo de domínio `authorization`, sem permitir headers/tokens. As suites 3A–3F/4A e SQL 4A passaram depois da alteração.

## Declarações finais

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- Fases 3A–3F modificadas: **não** (implementação congelada; apenas fixture QA parametrizada).
- Schema 4A modificado: **sim**, correção estritamente necessária da denylist, sem tabela/coluna/índice novo.
- Migrations aplicadas: **sim, apenas em PostgreSQL local isolado**; staging/produção: não.
- Persistence service criado: **sim**.
- PostgreSQL adapter criado: **sim**.
- Idempotência operacional provada: **sim**.
- Atomicidade provada: **sim**.
- Load completo provado: **sim**.
- Verificação criptográfica provada: **sim**.
- Replay determinístico provado: **sim**.
- Corrupção detetada: **sim**.
- Concorrência provada: **sim**.
- Caller operacional criado: **não**.
- Live continua bloqueado: **sim**.
- FASE 4C iniciada: **não**.
