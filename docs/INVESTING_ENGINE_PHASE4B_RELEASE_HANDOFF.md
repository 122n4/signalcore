# Investing Engine — FASE 4B release handoff

## Estado e controlo de origem

- Estado aprovado: **FASE 4B aceite**, sem condições residuais.
- Âmbito: baseline e arquitetura Investing, Fases 3A–3F, Persistent Paper necessário ao Investing, Fases 4A e 4B e remediações R1–R5.
- Decisão independente R5: `accepted`.
- Branch de origem: `fix/canonical-paper-lifecycle`.
- HEAD de origem: `bcc72bc6aed514565b83f6b49b50aec98c316f46` (`fix: degrade investing ops when audit schema is missing`).
- Checkpoint completo: `0728878c6f4b2e2b44977ee390b84bef5fab0707`.
- Checkpoint curto: `0728878`.
- Commit corretivo de reprodutibilidade: `<PENDENTE>`.
- Commit base efetivo da FASE 4C: `<PENDENTE>`.
- A FASE 4C não foi iniciada.
- Este documento não autoriza staging, commit, push, merge, rebase, deploy ou qualquer operação Live.

## Nota de reprodutibilidade do checkpoint

Uma validação do checkpoint aceite num worktree limpo revelou uma dependência não hermética do teste `tradingMarketDataBackfill` em `Data/historical` local e untracked, além de cinco diagnósticos ESLint em código já coberto pelo checkpoint. A correção de reprodutibilidade isola os dados do teste com fixtures temporários e aplica apenas os ajustes ESLint diagnosticados, sem alterar a lógica funcional do backfill. Estes problemas de validação não invalidam a decisão independente `accepted` da FASE 4B.

## Invariantes aprovadas

- O gate R5 é `STABLE`, read-only e executável apenas por `service_role`.
- `anon` e `authenticated` não possuem `EXECUTE`.
- As seis tabelas persistentes relevantes são contabilizadas: `investing_engine_runs`, `investing_engine_artifacts`, `investing_engine_phase_summaries`, `investing_engine_reason_evidence`, `investing_engine_shadow_packages` e `investing_engine_idempotency_keys`.
- Apenas zero rows nas seis tabelas devolve `historical_set_empty`.
- Qualquer run, artefacto, summary, evidence, shadow package ou claim devolve `historical_set_blocked`; artefactos órfãos também bloqueiam.
- `historical_set_canonical` é inalcançável e não existe branch permissiva alternativa.
- O gate não valida para aceitação, converte, repara, atualiza, apaga ou reescreve histórico.
- Replay, persistência, atomicidade, idempotência, concorrência, crash recovery, RLS e Live block permaneceram aprovados.
- Não existem callers operacionais, API/UI/cron/queue que ativem o engine, nem caminho Live.

## Política de transição e requisito antes da FASE 4C

A transição é temporariamente **empty-only**. Antes de qualquer trabalho da FASE 4C deve ser provisionada, por scripts administrativos protegidos, uma base Investing nova e integralmente vazia. Não se deve apagar, converter nem reutilizar silenciosamente uma base preexistente. A existência de qualquer row relevante deve parar a transição com `historical_set_blocked`.

## Migrations e rollbacks incluídos

- Cadeia validada: 34 migrations a partir de zero, incluindo 20 migrations Investing neste checkpoint.
- R1: `20260721120000_investing_engine_v1_authorization_shape_guard.sql`.
- R2: `20260721180000_investing_engine_phase4b_r2_root_sealing.sql`.
- R3: `20260721220000_investing_engine_phase4b_r3_boundary_hardening.sql`.
- R4: `20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql`.
- R5: `20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.sql`.
- Os seis rollbacks explícitos desde 4A até R5 pertencem ao checkpoint.
- O rollback R5 falha fechado com SQLSTATE `55000`; não restaura o gate permissivo R4 e não altera schema, dados, hashes ou decisão.

## Verificação final executada

Os resultados abaixo foram obtidos neste workspace durante a preparação. A QA PostgreSQL usou uma base sintética nova, `signalcore_investing_checkpoint_qa_260722`, criada apenas depois de confirmar que o nome não existia. No fim, o nome exato foi novamente verificado, a base sintética foi removida com `DROP DATABASE ... WITH (FORCE)` e uma consulta posterior confirmou contagem zero; a remoção não é recuperável sem backup, mas a base pode ser recriada pelos scripts QA. Nenhuma base preexistente foi apagada ou alterada.

