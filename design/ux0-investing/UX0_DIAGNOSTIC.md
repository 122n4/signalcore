# Investing UX-0 — diagnóstico e arquitetura

Estado: diagnóstico read-only concluído em 2026-08-02. Este documento descreve o produto atual e o protótipo isolado. Não autoriza migração para produção.

## 1. Resumo executivo

A experiência Investing atual é um único workspace client-side em `/app`, controlado por query string (`tab`/`view` e `mode`). As áreas visíveis são Today, Plan, Portfolio, Advisor e Autonomy. O shell importa todas as tabs de forma síncrona, embora apresente apenas uma. As cinco tabs Investing principais totalizam 10.650 linhas e aproximadamente 478 KB de TypeScript/TSX (sem dependências transitivas). Quatro superfícies pedem o mesmo agregado `/api/daily-bundle`; Portfolio combina-o com `/api/portfolio-items`; o shell também inicia leituras de acesso, modo e settings.

O problema não é cosmético. As responsabilidades estão partidas por conceitos técnicos (“Daily”, “Autonomy”, “Advisor”), a mesma decisão aparece em várias páginas, e tarefas de Investor, Research e OPS coexistem no modelo mental. A recuperação proposta troca a organização por mecanismo pela organização por pergunta do utilizador: Home, Portfolio, Plan, Research e Activity.

## 2. Mapa atual de rotas e superfícies

| Superfície | Entrada | Tipo | Função aparente | Dados e ações | Problemas | Owner correto |
|---|---|---|---|---|---|---|
| Workspace | `/app?mode=investing&tab=…` | Client shell | Alternar Investing/Trading e montar tabs | acesso, plano, modo, settings, navegação | shell pesado; estado na URL e localStorage; todas as tabs importadas | Investor shell |
| Today/Daily | `tab=daily`, alias `/app/daily` | Client tab | decisão e loop do dia | dashboard Investing, conta paper, fila, proposta, fechar dia, submeter ordem paper | Daily Loop domina; decisão, execução, paper e atividade misturados | Home (resumo) + Plan (decisão) + Activity (evento) |
| Plan | `tab=planning` | Client tab | configurar objetivo e mandato | daily bundle, plans, settings, starter pack, projeções | 6 cards; onboarding, recomendação e aplicação no mesmo plano; repete estado diário | Plan |
| Portfolio | `tab=portfolio`, alias `/app/portfolio` | Client tab | editar e analisar holdings | portfolio-items, daily bundle, search, reset, FixAll | 2.969 linhas; análise e edição excessivas; automação imperativa; repete plano e qualidade | Portfolio |
| Advisor | `tab=advisor` | Client tab | estratégia, explicações e valor | daily bundle, cenários, provas, CTAs para Daily/Plan/Portfolio | 17 cards; recomendações sem owner; linguagem de retenção exposta | Plan + Home; evidência científica resumida em Research |
| Autonomy | `tab=autonomy` | Client tab | controlo e observabilidade | daily bundle, broker, sync, disconnect, FixNow, close day | broker, ações automáticas, reliability e diagnósticos operacionais expostos | Settings + OPS + Activity |
| Portfolio legado | `/my-portfolio` | Page | entrada antiga | portfolio e meta legacy | duplicação de ownership e endpoints legados | remover após migração |
| OPS Investing | `/ops/investing` | Server/page + API | operação, aprovações e integridade | `/api/ops/investing`, approvals | correto como domínio separado; nunca deve entrar no Investor IA | OPS |
| Research Lab | `/ops/lab` | OPS page/runtime | execução e saúde científica | health/start e arquivos de Research | detalhe operacional não é conteúdo de Investor Research | OPS; Research recebe apenas read model resumido |
| Trading | `/app?mode=trading…` e APIs `/api/trading/*` | workspace e rotas | decisão e execução de trading | scanner, execution, alerts, journal | fora de âmbito e deve permanecer separado | Trading |
| Settings implícito | Autonomy, broker e account shell | Client | preferências e ligações | `/api/user-settings`, broker APIs | sem destino próprio; polui Autonomy | Settings fora da nav principal |

