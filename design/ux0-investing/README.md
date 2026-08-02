# Protótipo Investing UX-T1R human-first truth-safe

Protótipo estático e isolado reconciliado com o UX-T0. Abrir `index.html` diretamente ou servir apenas esta pasta com um servidor local de ficheiros. Não está ligado ao runtime Next.js, a serviços reais ou a rotas de produção.

Controlos:

- navegação ativa: Home, Portfolio e Plan;
- 11 estados truth-safe selecionáveis;
- Home sem carteira, com atenção, sem engine blocker e com dados insuficientes;
- revisão de concentração Paper estritamente read-only;
- marcação interna `data-truth="A|B"` em cada bloco factual.
- viewport: o mesmo documento adapta-se a mobile, tablet e desktop.

Research e Activity permanecem apenas no roadmap até existirem contratos próprios. Os dados estáticos encontram-se exclusivamente em `prototype.js` e são exemplos não funcionais.

O refinamento UX-T1R preserva os mesmos 11 estados e classificações A/B, mas apresenta prioridade, próximo passo e limitações em linguagem humana. A primeira utilização é uma sequência visual local, sem persistência. Evidência técnica fica num disclosure opcional. Ver `UX_T1R_HUMAN_FIRST.md` e as capturas reais em `screenshots/t1r/`.

UX-T1R-R1 acrescenta apenas a saída explícita `Save and exit` à primeira utilização. O passo é conservado apenas no estado transitório do documento aberto; `Continue setup` retoma esse mesmo passo. Sair, retomar e voltar atrás não criam nem persistem conta, plano, posição, pagamento ou avaliação.
