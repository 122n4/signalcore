# FASE 6L — Memória científica

A 6L materializa `investing_research_audit_events`, prevista no blueprint 6C, como
memória científica append-only e tenant-aware. Cada decisão científica final da 6J
produz no máximo um evento imutável, positivo, negativo, inconclusivo, bloqueado ou
inválido. O evento mantém a cadeia relacional para a decisão e o relatório.

A família científica usa uma codificação length-prefixed não ambígua do ID e da versão
da hipótese.
Um perfil server-only limita tentativas, rejeições e resultados inconclusivos. Ao
atingir um limite, a família fica `saturated`; isto é evidência para impedir repetição
exata futura, não promoção, qualidade, execução ou reescrita de resultados passados.
Uma operação read-only literal rejeita uma repetição exata e uma família já saturada.

O hash content-addressed cobre todo o evento canónico. Repetições sequenciais ou
concorrentes da mesma decisão reutilizam o primeiro evento persistido. Decisões
concorrentes da mesma família são serializadas por advisory lock transacional e a base
impõe um único ordinal por família. Todo o histórico é revalidado pelo payload e hash
antes de participar na acumulação. Eventos nunca
são atualizados ou apagados, e o rollback recusa remover memória existente.

A boundary pública de identidade expõe apenas create/get/list literais, reconstruindo
tenant, owner, portfolio e account. O cliente autenticado recebe apenas leitura; a
escrita pertence à composição server-only. Não há Trading, UI, workers, backtesting,
promoção, ordens, posições ou início da FASE 6M.
