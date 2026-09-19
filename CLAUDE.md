# CogniVault — guia rápido para trabalhar neste repositório

Catálogo técnico + orçamento de balcão para a Vardão Máquinas, revenda autorizada
ouro Husqvarna. Único público real: atendente/balconista/vendedor de balcão.
Não existe fluxo de oficina mecânica nem papel de "mecânico" no produto — veja
"Papéis de usuário" abaixo antes de propor qualquer feature nessa linha.

## Restrição permanente: custo zero

O dono não quer pagar por upgrade de plano nem por dependência nova paga, em
nenhuma circunstância, a menos que peça explicitamente. Toda melhoria de
performance/confiabilidade deve caber nos planos free já em uso:
Render (backend, free), Vercel (frontend), Supabase (Postgres, free),
CloudAMQP "Little Lemur" (RabbitMQ, free), GitHub Actions (repo público,
minutos ilimitados).

## Infra real (não adivinhar, checar antes de mudar)

- **Backend**: Render, serviço `cognivault-api` (srv-da86l9s9v7es73eq5b9g),
  `cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`,
  start `npm start`, health check `/health/live`.
- **Frontend**: Vercel, mesmo domínio via rewrite (same-origin com a API).
- **Banco**: Supabase Postgres. Projeto free pausa sozinho depois de ~7 dias
  *sem nenhuma consulta ao Postgres* — não confundir com o sleep do Render
  (15 min de inatividade HTTP, problema diferente). `.github/workflows/keepalive.yml`
  **tenta** cobrir os dois pingando `/health` (que consulta o banco de
  verdade), mas o cron do GitHub Actions é best effort: agendado para 10 min,
  medido rodando a cada 2–8 **horas** (11 cold starts em 22 h nas métricas do
  Render). Ele é rede de segurança — irregular, ainda acorda o banco algumas
  vezes por dia e cobre a pausa de ~7 dias do Supabase. O que segura o sleep de
  15 min do Render é um agendador externo; passo a passo em
  `docs/MANTER_SERVIDOR_ATIVO.md`.
- **Fila**: CloudAMQP, plano Little Lemur. Confirmado saudável (baixo uso,
  reconecta sozinho a cada deploy). "Max Idle Queue Time: 28 dias" nunca é
  risco real porque o `/health` já mantém a conexão viva.
- **Raiz do monorepo** declara `"workspaces": ["frontend"]` (decisão
  deliberada, ver commit `eb29851`, para o skip-unaffected do Vercel) — mas
  **não existe lockfile na raiz**. Qualquer `npm ci`/`npm audit` rodado de
  dentro de `frontend/` sem `--workspaces=false` falha com um erro confuso
  ("ENOLOCK"/"loadVirtual"). O CI já usa essa flag em todo lugar; ao testar
  manualmente, sempre `npm ci --workspaces=false` / `npm audit --workspaces=false`.

## Comandos

- Backend typecheck: `cd backend && npx tsc --noEmit`.
- Backend build+test real: `cd backend && npm test` (roda `tsc` e depois
  `node --test dist/**/*.test.js` — precisa de build passar primeiro).
- Backend não tem `npm run lint` (não há ESLint configurado lá; `tsc` é o
  único gate de tipo).
- Frontend: `cd frontend && npm run lint && npm run build`.
- E2E: `frontend/e2e/*.spec.mjs` via Playwright, sobem backend+frontend reais
  com Postgres de teste (só roda de ponta a ponta em CI/local com Docker;
  neste sandbox não há `DATABASE_URL`, não dá pra rodar completo).

## Limitações conhecidas de ambiente sandbox (não são bugs do projeto)

- **`xlsx` bloqueado**: a dependência `xlsx` (`https://cdn.sheetjs.com/...`)
  não instala em sandboxes com egress restrito (403 do proxy). Workaround
  já usado várias vezes: remover `xlsx` de `backend/package.json` via script
  Python, `npm install`, rodar o que precisa, depois
  `git checkout -- backend/package.json backend/package-lock.json`. Só
  `import-price-list.ts` e `xlsx-runtime.test.ts` dependem dele — os 2 erros
  de `Cannot find module 'xlsx'` nesse cenário são sempre esperados e não
  indicam regressão real.
