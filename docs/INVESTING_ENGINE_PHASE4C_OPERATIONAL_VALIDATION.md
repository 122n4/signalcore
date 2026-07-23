# Investing Engine — FASE 4C operational validation

## Decisão

`phase4_ready`

A fundação Investing 4A+4B permaneceu fail-closed após instalação from-zero, reapply pelo migration runner, reinício de processo, reconnect de pool, reinício PostgreSQL, crashes, concorrência, corrupção controlada, backup e restore. Não foi observada falha nova fora da baseline Trading Paper autorizada.

Esta decisão termina a validação operacional da FASE 4. Não autoriza integração de produto, promoção, Live, commit, push ou deploy.

## Origem e ambiente

- Base Git inicial: `b047d70982d123cb00fed85da23493b678a1a31e`.
- Branch: `feat/investing-phase4c`.
- Sistema: Windows 10 Pro `10.0.19045`.
- CPU: Intel Core i5-4210M, 2 cores/4 logical processors.
- RAM instalada: `8.498.819.072` bytes.
- Disco C: `239.465.066.496` bytes, `77.926.182.912` bytes livres durante a recolha.
- Node: `v24.13.0`.
- npm: `11.8.0`.
- PostgreSQL/psql: `17.10`.
- Cluster QA dedicado: `%TEMP%\signalcore-phase4c-pg-20260723-1815`, loopback `127.0.0.1:55439`.
- Todas as bases usadas foram criadas nesta execução com nomes `investing_phase4c_qa_*`. Nenhuma base preexistente foi eliminada ou alterada.
- O cluster e as bases descartáveis foram conservados em `%TEMP%` para inspeção; não são ambientes promovíveis.

## Ficheiros criados e alterados

Criados:

- `docs/INVESTING_ENGINE_PHASE4C_RUNBOOK.md`;
- `docs/INVESTING_ENGINE_PHASE4C_OPERATIONAL_VALIDATION.md`;
- `scripts/qa/investingEnginePhase4CIntegrityScanner.ts`;
- `scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts`;
- `tests/fixtures/investingEnginePhase4CReadCrashWorker.ts`;
- `tests/investingEnginePhase4CIntegrityScanner.test.ts`;
- `tests/investingEnginePhase4CIsolation.test.ts`;
- `tests/investingEnginePhase4CPostgres.integration.test.ts`.

Alterados apenas para admitir os dois consumidores QA 4C exatos, continuando a rejeitar qualquer outro caller:

- `tests/investingEnginePhase3FIsolation.test.ts`;
- `tests/investingEnginePhase4ASchemaIsolation.test.ts`;
- `tests/investingEnginePhase4BIsolation.test.ts`.

Não foi alterada qualquer migration, rollback, API, UI, configuração de produto, Trading funcional, broker, provider ou caminho Live.

## Provisionamento, gate e migrations

- Cluster local novo, porta explícita `55439`, autenticação local dedicada.
- Primeira base: 34 migrations aplicadas from-zero, exit `0`.
- Segunda instalação from-zero: 34 migrations, exit `0`.
- Fingerprints completos dessas duas instalações: `38152018a184236f40004e62e6722487f5d401354c5d8d05d4b97c0e4842843a`, iguais.
- Instalação pelo runner `supabase db push --include-all`: 34 versões, exit `0`.
- Reapply pelo mesmo runner: `Remote database is up to date`, 34 versões registadas, exit `0`.
- Fingerprint core da instalação manual e da instalação pelo runner: `cdbbabd7344c44bb3dede06a6209b1b88b80602137da01bcac50ac64c5072b24`, iguais quando limitado aos schemas `public`, `auth` e `extensions`.
- Gate R5 antes de dados sintéticos: `historical_set_empty`; contagens `0|0|0|0|0|0`; exit `0`.
- Nas seis tabelas: RLS `6/6`, FORCE RLS `6/6`.
- Gate: `service_role=true`, `anon=false`, `authenticated=false`.
- Live block: passou nas suites SQL e TypeScript.

Uma execução direta de todos os ficheiros SQL pela segunda vez falhou na migration 15 por policy já existente, exit `3`. Isso não é o contrato de reapply do migration runner e deixou claro que os ficheiros crus não devem ser usados como runner. A prova válida foi repetida com `supabase db push`, cuja segunda execução foi um no-op determinístico, exit `0`. A base usada nessa experiência negativa não foi promovida.

## Ciclo canónico, restart e reconnect

O harness PostgreSQL 4C realizou:

- persistência de runs sintéticos e 12 artefactos por run;
- load e verificação integral;
- replay com hashes e decisão iguais;
- retry exato com `idempotent_existing`;
- nova instância do adapter/pool;
- dois processos novos;
- dois workers após restart;
- owners e idempotency keys independentes;
- leitura cross-tenant recusada.

