param(
    [ValidateSet('Discover','Validate','Listener','Running','Activate','Launch')][string]$Action = 'Discover',
    [string]$ExePath = '',
    [int]$Port = 0,
    [string]$ProfilePath = ''
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\bootstrap.ps1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-AppInfo([string]$Candidate) {
    if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $null }
    $resolved = (Resolve-Path -LiteralPath $Candidate).Path
    $directory = Split-Path -Parent $resolved
    if (-not (Test-Path -LiteralPath (Join-Path $directory 'resources\app.asar'))) { return $null }
    if ([IO.Path]::GetFileName($resolved) -notin @('ChatGPT.exe','Codex.exe')) { return $null }
    $signature = Get-AuthenticodeSignature -LiteralPath $resolved
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=(?:"OpenAI OpCo, LLC"|"OpenAI"|OpenAI)(?:,|$)') {
        throw 'The Codex executable must have a valid OpenAI signature.'
    }
    return [pscustomobject]@{ exe = $resolved; directory = $directory; publisher = $signature.SignerCertificate.Subject }
}
function Get-Running([string]$Path) {
    return @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" | Where-Object {
        $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $Path, [StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId } })
}
function Find-Browser {
    $candidates = @($env:CODEX_STARTUP_BROWSER,
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).Path } }
    return $null
}
try {
    switch ($Action) {
        'Discover' {
            $app = $null
            $explicit = if ($ExePath) { $ExePath } else { $env:CODEX_STARTUP_EXE }
            if ($explicit) {
                $app = Get-AppInfo $explicit
                if (-not $app) { throw 'CODEX_STARTUP_EXE is not a Codex desktop executable.' }
            } else {
                $packages = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Sort-Object Version -Descending)
                foreach ($package in $packages) {
                    foreach ($relative in @('app\ChatGPT.exe','app\Codex.exe')) {
                        $app = Get-AppInfo (Join-Path $package.InstallLocation $relative)
                        if ($app) { break }
                    }
                    if ($app) { break }
                }
                if (-not $app) {
                    $processes = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" -ErrorAction SilentlyContinue)
                    $candidates = @($processes | ForEach-Object { $_.ExecutablePath }) + @(
                        (Join-Path $env:LOCALAPPDATA 'Programs\Codex\Codex.exe'),
                        (Join-Path $env:LOCALAPPDATA 'Programs\Codex\ChatGPT.exe'),
                        (Join-Path $env:ProgramFiles 'Codex\Codex.exe'))
                    foreach ($candidate in $candidates) { $app = Get-AppInfo $candidate; if ($app) { break } }
                }
            }
            $node = $null
            $runtimeCandidates = @()
            if ($app) { $runtimeCandidates += Join-Path $app.directory 'resources\cua_node\bin\node.exe' }
            $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
            if ($systemNode) { $runtimeCandidates += $systemNode.Source }
            if ($env:CODEX_STARTUP_NODE) { $runtimeCandidates = @($env:CODEX_STARTUP_NODE) + $runtimeCandidates }
            foreach ($candidate in $runtimeCandidates) {
                if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $node = (Resolve-Path -LiteralPath $candidate).Path; break }
            }
            [pscustomobject]@{ app = $app; node = $node; browser = Find-Browser; running = @(if ($app) { Get-Running $app.exe }) } | ConvertTo-Json -Depth 6 -Compress
        }
        'Validate' {
            $app = Get-AppInfo $ExePath
            if (-not $app) { throw 'Codex desktop executable not found.' }
            $app | ConvertTo-Json -Compress
        }
        'Running' { ConvertTo-Json -InputObject @(Get-Running $ExePath) -Depth 4 -Compress }
        'Listener' {
            if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port.' }
            $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
            if (-not $listeners.Count) { throw 'Debug listener is not ready.' }
            $expectedPath = [IO.Path]::GetFullPath($ExePath)
            $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            $owners = @()
            foreach ($listener in $listeners) {
                if ($listener.LocalAddress -ne '127.0.0.1') { throw 'Debug listener is not limited to IPv4 loopback.' }
                $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listener.OwningProcess)
                if (-not $process.ExecutablePath -or -not [string]::Equals($process.ExecutablePath, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'Debug listener does not belong to the expected executable.'
                }
                $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
                if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne $currentSid) { throw 'Debug listener belongs to another user.' }
                if ($ProfilePath -and ($process.CommandLine.IndexOf($ProfilePath, [StringComparison]::OrdinalIgnoreCase) -lt 0)) {
                    throw 'Browser debug listener does not belong to the preview profile.'
                }
                $owners += [int]$process.ProcessId
            }
            [pscustomobject]@{ verified = $true; pids = @($owners | Select-Object -Unique) } | ConvertTo-Json -Compress
        }
        'Launch' {
            $app = Get-AppInfo $ExePath
            if (-not $app) { throw 'Codex desktop executable not found.' }
            if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid debug port.' }
            $arguments = @('--remote-debugging-address=127.0.0.1',('--remote-debugging-port=' + $Port))
            if ($ProfilePath) {
                $isolatedProfile = [IO.Path]::GetFullPath($ProfilePath)
                $env:CODEX_ELECTRON_USER_DATA_PATH = $isolatedProfile
                $arguments += '--user-data-dir="' + $isolatedProfile + '"'
            }
            $started = Start-Process -FilePath $app.exe -WorkingDirectory $app.directory -ArgumentList $arguments -WindowStyle Normal -PassThru
            [pscustomobject]@{pid = $started.Id; launched = $true} | ConvertTo-Json -Compress
        }
        'Activate' {
            # Starting the signed desktop executable invokes its own single-instance handling.
            $app = Get-AppInfo $ExePath
            if (-not $app) { throw 'Codex desktop executable not found.' }
            Start-Process -FilePath $app.exe -WorkingDirectory $app.directory -WindowStyle Normal | Out-Null
            '{"activated":true}'
        }
    }
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
