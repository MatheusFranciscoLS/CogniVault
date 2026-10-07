# Reinicia backend (3333) e frontend (5173) da LOJA SIMULADA. Banco local, chaves de mentira.
$ErrorActionPreference = 'SilentlyContinue'
# Caminhos relativos ao próprio script: funciona em qualquer máquina.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scratch = Join-Path $env:LOCALAPPDATA 'Temp\cvsim'
New-Item -ItemType Directory -Force $scratch | Out-Null

foreach ($port in 3333, 5173) {
  Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}
Start-Sleep -Seconds 2

$env:DATABASE_URL = 'postgresql://postgres:sim@127.0.0.1:54330/postgres'
$env:RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:1'
$env:JWT_SECRET = 'sim-only-secret-not-used-in-production'
$env:GEMINI_API_KEY = 'sim-placeholder'
$env:SUPABASE_URL = 'https://example.supabase.co'
$env:SUPABASE_SECRET_KEY = 'sim-placeholder'
$env:STORAGE_BUCKET = 'sim'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
$env:PORT = '3333'
$env:NODE_ENV = 'test'
$env:ENABLE_SEMANTIC_INDEXING = 'false'
$env:ENABLE_AUTOMATIC_VISUAL_RETRY = 'false'
$env:ENABLE_FEEDBACK_EMBEDDINGS = 'false'
$env:API_RATE_LIMIT_PER_MINUTE = '5000'

Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d $repo\backend && npx tsx src/server.ts > `"$scratch\backend-sim.log`" 2>&1" -WindowStyle Hidden
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d $repo\frontend && npm run dev -- --host 127.0.0.1 --port 5173 > `"$scratch\frontend-sim.log`" 2>&1" -WindowStyle Hidden
Start-Sleep -Seconds 14
try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3333/health/live' -TimeoutSec 5).Content } catch { 'backend ainda subindo' }
try { "frontend: " + (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/login' -TimeoutSec 5).StatusCode } catch { 'frontend ainda subindo' }
