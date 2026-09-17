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
- Gap conhecido (achado em investigação, ainda não corrigido): a consulta
  rápida de máquina em `work-intelligence.controller.ts` (`officialFallback`,
  usada pela seção Máquinas) já sabe *quantos* documentos técnicos (manual
  do operador, PDF de vista explodida) a Husqvarna tem para aquele PNC, mas
  descarta os links e nunca os expõe na resposta — mesmo padrão de bug em
  `husqvarna-portal-graphql.service.ts`'s `extractProductDetailsSummary`.

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
