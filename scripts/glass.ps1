<#
.SYNOPSIS
  Open the collector's Privacy Glass page and put the local admin token on the clipboard.
.DESCRIPTION
  The token is read from apps/collector/.env and is never printed. Paste it into the page's
  Unlock box (Ctrl+V). The clipboard is cleared after -ClearAfter seconds (default 90).
  The collector must be running (./scripts/demo.ps1).
#>
param([int]$ClearAfter = 90)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$line = Get-Content (Join-Path $Root 'apps\collector\.env') |
  Where-Object { $_ -match '^AEGIS_COL_LOCAL_ADMIN_TOKEN=' } | Select-Object -First 1
if (-not $line) { throw 'AEGIS_COL_LOCAL_ADMIN_TOKEN not found in apps/collector/.env' }
Set-Clipboard -Value $line.Substring('AEGIS_COL_LOCAL_ADMIN_TOKEN='.Length).Trim()
Start-Process 'http://127.0.0.1:9100/glass'
Write-Host "Admin token copied to the clipboard (not shown). Paste it into Unlock. Clearing in $ClearAfter s..."
Start-Sleep -Seconds $ClearAfter
Set-Clipboard -Value ' '
Write-Host 'Clipboard cleared.'
