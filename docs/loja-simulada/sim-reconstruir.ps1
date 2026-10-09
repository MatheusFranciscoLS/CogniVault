# Recria a LOJA SIMULADA do zero (banco local na porta 54330): migra, carrega usuários de teste, catálogo técnico, preços e máquinas, e reinicia os servidores.
# Apaga TUDO que a simulação tinha (é descartável; nunca toca a produção). Uso: ./docs/loja-simulada/sim-reconstruir.ps1 [-Lista "C:\caminho\LISTA_DE_PRECOS.html"] [-Modelos 60]
# Sem -Lista, usa o arquivo LISTA_DE_PRECOS*.html mais recente de C:\DadosLoja ou da pasta Downloads (a lista é da Husqvarna: fica FORA do repositório).
param([string]$Lista = '', [int]$Modelos = 60)
$ErrorActionPreference = 'Continue'
function Conferir([string]$passo) { if ($LASTEXITCODE -ne 0) { throw "Falhou em: $passo (código $LASTEXITCODE)" } }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not $Lista) {
  $achados = @("C:\DadosLoja", (Join-Path $env:USERPROFILE 'Downloads')) | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem -Path $_ -Filter 'LISTA_DE_PRECOS*.html' -ErrorAction SilentlyContinue }
  $Lista = ($achados | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not $Lista -or -not (Test-Path $Lista)) { throw 'Não achei a lista de preços (.html). Passe -Lista "caminho".' }
Write-Host "Lista: $Lista"

node "$repo\docs\loja-simulada\sim-db.cjs" up 2>&1 | Out-Host
node "$repo\docs\loja-simulada\sim-db.cjs" migrate --force 2>&1 | Out-Host; Conferir 'migrar'

$env:DATABASE_URL = 'postgresql://postgres:sim@127.0.0.1:54330/postgres'
$env:E2E_SEED_ALLOWED = 'true'
$env:SIM_SEED_ALLOWED = 'true'
Push-Location "$repo\backend"
try {
  npx tsx src/scripts/seed-e2e.ts 2>&1 | Out-Host; Conferir 'usuários de teste'
  npx tsx src/scripts/sim-seed.ts $Lista --models=$Modelos 2>&1 | Out-Host; Conferir 'catálogo técnico'

  # Os números a aprovar saem do próprio relatório (somente leitura), nunca de valores fixos: a lista muda a cada atualização.
  $relatorio = npm run report:price-list-html -- $Lista 2>&1 | Out-String
  if ($relatorio -notmatch 'Código novo no arquivo:\s*([\d\.]+)') { throw 'Não consegui ler o relatório da lista de preços.' }
  $novos = ($Matches[1] -replace '\.', '')
  npm run report:price-list-html -- $Lista --apply --expect-changed=0 --expect-added=$novos 2>&1 | Out-Host; Conferir 'preços'

  $maquinas = npm run import:machine-list-html -- $Lista 2>&1 | Out-String
  if ($maquinas -notmatch 'Lidas:\s*(\d+)') { throw 'Não consegui ler o relatório das máquinas.' }
  npm run import:machine-list-html -- $Lista --apply --expect-count=$($Matches[1]) 2>&1 | Out-Host; Conferir 'máquinas'
} finally {
  Pop-Location
}

& "$repo\docs\loja-simulada\sim-restart.ps1"
Write-Host 'Loja simulada reconstruída. Login: admin.e2e@cognivault.local'
