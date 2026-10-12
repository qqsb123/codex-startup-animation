$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\bootstrap.ps1"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $projectRoot '.windows'
$logPath = Join-Path $stateDirectory 'desktop-launch.log'
try {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $launcher = Join-Path $PSScriptRoot 'launcher.ps1'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'The animation launcher files are missing.' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $start.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $launcher + '" -Mode integrated'
    $start.WorkingDirectory = $projectRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['PSModulePath'] = $env:PSModulePath
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $process.Start() | Out-Null
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $text = $output.Result + $errors.Result
    [IO.File]::WriteAllText($logPath,$text,(New-Object Text.UTF8Encoding($true)))
    $result = $process.ExitCode
    $process.Dispose()
    if ($result -ne 0) { throw $text.Trim() }
    exit 0
} catch {
    $message = $_.Exception.Message
    if (Test-Path -LiteralPath $stateDirectory) { [IO.File]::WriteAllText($logPath,$message,(New-Object Text.UTF8Encoding($true))) }
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show("动画启动未完成：`r`n`r`n$message`r`n`r`n可使用原入口备份打开 Codex。",'Codex 入场动画',0,48) | Out-Null
    exit 1
}
