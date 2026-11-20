<#
.SYNOPSIS
  Start the full AEGIS local dev stack: Postgres (docker) -> migrations -> SaaS API, collector, web.
.PARAMETER NoDb
  Skip local docker Postgres + migrations (e.g. when apps/saas-api/.env points at Supabase).
#>
param([switch]$NoDb)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path "$Root\.env")) { uv run python scripts/gen-secrets.py }
uv sync --quiet

if (-not $NoDb) {
  docker compose -f docker-compose.dev.yml --env-file .env up -d
  Write-Host 'Waiting for Postgres...'
  for ($i = 0; $i -lt 40; $i++) {
    docker exec aegis-pg pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  & "$PSScriptRoot\migrate.ps1"
}

if (-not (Test-Path "$Root\apps\web\node_modules")) { npm --prefix apps/web install --no-fund --no-audit }

$ps = (Get-Process -Id $PID).Path
Start-Process $ps -ArgumentList '-NoExit', '-Command', "Set-Location '$Root\apps\saas-api'; uv run uvicorn saas_api.main:app --host 127.0.0.1 --port 9001 --reload"
Start-Process $ps -ArgumentList '-NoExit', '-Command', "Set-Location '$Root\apps\collector'; uv run uvicorn aegis_collector.main:app --host 127.0.0.1 --port 9100 --reload"
Start-Process $ps -ArgumentList '-NoExit', '-Command', "Set-Location '$Root\apps\web'; npm run dev"

Write-Host ''
Write-Host 'SaaS API  : http://127.0.0.1:9001/healthz   (docs: /docs)'
Write-Host 'Collector : http://127.0.0.1:9100/healthz   (loopback only)'
Write-Host 'Web       : http://127.0.0.1:5180'