| Verificação | Resultado observado | Exit code |
| --- | --- | ---: |
| 34 migrations from zero | aplicação completa | 0 |
| SQL 4A | passou | 0 |
| SQL 4B-R1 | passou | 0 |
| SQL 4B-R2 | passou | 0 |
| SQL 4B-R3 | passou | 0 |
| SQL 4B-R4 | passou | 0 |
| SQL 4B-R5 | passou | 0 |
| R5 TypeScript específico | 1 ficheiro, 3 testes passados | 0 |
| PostgreSQL real 4B | 5 ficheiros, 35 testes passados | 0 |
| Investing 3A–4B + Persistent Paper + RLS + Live | 25 ficheiros, 270 testes passados | 0 |
| TypeScript (`tsc --noEmit --incremental false`) | passou | 0 |
| ESLint (`npm run lint`) | passou | 0 |
| `git diff --check` | passou; apenas avisos de conversão CRLF | 0 |
| Suite global (`npm test`) | 252 ficheiros passados, 16 skipped, 3 falhados; 1107 testes passados, 31 skipped, 6 falhados | 1 |

A suite global conserva exclusivamente a baseline Trading Paper conhecida:

- `paperSignalExecutionContract`: 3 falhas;
- `paperRunnerConcurrency`: 1 falha;
- `paperRunnerHistory`: 2 falhas.

Não foi observada falha nova. O exit code global `1` é explicado exatamente pelas seis falhas acima; estas alterações Trading não devem ser corrigidas nem incluídas neste checkpoint.

## Baseline Git antes do handoff

- Branch: `fix/canonical-paper-lifecycle`.
- HEAD: `bcc72bc6aed514565b83f6b49b50aec98c316f46`.
- `git diff --stat`: 38 ficheiros tracked, 1523 inserções e 817 remoções.
- `git diff --name-status`: 38 ficheiros modified.
- `git diff --cached`: vazio.
- Índice: vazio, zero paths staged.
- Untracked: 253 497 paths antes deste handoff; 253 300 sob `Data/` e 197 fora de `Data/`.
- Ignorados: 110 267 paths, dominados por `.next*`, `node_modules`, `artifacts`, caches, logs, perfis e ficheiros de ambiente.
- O worktree já estava extensamente dirty; não se assume que todas as alterações pertencem ao Investing.

## Legenda do inventário

- **A** — pertence integralmente ao checkpoint Investing e pode ser staged como ficheiro completo depois de revisão/autorização.
- **B** — contém hunks Investing misturados com alterações preexistentes; exige `git add -p` e revisão humana.
- **C** — não pertence ao checkpoint; deve permanecer excluído.
- **D** — incerto e exige decisão humana. Não restou qualquer ficheiro D após a inspeção.

Para listas agrupadas, os campos estado, fase, resumo, motivo e risco declarados no cabeçalho aplicam-se individualmente a cada path listado.

## A — tracked, stage integral permitido após autorização

Risco comum: staging acidental baixo quando cada path é indicado explicitamente; continua proibido usar `git add .`, `git add -A` ou stage de diretórios inteiros.

| Path | Fase | Resumo e motivo de inclusão | Risco específico |
| --- | --- | --- | --- |
| `app/api/broker/reconcile/route.ts` | 3A / Persistent Paper | containment e reconciliação Investing | baixo |
| `app/api/broker/sync/route.ts` | 3A / Persistent Paper | boundary e sync seguro Investing | baixo |
| `app/api/fix-now/run/route.ts` | 3A | bloqueio de escrita legacy Investing | baixo |
| `app/api/ops/investing/approvals/route.ts` | Persistent Paper | approvals operacionais Investing | baixo |
| `app/api/ops/investing/route.ts` | Persistent Paper | read model operacional Investing | baixo |
| `app/api/portfolio-items/reset/route.ts` | 3A | containment de mutation legacy | baixo |
| `app/api/portfolio-items/route.ts` | 3A | boundary de portfolio Investing | baixo |
| `app/app/tabs/DailyTab.tsx` | 3A / Persistent Paper | UI read-only e retirada do fluxo legacy | médio: ficheiro grande, mas diff integralmente Investing |
| `app/app/tabs/dailyDecisionViewModel.ts` | 3A | view model Investing | baixo |
| `app/ops/investing/page.tsx` | Persistent Paper | página operacional Investing | baixo |
| `components/investing/InvestingOperatingLoopRail.tsx` | 3A | operating-loop boundary | baixo |
| `lib/broker/index.ts` | 3A | export do boundary Investing | baixo |
| `lib/broker/sync.ts` | 3A | isolamento do sync Investing | baixo |
| `lib/engine/loop.ts` | 3A | isolamento do loop Investing | baixo |
| `lib/investing/governance.ts` | baseline / Persistent Paper | governance Investing | baixo |
| `lib/investing/index.ts` | 3A–4B | exports canónicos Investing | baixo |
| `lib/investing/opsAudit.ts` | Persistent Paper | audit operacional | baixo |
| `lib/investing/reconciliation.ts` | Persistent Paper | reconciliação Investing | baixo |
| `lib/investing/runtimeAdapter.ts` | 3A | retirada do adapter runtime legacy | baixo |
| `package-lock.json` | 4B QA | lock das dependências PostgreSQL (`pg`, `@types/pg`) | médio: rever em conjunto com os hunks permitidos de `package.json` |
| `tests/investingApprovalsRoute.test.ts` | Persistent Paper | regressão de approvals | baixo |
| `tests/investingDailySnapshotPersistence.test.ts` | 3A / Persistent Paper | regressão de persistência/retirement | baixo |
| `tests/investingGovernancePolicy.test.ts` | baseline | policy regression Investing | baixo |
| `tests/investingOpsRoute.test.ts` | Persistent Paper | regressão do read model ops | baixo |