- **Sem `DATABASE_URL`/credenciais Supabase reais em sandbox**: ~10 testes
  de backend falham só por isso (erro literal "Environment variable not
  found: DATABASE_URL" ou "Chaves do Supabase não encontradas"). Confirmar
  sempre a mensagem de erro exata antes de assumir que é regressão — nunca
  assumir, sempre rodar e ler o erro.
- **Rede egressa restrita**: domínios fora da allowlist do proxy (ex.:
  `portal.husqvarnagroup.com`, `parceirohusqvarna.com`) não são alcançáveis
  daqui. Testes que dependem do Portal Husqvarna real devem usar
  `page.route()` do Playwright para mockar a resposta em vez de depender da
  rede — ver `frontend/e2e/machines.spec.mjs` como exemplo.

## Regras de negócio já confirmadas (não redescobrir, não "corrigir" sem evidência nova)

- **Preço comercial**: `backend/src/scripts/price-list-rules.ts`,
  `COMMERCIAL_PRICE_DIVISOR = 0.92`. Preço de venda = PREÇO CONSUMIDOR do
  Portal Parceiro Husqvarna ÷ 0.92 (~+8,7%). Confirmado com print real do
  proprietário (R$ 22,00 → R$ 23,91). **Nunca mudar este valor com base só
  em descrição verbal** — já errei isso uma vez nesta base de código
  (trocado para 0.952381 por engano, revertido). Só mudar com evidência
  concreta nova (print, planilha).
- **Portal Parceiro Husqvarna** (`parceirohusqvarna.com`, o portal de
  compra/pedido de verdade) é diferente do **Portal Husqvarna público**
  (`portal.husqvarnagroup.com`, catálogo de leitura, usado pela integração
  GraphQL). O Parceiro desloga sozinho em 1-2 min de inatividade — dono
  decidiu conscientemente NÃO automatizar login lá (nem sessão reaproveitada,
  nem credencial guardada no servidor). Só um botão manual "abrir em nova
  aba + copiar código". Não reabrir essa discussão sem o dono pedir.
- **Papéis de usuário**: enum Prisma `Role { ADMIN, MECHANIC }`. `MECHANIC`
  é só o nome técnico interno (coluna do banco, claim do JWT) — na prática é
  balconista/atendente/vendedor, o único tipo de usuário operacional do
  produto. A UI já traduz certo em todo lugar visível ("Balcão"). Não existe
  e não deve existir um terceiro papel nem um fluxo de "oficina" separado a
  menos que o dono peça explicitamente. Renomear o enum tocaria uma coluna
  real do banco de produção — não fazer sem o dono confirmar que quer isso
  (o custo/risco não compensa um rótulo que já está certo na tela).

## Integração Husqvarna — o que já existe

- **GraphQL público** (`services/husqvarna-portal-graphql.service.ts`,
  `services/husqvarna-official-detail.service.ts`,
  `services/husqvarna-product-search.service.ts`): busca de máquina/peça por
  PNC, detalhes completos (specs, documentos, variantes, features,
  acessórios, "também usado em", vista explodida com posições clicáveis).
  Cache em duas camadas: LRU em memória (perde no restart) e
  `OfficialSourceCacheService` persistente no Postgres (sobrevive a
  restart, stale-while-revalidate).
- **Scraper HTML** (`services/husqvarna-scraper.service.ts`) é só fallback
  quando o GraphQL não responde — não traz nenhum dado que o GraphQL já não
  tenha.
- **Preço nunca vem da API da Husqvarna** — só do Portal Parceiro (manual)
  ou da planilha de preços importada (`master_parts`/`import-price-list*`).
- **Documentos técnicos (corrigido em 2026-09-18).** O gap antigo registrado
  aqui dizia que os links eram descartados. Medido: era mais estreito do que
  parecia. O **painel completo** (`husqvarna-official-detail.service.ts` +
  `OfficialHusqvarnaPanel`, aba Documentos) sempre entregou os documentos com
  data e selo "mais recente". O que estava morto era só a **consulta rápida**:
  `extractProductDetailsSummary` guardava apenas `productDocumentCount` /
  `iplDocumentCount` (contagens que nenhum código de produto lia) e
  `officialFallback` respondia `documents: []`.
  Agora `extractProductDetailsSummary` devolve `documents`
  (`HusqvarnaQuickDocument`), a rota expõe, e o painel da máquina mostra uma
  faixa de atalho (`OfficialDocumentShortcuts`). **Custo zero**: a query GraphQL já
  pedia `url`/`publicationTitle`/`fileFormat` e a carga já estava em cache.
  Ordem é PT primeiro, depois `OM` (manual) antes de `IPL` — é o que o balcão
  abre toda hora.
- **URL vinda do Portal passa por `utils/husqvarna-url.ts`.** Só `https` e só
  domínio Husqvarna (`husqvarnagroup.com`, `husqvarna.com`, `aprimocdn.net`).
  Esse dado vira `href` na tela do balcão, então `javascript:`/`data:`/domínio
  de terceiro têm que morrer no servidor. `isHostOrSubdomain` compara com o
  ponto separador de propósito: `endsWith` cru aceitaria
  `husqvarnagroup.com.atacante.net`. A função estava duplicada em dois serviços
  e agora é importada dos dois. `safeHusqvarnaAssetUrl` só resolve caminho
  relativo quando começa com `/` — antes, um valor não-string virava
  `https://portal.husqvarnagroup.com/42`, link válido feito de lixo.

## Atendimento e máquinas são UMA tela (a aba Máquinas não existe mais)

Até 2026-09-19 havia duas abas para a mesma pergunta do balcão, e o dono disse
o que isso custava: *"nem eu entendi o que muda da aba atendimento e da aba
máquinas"*. Hoje o atendente escreve num campo só e recebe peça **e** máquina.

- **A busca oferece máquina quando o texto traz identificador de máquina.**
  A regra é `backend/src/utils/machine-query.ts`, e ela é conservadora de
  propósito nos dois sentidos:
  - **Modelo**: token com letra E dígito (`143RII`, `TS142`, `LC121P`). Hífen
    é **recusado** — é assinatura de código (`15004-0937`, `104M02-0002-F1`), e
    aceitá-lo faria toda busca por código disparar chamada externa inútil.
  - **PNC de etiqueta**: exige máscara com espaço (`967 17 65-01`) **E** prefixo
    9. As duas juntas, porque cada uma sozinha erra: código de peça usa a mesma
    máscara (`587 10 67-01`, que `looksLikeExactPartCode` já trata como código)
    e PNC colado é indistinguível de um código de 9 dígitos. O prefixo 9 é a
    regra que `normalizeHusqvarnaPnc` já usava.
  - **Descrição pura não gasta nada**: "carburador", "junta", "filtro de ar"
    não produzem consulta externa. Medido no navegador: zero chamadas.
  Travado em `machine-query.test.ts`, incluindo o lado negativo.
- **O stream só ANUNCIA; a tela busca.** `searchStream` manda
  `{ type: 'machines', machineTerm | machinePnc }` sem tocar no Portal. Duas
  razões: o `done` do stream não pode esperar o Portal (teto de 8s, e a peça já
  está na tela desde a fase léxica), e a busca de máquina do cliente
  (`useOfficialMachineSearch`) usa a mesma chave de cache, então o Portal é
  consultado uma vez por modelo, não uma por tela.
- **`typed` é o texto digitado; `q` leva o contexto anexado.** A tela manda os
  dois. Bug real já cometido: com só `q`, `967 33 29-04` chegava como
  `967 33 29-04 Husqvarna 143R-II` e deixava de ser reconhecido como PNC.
  `typed` é validado com o mesmo teto de `q` porque ele decide uma chamada
  externa.
- **`fast-search` delega quando o texto é PNC de etiqueta.** Sem isso ele
  respondia (a máscara casa `looksLikeExactPartCode`) e a fase de máquinas
  nunca rodava. Código de peça com máscara continua indo pelo caminho rápido.
- **O painel lateral é `MachineSidePanel` + `MachineDetail`**, largo (980px)
  porque a vista do carburador tem mais de 20 posições — em 320px o zoom não
  salva, não há para onde arrastar. `MachineDetail` é o único dono da consulta
  `['official-machine', pnc]`: **não crie uma segunda `queryFn` com essa chave**
  (já aconteceu, e o React Query usa a que montou primeiro — comportamento
  dependente da ordem de render).
- **PNC colado (9 dígitos) não abre máquina por formato.** Quando
  `officialFallback` responde `kind === 'PRODUCT_CATALOG'`, a Husqvarna
  confirmou, e só então aparece "Abrir vista explodida". A mesma checagem impede
  que um código de peça abra a tela de máquina vazia.
- **Links antigos continuam valendo**: `?tab=machines&pnc=` abre o painel no
  Atendimento, `?tab=machines&search=` cai na busca unificada. `'machines'` não
  existe mais em `Section`.
- **`OfficialHusqvarnaPanel` não recarrega a página.** `onOpenPnc` e
  `onOpenPart` são **obrigatórios**; havia `window.location.assign` como
  fallback, e dentro de um painel lateral isso derrubava a busca e o
  atendimento abertos.

## IA (Gemini)

- Modelo: `gemini-3.7-flash` (extração de PDF, interpretação de chat,
  embeddings). Configurável via env, ver `backend/src/config/gemini.ts`.
- **Feedback do atendente (👍/👎) é real, não decorativo**: entra no
  ranking de busca via `feedback-learning.ts`/`confidence-gate.ts`. Não
  assumir que é só um painel de leitura antes de verificar o código.
- Sem fine-tuning (não faz sentido pra esse porte de app). As alavancas
  reais são prompt engineering e o `confidence-gate.ts` (scorer manual,
  bem ajustado, com comentários explicando casos de borda).
- Recurso construído mas inerte: embedding de feedback
  (`ENABLE_FEEDBACK_EMBEDDINGS`, default `false`) — vetor é calculado e
  guardado mas nada lê ele de volta pro ranking. Terminar essa ligação ou
  descartar, mas não deixar comentado como se fosse produção.

## Antes de "consertar" algo que parece estranho

Este projeto já passou por vários ciclos de limpeza de código morto
(backend inteiro + frontend inteiro, controllers/routes/middleware/scripts
incluídos). Se algo parecer sem uso, ainda assim confirme com grep no
repositório inteiro — incluindo `.github/workflows/*.yml`, que scripts como
`backend/src/scripts/audit-portal-models.ts` só são chamados por lá, não por
outro arquivo `.ts`. Uma varredura anterior já teve um falso positivo exatamente
por não checar os workflows.

## Identidade visual (redesign de 2026-09-18)

A referência é o site de loja **`vardaomaquinas.com.br`**, não um gosto novo. A
paleta e a tipografia foram extraídas do CSS computado da página, em desktop
1440x900 e mobile 390x844, e estão registradas em
`docs/IDENTIDADE_VISUAL_VARDAO.md` com a evidência de cada valor. O próprio site
declara `--brand: #273a60`, `--brand-darker: #1f2742`, `--accent: #f25420`,
fonte **Roboto Flex**.

Os tokens vivem em dois lugares e devem andar juntos:
`frontend/tailwind.config.js` (escalas `brand`, `accent`, `gold`, `ink`) e
`frontend/src/index.css` (variáveis `--cv-*` e as classes `cv-*`).

Regras que não são estética, são operação de balcão:
- **Laranja `#f25420` é ação, não decoração.** Fundo e navegação ficam em
  azul-marinho/neutro. Espalhar laranja destrói a hierarquia justamente na tela
  onde o atendente procura o botão certo com o cliente esperando.
- Texto laranja sobre fundo claro é sempre `accent-700` (`#c13d0a`, 5,3:1).
  `#f25420` em texto normal reprova AA (3,5:1) — só serve em rótulo grande e
  negrito, que é como o site usa.
- A paleta antiga (`#1d4f91`, `#123867`, `#0b1d3a`, dourado `#e2ae47`, fonte
  Inter) **não existe mais**. A varredura foi mecânica, cor por cor, e
  `slate-*`/`blue-*` do Tailwind viraram `ink-*`/`brand-*` em todo o front-end.
  Ao mexer em componente antigo, use os tokens; não reintroduza hex solto.
- `ink-*` tem uma virada de matiz deliberada entre 700 e 800 (claro = neutro
  quente do site; escuro = azul-marinho da marca). Está comentado no
  `tailwind.config.js`; não "conserte" isso.
- Breakpoint extra **`tablet: 820px`**: o aparelho do meio no balcão é um tablet
  10". `sm`/`md` do Tailwind não pegam retrato de 10" da forma que esse layout
  precisa.
- `.cv-touch-target` (44px) é o piso de alvo de toque. Dedo com luva de oficina
  não acerta botão de 28px.
- **Opacidade em cor de texto é proibida** (`text-brand-100/70`, `text-white/80`).
  Use o degrau da escala que já tem o contraste. Foi o defeito que a varredura
  de 28 arquivos corrigiu, e ele voltou no painel do login porque lá o fundo é
  escuro e escapou daquela passagem: `brand-100` a 70% sobre `brand-600` nascia
  em 5,31:1 e caía para **4,51:1** com a marca d'água a 7% por trás — passava AA
  por 0,01. `brand-200` cheio dá 7,23:1 limpo e 5,87:1 sobre a marca, e continua
  secundário. O mesmo caso estava no cabeçalho da gaveta de orçamento.
- **Marca d'água grande se dimensiona pela ALTURA, não pela largura.** O símbolo
  do login era `w-[min(78%,560px)]`, o que num painel de 754x900 virava 669px de
  altura (74% da tela) e encostava em tudo — a faixa de autorização entrava 32px
  dentro dele. Com `h-[min(52vh,440px)]` a folga não fecha em nenhuma altura de
  janela (131px em 900, 85px em 768, 57px em 650); com largura em px isso não era
  verdade.

## Orçamento de balcão é dado de banco (não mais localStorage)

Até 2026-09-17 a cesta e o histórico viviam só no `localStorage` do navegador de
cada atendente: limpar o navegador ou trocar de aparelho apagava tudo, e o dono
não tinha visão consolidada nenhuma. Agora:

- Modelos `Quote` + `QuoteItem` (`backend/prisma/schema.prisma`), migração
  `20260917220000_counter_quote_persistence`.
- `QuoteStatus.DRAFT` é a cesta aberta e `SAVED` é o orçamento arquivado.
  **Um único DRAFT por atendente**, garantido pelo índice parcial
  `Quote_one_draft_per_user` criado na migração — o Prisma não expressa índice
  parcial, então ele não aparece no `schema.prisma`. Sem esse índice, duas abas
  ou um retry de rede criariam cestas paralelas.
- `QuoteService.saveQuote` **não promove** o rascunho: o balcão continua
  atendendo com a mesma cesta depois de mandar o PDF/WhatsApp. Promover apagaria
  a cesta debaixo do atendente.
- `PUT /api/quotes/draft` substitui o estado **inteiro** (idempotente), não um
  delta por clique. Com Render free e rede de loja instável, um delta perdido
  deixaria a cesta divergente sem ninguém notar.
- O `localStorage` continua, agora como **cache offline**: hidrata a tela na
  hora e segura o atendimento quando a API está fora. O `syncState` do
  `QuoteCartContext` aparece na gaveta ("No servidor" / "Só neste aparelho") —
  o atendente precisa saber se pode trocar de aparelho.
- Dinheiro é `Float` de propósito (a origem, `MasterPart.price`, também é), e
  todo valor passa por `roundMoney` no servidor. **Total nunca vem do cliente**:
  é recalculado de quantidade × preço, senão um campo editável na tela do balcão
  viraria a fonte de verdade do painel do dono.
- Papéis: Balcão vê e mexe só no que ele atendeu; Admin vê a loja inteira.
  Continua sem terceiro papel.

## Dias comerciais são no fuso da loja, nunca do servidor

`backend/src/utils/store-day.ts`. **Bug real, já cometido e corrigido nesta
base:** o painel usava `new Date('2026-09-18')` + `setHours(23,59,59,999)`. A
string é parseada como meia-noite **UTC** e o `setHours` aplica o fuso **do
processo** — em UTC-3 o filtro "até hoje" terminava às 23:59 de *ontem* e o dono
não via nenhum orçamento do próprio dia. O Render roda em UTC, a loja não.

Use `startOfStoreDay` / `endOfStoreDay` / `todayInStore` / `shiftStoreDay` em
qualquer filtro de período. O agrupamento em SQL também converte antes de
truncar (`"savedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`), e o
front formata o rótulo com `timeZone: 'UTC'` porque o valor já chega como hora
de parede da loja. Regressão travada em `src/utils/store-day.test.ts`.

## Painel do dono é separado do painel técnico

`GET /api/admin/business-insights` + `frontend/src/components/BusinessPanel.tsx`
(seção "Negócio"). Só entra pergunta comercial: quanto foi cotado, peça mais
cotada, peça sem preço cadastrado, atividade por atendente. Saúde de catálogo e
uso de IA continuam em "Visão geral" e "Qualidade" — não misturar.

A série temporal é barra em CSS puro. Não entre biblioteca de gráfico: seria
dependência nova, e o dono compara volume entre dias, não faz estatística.

## Exportação

`GET /api/admin/exports/quotes.csv` e `/price-list.csv` (admin). CSV e **não**
`.xlsx`, mesmo com `xlsx` já no `package.json`: aquele pacote não instala em
sandbox com egress restrito (ver "Limitações conhecidas") e travaria o dev local
por um ganho nenhum — o CSV abre com duplo clique no Excel.

Dois detalhes que são a diferença entre "abre" e "veio tudo embolado na coluna
A", em `services/csv-export.ts`: separador `;` (o Excel pt-BR usa ponto e vírgula
como delimitador de lista) e **BOM UTF-8** (sem ele "Óleo" vira "Ã“leo"). Número
decimal sai com vírgula. Célula começando com `=`, `+`, `-` ou `@` recebe
apóstrofo, para planilha exportada não executar fórmula ao abrir.

