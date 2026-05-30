# build.ps1 - Builds EnergyPass.so inside WSL.
# Run from repo root or scripts\: .\scripts\build.ps1

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PassDir  = Join-Path $RepoRoot 'llvm-pass'
$BuildDir = Join-Path $PassDir  'build'

function ConvertTo-WslPath($winPath) {
    $drive = $winPath.Substring(0, 1).ToLower()
    $rest  = $winPath.Substring(2).Replace('\', '/')
    "/mnt/$drive$rest"
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Error 'WSL is not available. Enable WSL and install Ubuntu 24.04 first.'
    exit 1
}

$WslPassDir  = ConvertTo-WslPath $PassDir
$WslBuildDir = ConvertTo-WslPath $BuildDir

Write-Host '==> Configuring and building EnergyPass inside WSL ...'
Write-Host "    Pass dir : $WslPassDir"
Write-Host "    Build dir: $WslBuildDir"

# Write the bash build logic to a temp file with LF-only line endings
# so bash does not complain about CRLF.
$TempSh = Join-Path $env:TEMP 'energy-build.sh'
$BashScript = @"
#!/bin/bash
set -euo pipefail

if ! command -v cmake &>/dev/null; then
  echo 'ERROR: cmake not found. Run: sudo apt install cmake ninja-build' >&2
  exit 1
fi

if command -v llvm-config-18 &>/dev/null; then
  LLVM_DIR=`$(llvm-config-18 --cmakedir)
elif command -v llvm-config &>/dev/null; then
  LLVM_DIR=`$(llvm-config --cmakedir)
else
  echo 'ERROR: llvm-config not found. Run: sudo apt install llvm-18 llvm-18-dev clang-18' >&2
  exit 1
fi

echo "==> Using LLVM CMake dir: `$LLVM_DIR"
export CC=`${CC:-clang-18}
export CXX=`${CXX:-clang++-18}

cmake -S '$WslPassDir' -B '$WslBuildDir' -G Ninja \
  -DLLVM_DIR="`$LLVM_DIR" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo

cmake --build '$WslBuildDir'

if [[ -f '$WslBuildDir/EnergyPass.so' ]]; then
  echo '==> Build succeeded: $WslBuildDir/EnergyPass.so'
else
  echo 'ERROR: EnergyPass.so not found after build' >&2
  exit 1
fi
"@

# WriteAllText with UTF-8 no-BOM and LF line endings
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($TempSh, $BashScript.Replace("`r`n", "`n"), $Utf8NoBom)

$WslTempSh = ConvertTo-WslPath $TempSh
wsl.exe /bin/bash $WslTempSh
$ExitCode = $LASTEXITCODE

Remove-Item $TempSh -ErrorAction SilentlyContinue

if ($ExitCode -ne 0) {
    Write-Error "Build failed (exit code $ExitCode)."
    exit $ExitCode
}

$SoPath = Join-Path $BuildDir 'EnergyPass.so'
if (Test-Path $SoPath) {
    Write-Host ''
    Write-Host '==> EnergyPass.so is ready.'
    Write-Host "    $SoPath"
} else {
    Write-Error "EnergyPass.so not found at: $SoPath"
    exit 1
}