## A — untracked, stage integral permitido após autorização

### Workflow

Estado: untracked. Fase: 4A/4B QA. Resumo: PostgreSQL real em CI. Motivo: prova operacional da persistência. Risco: baixo se o path for explícito.

- `.github/workflows/investing-postgres.yml`

### APIs e componente Investing

Estado: untracked. Fase: Persistent Paper / 3A. Resumo: APIs paper/read-only e controlos de approval. Motivo: superfície necessária ao Investing sem caller automático. Risco: médio; staging por diretório incluiria UI ou rotas alheias, por isso usar apenas os paths explícitos.

- `app/api/investing/daily-cycle/route.ts`
- `app/api/investing/dashboard/route.ts`
- `app/api/investing/paper/accounts/[accountId]/movements/route.ts`
- `app/api/investing/paper/accounts/route.ts`
- `app/api/investing/paper/orders/[orderId]/route.ts`
- `app/api/investing/paper/orders/route.ts`
- `app/api/investing/paper/worker/route.ts`
- `components/investing/InvestingApprovalControls.tsx`

### Documentação técnica

Estado: untracked. Fase: indicada pelo nome de cada documento, cobrindo baseline, 3A–3F, 4A, 4B e R1–R5. Resumo: arquitetura, planos, auditorias e validações técnicas. Motivo: trilho auditável do checkpoint. Risco: baixo por path explícito; não incluir relatórios alheios existentes em `docs/`.

- `docs/INVESTING_CANONICAL_SOURCE_MATRIX.md`
- `docs/INVESTING_ENGINE_PHASE_PLAN.md`
- `docs/INVESTING_ENGINE_PHASE1_BASELINE_MAP_2026-07-20.md`
- `docs/INVESTING_ENGINE_PHASE3A_BOUNDARY_SAFETY.md`
- `docs/INVESTING_ENGINE_PHASE3B_CONTRACTS_DETERMINISM.md`
- `docs/INVESTING_ENGINE_PHASE3C_CANONICAL_INPUT_PORTFOLIO_STATE.md`
- `docs/INVESTING_ENGINE_PHASE3D_RISK_POLICY_CONSTRAINTS.md`
- `docs/INVESTING_ENGINE_PHASE3E_CONSTRUCTION_REBALANCE.md`
- `docs/INVESTING_ENGINE_PHASE3F_END_TO_END_FINAL_DECISION.md`
- `docs/INVESTING_ENGINE_PHASE4A_PERSISTENCE_SCHEMA.md`
- `docs/INVESTING_ENGINE_PHASE4B_PERSISTENCE_REPLAY.md`
- `docs/INVESTING_ENGINE_PHASE4B_R1_REMEDIATION.md`
- `docs/INVESTING_ENGINE_PHASE4B_R2_REMEDIATION.md`
- `docs/INVESTING_ENGINE_PHASE4B_R4_FINAL_CONDITIONS_CLOSURE.md`
- `docs/INVESTING_ENGINE_PHASE4B_R5_EMPTY_STATE_TRANSITION_GATE.md`
- `docs/INVESTING_ENGINE_TARGET_ARCHITECTURE.md`
- `docs/INVESTING_LEGACY_MIGRATION_PLAN.md`
- `docs/INVESTING_POSTGRES_OPERATIONAL_VALIDATION_2026-07-19.md`
- `docs/INVESTING_PRE_CHANGE_AUDIT_2026-07-19.md`
- `docs/INVESTING_STAGING_WORKER_VALIDATION_2026-07-20.md`
- `docs/INVESTING_ENGINE_PHASE4B_RELEASE_HANDOFF.md`