Resultado final: `tests/investingEnginePhase4CPostgres.integration.test.ts`, 6/6 testes, exit `0`.

Antes/depois de restart real do PostgreSQL:

- scanner: `clean`/`clean`;
- report hash: `bb88297b72f28539c1fac848df1a0aa191941780e269326f18eabc346a092684`, igual;
- hashes das seis tabelas: iguais;
- `pg_ctl stop`: exit `0`;
- `pg_ctl start`: exit `0`;
- servidor após restart: accepting connections.

## Backup e restore

Backup completo custom-format:

- `pg_dump -Fc`: exit `0`;
- `pg_restore --list`: exit `0`;
- tamanho: `2.121.844` bytes;
- SHA-256: `d7e6b03027263e532b4fe96dde13d8b8f6b053eb93502a93121567562e080e29`;
- duração: `768 ms`.

Restore seguro para base nova:

- comando: `pg_restore --exit-on-error --no-owner`;
- exit `0`;
- duração: `8.264 ms`;
- scanner: `clean`, zero issues;
- contagens, hashes das seis tabelas e report hash: iguais à origem;
- load/verify/replay: passaram;
- `investing_security_accounting.sql`: exit `0`;
- `investing_p0_p1.sql`: exit `0`;
- owner A viu zero rows dos owners B/C;
- concorrência pós-restore: exatamente um `inserted` e um `idempotent_existing`;
- scanner pós-concorrência: `clean`;
- `anon` e `authenticated`: sem EXECUTE no gate;
- Live: bloqueado.

O hash textual do dump de schema da origem e do restore não foi byte-idêntico. O diff ficou limitado a dois agrupamentos redundantes de parênteses em expressões `AND` das constraints `investing_engine_runs_idempotency_check` e `investing_engine_runs_snapshot_ids_check`. O inventário, dados, funções, políticas, comportamento das constraints e todas as suites de segurança ficaram iguais. Esta normalização produzida pelo próprio round-trip de `pg_dump`/`pg_restore` não representa mudança semântica.

### Casos negativos

- Arquivo plain-text usado como custom archive: exit `1`, recusado.
- Header com versão incompatível `57.57`: exit `1`, recusado.
- Output para destino inexistente, simulando falha de comando/espaço: exit `1`, sem backup aceite.
- Destino com um objeto preexistente: preflight exit `2`; restore não invocado.
- Restore interrompido precocemente: processo morto, zero objetos úteis, scanner exit `1` por schema ausente.
- Restore interrompido mais tarde: tabelas vazias já existiam e o scanner de dados devolveu `clean`; a promoção continuou bloqueada porque o restore não terminou e os gates independentes de schema/ACL não passaram.
- Restore com `--no-privileges`: a suite recusou `anon_execute:investing_ack_paper_order_v2(text,uuid,text)`, exit `3`. A base foi rejeitada. O restore foi repetido sem essa flag e todas as provas passaram.

Conclusão operacional: exit zero do restore, fingerprint/inventário de schema, ACL/RLS e scanner são gates independentes. Um scanner de dados limpo não valida sozinho um restore.

## Crash recovery, atomicidade e concorrência

Provas cobertas:

- antes da transação e em cada ponto pre-commit (`run`, `artifacts`, `summaries`, `reasons`, `shadow`, `claims`, contagens, constraints e before-commit): rollback integral nos testes 4B;
- depois do commit e antes da resposta: `recovered_after_ambiguous_commit`;
- durante load, verify e replay: processo de leitura morto; hashes e report hash inalterados, zero locks presos;
- estados Persistent Paper `submitting`, `submitted`, `partially_filled` e `reconciling`: processos mortos e recuperação determinística;
- dois workers: um efeito financeiro, um fill, uma reconciliation;
- retry da mesma operação: sem duplicação;
- operação fora de ordem: recusada;
- replay do mesmo fill: reconhecido, sem efeito financeiro duplicado;
- mesmo owner/mesma key, keys diferentes e owners diferentes;
- replay simultâneo e concorrência após restore;
- zero waiting locks.

Harness real Persistent Paper:

- exit `0`;
- `submitting` terminou `submission_failed`, zero fills e um recovery event;
- `submitted` terminou `reconciled`, um fill;
- `partially_filled` terminou `reconciled`, dois fills totais esperados;
- `reconciling` terminou `reconciled`, um fill e um recovery event;
- ledger: zero transações desequilibradas, mínimo de duas entries;
- Live worker: recusado pelo próprio harness.

## Integrity scanner

O scanner 4C:

