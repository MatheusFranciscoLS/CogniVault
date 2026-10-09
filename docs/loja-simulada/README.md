# Loja simulada

Um CogniVault inteiro rodando **nesta máquina**, com banco descartável, chaves de mentira
e os **preços reais** da lista da Husqvarna. Serve para testar a tela e a busca com volume e
nomes reais (hoje a produção ainda tem pouco uso, e o seed do e2e tem 3 peças), e para rodar
o e2e do projeto antes de subir qualquer coisa ao CI.

**Nunca toca na produção.** O banco é local (porta 54330, senha `sim`), a fila de mensagens
aponta para uma porta morta (a API tolera), as chaves do Gemini e do Supabase são
placeholders, e `sim-seed.ts` recusa qualquer host que não seja local. O `.env` do backend
aponta para a produção: por isso o script passa **todas** as variáveis que importam na linha
de comando (o `dotenv` não sobrescreve o que já está definido).

> Dados da loja não vão para o git. A lista de preços `.html` e qualquer relatório ficam em
> `C:\DadosLoja`, fora do projeto e do OneDrive.

## Subir (uma vez por sessão)

Pré-requisito: PostgreSQL 18 instalado (sem `pgvector`; a simulação troca essa coluna por
texto), Node 24, `npm ci --workspaces=false` no `backend` e no `frontend`.

```powershell
# 1. banco local com as 43 migrações reais (só o pgvector é trocado)
node docs/loja-simulada/sim-db.cjs up
node docs/loja-simulada/sim-db.cjs migrate

# 2. dados: usuários de teste + catálogo técnico + preços reais
$env:DATABASE_URL = 'postgresql://postgres:sim@127.0.0.1:54330/postgres'
$env:E2E_SEED_ALLOWED = 'true'; $env:SIM_SEED_ALLOWED = 'true'
cd backend
npx tsx src/scripts/seed-e2e.ts
npx tsx src/scripts/sim-seed.ts "C:\DadosLoja\LISTA_DE_PRECOS.html" --models=60
npm run report:price-list-html -- "C:\DadosLoja\LISTA_DE_PRECOS.html" --apply --expect-changed=0 --expect-added=<N do relatório>
# 2b. máquinas da Tabela de preços (aba nova), ainda dentro de backend/
npm run import:machine-list-html -- "C:\DadosLoja\LISTA_DE_PRECOS.html" --apply --expect-count=<N do relatório>
cd ..

# (ou tudo isso de uma vez, depois do passo 1: ./docs/loja-simulada/sim-reconstruir.ps1)

# 3. backend (3333) e frontend (5173)
./docs/loja-simulada/sim-restart.ps1
```

Login: `admin.e2e@cognivault.local`, senha `CogniVault-E2E-2026!` (dado de teste público, o mesmo
do workflow). Abra http://localhost:5173.

## Usar

```powershell
# E2E do projeto, de verdade, contra a loja simulada (instalar sem gravar no package.json):
cd frontend
npm install --prefix . --workspaces=false --no-save --no-package-lock @playwright/test@1.63.0
npx playwright test -c e2e/playwright.config.mjs

# Roteiro do balcão com prints (tema escuro e claro) e erros de console:
node ../docs/loja-simulada/drive.mjs both 1366 768    # prints em %LOCALAPPDATA%\Temp\cvsim\shots

# Perguntas ao cadastro de preços:
node ../docs/loja-simulada/ask.mjs "vela de ignição" "válvula" "carburador 143RII"
```

`drive.mjs` e `ask.mjs` importam `@playwright/test`: rode-os de dentro de `frontend/` (onde a
instalação acima os deixa visíveis) ou copie-os para lá.

## Desligar

```powershell
node docs/loja-simulada/sim-db.cjs down
```

## O que a simulação NÃO cobre
- Vista explodida em **PDF** (não há PDF, só os dados) e Supabase Storage.
- Fila RabbitMQ e processamento de catálogo por IA (Gemini).
- Preço do Portal Parceiro e dados do Clipp (ainda não existem).
- A consulta ao Portal Husqvarna público **funciona** (é leitura pública), então a foto e a
  máquina oficial aparecem de verdade.

## Armadilhas já pagas
- `sim-db.cjs migrate` **apaga o schema inteiro** (usuários, catálogo, preços) antes de recriar. Por isso ele **recusa** quando a simulação já tem dados (`--force` para insistir). Para recriar tudo de uma vez: `docs/loja-simulada/sim-reconstruir.ps1` (migra, carrega usuários, catálogo, preços, máquinas e reinicia). Para aplicar só uma migração nova, rode o `migration.sql` dela com o `psql`, sem o `migrate`.
- O backend só aceita as origens de `CORS_ORIGINS`; o script libera `localhost` e `127.0.0.1`.
- `String.replace` do JavaScript trata `$$` e `$&` do texto novo como especiais: ao gerar SQL
  com `DO $$ ... $$` por substituição, use função (`replace(a, () => b)`).
- Barra invertida some em script gerado por `node -e` dentro do shell (`\s` vira `s`): escreva
  em arquivo.
