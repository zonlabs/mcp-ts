param(
    [string]$Repo = "pypi",
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

# --- Validate inputs ---
if ($Repo -ne "pypi" -and $Repo -ne "testpypi") {
    Write-Host "Usage: publish_pypi.ps1 [pypi|testpypi] [all|local|remote]"
    exit 1
}

if ($Target -ne "all" -and $Target -ne "local" -and $Target -ne "remote") {
    Write-Host "Usage: publish_pypi.ps1 [pypi|testpypi] [all|local|remote]"
    exit 1
}

# --- Check credentials ---
if (-not $env:TWINE_USERNAME -or -not $env:TWINE_PASSWORD) {
    Write-Host "Missing TWINE_USERNAME or TWINE_PASSWORD in environment."
    exit 1
}

# --- Root dir ---
$ROOT_DIR = Resolve-Path "$PSScriptRoot\.."

function Publish-Package {
    param([string]$pkgDir)

    Write-Host "==> Publishing from $pkgDir"

    Push-Location $pkgDir

    # Clean
    Remove-Item -Recurse -Force dist, build -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force *.egg-info -ErrorAction SilentlyContinue

    # Build
    python -m build

    # Upload
    if ($Repo -eq "testpypi") {
        python -m twine upload --repository testpypi dist/*
    } else {
        python -m twine upload dist/*
    }

    Pop-Location
}

# --- Run ---
if ($Target -eq "all" -or $Target -eq "local") {
    Publish-Package "$ROOT_DIR\packages\mcp-local-agent"
}

if ($Target -eq "all" -or $Target -eq "remote") {
    Publish-Package "$ROOT_DIR\packages\mcp-remote-server"
}

Write-Host "Publish complete."