- inicia `REPEATABLE READ READ ONLY`;
- lê as seis tabelas persistentes;
- produz contagens e SHA-256 determinísticos;
- valida inventário 12/4/1/13;
- deteta missing, unexpected, orphan, duplicação, versão, scope/owner/account/final hash, estado inseguro, hash root/content, falha de load/verify e divergência de replay;
- devolve apenas `clean` ou `blocked`;
- nunca corrige, converte, elimina ou reescreve;
- não está exportado pelo produto nem registado em `package.json`;
- exige URL local protegida, porta explícita, base disposable e confirmação exata;
- não é acessível ao browser.

Corrupções PostgreSQL controladas de content hash e orphan/missing artifact devolveram `blocked`. Depois de restaurar os valores originais, os fingerprints e o report hash voltaram exatamente ao baseline.

Testes puros do scanner/isolamento: 2 ficheiros, 8 testes, exit `0`.

## Capacidade observada

Carga final limitada:

- 24 runs adicionais;
- 3 owners;
- 12 artefactos por run;
- total final: 29 runs, 348 artefactos, 116 summaries, 493 evidence rows, 29 shadow packages e 377 claims;
- latência de persistência p50: `689,474 ms`;
- p95: `1.748,709 ms`;
- p99: `1.790,987 ms`;
- integrity scan completo: `6.625,795 ms`;
- base: `22.664.883` bytes;
- conexões observadas durante a medição: `2`;
- waiting locks: `0`;
- backup: `768 ms`;
- restore seguro: `8.264 ms`.

Timings read-only do cálculo de hashes por tabela:

- artifacts: `1.049,965 ms` — query mais lenta observada;
- runs: `60,916 ms`;
- reason evidence: `14,676 ms`;
- claims: `11,281 ms`;
- phase summaries: `7,177 ms`;
- shadow packages: `6,642 ms`.

Estes valores são observações neste hardware, não SLA nem capacidade máxima.

Limites provisórios conservadores para uma futura FASE 5:

- manter no máximo 2 workers até existir uma campanha de escala própria;
- limitar cada lote de validação a 24 novos runs e 3 owners, os valores efetivamente provados;
- executar scanner de promoção até 30 runs antes de elevar o limite;
- bloquear com qualquer waiting lock, issue do scanner ou divergência de hash;
- investigar p99 acima de `2 s`, scan acima de `10 s`, backup acima de `5 s` ou restore acima de `30 s`;
- não elevar limites sem repetir backup/restore, concorrência e scanner no hardware de staging real.

## Resultados e exit codes

| Prova | Resultado | Exit |
| --- | --- | ---: |
| Gate R5 empty-only | `historical_set_empty`, seis zeros | 0 |
| 34 migrations from-zero | 34 aplicadas | 0 |
| Reapply runner | up to date, 34 versões | 0 |
| Fingerprint entre instalações from-zero | igual | 0 |
| SQL 4A | passou na base vazia | 0 |
| SQL R1 | passou | 0 |
| SQL R2 | passou | 0 |
| SQL R3 | passou | 0 |
| SQL R4 | passou | 0 |
| SQL R5 | passou | 0 |
| PostgreSQL real 4B | 9/9 | 0 |
| PostgreSQL real 4C-R1 | 7/7 | 0 |
| Integrity scanner unit/isolation | 9/9 | 0 |
| Crash recovery Persistent Paper | passou | 0 |
| Backup/list/restore seguro | passou | 0 |
| RLS/accounting no restore | passou | 0 |
| P0/P1 e Live block no restore | passou | 0 |
| Regressão Investing | 51 ficheiros, 394 testes; 2 PG/16 testes skipped sem env | 0 |
| TypeScript | passou | 0 |
| ESLint completo | passou | 0 |
| `git diff --check` | passou | 0 |
| Suite global | 251 ficheiros/1113 testes passados; 17 ficheiros/38 testes skipped; somente baseline abaixo | 1 |

Baseline global preservada exatamente:

- `paperSignalExecutionContract`: 3 falhas;
- `paperRunnerConcurrency`: 1 falha;
- `paperRunnerHistory`: 2 falhas.

Nenhuma destas seis falhas foi alterada, corrigida ou ocultada. Não existe sétima falha.

## Falhas reproduzidas e resolvidas durante a validação

- O driver sem `PGUSER` tentou o utilizador Windows `Nuno`; a execução parou antes dos cenários. A configuração foi repetida com `PGUSER=postgres`, sem alterar o destino validado.
- O primeiro scanner comparava SHA-256 do JSON inteiro, mas os artefactos usam hashes de domínio selados. O scanner passou a delegar a coerência de conteúdo ao verifier existente e a comparar roots, sem duplicar o verificador canónico.
- Fixtures cross-tenant inicialmente reutilizavam artefactos semanticamente iguais e foram corretamente bloqueadas por R3; passaram a usar inputs sintéticos distintos por owner.
- Três testes de isolamento antigos classificaram os dois scripts QA como callers. As allowlists foram restringidas aos dois paths 4C exatos e a nova suite confirma ausência de exposição operacional.
- Restore sem ACLs foi recusado, como descrito acima; o runbook foi corrigido para preservar privilégios.