A exportação é **streaming com paginação por cursor**: a lista de preços tem
dezenas de milhares de linhas e o Render free tem pouca memória.

## Guard de SQL: `source-safety.test.ts` casa por texto

`backend/src/utils/source-safety.test.ts` proíbe as variantes "Unsafe" de
`queryRaw`/`executeRaw` em todo `src/`. O casamento é por **regex no texto do
arquivo**, então o nome proibido não pode aparecer nem dentro de comentário —
já perdi um ciclo de teste por explicar a regra usando o próprio identificador.
Quando precisar variar SQL por parâmetro (ex.: `date_trunc` por dia/semana/mês),
escreva as variantes por extenso em `$queryRaw`, como em
`services/business-insights.service.ts`.

## Validar migração e endpoints sem tocar em produção

O `.env` do backend aponta para o Supabase **de produção**. Não rode
`migrate deploy` nem suba o backend contra ele para testar. A migração entra em
produção pelo build do Render, que já roda `prisma migrate deploy`.

Para validar de verdade, suba um PostgreSQL descartável (existe PostgreSQL 18 em
`C:\Program Files\PostgreSQL\18\bin`, com o serviço parado — não precisa
iniciá-lo):

```
initdb -D <tmp>/pgdata -U postgres --pwfile=<arquivo> -E UTF8 --locale=C
pg_ctl -D <tmp>/pgdata -l <tmp>/server.log -o "-p 54329" start
```

