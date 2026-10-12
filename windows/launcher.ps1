param([ValidateSet('auto','splash','integrated','preview','verify','probe')][string]$Mode = 'integrated')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\bootstrap.ps1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $system = Join-Path $PSScriptRoot 'system.ps1'
    $discovery = & $system -Action Discover
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Unable to locate the Windows runtime.' }
    $info = $discovery | ConvertFrom-Json
    if (-not $info.node) { throw 'Node.js 22+ was not found. Install Codex desktop (with its bundled Node) or Node.js 22+.' }
    & $info.node (Join-Path $PSScriptRoot 'run.mjs') '--mode' $Mode
    exit $LASTEXITCODE
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
