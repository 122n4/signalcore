# Investing FASE 5F — Shadow/Canary Rollout

## Objetivo e limites

Esta fase controla o acesso read-only às três rotas Investing aceites na
FASE 5E-R. “Shadow/canary” significa abertura explícita e reversível da
superfície: não existe execução oculta, duplicação de pedidos, telemetria,
worker, fila, job, replay adicional ou execução científica em background.

A implementação não altera Engine, OPS 5D-R, Identity 5B-R, RLS, grants,
schema, migrations, rollbacks, Trading ou a semântica dos view models 5E-R.

## Configuração

A configuração é exclusivamente server-side:

- `INVESTING_ROLLOUT_MODE`: `off`, `allowlist` ou `on`.
- `INVESTING_ROLLOUT_ALLOWED_USER_IDS`: Clerk user IDs separados por vírgula.

Configuração ausente, mode inválido, wildcard, ID inválido ou erro de leitura
resulta sempre em `off`. A allowlist remove whitespace periférico, entradas
vazias e duplicados; a comparação permanece exata e case-sensitive.

Semântica:

- `off`: todos bloqueados antes da runtime e do PostgreSQL.
- `allowlist`: apenas sessões autenticadas com ID exato na allowlist chegam à
  runtime. Allowlist vazia bloqueia todos.
- `on`: qualquer sessão autenticada chega à cadeia oficial; membership,
  account, tenant e autorização continuam obrigatoriamente na Identity
  5B-R/RLS.

Sessão ausente é sempre bloqueada. A configuração ou os IDs nunca são
registados nem enviados ao browser.

## Gate e lifecycle

`lib/investing/rollout/gate.server.ts` é a única gate. Os três loaders chamam
um único wrapper em `lib/investing/ui/server/loader.server.ts` antes de
`createProductionInvestingOpsRuntimeV1`. Um pedido bloqueado não cria factory,
pool, directory, scanner, verifier ou replay e não contacta PostgreSQL.

Um pedido permitido continua pela composição integral 5E-R → 5D-R → 5B-R →
PostgreSQL authenticated/RLS. A runtime continua fechada em `finally`, tanto
em sucesso como em erro. Cada pedido lê a configuração e decide
independentemente; não existe cache partilhada entre utilizadores.

Os estados `off`, configuração inválida, sessão ausente e utilizador não
allowlisted produzem a mesma mensagem pública genérica. Query strings,
pathname, runId, cookies, headers, form data, body, localStorage ou props de
Client Components não participam na decisão.

## Operação

A aplicação lê `process.env` por pedido no processo Node. Alterar a
configuração no provider de hosting normalmente exige restart ou redeploy
para que o processo receba os novos valores; não existe promessa de atualização
remota instantânea, polling ou provider externo.

Ativação canary:

1. definir mode `allowlist`;
2. definir os Clerk user IDs autorizados;
3. reiniciar/redeployar conforme o ambiente;
4. validar dashboard, histórico e detalhe com uma sessão autorizada.

Abertura autenticada: alterar mode para `on`, mantendo Identity/RLS.

Rollback operacional: alterar mode para `off` e reiniciar/redeployar conforme
o ambiente. Não é necessária alteração de código ou base de dados.

Nunca colocar `NEXT_PUBLIC_` nestas variáveis. A verificação operacional deve
confirmar a configuração apenas no servidor, sem imprimir a allowlist.

## Provas

Os testes cobrem parser fail-closed, matriz off/allowlist/on, sessão ausente,
comparação exata, remoção de utilizador, concorrência independente, tentativas
de bypass, factory 0/1, lifecycle, allowlists literais e ausência no bundle
cliente.

O vertical PostgreSQL A/B usa a factory 5D-R e loaders 5E-R reais. Prova A e B
isolados, C sem membership, revogação imediata, detalhe cross-scope não
enumerável e fingerprints inalterados de identity, seis tabelas Engine e
sequences. O rollout é integralmente read-only.

## Fora de escopo

Não existem percentagens, hashing, A/B testing, remote config, schema de
flags, painel administrativo, colaboração, execução shadow do Engine,
criação de runs, repair, replay manual, Paper/Live Trading, telemetria nova ou
deploy nesta fase.
