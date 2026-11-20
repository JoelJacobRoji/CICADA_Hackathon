# Apply SaaS migrations to every regional database configured in apps/saas-api/.env
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location "$Root\apps\saas-api"
try {
  foreach ($region in @('ap-south', 'eu-west')) {
    Write-Host "Migrating region $region"
    uv run alembic -x "region=$region" upgrade head
    if ($LASTEXITCODE -ne 0) { throw "migration failed for $region" }
  }
} finally { Pop-Location }
