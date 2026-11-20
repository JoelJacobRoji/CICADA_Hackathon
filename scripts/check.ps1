# Run every quality gate. Exit code != 0 if anything fails.
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$failed = @()

function Invoke-Step([string]$name, [scriptblock]$cmd) {
  Write-Host "== $name" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { $script:failed += $name }
}

# Load AEGIS_TEST_DB_ADMIN_URL from root .env (if present) so integration tests run.
if (Test-Path "$Root\.env") {
  Get-Content "$Root\.env" | Where-Object { $_ -match '^AEGIS_TEST_DB_ADMIN_URL=' } | ForEach-Object {
    $env:AEGIS_TEST_DB_ADMIN_URL = $_.Substring('AEGIS_TEST_DB_ADMIN_URL='.Length)
  }
}

Invoke-Step 'ruff lint'      { uv run ruff check . }
Invoke-Step 'ruff format'    { uv run ruff format --check . }
Invoke-Step 'pytest'         { uv run pytest }
# CI parity (K16): same suite with ALL .env loading disabled - environment variables only, as on
# GitHub Actions. Only the values CI itself provides are set here.
Invoke-Step 'pytest (CI parity, no .env)' {
  $saved = @{ PP = $env:PYTHONPATH; PW = $env:AEGIS_SAAS_DB_APP_PASSWORD; JK = $env:AEGIS_SAAS_JWT_SIGNING_KEY }
  if (Test-Path "$Root\.env") {
    Get-Content "$Root\.env" | Where-Object { $_ -match '^AEGIS_DB_APP_PASSWORD=' } | ForEach-Object {
      $env:AEGIS_SAAS_DB_APP_PASSWORD = $_.Substring('AEGIS_DB_APP_PASSWORD='.Length)
    }
  }
  $env:AEGIS_SAAS_JWT_SIGNING_KEY = 'ci_parity_signing_key_00000000000000000000'
  $env:PYTHONPATH = "$Root\scripts"
  uv run pytest -p pytest_ci_parity
  $code = $LASTEXITCODE
  $env:PYTHONPATH = $saved.PP; $env:AEGIS_SAAS_DB_APP_PASSWORD = $saved.PW; $env:AEGIS_SAAS_JWT_SIGNING_KEY = $saved.JK
  $global:LASTEXITCODE = $code
}
Invoke-Step 'web typecheck'  { npm --prefix apps/web run typecheck }
Invoke-Step 'web lint'       { npm --prefix apps/web run lint }
Invoke-Step 'web test'       { npm --prefix apps/web run test }
Invoke-Step 'web build'      { npm --prefix apps/web run build }
Invoke-Step 'no secrets tracked' {
  $bad = git ls-files | Where-Object { $_ -match '(^|/)\.env$|\.db$|\.pem$|\.key$' }
  if ($bad) { Write-Host "Tracked sensitive files: $bad"; $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }
}

if ($failed.Count) { Write-Host "FAILED: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host 'ALL CHECKS PASSED' -ForegroundColor Green
