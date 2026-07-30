# FASE 6N — OPS e UI do Research Lab

A 6N oferece uma projeção operacional estritamente read-only para o scope Investing
autenticado. Mostra datasets, acquisition/scientific jobs, experiment runs, falhas,
validation reports, scientific decisions e estado de pedidos de promoção.

A autorização é reconstruída pela identity boundary pública com a operação literal
`view_research_lab_ops`, que exige `investing:read`. Tenant, owner, portfolio e
account são aplicados em todas as queries. A transação assume localmente o role
`authenticated` e instala apenas durante a transação o claim JWT `sub` já resolvido,
materializando as policies RLS existentes como segunda barreira. Nenhum scope ou
claim proveniente do browser é aceite.

O estado de promoção é sempre efetivo: uma revogação append-only prevalece sobre
`promotion_prepared`. As contagens de falhas usam agregados completos; `LIMIT 20`
aplica-se somente às listas recentes.

A projeção não devolve canonical payloads, evidência integral, credenciais, lease
tokens, payloads de provider ou dados financeiros. A página é um Server Component:
não tem mutations, forms, server actions, endpoints públicos, decisão científica ou
promoção. A 6N não chama o Investing Engine, Trading, Paper ou Live.
