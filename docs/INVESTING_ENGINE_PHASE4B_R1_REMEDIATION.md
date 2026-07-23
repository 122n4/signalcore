# Investing Engine — FASE 4B-R1 Integrity and Payload Security Remediation

Data: 2026-07-21. Âmbito: correção exclusiva dos bloqueadores da auditoria 4B. A FASE 4C permanece bloqueada.

## 1. Resumo executivo

A remediação substitui a validação permissiva de `authorization` por allowlist estrutural exata, expande o manifest para v2 com projeções materiais integrais, torna `verifyLoaded` fail-closed para metadata e refs de todas as rows, acrescenta corrupção/cross-tenant PostgreSQL real e protege o QA destrutivo. Não existe caller operacional, cutover, staging, produção ou Live.

## 2. Problemas corrigidos

Foram corrigidos os cinco bloqueadores: `authorization` dependente de denylist; metadata persistida não integralmente selada; ausência dos casos PostgreSQL exigidos; QA destrutivo sem guarda forte; e ausência de inventário que separe R1 do worktree preexistente.

## 3. Causa raiz da denylist

O payload safety original filtrava nomes reconhecidamente secretos, mas o campo de domínio `authorization` podia conter propriedades não declaradas. Uma denylist não prova o contrato. A R1 valida primeiro o shape inteiro e aceita apenas três propriedades tipadas; a denylist permanece como defesa complementar.

## 4. Novo schema allowlisted

O único shape válido é `{ expectedUserId: string não vazia, expectedAccountId: string não vazia, environment: "paper" }`. Arrays, objetos de autorização aninhados, propriedades extra, `live`, `real`, headers, cookies, credentials, tokens, API keys, passwords e secrets falham antes de IO. A travessia é recursiva em todos os payloads canónicos.

## 5. Estratégia de manifest integral

`investing-engine-persistence-manifest/v2` e `investing-engine-persistence/v2` contêm representações completas e canonicamente ordenadas de artifact metadata, summaries, reason evidence, claims e shadow metadata. Após load, o verifier reconstrói essas projeções das rows, remove apenas o `persistenceTxid` server-generated da projeção hashada, recalcula bytes/hash e compara com o manifest derivado dos payloads selados.

## 6. Campos selados

São selados diretamente: identidade root, VersionSet, snapshots, state/quality, request/final hashes, idempotência, todos os campos e refs dos 12 artefactos, summaries, reasons, 13 claims e shadow. `persistenceTxid` é reconstruído e comparado ao txid root em todos os filhos. IDs surrogate e `created_at` são não materiais: não influenciam semântica financeira, seleção, replay ou ownership e permanecem constraints/audit DB.

## 7. Verifier atualizado

O verifier compara payloads canónicos, hashes 3F, metadata completa, refs owner/account/run/final hash, counts, versões, estado, qualidade, confiança, source phase e tx boundary. Divergências usam códigos estáveis de summary, reason, claim, artifact, shadow, authorization e cross-tenant; qualquer erro antecede o runner puro.

## 8. Idempotência atualizada

Exact retry só retorna `idempotent_existing` depois de verified load e comparação do manifest v2. Testes alteram isoladamente summary, reason, claim, artifact e shadow antes do retry: todos rejeitam, nenhum segundo commit é contado. Retry após commit ambíguo e concorrência multiprocesso continuam válidos.

## 9. Migration e versionamento

Foi criada a migration incremental `20260721120000_investing_engine_v1_authorization_shape_guard.sql`, sem reescrever 4A e sem migrar dados financeiros. A função SQL recursiva e a CHECK constraint validada implementam a mesma allowlist estrutural defensiva. A migration é reaplicável; `service_role` recebe apenas o EXECUTE necessário à CHECK, enquanto browser roles não. Manifests v1 falham fechado; dados QA sintéticos devem ser recriados, nunca convertidos ou regravados silenciosamente.

## 10. Corrupções testadas

PostgreSQL real adulterou isoladamente: `warningCodes`, `blockingReasons`, os seis campos auxiliares de reason exigidos, scope/key de claim, state/quality/confidence/sourcePhase/schema/contract de artifact e shadow status. Para todos: load/verify falhou, replay devolveu `replay_blocked_by_integrity_error`, exact retry falhou e não houve repair/fallback.

## 11. Cross-tenant tests

Foram criados dois utilizadores, duas accounts e pares de runs inicialmente válidos. Foram testados artifact B em A, content hash, owner, account, run ref, summary, reason, claim, shadow e final hash existente de B. Todas as dez combinações falharam fechado. Sob role `authenticated`, tenant A obteve zero identificadores/rows de B nas seis tabelas RLS.

## 12. Proteção dos scripts QA

O teste destrutivo aborta no carregamento antes de qualquer corrupção se o host não for `localhost`, `127.0.0.1` ou `::1`, se o database não tiver marca explícita `qa/test/audit/temp/discardable`, ou se `ALLOW_DESTRUCTIVE_INVESTING_QA` não for exatamente `true`. Host e database são impressos antes da execução. O workflow cria e remove uma base local dedicada.

## 13. Ficheiros criados