Use caminho **curto** (ex.: `%LOCALAPPDATA%\Temp\cvpg-data`): o `initdb` falha
com "No such file or directory" em caminho longo do Windows. `pgvector` não está
instalado nessa máquina, então para gerar o schema inteiro troque
`vector(768)` por `text` no DDL do `prisma migrate diff` — nenhum endpoint de
orçamento toca coluna de embedding. Foi assim que o bug de fuso acima apareceu
antes de ir para produção.

## PDF: a recusa da leitura textual agora diz o motivo

`services/catalog-extractor.ts`. O pipeline é de dois estágios — parser
determinístico por regex (grátis, código exato) e, se ele recusar, leitura
visual com Gemini (custa e é onde mora risco de código errado).

**Recusar é decisão de projeto, não defeito**, e os testes travam isso:
tabela pequena ou PDF sem assinatura de IPL vira falso positivo com facilidade,
e um catálogo extraído errado envenena a busca inteira. Não baixe
`MIN_CATALOG_OCCURRENCES` (10) sem evidência nova.

O que faltava era saber *qual* porta fechou em cada catálogo.
`analyzeHusqvarnaIplText` devolve `DeterministicResult` com
`DeterministicDeclineReason` (`NO_TEXT_LAYER`, `NO_SIGNATURE`, `NO_MODEL`,
`NO_ROWS`, `TOO_FEW_OCCURRENCES`); `parseHusqvarnaIplText` continua sendo a
porta simples (extração ou `null`) e os 7 arquivos de teste do extrator seguem
válidos. O motivo é gravado em `Document.extractionFallbackReason` (migração
`20260918030000_document_extraction_fallback_reason`) e agregado em
Qualidade → Técnico → "Por que caíram na leitura visual".

Como ler o painel: `NO_SIGNATURE` e `NO_ROWS` são **lacuna do parser** — vale
ensinar aquele formato, e cada catálogo movido para leitura local passa a sair
exato e sem consumir IA. `NO_TEXT_LAYER` é limite do arquivo (digitalizado), e
leitura visual é o caminho certo mesmo. `NO_MODEL` costuma se resolver
informando o modelo no upload e reprocessando.

Coluna anulável e sem backfill: catálogo antigo fica `NULL`, que significa
"processado antes deste registro" (aparece como `UNKNOWN` no painel), e **não**
"o parser funcionou" — quem diz qual caminho foi usado é `extractionMethod`.

## O código da peça nunca sai da imaginação da IA

Regra do dono, dita com estas palavras: *"meu medo é ela não ter certeza do
código da peça e mandar qualquer um"*. É o campo onde errar custa devolução no
balcão, e é por isso que a leitura textual recusa PDF duvidoso em vez de chutar.

**Lacuna encontrada e fechada em 2026-09-18.** A base já tinha a regra do que é
código malformado (`code.length < 4 || > 18 || dígitos < 3`), mas ela só contava
`malformedPartNumberCount` para a *nota de saúde* — **depois** de a peça já estar
gravada e pesquisável. Modelo e PNC eram validados na gravação
(`isPlausibleCatalogModel`, `normalizeHusqvarnaPnc`); o código da peça, não.

Agora a regra mora em `utils/part-number.ts` (`isPlausiblePartNumber`), é usada
pelo `catalog-health.ts` **e** barra a gravação em `ai.service.ts`. O critério
não mudou — mudou o momento.

- **Permissiva com marca de propósito**: o catálogo tem Husqvarna (9 dígitos),
  Briggs (5–6, ex.: `27911`, `794653`), Kawasaki e Kohler. Exigir o padrão
  Husqvarna derrubaria peça legítima de motor. O piso mira só no que nunca é
  código: posição (1–3 dígitos) e quantidade.
- **Descarte não é silencioso**: o total vai para `Document.extractionRejectedParts`
  e aparece em Qualidade → Técnico ("Códigos barrados na gravação"), com amostra
  e motivo no log. Número alto ali = catálogo lido errado, conferir no PDF.
- Não use `active: false` para isso: aquele campo é aposentadoria de peça que
  saiu do catálogo, e o reprocessamento reativa (`data: { active: true }`),
  o que desfaria o bloqueio.

Duas complicações de domínio que o dono confirmou e que **não** são erro de
extração — são realidade do catálogo, e o produto já as trata:
- **Mesma peça, código diferente por PNC** da máquina (ex.: carburador Latin
  America da 143RII). Por isso a identidade da peça inclui o PNC
  (`buildPartIdentity`) e o benchmark tem caso dedicado.
- **Substituição**: código novo que substitui o antigo
  (`part-supersession.ts`, `husqvarna-replacement-history.service.ts`).

## Motores de outras marcas nos cortadores/tratores Husqvarna

Cortador e trator Husqvarna vêm com motor de terceiro (Briggs & Stratton,
Kawasaki, Kohler). O catálogo desses motores tem numeração própria, e o
`MACHINE_ENGINE` em `services/husqvarna-domain-knowledge.ts` liga máquina ↔
motor (ex.: `J55SL` → `Motor Briggs 12J902-0118-01`, `LC121P` → `104M02-0002-F1`).

