# AdBazaar one-command installer for Windows 10/11.
#
# Run this ONE line in Command Prompt (cmd):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/sagarkerhalkar/adbazaar-classifieds/main/windows/install.ps1 | iex"
#
# What it does: installs Node.js + cloudflared if missing, downloads AdBazaar to D:\AdBazaar
# (C:\AdBazaar if there is no D: drive), asks for your admin login, picks a free port,
# adds test data, opens the firewall for your Wi-Fi, turns on auto-start and opens the site.
# Running it again UPDATES the app and keeps your settings (.env) and data (storage).
# Optional: set a different folder first:   set ADB_DIR=E:\MyAds   (then run the line above)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'sagarkerhalkar/adbazaar-classifieds'
$Branch = 'main'

function Say($msg, $color) { if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg } }
function Step($msg) { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ask($question, $default) {
  $a = Read-Host "$question [$default]"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim()
}
function IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function HasWinget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }
function NodeOk {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return $false }
  $v = (& node -v) -replace '^v', ''
  $p = $v.Split('.')
  return ([int]$p[0] -gt 22) -or ([int]$p[0] -eq 22 -and [int]$p[1] -ge 13)
}
function PortFree([int]$port) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $false }
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
function SetEnvLine([string[]]$lines, [string]$key, [string]$value) {
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*#?\s*$key=") {
      if (-not $found) { $found = $true; "$key=$value" }
    } else { $line }
  }
  if (-not $found) { $out = @($out) + "$key=$value" }
  return ,@($out)
}
function GetEnvValue([string[]]$lines, [string]$key) {
  foreach ($line in $lines) { if ($line -match "^\s*$key=(.*)$") { return $Matches[1].Trim() } }
  return ''
}

Clear-Host
Say '=================================================' Yellow
Say '   AdBazaar installer' Yellow
Say '=================================================' Yellow

# ---------- 1. Folder ----------
if ($env:ADB_DIR) { $AppDir = $env:ADB_DIR }
elseif (Test-Path 'D:\') { $AppDir = 'D:\AdBazaar' }
else { $AppDir = 'C:\AdBazaar'; Say 'No D: drive found - installing to C:\AdBazaar instead.' Yellow }
Say "Install folder: $AppDir"

# ---------- 2. Node.js ----------
Step 'Checking Node.js'
if (NodeOk) {
  Say "Node.js $(node -v) is installed - OK" Green
} else {
  Say 'Installing Node.js (LTS)... a Windows permission window may pop up - click Yes.'
  $done = $false
  if (HasWinget) {
    try {
      winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
      RefreshPath
      $done = NodeOk
    } catch { $done = $false }
  }
  if (-not $done) {
    Say 'Downloading Node.js installer directly from nodejs.org...'
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
    $msi = Join-Path $env:TEMP "node-$($lts.version)-x64.msi"
    Invoke-WebRequest "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-x64.msi" -OutFile $msi
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qb" -Verb RunAs -Wait
    RefreshPath
  }
  if (-not (NodeOk)) {
    Say 'Node.js could not be installed automatically.' Red
    Say 'Install the LTS version from https://nodejs.org, restart the computer, and run the installer command again.' Red
    return
  }
  Say "Node.js $(node -v) installed - OK" Green
}

# ---------- 3. cloudflared (for the free internet link / your domain) ----------
Step 'Checking Cloudflare Tunnel tool (cloudflared)'
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Say 'cloudflared is installed - OK' Green
} else {
  $ok = $false
  if (HasWinget) {
    try {
      winget install --id Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
      RefreshPath
      $ok = [bool](Get-Command cloudflared -ErrorAction SilentlyContinue)
    } catch { $ok = $false }
  }
  if ($ok) { Say 'cloudflared installed - OK' Green }
  else { Say 'Skipped cloudflared (not needed to run the app; install later with: winget install Cloudflare.cloudflared)' Yellow }
}

# ---------- 4. Download / update the app ----------
Step 'Downloading AdBazaar'
$pidFile = Join-Path $AppDir 'storage\server.pid'
if (Test-Path $pidFile) {
  $oldPid = (Get-Content $pidFile -Raw).Trim()
  if ($oldPid) { Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $AppDir 'storage\server-url.txt') -Force -ErrorAction SilentlyContinue
  Say 'Stopped the running copy for the update.'
  Start-Sleep -Seconds 1
}
$zip = Join-Path $env:TEMP 'adbazaar.zip'
$tmp = Join-Path $env:TEMP 'adbazaar-unzip'
Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
# Copies program files only. Your .env and storage folder (data) are never in the download, so they are kept.
robocopy $src.FullName $AppDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Say 'Copying files failed. Is the folder open in another program?' Red; return }
Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir 'storage') | Out-Null
Say "AdBazaar files are in $AppDir" Green
Set-Location $AppDir