### Broker boundary, execução, accounting, repository, server e UI

Estado: untracked. Fase: arquitetura baseline, 3A e Persistent Paper. Resumo: ports/adapters, ledger, controls, state machine, configuração, serviços e view models. Motivo: implementação de base necessária às fases concluídas. Risco: baixo com paths explícitos; `lib/broker` é partilhado, portanto não stagear o diretório inteiro.

- `lib/broker/investingBoundary.ts`
- `lib/investing/accounting/ledger.ts`
- `lib/investing/broker/disabled-live-adapter.ts`
- `lib/investing/broker/paper-adapter.ts`
- `lib/investing/broker/symbols.ts`
- `lib/investing/broker/types.ts`
- `lib/investing/execution/controls.ts`
- `lib/investing/execution/stateMachine.ts`
- `lib/investing/historical-market-data/reader.ts`
- `lib/investing/money/decimal.ts`
- `lib/investing/reconciliation/types.ts`
- `lib/investing/repository/admin.ts`
- `lib/investing/repository/owner.ts`
- `lib/investing/server/cashAndCorporateActions.ts`
- `lib/investing/server/config.ts`
- `lib/investing/server/dailyCycle.ts`
- `lib/investing/server/dashboard.ts`
- `lib/investing/server/persistentPaper.ts`
- `lib/investing/ui/decisionImpact.ts`
- `lib/investing/ui/directives.ts`
- `lib/investing/ui/operatingLoop.ts`

### Engine v1 — contratos e orquestração

Estado: untracked. Fase: 3B. Resumo: contratos canónicos, catálogo, ports, validação e orquestração determinística. Motivo: núcleo aprovado da 3B. Risco: baixo com paths explícitos.

- `lib/investing/engine/v1/canonical.ts`
- `lib/investing/engine/v1/catalog.ts`
- `lib/investing/engine/v1/contracts.ts`
- `lib/investing/engine/v1/index.ts`
- `lib/investing/engine/v1/orchestrator.ts`
- `lib/investing/engine/v1/ports.ts`
- `lib/investing/engine/v1/validation.ts`

### Engine v1 — Fase 3C

Estado: untracked. Fase: 3C. Resumo: canonical input, portfolio state, authoring, semântica e repositório. Motivo: implementação integral aprovada da 3C. Risco: baixo.

- `lib/investing/engine/v1/phase3c/authoring.ts`
- `lib/investing/engine/v1/phase3c/canonicalInputBuilder.ts`
- `lib/investing/engine/v1/phase3c/decimalMath.ts`
- `lib/investing/engine/v1/phase3c/index.ts`
- `lib/investing/engine/v1/phase3c/orderSemantics.ts`
- `lib/investing/engine/v1/phase3c/portfolioState.ts`
- `lib/investing/engine/v1/phase3c/repository.ts`
- `lib/investing/engine/v1/phase3c/types.ts`

### Engine v1 — Fase 3D

Estado: untracked. Fase: 3D. Resumo: constraint/risk/policy engine e matemática decimal. Motivo: implementação integral aprovada da 3D. Risco: baixo.

- `lib/investing/engine/v1/phase3d/constraintEngine.ts`
- `lib/investing/engine/v1/phase3d/decimalMath.ts`
- `lib/investing/engine/v1/phase3d/engine.ts`
- `lib/investing/engine/v1/phase3d/index.ts`
- `lib/investing/engine/v1/phase3d/policyEngine.ts`
- `lib/investing/engine/v1/phase3d/riskAssessment.ts`
- `lib/investing/engine/v1/phase3d/types.ts`

### Engine v1 — Fase 3E

Estado: untracked. Fase: 3E. Resumo: construction/rebalance engine, modelos, primitivas e validação. Motivo: implementação integral aprovada da 3E. Risco: baixo.

- `lib/investing/engine/v1/phase3e/constructionEngine.ts`
- `lib/investing/engine/v1/phase3e/engine.ts`
- `lib/investing/engine/v1/phase3e/index.ts`
- `lib/investing/engine/v1/phase3e/models.ts`
- `lib/investing/engine/v1/phase3e/primitives.ts`
- `lib/investing/engine/v1/phase3e/types.ts`
- `lib/investing/engine/v1/phase3e/validation.ts`

### Engine v1 — Fase 3F

Estado: untracked. Fase: 3F. Resumo: decisão end-to-end, hashing, explicação, audit bundle e shadow package. Motivo: implementação integral aprovada da 3F. Risco: baixo.

