# Investing - Auditoria browser/producao

Data: 2026-08-08
Ambiente: producao `https://www.syntrake.com`
Sessao auditada: Chrome autenticado do utilizador
Commit em producao auditado: `9ea6b2c3f feat(investing): finalize canonical paper dashboard`

## 1. Resultado executivo

Estado geral: **aprovado com observacoes menores**.

Nao foram encontrados crashes, erros de consola da app, overflow horizontal desktop/mobile, textos de execucao Live indevidos, nem falhas no QA Investing de producao.

Foi encontrado e corrigido localmente um problema menor de limpeza tecnica: quatro warnings ESLint em `app/app/ui.tsx` causados por codigo morto. A correcao removeu `TrustProofRail`, `hasProAccess`, `trustHref` e `trustSecondaryHref` nao utilizados. Esta correcao ainda precisa de commit/deploy se for para entrar em producao.

## 2. Superficies verificadas no Chrome

Foram abertas e verificadas as rotas:

- `/app?tab=daily&mode=investing`
- `/app?tab=portfolio&mode=investing`
- `/app?tab=planning&mode=investing`
- `/app?tab=research&mode=investing`
- `/app?tab=reports&mode=investing`
- `/app?tab=autonomy&mode=investing`
- `/app?tab=settings&mode=investing`

Resultados:

- app autenticada renderizou o Investing OS;
- shell Investing visivel;
- tabs principais visiveis;
- ambiente Paper visivel;
- Live blocked/Paper-only visivel;
- sem `Application error`;
- sem `Something went wrong`;
- sem `undefined` visivel;
- sem `NaN` numerico visivel;
- sem `[object Object]` visivel;
- sem overflow horizontal no desktop;
- sem overflow horizontal no viewport mobile 390x844;
- sem erros de consola first-party capturados durante a navegacao.

## 3. Achados detalhados

### 3.1 Falso positivo de `NaN`

O primeiro scanner textual marcou `nan`, mas a origem era texto normal contendo a sequencia `nan`, como `Governance` e `balanced`. Foi revalidado com regex de palavra inteira `\bNaN\b`; nao havia numero invalido visivel.

Classificacao: **nao e bug**.

### 3.2 Idiomas aparentemente visiveis

O scanner textual mostrou `English`, `Portugues`, `Espanol`, `Francais`, `Deutsch`, `Italiano`. A inspecao DOM confirmou que vinham de elementos `<option>` internos de um select, com dimensoes zero.

Classificacao: **nao e bug visual**.

### 3.3 GET direto a `/api/investing/dashboard` no Chrome

A tentativa de abrir diretamente `/api/investing/dashboard` no tab Chrome foi bloqueada antes de chegar a app com `net::ERR_BLOCKED_BY_CLIENT`. Como alternativa, a validacao de APIs foi feita pelo script QA de producao do repo.

Classificacao: **bloqueio do cliente/browser, nao confirmado como bug da app**.

### 3.4 Warnings ESLint em `app/app/ui.tsx`

Foram encontrados 4 warnings:

- `TrustProofRail` definido mas nao usado;
- `hasProAccess` atribuido mas nao usado;
- `trustHref` atribuido mas nao usado;
- `trustSecondaryHref` atribuido mas nao usado.

Acao tomada: removido codigo morto localmente.

Classificacao: **limpeza tecnica menor, corrigida localmente**.

## 4. Validacoes executadas

### 4.1 Browser autenticado

Resultado:

- Today: OK
- Portfolio: OK
- Plan: OK
- Research: OK
- Reports: OK
- Autonomy: OK
- Settings: OK
- Desktop overflow: OK
- Mobile overflow 390x844: OK
- Console errors first-party: 0

### 4.2 QA Investing producao

Comando:

```bash
npm run qa:investing:prod
```

Resultado:

- `ok: true`
- `failures: 0`
- `warnings: 0`
- `pages: 5`
- `apis: 2`
- report: `artifacts/qa-investing-prod/report.json`

### 4.3 Testes Investing

Comando:

```bash
npx vitest run tests/appNavigationModel.test.ts tests/investingArchitectureIsolation.test.ts tests/investingDashboardCompactRead.test.ts tests/investingMarketSnapshots.test.ts tests/investingMigrationArchitecture.test.ts tests/investingEnginePhase3FEndToEnd.test.ts tests/investingEnginePhase3FIntegrity.test.ts
```

Resultado:

- 7 test files passaram;
- 63 testes passaram.

### 4.4 TypeScript

Comando:

```bash
npx tsc --noEmit --pretty false
```

Resultado: passou.

### 4.5 ESLint focado

Comando:

```bash
npx eslint app/app/tabs/InvestingDashboardSurface.tsx app/app/navigationModel.ts app/app/ui.tsx lib/investing/customerDecisionProjection.ts lib/investing/engineV1CustomerBridge.ts lib/investing/server/dashboard.ts lib/investing/server/dailyCycle.ts lib/investing/server/marketSnapshots.ts tests/investingDashboardCompactRead.test.ts tests/investingMarketSnapshots.test.ts
```

Resultado apos correcao local: passou sem erros nem warnings.

## 5. Estado final

O produto Investing em producao esta operacional nas superficies auditadas. A experiencia mostra corretamente Paper/manual, bloqueia linguagem de Live, renderiza dados canonicos, nao apresenta erros de runtime visiveis e passa QA de producao.

Unica pendencia: a limpeza local em `app/app/ui.tsx` deve ser commitada e deployada se quiseres que o repo/producao fiquem tambem sem esses warnings ESLint.