### Layout e navegação atuais

- Desktop: `CockpitShell` apresenta header global, switch Investing/Trading, cinco itens e controlos de conta.
- Mobile: bottom navigation de cinco células; “Autonomy” transforma-se em “More” e abre painel com Autonomy, plano da conta, idioma e conta.
- A arquitetura mobile não é semanticamente igual à desktop: uma área de produto vira contentor de utilidades.
- O header de página é suprimido em Daily e acrescentado nas restantes tabs, criando hierarquia inconsistente.
- Rotas `/app/daily` e `/app/portfolio` redirecionam/encapsulam o mesmo workspace; a URL canónica de cada responsabilidade não é evidente.

## 3. Mapa atual de requests e waterfalls

| Origem | Requests de entrada/refresh | Sequência observada | Risco |
|---|---|---|---|
| Shell `/app` | acesso (`/api/me` e estado de billing via helper), `/api/user-settings` repetido, modo | hooks montam em paralelo, mas `useAutopilotMode` volta a ler settings | request duplicado antes do conteúdo da tab |
| Today | `/api/investing/dashboard` | request após mount; ações posteriores abrem paper account, daily-cycle e order | conteúdo crítico só após JS/hidratação; ação e leitura acopladas |
| Plan | `/api/daily-bundle` | load após mount; save faz `/api/plans` e depois `/api/user-settings` | waterfall de gravação; agregado excessivo para editar plano |
| Portfolio | `/api/portfolio-items` e depois/ao lado `/api/daily-bundle` | dois loaders client-side; mutações recarregam dados | duas fontes para uma página; bundle traz conteúdo fora do owner |
| Advisor | `/api/daily-bundle` | load após mount | mesmo agregado de Plan/Autonomy; página muito extensa |
| Autonomy | `/api/broker/status`, `/api/daily-bundle`; refresh com cache-buster | broker e bundle; ações encadeiam reset/FixNow/sync/close | waterfall operacional e mutações de alto impacto no Investor UI |

O `/api/daily-bundle` atual tem 6.948 linhas (~275 KB de fonte server) e agrega decisões, plano, portfolio, value proof, reliability, trading/research context e outras projeções. Usá-lo como read model universal impede budgets por página e favorece respostas e computação desnecessárias.

### Requests duplicados a eliminar numa migração futura

1. Consolidar `/api/me` + acesso + settings num bootstrap mínimo do shell, com cache por sessão.
2. Remover o segundo `/api/user-settings` disparado pelo modo.
3. Substituir `daily-bundle` nas páginas Plan, Portfolio, Research e Activity por read models específicos.
4. Não recarregar bundle completo depois de mutações de holdings; invalidar apenas portfolio summary/positions.
5. Home deve receber apenas valor, performance resumida, plan status, uma priority, mudanças recentes e Research count.

## 4. Matriz de duplicações

| Conceito atual | Today | Plan | Portfolio | Advisor | Autonomy | Owner oficial novo |
|---|:---:|:---:|:---:|:---:|:---:|---|
| prioridade/recomendação | ✓ | ✓ | ✓ | ✓ | ✓ | Plan (Home mostra só a primeira) |
| objetivo/horizonte/risco | resumo | ✓ | resumo | ✓ | ✓ | Plan |
| holdings/alocação | resumo | starter pack | ✓ | resumo | reset/fix | Portfolio |
| performance/valor | ✓ | projeção | ✓ | ✓ | prova | Portfolio; Home só headline |
| Daily Loop/close day | ✓ | explicação | CTA | CTA | ✓ | Activity para histórico; Home apenas mudança recente |
| qualidade/freshness | ✓ | ✓ | ✓ | ✓ | reliability | componente global DataStatus, detalhe em Activity |
| evidência/metodologia | resumo | regras | contexto | provas | diagnostics | Research |
| broker/autonomia | paper action | contrato | fix | CTA | ✓ | Settings/Trading; OPS para operação |
| eventos/receipts | ✓ | versions | alterações | weekly/value proof | activity stream | Activity |

