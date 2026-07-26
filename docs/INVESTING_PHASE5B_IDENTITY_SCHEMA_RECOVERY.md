# Investing FASE 5B-R — Identity Schema Recovery

## Causa raiz e modelo

A FASE 5B aceitou um contrato de identidade explícito, mas o schema
persistia apenas `user_id`. Esta recuperação adiciona um modelo real e
evolutivo, limitado nesta fase a um tenant `personal` por owner e uma única
membership `owner` por tenant. Não representa colaboração nem deriva tenants
ou memberships de identificadores sintéticos em runtime.

As permissions persistidas são exclusivamente as já aceites pelo contrato
5B: `investing:read`, `investing:create`, `investing:verify` e
`investing:replay`. O wildcard aceite pelo tipo histórico não é persistido.

## Schema e backfill

A migration `20260725120000_investing_identity_schema_recovery.sql` cria
`investing_tenants` e `investing_tenant_memberships`, acrescenta
`tenant_id` e `owner_user_id` a `investing_accounts`, e aplica FKs,
unicidade, índices e constraints fechadas.

Antes do primeiro write, a migration bloqueia accounts sem owner/portfolio,
runs sem account, divergências `requested_user_id`/`owner_id`/account e
ambiguidade de account. Para cada owner coerente, cria deterministicamente
um tenant pessoal e uma membership owner, associa as accounts e só depois
torna as novas colunas `NOT NULL`. A operação é transacional; não corrige nem
adivinha dados inconsistentes.

## RLS e grants

O claim canónico é `auth.jwt()->>'sub'`. Um helper `security definer`,
read-only, com `search_path` fixo evita recursão RLS e exige exatamente uma
membership owner ativa, tenant ativo, owner coerente e permission explícita.
Tenants, memberships, accounts e tabelas Engine passam a usar esta prova.
`authenticated` recebe apenas `SELECT`; `anon` não recebe leitura e o request
normal não usa `service_role`.

## Adapters e factory

`ClerkInvestingAuthenticatedSessionAdapterV1` reutiliza
`getRequestUserId`, devolve apenas user e request id e permite injetar um
reader apenas em testes. `PostgresInvestingScopeDirectoryAdapterV1` executa
queries parametrizadas numa transação `READ ONLY`, sob role `authenticated`
e claim da sessão já verificada. O adapter devolve dados persistidos; o
resolver 5B congelado continua responsável por cardinalidade e autorização.

`createProductionInvestingIdentityScopeResolverV1` compõe Clerk, directory
PostgreSQL e o resolver oficial. Falha se a ligação não estiver configurada,
nunca aceita scope pronto do browser e não está ligada à UI nesta fase.

## Rollback

O rollback dedicado revoga primeiro policies/grants e recusa tenants não
pessoais, memberships adicionais/partilhadas ou qualquer divergência entre
tenant, owner e account. Apenas após provar equivalência owner-only restaura
as policies históricas e remove as estruturas novas, sem apagar dados de
negócio.

## Limitações

Não existem colaboração, tenants partilhados, memberships adicionais, Live,
broker ou UI. A composição OPS 5D-R e a FASE 5F não são iniciadas aqui.
