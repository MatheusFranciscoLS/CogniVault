#!/bin/bash
# RODADA DE AUDITORIA do site inteiro, num comando só. Não grava nada em produção e nunca usa o banco de produção.
# Uso (da raiz do repositório): bash docs/loja-simulada/auditoria-rodada.sh [--rapida]
#   --rapida: só as checagens estáticas e a de produção (≈2 min). Sem a flag: inclui testes do backend e do frontend (≈6 min).
#   Os roteiros do navegador (todos-roteiros.sh) ficam de fora de propósito: levam ~1 h e pedem a loja simulada no ar.
# Cada linha termina em OK, ALERTA (olhar) ou FALHOU (corrigir). Código de saída 1 se algo FALHOU.
cd "$(dirname "$0")/../.." || exit 1
RAPIDA=0; [ "$1" = "--rapida" ] && RAPIDA=1
FALHAS=0
ok() { echo "OK      $1"; }
alerta() { echo "ALERTA  $1"; }
falhou() { echo "FALHOU  $1"; FALHAS=$((FALHAS + 1)); }

echo "== 1. Código (estático)"
if (cd backend && npx tsc --noEmit --noUnusedLocals >/tmp/aud-tsc.txt 2>&1); then ok "backend: tsc sem erro e sem import sobrando"; else falhou "backend: tsc/noUnusedLocals (veja /tmp/aud-tsc.txt)"; head -5 /tmp/aud-tsc.txt; fi
if [ -x frontend/node_modules/.bin/eslint ] && frontend/node_modules/.bin/eslint -c frontend/.audit/eslint.config.mjs backend/src >/tmp/aud-eslint.txt 2>&1; then ok "backend: eslint de auditoria (promessa solta, await à toa) sem achado"; else falhou "backend: eslint de auditoria (veja /tmp/aud-eslint.txt)"; head -8 /tmp/aud-eslint.txt; fi
if (cd frontend && npx tsc --noEmit -p . >/tmp/aud-ftsc.txt 2>&1); then ok "frontend: tsc sem erro"; else falhou "frontend: tsc (veja /tmp/aud-ftsc.txt)"; head -5 /tmp/aud-ftsc.txt; fi
LINT=$(cd frontend && npm run lint 2>&1 | grep -E "✖ [0-9]+ problems?" )
if echo "$LINT" | grep -q "(0 errors"; then ok "frontend: lint sem erro ($LINT)"; else falhou "frontend: lint ($LINT)"; fi

echo "== 2. Dependências"
for dir in backend frontend; do
  FLAG=""; [ "$dir" = "frontend" ] && FLAG="--workspaces=false"
  OUT=$(cd $dir && npm audit --omit=dev $FLAG 2>&1 | tail -3)
  if echo "$OUT" | grep -q "found 0 vulnerabilities"; then ok "$dir: npm audit (produção) 0 vulnerabilidades"; else falhou "$dir: npm audit: $OUT"; fi
done

echo "== 3. Rotas: toda rota exige login, e toda rota tem quem a use"
SEM_LOGIN=$(grep -nE "router\.(get|post|put|patch|delete)\(" backend/src/routes/index.ts | grep -v authMiddleware | grep -vE "'/login'|'/logout'" | grep -vE "^\s*[0-9]+:router\.(get|post)\($" | wc -l)
# Rotas declaradas em várias linhas começam com "router.get(" sozinho: confere que a linha seguinte (o caminho) e as seguintes trazem authMiddleware.
MULTI=$(awk '/router\.(get|post|put|patch|delete)\($/ {getline p; getline a; if (a !~ /authMiddleware/) print p}' backend/src/routes/index.ts | wc -l)
if [ "$SEM_LOGIN" -eq 0 ] && [ "$MULTI" -eq 0 ]; then ok "só /login e /logout são abertas"; else falhou "rota sem authMiddleware ($SEM_LOGIN de uma linha, $MULTI de várias)"; fi
ORFAS=$(grep -oE "router\.(get|post|put|patch|delete)\('([^']+)'" backend/src/routes/index.ts | sed -E "s/router\.([a-z]+)\('([^']+)'/\2/" | while read -r p; do base=$(echo "$p" | sed -E 's#/:[A-Za-z]+.*##; s#^/##'); [ -z "$base" ] && continue; grep -rqF -- "$base" frontend/src docs/loja-simulada frontend/e2e .github 2>/dev/null || echo "$p"; done)
# As duas ferramentas do administrador ficam de propósito (ver CLAUDE.md).
ORFAS=$(echo "$ORFAS" | grep -vE "admin/quality/(search-intelligence|index-semantics)" | grep -v '^$')
if [ -z "$ORFAS" ]; then ok "nenhuma rota sem consumidor"; else alerta "rota(s) sem consumidor (apagar ou justificar): $(echo $ORFAS | tr '\n' ' ')"; fi