## 5. Problemas de linguagem, estados e hierarquia

- Conceitos internos expostos: Daily Loop, FixAll/FixNow, Autopilot contract, leak, execution queue, reliability, receipts, retention intervention e system diagnostics.
- “Proven Value” e “Receipts Logged” aparecem como promessa/contagem sem definição suficientemente localizada.
- CTAs concorrentes ligam Plan, Portfolio, Daily, Advisor e broker entre si, obrigando o utilizador a decidir a arquitetura.
- Os componentes `Card`, `Badge`, `Pill`, formatadores e loaders são recriados em várias tabs; não existe gramática única de estados.
- Loading e error são locais a cada tab; stale e data integrity não têm tratamento consistente; empty frequentemente dispara starter pack ou automação.
- Cards dentro de secções/card-like rails geram profundidade visual e perdem prioridade.
- A cópia é extensa e orientada a mecanismo. O que aconteceu, porquê e o próximo passo não formam uma sequência consistente.

## 6. Arquitetura oficial proposta

| Área | Pergunta principal | Dados permitidos | Dados proibidos | Ação primária única | Secundárias |
|---|---|---|---|---|---|
| Home | “Como está o meu investimento e o que merece atenção?” | valor, performance resumida, plan status, uma prioridade, mudanças recentes, Research mini-summary | holdings completos, logs, metodologia avançada, OPS | Rever prioridade | abrir detalhe proprietário |
| Portfolio | “O que possuo, como evoluiu e a que estou exposto?” | evolução, contribuição vs retorno, allocation, positions, concentration, exposure, cash, movements | recomendações, operações OPS, Research runtime | Atualizar portfolio | filtrar, abrir posição, exportar |
| Plan | “O meu capital segue os meus objetivos e regras?” | objetivos, horizonte, risco, target allocation, constraints, gap, sugestões, impacto e confirmação | execução automática, logs OPS, ciência completa | Rever alteração sugerida | editar objetivo/regras, comparar impacto |
| Research | “Que evidência sustenta as regras usadas no meu plano?” | investigação em curso, validações, rejeições, eligibility, evidência resumida, metodologia recolhida | runtime controls, paths, datasets brutos, promotion plumbing | Explorar evidência | filtrar, expandir metodologia |
| Activity | “O que aconteceu, quando e com que evidência?” | imports, updates, valuations, reviews, plan changes, decisions, evidence, notifications | recomendações novas, controlos de engine, detalhes OPS | Rever item pendente | filtrar, abrir evidência |

Settings fica fora da navegação principal. OPS e Trading preservam shells, autorização e runtimes independentes.

## 7. Contratos e estados por página

### Home

- Componentes: PageIntro, DataStatus, PortfolioHero, PlanStatus, PriorityNarrative, RecentChanges, ResearchBrief.
- Crítico: portfolio headline, plan status e priority. Adiado: recent changes e Research brief.
- Empty: explicar que não existe portfolio e oferecer “Adicionar portfolio”. Loading: skeleton dos três blocos. Error: manter último snapshot se existir. Stale: mostrar idade/integridade e permitir refresh.
- Mobile: valor e estado primeiro; prioridade imediatamente abaixo; listas em uma coluna. Desktop: hero + plan status no primeiro bloco, prioridade larga no segundo, mudanças/Research no terceiro.

### Portfolio

- Componentes: ValueTrend, ReturnBridge, Allocation, PositionsTable/List, Concentration, Exposure, CashMovements, PositionDetail.
- Crítico: headline, evolução e positions summary. Adiado: exposição e movimentos extensos.
- Empty: import manual/broker como escolha explícita. Loading: chart/table skeleton. Error: snapshot anterior. Stale: dados permanecem visíveis e marcados.
- Mobile: positions cards sem tabela horizontal; detalhe em sheet. Desktop: chart e allocation em grid, tabela única abaixo.

### Plan