Nenhuma correção alterou lógica funcional de produção ou schema.

## Limitações e riscos residuais

- A medição foi local, num CPU 2-core antigo, não em staging cloud real.
- A campanha é deliberadamente limitada a 29 runs/3 owners; não prova escala superior.
- O hash textual de schema sofre normalização de parênteses no round-trip PostgreSQL; auditorias devem comparar também diff semântico, policies e suites, não apenas bytes do dump.
- O scanner de dados não substitui validação do exit do restore, schema ou ACLs.
- O scanner é O(n) em runs e executa load/verify/replay por run; a duração crescerá com o histórico.
- A baseline Trading Paper continua vermelha com seis falhas conhecidas e deve permanecer fora do âmbito Investing.

Nenhum destes limites cria caminho inseguro na FASE 4: todos estão documentados e os gates falham fechado.

## Critérios para reauditoria independente final da FASE 4

Uma auditoria independente deve:

1. confirmar HEAD base e diff integral;
2. confirmar que migrations/rollbacks 4A–R5 não mudaram;
3. provisionar outra base nova e obter R5 `historical_set_empty`;
4. aplicar 34 migrations e repetir o runner;
5. executar SQL 4A/R1/R2/R3/R4/R5;
6. executar PostgreSQL 4B e 4C;
7. repetir scanner clean, corrupção blocked e recuperação exata;
8. repetir restart PostgreSQL;
9. criar backup, preservar ACLs, restaurar numa base nova e comparar dados/schema;
10. repetir RLS, cross-tenant, anon/authenticated, service_role e Live block;
11. confirmar os casos negativos de restore;
12. confirmar ausência de imports 4C em `app`, `components`, `lib`, package scripts e workflows;
13. executar TypeScript, ESLint, `git diff --check` e suite global;
14. rejeitar qualquer falha além da distribuição Trading Paper `3+1+2`.

## Isolamento e controlo Git

- Nenhuma API, UI, cron, queue ou caller operacional foi criado.
- Nenhum broker ou provider foi ligado.
- Nenhuma execução automática foi iniciada.
- Live permanece bloqueado.
- Nenhuma migration ou rollback foi alterado.
- Nenhuma pasta `Data/` foi copiada.
- Nenhum ficheiro Trading funcional foi alterado.
- Não houve stage, commit, push, deploy, merge, rebase, reset ou clean.
- O índice permaneceu vazio.

Parar aqui e submeter este relatório a revisão. Qualquer staging ou commit requer nova autorização explícita.

## FASE 4C-R1 — scanner fail-closed

A reauditoria independente demonstrou que o contrato anterior aceitava
`new InvestingEnginePhase4CIntegrityScanner({ pool })`. Nesse caminho,
`reader` e `replay` não eram executados e a query projetava
`content_hash` como `computed_hash`, permitindo um falso `clean` após
adulteração isolada de `canonical_payload`.

A R1 corrige o contrato sem alterar schema:

- `reader` e `replay` são obrigatórios no tipo e validados em runtime;
- dependências ausentes terminam antes de qualquer relatório com os erros
  determinísticos `investing_phase4c_scanner_reader_required` ou
  `investing_phase4c_scanner_replay_required`;
- o snapshot read-only carrega `canonical_payload`;
- o hash é recalculado pelo verifier canónico já usado pelo reader;
- cada run regista `loadVerifyStatus` e `replayStatus`;
- `clean` exige load/verify concluído, `replay_match`, manifest presente e
  hashes finais presentes e iguais;
- `MANDATORY_CHECK_INCOMPLETE` impede que qualquer verificação obrigatória
  incompleta seja confundida com sucesso.

A reprodução PostgreSQL R1 preservou `content_hash` e roots, alterou apenas
o `asOf` do payload `canonical_input` e obteve
`ARTIFACT_CONTENT_HASH_MISMATCH`, `LOAD_VERIFY_FAILED`, `REPLAY_BLOCKED` e
`MANDATORY_CHECK_INCOMPLETE`. Duas execuções produziram os mesmos issues,
hashes de tabela e `reportHash`; o CLI terminou com exit `2`. Depois de
restaurado o payload sintético original, o relatório regressou exatamente ao
fingerprint anterior.

O scanner permanece read-only. `clean` continua sem provar que um
`pg_restore` terminou: exit do restore, schema, dados e scanner completo são
quatro gates cumulativos. A equivalência de schema combina fingerprint
normalizado, constraints válidas, tipos/nullability, índices, ACLs, RLS/FORCE
RLS e testes funcionais; o hash textual bruto não é prova isolada.
