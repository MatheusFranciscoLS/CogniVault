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

## Como testar (regra do dono, 2026-10-08)

**Sempre teste de diversas formas e pense em inúmeras formas de atendimento.** Um modelo só não prova nada: o vínculo máquina ↔ motor foi testado primeiro só no rider R316TX, e a
auditoria nas 151 máquinas achou um vínculo ERRADO (Z460 dizia FX730V; a ficha da lista diz FR691V). Em toda funcionalidade: vários modelos e marcas, os casos difíceis (o dado que a fonte
não tem, só a série, fontes que divergem), o que o atendente de fato digita (minúsculo, espaço no lugar do hífen, código colado, Enter, texto sem sentido, vazio, entrada enorme, trocar de
ideia no meio), o carregamento (a tela não pode piscar) e o caso em que NÃO deve aparecer nada. **Toda lista de opções precisa de saída para "nenhum destes"** (campo para digitar,
link oficial, ver a série): o balcão não pode ter de fechar tudo e voltar para pesquisar. Audite em escala antes de afirmar, nos dois temas, e diga o que NÃO foi verificado.

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

- Auditoria de código do backend (promessas soltas, `await` desnecessário etc.):
  `frontend/node_modules/.bin/eslint -c frontend/.audit/eslint.config.mjs backend/src`.
  Não faz parte do CI; é ferramenta de varredura. Para import sem uso:
  `cd backend && npx tsc --noEmit --noUnusedLocals`.

- **Rodada de auditoria do site inteiro (2026-10-09):** `bash docs/loja-simulada/auditoria-rodada.sh [--rapida]` (tipos, eslint de auditoria, dependências, toda rota exige login, rota sem consumidor, produção serve a `main`, testes). O plano vivo está em `docs/redesign-2026-10/PLANO.md` (o antigo virou `PLANO-historico.md`).
- Backend typecheck: `cd backend && npx tsc --noEmit`.
- Backend build+test real: `cd backend && npm test` (roda `tsc`, a **guarda do
  banco** e depois `node --test dist/**/*.test.js` — precisa de build passar
  primeiro). **Na máquina de desenvolvimento ele recusa de propósito**: o
  `.env` aponta para a produção. Veja "A suíte de testes não roda contra a
  produção" abaixo.
- Backend não tem `npm run lint` (não há ESLint configurado lá; `tsc` é o
  único gate de tipo).
- Frontend: `cd frontend && npm run lint && npm run build`.
- E2E: `frontend/e2e/*.spec.mjs` via Playwright, sobem backend+frontend reais
  com Postgres de teste (só roda de ponta a ponta em CI, ou local com um
  PostgreSQL descartável). **Não há "sandbox sem `DATABASE_URL`" na máquina de
  desenvolvimento** — ela tem, e aponta para a produção.

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
- **Segunda fonte da vista explodida: o SITE PÚBLICO (2026-10-08).** O Portal (b2b) não tem todas as máquinas da lista: o soprador **345BT**
  (PNC 970466903) está na lista de preços e tem peças e vista explodida em `husqvarna.com/br/suporte/...`, mas no Portal o artigo nem existe e a
  busca por "345BT" devolvia 350 e 340BT (dono). O site público fala a MESMA API (`https://www.husqvarna.com/hbd/graphql?`) com outra loja
  (`hbd-br-pt-br`, a do Portal é `b2b-br-pt-br`), sem login; o robots.txt libera `/`. `articles.byIds(PNC9)` devolve `ipls { id name image
  articles { coordinates quantity id name number comment url } }`; **não devolve `referenceWidth/Height`**, então `husqvarna-public-site.service.ts`
  lê a largura e a altura do PNG pelos 32 primeiros bytes (`Range`; servidor que responde 200 é descartado) — as coordenadas são pixels da imagem
  original. O site público tem esquema diferente do Portal (`name { shortName }`, sem `articleDescription`, sem introspecção): **não reuse a
  consulta do Portal lá**. Regras: o Portal manda; o site público só entra quando o Portal não tem o artigo ou o tem sem vista explodida
  (`withPublicSiteIpl`), e nunca troca uma vista que o Portal entregou; marca `iplSource: 'PUBLIC_SITE'`; miss fica 10 min em cache; preço nunca vem
  daqui. Entra pelos dois caminhos: `getProductDetails` (painel da máquina, cobertura da Qualidade) e `/api/official-fallback` (confirma o PNC como
  máquina). Política de cobertura 6. Medido: 345BT passou a ter 2 seções (MOTOR 24 posições, ALOJAMENTO DO SOPRADOR 20); cobertura 97% → 98%.
  Roteiro `fonte-publica.mjs` (precisa de internet até husqvarna.com).
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
  **Manual do operador (`OM`) não aparece mais no balcão** (dono, 2026-10-07: "queria somente as vistas explodidas"): a faixa
  de atalho mostra só `IPL`. Medido: os documentos são 0,2 a 0,5% do que o detalhe da máquina guarda (menos de 1 KB de uns 150
  a 270 KB) e são só links, não arquivos; então tirar o manual **não economiza dado nem tempo**, só tira ruído da tela.
- **URL vinda do Portal passa por `utils/husqvarna-url.ts`.** Só `https` e só
  domínio Husqvarna (`husqvarnagroup.com`, `husqvarna.com`, `aprimocdn.net`).
  Esse dado vira `href` na tela do balcão, então `javascript:`/`data:`/domínio
  de terceiro têm que morrer no servidor. `isHostOrSubdomain` compara com o
  ponto separador de propósito: `endsWith` cru aceitaria
  `husqvarnagroup.com.atacante.net`. A função estava duplicada em dois serviços
  e agora é importada dos dois. `safeHusqvarnaAssetUrl` só resolve caminho
  relativo quando começa com `/` — antes, um valor não-string virava
  `https://portal.husqvarnagroup.com/42`, link válido feito de lixo.

## Tabela de preços: as máquinas da lista vigente (aba, 2026-10-07)

Pedido do dono: *"quais máquinas estão em vigência na Husqvarna, quais posso vender, o que vem
junto"*, numa aba **separada** do atendimento e do orçamento. É só consulta, **para todos os
usuários** ("todos podem visualizar isso").

- **O preço é o da lista, sem ÷ 0,92.** A divisão vale para PEÇA (print do dono); para máquina o dono
  disse "somente o preço da lista". Não aplique a divisão aqui sem ele pedir.
- **"Em vigência" = estar na lista.** A importação é um **espelho**: troca tudo e máquina que saiu da
  lista sai da tela (na lista de 05/10/2026 a 143R II não está; só 143RS e 143RST — a busca não achar
  a 143R II ali é a resposta certa, não defeito).
- Dados: tabela `MachineListing` (RLS ligado, migração `20261007120000_machine_listing`), gravada só
  por `npm run import:machine-list-html -- "<lista.html>"` (sem `--apply` só lê; gravar exige
  `--apply --expect-count=<N>`). Leitor puro em `scripts/machine-list-html.ts`. Rota
  `GET /api/machine-list` (qualquer usuário logado). Tela: `MachineListPanel` + `MachineListDetail`,
  lógica de filtro/ordem em `lib/machine-list.ts`.
- **Foto da máquina (2026-10-07, pedido do dono: "cada máquina vigente tem que ter foto no orçamento").** A lista traz uma
  foto (webp, até ~53 KB) para cada uma das 151 máquinas, e elas vão para o banco PRIVADO (`MachineListingPhoto`, RLS ligado,
  ~2,7 MB no total), gravadas pelo importador na mesma transação da lista, e servidas por `GET /api/machine-list/:pnc/photo`
  só para quem está logado. **Nenhuma imagem, nem o .html, entra no repositório (público) nem nos testes**: o aviso de
  propriedade intelectual da Husqvarna segue valendo. Os testes usam máquinas e uma foto inventadas ("RIFF"). O orçamento
  usa a foto do PORTAL primeiro (maior qualidade; dono, 2026-10-07: "utilize todas as fotos do Portal"), pelo PNC e depois pelo
  nome do modelo, e a da lista só como reserva (hoje 139 pelo Portal e 12 pela lista, de 151). A foto é reduzida a 800 px em JPEG. Sem reimportar a lista, as 12 máquinas que o Portal não
  tem ficam sem foto. **MUDOU em 2026-10-08 (dono: "a lista tem as fotos sem erro, não precisa pegar do Portal"): a foto da LISTA vem primeiro** e o Portal só entra
  se a lista não tem. Isso só funciona depois de importar a lista em produção (`--apply`): a tabela `MachineListingPhoto` está vazia até lá, e o orçamento cai no Portal.
- **Fichas que o importador agora lê, por categoria** (`buildCategorySpecs`): transmissão e velocidade máxima só de giro zero,
  trator, rider e cortador de grama (em motosserra o mesmo campo é velocidade da corrente, 174,9 km/h); área de trabalho e
  inclinação só de Automower. **Peso continua fora** (decisão do dono). Os testes usam máquinas inventadas.
- **"Descontinuada" não existe mais na tela (2026-10-08).** O campo `motivo_sem_preco` da lista diz por que NÃO há preço e vem desatualizado quando há: a
  motosserra 120 vem "descontinuado" e com R$ 1.129,00, e o dono confirmou que ela está à venda. Toda máquina aceita pelo importador tem preço, então
  `discontinued` é sempre falso e o selo/etiqueta saíram (aba, painel da máquina). Máquina fora da lista continua "Fora de linha".
- **A ficha técnica é uma seleção conservadora** porque o arquivo é sujo (já vimos "rotação" com o valor
  de potência e "peso" 6500). Unidade só entra em número puro e valor absurdo fica de fora.
- "Acompanha / não acompanha" vem do Portal Husqvarna por PNC, ao abrir a gaveta
  (`/api/husqvarna/products/:pnc/details`, campo `equipment`); se o Portal não responde, a seção some,
  sem aviso de erro.
- **A ordem é a da Husqvarna** (`sortOrder`, calculado no importador a partir de `technologyOrder`,
  `categoryOrder` e `ordem_exibicao` do arquivo), não a alfabética: motosserra e roçadeira primeiro.
- **O painel da máquina (Atendimento) mostra se ela está na lista** (`ListingBadge`): "Em linha ·
  R$ X", "Descontinuada" ou "Fora de linha" (a máquina não está na lista; palavra do balcão, escolhida pelo dono). O PNC casa por igualdade ou pelos 9
  primeiros dígitos (`findListedMachine`); sem lista importada o selo fica em silêncio.
- **A ficha para o cliente (WhatsApp/PDF, `lib/machine-sheet.ts`) não leva o PNC** nem selo de novidade, e
  cita a data da tabela. **Regra do dono (2026-10-07): o que o cliente recebe NÃO leva código de peça**, para
  ele não cotar em outra revenda. Vale para TUDO que sai para o cliente: o WhatsApp, o PDF e a folha impressa do
  ORÇAMENTO também não levam código (nem PNC, posição ou "substitui o código X"); travado em `quote-message.test.ts`,
  `quote-pdf.test.ts` e no roteiro `orcamento-completo`. O código só existe na tela do balcão.
- **O PDF do orçamento segue o modelo em Word da loja** (`lib/quote-pdf.ts`): logo (`/brand/vardao-horizontal-azul.png`,
  carregada por `lib/pdf-assets.ts`; sem ela o PDF sai com o nome em texto), dados da loja no alto e no rodapé
  (`lib/store-profile.ts`: CNPJ, inscrição, endereço e telefones são dados PÚBLICOS de pessoa jurídica, por isso moram
  no código; dado de cliente nunca), "Cidade, data", A/C, Ref., tabela com prazo, condição de pagamento, **validade de
  20 dias corridos** (era 7 dias úteis), transportadora, observações e "ATT. nome" (o nome sai do e-mail do atendente).
  Os padrões estão em `QUOTE_DEFAULTS` e cada orçamento pode sobrescrever. A ficha da máquina usa o mesmo timbre.
- **Prazo das peças é ESCOLHIDO em cada orçamento** (dono, 2026-10-07): três botões na gaveta, **Imediato** (pronta entrega), **Encomenda**
  (a Husqvarna leva de 7 a 10 dias; vem com "7 a 10 dias", editável) e **Sem prazo** (o padrão: orçamento expresso, só por curiosidade do
  cliente). Sem prazo, o PDF **não tem a coluna PRAZO** e o WhatsApp não fala de prazo. Peças não levam foto. Código em `lib/lead-time.ts`;
  o valor guardado continua sendo o texto em `Quote.leadTime` (vazio = sem prazo). **As observações** vêm com as 3 do modelo (imposto, faturamento em SP, estoque
  rotativo), valem em todo orçamento e podem ser editadas por orçamento (campo recolhido; `Quote.notes`; vazio = padrão).
- **Razão social** do PDF é a do cadastro do CNPJ: VARDÃO MÁQUINAS E EQUIPAMENTOS DE JARDINAGEM LTDA (o cabeçalho do modelo
  em Word estava abreviado).
- **Orçamento de MÁQUINA** (botão "Orçamento" na gaveta da Tabela de preços, 2026-10-07): PDF no modelo em Word da loja (pasta
  "Modelo Timbre" do dono, 8 modelos lidos: 143RST, MZ54, R316TX, TS114, TS142, Z248F, Z460, Z560X). Layout: "Limeira, data", A/C,
  "Ref.: Orçamento <tipo> Husqvarna <modelo>", uma linha "01-) <tipo>, modelo X equipado com motor 4 tempos de ..., potência ...,
  tanque ..., largura de corte ...", destaque "Recomendado para...", Preço, Condição de Pagamento, Prazo de Entrega, Validade 20 dias,
  Observação, ATT. Código em `lib/machine-quote.ts` + `MachineQuoteDialog`. A descrição sai da ficha da lista; o que ela não traz
  (transmissão, câmbios, velocidade) o atendente digita em "Complemento". **Características da lista (2026-10-07, achado do dono):** o "complemento" que o atendente digitava passou a vir da DESCRIÇÃO da própria lista (`descricao_detalhada`, já guardada em `MachineListing.details`). `lib/machine-highlights.ts` fica só com linhas curtas que não são frase, sem emoji, sem repetir o título e sem aviso; o diálogo mostra cada linha com caixa de marcar (as 6 primeiras vêm marcadas) e a PRÉVIA mostra exatamente o que vai para o PDF. **A antiga lista "o que acompanha" do Portal saiu**: eram atributos soltos ("Nome do modelo do carregador de bateria: 318iS20, 100-240V") que o atendente não via antes de gerar. A "largura de trabalho" da lista só vira "largura de corte" em máquina que corta (no pulverizador e no soprador é outro dado e não sai). Com características e foto, a foto vai ao lado da lista para o PDF caber em uma página. O PDF do cliente não diz mais "Revenda Autorizada Ouro" nem tem o trecho dourado do filete (o cliente não conhece a distinção; dono, 2026-10-07). A **data do orçamento** é editável (começa em hoje; a validade de 20 dias conta dela), como a negociação pede. A **foto** vem do Portal pelo PNC (`imageUrl` do detalhe, só https de domínio Husqvarna) e é reduzida a 640 px em JPEG no navegador (`loadProductImage`: o PNG original passa de 2 MB); sem foto, o orçamento sai sem ela. **O preço sugerido é o da lista mas é do atendente**: nos
  orçamentos reais o valor negociado quase nunca é o da lista (por isso o campo é editável). Os preços dos orçamentos reais NÃO entram aqui: é dado da loja. Sem PNC,
  sem código. Os orçamentos reais em Word têm dado de cliente: ficam em Downloads, nunca no repositório.
- **PNC da lista com `BR` (36 de 151 máquinas, ex.: `970743401BR`) é o MESMO artigo de 9 dígitos** (`portalPnc`): sem tirar o `BR`,
  o Portal respondia 400 e a máquina ficava sem "o que acompanha", sem "leve junto", sem vista explodida e sem o selo "Em linha".
  `CJ`, `CJ1`, `S12` (conjunto) são outro item e continuam como vieram.
- "Leve junto" na gaveta vem dos acessórios que o PORTAL indica para a máquina e que a loja tem no cadastro.
- **Gravar em produção precisa da aprovação do dono** (olhar o relatório, depois `--apply`). A migração
  cria a tabela vazia no deploy; a aba mostra "ainda não foi carregada" até a importação.

## Troca de código: o PORTAL manda, e o último da cadeia é o que se pede (2026-10-07)

Dono: *"na hora de pedir na Husqvarna ela aceita só o código novo, nem sempre o similar dá certo"* e *"não quero
fazer nada manual"*.

- **Fonte de verdade é o `replacementHistory` do Portal** (`husqvarna-replacement-history.service.ts`). O
  `livePart.replacedBy` é o código MAIS RECENTE da cadeia (`history[0]`), com `replacementChain` no meio.
  **Bug já cometido:** `replacedBy` era o PRÓXIMO passo (506027201 → 506027207), que também já tinha sido
  trocado (o último é 587329503). Travado em `husqvarna-live-part.test.ts` (cadeia longa), com prova de mordida.
