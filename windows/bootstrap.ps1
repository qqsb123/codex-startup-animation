# Use the current PowerShell's built-in modules before modules inherited from a different version.
# This changes only the launcher's process environment, not the user's system settings.
$moduleRoots = @(
    [IO.Path]::Combine($PSHOME,'Modules'),
    [IO.Path]::Combine($env:SystemRoot,'System32','WindowsPowerShell','v1.0','Modules'),
    [IO.Path]::Combine($env:ProgramFiles,'WindowsPowerShell','Modules')
)
$env:PSModulePath = ($moduleRoots | Select-Object -Unique) -join ';'
$securityModule = [IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Security','Microsoft.PowerShell.Security.psd1')
Import-Module -Name $securityModule -ErrorAction Stop