- `lib/investing/engine/v1/phase3f/auditBundle.ts`
- `lib/investing/engine/v1/phase3f/engine.ts`
- `lib/investing/engine/v1/phase3f/explanation.ts`
- `lib/investing/engine/v1/phase3f/hashing.ts`
- `lib/investing/engine/v1/phase3f/index.ts`
- `lib/investing/engine/v1/phase3f/orchestration.ts`
- `lib/investing/engine/v1/phase3f/primitives.ts`
- `lib/investing/engine/v1/phase3f/shadowPackage.ts`
- `lib/investing/engine/v1/phase3f/types.ts`
- `lib/investing/engine/v1/phase3f/validation.ts`

### Persistência e replay

Estado: untracked. Fase: 4A/4B. Resumo: contratos, canonicalização, manifest, repository port, reader/writer, replay, verifier e adapter PostgreSQL transacional. Motivo: implementação integral da persistência aprovada. Risco: baixo com paths explícitos.

- `lib/investing/engine/v1/persistence/canonical.ts`
- `lib/investing/engine/v1/persistence/contracts.ts`
- `lib/investing/engine/v1/persistence/errors.ts`
- `lib/investing/engine/v1/persistence/index.ts`
- `lib/investing/engine/v1/persistence/manifest.ts`
- `lib/investing/engine/v1/persistence/postgres/adapter.ts`
- `lib/investing/engine/v1/persistence/postgres/index.ts`
- `lib/investing/engine/v1/persistence/postgres/queries.ts`
- `lib/investing/engine/v1/persistence/postgres/transaction.ts`
- `lib/investing/engine/v1/persistence/reader.ts`
- `lib/investing/engine/v1/persistence/replay.ts`
- `lib/investing/engine/v1/persistence/repositoryPort.ts`
- `lib/investing/engine/v1/persistence/service.ts`
- `lib/investing/engine/v1/persistence/verifier.ts`
- `lib/investing/engine/v1/persistence/writer.ts`

### Scripts Investing/QA

Estado: untracked. Fase: Persistent Paper, 4A e 4B. Resumo: worker e provas destrutivas protegidas, concorrência e crash recovery. Motivo: ferramentas administrativas/testes necessários. Risco: médio; `scripts/` contém campanhas Trading excluídas, portanto nunca stagear o diretório inteiro.

- `scripts/investing/runPersistentPaperWorker.mjs`
- `scripts/qa/investingDestructiveQaGuard.ts`
- `scripts/qa/runInvestingEnginePhase4AConcurrency.mjs`
- `scripts/qa/runInvestingPostgresConcurrency.mjs`
- `scripts/qa/runInvestingWorkerCrashRecovery.mjs`

### Migrations

Estado: untracked. Fase: arquitetura/Persistent Paper/4A/4B/R1–R5, conforme o nome. Resumo: cadeia incremental Investing. Motivo: schema e proteções aprovadas. Risco: médio; `supabase/migrations/` pode conter migrations alheias, portanto usar apenas estes paths.

- `supabase/migrations/20260719120000_investing_financial_architecture.sql`
- `supabase/migrations/20260719170000_investing_phase0_containment.sql`
- `supabase/migrations/20260719180000_investing_persistent_paper.sql`
- `supabase/migrations/20260719190000_investing_paper_funding.sql`
- `supabase/migrations/20260719200000_investing_rls_read_model.sql`
- `supabase/migrations/20260719210000_investing_append_only_reconciliation_fix.sql`
- `supabase/migrations/20260719220000_investing_cash_and_corporate_actions.sql`
- `supabase/migrations/20260719230000_investing_corporate_action_reconciliation.sql`
- `supabase/migrations/20260719240000_investing_recovery_consistency.sql`
- `supabase/migrations/20260719250000_investing_submit_idempotent_replay.sql`
- `supabase/migrations/20260719260000_investing_reconciliation_resolutions.sql`
- `supabase/migrations/20260719270000_investing_resolution_severity_vocabulary.sql`
- `supabase/migrations/20260719280000_investing_fill_semantic_idempotency.sql`
- `supabase/migrations/20260719290000_investing_pgcrypto_schema_qualification.sql`
- `supabase/migrations/20260720100000_investing_engine_v1_persistence.sql`
- `supabase/migrations/20260721120000_investing_engine_v1_authorization_shape_guard.sql`
- `supabase/migrations/20260721180000_investing_engine_phase4b_r2_root_sealing.sql`
- `supabase/migrations/20260721220000_investing_engine_phase4b_r3_boundary_hardening.sql`
- `supabase/migrations/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql`
- `supabase/migrations/20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.sql`

### Rollbacks