# ---------- 5. Settings (.env) ----------
Step 'Settings'
$envPath = Join-Path $AppDir '.env'
$firstInstall = -not (Test-Path $envPath)
if ($firstInstall) {
  $lines = Get-Content (Join-Path $AppDir '.env.example')
  Say 'Create YOUR owner (admin) login for the admin panel:'
  do { $email = Read-Host 'Admin email' } while ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$')
  do {
    $pw = ''
    $sec = Read-Host 'Admin password (min 6 characters, you will not see it while typing)' -AsSecureString
    $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if ($pw.Length -lt 6) { Say 'Too short - use at least 6 characters.' Yellow }
    elseif ($pw.Contains('"') -and $pw.Contains("'")) { Say 'Please do not use both kinds of quote marks.' Yellow; $pw = '' }
  } while ($pw.Length -lt 6)
  $upi = Read-Host 'Your UPI ID for payments, e.g. name@okhdfcbank (press Enter to skip, add later in Admin > Settings)'
  $lines = SetEnvLine $lines 'ADMIN_EMAIL' $email
  # Quote the password so characters like # or spaces are kept exactly.
  if ($pw.Contains("'")) { $q = '"' + $pw + '"' } else { $q = "'" + $pw + "'" }
  $lines = SetEnvLine $lines 'ADMIN_PASSWORD' $q
  if ($upi) { $lines = SetEnvLine $lines 'UPI_ID' $upi.Trim() }
  else { $lines = SetEnvLine $lines 'UPI_ID' '' }
  $port = 4780
} else {
  Say 'Keeping your existing settings (.env).' Green
  $lines = Get-Content $envPath
  $port = [int](GetEnvValue $lines 'PORT')
  if (-not $port) { $port = 4780 }
}

# Free port: keep the current one if free, otherwise find the next free one.
if (-not (PortFree $port)) {
  $start = $port
  while (-not (PortFree $port)) { $port++; if ($port -gt $start + 200) { throw 'No free port found.' } }
  Say "Port $start is used by another program - using port $port instead." Yellow
  Say "If you already set up a Cloudflare route, change its Service URL to http://localhost:$port" Yellow
}
$lines = SetEnvLine $lines 'PORT' "$port"
$lines = SetEnvLine $lines 'COOKIE_SECURE' 'auto'
[IO.File]::WriteAllLines($envPath, [string[]]$lines)   # UTF-8 without BOM
Say "Using port $port" Green

# ---------- 6. Firewall for phones on your Wi-Fi ----------
Step 'Allowing phones/laptops on your Wi-Fi to open the site'
$fw = "netsh advfirewall firewall delete rule name=AdBazaar >nul 2>&1 & netsh advfirewall firewall add rule name=AdBazaar dir=in action=allow protocol=TCP localport=$port profile=private,domain"
try {
  if (IsAdmin) { cmd /c $fw | Out-Null }
  else {
    Say 'A Windows permission window will pop up - click Yes (or No to skip).'
    Start-Process cmd.exe -ArgumentList "/c $fw" -Verb RunAs -Wait -WindowStyle Hidden
  }
  Say 'Firewall rule added (private networks only).' Green
} catch { Say 'Skipped firewall rule. Wi-Fi devices may not reach the site until you run windows\allow-lan-access.bat as administrator.' Yellow }

# ---------- 7. Start the app ----------
Step 'Starting AdBazaar'
Remove-Item (Join-Path $AppDir 'storage\server-url.txt') -Force -ErrorAction SilentlyContinue
Start-Process wscript.exe -ArgumentList "`"$AppDir\windows\start-hidden.vbs`""
$url = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $uf = Join-Path $AppDir 'storage\server-url.txt'
  if (Test-Path $uf) { $url = (Get-Content $uf -Raw).Trim(); break }
}
if (-not $url) {
  Say 'AdBazaar did not start. The reason is in this file:' Red
  Say "  $AppDir\storage\server.log" Red
  if (Test-Path "$AppDir\storage\server.log") { Get-Content "$AppDir\storage\server.log" -Tail 15 | Out-Host }
  return
}
Say "Running at $url" Green

# ---------- 8. Test data ----------
if ($firstInstall) {
  Step 'Test data'
  $t = Ask 'Add test sellers, ads and payments so you can try everything? (Y/N)' 'Y'
  if ($t -match '^[Yy]') { & node scripts\seed-test.js | Out-Host }
}

# ---------- 9. Auto-start with Windows ----------
Step 'Auto-start'
$startup = [Environment]::GetFolderPath('Startup')
$vbs = Join-Path $startup 'AdBazaar.vbs'
$a = Ask 'Start AdBazaar automatically every time you log in to Windows? (Y/N)' 'Y'
if ($a -match '^[Yy]') {
  $line = 'CreateObject("WScript.Shell").Run """' + $AppDir + '\windows\start-hidden.vbs""", 0, False'
  [IO.File]::WriteAllText($vbs, $line + "`r`n")
  Say 'Auto-start is ON (turn off with windows\autostart-OFF.bat).' Green
} else {
  Remove-Item $vbs -Force -ErrorAction SilentlyContinue
  Say 'Auto-start is OFF (turn on later with windows\autostart-ON.bat).'
}

# ---------- 10. Desktop shortcut ----------
try {
  $desk = [Environment]::GetFolderPath('Desktop')
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut((Join-Path $desk 'AdBazaar.lnk'))
  $lnk.TargetPath = "$AppDir\windows\open-site.bat"
  $lnk.WorkingDirectory = $AppDir
  $lnk.WindowStyle = 7
  $lnk.Save()
} catch { }

# ---------- Done ----------
Write-Host ''
Say '=================================================' Green
Say '   AdBazaar is installed and running!' Green
Say '=================================================' Green
Get-Content (Join-Path $AppDir 'storage\addresses.txt') | ForEach-Object { Say "  $_" }
Write-Host ''
if ($firstInstall) { Say "  Admin login:  $url/admin/login   (email: $email)" }
Say '  Test sellers: rahul.test@example.com ... password Test@1234'
Say "  Folder:       $AppDir      Desktop shortcut: AdBazaar"
Say '  Free internet link for testing:  double-click windows\cloudflare-quick-test.bat'
Say '  Your own domain: see GUIDE.md Part 9'
Write-Host ''
Start-Process $url