### Briggs & Stratton — formato do número de modelo

Fonte: página "Find Your Manual or Parts List" da própria Briggs
(`briggsandstratton.com/en-us/support/manuals`), print do proprietário de
2026-09-18:

```
Engine:  0XXXXX-XXXX      (modelo de 5 dígitos)*
         XXXXXX-XXXX      (modelo de 6 dígitos + tipo)
         XXXXXX-XXXX-XX   (modelo + tipo + código)
* "5-digit model numbers will have a leading zero."
"Dashes are required after first 6 digits when entering model number."
```

### A Briggs tem API pública (corrigido em 2026-09-19)

Esta seção dizia que a Briggs "não tem API pública equivalente ao GraphQL da
Husqvarna" e que o link do IPL era indeduzível. **As duas coisas estavam
erradas**, e o dono viu o sintoma antes de mim: *"o que fizemos na briggs nao
deu certo"*.

A lista da página de resultados é montada por JavaScript a partir de:

    GET briggsandstratton.com/_hcms/api/manual-search?partNumber=<modelo>

Índice Azure Search, JSON, **sem chave e sem login**. Ela devolve `tc_DocType`
(`Illustrated Parts List` vs `Operator's Manual`), `tc_LanguageCode` e
`tc_RelativePath`, e o PDF abre em
`thepowerportal.com/ipls/ipl.htm?md=<tc_RelativePath com ~ literal>`.
Código: `utils/briggs-manuals.ts` + `services/briggs-manuals.service.ts`,
rota `/api/briggs/parts-manuals/open`.

**A "contradição" do idioma não era contradição.** Estes dois exemplos estavam
registrados aqui como prova de que o link era indeduzível:

    103M02-0027-H1  ->  md=103M020027H1~ZH_IPLURL_LO.pdf   (chinês)
    12J902-0118-01  ->  md=12J902011801~_IPLURL_LO.pdf     (idioma VAZIO)

Medindo 8 modelos: o segmento é o código do idioma (`ZH` chinês, `JA` japonês,
**vazio** inglês), e o `103M02-0027-H1` simplesmente **não tem IPL em inglês**.

Mesmo assim, **não deduza esse segmento**. O caminho vem da resposta da API, e é
isso que faz a diferença entre uma fonte e um palpite.

**A lição que vale além deste caso.** A validação antiga registrada aqui dizia
"a URL gerada devolveu 16 resultados reais" — e estava certa e inútil ao mesmo
tempo. Os dois `PARTS MANUAL` ficavam em ÚLTIMO, depois de 14 linhas chamadas só
`MANUAL, ILLUSTRATED`, sem modelo nem número para distinguir. **"Respondeu 200"
não é evidência de que serve ao balcão**; o teste é se o atendente chega ao
documento certo sem caçar.

Preferência do dono, nas palavras dele: *"SEMPRE VOU DAR PRIORIDADE PRO INGLÊS,
mas se não tiver o inglês e outra língua eu tenho que abrir igual para ver o
código e ver o preço."* Os dois casos estão travados em teste.

### Kawasaki não tem link profundo, e isso é deliberado

Medido: a URL de um conjunto carrega **dois GUIDs**
(`.../FX921V-ES06_4_Stroke_Engine_FX921V/*KITS_GASKET.../63e707fb-…/97b0edbd-…`),
e abrir o endereço só com o modelo devolve a página genérica de busca, sem a
grade de conjuntos. Então `kawasakiPartsLookupUrl()` aponta para
`kawasakienginesusa.com/parts-lookup` e o atendente cola o modelo, que
`formatKawasakiModelForSearch` devolve pronto.

O modelo Kawasaki é **série + spec** (`FX921V-ES06`), e vem da **plaqueta do
motor** — o Portal Husqvarna não informa (veja a seção abaixo).

**E não é só o link profundo que falta — a Kawasaki não dá para integrar**, ao
contrário da Briggs. Medido em 2026-09-19: a lista de peças vive no ARI
PartStream com uma app key que pertence ao site deles; a página do localizador
roda **reCAPTCHA** (`POST /api/verify-captcha` no carregamento); e o `/manuals`
público só tem manual do proprietário, por série, com a própria página mandando
procurar o revendedor para o manual de serviço. Não procure um endpoint: ele não
existe em acesso público, e a presença de reCAPTCHA é uma recusa explícita a
acesso automatizado.

**`hasKawasakiEvidence` não é redundante.** `formatKawasakiModelForSearch`
reconhece `LC121P` e `LB155S`, que são cortadores **Husqvarna** — o padrão
`[A-Z]{2}d{3}[A-Z]` é o mesmo dos dois fabricantes. Sem a guarda, um cortador
Husqvarna ganharia botão de "Catálogo Kawasaki", que é mandar o atendente ao
catálogo errado. A decisão exige a marca dita no `manufacturer` ou no nome do
arquivo; sem isso, não há botão — e não ter botão é o resultado correto.

## Portal Husqvarna: identidade de 9 dígitos e o campo `comment`

Duas descobertas medidas **contra a API real**, pelo navegador embutido (o
terminal do sandbox não alcança `portal.husqvarnagroup.com`, mas o navegador
sim — não precisa de allowlist).

### O artigo tem 9 dígitos, sempre

    articles.byIds  articleId '96041044000'  (11 díg.) -> null
    articles.byIds  articleId '960410440'    (9 díg.)  -> "HUSQVARNA TS 142"
    search.content  searchTerm '96041044000'           -> lista VAZIA
    search.content  searchTerm '960410440'             -> TS 142

Conferido em 8 máquinas de 5 categorias — 143R II `967332901`, 272 XP
`965681601`, LC 121P `961330027`, LC 353AWD `970450102`, HU725AWDH
`961430127`, Z460 `967984802`, TS 142 `960410440`, TS 148 `960410441` —
**todos com exatamente 9 dígitos**. Nenhum id com mais de 9 responde.

Regra do dono: *"tem algumas máquinas que não utilizam os 2 últimos números,
como no caso do TS142, já outras utilizam todos"* — ou seja, a etiqueta às vezes
traz 11 dígitos e o portal usa só os 9 primeiros; às vezes ela já traz 9.
`utils/husqvarna-article-id.ts` cobre os dois: com 9, usa como veio; acima de
9, tenta o prefixo de 9 e depois o número cheio. Abaixo de 9 **não completa com
zero** — isso consultaria outra máquina.

Antes disso, os três pontos de consulta validavam `/^\d{8,14}$/` e passavam o
número como veio: toda máquina de etiqueta longa devolvia vazio e o painel
oficial sumia sem dizer o motivo.

### `ipls { articles { comment } }` era pedido e jogado no lixo

O campo chegava da API, era copiado para o tipo e **nada lia**. É ele que
carrega, em texto, a cadeia que o balcão percorre à mão:

    "For 96041043000. HUSQVARNA MODEL NO. HS608 (COMPLETE IPL AVAILABLE SEPARATELY)."
    "For 96041036800, ... Engine Briggs Model No. 31R577-0027-B1 (587333501)."
    "ENGINE B&S MODEL NO. 44N677-0065-G1 (529581901)"
    "FOR ENGINE: 598693901"          <- decide entre os dois carburadores
    "CARBURETTOR GASKET - MULTIPACK: 10"
    "Kawasaki - See Engine Model & Spec."