- `scripts/qa/investingDestructiveQaGuard.ts`
- `tests/investingDestructiveQaGuard.test.ts`
- `supabase/migrations/20260721120000_investing_engine_v1_authorization_shape_guard.sql`
- `supabase/rollbacks/20260721120000_investing_engine_v1_authorization_shape_guard.down.sql`
- `supabase/tests/investing_engine_phase4b_r1.sql`
- `docs/INVESTING_ENGINE_PHASE4B_R1_REMEDIATION.md`

## 14. Ficheiros alterados

- `.github/workflows/investing-postgres.yml`
- `lib/investing/engine/v1/persistence/{canonical,contracts,errors,manifest,verifier}.ts`
- `lib/investing/engine/v1/persistence/postgres/{adapter,transaction}.ts`
- `tests/fixtures/{investingEnginePhase3FFixture,investingEnginePhase4BFixture}.ts`
- `tests/{investingEnginePhase4ASchemaIsolation,investingEnginePhase4BPersistence,investingEnginePhase4BIntegrityReplay,investingEnginePhase4BPostgres.integration}.test.ts`

## 15. Diff exclusivamente da remediação

O escopo focado é exatamente o inventário das secções 13–14. Mudanças funcionais: allowlist TS/SQL; manifest/schema v2; projeções row-scope integrais; verifier/adapter de metadata e txid; guarda QA; novos testes; workflow disposable; documentação. Limitação Git explícita: a 4B original e várias fases já estavam untracked antes de R1, logo `git diff` não consegue produzir hunks incrementais verdadeiros contra uma baseline inexistente. Não foi fabricado um diff nem alterado o index. Um checkpoint/commit seletivo só será criado com autorização do utilizador.

## 16. Testes

Executados: 25 ficheiros dirigidos 3A–3F/4A/4B/Persistent Paper; 4B PostgreSQL; seis scripts SQL; duas reconstruções de migrations; nove races Investing, seis cenários 4A, crash recovery; suite global; typecheck; ESLint global; `git diff --check`; scans de imports/runtime/callers.

## 17. Resultados

Dirigidos: 279/279. PostgreSQL 4B: 7/7. SQL P0/P1, security/accounting, rollback/recovery, reconciliation, 4A e 4B-R1: todos passaram. Concurrency/recovery: todos `ok:true`. Duas bases do zero produziram o mesmo fingerprint estrutural `7d88fd26fa25871327f5c5f1c9afb926027e511d3fb38b94cccc53f02df0b541`; a migration R1 reaplicou nas duas.

## 18. Regressões

Atomicidade, writer, repository port, recovery ambíguo, RLS/FORCE RLS, replay puro, contratos/hashes financeiros, Persistent Paper e gates SQL permaneceram verdes. A parametrização `userId` está apenas na fixture sintética 3F para construir tenants válidos; nenhuma implementação financeira 3A–3F foi modificada.

## 19. Suite global

Exit code real: `1`. Resultado: 251 ficheiros passados, 3 falhados, 16 skipped; 1066 testes passados, 6 falhados, 29 skipped. As seis falhas são exatamente a baseline Trading Paper: 1 em `paperRunnerConcurrency`, 2 em `paperRunnerHistory`, 3 em `paperSignalExecutionContract`. Nenhuma falha nova foi introduzida.

## 20. Limitações

Não existe baseline Git committed para separar automaticamente 4B original de R1. Não houve aplicação fora de PostgreSQL local descartável. Não há caller, API, UI, cron, queue, comparação legacy, backfill, staging, produção ou operação Live.

## 21. Riscos residuais

Risco processual: a auditoria deve usar o inventário focado enquanto o utilizador não autorizar checkpoint seletivo. Risco operacional deliberadamente não aceite: um caller futuro exigirá nova fase/autorização e desenho de boundary server-side. Não existe risco conhecido aberto nos cinco bloqueadores R1 após os testes executados.

## 22. Critérios de aceitação

Todos os critérios R1 foram satisfeitos: allowlist exata; metadata material selada/reconstruída; corrupção e cross-tenant bloqueados antes de replay; idempotência integral; QA local-only fail-closed; migrations determinísticas; atomicidade/RLS preservadas; nenhuma dependência operacional; Live bloqueado; zero alteração financeira 3A–3F; zero FASE 4C.

## 23. Prova de que a FASE 4C não começou

Os scans encontram zero caller operacional e zero import de 3A–3F/Trading/broker/legacy na implementação de persistence. O inventário R1 não contém ficheiro, API, scheduler, queue, UI ou integração 4C. A próxima ação autorizada é exclusivamente uma auditoria independente em modo leitura.

## Declarações finais obrigatórias

- Trading core modificado: **não**.
- Persistent Paper modificado: **não**.
- Fases 3A–3F modificadas: **não na implementação**; apenas fixture QA 3F parametrizada.
- Schema 4A modificado: **não**; foi adicionada migration incremental posterior com CHECK defensiva.
- Manifest version alterada: **sim, v2**.
- Authorization allowlist exata: **sim**.
- Metadata integralmente selada: **sim**.
- Corrupções anteriormente aceites agora bloqueadas: **sim**.
- Cross-tenant swap bloqueado: **sim**.
- Idempotência integral provada: **sim**.
- Atomicidade preservada: **sim**.
- RLS preservada: **sim**.
- Scripts destrutivos protegidos: **sim**.
- Caller operacional criado: **não**.
- Live continua bloqueado: **sim**.
- Suite global tem apenas as seis baseline: **sim**.
- FASE 4C iniciada: **não**.