Estado: untracked. Fase: 4A e 4B R1–R5. Resumo: rollback/recovery explícitos; R5 é deliberadamente não reversível e falha fechado. Motivo: contrato operacional auditado. Risco: baixo com paths explícitos.

- `supabase/rollbacks/20260720100000_investing_engine_v1_persistence.down.sql`
- `supabase/rollbacks/20260721120000_investing_engine_v1_authorization_shape_guard.down.sql`
- `supabase/rollbacks/20260721180000_investing_engine_phase4b_r2_root_sealing.down.sql`
- `supabase/rollbacks/20260721220000_investing_engine_phase4b_r3_boundary_hardening.down.sql`
- `supabase/rollbacks/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.down.sql`
- `supabase/rollbacks/20260722090000_investing_engine_phase4b_r5_empty_state_transition_gate.down.sql`

### Testes SQL

Estado: untracked. Fase: arquitetura/Persistent Paper/4A/4B/R1–R5. Resumo: bootstrap, segurança, accounting, reconciliação, rollback e gates. Motivo: prova SQL do checkpoint. Risco: baixo com paths explícitos.

- `supabase/tests/bootstrap_standalone_postgres.sql`
- `supabase/tests/investing_engine_phase4a.sql`
- `supabase/tests/investing_engine_phase4b_r1.sql`
- `supabase/tests/investing_engine_phase4b_r2.sql`
- `supabase/tests/investing_engine_phase4b_r3.sql`
- `supabase/tests/investing_engine_phase4b_r4.sql`
- `supabase/tests/investing_engine_phase4b_r5.sql`
- `supabase/tests/investing_p0_p1.sql`
- `supabase/tests/investing_reconciliation_breaks.sql`
- `supabase/tests/investing_rollback_recovery.sql`
- `supabase/tests/investing_security_accounting.sql`

### Fixtures e testes TypeScript

Estado: untracked. Fase: baseline, 3A–3F, Persistent Paper, 4A e 4B/R5, conforme o nome. Resumo: isolamento, determinismo, persistência, replay, PostgreSQL real, Live block e QA guard. Motivo: regressão aprovada do checkpoint. Risco: médio; `tests/` contém testes Trading excluídos, portanto usar apenas estes paths.

- `tests/fixtures/investingEnginePhase3FFixture.ts`
- `tests/fixtures/investingEnginePhase4BFixture.ts`
- `tests/fixtures/investingEnginePhase4BProcessWorker.ts`
- `tests/investingArchitectureIsolation.test.ts`
- `tests/investingCashActionsRoute.test.ts`
- `tests/investingDailyCycleRoute.test.ts`
- `tests/investingDestructiveQaGuard.test.ts`
- `tests/investingEnginePhase3ABrokerRoutes.test.ts`
- `tests/investingEnginePhase3ALegacyWrites.test.ts`
- `tests/investingEnginePhase3ALoop.test.ts`
- `tests/investingEnginePhase3ASyncGuard.test.ts`
- `tests/investingEnginePhase3BContracts.test.ts`
- `tests/investingEnginePhase3BPortsIsolation.test.ts`
- `tests/investingEnginePhase3CCanonicalInput.test.ts`
- `tests/investingEnginePhase3CIsolation.test.ts`
- `tests/investingEnginePhase3DIsolation.test.ts`
- `tests/investingEnginePhase3DRiskPolicy.test.ts`
- `tests/investingEnginePhase3EConstruction.test.ts`
- `tests/investingEnginePhase3EIsolation.test.ts`
- `tests/investingEnginePhase3FDeterminism.test.ts`
- `tests/investingEnginePhase3FEndToEnd.test.ts`
- `tests/investingEnginePhase3FIntegrity.test.ts`
- `tests/investingEnginePhase3FIsolation.test.ts`
- `tests/investingEnginePhase4ASchemaIsolation.test.ts`
- `tests/investingEnginePhase4BIntegrityReplay.test.ts`
- `tests/investingEnginePhase4BIsolation.test.ts`
- `tests/investingEnginePhase4BPersistence.test.ts`
- `tests/investingEnginePhase4BPostgres.integration.test.ts`
- `tests/investingEnginePhase4BR5Gate.test.ts`
- `tests/investingFinancialArchitecture.test.ts`
- `tests/investingMigrationArchitecture.test.ts`
- `tests/investingPersistentPaper.test.ts`
- `tests/investingWorkerLiveBlock.test.ts`

## B — ficheiros misturados; staging interativo obrigatório

### `package.json`