`utils/husqvarna-ipl-comment.ts` lê isso. Cadeia provada ao vivo:

    TS142 + PNC 96041044000 -> motor 598693901 -> carburador 599349108
    TS142 + PNC 96041043000 -> motor 593230101 -> carburador 599349109

**Três realidades diferentes**, e a diferença é de projeto:

- **Husqvarna própria** — o texto dá o modelo (`HS608`; o TS 148 escreve
  `HV 764cc`, **com espaço**, e a primeira versão do parser capturava só `HV`).
- **Briggs / B&S** — o texto dá modelo **e** artigo. É o que faltava para o
  link do manual.
- **Kawasaki** — o portal **não dá o modelo**: só `"Kawasaki - See Engine Model
  & Spec."`. Por isso existe `engineModelOnPlate`, e por isso o
  `ENGINE_APPLICATIONS` **deve continuar** existindo para Kawasaki: ali o mapa
  não duplica a API, supre o que ela não tem.

`multipackQuantity` vale **só para o item que traz o texto** — correção
explícita do dono. No HS 608 o carburador e a junta são itens separados na
vista: **o carburador não vem com a junta**. Ler "CARBURETTOR GASKET -
MULTIPACK: 10" como "o carburador acompanha 10 juntas" seria vender errado.

**Preço não vem do portal em nenhuma hipótese** — o dono confirmou que fica
apagado até logado. Preço é Portal Parceiro ou planilha, como já dizia acima.

### O zero à esquerda era falha real de busca

`normalizeIdentifier` já remove traço e espaço, então `103M02-0027-H1`,
`103M02 0027 H1` e `103M020027H1` convergem sozinhos. O zero, não: a busca de
peça filtra `normalizedModel` por **igualdade exata**
(`part-search.service.ts`), então `9D9020027H1` e `09D9020027H1` são o mesmo
motor e não se achavam.

`utils/engine-model.ts` (`engineModelVariants`) resolve expandindo o filtro para
as duas formas nos três pontos de filtro por modelo. A expansão **só acrescenta
candidato, nunca remove** — variante inexistente simplesmente não casa com nada,
e por isso ela é segura mesmo quando o palpite de formato erra. O teste
`engine-model.test.ts` trava também o lado negativo: modelo Husqvarna
(`143RII`, `Z460`, `LC353AWD`, `272XP`) não pode ganhar variante.

Baseado na regra publicada pelo fabricante, **não** num catálogo de 5 dígitos
observado na base — se aparecer um, confirme que a busca acha nas duas formas.

## Motor Briggs: link de busca no site (o caminho antigo, ainda em uso)

Esta seção descrevia o único caminho que existia até 2026-09-19 e dizia que a
Briggs "não tem API pública equivalente ao GraphQL da Husqvarna". **Isso está
corrigido acima** ("A Briggs tem API pública"): a rota
`/api/briggs/parts-manuals` traz o link exato do IPL, e
`/api/briggs/ipl-parts` traz as peças lidas do PDF.

O que continua valendo aqui é o link de **busca** no site da Briggs, montado
por `utils/engine-model.ts` (`briggsManualsSearchUrl`), usado na tela de
Catálogos. `formatBriggsModelForSearch` converte o modelo guardado
(`Motor Briggs 104M02-0002-F1`, às vezes com sufixo `(Cortador X)`) para o
formato exato que `briggsandstratton.com` exige na busca — mesma regra de
traço/zero-à-esquerda documentada acima em "Motores de outras marcas".

**A validação antiga dele não era validação.** Dizia "a URL gerada devolveu 16
resultados reais", e devolveu — com os dois `PARTS MANUAL` em último, depois de
14 linhas chamadas só `MANUAL, ILLUSTRATED`. "Respondeu 200" não é evidência de
que serve ao balcão. Por isso o atendimento usa a API, e este link ficou para a
tela de Catálogos, onde o contexto é procurar documento, não vender peça.

O link aparece em dois lugares: `CatalogsWorkspace.tsx` (tela padrão de
Catálogos, o que o balcão usa no dia a dia) e `CatalogsPanel.tsx` (a mesma
informação na visão de administração da biblioteca). Calculado no backend em
`catalog-list.controller.ts` (`briggsManualsUrl` no documento e em cada
`engineApplications[]`), exposto só quando `isBriggsModel` é verdadeiro —
nunca gera link para catálogo Husqvarna/Kawasaki/Kohler.

## Briggs: as peças saem do PDF, com a recusa do extrator de catálogo

`utils/briggs-ipl-text.ts` (decisão, regex puro, testável) +
`services/briggs-ipl.service.ts` (transporte: baixar, extrair texto, cachear) +
rota `/api/briggs/ipl-parts`. **Não há IA nenhuma neste caminho** — é a camada
de texto do PDF oficial, lida por regex.

Pedido do dono: *"eu queria travar essa mesma lógica… só aceitar quando o parser
tiver certeza, e recusar em vez de chutar"*. Sete motivos de recusa:
`NO_TEXT_LAYER`, `NO_SIGNATURE`, `NO_MODEL`, `MODEL_MISMATCH`, `NO_ROWS`,
`TOO_FEW_ROWS`, `NOT_LATIN`. Dois deles existem por medição, não por precaução:

- **`MODEL_MISMATCH` é o caso perigoso.** A URL do visualizador é montada do
  modelo; se ela devolver o PDF de outro motor, a lista chega com aparência de
  certa. O `Mfg. No:` do PDF é conferido contra o modelo pedido.
- **`NOT_LATIN` recusa o PDF chinês** (`103M02-0027-H1`). O código pode estar
  certo, mas a descrição existe para o atendente conferir se é a peça pedida. O
  link do PDF continua valendo como vista explodida.

Medido nos quatro PDFs reais: **167 / 263 / 283 / 155** peças aceitas, chinês
recusado. `MIN_ROWS = 20` é o mesmo espírito do `MIN_CATALOG_OCCURRENCES` —
tabela pequena é onde o falso positivo mora. Não baixe sem evidência nova.

Dois detalhes que são da fonte, não escolha:
- **A coluna QTY é opcional.** Zero linhas no `104M02-0002-F1`, 58 de 131 no
  `09P702-0212-F1`. Ausência vira `null`, **nunca 1** — afirmar "1" onde a fonte
  não diz seria inventar número no balcão.
- **O qualificador vem na linha seguinte** (`-(Intake)` / `-(Exhaust)`) e diz
  qual das peças iguais é aquela. Perder isso faz duas peças distintas parecerem
  a mesma.

Cache de 30 d fresh / 180 d stale, inclusive da recusa: o PDF não muda, e
reprocessar 1,5 MB para chegar na mesma recusa só gastaria o Render. Medido:
12,5 s na primeira leitura, **2 ms** do cache.

Quando recusa, a tela do balcão **não mostra nada** — fica só o botão do PDF.
Decisão do dono: *"o atendente nao precisa saber disso"*. O motivo continua na
resposta da API, para o painel de Qualidade.

