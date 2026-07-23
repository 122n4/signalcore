# Investing Engine — FASE 4C-R1 integrity scanner

## Decisão proposta

`phase4_ready`

A R1 fecha o falso `clean` reproduzido pela reauditoria. Não existe agora uma
construção válida do scanner completo sem `reader` e `replay`, os hashes dos
artefactos são recalculados a partir de `canonical_payload`, e `clean` exige a
conclusão de todas as verificações obrigatórias.

## Causa raiz

O contrato anterior aceitava:

```ts
new InvestingEnginePhase4CIntegrityScanner({ pool }).scan()
```

`reader` e `replay` eram opcionais. Além disso, o snapshot projetava o
`content_hash` armazenado como `computed_hash`. Assim, uma alteração isolada de
`canonical_payload` podia não criar issues e o scanner apenas estrutural
devolvia `clean`, com `replayStatus=not_run`.

## Contrato corrigido

- `pool`, `reader` e `replay` são obrigatórios.
- A ausência de `reader` lança
  `investing_phase4c_scanner_reader_required`.
- A ausência de `replay` lança
  `investing_phase4c_scanner_replay_required`.
- Não existe modo estrutural implícito que possa devolver `clean`.
- O snapshot PostgreSQL é `REPEATABLE READ READ ONLY` e carrega
  `canonical_payload`.
- O cálculo de hash reutiliza
  `computeInvestingEngineArtifactContentHashV1`, no verifier canónico usado
  pelo reader. Não existe um segundo serializador.
- Cada run inclui `loadVerifyStatus` e `replayStatus`.
- `clean` exige:
  - snapshot estrutural concluído;
  - hash real de todos os payloads;
  - load/verify com sucesso;
  - manifest hash presente;
  - `replay_match`;
  - hashes finais persistido e reproduzido presentes e iguais;
  - zero issues.

Uma verificação incompleta acrescenta `MANDATORY_CHECK_INCOMPLETE`; nunca
coexiste com `clean`.

## Reason codes da reprodução

A adulteração defensiva real produziu:

- `ARTIFACT_CONTENT_HASH_MISMATCH`;
- `LOAD_VERIFY_FAILED`;
- `REPLAY_BLOCKED`;
- `MANDATORY_CHECK_INCOMPLETE`.

## Reprodução PostgreSQL defensiva

Numa base QA nova:

1. foram aplicadas as 34 migrations aceites;
2. foi persistido um run canónico;
3. apenas `canonical_payload` de `canonical_input` foi alterado;
4. `content_hash` e todos os roots armazenados permaneceram intactos;
5. duas execuções completas devolveram `blocked`, os mesmos issues, hashes de
   tabela e `reportHash`;
6. o CLI completo terminou com exit `2`;
7. o payload original foi restaurado;
8. o scanner regressou ao mesmo `reportHash` e aos mesmos hashes de tabela
   anteriores à adulteração.

O scanner não escreveu dados. A comparação entre as duas execuções no estado
adulterado provou que contagens e fingerprints permaneceram estáveis.

Após toda a campanha, o scanner final verificou 29 runs:

```text
status=clean
issues=0
mandatory checks incomplete=0
reportHash=1b2974a52c6a99b4697347897443dbe891702842fc9b79e6989a716e0f83ae28
```

## Restore e schema

Um `clean` do scanner não prova que `pg_restore` terminou. São quatro gates
independentes e cumulativos:

1. exit `0` de `pg_restore --exit-on-error`;
2. validação de schema;
3. contagens e hashes de dados;
4. scanner completo `clean`.

O fingerprint de schema não depende isoladamente dos bytes de `pg_dump`.
Compara também constraints presentes e validadas, tipos, nullability, índices,
grants/ACLs, RLS, `FORCE ROW LEVEL SECURITY` e comportamento funcional.
Normalização só pode remover ruído textual previamente documentado; não pode
ocultar uma diferença semântica.

## Testes e exit codes

| Prova | Resultado | Exit |
| --- | --- | ---: |
| TypeScript inicial | passou | 0 |
| Scanner unitário e isolamento | 9/9 | 0 |
| PostgreSQL real 4C-R1 | 7/7 | 0 |
| CLI sobre payload adulterado | `blocked` | 2 |
| Scanner final após recuperação | `clean`, 29/29 checks completos | 0 |
| 34 migrations from-zero | passou | 0 |
| Reapply do migration runner | no-op | 0 |
| SQL 4A | passou | 0 |
| SQL R1 | passou | 0 |
| SQL R2 | passou | 0 |
| SQL R3 | passou | 0 |
| SQL R4 | passou | 0 |
| SQL R5 | passou | 0 |
| PostgreSQL real 4B | 9/9 | 0 |
| Regressão Investing | 51 ficheiros/394 testes; 2 ficheiros/16 testes skipped | 0 |
| Persistent Paper crash recovery | passou, incluindo dois workers | 0 |
| TypeScript final | passou | 0 |
| ESLint completo | passou | 0 |
| `git diff --check` | passou | 0 |
| Suite global | apenas a baseline Trading Paper | 1 |

A suite global terminou com 251 ficheiros e 1113 testes passados, 17 ficheiros
e 38 testes skipped, e exclusivamente:

- `paperSignalExecutionContract`: 3 falhas;
- `paperRunnerConcurrency`: 1 falha;
- `paperRunnerHistory`: 2 falhas.

Não apareceu uma sétima falha.

## Inventário e limpeza QA

Antes da remoção foi congelada e apresentada uma allowlist exata:

- bases `investing_phase4c_qa_a` a `investing_phase4c_qa_n`;
- cluster dedicado
  `%TEMP%\signalcore-phase4c-pg-20260723-1815`, porta loopback `55439`;
- 172 ficheiros temporários, 5.774.941 bytes, allowlist SHA-256
  `155645d0bd381113784169e6c13906748825c207675cb332920150d6ac44a4a3`;
- `investing-phase4c-qa-g.dump`;
- `phase4c-incompatible.dump`;
- diretório sintético
  `%TEMP%\signalcore-phase4c-crash-cwd-20260723`.

O catálogo do cluster continha apenas as 14 bases QA e
`postgres`/`template0`/`template1`. Não existia serviço Windows, caller,
dependência funcional ou padrão de segredo conhecido.

A limpeza usou apenas paths literais e validação fail-closed da contagem e hash
da allowlist. No final:

- bases QA restantes: zero;
- clusters Phase 4C restantes: zero;
- dumps Phase 4C restantes: zero;
- entradas temporárias Phase 4C restantes: zero;
- portas QA `55439` e `55449` a escutar: não.

Os artefactos removidos eram descartáveis; a remoção é definitiva.

## Limitações

- O scanner é um verificador de dados; não substitui o exit do restore nem a
  validação de schema/ACLs.
- O scanner executa load/verify/replay por run e tem custo aproximadamente
  linear no histórico.
- As medições de capacidade são locais e não substituem staging real.
- A baseline Trading Paper permanece fora do âmbito da R1.

## Isolamento

- Nenhuma migration ou rollback foi alterado.
- Nenhuma API, UI, cron, queue ou caller operacional foi criado.
- Nenhum broker ou provider foi integrado.
- Live permanece bloqueado.
- A FASE 5 não foi iniciada.
- Não houve stage, commit, push ou deploy.
