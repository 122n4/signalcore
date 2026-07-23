# Investing Engine — FASE 4C operational runbook

## Âmbito e regra de paragem

Este runbook aplica-se exclusivamente a bases PostgreSQL Investing locais, novas e descartáveis, usadas para QA da FASE 4C. Não cria caller de produto, não autoriza API, UI, cron, queue, broker, provider ou Live e não contém segredos.

Parar a promoção sempre que o gate R5 não devolver `historical_set_empty` antes da primeira escrita sintética, uma migration falhar, o scanner devolver `blocked`, um teste de RLS/Live falhar, os fingerprints divergirem sem explicação ou existir ambiguidade sobre o destino PostgreSQL.

## Provisionar uma base vazia

1. Escolher um cluster local dedicado e uma porta explícita.
2. Confirmar que o nome da base ainda não existe. O nome deve conter um token inequívoco como `qa`, `test` ou `temporary` e não pode conter `prod`, `stage`, `staging`, `live`, `main` ou `primary`.
3. Criar a base através de uma sessão administrativa ligada a `postgres`, sem reutilizar ou limpar silenciosamente uma base preexistente.
4. Definir a URL sem userinfo, query ou fragment, por exemplo:

   ```powershell
   $env:INVESTING_4C_TEST_DATABASE_URL = 'postgresql://127.0.0.1:55439/investing_phase4c_qa'
   $env:ALLOW_DESTRUCTIVE_INVESTING_QA = 'true'
   ```

5. Manter vazias `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGSERVICE`, `PGSERVICEFILE`, `PGTARGETSESSIONATTRS` e `PGLOADBALANCEHOSTS`. O guard deve recusar qualquer uma destas variáveis.
6. Aplicar `supabase/tests/bootstrap_standalone_postgres.sql` e, por ordem lexical, todas as 34 migrations de `supabase/migrations`.

Nunca executar `DROP DATABASE` por padrão. A eliminação de uma base QA exige confirmação humana, comparação do nome exato com uma allowlist explícita desta execução e nova consulta ao catálogo imediatamente antes da operação.

## Verificar o gate R5

Antes de criar dados sintéticos:

```sql
set local role service_role;
begin transaction read only;
select public.investing_engine_historical_gate_v1();
select
  (select count(*) from public.investing_engine_runs) as runs,
  (select count(*) from public.investing_engine_artifacts) as artifacts,
  (select count(*) from public.investing_engine_phase_summaries) as summaries,
  (select count(*) from public.investing_engine_reason_evidence) as evidence,
  (select count(*) from public.investing_engine_shadow_packages) as shadows,
  (select count(*) from public.investing_engine_idempotency_keys) as claims;
rollback;
```

O único resultado aceitável é `historical_set_empty` com seis contagens iguais a zero. `historical_set_blocked`, erro ou qualquer row bloqueiam a transição. `anon` e `authenticated` devem receber acesso negado.

## Aplicar e verificar migrations

- Registar o exit code de cada aplicação.
- Reaplicar a cadeia completa e exigir exit zero.
- Gerar um dump `--schema-only --no-owner --no-privileges`, remover apenas linhas aleatórias de proteção do próprio `pg_dump` (`\restrict`/`\unrestrict`) e calcular SHA-256.
- Comparar o fingerprint da instalação from-zero, do reapply e do restore.
- Executar as suites SQL 4A, R1, R2, R3, R4 e R5.
- Confirmar grants, RLS, `FORCE ROW LEVEL SECURITY`, append-only e Live block.

Nenhuma migration 4A–R5 pode ser editada durante a 4C. Se a validação aparentar exigir mudança de schema, parar e escalar.

## Executar o integrity scanner

O scanner é manual, read-only e não está exposto em `package.json` nem exportado pelo produto:

```powershell
node -r ./scripts/register-alias.cjs ./node_modules/jiti/bin/jiti.js scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts
```

Executá-lo com `INVESTING_4C_TEST_DATABASE_URL` e `ALLOW_DESTRUCTIVE_INVESTING_QA=true`. Arquivar stdout, stderr, exit code, `reportHash`, contagens, hashes das seis tabelas e reason codes. `clean` exige ausência total de reason codes; qualquer erro, row inesperada ou divergência deve resultar em `blocked`.

O modo completo exige sempre `pool`, `reader` e `replay`. A classe recusa
construção sem `reader` com `investing_phase4c_scanner_reader_required` e sem
`replay` com `investing_phase4c_scanner_replay_required`. Não existe modo
estrutural implícito capaz de devolver `clean`. Para cada run, `clean` exige
`loadVerifyStatus=verified`, `replayStatus=replay_match`, manifest hash presente
e hashes finais persistido/reproduzido presentes e iguais. Qualquer verificação
incompleta acrescenta `MANDATORY_CHECK_INCOMPLETE`.