- Componentes: GoalSummary, RiskHorizon, TargetAllocation, Constraints, PlanGap, SyntrakeNarrative, ImpactPreview, ConfirmChange.
- Crítico: objetivo, gap e sugestão. Adiado: cenários e histórico de versões.
- Empty: wizard curto. Loading: resumo preservado. Error: nunca perder draft. Stale: distinguir preços antigos de regras atuais.
- A recomendação usa exatamente Detected → Why it matters → Impact → Evidence → Next step. Nunca imperativa; confirmação humana obrigatória.

### Research

- Componentes: ResearchSummary, StudyList, EligibilityBadge, EvidenceSummary, MethodologyDisclosure, RejectionReason.
- Crítico: counts e estudos recentes. Adiado/lazy: metodologia e charts detalhados.
- Empty: “Sem estudos publicados”, sem sugerir falha. Loading: rows skeleton. Error: não contaminar Plan; declarar indisponibilidade. Stale: mostrar data do último pacote validado.
- Mobile e desktop preservam a mesma ordem; metodologia usa disclosure progressivo.

### Activity

- Componentes: ActivityFilters, Timeline, ActivityItem, EvidenceDrawer, NotificationState.
- Crítico: últimos eventos e pendências. Adiado: páginas antigas e evidência pesada.
- Empty: estado calmo e data do último sync. Loading: timeline skeleton. Error: snapshot anterior. Stale: banner e idade por fonte.
- Mobile: timeline linear; desktop: filtros laterais compactos e feed.

## 8. Fluxos principais

1. Orientação: Home → ler valor/estado → compreender prioridade no formato Syntrake → “Rever no Plan” → confirmar ou adiar.
2. Compreensão de carteira: Home/Portfolio → evolução → allocation/positions → detalhe → movimento associado em Activity.
3. Alteração de plano: Plan → editar regra ou abrir sugestão → ver impacto → confirmar explicitamente → Activity regista decisão/evidência.
4. Confiança científica: Plan/Home → Research summary → estudo → evidência → metodologia expandida opcionalmente.
5. Auditoria: notificação → Activity → evento → origem da regra, idade, integridade e evidence record.
6. Primeiro uso: Home empty → Portfolio import → Plan setup → Home healthy. Nenhuma ação financeira é automática.

## 9. Wireframes

### Desktop

```text
┌ sidebar ─────┬──────────────────────────────────────────────────┐
│ Syntrake     │ eyebrow · page title              data freshness│
│ Home         ├──────────────────────┬───────────────────────────┤
│ Portfolio    │ primary headline     │ compact supporting state  │
│ Plan         ├──────────────────────┴───────────────────────────┤
│ Research     │ one page-owned narrative / primary action       │
│ Activity     ├────────────────────────┬─────────────────────────┤
│              │ supporting block       │ supporting block        │
│ Settings     │                                                │
└──────────────┴──────────────────────────────────────────────────┘
```

### Mobile

```text
┌ top bar: Syntrake · freshness ┐
│ page title                     │
│ primary headline              │
│ page-owned narrative + action │
│ supporting block              │
│ supporting block              │
├ Home Portfolio Plan Research Activity ┤
```

Máximo de três blocos no primeiro viewport; nenhuma profundidade superior a um card.

## 10. Árvore de componentes proposta

```text
InvestingPrototypeShell
├─ DesktopSidebar / MobileTabBar
├─ PageHeader
│  └─ DataStatus
├─ HomePage
│  ├─ PortfolioHero + PlanStatus
│  ├─ SyntrakeNarrative
│  └─ RecentChanges + ResearchBrief
├─ PortfolioPage
│  ├─ ValueTrend + ReturnBridge
│  ├─ Allocation + Exposure
│  └─ Positions + CashMovements
├─ PlanPage
│  ├─ GoalSummary + PlanGap
│  ├─ SyntrakeNarrative
│  └─ ImpactPreview + ConfirmChange
├─ ResearchPage
│  ├─ ResearchSummary
│  ├─ StudyList
│  └─ MethodologyDisclosure
└─ ActivityPage
   ├─ ActivityFilters
   ├─ Timeline
   └─ EvidenceDrawer
```

