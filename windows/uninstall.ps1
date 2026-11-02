# AdBazaar uninstaller for Windows — removes ONLY AdBazaar.
#
# Run this ONE line in Command Prompt (cmd):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/sagarkerhalkar/adbazaar-classifieds/main/windows/uninstall.ps1 | iex"
#
# It removes: the running AdBazaar app, its auto-start entry, its firewall rule,
# its desktop shortcut and the AdBazaar folder (app + database + uploaded files).
# It does NOT touch: Node.js, cloudflared / Cloudflare Tunnel service, or any other app.
# Only the node process that answers as "adbazaar" on AdBazaar's own port is stopped.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Say($msg, $color) { if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg } }
function Step($msg) { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }

Clear-Host
Say '=================================================' Yellow
Say '   AdBazaar uninstaller (removes only AdBazaar)' Yellow
Say '=================================================' Yellow

# ---------- Find the install folder ----------
$startupVbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'AdBazaar.vbs'
$candidates = @()
if ($env:ADB_DIR) { $candidates += $env:ADB_DIR }
if (Test-Path $startupVbs) {
  $m = [regex]::Match((Get-Content $startupVbs -Raw), '"""(.+?)\\windows\\start-hidden\.vbs"""')
  if ($m.Success) { $candidates += $m.Groups[1].Value }
}
$candidates += 'D:\AdBazaar', 'C:\AdBazaar'
$AppDir = $null
foreach ($c in $candidates) {
  if ($c -and (Test-Path (Join-Path $c 'server.js')) -and (Test-Path (Join-Path $c 'windows\start-hidden.vbs'))) { $AppDir = (Resolve-Path $c).Path; break }
}

if ($AppDir) { Say "AdBazaar folder found: $AppDir" }
else { Say 'No AdBazaar folder found (D:\AdBazaar or C:\AdBazaar). Will still clean auto-start, firewall rule and shortcut.' Yellow }

Write-Host ''
Say 'This will remove AdBazaar completely from this computer:' White
Say '  - stop the AdBazaar app (only AdBazaar - your other apps keep running)'
Say '  - turn off AdBazaar auto-start, remove its firewall rule and desktop shortcut'
if ($AppDir) { Say "  - DELETE the folder $AppDir (app, database, uploaded documents)" Red }
Say '  NOT touched: Node.js, cloudflared / Cloudflare Tunnel, any other program.' Green
Write-Host ''
$confirm = Read-Host 'Type YES to continue'
if ($confirm -ne 'YES') { Say 'Cancelled - nothing was changed.' Yellow; return }

# ---------- 1. Stop the app (safely) ----------
Step 'Stopping AdBazaar'
$port = 4780
if ($AppDir -and (Test-Path (Join-Path $AppDir '.env'))) {
  foreach ($line in Get-Content (Join-Path $AppDir '.env')) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] }
  }
}
$ports = @($port)
if ($AppDir -and (Test-Path (Join-Path $AppDir 'storage\server-url.txt'))) {
  $u = (Get-Content (Join-Path $AppDir 'storage\server-url.txt') -Raw).Trim()
  if ($u -match ':(\d+)$') { $ports += [int]$Matches[1] }
}
$stopped = $false
foreach ($p in ($ports | Select-Object -Unique)) {
  $isAdb = $false
  try { $isAdb = ((Invoke-RestMethod "http://localhost:$p/healthz" -TimeoutSec 3).app -eq 'adbazaar') } catch { $isAdb = $false }
  if (-not $isAdb) { continue }
  foreach ($c in @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
      Stop-Process -Id $proc.Id -Force
      $stopped = $true
      Say "Stopped AdBazaar (process $($proc.Id) on port $p)." Green
    }
  }
}
if (-not $stopped) { Say 'AdBazaar was not running.' }
Start-Sleep -Seconds 2

# ---------- 2. Optional backup (to move to another computer) ----------
$backup = $null
if ($AppDir -and (Test-Path (Join-Path $AppDir 'storage'))) {
  Step 'Backup'
  Say 'Do you want to keep your data (clients, ads, payments, settings) to move it to another laptop?'
  $b = Read-Host 'Make a backup .zip on your Desktop first? (Y/N) [N]'
  if ($b -match '^[Yy]') {
    foreach ($f in 'server.pid', 'server-url.txt', 'addresses.txt') { Remove-Item (Join-Path $AppDir "storage\$f") -Force -ErrorAction SilentlyContinue }
    $backup = Join-Path ([Environment]::GetFolderPath('Desktop')) ("AdBazaar-backup-" + (Get-Date -Format 'yyyy-MM-dd-HHmm') + '.zip')
    $items = @(Join-Path $AppDir 'storage')
    if (Test-Path (Join-Path $AppDir '.env')) { $items += (Join-Path $AppDir '.env') }
    Compress-Archive -Path $items -DestinationPath $backup -Force
    Say "Backup saved: $backup" Green
    Say 'It contains ID documents - keep it private and delete it after moving.' Yellow
  }
}

# ---------- 3. Auto-start, shortcut, firewall ----------
Step 'Removing auto-start, shortcut and firewall rule'
Remove-Item $startupVbs -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AdBazaar.lnk') -Force -ErrorAction SilentlyContinue
Say 'Auto-start and desktop shortcut removed.' Green
$hasRule = $false
try { $hasRule = [bool](Get-NetFirewallRule -DisplayName 'AdBazaar' -ErrorAction SilentlyContinue) } catch { $hasRule = $true }
if ($hasRule) {
  try {
    Say 'A Windows permission window will pop up to remove the firewall rule - click Yes.'
    Start-Process cmd.exe -ArgumentList '/c netsh advfirewall firewall delete rule name=AdBazaar' -Verb RunAs -Wait -WindowStyle Hidden
    Say 'Firewall rule removed.' Green
  } catch { Say 'Firewall rule not removed (you clicked No). It is harmless; remove later in Windows Defender Firewall > Inbound Rules > AdBazaar.' Yellow }
}

# ---------- 4. Delete the folder ----------
if ($AppDir) {
  Step "Deleting $AppDir"
  Set-Location $env:USERPROFILE
  $deleted = $false
  for ($i = 0; $i -lt 5 -and -not $deleted; $i++) {
    try { Remove-Item $AppDir -Recurse -Force; $deleted = $true } catch { Start-Sleep -Seconds 2 }
  }
  if ($deleted) { Say 'Folder deleted.' Green }
  else { Say "Could not delete $AppDir completely (a file is open). Close any window/Notepad using it, restart the PC and delete the folder by hand." Yellow }
}

Write-Host ''
Say '=================================================' Green
Say '   AdBazaar has been removed from this computer.' Green
Say '=================================================' Green
Say '  Node.js and Cloudflare Tunnel were NOT removed - your other apps are not affected.'
if ($backup) { Say "  Your backup: $backup  (copy it to the new laptop)" }
Say '  Next: in Cloudflare, delete the AdBazaar route (e.g. test.yourdomain.com) from this'
Say '  computer''s tunnel - see GUIDE.md "Move to another laptop".'
Write-Host ''
