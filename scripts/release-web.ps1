<#
.SYNOPSIS
  Build the dashboard from the CURRENT COMMIT (clean tree required) and deploy it to the VPS.
.DESCRIPTION
  Writes build.txt (commit + UTC build time) into the bundle so the deployed UI is traceable,
  uploads it to /root/aegis-infra/web-dist and runs `install.sh web` (atomic swap).
#>
param(
  [string]$DataSourceLabel = 'SYNTHETIC - AEGIS telemetry simulator (official data source: organizers provide no dataset)',
  [string]$SshHost = 'incendium'
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (git status --porcelain) { throw 'Working tree is not clean: commit first so the build matches a commit.' }
$commit = (git rev-parse --short HEAD).Trim()

$env:VITE_DATA_SOURCE_LABEL = $DataSourceLabel
npm --prefix apps/web run build
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
"commit $commit built $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))" |
  Out-File -Encoding ascii apps/web/dist/build.txt

ssh $SshHost 'rm -rf /root/aegis-infra/web-dist'
scp -r -q apps/web/dist "${SshHost}:/root/aegis-infra/web-dist"
ssh $SshHost 'bash /root/aegis-infra/install.sh web'
Write-Host "Dashboard deployed from commit $commit"
