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
