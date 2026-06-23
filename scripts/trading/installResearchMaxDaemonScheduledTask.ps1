Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "researchSupervisor.Common.ps1")

$paths = Get-ResearchPaths
$taskName = "Signalcore Research Max Daemon"
$cmdPath = "$env:WINDIR\System32\cmd.exe"
$actionArguments = "/c npm run research:max-daemon:once"
$repeatingTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 6) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$fallbackSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$action = New-ScheduledTaskAction -Execute $cmdPath -Argument $actionArguments -WorkingDirectory $paths.RepoRoot

$schedule = "every 6 hours and at Windows startup"

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($repeatingTrigger, $startupTrigger) `
    -Settings $settings `
    -Description "Runs Syntrake research max maintenance: staged market data backfill, expansion study, and runtime health snapshots." `
    -Force | Out-Null
} catch {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $repeatingTrigger `
    -Settings $fallbackSettings `
    -Description "Runs Syntrake research max maintenance: staged market data backfill, expansion study, and runtime health snapshots." `
    -Force | Out-Null
  $schedule = "every 6 hours (startup/wake trigger requires elevated Windows permissions)"
}

Start-ScheduledTask -TaskName $taskName

[pscustomobject]@{
  task_name = $taskName
  schedule = $schedule
  action = "`"$cmdPath`" $actionArguments"
  repo_root = $paths.RepoRoot
} | ConvertTo-Json -Depth 5