echo "== 4. Produção (só leitura)"
HEAD_SHA=$(git rev-parse origin/main 2>/dev/null | cut -c1-12)
LIVE=$(curl -s -m 20 https://cognivault-murex.vercel.app/health/live | grep -o '"revision":"[^"]*"' | cut -d'"' -f4)
if [ -z "$LIVE" ]; then falhou "produção não respondeu em /health/live"; elif [ "$LIVE" = "$HEAD_SHA" ]; then ok "produção serve a main ($LIVE)"; else alerta "produção ($LIVE) não é a main ($HEAD_SHA): a Render pode não ter publicado (confira o painel e a issue 'producao-fora-de-sincronia')"; fi
for entrada in "GET /api/admin/price-list/last" "POST /api/search/miss" "GET /api/machines/970466903/service-parts" "GET /api/machine-list/965801490BR/public-specs" "GET /api/quotes/repair-suggestions?q=carb" "POST /api/admin/price-list/apply"; do
  metodo=${entrada%% *}; rota=${entrada#* }
  CODE=$(curl -s -o /dev/null -m 20 -X "$metodo" -w "%{http_code}" "https://cognivault-murex.vercel.app$rota")
  if [ "$CODE" = "401" ]; then ok "produção protege $rota (HTTP $CODE sem login)"; else alerta "produção: $rota respondeu HTTP $CODE sem login (esperado 401)"; fi
done

if [ "$RAPIDA" -eq 0 ]; then
  echo "== 5. Testes"
  FT=$(cd frontend && npx vitest run 2>&1 | grep -E "Tests " )
  if echo "$FT" | grep -q "failed"; then falhou "frontend vitest: $FT"; else ok "frontend vitest: $FT"; fi
  if (cd frontend && npm run build >/tmp/aud-build.txt 2>&1); then ok "frontend: build"; else falhou "frontend: build (veja /tmp/aud-build.txt)"; fi
  if (cd backend && npx tsc >/dev/null 2>&1); then
    BT=$(cd backend && DATABASE_URL='postgresql://postgres:sim@127.0.0.1:54330/postgres' RABBITMQ_URL='amqp://guest:guest@127.0.0.1:1' JWT_SECRET=sim GEMINI_API_KEY=sim SUPABASE_URL=https://example.supabase.co SUPABASE_SECRET_KEY=sim STORAGE_BUCKET=sim NODE_ENV=test node --test "dist/**/*.test.js" 2>&1 | grep -E "^✖ " | grep -v RabbitMQ)
    if [ -z "$BT" ]; then ok "backend: suíte completa na loja simulada (só os 3 de RabbitMQ, que pedem broker, ficam de fora)"; else falhou "backend: testes reprovados: $BT"; fi
  else falhou "backend: tsc para gerar os testes"; fi
fi

echo
if [ "$FALHAS" -eq 0 ]; then echo "RODADA DE AUDITORIA: sem falhas."; else echo "RODADA DE AUDITORIA: $FALHAS falha(s)."; fi
exit $([ "$FALHAS" -eq 0 ] && echo 0 || echo 1)
