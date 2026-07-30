# FASE 6M — Promoção controlada

A 6M é a única boundary que transforma evidência científica validada em material de
promoção preparado. Ela não submete comandos ao Investing Engine e nunca cria ordens,
posições, fills, accounting ou integração com brokers.

Eligibility exige, no mesmo scope:

- decisão 6J `validated`;
- assessment 6K `passed` contendo exatamente a decisão/candidato/experimento;
- evento 6L positivo e ligado ao mesmo relatório;
- hashes e payloads persistidos integralmente válidos.

O contrato congelado `PromotionCandidateEnvelope` da 6D continua a ser o único gate
de preparação. A 6M comprova ainda que a eligibility persistida e a referência de
risco/capacidade coincidem literalmente com o envelope.

Os únicos targets são `shadow` e `investing_paper`. O estado máximo é
`promotion_prepared`: não existem estados submitted/accepted, target Live ou chamada
direta Research → Engine.

Eligibility, requests e revogações são content-addressed, append-only, tenant-aware e
protegidos por composite foreign keys, triggers de cadeia e RLS. Idempotency keys
iguais reutilizam apenas material canonicamente idêntico; material divergente falha.
Uma revogação é append-only, converge por request e nunca reabre a promoção.

Quando constraints de convergência encontram uma request com outra idempotency key,
a reutilização exige igualdade de todo o material semântico; apenas correlation ID,
idempotency key e metadata de preparação podem variar. Divergência científica falha
fechada. Depois de uma revogação, nova preparação da mesma request é rejeitada.
As operações get/list devolvem o mesmo estado efetivo derivado:
`promotion_prepared` ou `promotion_revoked`.