- Estado: tracked modified.
- Fases: 4B QA/Persistent Paper misturadas com Trading/Twelve Data preexistente.
- Incluir hunks `@@ -16,0 +17,2 @@` (`investing:worker` e `qa:investing:worker-crash`), `@@ -80,0 +92 @@` (`@types/pg`) e `@@ -85,0 +98 @@` (`pg`).
- Excluir hunk `@@ -41,0 +44,9 @@`, que adiciona scripts Trading/Twelve Data.
- Motivo: os scripts/dependências Investing são necessários; a campanha Trading não pertence ao checkpoint.
- Risco de staging acidental: alto. Executar `git add -p -- package.json`, dividir com `s` ou editar com `e` se Git agrupar hunks, e rever o cached diff.

### `app/api/daily-snapshot/route.ts`

- Estado: tracked modified.
- Fases: 3A/Persistent Paper misturadas com refactors genéricos preexistentes.
- Hunks Investing: remoção dos imports `buildInvesting*`/`resolveInvestingEngine`; branch que devolve HTTP 410 para `mode=investing`; remoção das escritas Investing legacy; remoção dos campos Investing do journal.
- Hunks genéricos a não incluir automaticamente: helpers de data/número, formatação do upsert non-Investing, remoção de generic error-event e tratamento genérico de erros.
- Headers observados, todos exigindo inspeção contextual: `@@ -2 +1,0 @@`, `@@ -4,9 +3,2 @@`, `@@ -14,0 +7 @@`, `@@ -19,5 +12,2 @@`, `@@ -26,7 +16,3 @@`, `@@ -41 +26,0 @@`, `@@ -42,0 +28,7 @@`, `@@ -44,5 +36 @@`, `@@ -52 +40 @@`, `@@ -56,2 +43,0 @@`, `@@ -59,2 +44,0 @@`, `@@ -62,8 +46,10 @@`, `@@ -71 +56,0 @@`, `@@ -73,6 +58,3 @@`, `@@ -81 +63 @@`, `@@ -86,5 +68 @@`, `@@ -93,0 +72,2 @@`, `@@ -95,92 +74,0 @@`, `@@ -192,37 +80 @@`, `@@ -231 +82,0 @@`, `@@ -239,7 +90 @@` e `@@ -247,20 +92,3 @@`.
- Motivo: o retirement Investing pertence ao checkpoint, mas o ficheiro completo não é seletivamente seguro.
- Risco de staging acidental: alto. Executar `git add -p -- app/api/daily-snapshot/route.ts`; serão necessários `s`/`e` e revisão humana do patch cached.

## C — explicitamente excluídos

### Tracked modified

Estado: tracked modified. Fase: fora do âmbito. Resumo/motivo: Trading/Twelve Data, UI genérica ou infraestrutura não necessária ao Investing. Risco: alto se forem usados comandos globais ou stage de diretórios.

- `.gitignore` — apenas paths do arquivo Twelve Data.
- `.vercelignore` — ignores genéricos/relatórios não necessários ao checkpoint.
- `app/ops/lab/page.tsx` — UI do arquivo Twelve Data.
- `app/ops/page.tsx` — refactor genérico de links.
- `app/ops/trades/page.tsx` — refactor genérico de links.
- `lib/ops/researchLabOverview.ts` — research lab Trading.
- `lib/trading/backtest/twelveDataHistorical.ts` — provider/backtest Trading.
- `lib/trading/research/fs.ts` — infraestrutura research Trading.
- `lib/trading/research/index.ts` — exports research Trading.
- `lib/trading/research/localArchiveInventory.ts` — arquivo Trading.
- `lib/trading/research/runner.ts` — runner Trading.
- `tests/researchLabOverview.test.ts` — teste research Trading.

### Untracked

Estado: untracked. Fase: fora do âmbito. Resumo/motivo: campanha/arquivo Twelve Data. Risco: alto se `lib/`, `scripts/` ou `tests/` forem staged por inteiro.

- `lib/trading/research/twelveDataFullArchive.ts`
- `lib/trading/research/twelveDataUniverseArchive.ts`
- `lib/trading/research/twelveDataUniverseArchiveLoop.ts`
- `lib/trading/research/twelveDataUniverseCatalog.ts`
- `lib/trading/research/twelveDataUniverseLayeredArchive.ts`
- `scripts/trading/runTwelveDataFullArchive.ts`
- `scripts/trading/runTwelveDataUniverseArchive.ts`
- `scripts/trading/runTwelveDataUniverseArchiveLoop.ts`
- `scripts/trading/runTwelveDataUniverseCatalog.ts`
- `scripts/trading/runTwelveDataUniverseLayeredArchive.ts`
- `scripts/trading/runTwelveDataUniverseManualCampaign.ts`
- `scripts/trading/startTwelveDataEndpointTimeframeChain.ps1`
- `scripts/trading/startTwelveDataUniverseArchiveBatchLoop.ps1`
- `scripts/trading/startTwelveDataUniverseLayeredArchive.ps1`
- `scripts/trading/startTwelveDataUniverseManualCampaign.ps1`
- `tests/tradingTwelveDataFullArchive.test.ts`
- `tests/tradingTwelveDataHistorical.test.ts`
- `tests/tradingTwelveDataUniverseArchive.test.ts`

