# Investing FASE 5D — OPS e observabilidade interna

## Arquitetura

`lib/investing/ops` contém contratos neutros, reason codes, agregação pura,
logging estruturado, um adapter de projeções oficiais e uma boundary/factory
server-only. O resolver oficial 5B deriva sempre owner, tenant, portfolio e
account. Não existe caller público.

O `InvestingOpsReadModelPortV1` é o único ponto de inventário/telemetria. Ele
permite que uma composição futura use infraestrutura oficial sem incluir SQL,
PostgreSQL ou variáveis de ambiente na boundary. Verifier, replay e integrity
scanner entram como projeções read-only; a FASE 5D não reimplementa nenhum
deles.

## Operações

- `snapshot({})`: estado agregado e métricas do portfolio autorizado;
- `listRuns({ limit })`: runs recentes, ordenados por `asOf` e `runId`;
- `getRun({ runId })`: detalhe operacional minimizado;
- `getLatestRun({})`: último run conhecido.

Os payloads têm chaves exatas e nunca aceitam identificadores de scope.

## Estados e reason codes

- `healthy` / `ops_healthy`: todos os checks obrigatórios passaram e a
  telemetria necessária está completa;
- `degraded` / `ops_degraded` ou `ops_check_incomplete`: falha parcial;
- `blocked` / `ops_integrity_blocked`, `ops_verifier_failed`,
  `ops_replay_failed` ou `ops_blocked`: condição bloqueante;
- `empty` / `ops_empty`: ausência legítima de runs com integrity disponível;
- `unknown` / `ops_unknown`: resultado impossível de determinar.

Falhas de boundary usam ainda `ops_invalid_request`, `ops_run_not_found` e
`ops_dependency_unavailable`. Identidade conserva a resposta uniforme
`identity_scope_not_authorized`.

## Métricas

O snapshot inclui total de runs/pedidos, created/existing/recovered,
blocked/failed, conflitos, falhas por domínio, runs nas últimas 24 horas,
idade do último run e duração de geração. Cada métrica contém
`available` e `value`; telemetria ausente aparece como indisponível, nunca como
zero inventado.

Na composição atualmente validada por PostgreSQL não existe uma fonte oficial
persistida para outcomes de pedidos, conflitos ou falhas por domínio. Essas
métricas permanecem no contrato, mas são devolvidas incondicionalmente como
indisponíveis. Campos ou flags fornecidos pela porta abstrata não podem elevar
a sua disponibilidade. Até existir uma projeção oficial concreta, snapshots
com runs ficam `degraded` e datasets vazios ficam `unknown`.

## Política read-only e isolamento

A boundary só chama ports `readScope`, `inspectScope` e `inspectRun`. Não
contém INSERT, UPDATE, DELETE, UPSERT, locks, repair, fallback, reconciliação,
Paper caller, broker ou provider. O adapter rejeita qualquer row cujo owner,
tenant, portfolio ou account não corresponda ao scope 5B.
O mesmo scope completo é obrigatório e validado para cada observação de falha;
datasets incompletos ou cross-scope são rejeitados integralmente.

Logs usam um contrato fechado: timestamp, correlation ID, operação, estado,
reason code, duração, tenant e portfolio. Payloads, tokens, cookies,
connection strings, canonical payloads e stack traces não são aceites.

## Limitações e fora do escopo

Não são criados UI, API, Server Actions, cron, queue, worker, PM2, webhook,
dashboard, alertas externos, Live, Trading Paper, FASE 5E ou FASE 5F. A
integração concreta do read model ficará para a composição autorizada futura.

## Validação

```text
npx vitest run tests/investingPhase5DOps.test.ts tests/investingPhase5DIsolation.test.ts
npx vitest run tests/investingPhase5DPostgres.integration.test.ts
npx vitest run investing
npx tsc --noEmit
npm run lint
git diff --check
npm test -- --run
```