Estados partilhados: PageSkeleton, EmptyState, ErrorState, StaleBanner e StatusChip. A narrativa Syntrake é um componente sem botão imperativo.

## 11. Design tokens necessários

- Canvas `#071018`, surface `#0C1822`, raised `#11222D`, line `#203541`.
- Text strong `#F2F6F4`, muted `#8FA3A8`, accent `#63D6B5`, info `#7BA7FF`, warning `#F2BF68`, danger `#F07878`.
- Spacing base 4; escala 8/12/16/24/32/48. Radius 10/16/24; sem radius decorativo excessivo.
- Fontes system-first; tabular nums para valores; headline 40/48 desktop e 32/38 mobile.
- Motion 160–220 ms, respeitando `prefers-reduced-motion`.
- Charts usam accent + muted; nunca dependem apenas de vermelho/verde.
- Focus ring 2 px; touch targets mínimos 44 px; contraste AA.

## 12. Componentes antigos a remover (apenas numa migração aprovada)

- `FirstValueRail` e `InvestingOperatingLoopRail` como rails dominantes.
- Cards e badges locais duplicados nas cinco tabs.
- Blocos de retention/value proof do Advisor.
- Automation Actions, System Diagnostics, Broker controls e reliability operacional do Autonomy investor-facing.
- Starter Pack duplicado entre Plan, Portfolio e Daily.
- CTAs cruzados que tentam corrigir ownership (“goDaily”, “goPlanning”, “goPortfolio”).
- Rotas/handlers legacy `/my-portfolio`, `/api/portfolio`, `/api/portfolio-meta` e `/api/portfolio/save` depois de telemetria provar ausência de uso.

Nada desta lista foi alterado nesta fase.

## 13. Plano de migração (requer aprovação explícita)

1. Congelar contratos atuais e medir requests/bundles por tab.
2. Criar read models page-owned, começando por Home, sem remover `daily-bundle`.
3. Introduzir novo shell atrás de feature flag interna e autorização de teste.
4. Migrar Portfolio e Plan; manter adapters read-only e confirmação humana.
5. Publicar Research apenas a partir de pacotes validados; sem dependência do runtime OPS.
6. Consolidar eventos em Activity e mover settings/broker para área externa.
7. Executar comparação visual, acessibilidade, performance e testes de isolamento.
8. Migração gradual; só remover tabs/endpoints antigos após telemetria, rollback e aprovação.

## 14. Orçamento técnico por rota futura

| Área | JS client máximo (gzip) | Crítico | Lazy/adiado | Requests iniciais | Charts/tabelas |
|---|---:|---|---|---:|---|
| Home | 45 KB | shell, header, portfolio headline, plan status, priority | Activity/Research briefs | 1 bootstrap + 1 home read | sparkline SVG; sem tabela |
| Portfolio | 75 KB | summary, trend, allocation, first positions page | position detail, exposure, movements | 1 portfolio read; paginação posterior | 2 SVG/canvas; tabela virtualizar só >100 rows |
| Plan | 65 KB | goal, gap, narrative, impact | scenario explorer, versions | 1 plan read | 1 allocation visual; sem tabela inicial |
| Research | 55 KB | summary, first study page | methodology, detailed evidence chart | 1 research read | charts lazy; lista paginada |
| Activity | 50 KB | filters básicos, first timeline page | evidence drawer, older pages | 1 activity read | sem chart; feed paginado |

Regras: zero import cruzado de páginas; route-level code splitting; chart library nunca na Home; payload inicial Home <35 KB JSON; restantes <70 KB; no máximo dois requests críticos após bootstrap; LCP <2,5 s em mobile médio; INP <200 ms; CLS <0,1.

## 15. Isolamento do protótipo

O protótipo vive apenas em `design/ux0-investing/`. É HTML/CSS/JS estático, usa somente dados locais nesse diretório, não é importado por Next.js, não está em `app/` nem `public/`, não tem requests de rede e não possui ligações para APIs. A sua finalidade é validar IA, hierarquia, linguagem, estados e responsividade. O ficheiro `prototype.js` inclui uma guarda que lança erro se `fetch` for invocado.
