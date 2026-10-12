$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\bootstrap.ps1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    foreach ($relative in @('extension\preview.html','extension\extension.js','extension\controls.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative) -PathType Leaf)) {
            throw 'Verification files are incomplete. Extract the complete project and try again.'
        }
    }
    $browser = $null
    $candidates = @($env:CODEX_STARTUP_BROWSER,
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $browser = $candidate; break }
    }
    if (-not $browser) { throw 'Microsoft Edge or Google Chrome was not found.' }
    $dataDirectory = if ($env:CODEX_STARTUP_DATA) { $env:CODEX_STARTUP_DATA } else { Join-Path $projectRoot '.windows' }
    $profile = [IO.Path]::GetFullPath((Join-Path $dataDirectory 'browser-profile-verification-file'))
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    $page = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'extension\preview.html')).Path
    $url = ([Uri]$page).AbsoluteUri
    # This is a visible local page. Repeated launches use the browser's own instance handling.
    # No local server, debugger, Node runtime, or process termination is needed.
    $browserArguments = @('--no-first-run','--no-default-browser-check','--disable-background-mode',
        ('--user-data-dir="' + $profile + '"'),('--app=' + $url))
    Start-Process -FilePath $browser -ArgumentList $browserArguments | Out-Null
    Write-Output 'Verification page opened.'
    exit 0
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