### Dados, segredos, build e artefactos

Estado: untracked ou ignored. Fase: fora do âmbito. Resumo/motivo: 253 300 paths untracked sob `Data/`; ficheiros de ambiente/credenciais (`.env.local`, `.env.production.sync`, `.env.vercel*`); build/cache (`.next*`, `node_modules`, `tsconfig.tsbuildinfo`, `.cache`, `.vercel`); outputs QA/browser/logs (`.codex-*`, `.qa-*`, `qa_*`, logs e imagens); artefactos gerados. Risco: crítico com comandos globais. Nunca incluir no checkpoint.

## D — decisão humana

Nenhum ficheiro permaneceu na categoria D após a inspeção. As duas fronteiras que exigem julgamento estão classificadas como B e não podem ser staged integralmente.

## Resumo seletivo previsto

- A integral: 204 ficheiros depois da criação deste handoff — 24 tracked e 180 untracked.
- B interativo: 2 ficheiros.
- C explícito: 30 ficheiros de código/configuração identificados — 12 tracked e 18 untracked — além de `Data/`, segredos, caches, builds, logs e artefactos.
- D: 0.
- Checkpoint máximo após seleção correta: 206 paths, sendo dois apenas com hunks Investing.
- O diff final do checkpoint deverá conter exclusivamente arquitetura/boundaries 3A, contratos e engine 3B–3F, Persistent Paper necessário, persistência/replay 4A–4B, R1–R5, migrations/rollbacks, testes/QA/workflow e documentação técnica.

## Plano de staging proposto — não executado

Ordem recomendada depois de autorização explícita:

1. Confirmar novamente branch, HEAD e índice vazio.
2. Stagear cada path da categoria A por nome explícito, em lotes revistos; nunca stagear um diretório inteiro.
3. Executar staging interativo apenas nos dois ficheiros B.
4. Rever integralmente o cached diff e confirmar que nenhum path C, `Data/`, segredo ou artefacto entrou.
5. Repetir os checks de diff antes do commit.

Comandos propostos, deliberadamente não executados:

```powershell
git branch --show-current
git rev-parse HEAD
git diff --cached --quiet

# Repetir por cada path exato da categoria A, ou usar lotes que enumerem
# explicitamente apenas os paths A acima. Não substituir por um diretório.
git add -- <PATH_A_EXATO>

git add -p -- package.json
git add -p -- app/api/daily-snapshot/route.ts

git status --short
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Comandos proibidos para este checkpoint: `git add .`, `git add -A`, `git commit -am` e staging indiscriminado de diretórios.

Mensagem de commit recomendada:

```text
feat(investing): checkpoint engine through phase 4b r5
```

## Verificação posterior ao futuro commit

Executar apenas depois de autorização e criação do commit:

```powershell
git show --stat --oneline HEAD
git diff HEAD^ --name-status
git diff HEAD^ --check
npx vitest run tests/investingEnginePhase4BR5Gate.test.ts
npx tsc --noEmit --incremental false
npm run lint
npm test
```

Também deve ser repetida a bateria PostgreSQL real 4B numa base descartável nova e vazia, bem como a regressão Investing 3A–4B/Persistent Paper/RLS/Live usada nesta preparação. A suite global continua autorizada a terminar com exit `1` somente se a distribuição permanecer exatamente 3 + 1 + 2 nas três suites Trading Paper conhecidas.

## Riscos residuais e autorização

- O worktree contém centenas de milhares de paths não relacionados; qualquer comando global de staging é inseguro.
- `package.json` e `app/api/daily-snapshot/route.ts` exigem seleção manual de hunks.
- `package-lock.json` deve ser revisto contra apenas as dependências PostgreSQL Investing selecionadas em `package.json`.
- A suite global não é verde por causa da baseline Trading Paper conhecida; qualquer alteração à quantidade ou identidade dessas falhas bloqueia o checkpoint.
- O gate R5 não migra histórico: uma base Investing nova e vazia é obrigação prévia à 4C.

Nada foi staged, committed, pushed ou deployed durante esta preparação. Commit, push e deploy exigem autorização explícita do utilizador. Parar após este handoff; não iniciar a FASE 4C.