- **A checagem é automática** quando o texto digitado é só um código (`lib/bare-code.ts`): `CodeReplacementCheck`
  consulta `/api/parts/:code/live-data` e mostra a faixa `CodeReplacementBanner` ("A Husqvarna substituiu o código
  X · Peça este: Y"), com o que foi digitado à vista. Antes só aparecia ao abrir a gaveta ou quando nada era achado.
  Frase com código no meio ("carburador 587106701") **não** consulta: o código ali é contexto.
  A faixa traz **preço, prateleira e "+ Orçamento" já com o código novo** (o item guarda o antigo como "era");
  **não há "buscar de novo"**, porque é a mesma peça (dono, 2026-10-07).
- **Não redirecionar em silêncio.** O que o atendente digitou continua visível ao lado do código novo, para ele ver
  que o código dele foi reconhecido.
- **A "similaridade" da lista de preços (HTML) NÃO é fonte de troca de código.** Medido em 40 códigos antigos:
  26 concordam com o Portal e 9 divergem (o Portal diz que o antigo já é o mais recente, ou termina em outro).
  Parser, importador e tabela ficaram prontos e parados (stash `similaridade-da-lista`); só valeriam como dica
  secundária ("similar, confirme") com o Portal fora do ar.
- **Peso e "estoque recomendado" do Portal não entram em tela nenhuma** (dono). A consulta não pede mais peso.

## Teclado primeiro e saída para o Clipp (2026-10-07)

O balcão é mouse e teclado, e a venda acontece no Clipp. Dois atalhos que valem o dia:

- **Lista de resultados** (`lib/results-keyboard.ts`, ligada no `ResultsTable`): ↓ no campo de busca vai ao código da primeira linha;
  ↓/↑ percorrem as linhas **na ordem da tela** (a ordem dos grupos pode mudar por CSS, então manda a posição vertical,
  não a do DOM); Enter copia o código (é o próprio botão); **+** põe a linha no orçamento; ↑ na primeira volta à busca. As
  setas não são roubadas de campo de texto nem de menu aberto, e Ctrl/Alt/Meta passam direto. `/` e Ctrl K focam a busca.
- **NÃO existe "Copiar códigos" em lote.** Eu construí e o dono disse que não faz sentido: *"é 1 código por vez"* no Clipp, então
  basta copiar o código da linha (que já existe). Foi removido em 2026-10-07; não proponha de novo.

## O que saiu do balcão em 2026-10-07 (não proponha de novo sem o dono)

- **Assistente de IA em gaveta** (`ChatPanel`, `chat/*`, "Perguntar à IA", "Pedir orientação", pergunta digitada abrindo o chat): removido.
  O dono pediu "o que for melhor e recomendado" e a recomendação foi tirar: o atendente quer a peça, não uma conversa. O **backend do chat**
  (`/api/chat`, `react-agent.service.ts`) continua no servidor, sem uso na tela; podar com cuidado (tem teste e serviço compartilhados).
  A IA que fica é a de **lista fechada** (`PartGuesses`, `/api/parts/guess`): ela só escolhe entre as peças da máquina.
- **Sino de notificações só para o administrador**: as pendências são conferências e qualidade. O balcão não vê nem consulta `/api/notifications`.
- **"Copiar códigos" em lote** e **Favoritos/Histórico/Feedback**: removidos (ver as seções acima e o PLANO).

## Cobertura técnica (Qualidade): o Portal é conferido sozinho (2026-10-07)

O cartão "Cobertura técnica" dizia 17% (60 de 362 modelos) e "302 sem fonte comprovada", e
parecia alarme. Não era: só contava PDF subido à mão, e a conferência no Portal era um botão
manual que olhava sempre os mesmos 8 modelos. O dono não quer subir PDF à mão.

- **Ao abrir Qualidade, a tela confere no Portal os modelos que faltam**, 8 por vez, com progresso
  ("Conferindo no Portal… X de Y"). `POST /api/admin/quality/portal-coverage` aceita `exclude` (o que a tela
  já tentou) e devolve `remaining`. **Cada resposta fica guardada** (`OfficialSourceCache`, 7 dias fresca e
  30 revalidável), então a próxima abertura só consulta o que falta ou venceu.
- `applyCachedPortalOutcomes` soma ao portfólio o que já foi respondido, **sem chamar o Portal**; é o que faz
  Visão geral e Qualidade mostrarem o mesmo número. `selectPortalVerificationCandidates` nunca repete modelo
  já respondido nem o que a tela já tentou, mas **insiste no INCONCLUSIVE** (não é cacheado de propósito).
- **Terceiro tipo de fonte: `PORTAL_DOCUMENT`** (estado `DOCUMENT_ONLY`). O Portal guarda o IPL de muita máquina
  antiga só como documento (PDF), sem produto estruturado. Medido em 190 modelos sem produto: **121 têm IPL em PDF**.
  `portalDocumentMatchesModel` exige o modelo inteiro no título, sem número colado (`1120i` não é `120i`) e sem
  código curto de outro modelo na frente (`PW 235R`). Lista estruturada continua ganhando do documento.
  A versão da política do cache subiu para 2 (respostas antigas não conheciam documento).
- **O título do produto no Portal traz ruído** ("(sem bateria e carregador)", "®", "1.5L"): `stripPortalTitleNoise` tira
  isso antes de comparar, senão `LC137i` nunca casava com o próprio produto. Outro modelo continua barrado
  (`240 e-series` não é `240i`, `K 540i` não é `540i`, `543RS` não é `543R`).
- Duas segundas tentativas, ambas estreitas: o nome comercial completo (`540i` → `540i XP`, só 1 a 3 letras a mais,
  `commercialNameAlternatives`) e a troca número+uma letra (`750K` = `K750`, `modelKeyVariants`).
- **Fora de linha (`NOT_APPLICABLE`, 2026-10-07, pedido do dono: "quero zerado").** Modelo que o Portal já conferiu SEM lista de peças e que **não consta na lista vigente de máquinas** (`MachineListing`) não é lacuna: é fora de linha, acessório ou marca secundária, e não entra na base da cobertura (`markNotInLine`). Modelo que consta na lista vigente e o Portal não publica continua lacuna de verdade (hoje 12: Automower, 226KS12, 345BT, LE322R, W25P) e a única saída é o SAC da Husqvarna. Sem a lista de máquinas importada, nada é marcado. O que sobrou é mostrado, não escondido: a Qualidade lista os fora de linha numa seção recolhida.
- **Resultado medido na loja simulada: 17% → 84%** (305 de 362). **Correção:** eu havia dito que os que sobravam eram
  "marcas do grupo"; medindo, os **57** que sobram são: Automower 12 (o Portal BR não tem produto nenhum), roçadeiras 10,
  tratores 6, cortadores de grama 5, motocultores 4, giro zero 3, e o resto são acessórios Husqvarna que o Portal publica só
  com manual (bateria BLi, cabeçotes e acoplamentos HA/PA/TA, aparadores ECA/ESA, derriçadeiras 226K). A categoria da
  lista comercial aparece ao lado de cada modelo na Qualidade.
- **Links do dono (2026-10-08): 7 de 10 TÊM vista explodida e estavam perdidos** (W25P, HH 212, HH 196, TF 545DE, TS 219TFm,
  525PT5S, 555RXT). Duas causas: o título do Portal tem o modelo no MEIO ("HH 212 - 599348659", "W25P 2T Autoescorvante"),
  e `portalResultMatchesKey` só olhava o fim; e a máquina da lista vigente nunca era consultada pelo PNC dela. Agora o modelo vale
  como palavra inteira em qualquer ponto **só se o que vem depois é pontuação, número de artigo ou 2T/4T** (uma palavra como "II" ou
  "RST" é outra máquina), e `auditPortalModel(model, { knownPncs })` tenta o PNC da lista (`listedPncsForModel`) antes da busca por
  nome. Versão da política do cache: 5. Z560XS, LE322R e TS217Tm **de fato não têm IPL** (só manual); Automower não existe no Portal BR.

- **Cobertura em 100% dos modelos em linha (2026-10-08), por três causas e duas pausas.** (1) O site público da Husqvarna entrou como segunda fonte
  (345BT, ver "Segunda fonte da vista explodida"). (2) **O filtro de seções só aceitava ids `HVA_PL-…`**; os cortadores de grama usam `CLT_PL-…`, e o
  LE322R, que tem 5 vistas (EMBALADORA, POWER HEAD, DECK, ACIONAMENTO, PUNHO), saía como "só manual". Agora vale `[A-Z]{2,4}_PL-…`. (3) Política de cobertura 7.
  **Em pausa** (fora da conta e das consultas, listados numa seção recolhida; `PAUSED_COVERAGE_CATEGORIES` e `PAUSED_COVERAGE_MODELS` em
  `portfolio-coverage.ts`; religar = tirar da lista): **Automower** (dono: "deixe em off por enquanto"; 12 modelos, sem vista em nenhuma das duas fontes) e
  **226KS12** (derriçadeira de café = motor 226K + acessório KS12; a Husqvarna Brasil publica a máquina, mas só os componentes têm vista, cada um no seu
  artigo; juntar seria montar uma vista que ela não publica). Estado `PAUSED` no resumo; a API devolve `paused` (número) e `pausedModels` (lista).

## Cada tela tem endereço próprio (2026-10-08)

Dono: *"pq todas as abas estão em /dashboard… na aba de administração e lá ta marcando dashboard"*.

- `/atendimento`, `/catalogos`, `/orcamentos`, `/tabela-de-precos` e `/administracao/negocio|visao-geral|usuarios|qualidade`.
  Mapa único em `lib/section-routes.ts` (endereço, título da aba do navegador, quem é da Administração). O login entra em `/atendimento`.
- **O estado continua no `Dashboard`; a barra de endereço é reflexo dele** (`history.replaceState`, como já era com `?tab=`). Recarregar,
  favoritar e copiar o link funcionam. Um `<Link>` de verdade remonta a tela (`DashboardRoute` usa a `key` da navegação); trocar de aba por dentro não.
- **Links antigos continuam valendo**: `/dashboard?tab=quality`, `?tab=machines&pnc=`, `/husqvarna` são traduzidos na abertura. Quem é do Balcão e abre
  endereço de Administração cai no Atendimento. Roteiro: `docs/loja-simulada/rotas-completo.mjs`.

- **Toda tela (menos o Atendimento) usa `components/PageFrame.tsx`**: largura 1400, margem e cabeçalho (título, contagem/data, ação principal) iguais.
  Antes a margem esquerda ia de 20 a 46 px e Usuários encolhia ao tamanho do conteúdo (`mx-auto` sem `w-full` dentro de coluna flex). Tela nova entra nessa moldura; não crie outra.

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
- **O modelo pesquisado vem primeiro (2026-10-07, achado do dono).** Pesquisando "122 HD60", as fichas vinham em ordem alfabética
  do Portal (522HD60S, 522iHD60, 536LiHD60X) e a do 122 HD60 aparecia em quarto, com o nome cortado antes do modelo ("HUSQVARNA Aparador
  de Cerca Viva Husqvarn…"). Agora `lib/model-search-rank.ts`: 0 = título cita o modelo inteiro, 1 = contém dentro de outro nome
  (122HD60S), 2 = o resto; o chip mostra o MODELO em negrito e a descrição ao lado. O servidor anuncia só "HD60" (o "122" solto é
  número), então `searchModelTerm` junta o número solto ao token ("122" + "HD60") a partir do que foi digitado. As máquinas da lista
  vigente que o texto cita entram antes, mesmo que o Portal não as devolva. Manual do operador (OM) não aparece entre os atalhos.
  Roteiro `busca-modelo.mjs`.
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

- Modelo: `gemini-3.7-flash` (extração de PDF, escolha de peça em lista
  fechada, embeddings). O chat do servidor (`/api/chat`, `chat.service`,
  `react-agent`, `confidence-gate`) foi podado em 2026-10-07: não tinha tela
  desde que o assistente em gaveta saiu e a rota gastava IA de quem estivesse
  logado. A interpretação de busca que sobrou mora em `services/search-intent.ts`. Configurável via env, ver `backend/src/config/gemini.ts`.
- **Feedback do atendente (👍/👎) não tem mais tela nem rota de gravação**
  (podadas em 2026-10-07, junto com Favoritos e o registro de uso de busca). Os
  votos que já estão no banco continuam entrando no ranking via
  `feedback-learning.ts` (`part-search.service.ts`); não há voto novo.
- Sem fine-tuning (não faz sentido pra esse porte de app). As alavancas
  reais são prompt engineering e a lista fechada do `part-picker.service.ts`.
- **Embedding de feedback: removido em 2026-09-19.** Ele calculava e gravava o
  vetor do texto digitado e **nada lia de volta** para o ranking. Saiu por
  quatro motivos, e o primeiro é a regra de custo zero: cada voto virava
  chamada paga ao Gemini; semelhança de significado só ganha do casamento exato
  com volume que um balcão não produz; o aprendizado por sinal estruturado
  (`feedback-learning.ts`) já funciona e é **explicável**, que é o que um
  produto cuja regra é "nunca chutar o código" precisa; e nem dava para
  exercitar aqui, porque a coluna precisa da extensão `pgvector`, ausente nesta
  máquina. A coluna `SearchFeedback.queryEmbedding` continua no schema — apagar
  coluna em produção não compensa por um campo anulável e vazio.
- A busca semântica de **peça** (`part-search.service.ts`, `queryEmbeddingCache`)
  é outra coisa e continua valendo. Não confundir as duas.

## Antes de "consertar" algo que parece estranho

Este projeto já passou por vários ciclos de limpeza de código morto
(backend inteiro + frontend inteiro, controllers/routes/middleware/scripts
incluídos). Se algo parecer sem uso, ainda assim confirme com grep no
repositório inteiro — incluindo `.github/workflows/*.yml`, que scripts como
`backend/src/scripts/audit-portal-models.ts` só são chamados por lá, não por
outro arquivo `.ts`. Uma varredura anterior já teve um falso positivo exatamente
por não checar os workflows.

## A sessão do balcão se renova, com teto

Antes de 2026-10-06 a sessão durava **8 h fixas desde o login** e não existia rota de
renovação: quem entrava de manhã era deslogado à tarde, no meio do atendimento, e a
loja trabalha mais que 8 h por dia. Autorizado pelo dono.

- **Sem atividade, tudo como antes: 8 h.** A sessão nunca ficou mais curta.
- **Com atividade, vai até o teto de 12 h desde o login ORIGINAL.** Na primeira
  requisição depois que restarem menos de 4 h, o cookie é reemitido valendo até
  `login + 12 h`. Como o teto conta do login, **a renovação é sempre cortada nele:
  na prática é UMA renovação por sessão**, não uma a cada 4 h. Exemplo: login às
  08:00; qualquer requisição entre 12:00 e 16:00 estende a sessão até 20:00; sem uso
  entre 12:00 e 16:00, expira às 16:00.
- **O teto existe** porque, sem ele, um PC compartilhado com uso contínuo manteria a
  mesma sessão para sempre. É o único ponto em que o pior caso piora (cookie roubado:
  de 8 h para 12 h).
- `authAt` (login original) viaja dentro do JWT assinado, então não se adultera;
  token antigo sem `authAt` usa o `iat`. Código: `utils/session-renewal.ts` (função
  pura) e `renewSessionIfDue` em `middleware/auth.middleware.ts`.
- **A renovação roda DEPOIS de todas as validações** (assinatura, tenant,
  `sessionVersion`, status): logout e bloqueio continuam derrubando a sessão na hora,
  e sessão inválida nunca ganha cookie. Só renova token que veio do **cookie**; quem
  usa `Authorization: Bearer` é cliente de API. **Nunca lança**: falhar ao renovar não
  pode virar 401 numa requisição já autenticada.
- Os números estão travados em `middleware/session-renewal.test.ts`. Mudá-los é
  decisão de segurança, não refatoração.

Uma primeira versão dos testes esperava "mais 8 h" e reprovou: o código estava certo e
o teste (e o comentário) é que descreviam o desenho errado. Vale como lembrete de que
um teto contado do login faz toda renovação terminar nele.

## Fluxo de PR: o que custa tempo, medido

Medido em 2026-10-06, quando o dono reclamou que subir três PRs demorava demais.

- O CI obrigatório leva ~4 minutos por PR (medido antes de 2026-10-07): `backend`
  ~1m20, `frontend` ~35s, e o `e2e` ~2m45 que ESPERAVA o backend. Desde 2026-10-07
  os três rodam **em paralelo** (o e2e sobe o próprio backend e frontend, não usa
  nada do outro job), então o tempo é o do mais lento, ~2m45. O gate é o mesmo: os
  três checks seguem obrigatórios. A regra do repositório exige o branch
  **atualizado** antes de mesclar, então **cada merge deixa os outros PRs abertos
  defasados** e reinicia a contagem deles. Três PRs paralelos viram uma fila.
- **PR só de documentação pula os três jobs** (`changes` em `v6-ci.yml`). "Só texto"
  é: `*.md`, `docs/**`, `.claude/**` e `LICENSE*`. Qualquer outro arquivo, inclusive
  `.github/`, conta como código. A condição é **por job**, nunca `paths-ignore` no
  workflow: workflow pulado por filtro deixa o check obrigatório pendente e trava o
  PR, enquanto job pulado por `if:` reporta sucesso. Se a detecção quebrar, os
  testes rodam (falha fechada).

- **Onde o tempo do CI ia (medido em 2026-10-09, dono: "tudo isso demora, não tem sentido").** Do `e2e` de 192 s, **69 s eram só baixar as imagens de banco e fila** (`Initialize containers`) e **53 s preparar o Playwright** (navegador baixado a cada PR); no `backend`, 33 s das 86 s eram a imagem. O download vinha do Docker Hub, que **caiu por ~25 min e derrubou 3 rodadas seguidas** (o PR #300 ficou parado por isso). Agora as imagens vêm do espelho do Google (`mirror.gcr.io`, mesmas versões; o RabbitMQ sem a interface de gerenciamento, que nada usava) e o navegador do Playwright fica em cache enquanto a versão for a mesma (`actions/cache`, chave `playwright-chromium-1.63.0`: **trocar a versão do Playwright exige trocar a chave**). **Segunda rodada (mesmo dia):** o `npm install @playwright/test --no-package-lock` refazia a árvore inteira das 843 dependências (29 s no CI, 64 s medidos local); sem `--no-package-lock` ele usa o lockfile e leva ~4 s, com o `package-lock.json` intacto (conferido por hash) e o Playwright continuando FORA do `package.json` do site. O `install-deps` (apt, ~20 s) só roda se o Chromium em cache não abrir. **A outra metade do tempo é do meu lado, não do CI:** rodar a suíte inteira e cada roteiro nos dois temas antes de cada PR. Regra: localmente só `tsc`, lint e o roteiro da tela mexida (um tema, o outro quando a mudança é visual); o CI roda a suíte inteira de qualquer jeito.

Como trabalhar para não pagar isso à toa:

1. **Agrupe mudanças pequenas e relacionadas num PR só.** Um PR de 3 commits custa 4
   minutos; três PRs de 1 commit custam 12 e ainda se atrapalham.
2. **Só abra o PR quando terminar aquele assunto.** Cada push em PR aberto reinicia o
   CI. O auto-merge dispara enquanto você ainda commita: já deixou um commit fora de
   `main` (o `184899c`, recuperado no #203).
3. **Valide antes de subir.** `tsc`, lint e build rodam local. O que só roda no CI
   (workflow, e2e) não tem como: teste a LÓGICA separada, como foi feito com o
   classificador de "só texto", e suba uma vez.
4. **Um PR por vez na fila de merge.** Mescle, atualize o próximo com
   `gh pr update-branch` (nunca reescreva história de PR) e só então espere.
5. **Antes de apagar uma branch**, compare a ponta com o `headRefOid` do PR mesclado:
   commit à frente é commit que não entrou em `main`.

## Skills do projeto

Ficam em `.claude/skills/`. A procedência, a versão fixada e o que foi avaliado e
**recusado** estão em `.claude/skills/PROVENANCE.md` — leia antes de instalar
qualquer outro. Regra: nenhum skill entra sem leitura integral e sem versão fixada,
e nunca por `npx skills add` de terceiros.

Para qualquer trabalho visual, `cognivault-ui` vem primeiro: ela tem o que é
inegociável na tela do balcão e o ciclo de verificação (workflow `Screens`).

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
- **O alvo do design é o PC do balcão (mouse e teclado), e só ele.** Dito pelo dono
  em 2026-10-06: *"não precisamos focar no celular e tablet… vamos somente utilizar
  no balcão. Tablet não temos na loja, só se for o celular pessoal."* Este arquivo
  dizia o contrário — que "o aparelho do meio no balcão é um tablet de 10 polegadas" — e isso
  era uma suposição que ninguém confirmou. **Celular não é alvo de design**: só não
  pode quebrar (sem rolagem horizontal, texto legível). O breakpoint `tablet: 820px`
  continua no `tailwind.config.js` e não deve guiar decisão nova.
- `.cv-touch-target` (44px) foi escrito para "dedo com luva de oficina", e o produto
  não tem fluxo de oficina: o usuário é o balcão. Para mouse, o que importa é alvo de
  clique confortável (≥ 32 px) e **teclado primeiro** (`Ctrl K`, Enter busca, foco
  visível). Os 44 px só voltam a valer se o PC do balcão tiver tela sensível ao toque —
  **pergunta em aberto ao dono**.
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

## Redesenho: o padrão de FAIXA (direção B), tela por tela (2026-10-09)

O dono escolheu a direção B ("Painel de bancada") e quer o MESMO padrão no site inteiro (não só na Administração). Mockups em `docs/redesign-2026-10/mockups/`; ordem de entrega no plano (2.15): base + Negócio (feito), depois o resto da Administração, Orçamentos e Tabela de preços, Conserto, Atendimento (por último e com mais cuidado) e Catálogos/login.

- **`PageFrame look="band"`** (`components/PageFrame.tsx`): faixa marinho de borda a borda (`.cv-band`, tokens `--band-from/--band-to/--band-muted` em `theme.css`, claro e escuro) com migalha, título, ação e um espaço `band` para os campos de trabalho e os números grandes; o conteúdo SOBE sobre a faixa. `look="classic"` é a moldura antiga e continua o padrão das telas ainda não convertidas. **A faixa é baixa de propósito** (o PC do balcão tem 768 px): no Negócio o conteúdo já começa antes dos 340 px.
- **A tela só vai de borda a borda se estiver em `BAND_SECTIONS`** (`lib/section-routes.ts`): o `ShellV2` tira a margem do `main` para essas seções. Converter uma tela = trocar `look`, pôr a seção nessa lista e usar `Button variant="bar"` para o secundário sobre o marinho (o laranja continua só em ação principal).
- Peças compartilhadas: `PageTabs` (abas em pílula sobre a borda da faixa, papéis `tablist/tab/tabpanel`, setas, só a aba selecionada no Tab), `BandStat` e `Spark` (número grande e mini-gráfico em SVG, sem biblioteca), `lib/admin-queries.ts` (as consultas que mais de um cartão usa, **uma queryFn por chave**).
- **Negócio** (`BusinessPanel`): números na faixa (orçamentos, valor, ticket, sem preço) e um anel com os dias desde a última atualização da lista (branco até 14 dias, amarelo depois); abas **Resumo** (gráfico, "Precisa de você", atividade por atendente), **Demanda** (mais cotadas, sem preço, mais orçadas no conserto, peças de motor sem preço, buscas sem resultado) e **Lista de preços** (a atualização). **A aba vai no endereço** (`?aba=demanda`, `?aba=lista`; sem `aba` é o Resumo): recarregar, favoritar e os roteiros abrem na aba certa. "Precisa de você" lista, em ordem, o que espera o dono (lista de preços com 14 dias ou mais, buscas sem resultado, peças de motor sem preço, orçamentos sem preço) e cada linha leva à aba onde se resolve.
- **Barra de cima** (`ShellV2`): o campo de busca mostra "Buscar peça ou código" inteiro (antes o selo "Ctrl K" cobria o texto: "Buscar p…"); **o selo só aparece de 1536 px para cima** (em 1366 não há largura), o atalho Ctrl K continua; os itens do menu não quebram mais em duas linhas (`whitespace-nowrap`) e o avatar termina dentro da janela em 1366. Em 1280 ainda sobra uns 13 px (fora do alvo do balcão). **A busca grande do Atendimento também tem o selo "Ctrl K" dentro do campo: revisar quando essa tela for convertida.**
- **Contraste da faixa:** o roteiro `contraste-completo.mjs` agora entende fundo em degradê (vale a parada mais clara para o texto claro); sem isso toda palavra da faixa dava 1,14:1 (falso positivo). Roteiro `negocio-faixa.mjs` (29 verificações, dois temas). Os roteiros da lista de preços (`?aba=lista`) e da demanda (`?aba=demanda`) abrem direto na aba certa.
- **O índice das sugestões do conserto é marcado como velho** quando uma OS é arquivada, editada, removida ou importada (`RepairHistoryService.forget`): a próxima consulta ainda responde na hora e o relê por trás, então a OS recém-salva entra nas sugestões logo em seguida. Roteiros que semeiam por SQL esperam o índice enxergar o semeio (até 75 s).

- **Qualidade na faixa (2026-10-10, 2ª tela do redesenho).** `QualityPanel` usa `look="band"` (seção `quality` em `BAND_SECTIONS`): os quatro números (catálogos utilizáveis, precisam de atenção, perguntas pendentes, peças consultáveis) estão na faixa, com selo verde "Tudo em ordem"/"Nenhuma pendente" ou amarelo quando há o que fazer. Abas **Visão geral** (cobertura do portfólio + três cartões), **Fila de ação** (selo = soma do que espera o dono) e **Técnico & IA**, com `?aba=resumo|fila|tecnico`. **A cobertura do portfólio fica na Visão geral, que é a aba padrão, porque ela dispara a conferência automática no Portal ao montar** (sair da aba interrompe e voltar retoma; o servidor guarda cada resposta). "Limpar vetores antigos" (manutenção) foi para a aba Técnico. **O aviso "409 já em andamento" no console é esperado** se a tela for recarregada no meio da conferência (single-flight do servidor; o painel repete sozinho): o roteiro `qualidade-faixa.mjs` (29 verificações, dois temas) ignora só esse erro. **Gancho `lib/use-url-tab.ts`** (`useUrlTab(params)`: a primeira aba é a padrão e fica sem `?aba=`, valor desconhecido cai nela, `replaceState` sem empilhar histórico) é o jeito de toda tela com abas guardar a aba no endereço; `BusinessPanel` e `QualityPanel` o usam. `contraste-completo.mjs` aceita um segundo argumento com parte do nome da tela (`node ../docs/loja-simulada/contraste-completo.mjs dark qualidade`) para medir só uma.

- **Visão geral na faixa (2026-10-10, 3ª tela do redesenho).** `OverviewPanel` (em `AdminPanels.tsx`) agora monta a tela inteira: três números na faixa (catálogos ativos com selo "Tudo em dia"/"processando"/"com falha", peças consultáveis, usuários ativos) e duas abas, **Registro de ações** (padrão) e **Uso de IA e cobertura técnica**, com `?aba=ia`. O `Dashboard` só renderiza `<OverviewPanel />`; o painel de IA (`AssistantObservabilityPanel`) é carregado sob demanda **dentro da aba** (`lazy` + `Suspense`) e `/api/admin/performance` só é chamado quando a aba abre (travado em `visao-geral-faixa.mjs`). `TechnicalDetails` (a seção recolhida) saiu: virou aba. **O e2e do CI (`auth-search.spec.mjs`) clica a ABA "Uso de IA e cobertura técnica" (`role=tab`), não mais um botão.** Roteiro `visao-geral-faixa.mjs` (25 verificações, dois temas).

- **Usuários na faixa (2026-10-10, 4ª tela do redesenho).** `UsersPanel` em `look="band"` (seção `users` em `BAND_SECTIONS`), **sem abas**: quatro números (ativos, administradores, balcão, bloqueados; `—` até a lista chegar, para não piscar em 0), a contagem no cabeçalho ("N usuários", acompanha o filtro) e **o campo de filtro dentro da faixa** (campos de trabalho moram na faixa). Os números são da loja inteira e **não mudam com o filtro**; só a tabela e a contagem do cabeçalho filtram. **Campo sobre o marinho é BRANCO nos dois temas** (mesmas cores da busca do topo: texto `#1b2234`, sugestão `#5f667a`): o `Input` do projeto tem `dark:bg-input/30`, então precisa de `dark:bg-white` junto; sem isso a sugestão cai abaixo de 4,5:1 e o roteiro de contraste NÃO pega (ele só mede texto, não `placeholder`). Roteiros `usuarios-faixa.mjs` (23 verificações, dois temas; confere que os números batem com a tabela) e `usuarios-completo.mjs` (as ações, 24). **Print de botão logo após o clique pega a transição de cor** (o "Fechar" saiu laranja no print e era só a animação): espere uns 500 ms antes do `shot`.

- **Orçamentos na faixa (2026-10-10, 5ª tela; primeira do balcão).** `SavedQuotesPanel` em `look="band"` (seção `quotes` em `BAND_SECTIONS`): o formulário de busca INTEIRO (texto, Tipo Todos/Peças/Conserto, De, Até, Buscar e Limpar) mora dentro da faixa, com os mesmos rótulos e nomes de antes (os roteiros e o Enter dependem deles); a contagem "N orçamentos arquivados" fica no cabeçalho. **Constante `lib/band-field.ts` (`BAND_FIELD`)**: campo branco sobre o marinho nos dois temas, com `dark:bg-white` (o `Input` tem `dark:bg-input/30`) e `[color-scheme:light]` (sem ele, no tema escuro o ícone do seletor de data sai branco sobre branco); `UsersPanel` e `SavedQuotesPanel` usam. O botão de tipo marcado fica branco com texto escuro; os outros, translúcidos. **Armadilha que já aconteceu:** ao pôr uma seção em `BAND_SECTIONS`, o texto `['business', 'overview', 'users', 'quality']` também aparece em `ADMIN_SECTIONS` (linha de cima) e uma substituição por texto acertou a lista errada, o que teria tornado Orçamentos uma tela só de administrador (o `tsc` não pega e os roteiros rodam como administrador): edite pelo nome da constante e confira com `git diff`; `section-routes.test.ts` agora trava as duas listas ("a Administração fica sob /administracao", "toda a Administração já está na faixa"). Roteiro `orcamentos-faixa.mjs` (22 verificações, dois temas); `orcamentos-completo.mjs` segue em 27.

- **Tabela de preços na faixa (2026-10-10, 6ª tela).** `MachineListPanel` em `look="band"` (seção `prices` em `BAND_SECTIONS`): busca, Tecnologia (grupo de botões com contagem), Categoria, Aplicação, "Novidades da lista" e Limpar moram **dentro da faixa**, e a contagem de máquinas (`aria-live`) fica no canto dela; a data da lista vai no cabeçalho. **A faixa só tem os filtros quando há máquinas** (carregando, erro e "ainda não foi carregada" mostram só o título). Em 1366 px os filtros quebram em duas linhas e a tabela ainda começa em ~250 px. Campos e seletores usam `BAND_FIELD` (brancos nos dois temas); o botão marcado (Tecnologia, Novidades) fica branco com texto escuro e o resto translúcido. Nomes que os roteiros usam não mudaram. Roteiro `tabela-faixa.mjs` (22 verificações, dois temas); `tabela-precos-completo.mjs` segue em 70. **Seletor aberto (`<select>`) segue o estilo do navegador** (`color-scheme: light` deixa a lista branca).

- **Conserto na faixa (2026-10-10, 7ª tela, a mais delicada do balcão).** `RepairQuotePage` em `look="band"` (seção `repair` em `BAND_SECTIONS`): **Nº da OS, Cliente e WhatsApp saíram do editor e moram na faixa** (`RepairCustomerFields`, exportado de `RepairEditor.tsx`; campos brancos com `BAND_FIELD`, mesmos `id` `repair-os`/`repair-customer`/`repair-phone`), como no mockup aprovado. Eles vêm ANTES das linhas no HTML, então a ordem do Tab é OS, cliente, WhatsApp, linhas (travado). **Consequência para roteiros:** esses três campos NÃO estão mais dentro da região "Orçamento de conserto"; procure-os na página (`page.getByLabel('Nº da OS', { exact: true })`), nunca por `editor.getByLabel`. O editor começa em ~215 px, por isso a altura passou de `100dvh − 9rem` para `100dvh − 15rem` (mesma área útil de linhas, sem o bloco do cliente). **A Pasta agora rola por dentro** (`lg:max-h-[calc(100dvh-15rem)]`): com 30 OS ela esticava a página para 2.478 px. "Importar antigos" (administrador) continua no cabeçalho da Pasta, não na faixa. Roteiro `conserto-faixa.mjs` (18 verificações, dois temas; sempre começa e termina com a cesta de conserto vazia); `conserto.mjs` segue em 58. **`conserto-sugestoes.mjs` reprova quando o índice do servidor está velho** (ele semeia por SQL e o índice vive 60 s; falhou do mesmo jeito na `main`): espere 60+ s e rode de novo antes de achar que quebrou (64 verificações quando o índice está fresco). `contraste-completo.mjs` agora também mede o Conserto.

- **Atendimento na faixa (2026-10-10, 8ª tela, a principal do balcão).** `TechnicalAssistantWorkspace` ganha a faixa (`.cv-band`, seção `parts` em `BAND_SECTIONS`) com **o campo de busca grande (branco, 56 px, `BAND_FIELD`) + Limpar + Buscar e a `CounterSessionBar`** (convite "Máquina, PNC ou cliente", os quatro campos de contexto e o resumo cliente/modelo/PNC, tudo restilizado para o marinho: botões `bar`, rótulos `text-band-muted`, campos brancos). **Sem sobreposição** (diferente das outras telas): os atalhos de máquina/documento vêm logo abaixo da faixa e não podem cair meio sobre o marinho. O resto da tela (resultados, orçamento ao lado, painéis e diálogos) **não mudou**, só ganhou o contêiner `max-w-[1560px] px-7` (o `main` agora vai de borda a borda, como nas demais). Nada de lógica de busca foi tocado. **O Ctrl K da busca grande fica**: com 1366 px o campo tem ~1.000 px e o texto cabe inteiro (medido: `scrollWidth ≤ clientWidth`, também com o placeholder longo do contexto). As sugestões e as últimas buscas abrem por cima da faixa (a `.cv-band` não corta; medido). **"Não pode ficar mais lento" foi MEDIDO**: `atendimento-tempo.mjs` (mediana de 5 buscas até a primeira linha, mais 50 teclas seguidas) deu antes 258/200/478 ms e 620 ms, depois 191/152/408 ms e 498 ms (nenhuma pior; a diferença para menos é ruído da máquina). Rode-o antes e depois de qualquer mudança nessa tela. Roteiro `atendimento-faixa.mjs` (19 verificações, dois temas); `atendimento-completo` 56, `teclado-completo` 16, `busca-modelo` 6 e `orcamento-completo` 69 seguem passando.
- **Render pode não publicar um merge (de novo, 2026-10-10, no #321).** Mesmo defeito do #280: a Render ficou sem deploy novo (o `health/live` seguiu na revisão anterior por 10 min) e o `trigger_deploy` à mão resolveu em ~1 min. Depois de cada merge, confirme o `revision` do `/health/live` e, se não mudar em uns 3 min, olhe `list_deploys` antes de esperar mais.

- **Catálogos na faixa (2026-10-10, 9ª tela).** `CatalogsWorkspace` em `look="band"` (seção `catalogs` em `BAND_SECTIONS`): a busca ("Buscar catálogo por modelo, arquivo, PNC ou aplicação") e o filtro de categoria moram na faixa (`BAND_FIELD`), "Gerenciar biblioteca" (administrador) é botão `bar` no cabeçalho e a contagem fica ao lado. **Armadilha:** a visão "Gerenciar biblioteca" (`CatalogsPanel`) NÃO usa `PageFrame`, e com o `main` sem margem ela ficava colada na borda: ela ganhou o próprio contêiner (`mx-auto max-w-[1500px] px-5 py-5`). **Toda tela que renderiza fora do `PageFrame` dentro de uma seção em `BAND_SECTIONS` precisa do próprio contêiner.** Roteiro `catalogos-faixa.mjs` (14 verificações, dois temas, inclui abrir e voltar da biblioteca); `catalogos-completo` 22, `biblioteca-completo` 15 e `catalogos-motores` 22 seguem passando. **O redesenho esqueceu de pôr `look="band"` uma vez:** sem ele o `PageFrame` ignora a prop `band` em silêncio (os campos somem e o roteiro reprova por não achar o campo).

- **Redesenho da faixa CONCLUÍDO (2026-10-10): 9 telas em produção (#314–#323), o login ficou como está de propósito.** Negócio, Qualidade, Visão geral, Usuários, Orçamentos, Tabela de preços, Conserto, Atendimento e Catálogos usam `PageFrame look="band"` (todas em `BAND_SECTIONS`). **O login NÃO foi convertido, e não deve ser sem o dono pedir:** ele já tem a identidade (painel marinho com a marca e ação em laranja, mesmos tipos e tokens), e o degradê do painel para em `brand-800` DE PROPÓSITO (comentário em `pages/Login.tsx`): terminar em tom igual ao fundo da página no escuro fazia o painel parecer "cortado no meio". Trocá-lo pelos tokens da faixa (`--band-from/--band-to`, bem mais escuros no tema escuro) reintroduziria esse defeito. A tela de login é um momento de marca de largura inteira, não uma tela de trabalho com faixa. Para nova tela: use o roteiro "Como converter" de `redesign-direcao-b-andamento` (memória) e as lições acima (`look="band"` obrigatório, contêiner próprio fora do `PageFrame`, editar `BAND_SECTIONS` pelo nome da constante, medir o tempo no Atendimento).

- **Pagamento do orçamento de MÁQUINA (2026-10-10, dono).** Três meios: **À vista, cartão em até 10x sem juros e boleto em até 6x sem juros**, e o cliente escolhe entre os que a loja oferece, então os botões ligam e desligam (podem valer vários). **O boleto exige consulta e NÃO vale na primeira compra**: vem desmarcado (À vista e cartão já vêm marcados), mostra ao atendente "Consulte antes: o boleto não vale na primeira compra." quando marcado, e no PDF sai "Boleto em até 6x sem juros (sujeito a análise)". "Outro" abre um campo para escrever (saída para "nenhum destes", 120 caracteres); nada marcado e nada escrito sai "A combinar". Lógica pura em `lib/machine-payment.ts` (ordem fixa: à vista, cartão, boleto, escrito; `machine-payment.test.ts`), tela em `MachinePaymentTerms`, usada só no `MachineQuoteDialog`. **O orçamento de máquina NÃO é arquivado nem vai para o WhatsApp** (dono: "não tem necessidade de ficar arquivado"): só baixa/imprime o PDF. Peças e conserto seguem com À vista / 30 dias / outro. Roteiro `orcamento-maquina-pagamento.mjs` (27 verificações, dois temas, lê o PDF). **Armadilha de teste:** o texto do boleto QUEBRA em duas linhas no PDF ("(sujeito a" / "análise)"), então confira só o começo; e nunca procure uma sequência de letras repetidas no corpo do PDF (os bytes da imagem formam "ZZZZZZ" por acaso): use uma palavra distinta.

- **Auditoria geral de 2026-10-10 (dono: "engenharia reversa em todo o site… deixe o site perfeito").** Método: `auditoria-rodada.sh` completa + varredura estrutural de TODAS as telas nos dois temas (`varredura-telas.mjs`: campo/botão sem nome, imagem sem alt, id repetido, h1, salto de título, alvo pequeno, texto pequeno, rolagem horizontal, erro de console e 4xx/5xx de rede) + produção só em leitura (logs de erro da Render, avisos do Supabase, alertas do GitHub, tamanho do banco, cabeçalhos HTTP). **Saúde medida:** backend 942 testes (os 3 que falham são os de RabbitMQ, que pedem broker), frontend 345, `npm audit` 0, toda rota exige login, produção na `main`; banco em **172 MB de 500 MB** (a tabela `Part` sozinha tem 89 MB, em grande parte vetores legados: o botão "Limpar vetores antigos" da Qualidade > Técnico libera isso quando o dono quiser); servidor ~110 MB de memória e a mesma instância no ar por 8+ horas (o keepalive funciona); um único incidente de erro nos logs em 7 dias (08/10, conexão ociosa com o Postgres/RabbitMQ que se recuperou sozinha). **Achados corrigidos:** (1) **o botão Voltar do navegador (e o lateral do mouse) SAÍA do app**, porque trocar de tela só reescrevia a barra de endereço (`replaceState`): agora cada troca de tela é um passo de histórico (`pushState` em `handleSectionChange`) e o `Dashboard` acompanha o `popstate`; trocar de ABA dentro da tela (`?aba=`) e buscar continuam sem criar passo, de propósito; (2) **a barra de cima estourava em larguras úteis menores que 1366** (Windows a 150% de zoom em tela Full HD dá 1280 px: +13 px; 1152: +141; 1024: +269): o rótulo "Orçamento" vira só ícone e contagem abaixo de 1440 px (continua com nome para leitor de tela, `sr-only`), a busca do topo some abaixo de 1200 px e o nome "CogniVault" abaixo de 1100 px; **sem a busca do topo, Ctrl K leva ao Atendimento**; (3) 28 alertas do CodeQL que eram de 5 scripts descartáveis da migração de cores (`migrar-tokens*.cjs`, apagados); (4) rótulo no filtro da Qualidade, títulos `h3`→`h2` na aba Técnico, área de clique de 32 px no botão de conteúdo de Orçamentos e o aviso do lint em `App.tsx` (agora declarado). Roteiros `navegacao-voltar.mjs` (37 verificações, dois temas, inclui 5 larguras) e `varredura-telas.mjs`. **Deixado de propósito:** CSP no HTML do site (o front não usa `dangerouslySetInnerHTML`; o ganho é pequeno e o risco de quebrar a prévia de PDF e as fontes é real), mover `pg_trgm`/`vector` para outro schema (risco em produção, aviso de severidade baixa), apagar os 17 índices "sem uso" do Supabase (o banco tem pouco tráfego: "nunca usado" não prova que sobra) e as tabelas de recursos já removidos (`Favorite`, `SearchFeedback`: custam quase nada).

- **Auditoria, 2ª rodada (2026-10-10): servidor fora do ar e teclado.** (1) **Falha em `/api/me` NÃO é sessão inválida.** O `Dashboard` tratava qualquer erro (5xx, HTML de erro do rewrite com status 200, rede, tempo esgotado) como "sem sessão": apagava a sessão local, trocava o orçamento para o escopo anônimo e mandava ao login; a tela de erro "Não foi possível abrir o CogniVault" existia mas **nunca aparecia** (o `navigate('/login')` rodava logo depois). Agora **só 401/403** vão ao login; o resto mostra essa tela e **tenta de novo sozinho** (2 s, 4 s, 8 s… até 30 s) e entra quando o servidor volta, com a sessão e o orçamento intactos. Importa porque a Render free dorme/reinicia a cada deploy. Roteiro `api-fora-do-ar.mjs` (28 verificações, dois temas; reprova sem a correção). (2) **Foco depois de fechar um painel**: os painéis da peça e da máquina (Atendimento) são montados só quando abrem, sem botão-gatilho, e o foco pulava para "Ir para o conteúdo" (o atendente perdia o lugar na lista); o diálogo do orçamento também. `lib/use-restore-focus.ts` guarda o último elemento focado FORA de diálogos/menus e devolve o foco a ele ao fechar (Esc, X, clique fora; se sumiu, vai para a busca). **Só nos fechamentos do próprio atendente**: o painel que fecha porque uma busca nova começou deixa o foco com a busca. Roteiro `foco-paineis.mjs` (13 verificações, dois temas; reprova sem a correção). **Ainda aberto, baixo valor:** diálogos abertos por item de menu (Usuários > Definir nome/Redefinir senha) e o orçamento de máquina também devolvem o foco ao topo; o foco fica preso dentro de todos eles (45 Tabs) e Esc fecha. (3) **Como confirmar a publicação:** o `revision` de `/health/live` é do BACKEND (Render); merge só de frontend pode não gerar deploy lá (#321 e #327 não geraram) e **isso não é problema**: o frontend é da Vercel, confirme com `gh api repos/<repo>/commits/<sha>/status` ("Vercel: success") e, se quiser, procurando um trecho novo no bundle publicado.

- **Auditoria, 3ª rodada (2026-10-10): R$ 0,00 NÃO é preço.** Medido na produção (só leitura): das 26.694 peças da loja, **14 estão com preço 0**, 133 abaixo de R$ 1 (porcas, o-rings: legítimas) e 11 acima de R$ 50 mil (motores completos e um elevador: legítimas); sem duplicata, sem código fora do padrão. As 14 apareciam na busca como **"R$ 0,00" com o "+ Orçamento" ligado** (e uma de preço negativo apareceria "-R$ 3,00"), então o orçamento podia sair para o cliente com a peça de graça. **`utils/store-price.ts` (`storePrice`) é o único portão:** só devolve o preço se for maior que zero (zero, negativo, NaN e vazio viram `null`), e é usado em todos os pontos em que o servidor entrega preço de `MasterPart` (busca comercial e rápida, detalhe da peça, painel oficial da Husqvarna, `/api/master-parts/prices`, busca operacional); a tela já sabia o que fazer com `null` ("Consultar no Parceiro", e a peça entra no orçamento SEM valor para o atendente digitar), e o `PartRow` também recusa preço ≤ 0 por garantia. **Ao ler preço de `MasterPart` num lugar novo, passe por `storePrice`.** Roteiro `preco-zero.mjs` (12 verificações, dois temas; cria 3 peças de teste na simulação e apaga; provado por mordida) e `store-price.test.ts`. **Armadilha de teste:** NÃO rode roteiros do navegador enquanto a suíte do backend roda na loja simulada: a tela grava buscas sem resultado (`SearchMiss`) no mesmo banco e os 3 testes de `search-miss.service.test.ts` reprovam por interferência (passam sozinhos).

- **Auditoria, 4ª rodada (2026-10-10): fuzz de TODAS as rotas da API.** `fuzz-api.mjs` (só na loja simulada; ~2.600 chamadas em 82 rotas, 8 em paralelo, uns 10 min; grava cada achado na hora em `$FUZZ_OUT`) manda lixo (id inválido, texto de 20 mil letras, nulo, aspas, emoji, tipo errado, corpo malformado) e procura 500, lentidão e vazamento de detalhe interno. **Resultado: nenhum vazamento** (o tratador de erros devolve mensagem genérica), **nenhum 500 por tipo errado, corpo torto ou texto enorme** (a validação por rota funciona) e **um único defeito: o caractere nulo (`%00` / `\u0000`) dava 500 em 12 rotas**, porque o Postgres o recusa já dentro da consulta. **`rejectNullBytes`** (em `request-validation.middleware.ts`, montado em `app.ts` logo depois do corpo JSON) responde 400 "Texto inválido: o caractere nulo não é permitido." para nulo no endereço (decodificado e cru) ou em qualquer texto/chave do corpo; `%2500` (o texto "%00" escapado), acento, emoji, aspas e percent-encoding quebrado passam. Upload (multipart) não passa por esse portão. Roteiro `api-entrada-hostil.mjs` (39 verificações, dois temas; reprova sem o portão) e 2 testes novos em `request-validation.middleware.test.ts`. **Falso alarme que não é defeito:** as duas exportações CSV estouram 20 s quando 8 chamadas pesadas rodam juntas (isoladas: `quotes.csv` 0,1 s, `price-list.csv` 22 mil linhas em ~5 s); e uma busca de 20 mil letras responde 431 (limite de cabeçalho do Node), que é o comportamento certo. **Segurança por fora, medida e boa:** HSTS, `nosniff`, `X-Frame-Options: DENY`, CSP na API, cookie `HttpOnly`+`SameSite=Lax`+`Secure` em produção, CORS fechado para origem estranha, limitador de login, `npm audit` 0.

- **Auditoria, 5ª rodada (2026-10-10): código morto.** Varredura de exportações que ninguém importa (frontend e backend, conferida com grep no repositório inteiro, workflows incluídos). Removidos: o componente `VerificationBadge` e `verificationLabel`, e os tipos `ChatResponse`, `FavoriteItem`, `CrossReferenceResult`, `CrossReferenceModel`, `AdminFeedback`, `FeedbackOption` e `RetrievalSource` (recursos que já saíram do balcão); no backend, `invalidateWorkContextAfterLocation` (a rota de prateleira foi removida), `invalidateSearchFeedbackCache`, `hasDomainKnowledge`, `hasKnownPartVocabulary` e os tipos `TechnicalContextHit` e `DeterministicExtraction`. Sobraram ~80 `export` de tipo usados só dentro do próprio arquivo: inofensivos, deixados. **Antes de apagar qualquer coisa que "parece sem uso", confirme com grep no repositório inteiro** (já houve falso positivo por não olhar `.github/workflows`).

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

### Rodada 2 de auditoria (2026-10-09): três perdas de dado silenciosas na cesta

Procuradas de propósito com casos que o roteiro de sempre não cobria (duas janelas, sessão que cai, rede que cai, outro atendente no mesmo PC). Roteiro `rodada2-abas-sessao.mjs` (19 verificações, dois temas) e `QuoteCartContext.sync.test.tsx`, os dois provados por mordida.

1. **Duas janelas do mesmo navegador apagavam o item uma da outra.** Cada aba mandava o estado INTEIRO ao servidor (`PUT`), então a que gravava por último vencia sem aviso (a aba 1 lançava AAA, a aba 2 lançava BBB, o servidor ficava só com BBB). Agora as abas são UMA cesta: quando OUTRA aba muda o cache local (`storage`), esta adota o que está lá e descarta o que tinha na fila de envio (quem grava no servidor é a aba que escreveu). Compara com o valor ATUAL do armazenamento, não com o do evento, para as duas convergirem em vez de trocarem versões. Outro aparelho continua "o último a gravar vence" (não resolvido: seria preciso versão no servidor).
2. **O que o balcão digitou sem rede (ou com a sessão caída) perdia para a versão velha do servidor.** A hidratação dizia "o servidor manda, exceto se ele está vazio"; então item lançado offline em cima de uma cesta que já existia no servidor sumia ao recarregar com a rede de volta (e o mesmo na queda de sessão: a linha digitada depois da queda não voltava depois de entrar de novo). Agora cada edição grava no cache a hora da última edição NÃO enviada (`cognivault_quote_unsynced` / `cognivault_repair_unsynced`; sai quando o servidor confirma e a fila esvazia) e, **se ela existe e tem menos de 48 h, o local sobe para o servidor** em vez de ser trocado. Sem a marca (ou velha demais, porque outro aparelho pode ter mexido), o servidor continua mandando.
3. **A cesta de CONSERTO não era separada por usuário no navegador.** `lib/quote-storage-scope.ts` só trocava as chaves do orçamento de peças; as do conserto (`cognivault_repair_*`, com nome de cliente e número de OS) ficavam para o próximo atendente do mesmo PC, e a regra "local com itens e servidor vazio sobe" as **gravaria na conta dele**. Agora as chaves do conserto e as marcas `unsynced` andam por usuário junto com as de peças. **Armadilha do roteiro:** o `open()` regrava o e-mail do administrador a cada carga de página (initScript); para testar troca de conta, navegar pelo menu e nunca por `page.goto`.

4. **Emoji (e árabe, japonês) no texto estragava o PDF do cliente.** As fontes padrão do PDF só têm Latin-1 e a pontuação do Windows-1252; um emoji colado do WhatsApp no nome do cliente ou na descrição virava lixo ("Ø=Þ") e **desfazia o espaçamento da frase inteira** ("I t e m  1  ç ã o"). `lib/pdf-text.ts` (`makePdfSafe`, aplicado nos três geradores: orçamento de peças/conserto, de máquina e ficha da máquina) limpa TODO texto que passa pelo jsPDF (escrever, medir, quebrar linha, e por isso também o que o autoTable desenha): emoji, bandeira, tom de pele e caracteres de largura zero **saem**; `≥ → ≤` viram `>= -> <=`; o que a fonte não tem (árabe, japonês, russo) vira `?` (a falta aparece, em vez de o nome sumir sem aviso); acento "solto" é recomposto (NFC). O WhatsApp NÃO passa por isso (lá o emoji funciona). `pdf-text.test.ts` (7) e o roteiro `pdf-texto-estranho.mjs` (39 verificações, dois temas, PDF de conserto e de máquina), provados por mordida. **Achado menor, sem correção:** preço acima de R$ 10.000.000 por unidade é recusado pelo servidor com a mensagem genérica "Itens ou dados do orçamento inválidos" (o PDF sai mesmo assim); o balcão não digita isso.

**Rede LENTA (não caída), passada sem defeito achado, guardada como regressão** (`rodada2-rede-lenta.mjs`, 13 verificações, dois temas): gravar a lista de preços com a resposta demorando 6 s não deixa gravar duas vezes (o botão bloqueia; um só pedido; +10% e não +21%); recarregar a página no meio da gravação deixa **tudo ou nada** (6 preços e 2 códigos, ou nenhum) e a tela conta a verdade pela linha "Última atualização"; a resposta ANTIGA da busca que chega 7 s depois não cobre a busca nova. **Partida a frio da Render** (primeira chamada de busca 14 s mais lenta, medida na tela): aparece primeiro o resultado rápido do cadastro (50) e o do catálogo entra quando o servidor responde; nada quebra. **Ainda NÃO coberto:** duas pessoas gravando a MESMA OS em aparelhos diferentes (continua "o último vence").

### A janela de 5 s do Prisma derrubou a cesta em produção

Log do Render, **18/09/2026 21:16 UTC**, no `PUT /api/quotes/draft`:

    Transaction already closed: A commit cannot be executed on an expired
    transaction. The timeout for this transaction was 5000 ms, however
    6725 ms passed since the start of the transaction.

Uma ocorrência em 30 dias de log. O atendente recebeu 500 e a cesta ficou só
no navegador dele (`syncState` = "Só neste aparelho").

**Não foi trabalho pesado**: a transação tem três comandos (apagar itens,
recriar, atualizar o cabeçalho). Foi latência — Render free falando com
Supabase free, com o banco frio ou disputado. O padrão do Prisma para
transação interativa é 5 s, e ele não é generoso nesse cenário.

O detalhe que fecha o diagnóstico: **todas as outras transações desta base já
declaravam o teto** (`import-price-list`, `ai.service`,
`semantic-index-maintenance`). As duas da cesta eram as únicas no padrão, e
são justamente as do caminho crítico do balcão. Agora usam
`QUOTE_TX_OPTIONS` (`{ maxWait: 10s, timeout: 20s }`), travado em
`quote-transaction.test.ts`.

Do lado da tela sobrava uma segunda falha, mais silenciosa: depois do erro o
`catch` zerava `pendingRef`, e a cesta só era reenviada na **próxima
edição**. Quando a falha cai no último item adicionado — que é o caso comum,
põe a peça e vai gerar o PDF — ela ficava fora do servidor indefinidamente, e
trocar de aparelho perdia o atendimento. `flushBeforeUnload` também só grava
quando esse ref tem algo, então fechar a aba depois da falha perdia a versão
do servidor junto.

Agora o estado volta para a fila e há reenvio automático com espera crescente
(`DRAFT_RETRY_DELAYS_MS`, ~1,5 min somados, que cobre o cold start do Render).
Reenviar é seguro porque o `PUT` é do estado inteiro: nunca duplica item.

Dois detalhes que não são estilo:

- **O contador de falhas é estado, não ref.** `setSyncState('offline')` com o
  estado já `offline` não re-renderiza, então uma segunda falha não acordaria
  o efeito de reenvio. O número muda sempre.
- **A escada não zera a cada edição.** Zerar exigiria chamar um setter de
  dentro do updater de `setItems`, que roda na fase de render. A edição já é
  coberta pelo debounce, que manda o estado inteiro de qualquer forma.

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

## Toda tabela nova nasce com RLS ligado

As 23 tabelas do banco têm Row Level Security ligado **com zero políticas**.
Isso não é descuido: a aplicação conecta como `postgres`, dono das tabelas, e o
dono passa por cima do RLS enquanto `FORCE ROW LEVEL SECURITY` estiver
desligado. Quem fica de fora são os papéis `anon` e `authenticated` das
bibliotecas cliente do Supabase — que é exatamente a intenção.

**Já esqueci isso uma vez.** A migração que criou `OfficialPartIndex` em
2026-09-19 não ligou o RLS, e ela foi para produção como a única tabela aberta
do banco. O risco não era a leitura (código de peça de catálogo público) e sim a
**escrita**: com a chave `anon`, dava para inserir um mapeamento peça→motor
falso, que apareceria no balcão como se viesse da fonte oficial. Corrigido pela
migração `20260920010000_official_part_index_rls`.

Ao criar tabela, acrescente na mesma migração:

    ALTER TABLE "NomeDaTabela" ENABLE ROW LEVEL SECURITY;

O Prisma não faz isso sozinho, e o painel do Supabase só avisa depois que a
tabela já está em produção.

## A suíte de testes não roda contra a produção

Este arquivo já disse que não havia `DATABASE_URL` no ambiente de
desenvolvimento. **Era falso**: o `.env` do backend aponta para o Supabase de
produção, o Prisma o carrega sozinho, e `npm test` sempre rodou contra ele sem
ninguém ver. Descoberto em 2026-10-06 por dois sintomas no mesmo dia:

- um teste "com o banco fora" não simulava falha nenhuma — a consulta
  funcionava, devolvia vazio, e o `catch` nunca era exercitado (verde falso). Ele
  passou a reprovar quando uma consulta real da Briggs indexou o código que o
  teste usava;
- o teste de `OfficialPartIndexService.record` chamava `upsert` de verdade e
  deixou **duas linhas inventadas** em `OfficialPartIndex` na produção, entre
  elas um pareamento Kawasaki peça→motor fictício com a procedência "oficial" —
  exatamente o dado que o produto jura nunca mostrar. **Eu afirmei, antes disso,
  que os testes só liam. Estava errado.**

Agora `npm test` passa por `scripts/guard-test-database.ts`, que recusa quando o
host é de provedor hospedado (`utils/test-database-guard.ts`: supabase, render,
neon, rds). Por sufixo de host conhecido, **não** por lista de permitidos: o CI usa
`localhost`, e uma lista de permitidos quebraria `host.docker.internal` e nome de
serviço de container sem proteger nada a mais. A mensagem nunca imprime a URL. O
escape `ALLOW_PRODUCTION_DB_TESTS=1` existe de propósito — trava sem saída é
contornada de formas piores.

**Três arquivos precisam de Postgres de verdade e só passam com um** (medido
rodando a suíte contra uma porta morta): `ai-decision-cache.service.test.ts`,
`bounded-portal-coverage.service.test.ts` e `husqvarna-live-part.test.ts`. Eles
gravam e depois limpam; no CI isso é seguro, na máquina de desenvolvimento só com
o banco descartável da seção abaixo.

**Teste de resiliência a falha injeta a falha.** Padrão em
`controllers/no-reject.test.ts` e `official-part-index.test.ts`: trocar o método
do Prisma por um que lança, e afirmar que o `catch` foi exercitado (o espião foi
chamado). Contar com "não há banco aqui" é o erro que originou esta seção.

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
**Desde 2026-10-08 o servidor ENTREGA o PDF (inline, pela origem do app) em vez de redirecionar** para o visualizador: para o dono o botão "Lista de peças Briggs"
caía no site da Briggs, e só "Todos os manuais" funcionava (servidor e um Chromium de teste recebiam o PDF; o navegador dele não, e não reproduzimos a causa). Se o
visualizador não devolve PDF de verdade, a rota manda para "Todos os manuais" do motor, nunca para um beco sem saída. `BriggsIplService.pdfFor` guarda 4 PDFs na memória.

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

**CORREÇÃO (2026-10-07): a Kawasaki É integrada, e este parágrafo dizia o contrário.**
A conclusão antiga ("não dá para integrar", por causa do reCAPTCHA) estava errada:
o reCAPTCHA protege a *página* do localizador, não os endpoints do ARI PartStream,
que respondem do servidor em JSON. O mapa medido está em
`docs/KAWASAKI_ARI_PARTSTREAM.md`; o código é `services/kawasaki-partstream.service.ts`,
as rotas `/api/kawasaki/engine` e `/api/kawasaki/assembly` e a tela
`KawasakiEnginePanel`. Hoje a Kawasaki tem o mesmo que a Husqvarna na vista explodida
(desenho dentro do app com zoom e posições clicáveis, código, preço e prateleira da loja,
"+ Orçamento") mais aviso de série separado do nome e filtro por conjunto. O que continua
sem existir nela é substituição de código e "também usado em" (ver "O teto do ARI da
Kawasaki"). O modelo (série + spec) ainda vem da plaqueta: o Portal Husqvarna não o informa.
A app key é do site da Kawasaki; o dono decidiu usá-la, e o plano de reserva é o link do conjunto.

## Kohler e o motor de cada máquina (2026-10-08)

Dono mandou o link do catálogo da Kohler (`partnersportal.kohlerpower.it/customer/servicepartscatalogue`, "Global Parts Lookup") e pediu para
ligar o motor ao trator, ao giro zero e à máquina, **mostrando a vista explodida do motor** ali mesmo.

- **A Kohler responde SEM login.** Medido: `partfinder?EngineMatNumber=SV540-3212&SectionId=101&GroupCode=01` devolve HTML pronto (sem API JSON) e o desenho
  de cada grupo é um SVG público (`servicepartcatalogueimages/gasoline/SV470_01.svg`). Spec desconhecido redireciona (302) para a busca, sem cabeçalho de motor:
  é "sem catálogo", não erro. Leitor puro em `utils/kohler-catalog.ts` (regex, testado com HTML inventado), transporte e cache em
  `services/kohler-catalog.service.ts`, rotas `/api/kohler/engine` (grupos) e `/api/kohler/group` (peças + desenho), tela `KohlerEnginePanel`.
  O grupo vem de `SectionId` (101, 102...) e o `GroupCode` é o final dele (01, 02...).
- **O que a Kohler dá a mais que a Kawasaki: substituição de código.** Cada linha tem `replaces` / `replaced by` com o texto do que foi trocado; "DISC. [not available]"
  vira `discontinued` e **não** é sugerido como código para pedir. Preço não vem: o preço é da loja (`master_parts`), como nos outros fabricantes.
- **O SVG da Kohler NÃO declara largura e altura**, só `viewBox`: como `<img>` ele colapsava a zero. O `ExplodedView` ganhou `aspectRatio` (vem do `viewBox`,
  devolvido como `referenceWidth/Height`). **As posições** são os `<text transform="translate(x y)">N</text>` do SVG, convertidos em % do `viewBox`; só entram as que
  estão na tabela do spec (o desenho é da SÉRIE e traz números de peças que este spec não usa). Mudou o formato do cache do grupo? Troque a chave (`GROUP_V2`).
- **O spec Kohler casa o regex do Briggs** (letra, hífen, 4 caracteres): `machineQueryHint` testa o Kohler ANTES (`kohlerModel`; Briggs começa por dígito, Kohler por letras).
- **Motor de cada máquina** (`services/machine-base-engine.ts`, `GET /api/machines/engines?model=`, cartão `MachineEnginePanel` no painel da máquina): junta o que o IPL
  cita (`ENGINE_APPLICATIONS`, por PNC) com os pares que o dono informou (LTH1842 → Kohler SV540-3212, R316TX → Kawasaki FS481V-CS55, TS138 → Husqvarna HS452). O cartão
  abre o catálogo do motor (Kohler, Kawasaki ou Briggs) com a vista explodida e **sempre manda conferir a plaqueta ou o número de série do motor**: o motor muda com o ano.
  **Só exibe.** Não acrescente par do dono em `ENGINE_APPLICATIONS`: `resolveEngineCatalogRoute` resolve direto quando há uma entrada sem PNC, e TS138 varia por PNC.
  Mais pares: o dono informa, e entram em `OWNER_BASE_ENGINES`.
- **Campo "modelo da plaqueta"** no cartão do motor (`parseEngineInput` em `lib/engine-input.ts`): o atendente digita o motor que está na plaqueta e o catálogo abre ali mesmo, sem fechar a máquina. A
  marca sai do FORMATO (Kohler começa por letras de série conhecidas + 4 dígitos; Kawasaki F?###V + spec de 2 letras e 2 dígitos; Briggs começa por dígito e tem letra no 1º bloco; HS/HV é
  Husqvarna), aceita minúsculo, espaço, hífen, código colado e a letra final (`FX921VHS04S` -> `FX921V-HS04`), e o que não reconhece recebe uma mensagem com exemplo, nunca um palpite. O cartão
  também aparece, só com o campo, em máquina de categoria que leva motor (trator, giro zero, cortador, rider...) mesmo sem vínculo; motosserra não ganha cartão. Só aparece depois da resposta (senão pisca).
- **As fontes do motor, da mais forte para a mais fraca** (cada linha do cartão diz a sua origem e a precisão): `PORTAL` (o IPL do Portal cita o motor para o PNC aberto; o texto
  do `comment`), `LISTA` (campo **"Motor" da ficha da lista de preços vigente**, `enginesFromListingSpec`), `IPL` (`ENGINE_APPLICATIONS`, pode ser de OUTRO ano da máquina) e `DONO`.
  O mesmo motor em dois graus de detalhe (série FS481V e modelo FS481V-CS55) vira UM, o mais específico. **Nada é escolhido quando as fontes divergem**: no Z460 o Portal diz
  "Kawasaki, leia a plaqueta", a lista cita FR691V e FS691V e o IPL antigo diz FX730V; as quatro aparecem e a plaqueta decide.
- **O código completo da ficha divide em série + spec de 4 caracteres + letra final que o catálogo não usa**: `FR730VFS16S` abre como `FR730V-FS16`. Nem todo spec da ficha existe no
  catálogo da Kawasaki (`FR691V-JS00` e `FX921V-HS06` não existem): o painel então oferece "Ver os specs da série". Kohler/Kawasaki só com a série não fingem abrir catálogo (`precision: SERIE`).
- **Auditoria que prova isso** (`npm run` não; rode `DATABASE_URL=<banco LOCAL> npx tsx src/scripts/audit-machine-engines.ts`; recusa banco hospedado e grava o relatório fora do repositório):
  para as 151 máquinas da lista, monta o mesmo vínculo do balcão e confere que o catálogo de cada motor responde. Resultado de 2026-10-08: o Portal quase não nomeia o motor no IPL da linha
  atual (132 de 151 sem citação); a **ficha da lista** é a fonte boa e **desmentiu um vínculo antigo** (Z460 dizia FX730V). Roteiro `maquina-motor.mjs` (8 máquinas, 4 marcas, 24 verificações).
- **Peças de manutenção do motor** (botão no cartão): Kohler tem o grupo "Maintenance-Fast Moving Parts" e a Kawasaki o conjunto "*MAINTENANCE PARTS"; o painel abre direto nele e põe o
  grupo de manutenção primeiro na lista (`autoOpen="maintenance"`, valor derivado, sem efeito: o lint barra `setState` em efeito). **Índice "peça -> motor" da Kohler**: cada grupo lido grava em
  `OfficialPartIndex` com `source = 'KOHLER'` (a coluna é texto livre, sem migração), e o código digitado mostra de qual motor Kohler ele é, como já era com Briggs e Kawasaki.
- **A Kohler tem trava anti-robô (reCAPTCHA), medido em 2026-10-08.** Depois de uns 6 grupos lidos em sequência ela responde 302 para `home/validaterecaptcha`; a janela passa em poucos minutos. **Não se contorna**
  (é verificação de segurança do fornecedor). O serviço lê com `redirect: 'manual'` para VER o redirect, trata como `unavailable: 'CAPTCHA'` (e erro 5xx/rede como `'ERRO'`), **nunca grava isso no cache de 7 dias**
  (senão um bloqueio vira "sem catálogo" por uma semana), para de insistir por 5 minutos e a tela mostra o aviso com "Tentar de novo" e o link do catálogo oficial. **Não leia vários grupos em sequência de
  propósito** (eu mesmo disparei a trava ao varrer os 18 grupos de uma vez). O desenho (SVG) bloqueado derruba o grupo inteiro: meia vista guardada seria pior que nenhuma. O vigia trata a página de verificação como "fora do ar", nunca "mudou".
- **O service worker (PWA) NÃO pode responder navegação para `/api`** (2026-10-08, achado do dono em produção): o Workbox responde toda navegação com o `index.html`, então um link que abre em nova aba (o PDF da
  Briggs, `/api/briggs/parts-manuals/open`) abria o arquivo e a aba "voltava" para `/atendimento`. **Só existe no build de produção** (o servidor de desenvolvimento não tem service worker, e por isso eu não
  reproduzia). Corrigido com `navigateFallbackDenylist: [/^\/api\//, /^\/health/]` em `vite.config.ts`. Para testar mudança em rota que abre em nova aba: `npm run build`, `vite preview --port 5173` e
  `docs/loja-simulada/sw-api-navegacao.mjs` (provado: antes 5/7, depois 7/7). Quem já usa o app pega o service worker novo no próximo carregamento (`autoUpdate`).
- **Catálogos do balcão não lista PDF de motor de terceiro** (Briggs, Kawasaki, Kohler; `isThirdPartyEngineCatalog` em `CatalogsWorkspace`). Dono: "faz sentido esse catálogo estar aí em PDF se pode ser
  procurado normalmente?". O Atendimento abre o catálogo oficial do motor (vista explodida, código, preço, "+ Orçamento"); os botões antigos levavam a sites externos ou à rota de PDF. A busca por um motor na
  tela de Catálogos mostra o atalho "Motor com catálogo no Atendimento". **Nada foi apagado**: o PDF e as peças lidas continuam na Biblioteca (Gerenciar) e na busca; quem quiser tirar de vez arquiva ou exclui por lá.
  Roteiro `catalogos-motores.mjs` (cria 3 documentos de teste só na simulação e apaga).
- **CSV do motor Kohler (`sparepartcatalogexport/exportcsv?EngineMatNumber=<spec>`, `utils/kohler-csv.ts`)**: UMA chamada devolve o motor inteiro (SV540-3212: 18 grupos, 193 peças, ~10 KB), sem login e sem preço.
  Não traz desenho nem substituição de código (o HTML do grupo traz). Usos: (1) ao ler o catálogo do motor, `indexWholeEngine` grava TODAS as peças em `OfficialPartIndex` de uma vez (antes só os grupos que o balcão
  abrisse), o que alimenta "digitei o código, de qual motor é?" e o relatório de peças sem preço; (2) lista de RESERVA quando a página do grupo está bloqueada (`partial: true`; só vale com o CSV já guardado, porque a trava
  vale para tudo). O CSV só é indexado sob o spec que o próprio texto confirma.
- **Vigia dos fornecedores** (`.github/workflows/supplier-canary.yml`, `scripts/canary-suppliers.ts`): toda segunda e sob demanda, abre UM motor conhecido da Kohler, Briggs, Kawasaki e o site
  público da Husqvarna (345BT) e confere que a leitura ainda devolve o de sempre. **Sem banco e sem segredo** (só funções puras e rede). Saída 1 = formato MUDOU (abre/comenta issue com o label
  `vigia-fornecedores`); 2 = só fora do ar (aviso, sem issue); 3 tentativas antes de desistir. Existe porque a leitura da Kohler é regex em HTML e quebraria em silêncio. Provado por mordida em
  `canary-suppliers.test.ts`. Se a issue abrir, o leitor correspondente em `utils/` precisa de ajuste.
- **Peças de motor consultadas sem preço** (Negócio, `GET /api/admin/engine-parts-without-price`): peças lidas dos catálogos (`OfficialPartIndex`) que a loja não tem com preço > 0, da que serve a mais
  motores para a que serve a menos. É demanda real (alguém abriu aquele motor com cliente na frente). Teste com Postgres, provado por mordida.
- **Rotas removidas em 2026-10-08** (nada no frontend, nos roteiros, nos testes ou nos workflows as usava): `/home`, `/parts/:code/cross-reference`, `PUT /parts/:code/location`, `/documents/:id/refresh-health`,
  `/admin/commercial-imports` e as três de `/admin/feedback` (+ os controladores `admin-feedback*` e `commercial-import`). **Mantidas de propósito:** `/admin/quality/index-semantics` e
  `/admin/quality/search-intelligence` (ferramentas de manutenção do administrador). Os métodos mortos (`crossReference`, `setLocation`, `refreshHealth`) e o `HomeController` com o cache dele saíram em 2026-10-09 (`invalidateHomeCountsCache` ficou: o nome é legado, ele limpa os caches de busca).
- **Motor no orçamento (2026-10-08, pedido do dono).** O botão "Motor no orçamento" em cada motor do cartão marca o motor no orçamento (`draftOptions.engine`, ex.: "Kawasaki FX921V-ES06"); a gaveta mostra a linha "Motor ..." com "Tirar"; o WhatsApp e o PDF levam "Motor: ..." logo depois da máquina. **Sem coluna nova no banco de produção**: no servidor o motor viaja no mesmo texto de `Quote.machineModel` ("Z460 · Motor Kawasaki FX921V-ES06"; `lib/quote-engine.ts` monta e separa, e `restoreQuote`/`fromApiOptions` separam de volta). Motor é o MODELO do motor, não código de peça: pode ir ao cliente. **`clearCart` solta o motor** (não vaza para o próximo cliente; travado em `QuoteCartContext.test.tsx` com prova de mordida). **Últimos motores digitados** (`lib/recent-engines.ts`, `localStorage` por aparelho, 6, só o que o atendente digitou da plaqueta) viram botões abaixo do campo. Roteiro `motor-orcamento.mjs` (20 verificações, dois temas).
- **Atualizar a lista por uma tela (2026-10-08, pedido do dono; Negócio > "Atualizar a lista de preços", só administrador).** O arquivo .html é lido NO NAVEGADOR (`lib/price-list-file.ts`: extrai o bloco `catalogData`, fica com as 4 listas e só os campos que o leitor usa, comprime em gzip; 25 mil linhas viram ~270 KB, o arquivo de 35 MB nunca sobe). O servidor (`services/price-list-update.service.ts`, o MESMO código que o importador de linha de comando agora usa) compara com a loja e devolve o relatório (`POST /api/admin/price-list/preview`, só lê). **Gravar** (`POST /api/admin/price-list/apply?changed=&added=&hash=`) reenvia o arquivo e leva os números aprovados: o servidor recalcula, recusa (409) se o hash do arquivo ou os números mudaram, grava numa transação só (a trava do "antes" do preço continua), relê o banco e confere que sobrou zero diferença, e registra em `CommercialImportRun` e na auditoria. **Nunca apaga**, e o ÷ 0,92 e a recusa de código com dois preços seguem só no servidor. O corpo é `application/octet-stream` (gzip), lido por `express.raw` DEPOIS de autenticação e administrador (`utils/gzip-json-body.ts` tem teto de 40 MB descomprimido contra "bomba de compressão"). Gravar em produção continua sendo ato do dono: a tela mostra o relatório e pede a confirmação com os números. Roteiro `lista-precos-atualizar.mjs` (28 verificações, dois temas; usa arquivo inventado e restaura a loja simulada). **O Enter não pode morrer durante a busca (2026-10-09, achado da auditoria):** o botão "Buscar" ficava `disabled` enquanto a busca anterior estava em "Buscando…" (uma busca sem peça no catálogo, como um código antigo, espera o Portal e a fase "por significado" por alguns segundos), e **com o botão de envio desabilitado o navegador IGNORA o Enter**: o atendente digitava outro código, apertava Enter e nada acontecia. O botão agora nunca é desabilitado (`runSearch` já cancela a busca anterior). Travado em `teclado-completo.mjs` (provado: com o `disabled` de volta, 3 verificações reprovam). Regra geral: **não desabilite o botão de envio de um formulário que o teclado submete**. **Produção fora de sincronia (2026-10-09):** o #280 foi mesclado e a Render **não publicou** (a produção ficou no #279 por 7 horas; o `Production Smoke` ficou vermelho e ninguém viu). Pedido um deploy à mão (`trigger_deploy`) e a rota passou a responder 401 sem login. Agora o `Production Smoke` abre/comenta uma issue com o label `producao-fora-de-sincronia` quando falha. Para conferir: `curl https://cognivault-murex.vercel.app/health/live` mostra o `revision` (12 primeiros caracteres do commit). (O teste `engine-parts-without-price.service.test.ts` agora consulta só os próprios códigos, então não depende do que a loja simulada acumulou. Se `maquina-motor` falhar em "busca reversa" depois de você limpar `OfficialPartIndex`, limpe também o `OfficialSourceCache` das fontes KOHLER, KAWASAKI e BRIGGS: com o cache quente a leitura não reindexa.)
- **Buscas sem resultado (2026-10-09, dono: "pode registrar o texto sem problemas").** Tabela `SearchMiss` (migração `20261009120000_search_miss`, RLS ligado): SÓ o texto digitado, agregado por texto normalizado (minúsculo, sem acento, espaços juntados), com `count` e primeira/última vez. **Sem usuário, sem cliente, sem máquina.** A tela registra quando a busca TERMINA sem nada (`runSearch`: sem peça no catálogo, sem preço no cadastro, Portal não achou e nenhuma consulta de máquina foi anunciada); `POST /api/search/miss` (qualquer logado, responde 202 sem esperar o banco) e o servidor recusa e-mail, link, número com mais de 14 dígitos e texto fora de 2–80 caracteres, e para de abrir linha nova ao chegar a 3.000 textos distintos por loja. **O Portal responde `FOUND` até para código que ele trocou por outro** (o 506027201 é "achado"), então código antigo não vira "sem resultado"; texto no formato de modelo de máquina (letra+dígito, ex. `ZZ999X`) fica de fora de propósito, porque a consulta de máquina é outra e a tela não sabe se ela achou. Uma vez por texto e por carregamento da página (`lib/search-miss.ts`). O dono vê em Negócio > "Buscas sem resultado" (últimos 30 dias, a mais repetida primeiro) e **dispensa** a linha quando cadastra a peça (`GET /api/admin/search-misses`, `DELETE /api/admin/search-misses/:id`). Roteiro `buscas-sem-resultado.mjs` (24 verificações; as duas guardas, "Portal achou" e "máquina anunciada", provadas por mordida).
- **Peças de revisão por máquina (2026-10-09, ideia 1 aprovada pelo dono).** O campo `reparo` da lista de preços (por código e PNC) diz PREVENTIVO, CONSUMÍVEL, PREDITIVO ou CORRETIVO. **Revisão = os três primeiros** (o CORRETIVO, ~19 mil linhas, é conserto depois de quebrar e fica de fora). Tabela `MachineServicePart` (migração `20261009180000_machine_service_part`, RLS ligado; `pnc` de 9 dígitos, espelho da lista), vazia até alguém atualizar a lista **com um arquivo que traga o campo**. **Quem carrega é a MESMA tela de atualização da lista (Negócio):** o navegador manda junto o array `revisao` (só as linhas de revisão, ~3,5 mil), o relatório mostra "Peças de revisão: N peças em M máquinas (X novas, Y saem)", e gravar troca a tabela inteira NA MESMA transação do preço (aprovação por `serviceAdded`/`serviceRemoved`; 409 se mudaram). **Lista sem o campo (antiga) não apaga nada** (`diffServiceParts` devolve 0/0 quando não vem ligação). `GET /api/machines/:pnc/service-parts` (qualquer logado, `no-cache`). Painel `MachineServicePartsPanel` **acima da vista explodida** na máquina: preventivas primeiro, depois consumíveis e preditivas, com preço e prateleira da loja, "+ Orçamento" por linha e "Adicionar revisão ao orçamento" para todas. **Só aparece onde o kit do catálogo interno NÃO cobre o modelo** (`useMaintenanceKit` vazio); onde o kit cobre, o kit manda (senão dois painéis mostrariam a mesma coisa). Medido no arquivo de 05/10/2026: 2.704 linhas preventivas, 795 consumíveis, 53 preditivas. **Para ligar em produção o dono atualiza a lista pela tela com o arquivo de 05/10 (ou um mais novo): preços e códigos já estão iguais, o relatório mostra só a revisão e o botão fica habilitado.** Roteiro `pecas-de-revisao.mjs` (29 verificações, dois temas).
- **Desfazer a última atualização da lista + aviso de mudança grande (2026-10-09, "sistema sem erros").** Cada atualização grava em `PriceListChange` (migração `20261009210000_price_list_change`, RLS ligado) o preço de antes e o de depois de cada código que tocou e quais códigos criou; ficam só as **últimas 5** atualizações. Em Negócio, depois de gravar, aparece "Última atualização: arquivo · data · N preços, M códigos novos" com **Desfazer** (confirmação destrutiva com os números). Desfazer devolve o preço de antes e remove os códigos que a atualização criou (e a seção `LISTA_HTML` deles), **só do que ainda está como a atualização deixou**: preço que o dono ajustou depois fica como está e é contado ("N ficam como estão"). Uma atualização só se desfaz uma vez; recusa (409) se os números mudaram; tudo numa transação com a mesma trava das atualizações; não desfaz a lista de peças de revisão (a próxima atualização a corrige). `GET /api/admin/price-list/last`, `POST /api/admin/price-list/undo?runId&prices&added`, ação de auditoria `PRICE_LIST_UNDO`. O relatório também conta `bigMoves` (preço que passa de +100% ou cai −50%): vira aviso no relatório e no título da confirmação ("N preço muda muito"), porque quase sempre é defeito do arquivo (foi assim com o 594028101, de 9.171 para 10,87). Roteiro `lista-precos-desfazer.mjs` (20 verificações, dois temas; a guarda "preço ajustado depois" e o corte do histórico provados por mordida).
- **Arquivo da lista estragado não grava (2026-10-09).** `fileProblem` (`services/price-list-update.service.ts`): arquivo sem peça legível, ou com **mais de 5%** das linhas sem código ou com preço fora do padrão, é suspeito (o formato pode ter mudado): o relatório mostra o motivo em vermelho, o botão **Gravar** fica desabilitado e **o servidor também recusa** (409), mesmo com os números certos. **R$ 0,00 não é preço** (`parseBrlPrice` só aceita > 0; a lista escreve zero quando falta o valor), e conta como "preço fora do padrão". A lista real tem 0 linhas ilegíveis. Roteiro `lista-precos-atualizar.mjs` (32 verificações; ele agora leva ~80 linhas iguais para o arquivo de teste não passar de 5% ilegível por acidente).- **Vista explodida: três ajustes (2026-10-09).** (1) **Hover/foco acende nos dois sentidos:** passar o mouse (ou focar com Tab) numa posição do desenho acende a linha da peça, e passar na linha acende a posição, que sobe para a frente (`z-20`, anel) porque há posições empilhadas no mesmo ponto; `ExplodedHotspot.onHover` e `PartLine.onHover`. (2) **A máquina reabre na última vista** que o balcão abriu nela (`lib/last-view.ts`, `localStorage` por aparelho e por PNC de 9 dígitos); vista que a Husqvarna removeu cai na primeira, e armazenamento bloqueado só perde o atalho. (3) **Filtro de conjuntos da Kawasaki** (aparece com mais de 8; "Mostrar todos" quando nada casa; o conjunto aberto nunca some). Roteiro `vista-explodida-ajustes.mjs` (23 verificações, dois temas; a gravação da vista e o destaque provados por mordida). **Texto de contagem concorda em número** na tela de atualização da lista ("1 preço", "1 código novo").- **A lista de preços testada de várias formas (2026-10-09, plano 2.3).** `scripts/price-list-formas.test.ts` (12 cenários, tabela de formatos de preço aceitos e recusados, 120 mil linhas), testes de escala em `price-list-update.service.test.ts` (1.250 e 2.500 itens, atravessando os lotes de 400 e de 1.000). **Pior caso medido na loja simulada com a lista real: todos os 22.288 preços +8% gravam em 3,4 s, desfazem em 3,4 s e voltam exatamente ao estado de antes.** Falta medir o tempo na Render free e o teto do proxy da Vercel: por isso, quando a gravação falha por REDE (não por recusa do servidor), a tela **não** diz "nada foi gravado"; manda conferir a linha "Última atualização" (que a tela recarrega), porque a gravação pode ter terminado no servidor.

- **Orçamento de peças no padrão do de máquinas (2026-10-09, dono: "quero os 3 orçamentos na mesma qualidade").** (1) **Prévia do PDF** (botão "Prévia" na gaveta, `QuotePdfDialog.tsx`): mostra o PDF real que o cliente recebe, com **data do orçamento, assunto (Ref.) e validade** editáveis (a validade conta da data), "Baixar PDF" e "Imprimir" (imprime ESTE documento). **A folha de impressão antiga saiu** (tinha outro visual, "Peças Originais Husqvarna"; `#printable-quote` e o CSS de impressão não existem mais). `createPdfQuote` (contexto) monta o PDF sem baixar nem arquivar; `generatePdfQuote` usa ele. Data, assunto e validade valem só para o PDF (o WhatsApp sai com a data de hoje). (2) **Prazo e observação não se contradizem** (achado do dono: coluna "Imediato" com observação "Peça sob encomenda"): o botão e a coluna agora dizem **"Pronta entrega"** (`QUOTE_DEFAULTS.leadTimeNow`; orçamento antigo guardado com "Imediato" continua valendo como pronta entrega, `leadMode`), e o PDF acrescenta a primeira linha das observações pelo prazo: **"Peça em pronta entrega"** ou **"Peça sob encomenda"** (nada em "Sem prazo"; não repete se o texto digitado já fala da entrega). **Se o atendente DIGITAR observação que contradiz o prazo, a gaveta avisa** em amarelo (`leadTimeConflict`) em vez de corrigir sozinha: o texto digitado é dele. (3) **Desconto:** SÓ digitado (o atalho 5% PIX saiu em 2026-10-09, ver "Condição de pagamento dos orçamentos"), no campo de desconto (`lib/discount.ts`: aceita "7", "7,5", "7.5", recusa negativo, mais de 100, três casas e texto; campo vazio = sem desconto) e o rodapé já mostra o valor do desconto e o total. **Orçamento de empresa e de conserto (exemplos reais do dono, 2026-10-09):** os dois modelos que a loja usa hoje (planilha colada como imagem para o cliente comum; PDF em Word para empresa, com "ORÇAMENTO nº", "A/C: pessoa – grupo", nome da empresa, "Ref.", tabela com PRAZO, linha **MÃO DE OBRA** sem prazo, TOTAL, condições e "ATT.") são o orçamento de peças com mão de obra e peças de qualquer fornecedor. **A coluna CÓDIGO da planilha é só controle da loja: o cliente NUNCA recebe código** (dono). No PDF: a **mão de obra e qualquer serviço avulso ficam com a célula do prazo em branco** (só peça tem prazo), e a Prévia tem os campos opcionais **"Empresa"**, **"Nº do orçamento"** e **"Pedido, frota, contato"** (texto livre, uma informação por linha: "Pedido de compra: 4500123" sai com o rótulo em negrito, linha sem rótulo sai como "Obs.:", até 5 linhas de 140 caracteres; `customerNoteRows`). Tudo digitado, sai no cabeçalho do PDF abaixo do título e some quando vazio; vale só para o PDF, sem coluna nova no banco (a coluna dos valores acompanha o rótulo mais largo). Roteiros `orcamento-pdf-previa.mjs` (24) e `orcamento-completo.mjs` (63).

- **Aba Conserto: UMA tela própria, separada do Atendimento (2026-10-09, dono: "uma aba para colocar os orçamentos de conserto"; sem defeito, previsão, garantia nem separação de peças; depois: "na aba conserto está escolhendo peças ou conserto, pq isso? Não era para deixar separado?").** Modelo real da loja: a planilha **"ORÇAMENTO DAV 59600.xlsx"** (uma por OS do Clipp): CÓDIGO, DESCRIÇÃO, QTDE, VALOR UNIT, VALOR TOTAL, **PRAZO POR LINHA** ("7 DIAS" nas encomendadas, "IMEDIATO" nas de estoque, no mesmo orçamento), uma linha de MÃO DE OBRA, TOTAL; coluna oculta de custo (interna; o sistema não guarda custo). **Não existe seletor "Peças | Conserto".** A aba (`/conserto`, `RepairQuotePage` + `RepairEditor`) tem a **PRÓPRIA cesta**: `QuoteCartProvider kind="REPAIR"` aninhado dá a ela chaves de cache local e rascunho no servidor só dela (`QuoteCartKind`, `STORAGE_KEYS` por tipo; `GET/PUT/DELETE /api/quotes/draft?kind=`). O índice único do rascunho é **por atendente e por tipo** (`Quote_one_draft_per_user_kind`, migração `20261009260000_quote_draft_per_kind`): o atendente pode ter uma cesta de peças e uma de conserto abertas ao mesmo tempo, e **nada vaza de uma para a outra** (era o defeito do desenho anterior, em que um tipo só e a cesta compartilhada fazia o conserto aparecer no Atendimento). Provado por `quote-repair-save.test.ts` ("cestas separadas"). **O editor segue a foto da planilha:** no alto Nº da OS (digitado, em branco; **o sistema NÃO numera**: o dono quer o da OS/DAV do Clipp), Cliente e WhatsApp; no meio as linhas (código, descrição, qtde, valor unitário, total, **prazo da linha**, tirar), com a lista rolando por dentro; embaixo a linha de entrada (Enter lança e volta ao código; o atalho "+ Mão de obra" fica acima dela), pagamento, desconto, total e WhatsApp/PDF/Prévia. O editor tem a altura da janela (`lg:h-[calc(100dvh-15rem)]`, piso de 480 px; era `9rem`/560 antes da faixa): em 1366×768 o total e os botões de enviar **nunca ficam abaixo da dobra** (travado em `conserto-faixa.mjs`). A **pasta** (`RepairFolder`) fica ao lado: um orçamento por OS, busca por número ou cliente, e "Retomar" um conserto arquivado na lista de Orçamentos leva a `/conserto?os=`. **Servidor:** `Quote.kind` (`PARTS`/`REPAIR`), `Quote.docNumber`, `QuoteItem.leadTime` e `QuoteItem.location`; **salvar de novo um conserto com o MESMO número de OS (do mesmo atendente) atualiza o mesmo orçamento**; sem número, cada envio arquiva um novo; outro atendente não sobrescreve. `GET /api/quotes?kind=REPAIR&q=` filtra e acha pelo número. **Prazo por linha:** "Pronta entrega" ou "Encomenda" (vazio = o do orçamento); no PDF a coluna PRAZO mostra o de cada linha e a mão de obra fica em branco; **só há a linha "Peça em pronta entrega"/"Peça sob encomenda" nas observações se TODA peça está no mesmo caso** (`effectiveLeadNote`). **Textos:** WhatsApp "Orçamento de conserto", "OS: nº", "Peças e serviços", **sem "Peças originais Husqvarna"**; PDF com "OS:" e Ref. "Orçamento de Conserto". **Mão de obra é coisa do conserto:** o orçamento de PEÇAS não tem botão de mão de obra nem "Revisão Geral" nem campo de serviço (dono: "se vou abrir um orçamento de peça não tem necessidade de colocar mão de obra"); o formulário do Atendimento é só **"Peça avulsa"** (`CustomItemForm`). `clearCart` do conserto volta a `{}`; o de peças mantém cliente e pagamento mas solta motor e número. **Concorrência (lições):** (1) clique duplo em PDF/WhatsApp criava duas cópias da mesma OS: índice único parcial `Quote_repair_doc_unique` (migração `20261009240000`) e `saveQuote` refaz como atualização; (2) só o índice não bastava: as atualizações simultâneas intercalavam apagar/recriar as linhas (6 em vez de 2), então `replaceDraft`, `updateSavedQuote` e o upsert do conserto travam a linha com `SELECT ... FOR UPDATE` antes de trocar as linhas (provado por mordida; **teste de concorrência se roda várias vezes**). **A ordem do Tab é a da tela.** Roteiro `conserto.mjs` (58 verificações, dois temas). **Não rode `sim-db.cjs migrate` com a loja simulada cheia** (ele agora recusa; `--force` ou `sim-reconstruir.ps1`).
- **Condição de pagamento dos orçamentos (2026-10-09, dono: "deixar à vista ou a prazo 30 dias somente, ou então um campo pra escrever; sem a informação PIX 5% de desconto, pois se o cliente não pedir não vamos dar desconto").** **Vale para peças e conserto; a MÁQUINA tem condição própria (ver abaixo, 2026-10-10).** `lib/payment-terms.ts` + `PaymentTerms`: três botões, **À vista**, **A prazo 30 dias** e **Outro** (campo livre; o texto digitado continua sendo `Quote.paymentMethod`, sem coluna nova). Orçamento antigo guardado com outro texto abre em "Outro" com o texto. **Não existe desconto automático nem atalho "5% PIX"** (`PIX_DISCOUNT_PERCENT` saiu): desconto só no campo `DiscountField` quando o atendente negocia (`lib/discount.ts`: "7", "7,5", "7.5"; recusa negativo, mais de 100, três casas, texto). `customerPayment` monta o texto que o cliente lê no WhatsApp e no PDF. **Não reintroduza informação de PIX nem desconto padrão** sem o dono pedir.
- **O orçamento de peças abre num CARD CENTRAL GRANDE, não numa gaveta de 560 px (2026-10-09, dono: "não fica apertado só o card lateral? pense no atendente").** `QuickQuoteCart` é um `Dialog` largo (prende o foco, fecha com Esc) com cabeçalho, linhas confortáveis (`QuoteLine`, o mesmo componente do conserto), peça avulsa, pagamento, desconto, total e as ações; "Revisar orçamento" (`CounterQuoteRail`) é quem abre. `SyncStatus` ("No servidor" / "Só neste aparelho") é compartilhado pelos dois.

- **Importar os orçamentos de conserto antigos (2026-10-09, dono: "só um lugar onde armazenava esse orçamento, para rever").** A pasta do dono ("ORÇAMENTO DAVOS", Drive e RAR de 20 MB, **1.826 arquivos: 1.713 `.xlsx`, 80 `.xls`**, mais PDF/Word/Thumbs) vira a pasta da aba Conserto. **Só administrador**, pela tela (`RepairImport`, botão "Importar antigos" ao lado da pasta): escolhe a pasta, a tela separa o que vai (planilhas com o número da OS no nome, uma por OS, a mais nova vale) do que fica de fora (temporários `~$` do Excel, nome sem número, PDF/Word), manda em lotes de 25 (`POST /api/admin/repair-import/preview` só LÊ e devolve o relatório; `apply?expect=N` grava só se o lote tem N orçamentos como o relatório aprovado, senão 409), mostra os números e **só grava depois da confirmação**. **Nunca apaga nem troca uma OS que já existe.** Entram **sem cliente** (a planilha não tem) e **sem atendente** (`userId` nulo), com a **data do arquivo**; por isso a **pasta de conserto é da LOJA** (o balcão enxerga todos os orçamentos de conserto, `listSavedQuotes` só restringe por atendente quando o tipo não é conserto); editar/excluir um importado é só do administrador. **Leitor** (`utils/repair-sheet.ts`, puro): o orçamento está na aba "BASE ORÇAMENTO" (as outras, PLAN#/COTAÇÃO/CUSTO, são conta de custo e nunca entram); o prazo é a coluna PRAZO **ou ESTOQUE** (IMEDIATO/DISPONÍVEL/ESTOQUE viram "Pronta entrega"; número solto como `44927` é data do Excel, não prazo); **o orçamento termina na linha TOTAL** (o que vem depois é rascunho e conta de custo; era a causa de 185 totais "diferentes", hoje 26); as colunas de fornecedor (COOPER, VIPECAS, RR...) são custo e nunca entram; **quantidade fracionária (litros: 0,3; 1,2) vira 1 unidade com o valor da quantidade inteira e a descrição guarda a quantidade ("ÓLEO 20W50 (0,3)")**, mantendo o total; aceita vírgula decimal; cabeçalho com nome trocado ("XZ" no lugar de DESCRIÇÃO) e repetido no meio; mão de obra vira serviço. **Medido nos 1.793 arquivos reais: 1.688 lidos, 47 temporários, 57 que não são orçamento, 1 problema; 1.679 OS únicas (de 2019 a 2026, 8 anos), em 2 s.** **Prateleira:** a coluna LOC (pouco preenchida: 222 linhas) entra em `QuoteItem.location` (migração aditiva `20261009250000`), **só para o balcão (nunca no PDF nem no WhatsApp, travado em teste)**; o item avulso com código também traz a prateleira do cadastro da loja, e **com o Clipp o local virá do cadastro e entrará sozinho nas linhas** (dono). Roteiro `conserto-importar.mjs` (25 verificações, **com os arquivos reais**, que ficam FORA do repositório: `DAVOS_DIR`; apaga os importados no fim), testes `repair-sheet.test.ts` (planilhas sintéticas) e `repair-import.service.test.ts` (banco).

- **Uso recomendado no orçamento de MÁQUINA, vindo do site público da Husqvarna (2026-10-09, dono: "puxar mais informações… de acordo com o equipamento, nada viajado").** Medido em 76 modelos da lista pelo GraphQL público (`hbd-br-pt-br`, `articles.byIds(PNC9){ specificationValues { id formattedValue numericValue specificationDefinitions { name unit } } }`; o campo é `specificationValues`, **não** `specificationGroups`): a lista de preços JÁ traz cilindrada, potência, tanque, largura e o passo da corrente (no texto da descrição), então o site só ACRESCENTA o que ela não tem: **classe de uso** (motosserra `WEB_ChainsawSubGroup`, em inglês, traduzida por tabela fixa; soprador `ART_647`, já em português) e **faixa de sabre recomendada** (`TD32_1_metric`/`TD32_2_metric`). **Roçadeira, giro zero e as demais categorias NÃO têm "uso recomendado" no site**; "serve para braquiária ou só grama" seria invenção nossa e não entra. 11 de 76 modelos medidos não estão no site (226K, 125B, LC151, 535iXP...): o orçamento tem que sair completo sem isso. Código: `utils/husqvarna-public-specs.ts` (puro; valor fora da tabela é descartado, nunca traduzido por palpite), `services/husqvarna-public-specs.service.ts` (cache persistente `HUSQVARNA_PUBLIC/MACHINE_USE`, 7 dias fresco; **erro de rede ou HTTP lança para o cache NÃO guardar uma ausência falsa**, só a resposta "o site não tem o artigo" é guardada), `GET /api/machine-list/:pnc/public-specs` (logado; PNC com `BR` vale como os 9 dígitos; PNC sem sentido responde `{ use: null }` sem consultar o site). Na tela (`MachineQuoteDialog`, `lib/machine-public-use.ts`): as linhas "Uso profissional em tempo integral" e "Sabres compatíveis: 38 a 70 cm" entram **primeiro e já marcadas** na lista de características; o atendente desmarca e a prévia mostra o que vai ao PDF. Resposta torta do servidor (texto onde devia haver número) vira "sem dado" e **nunca derruba a tela** (o roteiro achou isso: `useClass: 42` quebrava o diálogo). Roteiro `orcamento-maquina-uso.mjs` (36 verificações, dois temas; precisa de internet até husqvarna.com). Provado por mordida. **Vigia:** `supplier-canary` (segunda-feira) também confere a 281XP (classe de uso e faixa de sabre) e o 350iB (classe do soprador) pelo mesmo leitor, que mora em `services/husqvarna-public-specs-source.ts` SEM banco (o vigia roda sem banco; o cache fica em `husqvarna-public-specs.service.ts`). Classe nova da Husqvarna ou id renomeado vira "MUDOU" e abre issue em vez de a linha sumir em silêncio.
- **Prévia do PDF no orçamento de MÁQUINA (2026-10-09, dono: "se tiver necessidade, faça"; plano 2.23).** O botão **Prévia** do `MachineQuoteDialog` abre o PDF que o cliente recebe ao lado do formulário (o diálogo alarga e o painel fica fixo enquanto o formulário rola) e **o refaz a cada ajuste** (espera 400 ms; chave só com o que muda o PDF: cliente, preço, pagamento, prazo, observação, complemento, destaque, características marcadas, foto, data). **Baixar e a prévia usam a MESMA função (`buildDoc`)**: o que se vê é o que sai. **Imprimir** imprime ESTE documento (`iframe.contentWindow.print()`). Logo e foto são baixados uma vez por diálogo, não a cada letra. Preço ou data inválidos mostram o aviso na prévia e o botão de baixar fica desabilitado; corrigir traz a prévia de volta. Fechar o diálogo no meio da montagem não deixa erro (a montagem é cancelada e o blob é liberado). Roteiro `orcamento-maquina-previa.mjs` (33 verificações, dois temas, provado por mordida). **Não verificado:** o Chromium sem tela não desenha o PDF dentro do iframe (fica cinza), então o visual do PDF na prévia só se confere abrindo o diálogo num navegador comum; o conteúdo foi conferido nos bytes do blob. O roteiro `orcamento-maquina.mjs` agora dá nome ao usuário da simulação durante a execução (sem nome o PDF não tem "ATT.").
- **Sugestões do conserto a partir do que a loja já orçou (2026-10-09, plano 2.24; ideia do dono: "pegar as peças que são mais orçadas").** Das OS de conserto ARQUIVADAS (os 12.702 itens importados e as do balcão) saem duas ajudas na aba Conserto, sem fonte externa e sem custo. **(1) Já orçado antes:** ao digitar a descrição (ou um código que nenhum catálogo conhece, de outro fornecedor, com a descrição vazia), uma lista abre PARA CIMA da linha de entrada com a linha, o valor de referência, quantas OS e o prazo mais comum; **setas escolhem, Enter só escolhe se há opção marcada (sem opção marcada lança o que foi digitado, como sempre), Esc fecha, Tab segue a ordem normal**. Escolher preenche descrição, valor e prazo (mão de obra sem prazo), mantém o código digitado (ou põe o código mais usado da linha) e leva o cursor ao valor. **(2) "Costuma levar junto":** depois de lançar uma peça, atalhos de um clique para o que as OS com ela costumam ter (ao menos 15% e 3 OS; com menos de 5 OS de base não conclui; **nunca mão de obra**, nunca o que o orçamento já tem). No real: com carburador, 69% filtro de gasolina, 48% mangueira, 32% filtro de ar, 31% vela. **Regras de cálculo** (`utils/repair-history.ts`, puro): a chave junta as grafias ("Filtro de gasolina", "FILTRO GASOLINA", "filtro  gasolina (0,3)": sem acento, sem "de/do/da", sem a quantidade quebrada da importação); **o valor é a mediana das ÚLTIMAS 10 vezes** (o preço de 2019 não puxa), o prazo é o mais comum nelas; linha que só apareceu em uma OS não é sugestão; **`SRV-n` (o código que o sistema dá a linha sem código) nunca é sugerido como código de peça** (achado ao rodar nos dados reais); pelo código manda quem mais vezes TEM aquele código. Servidor: `GET /api/quotes/repair-suggestions?q=` e `/together?name=&exclude=` (logado, só leitura, nunca lança: sem histórico, lista vazia); o índice fica em memória por loja e é **servido velho e atualizado por trás** (primeira leitura ~1,5 s no Supabase free; a aba o acorda ao abrir). Tela: `RepairSuggestions`, `lib/use-repair-history.ts` (resposta fora do formato vira lista vazia, nunca derruba o editor). Testes `repair-history.test.ts` (12), `use-repair-history.test.ts` e o roteiro `conserto-sugestoes.mjs` (51 verificações, dois temas, histórico inventado semeado e apagado; provado por mordida: Enter escolhendo sem opção marcada reprova e o roteiro até pega um erro de tela). **Não verificado:** o desempenho com histórico muito maior (hoje ~13 mil linhas; o teto é 150 mil); sugestão no orçamento de PEÇAS do Atendimento (de propósito: lá o preço vem do cadastro). **Aviso de valor fora do costume (2.26, 2026-10-09):** quando a descrição digitada é a MESMA linha do histórico (`sameHistoryLine`, mesma chave do servidor) e a linha tem 5 OS ou mais, um valor que seja o TRIPLO ou menos de um TERÇO da referência (`priceLooksOff`) mostra, no pé da linha de entrada, "Costuma ser R$ 204,50 (12 vezes): confira o valor." É o que pega o zero a mais ou a menos ("15" no lugar de "150"); desconto e peça mais cara não reclamam, e **o aviso nunca bloqueia** (o valor digitado entra). Sem histórico ou com menos de 5 OS não avisa. Roteiro `conserto-sugestoes.mjs` agora com 64 verificações. **Painel "Mais orçadas no conserto" (2.25, Negócio, só administrador):** as linhas que mais se orçam no período (3 meses, 12 meses ou tudo; padrão 12), para o dono guiar o estoque: **peça, nunca mão de obra**, linha de uma OS só fica de fora, as grafias se juntam, e o valor de referência e o prazo são os do PERÍODO (não os de anos atrás). Mostra quantas OS o período tem e a fatia de cada linha. `GET /api/admin/repair-top?months=3|12|all&limit=` (administrador; o balcão leva 403; parâmetro estranho não quebra). Mesmo índice em memória das sugestões do conserto (`topFromHistory`, 4 testes provados por mordida) e roteiro `mais-orcadas.mjs` (22 verificações, dois temas). Se a resposta vier torta ou o servidor falhar, o cartão some e o resto do Negócio abre normalmente.
- **"Serve em" dos acessórios (2026-10-09, plano 2.4; dono: "aplicação seria bom"; EAN, NCM e IPI "não têm necessidade", e a loja **não usa leitor de código de barras**).** Medido no arquivo de 05/10: a lista traz `aplicacao` em 92% dos 438 acessórios ("PA1100 - 129LK / 525LK / 327LDX \n536LiP4 / 530iPT5": as máquinas em que servem) e em ~70% das ferramentas; peça de reposição já traz o `modelo`. O leitor (`scripts/price-list-html.ts`) passou a guardar `aplicacao` como a aplicação da peça quando não há `modelo` (linhas unidas por " · ", "-" e vazio descartados, 300 caracteres no máximo); **código novo já entra com ela**. Os acessórios que a loja JÁ tinha (254, sem aplicação desde a primeira importação) são preenchidos por `services/price-list-application.service.ts`, dentro da MESMA transação da atualização: **só PREENCHE** (nunca troca uma aplicação que existe, nunca apaga, não toca em preço nem em outra loja) e **não cria duplicata** (se a seção já tem essa aplicação, fica de fora da conta). Entra na aprovação como os outros números: o relatório diz "Serve em dos acessórios: N acessórios serão preenchidos", a confirmação e a gravação só valem com esse N (`applications`; 409 se mudou), a gravação relê e confere que sobrou zero, e **lista igual no preço mas com "serve em" a preencher AINDA grava** (não vira "a loja já está igual"). A tela de busca já mostrava a aplicação sob o nome da peça: agora o acessório mostra onde serve. **Para ligar em produção o dono atualiza a lista pela tela (o mesmo arquivo de 05/10 serve): o relatório deve mostrar só o "serve em" a preencher, preços e códigos já estão iguais.** Desfazer a atualização NÃO desfaz o "serve em" (é texto de consulta; a próxima atualização o corrige). Testes `price-list-application.service.test.ts` (7, banco, provados por mordida) e o roteiro `lista-aplicacao.mjs` (19 verificações, dois temas). Continua de fora, por decisão do dono: EAN, NCM e IPI.
- **Item avulso com código (2026-10-09, dono: assistência multimarcas, 10 fornecedores ou mais).** O formulário "Serviço ou item avulso" (`CustomItemForm.tsx`, regra em `lib/item-lookup.ts`) tem "Código da peça (opcional)". **Código Husqvarna, Briggs, Kawasaki ou Kohler** puxa a descrição sozinho (e o preço quando a loja tem a peça no cadastro; catálogo de motor não traz preço, fica em aberto); **qualquer outro código não puxa nada** e o balcão escreve descrição e preço. O que o balcão escreveu nunca é apagado pelo que o sistema acha. Com código, o item entra como peça de verdade (`partNumber` sem traço e em maiúscula, marca reconhecida, **sem** o "modelo" de serviço, para não virar "Serviço / Balcão" na máquina do cliente); sem código, é serviço `SRV-`. **O formulário fica aberto depois de "Adicionar"** (manutenção nunca é um item só: carburador + mangueira + filtro + junta), com o cursor de volta no código; o botão vira "Concluir". **O casamento do código é pelo valor normalizado dos dois lados** (maiúsculo, sem traço e sem espaço): `506744201`, `506 744 201` e `506-74-42-01` são a mesma chave. O campo de preço usa `step="0.01"`: com `step="0.5"` o navegador recusava R$ 378,26 ("valores válidos: 378 e 378,5"). Roteiro `item-avulso-codigo.mjs` (39 verificações, dois temas). **Branco (2026-10-09):** o catálogo (`branco.ricambio.net`, plataforma ricambio) TEM vista explodida, mas o `robots.txt` dele proíbe robôs em `/site/pagece5.wplus`, exatamente a página do desenho. **Não construir leitor automático** sem autorização da Branco; ver o plano (2.20).
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

### Auditoria do schema: o que a API tem e NÃO usamos (2026-09-19)

Feita por introspecção contra a API real (`{ __type(name:"Article"){ fields ... } }`),
pelo navegador embutido. Conclusão curta: **a integração já usa quase tudo que
serve ao balcão**. Não vale procurar de novo sem motivo novo.

**`listPrice` existe — e devolve ZERO, não nulo.** Medido no `967332901`:

    listPrice { listPriceExcludingVat: 0, listPriceIncludingVat: 0, currency: "BRL" }

Isto é **armadilha**, não oportunidade. Quem ligasse esse campo sem olhar o
valor mostraria **"R$ 0,00"** na tela do balcão como se fosse preço de verdade —
pior que não ter preço, porque parece informação. A regra de sempre continua:
preço é Portal Parceiro ou planilha, agora com prova de por quê.

**`stockRecommendations(quantitySold: Int!)`** seria a Husqvarna dizendo quais
peças estocar para as máquinas que a loja vende — exatamente o tipo de coisa que
interessa ao dono. Devolve **`null`** no nosso site sem login. `serviceArticleOffers`
exige `customerType` e é do mesmo grupo. Os dois estão atrás da sessão que o dono
decidiu não automatizar; não insista sem ele reabrir essa decisão.

**`IplArticle` está 100% aproveitado**: `comment`, `coordinates`, `quantity`,
`replacedIds`, `number`, `name`, `commercialReference`.

**`SparePartSpecifications` tem campos que não pedimos**, e a maioria vem vazia.
Medido em peças reais (`587106701` carburador, `537338101` conj. de ventilação):
só `ean`, `grossWeight`, `netWeight`, `masterPackQuantity` e `packagingType`
vinham preenchidos. Os dimensionais — `diameter`, `length`, `bladeLength`,
`bladeType` — existem e devem preencher em lâmina e fio de nylon, que é onde o
balcão pergunta ("qual o diâmetro do fio?"). É o único acréscimo barato que
sobrou desta auditoria.

Marketing (`tagline`, `introductionText`, `divisionBadge`) e `repairabilityIndex`
(regra europeia) não servem ao balcão.

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

## Lista de preços da Husqvarna em .html (importada em 2026-10-07)

A Husqvarna passou a distribuir a lista como uma página `.html` (~35 MB), não mais
`.xlsm`. Os dados estão num `<script id="catalogData" type="application/json">`; as
listas que valem são `pecas`, `acessorios`, `lubrificantes` e `ferramentas`
(`produtos` é máquina e fica de fora). `preco` vem como `"R$ 1.234,56"` e é o PREÇO
CONSUMIDOR: a regra ÷ 0,92 continua a mesma (R$ 22,00 → R$ 23,91, conferido).

Código: `scripts/price-list-html.ts` (leitor puro), `price-list-diff.ts` (relatório),
`price-list-plan.ts` (o que vira linha), `import-price-list-html.ts` (CLI). Uso:
`npm run report:price-list-html -- "<arquivo>"` só LÊ. Gravar exige
`--apply --expect-changed=N --expect-added=N`: se os números do banco ou do arquivo
mudaram desde a aprovação, nada é gravado.

- **Grava só o aprovado:** atualiza o preço de código que já existe (só se o preço
  ainda for o do relatório, até o centavo) e cria os códigos novos. **Nunca apaga**
  e nunca mexe em código que a lista não traz: a Husqvarna tirou peça de motor,
  giro zero e outras marcas desta lista, e essas 4.406 linhas ficam com o preço que
  têm (decisão do dono). Código novo entra com `brand = HUSQVARNA`, uma linha de
  `MasterPartSection` por modelo e `sourceSheet = LISTA_HTML:<lista>`, o que também
  permite desfazer (`WHERE sourceSheet LIKE 'LISTA_HTML:%'`).
- **Código com dois preços diferentes no arquivo é recusado**, não escolhido
  (`594028101`: R$ 10,00 e R$ 9.171,00). **DECIDIDO pelo dono em 2026-10-09: vale R$ 10,00 (de lista; ÷ 0,92 = R$ 10,87), o 9.171 é defeito da fonte.** A decisão mora em `OWNER_PRICE_DECISIONS` (`scripts/price-list-html.ts`), só vale enquanto o preço decidido continua entre os do arquivo, e o relatório mostra "Preço decidido por você". O banco de produção ainda tinha 9.171, então o relatório mostra "1 preço muda" (9.171 → 10,87) e o dono aprova com o botão. Preço fora do formato `R$ 1.234,56` também é recusado.
- Primeira importação em produção: 80 preços atualizados, 1.177 códigos novos
  (26.694 no total). Antes dela, 21.031 dos 22.288 códigos do arquivo já estavam no
  preço certo, o que confirma o divisor.
- **A transação é atômica e a trava funciona:** num teste em Postgres descartável,
  uma comparação de preço por igualdade exata de ponto flutuante reprovou 109 de 446
  linhas boas, o gravador viu 337 ≠ 446 e desfez tudo. Dinheiro compara por
  tolerância de meio centavo.
- O arquivo da Husqvarna traz um aviso de uso e propriedade intelectual. O repositório
  é público: **nunca** copie o `.html`, o código ou o visual dele para cá, e mantenha
  o arquivo (e qualquer relatório) em `C:\DadosLoja`, fora do projeto e do OneDrive.
- O importador antigo (`import-price-list.ts`, planilha) apaga linha de
  `MasterPartSection` mais velha que a importação e depois os `MasterPart` sem seção.
  Se ele rodar de novo, **apagaria os códigos que vieram só do HTML**. Não rode sem
  antes decidir como as duas fontes convivem.

## Entrada de regex tem teto (CodeQL `js/polynomial-redos`)

`utils/regex-input.ts` (`capRegexInput`, 1.000 caracteres; 200 em modelo de motor)
fecha os 8 alertas. **Era real, não só aviso:** `stripExplicitSerialContext` levou
25,5 s com 200 mil caracteres de espaço (agora 4 ms), e Node é um processo só: uma
requisição assim travaria a loja inteira. O chat já cortava em 1.000, então em
produção o teto não muda resposta nenhuma; ele existe para a função não depender de
quem a chama. `regex-input.test.ts` trava o tempo com entrada hostil.

## Testes do frontend (Vitest)

`cd frontend && npm test` (Vitest 5 + jsdom + Testing Library; config própria em
`vitest.config.ts`, sem o plugin PWA). Cobre a barreira de erro por painel e o
reenvio da cesta (`QuoteCartContext.test.tsx`: reenvia sozinho, não duplica item,
escada de 2/5/10 s, para depois de 6). Provados por mutação. O teste de reenvio avança
o relógio em passos com `act` cada um: um salto único não deixa o React rodar o
efeito que agenda a tentativa seguinte.

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

## Óleo é consumível, não peça de catálogo

`services/machine-oil.ts`. A loja **não cadastra código de óleo**, então ele não
pode ser resolvido no catálogo como a junta do carburador. Entra no orçamento
como **linha avulsa**, com o prefixo `SRV-` que a cesta já trata e mostra como
"SERVIÇO / AVULSO" em vez de código.

A tabela é do dono, com as palavras dele: *"vendemos oleo 20w50 para cortador,
oleo 2t para maquinas 2 tempos, oleo corrente para motosserra/podador e por ai
vai. O oleo 15w40 não vendemos por conta que o 15w50 é melhor (oleo recomendado
pra motor de trator/giro zero e cambio)"*.

    roçadeira, soprador      -> 2 tempos
    motosserra, podador      -> 2 tempos + óleo de corrente
    cortador de grama        -> 20W50
    trator, giro zero, Rider -> 15W50   (motor e câmbio; 15W40 a loja não vende)

**Família desconhecida mostra as QUATRO opções**, não um palpite. Recomendar
20W50 num motor 2 tempos estraga o motor do cliente — erro pior que não sugerir
nada. Foi o desenho que o dono pediu ("ou até opções").

**O Rider entra em trator, não em cortador.** `R112C`, `V548`, `V554` são o
cortador em que o operador senta, têm câmbio, e o dono confirmou 15W50 para
eles. A primeira versão mandava 20W50 no `R112C` e não sabia classificar os
outros dois — medido contra 43 modelos reais, era o único buraco.

**A ordem das regras em `machineOilFamily` importa**: os prefixos de 4 tempos
são testados antes do sufixo, porque `LC121P` termina em `P` e **não** é
podador, é cortador. Olhar o sufixo primeiro mandaria óleo de corrente para um
cortador de grama. Travado em teste.

## A IA escolhe de lista FECHADA, e o desenho confirma

`services/part-picker.service.ts` + rota `GET /api/parts/guess` + `PartGuesses`.

O caso: o cliente descreve com as palavras dele — *"a peça que segura a
lâmina"*, *"o negócio que puxa a corda"* — e o catálogo escreve `PORCA, Lâmina`
e `ARRASTADOR, Partida`. Isso devolvia **nada**, e "não achei" com o cliente na
frente é o pior resultado possível.

**Não é tradução, e a diferença é o produto inteiro.** Pedir para a IA traduzir
devolveria "fixador da lâmina" — plausível em português e que não casa com nada.
Aqui a IA recebe **a lista exata das peças daquela máquina** e responde com um
**índice** dela. O servidor confere que o índice existe na lista que nós
montamos; qualquer outra coisa é descartada. **Não há caminho pelo qual um
código inventado chegue à tela.**

**Quem confirma é o atendente, no desenho.** A resposta traz a posição, e a
faixa diz "confira a posição na vista explodida antes de vender".

Por que cabe num plano gratuito de IA:

- **Quase nunca roda**: só quando a busca determinística voltou vazia **e** a
  máquina é conhecida. `looksLikeDescription` barra código, modelo e palavra
  solta — travado em teste, porque errar para MAIS aqui gasta cota do dono.
- Texto curto (lista de nomes, sem imagem), teto de 120 candidatos.
- Cache em memória e em `AiDecisionCacheService` por 7 dias.
- Respeita `interactive-ai-budget` como o resto da IA interativa.

**Sem cota, a tela cai no que o produto já faz** — a vista explodida para
conferir à mão. Não existe modo de falha novo.

**`canUseInteractiveAi` é assíncrona.** `if (!canUseInteractiveAi(t))` compila e
é **sempre falso**, porque Promise é verdadeira — a guarda de cota nunca
dispararia. Já cometi esse erro aqui; use `await`.

A máquina sai de `session.machineModel` (o contexto do atendimento). O dono:
*"nós sempre perguntamos qual a marca e modelo da sua maquina"*. Sem máquina não
há lista fechada, e nada é consultado.

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