## Preço da loja no catálogo do fabricante, e o ERP Clipp

Kawasaki e Briggs entregam código e descrição; **preço nenhuma das duas dá**
(a Kawasaki escreve "Please Contact a Dealer" em toda linha). O preço é da loja
e mora em `master_parts`. `POST /api/master-parts/prices` resolve a lista
inteira de uma vez — catálogo de motor Briggs tem até 283 linhas, e uma chamada
por peça seriam 283 idas ao Render free por atendimento.

A chave é a mesma dos dois lados: `normalizeIdentifier` joga fora traço e
espaço, então `587 10 67-01` da etiqueta e `587106701` da lista comercial
convergem sozinhos.

### A regra de preço velho é do dono

*"se a compra for desse mês, mostrar. Agora se a compra for do mês passado,
poderia mostrar o preço mas ter uma atenção falando que deveria consultar
novamente (pode ser que esteja mais caro a peça)"*

`utils/price-freshness.ts`. O valor guardado é o da **última compra**, não uma
tabela viva. **Nunca esconde o preço** — mesmo velho ele é referência. O que
muda é a cor e o aviso.

- **Sem data de compra vira `UNKNOWN`, tratado como "confirme"**, não como
  atual. Cair em `FRESH` por campo vazio seria o erro caro.
- **O mês é o da LOJA.** 1º de setembro 01h UTC é 31 de agosto na loja — pelo
  relógio do Render, compra de hoje de manhã viraria "mês passado". Mesma classe
  de bug que `store-day.ts` existe para evitar.
- A virada de mês é um **degrau** (31/08 fica `STALE` em 01/09, com um dia de
  idade). É a regra literal do dono e está travada em teste, para trocar por
  "últimos 30 dias" ser decisão deliberada, não deslize.

### O ERP da loja é o Clipp (CompuFour), em Firebird

Descoberto em 2026-09-19. O banco vive em `\ADMCompuFourCertaClippBaseCLIPP.FDB`
— rede local da loja, que o Render **não alcança de jeito nenhum**. O desenho é
exportar do Clipp e importar aqui, periódico, como a lista de preços já faz.
Não prometa leitura ao vivo do ERP.

O que o dono confirmou sobre os campos do Clipp:

- **"Referência"** é o código da peça, **sempre junto, sem traço**, seja
  Husqvarna, Briggs ou Kawasaki. É a chave. ("Código" é id interno curto do
  sistema, que a loja não usa.)
- **"Descrição complementar"** é a **prateleira**, em maiúscula: `P13-A1`,
  `PF`, `P18-A5`. Texto puro — não tente interpretar andar ou corredor.
- Existem **"última compra"** e **"última venda"**, que é o que torna a regra de
  preço velho possível.
- **A loja não compra todas as peças do catálogo.** Peça de catálogo sem preço é
  normal, não defeito — por isso a tela fica em silêncio para quem não está no
  cadastro, em vez de escrever "não cadastrada" em 283 linhas.

Colunas já criadas e **vazias até a primeira importação** (migração
`20260919230000_master_part_store_fields`): `stock`, `location`,
`lastPurchaseAt`, `lastSaleAt`. Anuláveis e sem backfill: `NULL` é "a loja não
informou", nunca "zero" — `stock` não tem `DEFAULT 0` de propósito.

**Falta**: o importador. Ele depende de ver o formato real da exportação do
Clipp (cabeçalhos, separador, se o decimal é vírgula, se o preço vem com "R$").
Não adivinhe esse formato.

**Nunca copie o `.fdb` com o Clipp aberto**: o Firebird trava o arquivo, e uma
cópia que "funciona" com o sistema rodando vem corrompida em silêncio. O caminho
certo é a exportação do próprio Clipp, ou um backup `.fbk`. E o `.fdb` inteiro
tem venda e cliente (provavelmente CPF) — a exportação de produtos não tem, e é
por isso que ela é a melhor opção, não só por ser menor.

## O que já foi lido do fabricante vira busca (`OfficialPartIndex`)

Até 2026-09-19 o produto só andava num sentido: **máquina → peça**. Abrir um
motor Briggs lia até 283 peças do PDF e guardava tudo num cache **opaco**, que
só responde *"quais as peças do motor X"*. O caminho inverso não existia — o
cliente chegava com o código `592358` na mão, o atendente digitava e **não
achava nada**, mesmo o sistema tendo lido aquele código dez minutos antes.

`services/official-part-index.service.ts` + tabela `OfficialPartIndex`
(migração `20260920000000_official_part_index`) + rota
`GET /api/official-parts/by-code` + `OfficialPartOrigin` na tela.

- **A gravação mora dentro do `loader`** do cache, dos dois lados. Só roda
  quando o fabricante foi consultado de verdade — fora dali, seriam 283 upserts
  a cada clique que o cache já responde.
- **Sem `await`**: é efeito colateral. O balcão não pode esperar a gravação
  para ver a lista, e `record` **nunca lança** — banco fora não derruba
  atendimento por causa de um índice.
- **O modelo da Kawasaki vem da tela**, como parâmetro, porque o slug do ARI não
  o informa de forma confiável. **Não deduza o modelo do slug**: errar ali
  gravaria o código no motor errado, que é o defeito mais caro do balcão. Sem o
  parâmetro, a leitura funciona igual e nada é indexado.
- **Sem `tenantId`**, mesmo critério do `OfficialSourceCache`: é dado público
  do fabricante, igual para todo mundo.
- **Separada de `Part`** de propósito. `Part` pertence a um `Document` que a
  loja subiu e tem ciclo de vida próprio (`active`, reprocessamento). A
  procedência aqui é outra e mais forte — veio da fonte oficial, não de
  extração. Misturar faria a tela perder a diferença entre "o fabricante
  publica" e "extraímos de um PDF daqui", que é o que sustenta a regra de nunca
  chutar código.
- `position` é `''` e não `NULL` porque entra na chave única, e no Postgres
  `NULL` não casa com `NULL` num índice único — duas leituras criariam linhas
  duplicadas.
- A mesma peça em vários motores **não é ruído**: parafuso e junta servem em
  muitos, e dizer isso ao balcão evita devolução por peça trocada. Por isso a
  consulta devolve lista, não o primeiro.

## O IPL da Briggs carrega regra de aplicação, e ela estava sendo perdida

Medido no IPL real do `104M02-0002-F1` em 2026-09-19. O qualificador — a linha
que começa com `-` logo abaixo da peça — não é só `-(Intake)`. Ele é o
**equivalente Briggs do campo `comment` da Husqvarna**: texto solto que decide
se a peça serve.

O regex antigo exigia parênteses ao redor de tudo (`^-\(...\)$`) e por isso
pegava só o caso decorativo, perdendo os que mudam a venda:

    -(Intake)                                    <- pegava
    -Used Before Code Date 17092700              <- perdia
    -(Must Be Replaced As A Kit)                 <- pegava, sem significado
    -Used Before Code Date 26080500 (No Longer Available) (See Reference 300D
    for Service)                                 <- perdia, e quebra linha

