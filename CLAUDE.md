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
  cobre os dois: pinga `/health` (que consulta o banco de verdade) a cada 10 min,
  06h–24h UTC.
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

O IPL sai em `thepowerportal.com/ipls/ipl.htm?md=<modelo sem traço>~<IDIOMA>_IPLURL_LO.pdf`.
**Não gere esse link — a advertência agora tem prova.** Dois exemplos reais do
proprietário se contradizem no segmento de idioma:

    103M02-0027-H1  ->  md=103M020027H1~ZH_IPLURL_LO.pdf   (chinês)
    12J902-0118-01  ->  md=12J902011801~_IPLURL_LO.pdf     (idioma VAZIO)

Não há regra dedutível de dois casos que discordam, e link quebrado no balcão é
pior que link nenhum. O caminho certo é a **busca de manuais**, que
`briggsManualsSearchUrl` monta.

**A URL é a do site pt-BR**, conferida no navegador: `/pt-br/support/manuals/results?search=12J902-0118-01`
devolve os dois `PARTS MANUAL - 12J902-0118-01`, em inglês e em chinês. A
preferência do dono, nas palavras dele: *"Parts manual english de preferência,
se não tiver pode ser o chinese mesmo. Em português não vai ter de jeito nenhum."*

### Kawasaki não tem link profundo, e isso é deliberado

Medido: a URL de um conjunto carrega **dois GUIDs**
(`.../FX921V-ES06_4_Stroke_Engine_FX921V/*KITS_GASKET.../63e707fb-…/97b0edbd-…`),
e abrir o endereço só com o modelo devolve a página genérica de busca, sem a
grade de conjuntos. Então `kawasakiPartsLookupUrl()` aponta para
`kawasakienginesusa.com/parts-lookup` e o atendente cola o modelo, que
`formatKawasakiModelForSearch` devolve pronto.

O modelo Kawasaki é **série + spec** (`FX921V-ES06`), e vem da **plaqueta do
motor** — o Portal Husqvarna não informa (veja a seção abaixo).

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

## Motor Briggs: link de vista explodida (não é integração)

Pedido do dono: um botão para a vista explodida/manual oficial da Briggs, sem
precisar que o app entenda as peças daquele catálogo ("não tem necessidade do
sistema saber as peças, eu posso procurar manualmente"). A Briggs não tem
catálogo em português — só inglês, e em alguns motores só chinês — e não tem
API pública equivalente ao GraphQL da Husqvarna.

Por isso **não é integração**, é o mesmo padrão do botão manual do Portal
Parceiro Husqvarna: link pré-formatado que abre em nova aba
(`utils/engine-model.ts`, `briggsManualsSearchUrl`), sem scraping, sem
interpretar peça nenhuma do lado de lá. `formatBriggsModelForSearch` converte
o modelo guardado (`Motor Briggs 104M02-0002-F1`, às vezes com sufixo
`(Cortador X)`) para o formato exato que `briggsandstratton.com` exige na
busca — mesma regra de traço/zero-à-esquerda documentada acima em "Motores de
outras marcas". Validado **de ponta a ponta com o site real** em
2026-09-18: a URL gerada devolveu 16 resultados reais, incluindo o manual de
peças em chinês e inglês.

O link aparece em dois lugares: `CatalogsWorkspace.tsx` (tela padrão de
Catálogos, o que o balcão usa no dia a dia) e `CatalogsPanel.tsx` (a mesma
informação na visão de administração da biblioteca). Calculado no backend em
`catalog-list.controller.ts` (`briggsManualsUrl` no documento e em cada
`engineApplications[]`), exposto só quando `isBriggsModel` é verdadeiro —
nunca gera link para catálogo Husqvarna/Kawasaki/Kohler.

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
