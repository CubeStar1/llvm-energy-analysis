# run.ps1 - Starts the backend (via WSL) and frontend (Node on Windows).
# Opens each service in its own window.
# Run from repo root or scripts\: .\scripts\run.ps1

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$PassSo      = Join-Path $RepoRoot 'llvm-pass\build\EnergyPass.so'
$BackendDir  = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'

function ConvertTo-WslPath($winPath) {
    $drive = $winPath.Substring(0, 1).ToLower()
    $rest  = $winPath.Substring(2).Replace('\', '/')
    "/mnt/$drive$rest"
}

if (-not (Test-Path $PassSo)) {
    Write-Error "EnergyPass.so not found at:`n  $PassSo`nRun .\scripts\build.ps1 first."
    exit 1
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Error 'WSL is not available. The backend requires WSL to invoke clang++ and llc.'
    exit 1
}

# --- Backend (runs inside WSL in a new window) ---
$WslBackendDir = ConvertTo-WslPath $BackendDir

$TempSh = Join-Path $env:TEMP 'energy-backend.sh'
$BackendScript = @"
#!/bin/bash
set -euo pipefail
if ! command -v uv &>/dev/null; then
  echo 'ERROR: uv not found. Install with: pip install uv' >&2
  exit 1
fi
cd '$WslBackendDir'
uv run backend
"@

$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($TempSh, $BackendScript.Replace("`r`n", "`n"), $Utf8NoBom)

$WslTempSh = ConvertTo-WslPath $TempSh
Write-Host '==> Starting backend in a new WSL window ...'
Start-Process wsl.exe -ArgumentList "/bin/bash $WslTempSh"

# Poll until backend responds
Write-Host -NoNewline '==> Waiting for backend'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:8000/healthz' `
             -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Write-Host -NoNewline '.'
}
Write-Host ''

if ($ready) {
    Write-Host '==> Backend is ready.'
} else {
    Write-Warning 'Backend did not respond in 15 s - check the WSL window for errors.'
}

# --- Frontend (runs in a new PowerShell window) ---
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host '==> Starting frontend in a new PowerShell window ...'
    $FrontendCmd = "Set-Location '$FrontendDir'; npm run dev; Read-Host 'Press Enter to close'"
    Start-Process powershell.exe -ArgumentList '-NoExit', '-Command', $FrontendCmd
} else {
    Write-Warning 'node not found - skipping frontend. Install Node 20+ to run the UI.'
}

Write-Host ''
Write-Host '==> Services are running in separate windows.'
Write-Host '    Backend  : http://localhost:8000'
Write-Host '    Analyze  : http://localhost:3000/analyze'
Write-Host '    Close the WSL and PowerShell windows to stop the services.'
