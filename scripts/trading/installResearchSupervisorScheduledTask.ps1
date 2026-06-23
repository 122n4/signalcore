Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$paths = Get-ResearchPaths
$taskName = "Signalcore Research Supervisor"
$powershellPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$actionArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($paths.EnsureScriptPath)`""
$repeatingTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew
$fallbackSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $actionArguments

$schedule = "every 5 minutes and at Windows startup"

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($repeatingTrigger, $startupTrigger) `
    -Settings $settings `
    -Description "Keeps the Signalcore research supervisor running." `
    -Force | Out-Null
} catch {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $repeatingTrigger `
    -Settings $fallbackSettings `
    -Description "Keeps the Signalcore research supervisor running." `
    -Force | Out-Null
  $schedule = "every 5 minutes (startup/wake trigger requires elevated Windows permissions)"
}

Start-ScheduledTask -TaskName $taskName

[pscustomobject]@{
  task_name = $taskName
  schedule = $schedule
  action = "`"$powershellPath`" $actionArguments"
  repo_root = $paths.RepoRoot
} | ConvertTo-Json -Depth 5
