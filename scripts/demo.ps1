<#
.SYNOPSIS
  Start the live AEGIS demo on this laptop: device webhook + collector (-> deployed SaaS) + simulator.
.DESCRIPTION
  Opens three windows:
    1. Device webhook receiver   (127.0.0.1:9200) - shows re-identified device alerts
    2. Collector                 (127.0.0.1:9100) - sends allow-listed metadata to the VPS
    3. Simulator (SYNTHETIC)     - normal traffic, then scenarios on a fixed timeline:
         t+0      normal traffic (baselines learn; >= 60 s needed before detection)
         t+75 s   S3  25 failed SSH logins on SRV_002 (security incident, counts only)
         t+240 s  S5  CPU step on SRV_002 to ~80 % (below static 85 %: only the AI baseline sees it)
         t+500 s  S6  NET_001 packet loss + latency; APP_001/APP_002 degrade 20 s later
  Spaced so each incident resolves (120 s quiet) before a related one starts: SRV_002 depends on
  NET_001, and overlapping signals on related sources are correctly grouped into one incident.
  Uses apps/collector/.env (VPS URL + collector token). Nothing is printed from it.
.EXAMPLE
  ./scripts/demo.ps1                 # full 12-minute timeline
  ./scripts/demo.ps1 -Minutes 6 -Scenarios 's6@90'
#>
param(
  [int]$Minutes = 12,
  [string[]]$Scenarios = @('s3@75', 's5@240', 's6@500')
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $Root '.venv\Scripts\python.exe'
$ps = (Get-Process -Id $PID).Path

Start-Process $ps -ArgumentList '-NoExit', '-Command',
  "`$host.UI.RawUI.WindowTitle='AEGIS device webhook'; Set-Location '$Root'; & '$py' scripts/webhook_receiver.py --port 9200"

Start-Process $ps -ArgumentList '-NoExit', '-Command',
  "`$host.UI.RawUI.WindowTitle='AEGIS collector'; Set-Location '$Root\apps\collector'; `$env:AEGIS_COL_NOTIFY_WEBHOOK_URL='http://127.0.0.1:9200/'; & '$py' -m uvicorn aegis_collector.main:app --host 127.0.0.1 --port 9100"

Write-Host 'Waiting for the collector...'
$ok = $false
foreach ($i in 1..30) {
  try { Invoke-RestMethod http://127.0.0.1:9100/healthz -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep 1 }
}
if (-not $ok) { throw 'collector did not start (check the collector window)' }

$simArgs = @('-m', 'simulator', '--rate', '80', '--duration', ($Minutes * 60))
foreach ($s in $Scenarios) { $simArgs += @('--scenario', $s) }
Start-Process $ps -ArgumentList '-NoExit', '-Command',
  "`$host.UI.RawUI.WindowTitle='AEGIS simulator (SYNTHETIC)'; Set-Location '$Root'; & '$py' $($simArgs -join ' ')"

Write-Host "Demo running for $Minutes min. Dashboard: https://aegis.162-35-42-114.sslip.io"
Write-Host 'Stop: close the three windows (closing the collector shows "collector offline" within ~35 s).'
