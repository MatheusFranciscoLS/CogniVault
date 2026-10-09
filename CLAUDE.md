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
  `/admin/quality/search-intelligence` (ferramentas de manutenção do administrador). Sobram métodos mortos nos controladores compartilhados (`crossReference`, `setLocation`, `refreshHealth`).
- **Motor no orçamento (2026-10-08, pedido do dono).** O botão "Motor no orçamento" em cada motor do cartão marca o motor no orçamento (`draftOptions.engine`, ex.: "Kawasaki FX921V-ES06"); a gaveta mostra a linha "Motor ..." com "Tirar"; o WhatsApp e o PDF levam "Motor: ..." logo depois da máquina. **Sem coluna nova no banco de produção**: no servidor o motor viaja no mesmo texto de `Quote.machineModel` ("Z460 · Motor Kawasaki FX921V-ES06"; `lib/quote-engine.ts` monta e separa, e `restoreQuote`/`fromApiOptions` separam de volta). Motor é o MODELO do motor, não código de peça: pode ir ao cliente. **`clearCart` solta o motor** (não vaza para o próximo cliente; travado em `QuoteCartContext.test.tsx` com prova de mordida). **Últimos motores digitados** (`lib/recent-engines.ts`, `localStorage` por aparelho, 6, só o que o atendente digitou da plaqueta) viram botões abaixo do campo. Roteiro `motor-orcamento.mjs` (20 verificações, dois temas).

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
  (`594028101`: R$ 10,00 e R$ 9.171,00; o banco já tinha 9.171, então o 10 é defeito
  da fonte). Preço fora do formato `R$ 1.234,56` também é recusado.
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
