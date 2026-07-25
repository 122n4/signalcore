# Investing FASE 5C — caller Paper controlado

## Limite

O primeiro caller Investing é interno e exclusivamente server-side. Não existe
API, UI, Server Action operacional, cron, queue, worker ou integração com
Trading Paper.

## Fluxo canónico

1. O resolver oficial da FASE 5B obtém a sessão e resolve um único membership,
   tenant, owner, portfolio e account autorizados.
2. O caller aceita exatamente `mode`, `sourceReference` e `idempotencyKey`.
3. `mode` tem de ser literalmente `paper`; Live, real-money, broker e modos
   desconhecidos terminam antes da boundary de escrita.
4. O target é construído apenas a partir do scope autenticado. IDs de scope no
   payload tornam o pedido inválido.
5. A boundary oficial da FASE 5A executa autorização defensiva, integrity guard,
   resolução da fonte canónica, persistência, verificação e resultado canónico.

## Idempotência e estados

O caller transmite a chave opaca sem a transformar. Locks, unicidade,
concorrência, retry após commit e recuperação de commit ambíguo permanecem na
persistência oficial:

- `created` / `canonical_run_created`;
- `existing` / `canonical_run_existing`;
- `recovered` / `canonical_run_recovered`.

Falhas próprias são determinísticas:

- `invalid_request`;
- `paper_mode_required`.

Falhas de identidade usam `identity_scope_not_authorized`; falhas de integrity
e persistência conservam os reason codes canónicos da boundary 5A.