`briggsPartNotes` classifica em `BriggsPartNote`: `CODE_DATE_BEFORE`,
`CODE_DATE_AFTER`, `DISCONTINUED`, `SEE_REFERENCE`, `KIT_ONLY`, `ONLY_WITH`.
**O que não casar fica só no texto cru** — nota mal interpretada é pior que nota
nenhuma, porque parece informação.

**O mais caro é o code date.** O mesmo motor tem duas peças diferentes na mesma
posição, separadas só pela data gravada na etiqueta:

    209 590541 SPRING, Governor   -Used Before Code Date 17092700
    209 596459 SPRING, Governor   -Used After  Code Date 17092600

Sem o aviso as duas aparecem idênticas na tela. É a mesma classe de problema que
"mesma peça, código diferente por PNC" da Husqvarna, já registrado acima.

### O teto de 7 dígitos descartava peça de verdade

`ROW` limitava o código a `\d{5,7}` e a Briggs também emite 8. As linhas caíam
**em silêncio** — 4 por catálogo, e nenhuma era parafuso:

    455B 84013130 CUP, Flywheel
    608B 84013129 STARTER, Rewind
    957  84004416 CAP, Fuel
    972B 84004115 TANK, Fuel

Alargar para `\d{5,8}` acrescentou exatamente essas 4 linhas e nenhuma outra
(186 → 190 linhas casadas no mesmo PDF). Travado em teste.

## O teto do ARI da Kawasaki, medido

Não procure substituição nem "também usado em" na Kawasaki: **não existe no ARI
público**. Medido contra a API real em 2026-09-19, `GetDetails` devolve só
`{ html, model: null }`, e uma linha de peça tem exatamente estes campos:

    ariPLTag   = 11028                    (posição)
    ariPLSku   = 11028-6320               (código)
    ariPLDesc  = GASKET-SET(ENGINE)
    ariPLPrice = "Please Contact a Dealer"
    ariPLQty   = input, value 1

Zero ocorrências de `supersede`, `replaced`, `Where Used`, `also used`, `NLA`,
`obsolete` ou nota de qualquer tipo no HTML.

**A paridade com a Husqvarna nesse ponto vem do `OfficialPartIndex`**, não da
API deles: o "também usado em" é montado do que a própria loja já leu. É
informação que nós acumulamos, não que a Kawasaki publica.

## A Briggs publica manual do operador — e ele NÃO entra no produto

Medido em 2026-09-19: `manual-search` devolve **16 documentos** para o
`104M02-0002-F1`, sendo **14 manuais do operador** e só 2 listas de peças. Entre
os descartados há edição em **português** (no `09P702-0212-F1`, rótulo
`English, French, Spanish, Arabic, Portuguese`) — baixei e confirmei o texto:
*"Segurança do Operador"*, *"Vela de ignição"*, *"Folga da válvula de entrada"*.

Ou seja: a afirmação "a Briggs não tem nada em português" vale para a **lista de
peças** (só English e Chinese, conferido em 3 motores), **não** para o manual do
operador.

O caminho do download é mais longo que o do IPL e fica registrado para não ser
redescoberto:

    /_hcms/api/scramble-service?phrase=<tc_RelativePath>   -> token
    bsintek.basco.com/BriggsDocumentDisplay/default.aspx?filename=<token>

**Mesmo assim, não use.** Decisão do dono, com estas palavras: *"eu nao quero
saber sobre manual do operador né, nós não somos operador... folga de valvula e
essas coisas são coisas que o mecanico que fez curso sabe, mas o atendente e o
cliente nao precisa saber disso. Se caso der problema ele vai levar na
assistencia"*.

É a mesma regra de "Papéis de usuário" lá em cima: o único usuário é o balcão, e
não existe fluxo de oficina. Está escrito aqui porque a descoberta é real e
tentadora — sem este registro, alguém (eu inclusive) vai propor de novo.

## A tela do balcão não explica o sistema

Regra do dono, dita depois de ver o aviso de recusa do PDF: *"esses ruídos,
depois queria que você fizesse uma busca em geral e tirar todos, é como te falei
o atendente quer a peça e nao a explicação"*.

O critério da varredura de 2026-09-19 (8 textos removidos ou encurtados em
Kawasaki/Briggs/PNC/Referência cruzada/gaveta de orçamento/abertura): **fica o
que é ação** — para onde olhar, o que digitar, qual botão. **Sai o que só conta
como o sistema funciona** ou por que ele decidiu assim. "A Kawasaki não devolveu
a lista deste conjunto. Use a vista explodida acima para ler o código direto do
desenho" virou "Leia o código na vista explodida acima".

Painel de **Qualidade** e de **Negócio** ficam fora dessa regra: lá a explicação
é o produto, e é quem lê é o dono, não o atendente com cliente na frente.

## Mapeamento máquina ↔ motor Briggs, atualizado com catálogos reais

`services/husqvarna-domain-knowledge.ts`, `ENGINE_APPLICATIONS`. Em
2026-09-18 o dono mandou fotos da pasta real de catálogos PDF (fornecedores
de motor que equipam cortador/trator Husqvarna) e confirmou: a Husqvarna
passou a usar motor próprio em máquina nova, mas ainda há demanda de balcão
para máquina antiga com motor Briggs — não é uma linha descontinuada no
produto.

- **LB155S, HU725AWD, HU550FH**: as entradas antigas eram o nome comercial da
  série do motor ("675", "725EXi", "550" — sem `ex.: arquivo.pdf` como
  evidência, diferente do padrão já usado para J55SL/LC121P).
  **Substituídas** (não acrescentadas) pelo código de catálogo real
  confirmado nos arquivos da pasta do dono (`103M02-0027-H1`,
  `104M02-0002-F1`, `09P702-0212-F1`).
- **HU725AWD e LC121P usam o mesmo motor** (`104M02-0002-F1`) — confirmado
  por dois arquivos de catálogo reais e distintos com o mesmo código, não
  suposição.
- **LC140 e LT125**: máquinas novas na base, confirmadas pelo nome do arquivo
  (`MOTOR BRIGGS 08P502-0087-H1 LC140.pdf`,
  `MOTOR BRIGGS 28R707-1151-E1 - LT125 HUSQVARNA.pdf`). `LC140` foi mantido
  **distinto** de `LC140S` (que já existia) — não há evidência de que sejam a
  mesma máquina, e unificar seria supor peça igual entre catálogos diferentes
  sem confirmação. Não mesclar sem o dono confirmar.

**Bug real encontrado e corrigido no processo**: `resolveEngineCatalogRoute`
(usada pelo chat para responder "qual o motor da peça X do <máquina>") só
resolve direto quando existe **exatamente uma** aplicação sem PNC para a
máquina. A primeira tentativa desta atualização *acrescentou* o código real
ao lado do nome comercial (duas entradas sem PNC), e isso quebrou a rota:
virou `PNC_REQUIRED` com `knownPncs: []`, um beco sem saída, para as três
máquinas que já funcionavam. Corrigido substituindo em vez de acrescentar.
Travado em teste (`husqvarna-domain-knowledge.test.ts`, "resolvem motor Briggs
direto, sem pedir PNC") — **não adicione uma segunda entrada sem PNC para a
mesma máquina em `ENGINE_APPLICATIONS`** sem verificar esse teste.
