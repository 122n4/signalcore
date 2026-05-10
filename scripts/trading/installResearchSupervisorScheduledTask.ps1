Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$paths = Get-ResearchPaths
$taskName = "Signalcore Research Supervisor"
$powershellPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$actionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($paths.EnsureScriptPath)`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $actionArguments

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Keeps the Signalcore research supervisor running." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

[pscustomobject]@{
  task_name = $taskName
  schedule = "every 5 minutes"
  action = "`"$powershellPath`" $actionArguments"
  repo_root = $paths.RepoRoot
} | ConvertTo-Json -Depth 5