O scanner carrega cada `canonical_payload` dentro do snapshot read-only e
recalcula o hash através do mesmo verifier canónico usado pelo reader. Nunca
usa `content_hash` como substituto do valor calculado.

O scanner não repara, converte, apaga nem reescreve dados. Nunca elevar o seu resultado através de um endpoint browser ou agendá-lo automaticamente.

## Backup e validação

1. Criar um backup completo em formato custom com `pg_dump -Fc`.
2. Registar hash SHA-256, tamanho e duração.
3. Validar legibilidade com `pg_restore --list`.
4. Criar uma segunda base local nova e vazia.
5. Restaurar com `pg_restore --exit-on-error --no-owner`. Não usar
   `--no-privileges`: os `REVOKE`/`GRANT` são parte da fronteira de segurança e
   têm de ser restaurados.
6. Comparar schema fingerprint, contagens e hashes das seis tabelas.
7. Repetir load, verify, replay, integrity scan, RLS, privilégios, isolamento entre owners e Live block.

Um backup vazio, truncado, ilegível, de versão incompatível ou cujo comando falhe não é um backup válido. Um restore interrompido ou dirigido a uma base não vazia é inválido; não continuar a partir do estado parcial. O exit zero do restore, o fingerprint de schema e o scanner são gates independentes: tabelas de dados vazias podem parecer `clean` depois de uma interrupção tardia, sem que o schema ou os ACLs estejam completos.

Uma promoção após restore requer cumulativamente:

1. `pg_restore --exit-on-error` com exit `0`;
2. validação do schema;
3. contagens e hashes das tabelas;
4. scanner completo com exit `0` e estado `clean`.

O estado `clean` do scanner nunca substitui os três gates anteriores. Para o
schema, não usar o hash textual bruto isoladamente: normalizar apenas ruído
documentado do `pg_dump` e comparar também constraints presentes e validadas,
tipos, nullability, índices, grants/ACLs, RLS, `FORCE ROW LEVEL SECURITY` e
comportamento funcional. Uma divergência não explicada em qualquer dimensão
bloqueia promoção.

## Responder a crash

1. Parar novos writers de QA.
2. Registar processo, timestamp, operação, owner, run ID, idempotency key e fase observada.
3. Verificar sessões e locks em `pg_stat_activity` e `pg_locks`.
4. Executar o scanner read-only.
5. Repetir a mesma operação apenas com a mesma idempotency key.
6. Confirmar um único run, inventário completo, mesmos hashes e mesma decisão.
7. Se o commit for ambíguo, carregar por idempotency key; nunca criar outra key para “resolver” a ambiguidade.

Persistência parcial, duplicação, lock preso, alteração de decisão ou divergência de hash bloqueiam promoção.

## Responder a corrupção

1. Bloquear imediatamente promoção e writers de QA.
2. Não corrigir, converter ou apagar rows.
3. Recolher scanner, fingerprints, hashes, logs e backup.
4. Restaurar o último backup validado numa terceira base nova.
5. Comparar a evidência sem modificar a base afetada.
6. Escalar para revisão humana com os reason codes e paths de reprodução.

## Responder a falha de RLS ou privilégios

Qualquer leitura cross-tenant, `EXECUTE` por `anon`/`authenticated`, ausência de `FORCE ROW LEVEL SECURITY` ou privilégio inesperado é bloqueador. Revogar acesso operacional ao ambiente de QA, preservar evidência e escalar. Não alterar migrations aceites durante esta validação.

## Eliminar apenas bases QA allowlisted

A eliminação é uma ação administrativa separada, nunca automática:

1. Criar uma allowlist literal com os nomes gerados nesta execução.
2. Consultar `pg_database` e comparar igualdade exata.
3. Confirmar host e porta efetivos.
4. Obter autorização humana específica.
5. Remover uma base de cada vez e confirmar depois que deixou de existir.

Não usar wildcards, variáveis não resolvidas ou nomes derivados de input externo. Nunca remover uma base preexistente.

## Evidência e escalamento

Guardar fora do repositório:

- branch e HEAD;
- versões Node, npm, PostgreSQL e sistema operativo;
- comandos redigidos sem segredos e exit codes;
- fingerprints e hashes;
- relatórios do scanner;
- duração/tamanho de backup e restore;
- métricas p50/p95/p99, locks e conexões;
- nomes exatos das suites e falhas;
- timestamps de restart e recovery.

Escalar manualmente com impacto, reprodução, evidência, owner afetado, reason codes e decisão provisória. A decisão permitida é `phase4_ready`, `ready_with_conditions` ou `blocked`; nunca ocultar uma falha nova dentro da baseline Trading Paper.
