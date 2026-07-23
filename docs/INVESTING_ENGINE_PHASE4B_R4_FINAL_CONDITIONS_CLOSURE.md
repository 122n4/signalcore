# FASE 4B-R4 — Final Conditions Closure

Data: 2026-07-21. Âmbito exclusivo: fecho das duas condições da reauditoria
R3. A FASE 4C não foi iniciada. Não existe caller operacional nem alteração
financeira ao manifest v3, replay, idempotência, RLS ou Paper-only.

## Guard destrutivo PostgreSQL

O guard aceita apenas `postgres://`/`postgresql://` com host exato
`localhost`, `127.0.0.1` ou `[::1]`, porta explícita canónica entre 1 e 65535,
database descartável e confirmação literal `true`.

São recusadas as variáveis que podem selecionar outro destino PostgreSQL:
`PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGSERVICE`, `PGSERVICEFILE`,
`PGTARGETSESSIONATTRS` e `PGLOADBALANCEHOSTS`. A ligação PostgreSQL real compara
host, porta e database do driver com o target validado e confirma ainda
`current_database()`, `inet_server_port()` e endereço loopback no servidor.

Testes específicos: 46/46. Incluem URL sem porta com `PGPORT`, porta explícita
com `PGPORT` diferente, host/hostaddr/service externos, portas zero, fora de
range, múltiplas, percent-encoded e não canónicas, cluster efetivo diferente e
as três formas locais válidas.

## Gate histórico read-only

`public.investing_engine_historical_gate_v1()` é `STABLE`, contém apenas
leituras e não está disponível a `anon` ou `authenticated`. Não converte,
atualiza, repara ou regrava rows. Produz uma das decisões:

- `historical_set_empty`: zero runs;
- `historical_set_canonical`: apenas manifest v3 e todos os artefactos passam
  a fronteira raw JSON e authorization;
- `historical_set_blocked`: existe qualquer run pré-v3/R2 ou artefacto inválido.

Uma row R2 simulada transacionalmente com `manifest_version = NULL` produziu
`historical_set_blocked`, permaneceu `NULL` após a leitura e foi removida apenas
pelo rollback do próprio teste. O relatório anterior foi restaurado byte por
byte, provando ausência de conversão ou rewrite.

Relatório da base descartável candidata `signalcore_r4_audit_over_r3`:

```json
{
  "decision": "historical_set_canonical",
  "counts": {
    "runs": 5,
    "manifestV3Runs": 5,
    "historicalRuns": 0,
    "artifacts": 60,
    "historicalArtifacts": 0,
    "invalidArtifacts": 0,
    "phaseSummaries": 20,
    "reasonEvidence": 5,
    "shadowPackages": 5,
    "claims": 65
  },
  "versions": [
    {
      "manifestVersion": "investing-engine-persistence-manifest/v3",
      "count": 5
    }
  ],
  "hashes": {
    "runSetSha256": "60c4a43a226681d818ef91c6d78b7b4c3dc3466b40b91b9e7cf0664160b711f8",
    "artifactSetSha256": "2730b5a98facd150df56ac9eee2ae73805fb59d2b24ab8ed7259e316d3d809fc"
  },
  "readOnly": true,
  "automaticConversion": false,
  "silentRewrite": false
}
```

## Migrations e validação

- 33 migrations de zero: passou.
- 32 migrations até R3 + R4 incremental: passou.
- Reapply R4 nas duas bases: passou e não alterou fingerprint.
- Fingerprint estrutural comum:
  `b37325b7b7325ad9b125de536f4bf746b10843ee38e57e6b5a3db8f4ae4aa754`.
- Rollback R4: recusado com SQLSTATE `55000`, exit code `3`; schema, dados e
  decisão do gate ficaram inalterados.
- Nove scripts SQL: P0/P1, RLS/Live/accounting, rollback/recovery,
  reconciliation, 4A, R1, R2, R3 e R4 passaram.
- PostgreSQL 4B/R4 real: 9/9.
- Concorrência: 6/6 em 4A e 9/9 no core Investing.
- Crash recovery: quatro estados, dois workers, replay e Live block passaram.
- Regressão 3A–4B + Persistent Paper: 259/259; integração PostgreSQL executada
  separadamente 9/9.
- TypeScript, ESLint e `git diff --check`: exit code `0`.
- Suite global: 1104 passed, 6 failed, 31 skipped; exit code real `1`.
- As seis falhas são exclusivamente a baseline Trading Paper:
  `paperSignalExecutionContract` (3), `paperRunnerConcurrency` (1) e
  `paperRunnerHistory` (2).

