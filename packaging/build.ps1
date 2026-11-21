param(
    [string]$Version = "",
    [switch]$SkipTests
)

# Builds the portable folder and the installer in one command.
# Usage: .\packaging\build.ps1 -Version 0.1.1
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$pyinstaller = Join-Path $root ".venv\Scripts\pyinstaller.exe"
$iscc = Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"
$vendor = Join-Path $root "packaging\vendor"

if (-not (Test-Path $python)) { throw "No .venv found. Run install.ps1 first." }
if (-not (Test-Path $iscc)) { throw "Inno Setup 6 not found: $iscc" }

if (-not $Version) {
    $issText = Get-Content (Join-Path $PSScriptRoot "luna.iss") -Raw
    if ($issText -match '#define AppVersion "([^"]+)"') { $Version = $Matches[1] } else { $Version = "0.1.0" }
}
Write-Host "Build version: $Version" -ForegroundColor Cyan

New-Item -ItemType Directory -Force $vendor | Out-Null
foreach ($tool in @("ffmpeg.exe", "ffprobe.exe", "deno.exe")) {
    $path = Join-Path $vendor $tool
    if (Test-Path $path) { continue }
    if ($tool -eq "deno.exe") {
        $sourcePath = Join-Path $root ".venv\Scripts\deno.exe"
    } else {
        $sourcePath = Join-Path "C:\ffmpeg\bin" $tool
    }
    if (-not (Test-Path $sourcePath)) {
        throw "Missing $tool. Put it into packaging\vendor\$tool."
    }
    Copy-Item $sourcePath $path
    Write-Host "added $tool" -ForegroundColor DarkGray
}

Push-Location $root
try {
    if (-not $SkipTests) {
        Write-Host "Running tests..." -ForegroundColor Cyan
        & $python -m unittest discover -s tests -t . *> $null
        if ($LASTEXITCODE -ne 0) { throw "Tests failed, build stopped." }
    }

    Write-Host "Building application..." -ForegroundColor Cyan
    & $pyinstaller "packaging\luna.spec" --noconfirm --log-level ERROR *> "packaging\build-app.log"
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed." }

    Write-Host "Building installer..." -ForegroundColor Cyan
    & $iscc "/DAppVersion=$Version" "packaging\luna.iss" *> "packaging\build-installer.log"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed." }
} finally {
    Pop-Location
}

$setup = Join-Path $root "dist\installer\Luna-Setup-$Version.exe"
if (-not (Test-Path $setup)) { throw "Installer was not created: $setup" }
$sizeMb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
Write-Host ""
Write-Host "Done: $setup ($sizeMb MB)" -ForegroundColor Green
Write-Host "Install over the current build: Start-Process '$setup' -ArgumentList '/SILENT','/CURRENTUSER','/NORESTART' -Wait"
