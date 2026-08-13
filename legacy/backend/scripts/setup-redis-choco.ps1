# setup-redis-choco.ps1
# Run as Administrator. Installs Chocolatey (if missing), installs Redis, starts service,
# verifies connectivity and restarts Node server & worker.

param(
  [string]$RedisHost = '127.0.0.1',
  [int]$RedisPort = 6379
)

function Ensure-RunningAsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Open PowerShell (Admin) and re-run."
    exit 1
  }
}

function Install-ChocolateyIfMissing {
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host "Chocolatey already installed"
    return
  }
  Write-Host "Installing Chocolatey..."
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
  if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Error "Chocolatey installation failed. Please follow https://chocolatey.org/install"
    exit 1
  }
}

function Install-Redis {
  Write-Host "Installing Redis (redis-64) via Chocolatey..."
  choco install redis-64 -y
  if ($LASTEXITCODE -ne 0) { Write-Error "choco install failed with code $LASTEXITCODE"; exit 1 }
}

function Start-RedisService {
  Write-Host "Starting Redis service..."
  try { Start-Service Redis -ErrorAction Stop } catch { Write-Host "Service may already exist or not registered: $_" }
  Start-Sleep -Seconds 2
  $svc = Get-Service -Name Redis -ErrorAction SilentlyContinue
  if ($null -eq $svc -or $svc.Status -ne 'Running') {
    Write-Host "Attempting to run redis-server.exe directly if service not available..."
    $possible = @(
      "$env:ProgramFiles\Redis\redis-server.exe",
      "C:\ProgramData\chocolatey\lib\redis-64\tools\redis-server.exe",
      "C:\Program Files\Redis\redis-server.exe"
    )
    $exe = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($exe) {
      Start-Process -FilePath $exe -ArgumentList "--service-run" -NoNewWindow -PassThru | Out-Null
      Start-Sleep -Seconds 2
    } else {
      Write-Warning "Could not find redis-server executable to start; check package docs or start service manually."
    }
  }
  $svc = Get-Service -Name Redis -ErrorAction SilentlyContinue
  if ($svc) { Write-Host "Redis Service status:" $svc.Status }
}

function Test-Redis {
  Write-Host "Testing Redis connectivity to $RedisHost:$RedisPort ..."
  try {
    $cli = Get-Command redis-cli -ErrorAction SilentlyContinue
    if ($cli) {
      $res = & redis-cli -h $RedisHost -p $RedisPort PING 2>$null
      Write-Host "redis-cli PING response: $res"
      if ($res -ne 'PONG') { throw "No PONG" }
      return $true
    } else {
      # Try TCP connect
      $tcp = $null
      try { $tcp = New-Object System.Net.Sockets.TcpClient; $a = $tcp.ConnectAsync($RedisHost,$RedisPort); $a.Wait(2000); if (-not $tcp.Connected) { throw 'connect failed' } } finally { if ($tcp) { $tcp.Close() } }
      Write-Host "TCP connect to Redis OK"
      return $true
    }
  } catch {
    Write-Warning "Redis test failed: $_"
    return $false
  }
}

function Verify-And-Restart-App {
  $backend = Join-Path $PSScriptRoot '..' | Resolve-Path
  $backend = (Join-Path $backend 'backend')
  Write-Host "Restarting Node server and worker in $backend ..."
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*node*" } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $backend -NoNewWindow -PassThru | Out-Null
  Start-Sleep -Seconds 1
  Start-Process -FilePath node -ArgumentList 'worker.js' -WorkingDirectory $backend -NoNewWindow -PassThru | Out-Null
  Write-Host "Started server.js and worker.js (check Task Manager if windows)"
}

# Main
Ensure-RunningAsAdmin
Install-ChocolateyIfMissing
Install-Redis
Start-RedisService
$ok = Test-Redis
if (-not $ok) {
  Write-Warning "Redis not responding. Please check service logs or start manually."
  exit 2
}

# Persist REDIS_HOST environment for current user
Write-Host "Setting REDIS_HOST environment variable for current user to $RedisHost"
setx REDIS_HOST $RedisHost | Out-Null
$env:REDIS_HOST = $RedisHost

# Run the repo check script
Write-Host "Running backend/scripts/check-redis.js to verify connectivity..."
Push-Location (Join-Path $PSScriptRoot '..' )
node .\backend\scripts\check-redis.js
Pop-Location

# Restart app processes
Verify-And-Restart-App

Write-Host "Done. Open http://localhost:3000 and verify login/jobs UI."