## Inventário exato R4

Ficheiros preexistentes modificados pela R4:

- `.github/workflows/investing-postgres.yml`
- `scripts/qa/investingDestructiveQaGuard.ts`
- `tests/investingDestructiveQaGuard.test.ts`
- `tests/investingEnginePhase4ASchemaIsolation.test.ts`
- `tests/investingEnginePhase4BPostgres.integration.test.ts`

Ficheiros novos R4:

- `supabase/migrations/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql`
- `supabase/rollbacks/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.down.sql`
- `supabase/tests/investing_engine_phase4b_r4.sql`
- `docs/INVESTING_ENGINE_PHASE4B_R4_FINAL_CONDITIONS_CLOSURE.md`

Não foram alterados pela R4: implementação do adapter/repository/writer/reader,
manifest v3, fases 3A–3F, Trading core, Persistent Paper, broker/provider,
API/UI/cron/queue ou código Live.

## Separação do worktree preexistente

O worktree já estava dirty antes da R4. As alterações tracked preexistentes
eram:

```text
.gitignore
.vercelignore
app/api/broker/reconcile/route.ts
app/api/broker/sync/route.ts
app/api/daily-snapshot/route.ts
app/api/fix-now/run/route.ts
app/api/ops/investing/approvals/route.ts
app/api/ops/investing/route.ts
app/api/portfolio-items/reset/route.ts
app/api/portfolio-items/route.ts
app/app/tabs/DailyTab.tsx
app/app/tabs/dailyDecisionViewModel.ts
app/ops/investing/page.tsx
app/ops/lab/page.tsx
app/ops/page.tsx
app/ops/trades/page.tsx
components/investing/InvestingOperatingLoopRail.tsx
lib/broker/index.ts
lib/broker/sync.ts
lib/engine/loop.ts
lib/investing/governance.ts
lib/investing/index.ts
lib/investing/opsAudit.ts
lib/investing/reconciliation.ts
lib/investing/runtimeAdapter.ts
lib/ops/researchLabOverview.ts
lib/trading/backtest/twelveDataHistorical.ts
lib/trading/research/fs.ts
lib/trading/research/index.ts
lib/trading/research/localArchiveInventory.ts
lib/trading/research/runner.ts
package-lock.json
package.json
tests/investingApprovalsRoute.test.ts
tests/investingDailySnapshotPersistence.test.ts
tests/investingGovernancePolicy.test.ts
tests/investingOpsRoute.test.ts
tests/researchLabOverview.test.ts
```

Nenhum destes ficheiros tracked foi alterado pela R4. Vários ficheiros das
fases 3/4, incluindo cinco ficheiros preexistentes tocados pela R4, continuam
untracked por ausência de um checkpoint anterior; por isso um futuro commit
deve ser revisto pelo conteúdo integral, não apenas por hunks Git.

## Checkpoint seletivo futuro — não executado

Somente após autorização explícita do utilizador:

```powershell
git add -N -- .github/workflows/investing-postgres.yml scripts/qa/investingDestructiveQaGuard.ts tests/investingDestructiveQaGuard.test.ts tests/investingEnginePhase4ASchemaIsolation.test.ts tests/investingEnginePhase4BPostgres.integration.test.ts supabase/migrations/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql supabase/rollbacks/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.down.sql supabase/tests/investing_engine_phase4b_r4.sql docs/INVESTING_ENGINE_PHASE4B_R4_FINAL_CONDITIONS_CLOSURE.md
git diff --check
git diff --stat -- .github/workflows/investing-postgres.yml scripts/qa/investingDestructiveQaGuard.ts tests/investingDestructiveQaGuard.test.ts tests/investingEnginePhase4ASchemaIsolation.test.ts tests/investingEnginePhase4BPostgres.integration.test.ts supabase/migrations/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.sql supabase/rollbacks/20260721230000_investing_engine_phase4b_r4_final_conditions_closure.down.sql supabase/tests/investing_engine_phase4b_r4.sql docs/INVESTING_ENGINE_PHASE4B_R4_FINAL_CONDITIONS_CLOSURE.md
```

Depois da revisão integral, substituir `git add -N` por `git add --` para os
mesmos caminhos. Não executar `git commit` sem uma nova autorização explícita.

Estado final: R4 concluída; FASE 4C não iniciada; aguarda reauditoria pequena
independente em modo leitura.
